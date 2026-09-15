const ADMIN_HOST = "admin.loansbazaar.co.in";
const SESSION_TTL = 8 * 60 * 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAdminHost = url.hostname === ADMIN_HOST;

    if (url.pathname === "/api/submit" && request.method === "POST") return handleSubmit(request, env);
    if (url.pathname === "/api/admin/login" && request.method === "POST") return adminLogin(request, env, isAdminHost);
    if (url.pathname === "/api/admin/logout" && request.method === "POST") return adminLogout(isAdminHost);
    if (url.pathname === "/api/admin/enquiries" && request.method === "GET") return adminEnquiries(request, env, isAdminHost);

    if (isAdminHost && (url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/admin/")) {
      return env.ASSETS.fetch(new Request(new URL("/admin/index.html", request.url), request));
    }
    if (!isAdminHost && url.pathname.startsWith("/admin")) return new Response("Not Found", { status: 404 });

    return env.ASSETS.fetch(request);
  }
};

async function handleSubmit(request, env) {
  try {
    const data = await request.json();
    for (const key of ["name", "age", "mobile", "email", "type"]) if (!String(data[key] ?? "").trim()) return json({ok:false,error:`Missing ${key}`},400);
    const name=clean(data.name,120), age=Number(data.age), mobile=clean(data.mobile,30), email=clean(data.email,160), type=clean(data.type,30), service=clean(data.service||"General Enquiry",80), message=clean(data.message||"",2000);
    if(!name||!Number.isInteger(age)||age<18||age>100) return json({ok:false,error:"Please enter valid details."},400);
    if(!/^\+?[0-9\s-]{10,20}$/.test(mobile)) return json({ok:false,error:"Please enter a valid mobile number."},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ok:false,error:"Please enter a valid email address."},400);
    if(!["Customer","Partner"].includes(type)) return json({ok:false,error:"Invalid enquiry type."},400);
    if(!env.LOANSBAZAAR_DB) return json({ok:false,error:"Backend database is not configured."},500);
    const saved=await env.LOANSBAZAAR_DB.prepare(`INSERT INTO enquiries (type,service,name,age,mobile,email,message) VALUES (?,?,?,?,?,?,?)`).bind(type,service,name,age,mobile,email,message).run();
    if(!saved.success) return json({ok:false,error:"Could not save the enquiry."},500);
    let emailSent=false;
    if(env.RESEND_API_KEY&&env.NOTIFY_EMAIL&&env.FROM_EMAIL){
      try{const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.FROM_EMAIL,to:[env.NOTIFY_EMAIL],subject:`New LoansBazaar ${type} Enquiry - ${name}`,html:`<h2>New LoansBazaar Enquiry</h2><p><b>Type:</b> ${escapeHtml(type)}</p><p><b>Service:</b> ${escapeHtml(service)}</p><p><b>Name:</b> ${escapeHtml(name)}</p><p><b>Age:</b> ${age}</p><p><b>Mobile:</b> ${escapeHtml(mobile)}</p><p><b>Email:</b> ${escapeHtml(email)}</p><p><b>Message:</b> ${escapeHtml(message||"-")}</p>`})}); emailSent=mail.ok}catch(e){console.error(e)}
    }
    return json({ok:true,saved:true,emailSent});
  } catch(e){console.error(e);return json({ok:false,error:"Unexpected server error."},500)}
}

async function adminLogin(request,env,isAdminHost){
  if(!isAdminHost) return json({error:"Not Found"},404);
  try{const {username,password}=await request.json(); if(username!==String(env.ADMIN_USER||"")||password!==String(env.ADMIN_PASSWORD||"")) return json({error:"Invalid user ID or password."},401); const secret=env.ADMIN_SESSION_SECRET||env.ADMIN_PASSWORD; if(!secret) return json({error:"Admin session is not configured."},500); const exp=Math.floor(Date.now()/1000)+SESSION_TTL; const payload=b64(JSON.stringify({u:username,exp})); const sig=await sign(payload,secret); return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json","Set-Cookie":`LB_ADMIN=${payload}.${sig}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`}})}catch(e){return json({error:"Login failed."},500)}
}
async function adminLogout(isAdminHost){if(!isAdminHost)return json({error:"Not Found"},404);return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json","Set-Cookie":"LB_ADMIN=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"}})}
async function adminEnquiries(request,env,isAdminHost){
  if(!isAdminHost)return json({error:"Not Found"},404); if(!await authorized(request,env))return json({error:"Unauthorized"},401);
  try{const result=await env.LOANSBAZAAR_DB.prepare(`SELECT id,type,service,name,age,mobile,email,message,created_at FROM enquiries ORDER BY id DESC LIMIT 500`).all(); const stats=await env.LOANSBAZAAR_DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN type='Customer' THEN 1 ELSE 0 END) AS customers, SUM(CASE WHEN type='Partner' THEN 1 ELSE 0 END) AS partners, SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) AS today FROM enquiries`).first(); return json({ok:true,enquiries:result.results||[],stats:{total:Number(stats?.total||0),customers:Number(stats?.customers||0),partners:Number(stats?.partners||0),today:Number(stats?.today||0)}})}catch(e){console.error(e);return json({error:"Could not load enquiries."},500)}
}
async function authorized(request,env){const raw=getCookie(request,"LB_ADMIN");if(!raw)return false;const [payload,sig]=raw.split(".");if(!payload||!sig)return false;const secret=env.ADMIN_SESSION_SECRET||env.ADMIN_PASSWORD;if(!secret)return false;try{const expected=await sign(payload,secret);if(!timingSafeEqual(sig,expected))return false;const data=JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/")+"=="));return data.exp>Math.floor(Date.now()/1000)&&data.u===String(env.ADMIN_USER||"")}catch{return false}}
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64bytes(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))))}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
function getCookie(request,name){const h=request.headers.get("Cookie")||"";const part=h.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));return part?part.slice(name.length+1):null}
function b64(s){return b64bytes(new TextEncoder().encode(s))}
function b64bytes(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function clean(v,n){return String(v??"").trim().slice(0,n)}
function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}

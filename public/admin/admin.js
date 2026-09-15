const loginCard=document.querySelector('#loginCard'), dashboard=document.querySelector('#dashboard');
const loginForm=document.querySelector('#loginForm'), loginError=document.querySelector('#loginError');
const rows=document.querySelector('#rows'), statusEl=document.querySelector('#status');
const search=document.querySelector('#search'), typeFilter=document.querySelector('#typeFilter');
let records=[];

async function api(path, options={}){
  const res=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data={}; try{data=await res.json()}catch{}
  if(!res.ok) throw new Error(data.error||'Request failed');
  return data;
}

loginForm.addEventListener('submit',async e=>{
  e.preventDefault(); loginError.textContent='';
  try{
    await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:username.value,password:password.value})});
    loginCard.hidden=true; dashboard.hidden=false; await load();
  }catch(err){loginError.textContent=err.message}
});

document.querySelector('#logout').onclick=async()=>{await api('/api/admin/logout',{method:'POST'}).catch(()=>{}); location.reload()};
document.querySelector('#refresh').onclick=load;
search.oninput=render; typeFilter.onchange=render;
document.querySelector('#export').onclick=()=>{
  const filtered=getFiltered();
  const head=['ID','Date','Type','Service','Name','Age','Mobile','Email','Message'];
  const csv=[head,...filtered.map(r=>[r.id,r.created_at,r.type,r.service,r.name,r.age,r.mobile,r.email,r.message])].map(row=>row.map(csvCell).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='loansbazaar-enquiries.csv'; a.click(); URL.revokeObjectURL(a.href);
};
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
function getFiltered(){const q=search.value.trim().toLowerCase(); const t=typeFilter.value; return records.filter(r=>(!t||r.type===t)&&(!q||[r.name,r.mobile,r.email,r.service,r.message].some(v=>String(v||'').toLowerCase().includes(q))))}
function render(){const data=getFiltered(); rows.innerHTML=data.length?data.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.created_at)}</td><td>${esc(r.type)}</td><td>${esc(r.service)}</td><td>${esc(r.name)}</td><td>${esc(r.age)}</td><td>${esc(r.mobile)}</td><td>${esc(r.email)}</td><td>${esc(r.message||'')}</td></tr>`).join(''):'<tr><td colspan="9" class="empty">No enquiries found.</td></tr>'; statusEl.textContent=`Showing ${data.length} of ${records.length} enquiries`}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
async function load(){statusEl.textContent='Loading…'; try{const d=await api('/api/admin/enquiries'); records=d.enquiries||[]; document.querySelector('#total').textContent=d.stats.total; document.querySelector('#customers').textContent=d.stats.customers; document.querySelector('#partners').textContent=d.stats.partners; document.querySelector('#today').textContent=d.stats.today; render()}catch(err){if(err.message==='Unauthorized'){loginCard.hidden=false;dashboard.hidden=true} statusEl.textContent=err.message}}
(async()=>{try{const d=await api('/api/admin/enquiries'); records=d.enquiries||[]; loginCard.hidden=true; dashboard.hidden=false; document.querySelector('#total').textContent=d.stats.total; document.querySelector('#customers').textContent=d.stats.customers; document.querySelector('#partners').textContent=d.stats.partners; document.querySelector('#today').textContent=d.stats.today; render()}catch{}})();

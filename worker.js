const ADMIN_COOKIE = "lb_admin_session";
const SESSION_TTL = 60 * 60 * 8; // 8 hours

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAdminHost = url.hostname.startsWith("admin.");

    // Admin UI is intentionally only exposed on admin.loansbazaar.co.in.
    if ((url.pathname === "/" || url.pathname === "/admin") && isAdminHost) {
      return Response.redirect(new URL("/admin/", request.url), 302);
    }
    if (url.pathname.startsWith("/admin/") && !isAdminHost) {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env);
    }

    if (isAdminHost && url.pathname === "/api/admin/login" && request.method === "POST") {
      return handleAdminLogin(request, env);
    }
    if (isAdminHost && url.pathname === "/api/admin/logout" && request.method === "POST") {
      return handleAdminLogout();
    }
    if (isAdminHost && url.pathname === "/api/admin/me" && request.method === "GET") {
      return handleAdminMe(request, env);
    }
    if (isAdminHost && url.pathname === "/api/admin/enquiries" && request.method === "GET") {
      return handleAdminEnquiries(request, env);
    }
    if (isAdminHost && url.pathname === "/api/admin/enquiries/status" && request.method === "POST") {
      return handleAdminStatus(request, env);
    }
    if (isAdminHost && url.pathname === "/api/admin/enquiries/delete" && request.method === "POST") {
      return handleAdminDelete(request, env);
    }
    if (isAdminHost && url.pathname === "/api/admin/enquiries/export" && request.method === "GET") {
      return handleAdminExport(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleSubmit(request, env) {
  try {
    const data = await request.json();
    const required = ["name", "age", "mobile", "email", "type"];
    for (const key of required) {
      if (!String(data[key] ?? "").trim()) return json({ ok: false, error: `Missing ${key}` }, 400);
    }

    const name = clean(data.name, 120);
    const age = Number(data.age);
    const mobile = clean(data.mobile, 30);
    const email = clean(data.email, 160);
    const type = clean(data.type, 30);
    const service = clean(data.service || "General Enquiry", 80);
    const message = clean(data.message || "", 2000);

    if (!name || !Number.isInteger(age) || age < 18 || age > 100) return json({ ok: false, error: "Please enter valid details." }, 400);
    if (!/^\+?[0-9\s-]{10,20}$/.test(mobile)) return json({ ok: false, error: "Please enter a valid mobile number." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Please enter a valid email address." }, 400);
    if (!["Customer", "Partner"].includes(type)) return json({ ok: false, error: "Invalid enquiry type." }, 400);

    const db = env.LOANSBAZAAR_DB;
    if (!db) return json({ ok: false, error: "Backend database is not configured." }, 500);

    const saved = await db.prepare(`
      INSERT INTO enquiries (type, service, name, age, mobile, email, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(type, service, name, age, mobile, email, message).run();

    if (!saved.success) return json({ ok: false, error: "Could not save the enquiry." }, 500);

    const { RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL } = env;
    let emailSent = false;
    if (RESEND_API_KEY && NOTIFY_EMAIL && FROM_EMAIL) {
      const subject = type === "Partner" ? `New LoansBazaar Partner Enquiry - ${name}` : `New LoansBazaar Customer Enquiry - ${service}`;
      const html = `<h2>New LoansBazaar Enquiry</h2><table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse"><tr><td><b>Type</b></td><td>${escapeHtml(type)}</td></tr><tr><td><b>Service</b></td><td>${escapeHtml(service)}</td></tr><tr><td><b>Name</b></td><td>${escapeHtml(name)}</td></tr><tr><td><b>Age</b></td><td>${escapeHtml(age)}</td></tr><tr><td><b>Mobile</b></td><td>${escapeHtml(mobile)}</td></tr><tr><td><b>Email</b></td><td>${escapeHtml(email)}</td></tr><tr><td><b>Message</b></td><td>${escapeHtml(message || "-")}</td></tr></table>`;
      try {
        const mail = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [NOTIFY_EMAIL], subject, html })
        });
        emailSent = mail.ok;
        if (!mail.ok) console.error("Resend error:", await mail.text());
      } catch (mailError) { console.error("Email notification failed:", mailError); }
    }

    return json({ ok: true, saved: true, emailSent });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}

async function handleAdminLogin(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ ok: false, error: "Admin authentication is not configured." }, 500);
  }
  try {
    const data = await request.json();
    const user = String(data.username || "").trim();
    const pass = String(data.password || "");
    const userOk = await safeEqual(user, env.ADMIN_USER);
    const passOk = await safeEqual(pass, env.ADMIN_PASSWORD);
    if (!userOk || !passOk) return json({ ok: false, error: "Invalid user ID or password." }, 401);

    const token = await createSession(env.ADMIN_USER, env.ADMIN_SESSION_SECRET);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": `${ADMIN_COOKIE}=${token}; Max-Age=${SESSION_TTL}; Path=/; HttpOnly; Secure; SameSite=Strict`
      }
    });
  } catch {
    return json({ ok: false, error: "Invalid login request." }, 400);
  }
}

function handleAdminLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": `${ADMIN_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
    }
  });
}

async function handleAdminMe(request, env) {
  const session = await verifySession(request, env);
  return json({ ok: !!session, user: session?.user || null }, session ? 200 : 401);
}

async function handleAdminEnquiries(request, env) {
  if (!(await verifySession(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
  const db = env.LOANSBAZAAR_DB;
  await ensureMetaTables(db);
  const url = new URL(request.url);
  const search = clean(url.searchParams.get("search") || "", 100);
  const type = clean(url.searchParams.get("type") || "", 30);
  const status = clean(url.searchParams.get("status") || "", 30);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 500), 1), 1000);

  let sql = `SELECT e.id,e.type,e.service,e.name,e.age,e.mobile,e.email,e.message,e.created_at,COALESCE(m.status,'New') AS status,COALESCE(m.notes,'') AS notes FROM enquiries e LEFT JOIN enquiry_admin_meta m ON m.enquiry_id=e.id WHERE 1=1`;
  const params = [];
  if (search) { sql += ` AND (LOWER(e.name) LIKE LOWER(?) OR e.mobile LIKE ? OR LOWER(e.email) LIKE LOWER(?) OR LOWER(e.service) LIKE LOWER(?))`; const s = `%${search}%`; params.push(s,s,s,s); }
  if (["Customer","Partner"].includes(type)) { sql += ` AND e.type = ?`; params.push(type); }
  if (["New","Contacted","In Progress","Closed"].includes(status)) { sql += ` AND COALESCE(m.status,'New') = ?`; params.push(status); }
  sql += ` ORDER BY e.id DESC LIMIT ?`;
  params.push(limit);

  const result = await db.prepare(sql).bind(...params).all();
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM enquiries`).first();
  const customers = await db.prepare(`SELECT COUNT(*) AS total FROM enquiries WHERE type='Customer'`).first();
  const partners = await db.prepare(`SELECT COUNT(*) AS total FROM enquiries WHERE type='Partner'`).first();
  const today = await db.prepare(`SELECT COUNT(*) AS total FROM enquiries WHERE date(created_at)=date('now')`).first();
  return json({ ok: true, enquiries: result.results || [], stats: { total: count?.total || 0, customers: customers?.total || 0, partners: partners?.total || 0, today: today?.total || 0 } });
}

async function handleAdminStatus(request, env) {
  if (!(await verifySession(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
  const db = env.LOANSBAZAAR_DB;
  await ensureMetaTables(db);
  const data = await request.json();
  const id = Number(data.id);
  const status = clean(data.status || "New", 30);
  const notes = clean(data.notes || "", 2000);
  if (!Number.isInteger(id) || id < 1 || !["New","Contacted","In Progress","Closed"].includes(status)) return json({ ok:false, error:"Invalid update." },400);
  await db.prepare(`INSERT INTO enquiry_admin_meta (enquiry_id,status,notes,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(enquiry_id) DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_at=datetime('now')`).bind(id,status,notes).run();
  return json({ ok:true });
}

async function handleAdminDelete(request, env) {
  if (!(await verifySession(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
  const db = env.LOANSBAZAAR_DB;
  await ensureMetaTables(db);
  const data = await request.json();
  const id = Number(data.id);
  if (!Number.isInteger(id) || id < 1) return json({ ok:false, error:"Invalid enquiry ID." },400);
  await db.batch([
    db.prepare(`DELETE FROM enquiry_admin_meta WHERE enquiry_id=?`).bind(id),
    db.prepare(`DELETE FROM enquiries WHERE id=?`).bind(id)
  ]);
  return json({ ok:true });
}

async function handleAdminExport(request, env) {
  if (!(await verifySession(request, env))) return new Response("Unauthorized", { status: 401 });
  const db = env.LOANSBAZAAR_DB;
  await ensureMetaTables(db);
  const result = await db.prepare(`SELECT e.id,e.type,e.service,e.name,e.age,e.mobile,e.email,e.message,e.created_at,COALESCE(m.status,'New') AS status,COALESCE(m.notes,'') AS notes FROM enquiries e LEFT JOIN enquiry_admin_meta m ON m.enquiry_id=e.id ORDER BY e.id DESC`).all();
  const headers = ["ID","Type","Service","Name","Age","Mobile","Email","Message","Status","Notes","Created At"];
  const rows = [headers, ...(result.results || []).map(r => [r.id,r.type,r.service,r.name,r.age,r.mobile,r.email,r.message,r.status,r.notes,r.created_at])];
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  return new Response("\uFEFF" + csv, { headers: { "Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=loansbazaar-enquiries.csv", "Cache-Control":"no-store" } });
}

async function ensureMetaTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS enquiry_admin_meta (enquiry_id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'New', notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE)`).run();
}

async function verifySession(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(ADMIN_COOKIE + "="))?.slice(ADMIN_COOKIE.length + 1);
  if (!token) return null;
  return verifyToken(token, env.ADMIN_SESSION_SECRET);
}

async function createSession(user, secret) {
  const exp = Math.floor(Date.now()/1000) + SESSION_TTL;
  const nonce = crypto.randomUUID();
  const payload = `${user}|${exp}|${nonce}`;
  const sig = await hmac(payload, secret);
  return `${b64url(payload)}.${sig}`;
}

async function verifyToken(token, secret) {
  const [payload64, sig] = token.split(".");
  if (!payload64 || !sig) return null;
  try {
    const payload = atob(payload64.replace(/-/g,"+").replace(/_/g,"/") + "===");
    const expected = await hmac(payload, secret);
    if (!(await safeEqual(sig, expected))) return null;
    const [user, exp] = payload.split("|");
    if (!user || Number(exp) < Math.floor(Date.now()/1000)) return null;
    return { user, exp: Number(exp) };
  } catch { return null; }
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return b64url(bytes);
}

async function safeEqual(a,b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i=0;i<x.length;i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function b64url(input) {
  const str = input instanceof Uint8Array ? String.fromCharCode(...input) : input;
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function csvCell(value) {
  const s = String(value ?? "");
  return `"${s.replaceAll('"','""')}"`;
}

function clean(value, maxLength) { return String(value ?? "").trim().slice(0, maxLength); }
function escapeHtml(value) { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function json(body, status=200) { return new Response(JSON.stringify(body), { status, headers:{"Content-Type":"application/json","Cache-Control":"no-store"} }); }

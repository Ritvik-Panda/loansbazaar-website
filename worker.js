const ADMIN_HOST = "admin.loansbazaar.co.in";
const SESSION_TTL = 8 * 60 * 60;
const EMPLOYEE_HOST = "loansbazaar.co.in";
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_REQUESTS_PER_HOUR = 5;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAdminHost = url.hostname === ADMIN_HOST;
    const isEmployeeHost =
      url.hostname === EMPLOYEE_HOST ||
      url.hostname === `www.${EMPLOYEE_HOST}`;

    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env);
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      return adminLogin(request, env, isAdminHost);
    }

    if (url.pathname === "/api/admin/logout" && request.method === "POST") {
      return adminLogout(isAdminHost);
    }

    if (url.pathname === "/api/admin/enquiries" && request.method === "GET") {
      return adminEnquiries(request, env, isAdminHost);
    }

    if (url.pathname === "/api/admin/partners" && request.method === "GET") {
      return adminPartners(request, env, isAdminHost);
    }

    if (
      url.pathname === "/api/admin/partners/status" &&
      request.method === "POST"
    ) {
      return adminUpdatePartnerStatus(request, env, isAdminHost);
    }

    if (
      url.pathname === "/api/employee/register/request-otp" &&
      request.method === "POST"
    ) {
      return requestEmployeeOtp(request, env, isEmployeeHost);
    }

    if (
      url.pathname === "/api/employee/register/verify-otp" &&
      request.method === "POST"
    ) {
      return verifyEmployeeOtp(request, env, isEmployeeHost);
    }

    if (
      url.pathname === "/api/employee/login/request-otp" &&
      request.method === "POST"
    ) {
      return requestEmployeeLoginOtp(request, env, isEmployeeHost);
    }

    if (
      url.pathname === "/api/employee/login/verify-otp" &&
      request.method === "POST"
    ) {
      return verifyEmployeeLoginOtp(request, env, isEmployeeHost);
    }

    if (url.pathname === "/api/employee/session" && request.method === "GET") {
      if (!isEmployeeHost) return json({ error: "Not Found" }, 404);

      const session = await getEmployeeSession(request, env);
      if (!session.ok) {
        return json({ ok: false, error: session.error }, session.status);
      }

      return json({
        ok: true,
        employee: {
          id: session.partner.id,
          partnerCode: session.partner.partner_code,
          name: session.partner.name,
          email: session.partner.email,
          status: session.partner.status
        }
      });
    }

    if (url.pathname === "/api/employee/logout" && request.method === "POST") {
      if (!isEmployeeHost) return json({ error: "Not Found" }, 404);

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie":
            "LB_EMPLOYEE=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
        }
      });
    }

    if (
      isAdminHost &&
      ["/", "/admin", "/admin/", "/admin/index.html"].includes(url.pathname)
    ) {
      return env.ASSETS.fetch(
        new Request(new URL("/admin.html", request.url), request)
      );
    }

    if (!isAdminHost && url.pathname.startsWith("/admin")) {
      return new Response("Not Found", { status: 404 });
    }

    if (!isAdminHost && (url.pathname === "/" || url.pathname === "")) {
      return env.ASSETS.fetch(
        new Request(new URL("/index.html", request.url), request)
      );
    }

    // Protect employee dashboard pages before static assets are served.
    // Registration remains public so new users can register or see their status.
    if (
      isEmployeeHost &&
      url.pathname.startsWith("/dashboard") &&
      url.pathname !== "/dashboard/register.html" &&
      url.pathname !== "/dashboard/login.html"
    ) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { "Cache-Control": "no-store", "Allow": "GET, HEAD" }
        });
      }

      const session = await getEmployeeSession(request, env);

      if (!session.ok) {
        if (session.status === 500) {
          return new Response("Employee session service is temporarily unavailable.", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
          });
        }

        const destination = session.status === 403
          ? "/dashboard/register.html?status=pending"
          : "/dashboard/login.html";

        return Response.redirect(new URL(destination, request.url).toString(), 302);
      }

      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return env.ASSETS.fetch(request);
  }
};


// ============================================================
// EXISTING ENQUIRY FORM AND EMAIL NOTIFICATIONS
// ============================================================

async function handleSubmit(request, env) {
  try {
    const data = await request.json();

    for (const key of ["name", "age", "mobile", "email", "type"]) {
      if (!String(data[key] ?? "").trim()) {
        return json({ ok: false, error: `Missing ${key}` }, 400);
      }
    }

    const name = clean(data.name, 120);
    const age = Number(data.age);
    const mobile = clean(data.mobile, 30);
    const email = clean(data.email, 160).toLowerCase();
    const type = clean(data.type, 30);
    const service = clean(data.service || "General Enquiry", 80);
    const message = clean(data.message || "", 2000);

    if (!name || !Number.isInteger(age) || age < 18 || age > 100) {
      return json({ ok: false, error: "Please enter valid details." }, 400);
    }

    if (!/^\+?[0-9\s-]{10,20}$/.test(mobile)) {
      return json({ ok: false, error: "Please enter a valid mobile number." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "Please enter a valid email address." }, 400);
    }

    if (!["Customer", "Partner"].includes(type)) {
      return json({ ok: false, error: "Invalid enquiry type." }, 400);
    }

    if (!env.LOANSBAZAAR_DB) {
      return json({ ok: false, error: "Backend database is not configured." }, 500);
    }

    const saved = await env.LOANSBAZAAR_DB.prepare(
      `INSERT INTO enquiries
       (type, service, name, age, mobile, email, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(type, service, name, age, mobile, email, message).run();

    if (!saved.success) {
      return json({ ok: false, error: "Could not save the enquiry." }, 500);
    }

    let emailSent = false;

    if (env.RESEND_API_KEY && env.NOTIFY_EMAIL && env.FROM_EMAIL) {
      try {
        const mail = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: env.FROM_EMAIL,
            to: [env.NOTIFY_EMAIL],
            subject: `New LoansBazaar ${type} Enquiry - ${name}`,
            html: `
              <h2>New LoansBazaar Enquiry</h2>
              <p><b>Type:</b> ${escapeHtml(type)}</p>
              <p><b>Service:</b> ${escapeHtml(service)}</p>
              <p><b>Name:</b> ${escapeHtml(name)}</p>
              <p><b>Age:</b> ${age}</p>
              <p><b>Mobile:</b> ${escapeHtml(mobile)}</p>
              <p><b>Email:</b> ${escapeHtml(email)}</p>
              <p><b>Message:</b> ${escapeHtml(message || "-")}</p>
            `
          })
        });

        emailSent = mail.ok;
      } catch (e) {
        console.error("Enquiry notification failed:", e);
      }
    }

    return json({ ok: true, saved: true, emailSent });
  } catch (e) {
    console.error("Enquiry submission failed:", e);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}


// ============================================================
// ADMIN LOGIN
// ============================================================

async function adminLogin(request, env, isAdminHost) {
  if (!isAdminHost) return json({ error: "Not Found" }, 404);

  try {
    const { username, password } = await request.json();

    if (
      username !== String(env.ADMIN_USER || "") ||
      password !== String(env.ADMIN_PASSWORD || "")
    ) {
      return json({ error: "Invalid user ID or password." }, 401);
    }

    const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;

    if (!secret) {
      return json({ error: "Admin session is not configured." }, 500);
    }

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
    const payload = b64(JSON.stringify({ u: username, exp }));
    const sig = await sign(payload, secret);

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie":
          `LB_ADMIN=${payload}.${sig}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`
      }
    });
  } catch {
    return json({ error: "Login failed." }, 500);
  }
}

async function adminLogout(isAdminHost) {
  if (!isAdminHost) return json({ error: "Not Found" }, 404);

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie":
        "LB_ADMIN=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
    }
  });
}

async function adminEnquiries(request, env, isAdminHost) {
  if (!isAdminHost) return json({ error: "Not Found" }, 404);

  if (!(await authorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, type, service, name, age, mobile, email, message, created_at
       FROM enquiries ORDER BY id DESC LIMIT 500`
    ).all();

    const stats = await env.LOANSBAZAAR_DB.prepare(
      `SELECT COUNT(*) AS total,
       SUM(CASE WHEN type='Customer' THEN 1 ELSE 0 END) AS customers,
       SUM(CASE WHEN type='Partner' THEN 1 ELSE 0 END) AS partners,
       SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) AS today
       FROM enquiries`
    ).first();

    return json({
      ok: true,
      enquiries: result.results || [],
      stats: {
        total: Number(stats?.total || 0),
        customers: Number(stats?.customers || 0),
        partners: Number(stats?.partners || 0),
        today: Number(stats?.today || 0)
      }
    });
  } catch (e) {
    console.error("Admin enquiries failed:", e);
    return json({ error: "Could not load enquiries." }, 500);
  }
}

// ============================================================
// ADMIN PARTNER MANAGEMENT
// ============================================================

async function adminPartners(request, env, isAdminHost) {
  if (!isAdminHost) return json({ error: "Not Found" }, 404);

  if (!(await authorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!env.LOANSBAZAAR_DB) {
    return json({ error: "Backend database is not configured." }, 500);
  }

  try {
    const result = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, partner_code, name, age, mobile, email, status, created_at
       FROM partners
       ORDER BY id DESC
       LIMIT 1000`
    ).all();

    const stats = await env.LOANSBAZAAR_DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
       FROM partners`
    ).first();

    return json({
      ok: true,
      partners: result.results || [],
      stats: {
        total: Number(stats?.total || 0),
        active: Number(stats?.active || 0),
        pending: Number(stats?.pending || 0),
        inactive: Number(stats?.inactive || 0)
      }
    });
  } catch (e) {
    console.error("Admin partners failed:", e);
    return json({ error: "Could not load partners." }, 500);
  }
}

async function adminUpdatePartnerStatus(request, env, isAdminHost) {
  if (!isAdminHost) return json({ error: "Not Found" }, 404);

  if (!(await authorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!env.LOANSBAZAAR_DB) {
    return json({ error: "Backend database is not configured." }, 500);
  }

  try {
    const data = await request.json();
    const partnerId = Number(data.id);
    const status = clean(data.status, 20).toLowerCase();

    if (!Number.isInteger(partnerId) || partnerId < 1) {
      return json({ error: "A valid partner ID is required." }, 400);
    }

    if (!["active", "pending", "inactive"].includes(status)) {
      return json({
        error: "Status must be active, pending, or inactive."
      }, 400);
    }

    const existing = await env.LOANSBAZAAR_DB.prepare(
      "SELECT id FROM partners WHERE id = ? LIMIT 1"
    ).bind(partnerId).first();

    if (!existing) {
      return json({ error: "Partner not found." }, 404);
    }

    const updated = await env.LOANSBAZAAR_DB.prepare(
      "UPDATE partners SET status = ? WHERE id = ?"
    ).bind(status, partnerId).run();

    if (!updated.success) {
      return json({ error: "Could not update partner status." }, 500);
    }

    return json({
      ok: true,
      message: "Partner status updated successfully.",
      id: partnerId,
      status
    });
  } catch (e) {
    console.error("Admin partner status update failed:", e);
    return json({ error: "Could not update partner status." }, 500);
  }
}


async function authorized(request, env) {
  const raw = getCookie(request, "LB_ADMIN");
  if (!raw) return false;

  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return false;

  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return false;

  try {
    const expected = await sign(payload, secret);
    if (!timingSafeEqual(sig, expected)) return false;

    const data = JSON.parse(decodeB64(payload));
    return data.exp > Math.floor(Date.now() / 1000) &&
      data.u === String(env.ADMIN_USER || "");
  } catch {
    return false;
  }
}


// ============================================================
// EMPLOYEE / PARTNER REGISTRATION — REQUEST OTP
// ============================================================

async function requestEmployeeOtp(request, env, isEmployeeHost) {
  if (!isEmployeeHost) return json({ error: "Not Found" }, 404);

  const missingConfig = {
    database: !env.LOANSBAZAAR_DB,
    resendApiKey: !env.RESEND_API_KEY,
    fromEmail: !env.FROM_EMAIL,
    employeeSessionSecret: !env.EMPLOYEE_SESSION_SECRET
  };

 if (Object.values(missingConfig).some(Boolean)) {
  console.error("Employee registration configuration check failed:", missingConfig);
  return json({
    error: "Registration service is not fully configured.",
    diagnostic: missingConfig
  }, 500);
}

  try {
    const data = await request.json();
    const name = clean(data.name, 120);
    const age = Number(data.age);
    const mobile = clean(data.mobile, 30);
    const email = clean(data.email, 160).toLowerCase();

    if (!name || !Number.isInteger(age) || age < 18 || age > 100) {
      return json({ error: "Enter a valid name and age (18 or older)." }, 400);
    }

    if (!/^\+?[0-9\s-]{10,20}$/.test(mobile)) {
      return json({ error: "Enter a valid mobile number." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const existing = await env.LOANSBAZAAR_DB.prepare(
      "SELECT id FROM partners WHERE lower(email)=? LIMIT 1"
    ).bind(email).first();

    if (existing) {
      return json({
        error: "An account already exists for this email. Please use the account login flow."
      }, 409);
    }

    const rate = await env.LOANSBAZAAR_DB.prepare(
      `SELECT COUNT(*) AS total
       FROM partner_otps
       WHERE lower(email)=?
         AND created_at >= datetime('now','-1 hour')`
    ).bind(email).first();

    if (Number(rate?.total || 0) >= OTP_MAX_REQUESTS_PER_HOUR) {
      return json({
        error: "Too many OTP requests. Please try again later."
      }, 429);
    }

    const latest = await env.LOANSBAZAAR_DB.prepare(
      `SELECT created_at FROM partner_otps
       WHERE lower(email)=?
       ORDER BY id DESC LIMIT 1`
    ).bind(email).first();

    if (latest?.created_at) {
      const recent = await env.LOANSBAZAAR_DB.prepare(
        `SELECT CASE WHEN datetime(?) > datetime('now','-60 seconds')
         THEN 1 ELSE 0 END AS waiting`
      ).bind(latest.created_at).first();

      if (Number(recent?.waiting || 0) === 1) {
        return json({
          error: "Please wait 60 seconds before requesting another OTP."
        }, 429);
      }
    }

    const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000)
      .padStart(6, "0");

    const otpHash = await sign(`${email}:${otp}`, env.EMPLOYEE_SESSION_SECRET);

    await env.LOANSBAZAAR_DB.prepare(
      `INSERT INTO partner_otps
       (email, otp_hash, expires_at, attempts)
       VALUES (?, ?, datetime('now','+10 minutes'), 0)`
    ).bind(email, otpHash).run();

    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [email],
        subject: "Your LoansBazaar Partner Verification Code",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
            <h2>LoansBazaar Partner Registration</h2>
            <p>Hello ${escapeHtml(name)},</p>
            <p>Your email verification code is:</p>
            <p style="font-size:30px;font-weight:bold;letter-spacing:8px">${otp}</p>
            <p>This code expires in 10 minutes. Do not share it with anyone.</p>
            <p>If you did not request this code, you can ignore this email.</p>
          </div>
        `
      })
    });

    if (!mail.ok) {
      console.error("Resend OTP request failed:", await mail.text());
      return json({
        error: "Could not send the verification email. Please try again later."
      }, 502);
    }

    return json({
      ok: true,
      message: "Verification code sent. Check your email."
    });
  } catch (e) {
    // Diagnostic detail is recorded in Cloudflare logs; never return it to clients.
    console.error(
  "EMPLOYEE_OTP_DIAGNOSTIC",
  String(e?.name || "Error"),
  String(e?.message || e || "Unknown error")
);
    return json({ error: "Could not start registration." }, 500);
  }
}


// ============================================================
// EMPLOYEE / PARTNER REGISTRATION — VERIFY OTP
// ============================================================

async function verifyEmployeeOtp(request, env, isEmployeeHost) {
  if (!isEmployeeHost) return json({ error: "Not Found" }, 404);

  if (!env.LOANSBAZAAR_DB || !env.EMPLOYEE_SESSION_SECRET) {
    return json({ error: "Registration service is not configured." }, 500);
  }

  try {
    const data = await request.json();
    const email = clean(data.email, 160).toLowerCase();
    const otp = clean(data.otp, 6);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^\d{6}$/.test(otp)) {
      return json({ error: "Enter your email and the six-digit OTP." }, 400);
    }

    const record = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, otp_hash, expires_at, attempts, verified_at
       FROM partner_otps
       WHERE lower(email)=?
       ORDER BY id DESC LIMIT 1`
    ).bind(email).first();

    if (!record || record.verified_at) {
      return json({
        error: "No active verification code found. Request a new OTP."
      }, 400);
    }

    if (Number(record.attempts) >= OTP_MAX_ATTEMPTS) {
      return json({
        error: "Too many incorrect attempts. Request a new OTP."
      }, 429);
    }

    const expiry = await env.LOANSBAZAAR_DB.prepare(
      `SELECT CASE WHEN datetime(?) > datetime('now')
       THEN 1 ELSE 0 END AS valid`
    ).bind(record.expires_at).first();

    if (Number(expiry?.valid || 0) !== 1) {
      return json({
        error: "Your OTP has expired. Please request a new one."
      }, 400);
    }

    const submittedHash = await sign(
      `${email}:${otp}`,
      env.EMPLOYEE_SESSION_SECRET
    );

    if (!timingSafeEqual(submittedHash, record.otp_hash)) {
      await env.LOANSBAZAAR_DB.prepare(
        "UPDATE partner_otps SET attempts=attempts+1 WHERE id=?"
      ).bind(record.id).run();

      return json({ error: "Incorrect OTP." }, 400);
    }

    const name = clean(data.name, 120);
    const age = Number(data.age);
    const mobile = clean(data.mobile, 30);

    if (!name || !Number.isInteger(age) || age < 18 || age > 100 ||
        !/^\+?[0-9\s-]{10,20}$/.test(mobile)) {
      return json({
        error: "Please submit your name, age and mobile number again with the OTP."
      }, 400);
    }

    const alreadyExists = await env.LOANSBAZAAR_DB.prepare(
      "SELECT id FROM partners WHERE lower(email)=? LIMIT 1"
    ).bind(email).first();

    if (alreadyExists) {
      return json({ error: "An account already exists for this email." }, 409);
    }

    const partnerCode = await createPartnerCode(env);

    // Automatically activate the partner after successful email OTP verification.
    const created = await env.LOANSBAZAAR_DB.prepare(
      `INSERT INTO partners
       (partner_code, name, age, mobile, email, status)
       VALUES (?, ?, ?, ?, ?, 'active')`
    ).bind(partnerCode, name, age, mobile, email).run();

    if (!created.success) {
      return json({ error: "Could not create the partner account." }, 500);
    }

    await env.LOANSBAZAAR_DB.prepare(
      "UPDATE partner_otps SET verified_at=datetime('now') WHERE id=?"
    ).bind(record.id).run();

    const partner = await env.LOANSBAZAAR_DB.prepare(
      "SELECT id, partner_code, name, email, status FROM partners WHERE id=?"
    ).bind(created.meta.last_row_id).first();

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
    const payload = b64(JSON.stringify({
      partnerId: partner.id,
      email: partner.email,
      exp
    }));
    const sig = await sign(payload, env.EMPLOYEE_SESSION_SECRET);

    return new Response(JSON.stringify({
      ok: true,
      message: "Email verified and partner account created.",
      partner: {
        id: partner.id,
        partnerCode: partner.partner_code,
        name: partner.name,
        email: partner.email,
        status: partner.status
      }
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie":
          `LB_EMPLOYEE=${payload}.${sig}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Lax`
      }
    });
  } catch (e) {
    console.error("Employee OTP verification failed:", {
      name: e?.name,
      message: e?.message,
      stack: e?.stack
    });
    return json({ error: "Could not verify the code." }, 500);
  }
}


// ============================================================
// EMPLOYEE LOGIN — REQUEST OTP
// ============================================================

async function requestEmployeeLoginOtp(request, env, isEmployeeHost) {
  if (!isEmployeeHost) return json({ error: "Not Found" }, 404);

  if (!env.LOANSBAZAAR_DB || !env.EMPLOYEE_SESSION_SECRET ||
      !env.RESEND_API_KEY || !env.FROM_EMAIL) {
    return json({ error: "Login service is not configured." }, 500);
  }

  try {
    const data = await request.json();
    const email = clean(data.email, 160).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const partner = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id FROM partners
       WHERE lower(email) = ? AND status = 'active'
       LIMIT 1`
    ).bind(email).first();

    if (!partner) {
      return json({
        error: "No active employee account was found for this email."
      }, 404);
    }

    const rate = await env.LOANSBAZAAR_DB.prepare(
      `SELECT COUNT(*) AS total
       FROM employee_login_otps
       WHERE lower(email) = ?
       AND created_at >= datetime('now', '-1 hour')`
    ).bind(email).first();

    if (Number(rate?.total || 0) >= OTP_MAX_REQUESTS_PER_HOUR) {
      return json({
        error: "Too many OTP requests. Please try again later."
      }, 429);
    }

    const latest = await env.LOANSBAZAAR_DB.prepare(
      `SELECT created_at FROM employee_login_otps
       WHERE lower(email) = ?
       ORDER BY id DESC LIMIT 1`
    ).bind(email).first();

    if (latest?.created_at) {
      const recent = await env.LOANSBAZAAR_DB.prepare(
        `SELECT CASE WHEN datetime(?) > datetime('now', '-60 seconds')
         THEN 1 ELSE 0 END AS waiting`
      ).bind(latest.created_at).first();

      if (Number(recent?.waiting || 0) === 1) {
        return json({
          error: "Please wait 60 seconds before requesting another OTP."
        }, 429);
      }
    }

    const otp = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
    ).padStart(6, "0");

    const otpHash = await sign(
      `${email}:${otp}`,
      env.EMPLOYEE_SESSION_SECRET
    );

    await env.LOANSBAZAAR_DB.prepare(
      `INSERT INTO employee_login_otps
       (email, otp_hash, expires_at, attempts)
       VALUES (?, ?, datetime('now', '+10 minutes'), 0)`
    ).bind(email, otpHash).run();

    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [email],
        subject: "Your LoansBazaar Login Code",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
            <h2>LoansBazaar Employee Login</h2>
            <p>Your login verification code is:</p>
            <p style="font-size:30px;font-weight:bold;letter-spacing:8px">${otp}</p>
            <p>This code expires in 10 minutes. Do not share it.</p>
          </div>
        `
      })
    });

    if (!mail.ok) {
      console.error("Login OTP email failed:", await mail.text());
      return json({
        error: "Could not send the login email. Please try again later."
      }, 502);
    }

    return json({
      ok: true,
      message: "Login OTP sent. Please check your email."
    });
  } catch (e) {
    console.error("Employee login OTP request failed:", e);
    return json({ error: "Could not start login." }, 500);
  }
}


// ============================================================
// EMPLOYEE LOGIN — VERIFY OTP
// ============================================================

async function verifyEmployeeLoginOtp(request, env, isEmployeeHost) {
  if (!isEmployeeHost) return json({ error: "Not Found" }, 404);

  if (!env.LOANSBAZAAR_DB || !env.EMPLOYEE_SESSION_SECRET) {
    return json({ error: "Login service is not configured." }, 500);
  }

  try {
    const data = await request.json();
    const email = clean(data.email, 160).toLowerCase();
    const otp = clean(data.otp, 6);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
      return json({
        error: "Enter your registered email and six-digit OTP."
      }, 400);
    }

    const record = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, otp_hash, expires_at, attempts, verified_at
       FROM employee_login_otps
       WHERE lower(email) = ?
       ORDER BY id DESC LIMIT 1`
    ).bind(email).first();

    if (!record || record.verified_at) {
      return json({
        error: "No active login code found. Please request a new OTP."
      }, 400);
    }

    if (Number(record.attempts) >= OTP_MAX_ATTEMPTS) {
      return json({
        error: "Too many incorrect attempts. Request a new OTP."
      }, 429);
    }

    const expiry = await env.LOANSBAZAAR_DB.prepare(
      `SELECT CASE WHEN datetime(?) > datetime('now')
       THEN 1 ELSE 0 END AS valid`
    ).bind(record.expires_at).first();

    if (Number(expiry?.valid || 0) !== 1) {
      return json({
        error: "Your OTP has expired. Please request a new one."
      }, 400);
    }

    const submittedHash = await sign(
      `${email}:${otp}`,
      env.EMPLOYEE_SESSION_SECRET
    );

    if (!timingSafeEqual(submittedHash, record.otp_hash)) {
      await env.LOANSBAZAAR_DB.prepare(
        `UPDATE employee_login_otps
         SET attempts = attempts + 1 WHERE id = ?`
      ).bind(record.id).run();

      return json({ error: "Incorrect OTP." }, 400);
    }

    const partner = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, partner_code, name, email, status
       FROM partners
       WHERE lower(email) = ?
       LIMIT 1`
    ).bind(email).first();

    if (!partner || partner.status !== "active") {
      return json({
        error: "Your employee account is not active."
      }, 403);
    }

    await env.LOANSBAZAAR_DB.prepare(
      `UPDATE employee_login_otps
       SET verified_at = datetime('now')
       WHERE id = ?`
    ).bind(record.id).run();

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
    const payload = b64(JSON.stringify({
      partnerId: partner.id,
      email: partner.email,
      exp
    }));
    const sig = await sign(payload, env.EMPLOYEE_SESSION_SECRET);

    return new Response(JSON.stringify({
      ok: true,
      message: "Login successful.",
      redirect: "/dashboard/home.html"
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie":
          `LB_EMPLOYEE=${payload}.${sig}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Lax`
      }
    });
  } catch (e) {
    console.error("Employee login verification failed:", e);
    return json({ error: "Could not verify the login code." }, 500);
  }
}


// ============================================================
// SHARED SECURITY AND RESPONSE HELPERS
// ============================================================



// Validate the signed employee cookie and check current account status.
async function getEmployeeSession(request, env) {
  if (!env.LOANSBAZAAR_DB || !env.EMPLOYEE_SESSION_SECRET) {
    return {
      ok: false,
      status: 500,
      error: "Employee session service is not configured."
    };
  }

  const raw = getCookie(request, "LB_EMPLOYEE");
  if (!raw) {
    return { ok: false, status: 401, error: "Please log in." };
  }

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) {
    return { ok: false, status: 401, error: "Invalid employee session." };
  }

  try {
    const expected = await sign(payload, env.EMPLOYEE_SESSION_SECRET);
    if (!timingSafeEqual(signature, expected)) {
      return { ok: false, status: 401, error: "Invalid employee session." };
    }

    const data = JSON.parse(decodeB64(payload));
    if (
      !Number.isInteger(data.partnerId) ||
      typeof data.email !== "string" ||
      !Number.isFinite(data.exp) ||
      data.exp <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, status: 401, error: "Your session has expired. Please log in again." };
    }

    const partner = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, partner_code, name, email, status
       FROM partners
       WHERE id = ? AND lower(email) = ?
       LIMIT 1`
    ).bind(data.partnerId, data.email.toLowerCase()).first();

    if (!partner) {
      return { ok: false, status: 401, error: "Employee account not found." };
    }

    if (partner.status !== "active") {
      return {
        ok: false,
        status: 403,
        error: partner.status === "pending"
          ? "Your account is awaiting approval."
          : "Your account is not active."
      };
    }

    return { ok: true, partner };
  } catch (error) {
    console.error("Employee session validation failed:", error);
    return { ok: false, status: 401, error: "Invalid employee session." };
  }
}


async function createPartnerCode(env) {
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const suffix = Array.from(bytes, b => b.toString(16).padStart(2, "0"))
      .join("").toUpperCase();
    const code = `LB${suffix}`;

    const found = await env.LOANSBAZAAR_DB.prepare(
      "SELECT id FROM partners WHERE partner_code=?"
    ).bind(code).first();

    if (!found) return code;
  }

  throw new Error("Could not generate a unique partner code.");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return b64bytes(new Uint8Array(signature));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const entry = cookieHeader.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));

  return entry ? entry.slice(name.length + 1) : null;
}

function b64(value) {
  return b64bytes(new TextEncoder().encode(value));
}

function b64bytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeB64(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), char => char.charCodeAt(0))
  );
}

function clean(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

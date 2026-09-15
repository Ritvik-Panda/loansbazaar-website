export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleSubmit(request, env) {
  try {
    const data = await request.json();

    const required = ["name", "age", "mobile", "email", "type"];
    for (const key of required) {
      if (!String(data[key] ?? "").trim()) {
        return json({ ok: false, error: `Missing ${key}` }, 400);
      }
    }

    const name = clean(data.name, 120);
    const age = Number(data.age);
    const mobile = clean(data.mobile, 30);
    const email = clean(data.email, 160);
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

    const db = env.LOANSBAZAAR_DB;
    if (!db) {
      console.error("Missing LOANSBAZAAR_DB binding.");
      return json({ ok: false, error: "Backend database is not configured." }, 500);
    }

    const saved = await db.prepare(`
      INSERT INTO enquiries (type, service, name, age, mobile, email, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(type, service, name, age, mobile, email, message).run();

    if (!saved.success) {
      console.error("D1 save failed:", saved);
      return json({ ok: false, error: "Could not save the enquiry." }, 500);
    }

    const { RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL } = env;
    let emailSent = false;

    if (RESEND_API_KEY && NOTIFY_EMAIL && FROM_EMAIL) {
      const subject = type === "Partner"
        ? `New LoansBazaar Partner Enquiry - ${name}`
        : `New LoansBazaar Customer Enquiry - ${service}`;

      const html = `
        <h2>New LoansBazaar Enquiry</h2>
        <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse">
          <tr><td><b>Type</b></td><td>${escapeHtml(type)}</td></tr>
          <tr><td><b>Service</b></td><td>${escapeHtml(service)}</td></tr>
          <tr><td><b>Name</b></td><td>${escapeHtml(name)}</td></tr>
          <tr><td><b>Age</b></td><td>${escapeHtml(age)}</td></tr>
          <tr><td><b>Mobile</b></td><td>${escapeHtml(mobile)}</td></tr>
          <tr><td><b>Email</b></td><td>${escapeHtml(email)}</td></tr>
          <tr><td><b>Message</b></td><td>${escapeHtml(message || "-")}</td></tr>
        </table>
      `;

      try {
        const mail = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [NOTIFY_EMAIL],
            subject,
            html
          })
        });
        emailSent = mail.ok;
        if (!mail.ok) console.error("Resend error:", await mail.text());
      } catch (mailError) {
        console.error("Email notification failed:", mailError);
      }
    }

    return json({ ok: true, saved: true, emailSent });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
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

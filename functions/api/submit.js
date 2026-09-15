export async function onRequestPost(context) {
  try {
    const data = await context.request.json();

    const required = ["name", "age", "mobile", "email", "type"];
    for (const key of required) {
      if (!data[key]) {
        return json({ ok: false, error: `Missing ${key}` }, 400);
      }
    }

    // Configure these in Cloudflare Pages:
    // RESEND_API_KEY = your Resend API key
    // NOTIFY_EMAIL   = email where your LoansBazaar team should receive enquiries
    // FROM_EMAIL     = a verified sender, e.g. enquiries@yourdomain.com
    const { RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL } = context.env;

    if (!RESEND_API_KEY || !NOTIFY_EMAIL || !FROM_EMAIL) {
      console.error("Missing email environment variables.");
      return json({ ok: false, error: "Server email configuration is incomplete." }, 500);
    }

    const subject = data.type === "Partner"
      ? `New LoansBazaar Partner Enquiry - ${data.name}`
      : `New LoansBazaar Customer Enquiry - ${data.service || "General"}`;

    const html = `
      <h2>New LoansBazaar Enquiry</h2>
      <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse">
        <tr><td><b>Type</b></td><td>${escapeHtml(data.type)}</td></tr>
        <tr><td><b>Service</b></td><td>${escapeHtml(data.service || "General Enquiry")}</td></tr>
        <tr><td><b>Name</b></td><td>${escapeHtml(data.name)}</td></tr>
        <tr><td><b>Age</b></td><td>${escapeHtml(data.age)}</td></tr>
        <tr><td><b>Mobile</b></td><td>${escapeHtml(data.mobile)}</td></tr>
        <tr><td><b>Email</b></td><td>${escapeHtml(data.email)}</td></tr>
        <tr><td><b>Message</b></td><td>${escapeHtml(data.message || "-")}</td></tr>
      </table>
    `;

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

    if (!mail.ok) {
      const errorText = await mail.text();
      console.error("Resend error:", errorText);
      return json({ ok: false, error: "Email provider rejected the request." }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
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
    headers: { "Content-Type": "application/json" }
  });
}

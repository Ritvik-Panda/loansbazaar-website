
async function adminEnquiries(request, env, isAdminHost) {
  if (!isAdminHost) {
    return json({ error: "Not Found" }, 404);
  }

  // Require a valid admin session before returning customer information.
  if (!(await authorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await env.LOANSBAZAAR_DB.prepare(
      `SELECT id, type, service, name, age, mobile, email, message, created_at
       FROM enquiries
       ORDER BY id DESC
       LIMIT 500`
    ).all();

    const stats = await env.LOANSBAZAAR_DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN type = 'Customer' THEN 1 ELSE 0 END) AS customers,
         SUM(CASE WHEN type = 'Partner' THEN 1 ELSE 0 END) AS partners,
         SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today
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
    console.error(e);
    return json({ error: "Could not load enquiries." }, 500);
  }
}

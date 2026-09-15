# LoansBazaar Workers + D1 + Admin Dashboard

Cloudflare Worker serving the public LoansBazaar website on `loansbazaar.co.in` and a protected admin dashboard on `admin.loansbazaar.co.in`.

## Cloudflare runtime configuration
- D1 binding: `LOANSBAZAAR_DB`
- D1 database: `loansbazaar-db`
- Required admin variables: `ADMIN_USER`, `ADMIN_PASSWORD`
- Recommended secret: `ADMIN_SESSION_SECRET` (a long random value)
- Optional email variables: `RESEND_API_KEY`, `NOTIFY_EMAIL`, `FROM_EMAIL`

The admin dashboard reads enquiries from D1 and supports search, type filtering, refresh, statistics and CSV export.


## Domain routing
`assets.run_worker_first = true` is required because the Worker selects the public or admin site based on hostname. `loansbazaar.co.in` serves the public site, while `admin.loansbazaar.co.in` serves `public/admin/index.html`.

# LoansBazaar Workers + D1 + Admin Dashboard

This package deploys the LoansBazaar website as a Cloudflare Worker with static assets, D1 enquiry storage, and a private admin dashboard.

## Important admin routing fix
The admin dashboard is served from `/admin.html` rather than `public/admin/index.html`. This avoids Cloudflare Static Assets directory-index redirects that can cause a 307 redirect loop on `/admin/`.

The Worker serves `/admin.html` for:
- `https://admin.loansbazaar.co.in/`
- `https://admin.loansbazaar.co.in/admin`
- `https://admin.loansbazaar.co.in/admin/`
- `https://admin.loansbazaar.co.in/admin/index.html`

The public domain cannot access `/admin` routes.

## Required Cloudflare variables/secrets
Variables:
- `ADMIN_USER`
- `NOTIFY_EMAIL`
- `FROM_EMAIL` (if email notifications are enabled)

Secrets:
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY` (optional, for email notifications)

D1 binding:
- `LOANSBAZAAR_DB`

Do not store `ADMIN_PASSWORD` as a plaintext Variable. Use a Cloudflare Secret.

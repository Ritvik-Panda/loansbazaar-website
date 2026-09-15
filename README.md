# LoansBazaar Website

Cloudflare Workers website with:
- Responsive LoansBazaar website
- Customer and Partner enquiry forms
- Cloudflare D1 storage for every enquiry
- Optional Resend email notifications
- Registered Trademark certificate section

## Cloudflare Workers setup

This repository is configured for **Cloudflare Workers Builds**, not the older Pages Functions layout.

### D1 binding
The Wrangler configuration already declares the production D1 binding:

- Binding: `LOANSBAZAAR_DB`
- Database: `loansbazaar-db`

The binding name uses an underscore and must not be changed to `LOANSBAZAAR-DB`.

### D1 schema
Run the SQL in `schema.sql` once against the `loansbazaar-db` database. It creates the `enquiries` table and indexes.

### Optional email notifications
Create these Worker secrets/variables if email notifications are required:

- `RESEND_API_KEY`
- `NOTIFY_EMAIL`
- `FROM_EMAIL`

The enquiry is saved to D1 before email is attempted. Therefore a temporary email failure does not lose the enquiry.

## Workers Build settings

For the Git-connected Cloudflare Worker:

- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Production branch: `main`

The `wrangler.toml` file is intentionally configured for Workers static assets and D1.

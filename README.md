# LoansBazaar Website

Professional, responsive LoansBazaar lead/enquiry website with:

- Personal Loan
- Home Loan
- Business Loan
- Health Insurance
- Life Insurance
- Customer flow → choose service → enquiry form
- Partner flow → partner enquiry form
- **Cloudflare D1 backend storage for every enquiry**
- Optional Resend email notifications
- Registered Trademark certificate section
- Mobile responsive design

## Cloudflare Pages + D1 setup

This package already includes `wrangler.toml` with the D1 binding configuration for the existing `loansbazaar-db` database. The binding is named exactly `LOANSBAZAAR_DB`, matching the backend code.

1. Upload/push the files in this package to the root of the GitHub repository connected to your Cloudflare Pages project.
2. Keep the build command empty and use the project root as the output directory.
3. The included `wrangler.toml` configures the D1 binding automatically:
   - Binding: `LOANSBAZAAR_DB`
   - Database: `loansbazaar-db`
   - Database ID: `e8049730-c319-4045-ad37-f4910302e716`
4. Run the SQL in `functions/schema.sql` against that D1 database if it has not already been run. (It has already been created for this project.)
5. Deploy/redeploy the Pages project so the binding takes effect.

Cloudflare supports configuring Pages D1 bindings through Wrangler as an alternative to the dashboard binding UI.

The form endpoint `/api/submit` now saves the enquiry to D1 before attempting email notification. This means a temporary email failure does **not** lose the submitted lead.

## Optional email notifications

Add these Cloudflare Pages environment variables:

- `RESEND_API_KEY` = your Resend API key
- `NOTIFY_EMAIL` = the email address where enquiries should arrive
- `FROM_EMAIL` = a verified sender address on your domain

If these variables are not configured, enquiries are still saved to D1.

## Where the data is stored

All submitted customer and partner enquiries are stored in the D1 `enquiries` table with:

- enquiry type
- selected service
- name
- age
- mobile
- email
- message/requirement
- submission date/time

You can view/export the saved records from the Cloudflare D1 dashboard.

## Trademark

The supplied LoansBazaar registered trademark certificate image is included at:

`assets/loansbazaar-trademark-certificate.jpeg`

It is displayed in a dedicated Registered Trademark section on the website and can be opened full-size.

## Important

This is a lead/enquiry website, not a loan approval engine. Avoid promising guaranteed approval, guaranteed interest rates, or guaranteed insurance coverage. Add your actual company, distributor/intermediary, regulatory and privacy details before publishing.

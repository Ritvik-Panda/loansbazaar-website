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

1. Create a Cloudflare Pages project for this folder.
2. Keep the build command empty and use the project root as the output directory.
3. Create a **D1 database** in Cloudflare.
4. In the Pages project, add a D1 binding named exactly:
   - `LOANSBAZAAR_DB`
5. Run the SQL in `functions/schema.sql` against that D1 database.
6. Redeploy the Pages project.

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

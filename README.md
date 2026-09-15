# LoansBazaar Website

A professional, responsive LoansBazaar landing website with:

- Personal Loan
- Home Loan
- Business Loan
- Health Insurance
- Life Insurance
- Customer flow → choose service → enquiry form
- Partner flow → partner enquiry form
- Cloudflare Pages Function for enquiry email notifications
- Mobile responsive design

## Deploy on Cloudflare Pages

1. Upload this folder to a GitHub repository, or upload the project through Cloudflare Pages.
2. Create a Cloudflare Pages project and connect the repository.
3. Use:
   - Build command: none
   - Build output directory: `/`
4. The `/functions` folder is automatically used by Cloudflare Pages Functions.

## Make enquiries reach your team

The included function uses Resend for email delivery.

Create these Cloudflare Pages environment variables:

- `RESEND_API_KEY` = your Resend API key
- `NOTIFY_EMAIL` = the email address where LoansBazaar enquiries should arrive
- `FROM_EMAIL` = a verified sender address on your domain

Example:
- FROM_EMAIL: `enquiries@loansbazaar.in`
- NOTIFY_EMAIL: `yourteam@example.com`

After adding the variables, redeploy the site.

## Before going live

Replace these placeholders in `index.html`:

- `+91 XXXXX XXXXX`
- `hello@loansbazaar.in`
- `India`

Also replace the text-only logo with your real LoansBazaar logo if you have one.

## Important

This is a lead/enquiry website, not a loan approval engine. Avoid promising guaranteed approval, guaranteed interest rates, or guaranteed insurance coverage. Add your actual company, distributor/intermediary, regulatory and privacy details before publishing.

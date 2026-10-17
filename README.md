# DataCapita — Business Finance Workspace (starter)

A responsive finance dashboard starter for business income/expense tracking, with Supabase authentication (Google + email/password), per-user cloud transactions, multi-format statement imports, AI-assisted categories/insights, simple trend estimates, and CSV export. Currency display is INR (₹). Subscription payments are intentionally postponed and disabled.

## Important status

This is an implementation starter, not a live production service. It needs your own service accounts and configuration. Do not use real customer or bank data until HTTPS, privacy controls, backups, and security testing are in place. The product is a recordkeeping/educational tool, not accounting, tax, investment, or regulated financial advice.

## Requirements

- Node.js 20 or later
- Supabase project
- Google Cloud project for Google OAuth (optional if using email/password only)
- OpenAI API key (optional; rule-based fallback works without it)
- A hosting provider later, after local testing

## 1. Local setup

1. Install Node.js 20+ from https://nodejs.org/.
2. Extract the ZIP and open a terminal in `DataCapita_FullStack`.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and fill in the Supabase URL, anon key, and service-role key. Keep `.env` private; it is ignored by Git.
5. In the Supabase SQL Editor, run `schema.sql` once.
6. In `public/index.html`, set `CONFIG.supabaseUrl` and `CONFIG.supabaseAnonKey` to the same project URL and public anon/publishable key. These two values are intended for browser use; never put service-role or OpenAI keys here.
7. In Supabase → Authentication → URL Configuration, add `http://localhost:3000` to Site URL / allowed redirect URLs while developing.
8. Email/password: in Supabase → Authentication → Providers, enable Email. Keep email confirmation enabled for real users; configure SMTP before a public launch so confirmation and recovery emails reliably deliver.
9. Google login: follow the Google OAuth steps below, then enable Google in Supabase providers.
10. Add `OPENAI_API_KEY` to `.env` if AI categories/insights are desired. Keep it server-side only. Set usage limits and alerts in the OpenAI platform.
11. Run `npm start` and open http://localhost:3000.

## 2. Google OAuth setup

1. Open https://console.cloud.google.com/ and create/select a Google Cloud project.
2. Configure the Google Auth Platform / OAuth consent screen with the app name, support email, audience and contact email requested by Google. While testing, keep the audience limited to test users.
3. Create an OAuth client ID of type **Web application**.
4. In Supabase → Authentication → Providers → Google, copy the Supabase callback URL shown on that page.
5. Add that exact Supabase callback URL to Google OAuth client's **Authorized redirect URIs**. Do not guess or manually rewrite it.
6. Copy the Google client ID and client secret into the Supabase Google provider settings and save.
7. Add your local and eventual production app URLs to Supabase Authentication → URL Configuration redirect allowlist. Use HTTPS in production.
8. Test Google login, logout, refresh/session persistence, and login on the production domain before launch.

## 3. OpenAI setup

1. Create/sign in to your OpenAI platform account at https://platform.openai.com/.
2. Set up billing/usage limits as needed, then create a project API key.
3. Put the key only in the server `.env` as `OPENAI_API_KEY=...`. Never commit it, send it in chat, or put it in `public/index.html`.
4. The current default model is `gpt-4.1-mini`; change `OPENAI_MODEL` only to a model available to your account.
5. Test with fake/sanitized transaction descriptions first. The server sends transaction description, amount and type for classification, and aggregated category totals for insights. Do not upload sensitive statements until you have reviewed OpenAI's current data controls and privacy terms.

## 4. Hosting decision (later)

Test locally first. For this Express backend, choose a Node.js-capable host (for example Render, Railway, or a suitable VPS); static-only hosting will not run `server.js`. Configure the production start command `npm start`, Node 20+, environment variables, HTTPS, and the production `APP_URL`. Then add the deployed HTTPS origin to Supabase redirect URLs and Google OAuth consent/client settings. Do not deploy `.env` or the service-role key into frontend build variables.

## 5. Data security notes

- RLS limits transaction reads/writes to the authenticated user's `user_id`.
- Profile reads are per-user; profile writes are server-only so a browser client cannot self-grant premium status.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must remain server-only.
- Configure backups, data retention/deletion, rate limits, monitoring, incident handling, privacy notice, terms, and support contact before a public business launch.
- Add validation and abuse/cost limits before allowing untrusted public traffic.
- Never collect bank passwords, UPI PINs, card PINs, OTPs or full card details.

## Supported features and limitations

- Google OAuth and email/password via Supabase Auth when configured.
- Manual income/expense records saved in Supabase.
- Multi-format imports: CSV, TSV, XLS, XLSX, text-based PDF, DOCX, TXT and JSON transaction arrays/objects. Excel worksheets are scanned individually; delimited files handle quoted commas. Review every row before saving.
- Limitations: imports are capped at 10 MB; scanned PDFs need OCR and are not supported; legacy binary .DOC files must be converted to .DOCX. Bank statement layouts vary, so extraction must be checked before saving. The browser-side PDF.js, SheetJS and Mammoth readers are loaded from public CDNs and therefore require internet access.
- AI-assisted categories/insights with rule-based fallback if OpenAI is missing/unavailable.
- Basic linear expense trend estimate; not a guarantee or a financial recommendation.
- INR formatting and CSV export.
- Payments intentionally disabled. No Razorpay credentials are needed now. Before billing later, verify business eligibility and requirements, create/test a plan and webhook, and only then enable the billing flow.

## Before inviting real users

Test signup and email confirmation, Google login, password recovery, logout, per-user data isolation, transaction CRUD, malformed/large CSV/PDF handling, import duplicates, OpenAI failure/usage caps, export and deletion, mobile layout, HTTPS, backups and incident response. Have an adult/qualified professional review applicable Indian privacy, consumer, tax, business and payment obligations before a public launch.

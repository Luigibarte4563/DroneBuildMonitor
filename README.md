# DroneBuild Monitor

Website for a drone construction monitoring service in the Philippines. Plain HTML, CSS and JavaScript, plus one small Node server for the Gmail mailer. No build step.

## Run

```
npm install
npm start
```

Then go to http://localhost:4173. Copy `.env.example` to `.env` first if you want email to actually send: see [Email](#email-gmail).

`npm start` serves the pages and `POST /api/send-email` from one origin, so there is no CORS setup. Running plain `python3 -m http.server 4173` still shows the pages but has no mailer. The same applies to VS Code Live Server on port 5500: checkout will report that the email service is not running. Always use `npm start` when testing email.

## Deploy on Vercel

Import the GitHub repo as a Node project. Set these in **Project Settings → Environment Variables**, then redeploy:

`GMAIL_USER`, `GMAIL_APP_PASSWORD`, and optionally `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `MAIL_BCC`.

`vercel.json` keeps the static assets in the function bundle and raises the function limit to 30 seconds for SMTP. GitHub Pages cannot run `server.js`, so it cannot send email.

## Files

- `index.html`, `services.html`, `cart.html`, `checkout.html`, `success.html`: pages
- `css/styles.css`: all styles
- `js/data.js`: services and prices
- `js/cart.js`: cart saved in localStorage
- `js/layout.js`: header, footer and cart drawer
- `js/motion.js`: scroll animations
- `js/mailer.js`: reusable `sendEmail()` client
- `server.js`: static server + Gmail API endpoint
- `images/`, `logo/`: photos and logo

Checkout payment is still a demo. No real payment is made; the booking email is real.

## Email (Gmail)

Checkout sends a booking confirmation to the customer's own address through Gmail SMTP. If `MAIL_BCC` is set, the site owner gets a blind copy of every booking email. Credentials live only in `.env` on the server and never reach the browser. One dependency: `nodemailer`.

### 1. Configure Gmail securely

1. Turn on **2-Step Verification**: myaccount.google.com → Security.
2. Open **App passwords** (same Security page), pick app "Mail", generate one.
3. Google shows 16 characters, usually as four groups of four. Copy it exactly, spaces allowed.
4. Create `.env` and fill it in:

   ```
   copy .env.example .env
   ```

| Variable | Required | Meaning |
| --- | --- | --- |
| `GMAIL_USER` | yes | full Gmail address, e.g. `you@gmail.com`. Also the only allowed sender. |
| `GMAIL_APP_PASSWORD` | yes | the 16-character App Password |
| `MAIL_FROM_NAME` | no | display name, defaults to `DroneBuild Monitor` |
| `MAIL_REPLY_TO` | no | where replies go, e.g. `hello@dronebuild.ph` |
| `MAIL_BCC` | no | fixed address that gets a blind copy of every booking email, e.g. the site owner |
| `PORT` | no | defaults to `4173` |

Never put your normal Google account password in `.env`, and never ask anyone for theirs.

5. Restart the server after any change: `npm start`. There is no hot reload.

If `GMAIL_USER` or `GMAIL_APP_PASSWORD` is missing the site still runs and the endpoint answers `503 Email service is not configured.` It does not pretend to send.

### 2. Limits and honest caveats

- Free Gmail allows roughly 500 messages a day, and Google can temporarily block an account that looks abusive. That limit is Google's; there is no "unlimited" setting.
- There are **no automatic retries**, so a failed send never silently becomes a duplicate email.
- The mailer only reports what Gmail accepted. It cannot know whether the email reached an inbox or landed in spam.

### 3. Abuse protection

The checkout is public and anonymous, so the endpoint is protected by:

- a hidden honeypot field that bots fill in (the server then answers success and sends nothing);
- a minimum fill time of 3 seconds (`startedAt`, checked server-side);
- a per-IP limit of 5 sends per 10 minutes;
- strict single-recipient validation (the optional `MAIL_BCC` comes from the server, never from the request), a 64 KB payload cap and a 20 000-character message cap;
- `Content-Type: application/json` required, which also blocks cross-site form posts;
- a sender address pinned to `GMAIL_USER`, so the form can never send as someone else.

These raise the cost for bots but are **not authentication**: someone calling the API directly can forge `startedAt` and change IP. For a genuinely public, high-traffic site the real fix is user accounts plus a captcha, or moving sending behind a staff-only admin page. Do not promise otherwise.

### 4. Test the endpoint

```powershell
curl.exe -X POST http://localhost:4173/api/send-email -H "Content-Type: application/json" -d "{\"to\":\"you@gmail.com\",\"subject\":\"Test Email\",\"message\":\"Hello! This is a test email.\",\"startedAt\":0}"
```

`startedAt: 0` skips the human-timing check so the command works; the real form sends its render time.

Expected success: `{"success":true,"message":"Email accepted for sending."}`

### 5. Testing checklist

1. **Valid email** — full checkout; the confirmation arrives at the address typed in the form. If `MAIL_BCC` is set, a blind copy arrives at that address too (unless it is the same address).
2. **Invalid recipient** — `not-an-email`; the browser blocks it, and the API returns `400` if you post it directly.
3. **Empty subject/message** — API returns `400` with a specific message.
4. **Wrong credentials** — change `GMAIL_APP_PASSWORD` in `.env`, restart; the browser shows a generic error, the terminal logs `EAUTH` plus a hint.
5. **SMTP unreachable** — disconnect the network or block port 465; the send fails with `502` after about 10 s, no retry.
6. **Rate limit** — post 6 valid requests within 10 minutes; the 6th returns `429` and the browser keeps the cart.
7. **HTML escaping** — send `<img src=x onerror=alert(1)>` as the message; it arrives as visible text, no alert.
8. **No secrets in the browser** — DevTools → Sources/Network: only `/api/send-email`, never SMTP details or `.env`.
9. **Unauthorized use** — from another origin, a `fetch` with a JSON content type triggers a CORS preflight and fails; a plain form post is rejected by the JSON-only check. Requesting `/.env` returns `404`.
10. **Frontend states** — the Pay button disables while sending, errors appear in the note line under it, success redirects to `success.html`.

Skipped on purpose: **multiple recipients** (a comma list is a header-injection vector and checkout sends to one address), **CORS** (same-origin server, so there is nothing to allow), **login** (the site has no accounts; see the caveats above).

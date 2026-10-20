// Gmail mailer shared by server.js (locally and on Vercel).
// One dependency: nodemailer.
import nodemailer from "nodemailer";

const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const MAIL_FROM_NAME = (process.env.MAIL_FROM_NAME || "DroneBuild Monitor").replace(/["\\]/g, "").trim();
const MAIL_REPLY_TO = (process.env.MAIL_REPLY_TO || "").trim();
const MAIL_BCC = (process.env.MAIL_BCC || "").trim();

const MAX_SUBJECT = 120;
const MAX_MESSAGE = 20_000;
const RATE_MAX = 5;
const RATE_WINDOW = 10 * 60 * 1000;
const MIN_FILL_MS = 3000; // the checkout cannot be read and filled faster than this

// one recipient only: a comma list is a header-injection vector and no caller here needs it
const EMAIL_RE = /^[^\s@,<>]+@[^\s@,<>]+\.[a-zA-Z]{2,}$/;

const GREETING = "Hello,";
const FOOTER = "DroneBuild Monitor · hello@dronebuild.ph · +63 917 000 0000";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export const esc = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// every interpolated value is escaped; client input is only ever plain text
export function emailHTML({ greeting, body, footer }) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f2;font-family:Helvetica,Arial,sans-serif;color:#1d221c">
  <div style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border:1px solid #e3e6df;border-radius:10px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#55705a">DroneBuild Monitor</h1>
    ${greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${esc(greeting)}</p>` : ""}
    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(body)}</div>
    ${footer ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3e6df;font-size:12px;color:#6b7268">${esc(footer)}</p>` : ""}
  </div>
</body></html>`;
}

export function validate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw fail("Invalid request body.");
  const { to, subject, message } = payload;
  if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) throw fail("Enter a valid recipient email address.");
  if (typeof subject !== "string" || !subject.trim()) throw fail("Subject is required.");
  if (subject.length > MAX_SUBJECT) throw fail(`Subject must be ${MAX_SUBJECT} characters or fewer.`);
  if (/[\r\n]/.test(subject)) throw fail("Subject contains invalid characters.");
  if (typeof message !== "string" || !message.trim()) throw fail("Message is required.");
  if (message.length > MAX_MESSAGE) throw fail(`Message must be ${MAX_MESSAGE} characters or fewer.`);
  return { to: to.trim(), subject: subject.trim(), message: message.trim() };
}

// per-IP sliding window, held in memory (a cold start clears it)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < RATE_WINDOW);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [key, times] of hits) if (times.every((time) => now - time >= RATE_WINDOW)) hits.delete(key);
  return false;
}

const configured = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
const transporter = configured
  ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

const replyTo = EMAIL_RE.test(MAIL_REPLY_TO) ? MAIL_REPLY_TO : undefined;
if (MAIL_REPLY_TO && !replyTo) console.warn("[mailer] MAIL_REPLY_TO is not a valid email address; ignoring it.");
const bcc = EMAIL_RE.test(MAIL_BCC) ? MAIL_BCC : undefined;
if (MAIL_BCC && !bcc) console.warn("[mailer] MAIL_BCC is not a valid email address; ignoring it.");

const OK = { success: true, buyerDelivered: true, message: "Email accepted for sending." };
const bad = (message) => ({ success: false, message });

// Gmail lists the recipients it accepted and rejected on each send.
export function isAccepted(info, address) {
  const wanted = String(address).toLowerCase();
  return (info?.accepted || []).some((accepted) => accepted.toLowerCase() === wanted);
}

if (!transporter) {
  console.warn("[mailer] Not configured. Put GMAIL_USER and GMAIL_APP_PASSWORD in the environment (see .env.example). Sending returns 503.");
} else {
  console.log(`[mailer] Gmail SMTP ready for ${GMAIL_USER}`);
}

// One request in, one result out. server.js calls this for every /api/send-email request.
export async function handle(payload, ip) {
  // hidden field: humans never see it, naive form bots fill it in. Answer success so they move on.
  if (typeof payload?.website === "string" && payload.website.trim()) return { status: 200, body: OK };
  // a future timestamp means the visitor's clock is ahead, not a bot; only the past window is checked
  const elapsed = Date.now() - payload?.startedAt;
  if (!Number.isFinite(payload?.startedAt) || (elapsed >= 0 && elapsed < MIN_FILL_MS))
    return { status: 400, body: bad("Please take a moment and try again.") };

  let mail;
  try {
    mail = validate(payload);
  } catch (err) {
    return { status: err.status || 400, body: bad(err.message) };
  }

  if (!transporter) return { status: 503, body: bad("Email service is not configured.") };

  if (rateLimited(ip)) return { status: 429, body: bad("Too many emails. Please try again later."), headers: { "retry-after": "600" } };

  const message = {
    from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
    replyTo,
    subject: mail.subject,
    text: [GREETING, mail.message, FOOTER].filter(Boolean).join("\n\n"),
    html: emailHTML({ greeting: GREETING, body: mail.message, footer: FOOTER }),
  };
  // the buyer gets the message with a normal To header; the owner copy is a second, separate send
  // so one delivery never depends on the other
  const ownerCopies = [...new Set([GMAIL_USER, bcc].filter(Boolean))];
  const [buyerResult, ownerResult] = await Promise.allSettled([
    transporter.sendMail({ ...message, to: mail.to }),
    transporter.sendMail({ ...message, to: ownerCopies.join(", ") }),
  ]);

  for (const [label, result] of [
    ["buyer", buyerResult],
    ["owner", ownerResult],
  ]) {
    if (result.status === "fulfilled") {
      const info = result.value;
      console.log(
        `[mailer] ${label} copy accepted by ${info.accepted.join(", ") || "nobody"}${info.rejected.length ? ` rejected ${info.rejected.join(", ")}` : ""} response=${info.response} id=${info.messageId}`,
      );
    } else {
      const err = result.reason || {};
      console.error(
        `[mailer] ${label} copy failed (${err.code || err.responseCode || "unknown"}): ${err.message || err} response=${err.response || "none"}`,
      );
    }
  }

  const authFailed = [buyerResult, ownerResult].some(
    (result) => result.status === "rejected" && (result.reason?.code === "EAUTH" || result.reason?.responseCode === 535),
  );
  if (authFailed)
    console.error("[mailer] Gmail rejected the credentials: use a 16-character App Password (not the account password) and make sure 2-Step Verification is on.");

  const ownerDelivered =
    ownerResult.status === "fulfilled" && ownerCopies.every((address) => isAccepted(ownerResult.value, address));
  if (!ownerDelivered) return { status: 502, body: bad("Unable to send the email. Please try again later.") };

  if (buyerResult.status !== "fulfilled" || !isAccepted(buyerResult.value, mail.to)) {
    // the booking still stands; tell the buyer to check the address or contact us
    return {
      status: 200,
      body: {
        success: true,
        buyerDelivered: false,
        message: "Your order was received, but we couldn't deliver the confirmation email. Check the email address or contact us at +63 917 000 0000.",
      },
    };
  }

  return { status: 200, body: OK };
}

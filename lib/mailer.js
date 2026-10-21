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

const GREETING = "Hi there,";
const FOOTER = "DroneBuild Monitor · hello@dronebuild.ph · +63 917 000 0000 · Mon–Sat 8am–6pm";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export const esc = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// every interpolated value is escaped; client input is only ever plain text
export function emailHTML({ greeting, body, footer, cta }) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f2;font-family:Helvetica,Arial,sans-serif;color:#1d221c">
  <div style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border:1px solid #e3e6df;border-radius:10px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#55705a">DroneBuild Monitor</h1>
    <p style="margin:0 0 18px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280">Aerial survey booking desk</p>
    ${greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${esc(greeting)}</p>` : ""}
    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(body)}</div>
    ${cta ? `<p style="margin:20px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background-color:#55705a;color:#ffffff;font-weight:700;text-decoration:none">${esc(cta.label)}</a></p>` : ""}
    ${footer ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3e6df;font-size:12px;color:#6b7268">${esc(footer)}</p>` : ""}
  </div>
</body></html>`;
}

export function validate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw fail("Invalid request body.");
  const { to, subject, message, cta, refund } = payload;
  if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) throw fail("Enter a valid recipient email address.");
  if (typeof subject !== "string" || !subject.trim()) throw fail("Subject is required.");
  if (subject.length > MAX_SUBJECT) throw fail(`Subject must be ${MAX_SUBJECT} characters or fewer.`);
  if (/[\r\n]/.test(subject)) throw fail("Subject contains invalid characters.");
  if (typeof message !== "string" || !message.trim()) throw fail("Message is required.");
  if (message.length > MAX_MESSAGE) throw fail(`Message must be ${MAX_MESSAGE} characters or fewer.`);

  let action;
  if (cta !== undefined) {
    if (!cta || typeof cta !== "object" || Array.isArray(cta)) throw fail("Invalid button.");
    const label = typeof cta.label === "string" ? cta.label.trim() : "";
    if (!label || label.length > 60) throw fail("Button label must be 1-60 characters.");
    if (typeof cta.href !== "string" || !cta.href.trim()) throw fail("Button link is required.");
    let url;
    try {
      url = new URL(cta.href.trim());
    } catch {
      throw fail("Button link is invalid.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw fail("Button link must start with http:// or https://.");
    action = { label, href: url.href };
  }
  if (refund !== undefined && typeof refund !== "boolean") throw fail("Invalid refund flag.");

  return {
    to: to.trim(),
    subject: subject.trim(),
    message: message.trim(),
    ...(action ? { cta: action } : {}),
    ...(refund ? { refund: true } : {}),
  };
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

// replies go to the owner: MAIL_REPLY_TO when valid, otherwise the Gmail sender itself
const replyTo = (MAIL_REPLY_TO && EMAIL_RE.test(MAIL_REPLY_TO) ? MAIL_REPLY_TO : GMAIL_USER) || undefined;
if (MAIL_REPLY_TO && !EMAIL_RE.test(MAIL_REPLY_TO)) console.warn("[mailer] MAIL_REPLY_TO is not a valid email address; using GMAIL_USER.");
const bcc = EMAIL_RE.test(MAIL_BCC) ? MAIL_BCC : undefined;
if (MAIL_BCC && !bcc) console.warn("[mailer] MAIL_BCC is not a valid email address; ignoring it.");

const OK = { success: true, message: "Email accepted for sending." };
const bad = (message) => ({ success: false, message });

const lower = (list) => (Array.isArray(list) ? list : []).map((address) => String(address).toLowerCase());

// Gmail lists the recipients it accepted and rejected on each send; a rejected address wins.
export function isAccepted(info, address) {
  const wanted = String(address).toLowerCase();
  return lower(info?.accepted).includes(wanted) && !lower(info?.rejected).includes(wanted);
}

// The four delivery rules, with no SMTP involved so they can be unit-tested.
export function deliveryOutcome(buyerAccepted, ownerAccepted) {
  if (!ownerAccepted) return "error";
  return buyerAccepted ? "ok" : "buyerEmailFailed";
}

// Promise.allSettled results in, plain acceptance flags and the rule outcome out.
export function assessDelivery(buyerResult, ownerResult, buyer, owners) {
  const buyerAccepted = buyerResult?.status === "fulfilled" && isAccepted(buyerResult.value, buyer);
  const ownerAccepted =
    ownerResult?.status === "fulfilled" &&
    owners.length > 0 &&
    owners.every((address) => isAccepted(ownerResult.value, address));
  return { buyerAccepted, ownerAccepted, outcome: deliveryOutcome(buyerAccepted, ownerAccepted) };
}

export function ownerRetryTargets(ownerResult, owners) {
  return ownerResult?.status === "fulfilled"
    ? owners.filter((address) => !isAccepted(ownerResult.value, address))
    : owners;
}

function logResult(label, result) {
  if (result.status === "fulfilled") {
    const info = result.value || {};
    const accepted = info.accepted || [];
    const rejected = info.rejected || [];
    const line = `[mailer] ${label} accepted=${accepted.join(", ") || "nobody"} rejected=${rejected.join(", ") || "nobody"} response=${info.response || "none"} id=${info.messageId || "none"}`;
    if (rejected.length) {
      console.error(line);
      console.error(`[mailer] ${label} full SMTP result: ${JSON.stringify({ accepted, rejected, response: info.response, messageId: info.messageId })}`);
    } else {
      console.log(line);
    }
    return;
  }
  const err = result.reason || {};
  console.error(
    `[mailer] ${label} failed code=${err.code || "unknown"} responseCode=${err.responseCode || "unknown"} command=${err.command || "none"} response=${err.response || "none"}: ${err.message || err}`,
  );
}

function logAuthHint(result) {
  if (result.status === "rejected" && (result.reason?.code === "EAUTH" || result.reason?.responseCode === 535))
    console.error("[mailer] Gmail rejected the credentials: use a 16-character App Password (not the account password) and make sure 2-Step Verification is on.");
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

  const linkLine = mail.cta ? `${mail.cta.label}: ${mail.cta.href}` : "";
  const text = [GREETING, mail.message, linkLine, FOOTER].filter(Boolean).join("\n\n");
  const html = emailHTML({ greeting: GREETING, body: mail.message, footer: FOOTER, cta: mail.cta });
  const from = `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`;
  const buyerMessage = { from, replyTo, to: mail.to, subject: mail.subject, text, html };
  // same body, so the order summary, reference and refund button match the buyer's copy;
  // bookings get a "New booking request:" prefix, while refunds keep their subject
  const ownerSubject = mail.refund ? mail.subject : `New booking request: ${mail.subject}`;
  const ownerMessage = { from, replyTo, subject: ownerSubject, text, html };
  const ownerCopies = [...new Set([GMAIL_USER, bcc].filter(Boolean))];
  const sendOwner = (recipients) => transporter.sendMail({ ...ownerMessage, to: recipients.join(", ") });

  // both sends start together; neither waits for the other
  const [buyerResult, ownerResult] = await Promise.allSettled([transporter.sendMail(buyerMessage), sendOwner(ownerCopies)]);

  logResult("buyer", buyerResult);
  logResult("owner", ownerResult);
  logAuthHint(buyerResult);
  logAuthHint(ownerResult);

  const initial = assessDelivery(buyerResult, ownerResult, mail.to, ownerCopies);
  const buyerAccepted = initial.buyerAccepted;
  let ownerAccepted = initial.ownerAccepted;

  // one retry, only for owner addresses that were not accepted, so a partial send cannot duplicate
  if (!ownerAccepted) {
    const retryTo = ownerRetryTargets(ownerResult, ownerCopies);
    if (retryTo.length) {
      console.warn(`[mailer] owner copy not accepted; retrying once for ${retryTo.join(", ")}`);
      const retryResult = await sendOwner(retryTo).then(
        (value) => ({ status: "fulfilled", value }),
        (reason) => ({ status: "rejected", reason }),
      );
      logResult("owner retry", retryResult);
      logAuthHint(retryResult);
      ownerAccepted = retryResult.status === "fulfilled" && retryTo.every((address) => isAccepted(retryResult.value, address));
    }
  }

  const outcome = deliveryOutcome(buyerAccepted, ownerAccepted);
  if (outcome === "error") return { status: 502, body: bad("Unable to send the email. Please try again later.") };

  if (outcome === "buyerEmailFailed") {
    // the booking still stands; tell the buyer to check the address or contact us
    return {
      status: 200,
      body: {
        success: true,
        buyerEmailFailed: true,
        message: "Your booking is reserved, but the confirmation email couldn't be delivered. Check the address you typed, or call +63 917 000 0000.",
      },
    };
  }

  return { status: 200, body: OK };
}

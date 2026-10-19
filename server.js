// Gmail mailer + static file server on one origin. One dependency: nodemailer.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;

// Google shows app passwords as "abcd efgh ijkl mnop"; SMTP wants them joined up
const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const MAIL_FROM_NAME = (process.env.MAIL_FROM_NAME || "DroneBuild Monitor").replace(/["\\]/g, "").trim();
const MAIL_REPLY_TO = (process.env.MAIL_REPLY_TO || "").trim();
const MAIL_BCC = (process.env.MAIL_BCC || "").trim();

const MAX_BODY = 64 * 1024;
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

// per-IP sliding window, held in memory (a restart clears it)
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      if (!tooBig) chunks.push(chunk);
    });
    req.on("end", () => (tooBig ? reject(fail("Payload too large.", 413)) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
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

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(payload));
}
const ok = (res) => send(res, 200, { success: true, message: "Email accepted for sending." });
const bad = (res, message, status, headers) => send(res, status, { success: false, message }, headers);

async function api(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed.", 405, { allow: "POST" });
  // requiring JSON also blocks cross-site form posts, which cannot set this header
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json"))
    return bad(res, "Content-Type must be application/json.", 415);

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return bad(res, err.status ? err.message : "Invalid JSON body.", err.status || 400);
  }

  // hidden field: humans never see it, naive form bots fill it in. Answer success so they move on.
  if (typeof payload?.website === "string" && payload.website.trim()) return ok(res);
  // a future timestamp means the visitor's clock is ahead, not a bot; only the past window is checked
  const elapsed = Date.now() - payload?.startedAt;
  if (!Number.isFinite(payload?.startedAt) || (elapsed >= 0 && elapsed < MIN_FILL_MS))
    return bad(res, "Please take a moment and try again.", 400);

  let mail;
  try {
    mail = validate(payload);
  } catch (err) {
    return bad(res, err.message, err.status || 400);
  }

  if (!transporter) return bad(res, "Email service is not configured.", 503);

  if (rateLimited(req.socket.remoteAddress || "unknown"))
    return bad(res, "Too many emails. Please try again later.", 429, { "retry-after": "600" });

  try {
    const info = await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
      replyTo,
      to: mail.to,
      bcc: bcc && bcc !== mail.to ? bcc : undefined,
      subject: mail.subject,
      text: [GREETING, mail.message, FOOTER].filter(Boolean).join("\n\n"),
      html: emailHTML({ greeting: GREETING, body: mail.message, footer: FOOTER }),
    });
    console.log(`[mailer] sent to ${mail.to}${bcc && bcc !== mail.to ? " (bcc)" : ""} id=${info.messageId}`);
  } catch (err) {
    // detail goes to the operator's terminal, never to the browser
    console.error(`[mailer] send failed (${err.code || err.responseCode || "unknown"}): ${err.message}`);
    if (err.code === "EAUTH" || err.responseCode === 535)
      console.error("[mailer] Gmail rejected the credentials: use a 16-character App Password (not the account password) and make sure 2-Step Verification is on.");
    return bad(res, "Unable to send the email. Please try again later.", 502);
  }

  return ok(res);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function notFound(res) {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

async function serveStatic(res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = "/";
  }
  rel = rel.replace(/^\/+/, "") || "index.html";
  const parts = rel.split("/");

  // never serve dotfiles (.env), node_modules, or anything outside the site folder
  if (parts.some((part) => part.startsWith(".")) || parts.includes("node_modules")) return notFound(res);
  const file = path.resolve(ROOT, rel);
  const outside = path.relative(ROOT, file);
  if (outside.startsWith("..") || path.isAbsolute(outside)) return notFound(res);

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    res.end(body);
  } catch {
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    return notFound(res);
  }

  if (pathname === "/api/send-email") return api(req, res);
  if (pathname.startsWith("/api/")) return bad(res, "Not found.", 404);
  if (req.method !== "GET" && req.method !== "HEAD") return bad(res, "Method not allowed.", 405, { allow: "GET, HEAD" });
  await serveStatic(res, pathname);
});

if (!transporter) {
  console.warn("[mailer] Not configured. Put GMAIL_USER and GMAIL_APP_PASSWORD in .env (see .env.example), then restart. The site still works; sending returns 503.");
} else {
  console.log(`[mailer] Gmail SMTP ready for ${GMAIL_USER}`);
}

// Node's test runner imports this file for the helpers, so it must not listen there.
// Everywhere else (local npm start or Vercel) the listener is required.
if (!process.env.NODE_TEST_CONTEXT) {
  server.listen(PORT, () => console.log(`DroneBuild Monitor on http://localhost:${PORT}`));
}

export { server };

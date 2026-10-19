// Reusable mailer client. Credentials stay on the server; this only talks to /api/send-email.

const ENDPOINT = "/api/send-email";
const EMAIL_RE = /^[^\s@,<>]+@[^\s@,<>]+\.[a-zA-Z]{2,}$/;

export class MailerError extends Error {}

let inFlight = null; // a second call joins the first instead of sending a duplicate email

// UX checks only: the server repeats every one of them
function check({ to, subject, message }) {
  if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) throw new MailerError("Enter a valid recipient email address.");
  if (!String(subject || "").trim()) throw new MailerError("Subject is required.");
  if (!String(message || "").trim()) throw new MailerError("Message is required.");
}

// startedAt is when the form was rendered: the server rejects impossibly fast submissions
export async function sendEmail({ to, subject, message, website = "" } = {}, startedAt = Date.now()) {
  check({ to, subject, message });
  if (inFlight) return inFlight;

  const run = (async () => {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject, message, website, startedAt }),
      });
    } catch {
      throw new MailerError("Network error. Check your connection and try again.");
    }

    let data = {};
    let json = false;
    try {
      data = await res.json();
      json = true;
    } catch {}
    // a static server (Live Server, python http.server) has no API and answers with an HTML 404
    if (!json) {
      const local = typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname);
      throw new MailerError(
        local
          ? "Email service is not running at this address. Start it with `npm start` and open http://localhost:4173."
          : "Email service is temporarily unavailable. Please try again later.",
      );
    }
    if (!res.ok || !data.success) throw new MailerError(data.message || "Unable to send the email. Please try again later.");
    return data;
  })();

  inFlight = run;
  try {
    return await run;
  } finally {
    inFlight = null;
  }
}

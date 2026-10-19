// Vercel function for POST /api/send-email. Static files are served by Vercel directly.
import { handle } from "../lib/mailer.js";

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405, { allow: "POST" });
    // requiring JSON also blocks cross-site form posts, which cannot set this header
    if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json"))
      return json({ success: false, message: "Content-Type must be application/json." }, 415);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ success: false, message: "Invalid JSON body." }, 400);
    }

    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const { status, body, headers } = await handle(payload, ip);
    return json(body, status, headers);
  },
};

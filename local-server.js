// Local development server: static files and POST /api/send-email on one origin. Use `npm start`.
// On Vercel the static files are served directly and api/send-email.js handles the API.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "./lib/mailer.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const MAX_BODY = 64 * 1024;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

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

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(payload));
}

async function api(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, message: "Method not allowed." }, { allow: "POST" });
  // requiring JSON also blocks cross-site form posts, which cannot set this header
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json"))
    return send(res, 415, { success: false, message: "Content-Type must be application/json." });

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, err.status || 400, { success: false, message: err.status ? err.message : "Invalid JSON body." });
  }

  const { status, body, headers } = await handle(payload, req.socket.remoteAddress || "unknown");
  return send(res, status, body, headers);
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
  if (pathname.startsWith("/api/")) return send(res, 404, { success: false, message: "Not found." });
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { success: false, message: "Method not allowed." }, { allow: "GET, HEAD" });
  await serveStatic(res, pathname);
});

// Node's test runner imports lib/mailer.js only, so this always starts outside tests.
server.listen(PORT, () => console.log(`DroneBuild Monitor on http://localhost:${PORT}`));

export { server };

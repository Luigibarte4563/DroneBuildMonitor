import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "./mailer.js";

const request = { to: "a@b.co", subject: "Test", message: "Hello" };

async function withFetch(impl, run) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test("an HTML 404 from a static server gets a useful message", async () => {
  await withFetch(
    async () => new Response("<html>Not found</html>", { status: 404, headers: { "content-type": "text/html" } }),
    () => assert.rejects(sendEmail(request), /npm start/),
  );
});

test("a JSON API error is passed through", async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ success: false, message: "Too many emails. Please try again later." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    () => assert.rejects(sendEmail(request), /Too many emails/),
  );
});

test("a successful send returns the API payload", async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ success: true, message: "Email accepted for sending." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    async () => assert.deepEqual(await sendEmail(request), { success: true, message: "Email accepted for sending." }),
  );
});

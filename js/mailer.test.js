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

test("an HTML 404 on localhost points at npm start", async () => {
  globalThis.location = { hostname: "localhost" };
  try {
    await withFetch(
      async () => new Response("<html>Not found</html>", { status: 404, headers: { "content-type": "text/html" } }),
      () => assert.rejects(sendEmail(request), /npm start/),
    );
  } finally {
    delete globalThis.location;
  }
});

test("an HTML 404 in production stays user-friendly", async () => {
  delete globalThis.location;
  await withFetch(
    async () => new Response("<html>Not found</html>", { status: 404, headers: { "content-type": "text/html" } }),
    () => assert.rejects(sendEmail(request), /temporarily unavailable/),
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

test("sendEmail forwards the refund button and flag", async () => {
  let body;
  await withFetch(
    async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ success: true, message: "Email accepted for sending." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    () => sendEmail({ ...request, cta: { label: "Request a refund", href: "https://example.com/refund" }, refund: true }),
  );
  assert.deepEqual(body.cta, { label: "Request a refund", href: "https://example.com/refund" });
  assert.equal(body.refund, true);
});

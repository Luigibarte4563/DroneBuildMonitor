import test from "node:test";
import assert from "node:assert/strict";
import { esc, validate, emailHTML } from "./server.js";

test("esc escapes every HTML-significant character", () => {
  assert.equal(esc(`<b onerror="alert('x')">&`), "&lt;b onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
});

test("escaped content is inert inside the template", () => {
  const html = emailHTML({ greeting: "Hello,", body: "</div><script>alert(1)</script>", footer: "<footer>" });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<footer>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("validate trims and accepts a normal request", () => {
  assert.deepEqual(validate({ to: " a@b.co ", subject: " Hi ", message: " Yo " }), {
    to: "a@b.co",
    subject: "Hi",
    message: "Yo",
  });
});

test("validate rejects a comma-separated recipient list", () => {
  assert.throws(() => validate({ to: "a@b.co,c@d.co", subject: "s", message: "m" }), /valid recipient/);
});

test("validate rejects header injection in the subject", () => {
  assert.throws(() => validate({ to: "a@b.co", subject: "hi\r\nBcc: x@y.co", message: "m" }), /invalid characters/);
});

test("validate rejects missing or oversized fields", () => {
  assert.throws(() => validate({ to: "a@b.co", subject: "", message: "m" }), /Subject is required/);
  assert.throws(() => validate({ to: "a@b.co", subject: "s", message: "   " }), /Message is required/);
  assert.throws(() => validate({ to: "a@b.co", subject: "s", message: "x".repeat(20_001) }), /fewer/);
  assert.throws(() => validate(null), /Invalid request body/);
});

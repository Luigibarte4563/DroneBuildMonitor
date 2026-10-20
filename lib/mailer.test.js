import test from "node:test";
import assert from "node:assert/strict";
import { esc, validate, emailHTML, isAccepted, deliveryOutcome, assessDelivery, ownerRetryTargets } from "./mailer.js";

test("esc escapes every HTML-significant character", () => {
  assert.equal(esc(`<b onerror="alert('x')">&`), "&lt;b onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
});

test("escaped content is inert inside the template", () => {
  const html = emailHTML({ greeting: "Hello,", body: "</div><script>alert(1)</script>", footer: "<footer>" });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<footer>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("emailHTML renders an escaped refund button", () => {
  const html = emailHTML({
    greeting: "Hello,",
    body: "Body",
    footer: "Footer",
    cta: { label: 'Request a "refund"', href: "https://example.com/refund?ref=DBM-1&x=2" },
  });
  assert.ok(html.includes('href="https://example.com/refund?ref=DBM-1&amp;x=2"'));
  assert.ok(html.includes(">Request a &quot;refund&quot;</a>"));
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

test("validate accepts a refund button and refund flag", () => {
  assert.deepEqual(
    validate({
      to: "a@b.co",
      subject: "s",
      message: "m",
      cta: { label: "Request a refund", href: "https://example.com/refund" },
      refund: true,
    }),
    {
      to: "a@b.co",
      subject: "s",
      message: "m",
      cta: { label: "Request a refund", href: "https://example.com/refund" },
      refund: true,
    },
  );
});

test("validate rejects unsafe or malformed buttons", () => {
  const base = { to: "a@b.co", subject: "s", message: "m" };
  assert.throws(() => validate({ ...base, cta: { label: "x", href: "javascript:alert(1)" } }), /http/);
  assert.throws(() => validate({ ...base, cta: { label: "", href: "https://example.com" } }), /label/);
  assert.throws(() => validate({ ...base, cta: { label: "x", href: "/refund" } }), /invalid/);
  assert.throws(() => validate({ ...base, cta: "https://example.com" }), /button/i);
});

test("validate rejects a non-boolean refund flag", () => {
  assert.throws(() => validate({ to: "a@b.co", subject: "s", message: "m", refund: "yes" }), /refund flag/);
});

test("isAccepted matches the recipient case-insensitively", () => {
  assert.equal(isAccepted({ accepted: ["Buyer@Example.com"], rejected: [] }, "buyer@example.com"), true);
});

test("isAccepted is false for a rejected or missing recipient", () => {
  assert.equal(isAccepted({ accepted: [], rejected: ["buyer@example.com"] }, "buyer@example.com"), false);
  assert.equal(isAccepted({ accepted: ["owner@example.com"], rejected: [] }, "buyer@example.com"), false);
  assert.equal(isAccepted({}, "buyer@example.com"), false);
});

test("isAccepted is false when the address is both accepted and rejected", () => {
  assert.equal(isAccepted({ accepted: ["buyer@example.com"], rejected: ["buyer@example.com"] }, "buyer@example.com"), false);
});

// fake Promise.allSettled results: no SMTP in these tests
const sent = (accepted, rejected = []) => ({
  status: "fulfilled",
  value: { accepted, rejected, response: "250 2.0.0 OK", messageId: "<test@example.com>" },
});
const failed = (code = "ESOCKET") => ({ status: "rejected", reason: { code, message: "send failed" } });
const buyer = "buyer@example.com";
const owners = ["owner@example.com"];

test("assessDelivery: both accepted is success", () => {
  assert.deepEqual(assessDelivery(sent([buyer]), sent(owners), buyer, owners), {
    buyerAccepted: true,
    ownerAccepted: true,
    outcome: "ok",
  });
  assert.equal(deliveryOutcome(true, true), "ok");
});

test("assessDelivery: owner accepted and buyer failed keeps the order", () => {
  assert.deepEqual(assessDelivery(sent([], [buyer]), sent(owners), buyer, owners), {
    buyerAccepted: false,
    ownerAccepted: true,
    outcome: "buyerEmailFailed",
  });
  assert.deepEqual(assessDelivery(failed(), sent(owners), buyer, owners), {
    buyerAccepted: false,
    ownerAccepted: true,
    outcome: "buyerEmailFailed",
  });
  assert.equal(deliveryOutcome(false, true), "buyerEmailFailed");
});

test("assessDelivery: buyer accepted and owner failed is an error", () => {
  assert.deepEqual(assessDelivery(sent([buyer]), sent([], owners), buyer, owners), {
    buyerAccepted: true,
    ownerAccepted: false,
    outcome: "error",
  });
  assert.deepEqual(assessDelivery(sent([buyer]), failed(), buyer, owners), {
    buyerAccepted: true,
    ownerAccepted: false,
    outcome: "error",
  });
  assert.equal(deliveryOutcome(true, false), "error");
});

test("assessDelivery: both failed is an error", () => {
  assert.deepEqual(assessDelivery(failed(), failed(), buyer, owners), {
    buyerAccepted: false,
    ownerAccepted: false,
    outcome: "error",
  });
  assert.equal(deliveryOutcome(false, false), "error");
});

test("assessDelivery: one rejected owner copy is an owner failure", () => {
  assert.deepEqual(assessDelivery(sent([buyer]), sent(["owner@example.com"], ["second@example.com"]), buyer, ["owner@example.com", "second@example.com"]), {
    buyerAccepted: true,
    ownerAccepted: false,
    outcome: "error",
  });
});

test("ownerRetryTargets retries only the addresses that were not accepted", () => {
  const owners = ["one@example.com", "two@example.com"];
  assert.deepEqual(ownerRetryTargets(sent(["one@example.com"], ["two@example.com"]), owners), ["two@example.com"]);
  assert.deepEqual(ownerRetryTargets(sent(owners), owners), []);
  assert.deepEqual(ownerRetryTargets(failed(), owners), owners);
});

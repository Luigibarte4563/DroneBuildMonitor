import "./layout.js";
import { sendEmail } from "./mailer.js";
import { formatPHP } from "./data.js";
import { arrow } from "./icons.js";
import { decodeOrder } from "./refund-data.js";

const app = document.getElementById("app");
const startedAt = Date.now();
const params = new URLSearchParams(location.search);
const ref = (params.get("ref") || "").trim();
const decoded = decodeOrder(params.get("order"));
const order =
  decoded &&
  typeof decoded.id === "string" &&
  Array.isArray(decoded.items) &&
  Number.isFinite(decoded.subtotal) &&
  Number.isFinite(decoded.vat) &&
  Number.isFinite(decoded.total)
    ? decoded
    : null;

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const money = (value) => formatPHP(Number(value) || 0);

function receiptHTML(order) {
  const items = order.items
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const qty = Number(item.qty) || 1;
      const unit = qty === 1 && item.unit ? ` <span class="x">${esc(item.unit)}</span>` : "";
      return `<li><span>${esc(item.name)}${qty > 1 ? ` <span class="x">× ${qty}</span>` : ""}</span><span class="tabular">${money(item.price * qty)}${unit}</span></li>`;
    })
    .join("");

  return `<div class="receipt">
    <p class="order-id" style="margin-top:0">Order number: ${esc(order.id)}</p>
    <div class="receipt-head">
      <span class="logo logo-mark" role="img" aria-label="DroneBuild Monitor"></span>
      <span class="chip">Refund request</span>
    </div>
    <ul class="order-lines">${items}</ul>
    <dl class="totals">
      <div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div>
      <div><dt>VAT (12%)</dt><dd>${money(order.vat)}</dd></div>
      <div><dt>Order total</dt><dd>${money(order.total)}</dd></div>
      <div><dt>Cancellation fee (20%)</dt><dd>-${money(order.total * 0.2)}</dd></div>
      <div class="grand"><dt>Refund amount</dt><dd>${money(order.total * 0.8)}</dd></div>
      <div><dt>Refund to</dt><dd>${esc(order.method || "Not selected")}</dd></div>
    </dl>
  </div>`;
}

function requestMessage({ reference, email, reason }) {
  const lines = [`A customer asked to cancel booking ${reference} and claim the refund below.`];

  if (order) {
    lines.push(
      "",
      "Booked services:",
      ...order.items
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const qty = Number(item.qty) || 1;
          return `- ${item.name} × ${qty} — ${money(item.price * qty)}${qty === 1 && item.unit ? ` ${item.unit}` : ""}`;
        }),
      "",
      `Subtotal: ${money(order.subtotal)}`,
      `VAT (12%): ${money(order.vat)}`,
      `Order total: ${money(order.total)}`,
      `Cancellation fee (20%): ${money(order.total * 0.2)}`,
      `Refund amount: ${money(order.total * 0.8)}`,
      `Refund to: ${order.method || "Not selected"}`,
    );
  }

  lines.push(
    "",
    `Contact email: ${email}`,
    `Reason: ${reason || "Not provided"}`,
    "",
    "Our refund desk reviews the request and replies within 1 business day (Mon–Sat).",
  );
  return lines.join("\n");
}

app.innerHTML = `<section class="page"><div class="container">
    <div class="checkout-head">
      <a href="index.html" class="text-link">← Back to home</a>
      <h1 class="page-title">Request a refund</h1>
    </div>
    <form class="split checkout" id="refund">
      <div class="form-col">
        ${order ? receiptHTML(order) : `<p class="note">We couldn't load this order here. Enter the booking reference from your confirmation email and our team will verify it.</p>`}
        <fieldset>
          <legend><span>01</span>Refund details</legend>
          <div class="fields">
            ${order ? "" : `<label class="field"><span>Booking reference</span><input class="input" name="ref" required maxlength="60" placeholder="DBM-ABC123"></label>`}
            <label class="field"><span>Email used for booking</span><input class="input" name="email" type="email" required autocomplete="email" placeholder="paolo@marceloconstruction.ph"></label>
            <label class="field"><span>Reason for refund</span><select class="input" name="reason" required>
              <option value="" disabled selected>Select a reason…</option>
              <option>Schedule changed</option>
              <option>Project cancelled</option>
              <option>Booked by mistake</option>
              <option>Found another provider</option>
              <option>Other</option>
            </select></label>
          </div>
        </fieldset>
        <div>
          <button type="submit" class="btn btn-solid" id="confirm">Confirm refund</button>
          <p class="note" id="status" role="status">We'll email a copy to you and our team.</p>
        </div>
        <input class="sr-only" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      </div>
      <aside>
        <div class="summary">
          <h2>Refund policy</h2>
          <p>Booked less than 7 days ago? Cancel and 80% comes back — the 20% balance covers pilot and airspace processing. Our refund desk reviews every request.</p>
        </div>
      </aside>
    </form>
  </div></section>`;

const form = document.getElementById("refund");
if (!order && form.elements.ref) form.elements.ref.value = ref;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const reference = String(order ? order.id : data.get("ref") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  const reason = String(data.get("reason") || "").trim();
  const confirm = document.getElementById("confirm");
  const status = document.getElementById("status");

  if (!reference) {
    status.textContent = "Enter your booking reference.";
    return;
  }

  confirm.disabled = true;
  status.textContent = "Sending…";

  try {
    const result = await sendEmail(
      {
        to: email,
        subject: `Refund request (${reference})`,
        message: requestMessage({ reference, email, reason }),
        website: data.get("website") || "",
        refund: true,
      },
      startedAt,
    );

    app.innerHTML = `<section class="center-empty">
      <h1>Refund request sent</h1>
      <p class="muted">${
        result.buyerEmailFailed
          ? "Our team has your request, but we couldn't email you a copy. We'll still process it."
          : "We've emailed a copy to you and our team. We'll reply within 1 business day."
      }</p>
      <a href="index.html" class="btn btn-solid">Back to home${arrow()}</a>
    </section>`;
  } catch (err) {
    status.textContent = err.message;
    confirm.disabled = false;
  }
});

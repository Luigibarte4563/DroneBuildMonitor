import "./layout.js";
import * as cart from "./cart.js";
import { formatPHP, totals } from "./data.js";
import { icon, arrow } from "./icons.js";
import { sendEmail } from "./mailer.js";

const METHODS = [
  { id: "gcash", label: "GCash", hint: "Pay via GCash e-wallet", icon: "phone" },
  { id: "maya", label: "Maya", hint: "Pay via Maya e-wallet", icon: "wallet" },
  { id: "card", label: "Credit / Debit card", hint: "Visa, Mastercard, JCB", icon: "card" },
  { id: "bank", label: "Bank transfer", hint: "BDO or BPI", icon: "bank" },
  { id: "cash", label: "Cash on site", hint: "Pay the pilot on flight day", icon: "cash" },
];

const REGIONS = ["Metro Manila (NCR)", "Luzon (outside NCR)", "Visayas", "Mindanao"];
const PH_MOBILE = "^(\\+?63|0)9\\d{2}\\s?\\d{3}\\s?\\d{4}$";
const app = document.getElementById("app");
const items = cart.lines();

const field = (label, input, cls = "") => `<label class="field ${cls}"><span>${label}</span>${input}</label>`;

// fields shown under each payment method
const PANELS = {
  gcash: field("GCash account number", `<input class="input" name="wallet" type="tel" required placeholder="0917 123 4567" pattern="${PH_MOBILE}" title="PH mobile number, e.g. 0917 123 4567">`),
  maya: field("Maya account number", `<input class="input" name="wallet" type="tel" required placeholder="0917 123 4567" pattern="${PH_MOBILE}" title="PH mobile number, e.g. 0917 123 4567">`),
  card: `<div class="card-fields">
      ${field("Name on card", `<input class="input" name="cardName" required autocomplete="cc-name" placeholder="JUAN DELA CRUZ">`, "full")}
      ${field("Card number", `<input class="input" name="cardNumber" required inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" pattern="^(\\d{4} ){3}\\d{4}$" title="16-digit card number">`, "full")}
      ${field("Expiry", `<input class="input" name="expiry" required inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" pattern="^(0[1-9]|1[0-2])\\/\\d{2}$" title="MM/YY">`)}
      ${field("CVC", `<input class="input" name="cvc" required inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" pattern="^\\d{3,4}$" title="3 or 4 digits">`)}
    </div>`,
  bank: `<p class="panel-text"><strong>Transfer the total to either account:</strong></p>
    <dl class="banks">
      <div class="bank"><dt>BDO</dt><dd class="tabular">0012 3456 7890</dd><dd class="small">DroneBuild Monitor Inc.</dd></div>
      <div class="bank"><dt>BPI</dt><dd class="tabular">1234 5678 90</dd><dd class="small">DroneBuild Monitor Inc.</dd></div>
    </dl>
    <p class="panel-text">We'll email you how to send your deposit slip.</p>`,
  cash: `<p class="panel-text">Pay our pilot in cash on the flight date. You get an official receipt on site.</p>`,
};

// plain-text body of the booking email; the server escapes it and wraps it in the HTML template
function orderMessage(data, method, items, t, orderId) {
  const g = (key) => String(data.get(key) || "").trim();
  const firstName = g("name").split(/\s+/)[0] || "there";
  const rawDate = g("date");
  const flightDate = rawDate
    ? new Date(`${rawDate}T00:00:00`).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "Not set";
  const lines = [
    `Thank you for your booking request, ${firstName}. We've received your details and will call you within 24 hours to confirm the flight schedule.`,
    "",
    `Booking reference: ${orderId}`,
    `Preferred flight date: ${flightDate}`,
    `Site address: ${g("address")}`,
    `Region: ${g("region")}`,
    `Contact: ${g("name")}`,
    g("company") ? `Company: ${g("company")}` : null,
    `Phone: ${g("phone")}`,
    `Payment method: ${method?.label || "Not selected"}`,
    "",
    "Services",
    ...items.map((l) => `- ${l.service.name} × ${l.qty} — ${formatPHP(l.lineTotal)}`),
    "",
    `Subtotal: ${formatPHP(t.subtotal)}`,
    `VAT (12%): ${formatPHP(t.vat)}`,
    `Total: ${formatPHP(t.total)}`,
    "",
    "Payment is a demo — no card or wallet was charged. Our team will contact you to arrange payment and the flight schedule.",
    "",
    "If anything is wrong, reply to this email or call +63 917 000 0000.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function emptyView() {
  app.innerHTML = `<section class="center-empty">
    <h1>Your cart is empty</h1>
    <p class="muted">Add a service before checking out.</p>
    <a href="services.html" class="btn btn-solid">Browse services${arrow()}</a>
  </section>`;
}

function formView() {
  const sub = cart.subtotal();
  const t = totals(sub);
  const minDate = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const startedAt = Date.now(); // the server rejects submissions faster than a human can type

  app.innerHTML = `<section class="page"><div class="container">
    <div class="checkout-head">
      <a href="cart.html" class="text-link">← Back to cart</a>
      <h1 class="page-title">Checkout</h1>
    </div>

    <form class="split checkout" id="checkout">
      <div class="form-col">
        <fieldset>
          <legend><span>01</span>Contact details</legend>
          <div class="fields two">
            ${field("Full name", `<input class="input" name="name" required autocomplete="name" placeholder="Juan Dela Cruz">`)}
            ${field("Company (optional)", `<input class="input" name="company" autocomplete="organization" placeholder="ABC Builders Inc.">`)}
            ${field("Email", `<input class="input" name="email" type="email" required autocomplete="email" placeholder="juan@company.ph">`)}
            ${field("Mobile number", `<input class="input" name="phone" type="tel" required autocomplete="tel" placeholder="0917 123 4567" pattern="${PH_MOBILE}" title="PH mobile number, e.g. 0917 123 4567">`)}
          </div>
        </fieldset>

        <fieldset>
          <legend><span>02</span>Project site</legend>
          <div class="fields">
            ${field("Site address", `<input class="input" name="address" required placeholder="Lot 4, Brgy. San Isidro, Antipolo City">`)}
            <div class="fields two">
              ${field("Region", `<select class="input" name="region" required><option value="" disabled selected>Select region</option>${REGIONS.map((r) => `<option>${r}</option>`).join("")}</select>`)}
              ${field("Preferred flight date", `<input class="input" name="date" type="date" required min="${minDate}">`)}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend><span>03</span>Payment method</legend>
          <div class="methods" role="radiogroup">
            ${METHODS.map(
              (m, i) => `<label class="method ${i === 0 ? "active" : ""} ${m.id === "cash" ? "wide" : ""}">
                <input type="radio" name="method" value="${m.id}" class="sr-only" ${i === 0 ? "checked" : ""}>
                <span class="method-icon">${icon(m.icon)}</span>
                <span class="method-text"><strong>${m.label}</strong><small>${m.hint}</small></span>
                <span class="radio"></span>
              </label>`,
            ).join("")}
          </div>
          <div class="method-panel" id="panel"></div>
        </fieldset>
        <input class="sr-only" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      </div>

      <aside>
        <div class="summary">
          <h2>Order summary</h2>
          <ul class="order-lines">${items
            .map((l) => `<li><span>${l.service.name} <span class="x">× ${l.qty}</span></span><span class="tabular strong">${formatPHP(l.lineTotal)}</span></li>`)
            .join("")}</ul>
          ${cart.totalsHTML(sub)}
          <button type="submit" class="btn btn-solid btn-full" id="pay">${icon("lock")} Pay ${formatPHP(t.total)}</button>
          <p class="note" id="mail-status" role="status">Your booking email is real. Payment is a demo; no card is charged.</p>
        </div>
      </aside>
    </form>
  </div></section>`;

  const form = document.getElementById("checkout");
  const panel = document.getElementById("panel");

  // switch payment method
  const showPanel = (id) => {
    panel.innerHTML = PANELS[id];
    panel.style.animation = "none";
    panel.offsetHeight;
    panel.style.animation = "";
    form.querySelectorAll(".method").forEach((el) => el.classList.toggle("active", el.querySelector("input").value === id));
  };
  showPanel("gcash");
  form.addEventListener("change", (e) => e.target.name === "method" && showPanel(e.target.value));

  // format card number and expiry while typing
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (el.name === "cardNumber") {
      el.value = el.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
    }
    if (el.name === "expiry") {
      const d = el.value.replace(/\D/g, "").slice(0, 4);
      el.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    }
  });

  // mail the booking first; only redirect once the server accepted it
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const method = METHODS.find((m) => m.id === data.get("method"));
    const pay = document.getElementById("pay");
    const status = document.getElementById("mail-status");
    const note = status.textContent;
    const orderId = `DBM-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    pay.disabled = true;
    pay.innerHTML = `${icon("loader", "spin")} Processing payment…`;
    paying = true;

    try {
      await sendEmail(
        {
          to: data.get("email"),
          subject: `Your DroneBuild booking request (${orderId})`,
          message: orderMessage(data, method, items, t, orderId),
          website: data.get("website") || "",
        },
        startedAt,
      );
    } catch (err) {
      // no order placed and no redirect, so the customer never sees a false "confirmation"
      status.textContent = `${note} ${err.message}`;
      pay.innerHTML = `${icon("lock")} Pay ${formatPHP(t.total)}`;
      pay.disabled = false;
      paying = false;
      return;
    }

    // payment stays mock
    setTimeout(() => {
      cart.placeOrder({
        id: orderId,
        name: data.get("name"),
        email: data.get("email"),
        method: method?.label || "Not selected",
        items: items.map((l) => ({ name: l.service.name, qty: l.qty, price: l.service.price })),
        ...t,
        placedAt: new Date().toISOString(),
      });
      location.href = "success.html";
    }, 1600);
  });
}

let paying = false;
items.length ? formView() : emptyView();

// reload if the cart changes in the drawer
document.addEventListener("cart:change", () => !paying && location.reload());

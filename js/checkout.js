import "./layout.js";
import * as cart from "./cart.js";
import { formatPHP, totals } from "./data.js";
import { icon, arrow } from "./icons.js";
import { sendEmail } from "./mailer.js";
import { encodeOrder } from "./refund-data.js";

const PAYMENT_GROUPS = [
  {
    title: "E-Wallet",
    methods: [{ id: "gcash", badge: "G", label: "GCash", hint: "Settle with your GCash wallet" }],
  },
  {
    title: "Online Banking",
    methods: [
      { id: "bdo", badge: "BDO", label: "BDO", hint: "BDO Unibank transfer" },
      { id: "bpi", badge: "BPI", label: "BPI", hint: "BPI transfer" },
      { id: "metrobank", badge: "MB", label: "Metrobank", hint: "Metrobank transfer" },
      { id: "landbank", badge: "LBP", label: "Landbank", hint: "Landbank transfer" },
    ],
  },
  {
    title: "Debit or Credit Card",
    methods: [
      { id: "debit", badge: "DR", label: "Debit card", hint: "Charged straight from your bank account" },
      { id: "credit", badge: "CR", label: "Credit card", hint: "Pay with your credit line" },
    ],
  },
  {
    title: "Cash",
    methods: [{ id: "cash", badge: "₱", label: "Cash on flight day", hint: "Pay the pilot on site" }],
  },
  {
    title: "Corporate",
    methods: [{ id: "terms", badge: "30D", label: "Credit terms (30 days)", hint: "For approved corporate accounts" }],
  },
];

const METHODS = PAYMENT_GROUPS.flatMap((g) => g.methods.map((m) => ({ ...m, group: g.title })));

const REGIONS = ["Metro Manila (NCR)", "North & Central Luzon", "South Luzon", "Visayas", "Mindanao"];
const PH_MOBILE = "^(\\+?63|0)9\\d{2}\\s?\\d{3}\\s?\\d{4}$";
const app = document.getElementById("app");
const items = cart.lines();

const field = (label, input, cls = "") => `<label class="field ${cls}"><span>${label}</span>${input}</label>`;

// plain-text body of the booking email; the server escapes it and wraps it in the HTML template
function orderMessage(data, method, items, t, orderId) {
  const g = (key) => String(data.get(key) || "").trim();
  const firstName = g("contact_name").split(/\s+/)[0] || "there";
  const rawDate = g("survey_date");
  const flightDate = rawDate
    ? new Date(`${rawDate}T00:00:00`).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "Not set";
  const lines = [
    `Thank you for your booking request, ${firstName}. Here is what happens next:`,
    "",
    "1. A survey coordinator calls you within 24 hours (Mon–Sat) to confirm the slot.",
    "2. We check airspace clearance and drone permits for your site.",
    "3. The flight plan and pilot details reach you by email before we fly.",
    "",
    `Booking reference: ${orderId}`,
    `Preferred survey date: ${flightDate}`,
    `Site address: ${g("site_address")}`,
    `Region: ${g("site_region")}`,
    `Survey type: ${g("survey_type")}`,
    g("site_area") ? `Site area: ${g("site_area")} hectares` : null,
    g("site_contact") ? `Site contact: ${g("site_contact")}` : null,
    `Contact: ${g("contact_name")}`,
    g("company_name") ? `Company: ${g("company_name")}` : null,
    `Email: ${g("contact_email")}`,
    `Phone: ${g("contact_phone")}`,
    `Payment method: ${method ? `${method.group} - ${method.label}` : "Not selected"}`,
    "",
    "Services",
    ...items.map((l) => `- ${l.service.name} × ${l.qty} — ${formatPHP(l.lineTotal)}`),
    "",
    `Subtotal: ${formatPHP(t.subtotal)}`,
    `VAT (12%): ${formatPHP(t.vat)}`,
    `Total: ${formatPHP(t.total)}`,
    "",
    `Plans change: cancel within 7 days and ${formatPHP(t.total * 0.8)} comes back to you; the ${formatPHP(t.total * 0.2)} balance covers pilot and airspace processing.`,
    "",
    "Questions? Reply to this email or call +63 917 000 0000, Mon–Sat 8am–6pm.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function emptyView() {
  app.innerHTML = `<section class="center-empty">
    <h1>Your booking list is empty</h1>
    <p class="muted">Add a survey service before you schedule a flight.</p>
    <a href="services.html" class="btn btn-solid">Browse services${arrow()}</a>
  </section>`;
}

function formView() {
  const sub = cart.subtotal();
  const t = totals(sub);
  const minDate = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const startedAt = Date.now(); // the server rejects submissions faster than a human can type
  const first = METHODS[0].id;

  app.innerHTML = `<section class="page"><div class="container">
    <div class="checkout-head">
      <a href="cart.html" class="text-link">← Back to booking list</a>
      <h1 class="page-title">Confirm your booking</h1>
    </div>

    <form class="split checkout" id="checkout">
      <div class="form-col">
        <fieldset>
          <legend><span>01</span>Booking contact</legend>
          <div class="fields two">
            ${field("Contact name", `<input class="input" name="contact_name" required autocomplete="name" placeholder="Paolo Reyes">`)}
            ${field("Company (optional)", `<input class="input" name="company_name" autocomplete="organization" placeholder="Marcelo Construction Corp.">`)}
            ${field("Email", `<input class="input" name="contact_email" type="email" required autocomplete="email" placeholder="paolo@marceloconstruction.ph">`)}
            ${field("Mobile (for flight-day calls)", `<input class="input" name="contact_phone" type="tel" required autocomplete="tel" placeholder="0918 244 7788" pattern="${PH_MOBILE}" title="PH mobile number, e.g. 0918 244 7788">`)}
          </div>
        </fieldset>

        <fieldset>
          <legend><span>02</span>Survey site</legend>
          <div class="fields">
            ${field("Site address", `<input class="input" name="site_address" required placeholder="Phase 2, Vermosa, Dasmariñas, Cavite">`)}
            ${field("Site contact person (if different)", `<input class="input" name="site_contact" placeholder="Engr. Maria Santos · 0917 555 1234">`)}
            <div class="fields two">
              ${field("Survey type", `<select class="input" name="survey_type" required><option value="" disabled selected>Select survey type</option><option>Progress photos</option><option>Stockpile volumes</option><option>Topographic map</option></select>`)}
              ${field("Site area (hectares)", `<input class="input" name="site_area" type="number" min="0.1" step="0.1" placeholder="2.5">`)}
            </div>
            <div class="fields two">
              ${field("Region", `<select class="input" name="site_region" required><option value="" disabled selected>Select region</option>${REGIONS.map((r) => `<option>${r}</option>`).join("")}</select>`)}
              ${field("Preferred survey date", `<input class="input" name="survey_date" type="date" required min="${minDate}">`)}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend><span>03</span>Payment method</legend>
          <div class="methods" role="radiogroup">
            ${PAYMENT_GROUPS.map(
              (g) => `<h3 class="method-group">${g.title}</h3>
              ${g.methods
                .map(
                  (m) => `<label class="method ${m.id === first ? "active" : ""}">
                <input type="radio" name="method" value="${m.id}" class="sr-only" ${m.id === first ? "checked" : ""}>
                <span class="method-icon">${m.badge}</span>
                <span class="method-text"><strong>${m.label}</strong><small>${m.hint}</small></span>
                <span class="radio"></span>
              </label>`,
                )
                .join("")}`,
            ).join("")}
          </div>
        </fieldset>
        <input class="sr-only" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      </div>

      <aside>
        <div class="summary">
          <h2>Booking summary</h2>
          <ul class="order-lines">${items
            .map((l) => `<li><span>${l.service.name} <span class="x">× ${l.qty}</span></span><span class="tabular strong">${formatPHP(l.lineTotal)}</span></li>`)
            .join("")}</ul>
          ${cart.totalsHTML(sub)}
          <p class="note">Plans change? Cancel within 7 days from the link in your email and ${formatPHP(t.total * 0.8)} comes back — the ${formatPHP(t.total * 0.2)} balance covers pilot and airspace processing.</p>
          <button type="submit" class="btn btn-solid btn-full" id="pay">${icon("lock")} Confirm booking — ${formatPHP(t.total)}</button>
          <p class="note" id="mail-status" role="status">This is a demo payment. The booking email is real and reaches your inbox.</p>
        </div>
      </aside>
    </form>
  </div></section>`;

  const form = document.getElementById("checkout");

  form.addEventListener("change", (e) => {
    if (e.target.name !== "method") return;
    form.querySelectorAll(".method").forEach((el) => el.classList.toggle("active", el.querySelector("input").checked));
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
    const refundUrl = new URL("refund.html", location.href);
    refundUrl.searchParams.set("ref", orderId);
    refundUrl.searchParams.set(
      "order",
      encodeOrder({
        id: orderId,
        items: items.map((l) => ({ name: l.service.name, unit: l.service.unit, qty: l.qty, price: l.service.price })),
        subtotal: t.subtotal,
        vat: t.vat,
        total: t.total,
        method: method ? `${method.group} - ${method.label}` : "Not selected",
      }),
    );
    pay.disabled = true;
    pay.innerHTML = `${icon("loader", "spin")} Confirming your slot…`;
    paying = true;

    let mail;
    try {
      mail = await sendEmail(
        {
          to: data.get("contact_email"),
          subject: `DroneBuild booking ${orderId} — we'll call within 24 hours`,
          message: orderMessage(data, method, items, t, orderId),
          website: data.get("website") || "",
          cta: { label: "Request a refund", href: refundUrl.href },
        },
        startedAt,
      );
    } catch (err) {
      // no order placed and no redirect, so the customer never sees a false "confirmation"
      status.textContent = `${note} ${err.message}`;
      pay.innerHTML = `${icon("lock")} Confirm booking — ${formatPHP(t.total)}`;
      pay.disabled = false;
      paying = false;
      return;
    }

    // payment stays mock
    setTimeout(() => {
      cart.placeOrder({
        id: orderId,
        name: data.get("contact_name"),
        email: data.get("contact_email"),
        method: method?.label || "Not selected",
        items: items.map((l) => ({ name: l.service.name, qty: l.qty, price: l.service.price })),
        ...t,
        buyerEmailFailed: mail.buyerEmailFailed === true,
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

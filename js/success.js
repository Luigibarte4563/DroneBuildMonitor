import "./layout.js";
import { getLastOrder } from "./cart.js";
import { formatPHP } from "./data.js";
import { arrow } from "./icons.js";

const app = document.getElementById("app");
const order = getLastOrder();

app.innerHTML = !order
  ? `<section class="center-empty"><h1>No recent order</h1><a href="services.html" class="btn btn-solid">Browse services${arrow()}</a></section>`
  : `<section class="success bg-grid"><div class="container">
      <div class="check-circle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </div>
      <p class="order-id">Booking ${order.id}</p>
      <h1>Booking request received</h1>
      <p class="lead">We sent a confirmation to <strong>${order.email}</strong>. We'll call you within 24 hours to schedule the flight.</p>
      <div class="receipt">
        <div class="receipt-head">
          <span class="logo logo-mark" role="img" aria-label="DroneBuild Monitor"></span>
          <span class="chip">Demo payment · ${order.method}</span>
        </div>
        <ul class="order-lines">${order.items
          .map((i) => `<li><span>${i.name} <span class="x">× ${i.qty}</span></span><span class="tabular">${formatPHP(i.price * i.qty)}</span></li>`)
          .join("")}</ul>
        <dl class="totals">
          <div><dt>Subtotal</dt><dd>${formatPHP(order.subtotal)}</dd></div>
          <div><dt>VAT (12%)</dt><dd>${formatPHP(order.vat)}</dd></div>
          <div class="grand"><dt>Total</dt><dd>${formatPHP(order.total)}</dd></div>
        </dl>
      </div>
      <div class="btn-row">
        <a href="index.html" class="btn btn-solid">Back to home${arrow()}</a>
        <a href="services.html" class="btn btn-outline">View services</a>
      </div>
    </div></section>`;

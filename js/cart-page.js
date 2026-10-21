import { badgesHTML } from "./layout.js";
import * as cart from "./cart.js";
import { formatPHP } from "./data.js";
import { icon, arrow } from "./icons.js";

const app = document.getElementById("app");

function render() {
  const items = cart.lines();
  const body = items.length
    ? `<div class="split cart">
        <ul class="cart-rows">${items
          .map(
            (l) => `<li><div class="cart-row">
              <div class="thumb"><img src="${l.service.image}" alt=""><span>${l.service.index}</span></div>
              <div class="cart-row-info">
                <div class="line-top">
                  <div><h2>${l.service.name}</h2><p class="line-unit">${formatPHP(l.service.price)} ${l.service.unit}</p></div>
                  <button type="button" class="icon-btn" data-remove="${l.id}" aria-label="Remove ${l.service.name}">${icon("trash")}</button>
                </div>
                <div class="line-bottom">${cart.qtyHTML(l.id, l.qty)}<span class="line-total">${formatPHP(l.lineTotal)}</span></div>
              </div>
            </div></li>`,
          )
          .join("")}</ul>
        <aside>
          <div class="summary">
            <h2>Booking summary</h2>
            ${cart.totalsHTML(cart.subtotal())}
            <a href="checkout.html" class="btn btn-solid btn-full">Proceed to schedule</a>
            <div><p class="summary-label">We accept</p>${badgesHTML()}</div>
          </div>
        </aside>
      </div>`
    : `<div class="page-empty">
        <div class="empty-icon">${icon("bag")}</div>
        <h2>Your booking list is empty</h2>
        <p>Add a survey service to plan your flight.</p>
        <a href="services.html" class="btn btn-solid">Browse services${arrow()}</a>
      </div>`;

  app.innerHTML = `<section class="page"><div class="container">
      <div class="page-title-row">
        <h1 class="page-title">Booking list</h1>
        ${items.length ? `<button type="button" class="text-link" id="clear">Clear list</button>` : ""}
      </div>
      ${body}
    </div></section>`;
}

render();
document.addEventListener("cart:change", render);
app.addEventListener("click", (e) => e.target.id === "clear" && cart.clear());

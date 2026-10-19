import { SERVICES, formatPHP } from "./data.js";
import { icon, fillIcons } from "./icons.js";
import * as cart from "./cart.js";

const LINKS = [
  { href: "index.html#about", label: "About" },
  { href: "services.html", label: "Services" },
  { href: "index.html#coverage", label: "Coverage" },
  { href: "index.html#work", label: "Work" },
];

const PAYMENTS = ["GCash", "Maya", "Visa", "Mastercard", "BDO", "BPI", "Cash on site"];

const PHOTO_IDS = ["shCuG0EOZnE", "oQEXe-7d2sM", "KDZBdPFTBfg", "yWBIdNvlY7Q", "gxV05Fccnu4", "IMqe5dTKBLI", "PAf9rj_DKCU", "fvPfMJL2wKw", "XsUWk9pfBIc"];

const page = location.pathname.split("/").pop() || "index.html";

export const badgesHTML = () => `<ul class="badges">${PAYMENTS.map((m) => `<li>${m}</li>`).join("")}</ul>`;

/* header */
function header() {
  const links = LINKS.map((l) => `<a href="${l.href}" class="${l.href === page ? "active" : ""}">${l.label}</a>`);
  return `<nav class="nav">
      <a href="index.html" class="brand">
        <span class="logo logo-mark" role="img" aria-label="DroneBuild Monitor"></span>
        <span class="brand-text"><span class="brand-name">DroneBuild</span><span class="brand-sub">Monitor</span></span>
      </a>
      <div class="nav-links">${links.join("")}</div>
      <div class="nav-actions">
        <button type="button" class="cart-btn" data-open-cart aria-label="Open cart">
          ${icon("bag")}<span class="cart-btn-label">Cart</span><span class="cart-count">0</span>
        </button>
        <button type="button" class="icon-btn menu-btn" aria-label="Open menu" aria-expanded="false">${icon("menu")}</button>
      </div>
    </nav>
    <div class="mobile-menu" hidden>${LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("")}</div>`;
}

/* footer */
function footer() {
  const credits = PHOTO_IDS.map((id, i) => `<a href="https://unsplash.com/photos/${id}" target="_blank" rel="noreferrer">${i + 1}</a>`).join(" · ");
  return `<div class="footer-grid-bg" aria-hidden="true"></div>
    <div class="container footer-top">
      <div>
        <span class="logo logo-full" role="img" aria-label="DroneBuild Monitor"></span>
        <p class="footer-blurb">Drone monitoring for construction sites in the Philippines.</p>
      </div>
      <div>
        <h4>Services</h4>
        <ul class="footer-list">${SERVICES.map((s) => `<li><a href="services.html">${s.name}</a></li>`).join("")}</ul>
      </div>
      <div>
        <h4>Contact</h4>
        <ul class="footer-list">
          <li>hello@dronebuild.ph</li><li>+63 917 000 0000</li><li>Quezon City, Metro Manila</li><li>Mon–Sat · 8AM–6PM</li>
        </ul>
      </div>
      <div>
        <h4>We accept</h4>
        ${badgesHTML()}
        <h4 class="gap">Coverage</h4>
        <p class="footer-list">Philippines only: Luzon, Visayas and Mindanao.</p>
      </div>
    </div>
    <div class="container"><p class="footer-word" aria-hidden="true">DroneBuild</p></div>
    <div class="container footer-bottom">
      <p>© ${new Date().getFullYear()} DroneBuild Monitor. Demo site. No real payments.</p>
      <p>Photos from ${credits} on Unsplash</p>
    </div>`;
}

/* cart drawer */
function drawerBody() {
  const items = cart.lines();
  if (!items.length) {
    return `<div class="empty">
      <div class="empty-icon">${icon("bag")}</div>
      <p class="empty-title">Your cart is empty</p>
      <p>Add a service to get started.</p>
      <a href="services.html" class="btn btn-solid">Browse services</a>
    </div>`;
  }
  const rows = items
    .map(
      (l) => `<li class="line">
        <div class="thumb"><img src="${l.service.image}" alt=""><span>${l.service.index}</span></div>
        <div class="line-info">
          <div class="line-top">
            <div><p class="line-name">${l.service.name}</p><p class="line-unit">${formatPHP(l.service.price)} ${l.service.unit}</p></div>
            <button type="button" class="icon-btn sm" data-remove="${l.id}" aria-label="Remove ${l.service.name}">${icon("trash")}</button>
          </div>
          <div class="line-bottom">${cart.qtyHTML(l.id, l.qty)}<span class="line-total">${formatPHP(l.lineTotal)}</span></div>
        </div>
      </li>`,
    )
    .join("");
  return `<ul class="drawer-list">${rows}</ul>
    <div class="drawer-foot">
      ${cart.totalsHTML(cart.subtotal())}
      <div class="two">
        <a href="cart.html" class="btn btn-outline">View cart</a>
        <a href="checkout.html" class="btn btn-solid">Checkout</a>
      </div>
    </div>`;
}

function drawer() {
  return `<button type="button" class="drawer-backdrop" data-close-cart aria-label="Close cart"></button>
    <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="Your cart">
      <div class="drawer-head">
        <h2>Your cart</h2>
        <button type="button" class="icon-btn" data-close-cart aria-label="Close cart">${icon("x")}</button>
      </div>
      <div class="drawer-body"></div>
    </aside>`;
}

export function openCart(open = true) {
  document.querySelector(".drawer").classList.toggle("open", open);
  document.body.classList.toggle("locked", open);
}

function refresh() {
  const n = cart.count();
  document.querySelector(".cart-count").textContent = n;
  document.querySelector(".cart-btn").setAttribute("aria-label", n ? `Open cart, ${n} items` : "Open cart");
  document.querySelector(".drawer-body").innerHTML = drawerBody();
}

/* mount */
document.getElementById("header").outerHTML = `<header class="header">${header()}</header>`;
document.getElementById("footer").outerHTML = `<footer class="footer">${footer()}</footer>`;
document.body.insertAdjacentHTML("beforeend", `<div class="drawer">${drawer()}</div>`);
refresh();
fillIcons();
document.addEventListener("cart:change", refresh);

// mobile menu
const menuBtn = document.querySelector(".menu-btn");
const menu = document.querySelector(".mobile-menu");
menuBtn.addEventListener("click", () => {
  const open = menu.hidden;
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", open);
  menuBtn.innerHTML = icon(open ? "x" : "menu");
});
menu.addEventListener("click", (e) => {
  if (e.target.closest("a")) menuBtn.click();
});

// open / close drawer
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-cart]")) openCart(true);
  if (e.target.closest("[data-close-cart]") || e.target.closest(".drawer a")) openCart(false);

  // add to cart buttons
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    cart.add(addBtn.dataset.add);
    addBtn.innerHTML = `${icon("check")} Added to cart`;
    setTimeout(() => openCart(true), 350);
    setTimeout(() => (addBtn.innerHTML = `${icon("plus")} Add to cart`), 1600);
  }
});
document.addEventListener("keydown", (e) => e.key === "Escape" && openCart(false));

import { SERVICES, formatPHP } from "./data.js";
import { icon } from "./icons.js";

// service cards with add-to-booking buttons
export function renderServices(el) {
  el.innerHTML = SERVICES.map(
    (s, i) => `<div data-fade data-delay="${i * 100}">
      <article class="card ${s.featured ? "featured" : ""}">
        <div class="card-media zoom-parent">
          <div class="photo"><img src="${s.image}" alt="${s.name}" loading="lazy"></div>
          <span class="pill index">${s.index}</span>
          ${s.badge ? `<span class="pill badge">${s.badge}</span>` : ""}
        </div>
        <div class="card-body">
          <h3>${s.name}</h3>
          <p class="card-desc">${s.description}</p>
          <p class="price">${formatPHP(s.price)}</p>
          <p class="unit">${s.unit}</p>
          <ul class="features">${s.features.map((f) => `<li>${icon("check")}<span>${f}</span></li>`).join("")}</ul>
          <button type="button" class="btn ${s.featured ? "btn-paper" : "btn-solid"} btn-full add" data-add="${s.id}">${icon("plus")} Add to booking</button>
        </div>
      </article>
    </div>`,
  ).join("");
}

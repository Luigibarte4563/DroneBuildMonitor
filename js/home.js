import "./layout.js";
import { renderServices } from "./services-grid.js";
import { initMotion, onScroll } from "./motion.js";

renderServices(document.getElementById("services-grid"));
initMotion();

const clamp = (n) => Math.min(Math.max(n, 0), 1);

// hero photo parallax
const heroPhoto = document.querySelector(".hero-photo");
const heroInner = heroPhoto.querySelector(".photo");
onScroll(() => {
  const r = heroPhoto.getBoundingClientRect();
  const p = clamp((innerHeight - r.top) / (innerHeight + r.height));
  heroInner.style.transform = `translateY(${-8 + 16 * p}%)`;
});

// process line fills as you scroll
const steps = document.querySelector(".steps-wrap");
const fill = steps.querySelector(".track-fill");
onScroll(() => {
  const r = steps.getBoundingClientRect();
  const p = clamp((innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.2));
  fill.style.transform = `scaleX(${p})`;
});

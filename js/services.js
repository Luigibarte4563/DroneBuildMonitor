import "./layout.js";
import { SERVICES, formatPHP } from "./data.js";
import { icon } from "./icons.js";
import { renderServices } from "./services-grid.js";
import { initMotion } from "./motion.js";

// which service includes what (aerial, mapping, full)
const COMPARE = [
  ["Photos and 4K video", [1, 0, 1]],
  ["Close-ups of problem areas", [1, 0, 1]],
  ["Top-down site map", [0, 1, 1]],
  ["3D model and contours", [0, 1, 1]],
  ["Area and volume measurements", [0, 1, 1]],
  ["Progress comparison by date", [0, 0, 1]],
  ["Monthly report", [0, 0, 1]],
  ["One contact person", [0, 0, 1]],
];

const head = SERVICES.map(
  (s) => `<th class="${s.featured ? "hl-head" : ""}"><strong>${s.name}</strong><span>${formatPHP(s.price)} <small>/ ${s.unit}</small></span></th>`,
).join("");

const rows = COMPARE.map(
  ([feature, has]) =>
    `<tr><td>${feature}</td>${has
      .map((h, i) => `<td class="${SERVICES[i].featured ? "hl" : ""}">${h ? icon("check", "yes") : icon("minus", "no")}</td>`)
      .join("")}</tr>`,
).join("");

document.getElementById("compare").innerHTML = `<thead><tr><th>Feature</th>${head}</tr></thead><tbody>${rows}</tbody>`;

renderServices(document.getElementById("services-grid"));
initMotion();

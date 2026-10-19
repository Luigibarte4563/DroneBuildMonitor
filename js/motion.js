const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// split [data-words] headings into masked words; "|" starts a new line
function splitWords(el) {
  const text = el.textContent.trim();
  const base = Number(el.dataset.delay || 0);
  let i = 0;
  el.setAttribute("aria-label", text.replace(/\s*\|\s*/g, " "));
  el.innerHTML = text
    .split("|")
    .map((line) => {
      const words = line.trim().split(/\s+/);
      const html = words
        .map((w, wi) => `<span class="word" aria-hidden="true"><span style="transition-delay:${base + i++ * 60}ms">${w}${wi < words.length - 1 ? "&nbsp;" : ""}</span></span>`)
        .join("");
      return `<span class="reveal-line">${html}</span>`;
    })
    .join("");
}

// count up numbers in [data-count]
function countUp(el) {
  const end = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals || 0);
  const fmt = (n) => n.toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (reduce) return (el.textContent = fmt(end));
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / 2000, 1);
    el.textContent = fmt(end * (1 - Math.pow(1 - t, 4)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initMotion(root = document) {
  root.querySelectorAll("[data-words]").forEach(splitWords);
  root.querySelectorAll("[data-fade][data-delay]").forEach((el) => (el.style.transitionDelay = `${el.dataset.delay}ms`));

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        if (entry.target.dataset.count) countUp(entry.target);
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  root.querySelectorAll("[data-words], [data-fade], [data-count]").forEach((el) => io.observe(el));
}

// card spotlight follows the cursor
document.addEventListener("pointermove", (e) => {
  const card = e.target.closest?.(".card");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--x", `${e.clientX - r.left}px`);
  card.style.setProperty("--y", `${e.clientY - r.top}px`);
});

// run fn on scroll, once per frame
export function onScroll(fn) {
  if (reduce) return;
  let queued = false;
  const run = () => {
    queued = false;
    fn();
  };
  addEventListener("scroll", () => {
    if (!queued) requestAnimationFrame(run), (queued = true);
  }, { passive: true });
  run();
}

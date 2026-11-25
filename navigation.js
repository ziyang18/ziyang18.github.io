const links = Array.from(document.querySelectorAll(".navigation a"));
const sections = links.map(link => document.querySelector(link.hash));
const masthead = document.querySelector(".masthead");
const languageSwitch = document.querySelector(".language-switch");
let scheduled = false;

function updateNavigation() {
  scheduled = false;
  const threshold = masthead.offsetHeight + 56;
  let active = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= threshold) active = section;
  }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 3) {
    active = sections[sections.length - 1];
  }
  for (const link of links) {
    if (link.hash === "#" + active.id) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  if (languageSwitch) {
    const target = document.getElementById(location.hash.slice(1));
    // Keep a precise paper link while reading it, even when its year is collapsed
    // on the other page. A reader who scrolls elsewhere stays in their new section.
    const fragment = target && active.contains(target)
      ? location.hash
      : window.scrollY > masthead.offsetHeight ? "#" + active.id : "";
    if (languageSwitch.hash !== fragment) languageSwitch.hash = fragment;
  }
}

function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(updateNavigation);
}

function openPaperYear(hash) {
  if (!hash) return;
  let id;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  const target = document.getElementById(id);
  const year = target?.closest("details.paper-year:not([open])");
  if (!year || target.closest("summary") === year.querySelector("summary")) return;
  year.open = true;
  return target;
}

// Open the group before the browser follows the link, including repeat clicks
// on the current fragment. The native anchor still controls focus and history.
document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const link = event.target.closest?.("a[href]:not([download])");
  if (!link || (link.target && link.target !== "_self")) return;
  if (link.origin === location.origin && link.pathname === location.pathname && link.search === location.search) {
    openPaperYear(link.hash);
  }
});

function revealLocation() {
  const hash = location.hash;
  const target = openPaperYear(hash);
  if (target) {
    requestAnimationFrame(() => {
      if (location.hash === hash) target.scrollIntoView({ block: "start" });
    });
  }
}

function animateEntries() {
  if (!window.IntersectionObserver || !Element.prototype.animate) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const running = new Set();
  const observer = new IntersectionObserver(entries => {
    let order = 0;
    for (const entry of entries) {
      const element = entry.target;
      if (!entry.isIntersecting || !entry.intersectionRect.height || element.closest("details:not([open])")) continue;
      observer.unobserve(element);
      if (reducedMotion.matches) continue;
      const animation = element.animate([
        { opacity: 0.62, translate: "0 9px" },
        { opacity: 1, translate: "0 0" }
      ], {
        duration: 310,
        delay: Math.min(order++, 3) * 35,
        easing: "cubic-bezier(0.18, 0.72, 0.3, 1)",
        fill: "backwards"
      });
      running.add(animation);
      animation.onfinish = animation.oncancel = () => running.delete(animation);
    }
  }, { threshold: 0.03 });
  for (const element of document.querySelectorAll(".section-heading, .paper, .news-list li, .education-list li")) {
    observer.observe(element);
  }
  reducedMotion.addEventListener("change", event => {
    if (event.matches) for (const animation of running) animation.cancel();
  });
}

window.addEventListener("scroll", scheduleUpdate, { passive: true });
window.addEventListener("resize", scheduleUpdate);
window.addEventListener("load", updateNavigation);
window.addEventListener("pageshow", revealLocation);
window.addEventListener("popstate", revealLocation);
window.addEventListener("hashchange", revealLocation);
document.addEventListener("toggle", scheduleUpdate, true);
revealLocation();
updateNavigation();
animateEntries();

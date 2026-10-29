// =================================================================
// MODERN OLYMPOS — landing.js
// =================================================================
// Hero artwork behavior only. Public directory queries live in international-client.js;
// classroom forms and authentication UI remain separate in app.js.

const SLIDE_INTERVAL_MS = 6000;

const slides = document.querySelectorAll(".hero-slide");
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

if (slides.length > 1 && !prefersReducedMotion) {
  let activeIndex = 0;

  setInterval(() => {
    const nextIndex = (activeIndex + 1) % slides.length;
    slides[activeIndex].classList.remove("is-active");
    slides[nextIndex].classList.add("is-active");
    activeIndex = nextIndex;
  }, SLIDE_INTERVAL_MS);
}
// If the visitor has requested reduced motion, we simply leave the
// first slide (already marked .is-active in the HTML) showing and
// never start the interval — no crossfade, no motion at all.

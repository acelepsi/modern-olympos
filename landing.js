// =================================================================
// MODERN OLYMPOS — landing.js
// =================================================================
// Deliberately separate from app.js: the landing page never touches
// Firebase or the login modal, so there's no reason to load the
// Firebase SDK or run session logic here — this keeps the first
// screen a visitor sees fast and dependency-free, and avoids console
// errors from app.js querying for DOM elements (composer forms, the
// jury vote form, etc.) that don't exist on this page.
//
// All it does: cross-fade through the .hero-slide elements.
// =================================================================

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

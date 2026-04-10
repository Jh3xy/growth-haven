
// Growth Haven reusuables functions and helpers

// CountDown Helpers
/**
 * Updates a single countdown span.
 * Only fires the tick animation when the value actually changes —
 * so days/hours/mins don't animate every second unnecessarily.
 */
export function updateEl(el, newVal) {
  if (el.textContent === newVal) return;

  el.textContent = newVal;

  // Remove first so re-adding always retriggers the animation,
  // even if the previous one hasn't fully finished (e.g. on fast ticks).
  el.classList.remove('ticking');
  void el.offsetWidth; // force reflow — required to restart a CSS animation
  el.classList.add('ticking');

  el.addEventListener('animationend', () => {
    el.classList.remove('ticking');
  }, { once: true });
}


export function isValidEmail(val) {
  // Catches most typos without being overkill
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}
 
export function isValidPhone(val) {
  // Strips formatting chars, checks for 7–15 digits (ITU-T E.164 range)
  return /^\d{7,15}$/.test(val.replace(/[\s\-().+]/g, ''));
}


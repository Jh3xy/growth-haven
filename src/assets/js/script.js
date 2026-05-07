/**
 * GrowthHaven — Main Entry
 * CSS imports handled here via Vite
 */

// ---- CSS Imports ----
import "../styles/fonts.css";
import "../styles/variables.css";
import "../styles/utils.css";
import "../styles/style.css";
import "../styles/animations.css";
import "../styles/landing.css";
import "../styles/queries.css";

// JS Imports
import { supabase } from "./supabase.js";
import { isValidEmail, isValidPhone } from "./utils.js";

const THEME_STORAGE_KEY = "gh_theme";
const THEME_ATTRIBUTE = "data-theme";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
let themeMediaQuery;
let hasBoundThemeMediaListener = false;

function getThemeMediaQuery() {
  if (!window.matchMedia) return null;
  if (!themeMediaQuery) {
    themeMediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
  }
  return themeMediaQuery;
}

function getSystemTheme() {
  return getThemeMediaQuery()?.matches ? "dark" : "light";
}

export function getTheme() {
  return (
    document.documentElement.getAttribute(THEME_ATTRIBUTE) ||
    getStoredTheme() ||
    getSystemTheme()
  );
}

export function getStoredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
}

function updateThemeToggleButtons(theme, root = document) {
  root.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const isDark = theme === "dark";
    const label = button.querySelector("[data-theme-label]");

    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
    button.setAttribute(
      "title",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
    button.dataset.themeState = theme;

    if (label) {
      label.textContent = isDark ? "Light mode" : "Dark mode";
    }
  });
}

export function applyTheme(theme, { persist = true, root = document } = {}) {
  const resolvedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
  updateThemeToggleButtons(resolvedTheme, root);

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  }

  window.dispatchEvent(
    new CustomEvent("gh:themechange", { detail: { theme: resolvedTheme } }),
  );
  return resolvedTheme;
}

export function toggleTheme() {
  const nextTheme = getTheme() === "dark" ? "light" : "dark";
  return applyTheme(nextTheme);
}

function syncThemeWithSystemPreference() {
  if (getStoredTheme()) return;
  applyTheme(getSystemTheme(), { persist: false });
}

function bindSystemThemeListener() {
  if (hasBoundThemeMediaListener) return;

  const mediaQuery = getThemeMediaQuery();
  if (!mediaQuery) return;

  const handleThemeChange = () => syncThemeWithSystemPreference();
  mediaQuery.addEventListener("change", handleThemeChange);
  hasBoundThemeMediaListener = true;
}

export function initThemeToggle(root = document) {
  const initialTheme = getStoredTheme() || getSystemTheme();
  applyTheme(initialTheme, { persist: false, root });

  root.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.themeBound === "true") return;

    button.addEventListener("click", () => {
      toggleTheme();
    });

    button.dataset.themeBound = "true";
  });

  bindSystemThemeListener();
}

function initializeSharedThemeUi() {
  initThemeToggle();

  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;

    const nextTheme = event.newValue === "dark" ? "dark" : "light";
    applyTheme(nextTheme, { persist: false });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSharedThemeUi, {
    once: true,
  });
} else {
  initializeSharedThemeUi();
}

/**
 * Countdown Timer
 *
 * Fixed launch date: May 13, 2026 at midnight (local time).
 * Every visitor sees the real remaining time from this moment.
 * To change the date, edit only this line.
 */
const LAUNCH_DATE = new Date("2026-05-13T00:00:00");

const els = {
  days: document.getElementById("cd-days"),
  hours: document.getElementById("cd-hours"),
  mins: document.getElementById("cd-mins"),
  secs: document.getElementById("cd-secs"),
};

/** Zero-pads a number to 2 digits: 4 → "04" */
function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * Updates a single countdown span.
 * Only fires the tick animation when the value actually changes —
 * so days/hours/mins don't animate every second unnecessarily.
 */
export function updateEl(el, newVal) {
  if (el) {
    if (el.textContent === newVal) return;
  }

  if (el) {
    el.textContent = newVal;
  }

  // Remove first so re-adding always retriggers the animation,
  // even if the previous one hasn't fully finished (e.g. on fast ticks).
  if (el) {
    el.classList.remove("ticking");
    void el.offsetWidth; // force reflow — required to restart a CSS animation
    el.classList.add("ticking");

    el.addEventListener(
      "animationend",
      () => {
        el.classList.remove("ticking");
      },
      { once: true },
    );
  }
}

/** Called every second. Calculates remaining time and updates the DOM. */
function tick() {
  const remaining = LAUNCH_DATE - Date.now();

  // ---- Launch day reached ----
  if (remaining <= 0) {
    Object.values(els).forEach((el) => {
      el.textContent = "00";
      el.classList.remove("ticking");
      el.classList.add("launched"); // triggers blink — see animations.css
    });
    clearInterval(timer);
    return;
  }

  // ---- Calculate units ----
  const totalSecs = Math.floor(remaining / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  updateEl(els.days, pad(days));
  updateEl(els.hours, pad(hours));
  updateEl(els.mins, pad(mins));
  updateEl(els.secs, pad(secs));
}

// Run once immediately so there's no 1-second blank on load,
// then update every second.
tick();
const timer = setInterval(tick, 1000);

// ============================================================
//  FORM VALIDATION + SUCCESS STATE
// ============================================================

const form = document.querySelector(".waitlist-form");
const nameInput = document.getElementById("text");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const card = document.querySelector(".waitlist-card");

// ---- Helpers ----

function showError(input, message) {
  input.classList.add("is-error");

  const err = document.createElement("p");
  err.className = "form-field__error";
  err.setAttribute("role", "alert"); // screen reader will announce this
  err.textContent = message;

  input.insertAdjacentElement("afterend", err);
}

function clearErrors() {
  document.querySelectorAll(".form-field__error").forEach((el) => el.remove());
  [nameInput, emailInput, phoneInput].forEach((el) =>
    el.classList.remove("is-error"),
  );
}

// Inside script.js, around line 126
if (form && nameInput) {
  [nameInput, emailInput, phoneInput].forEach((input) => {
    // Only add listener if the specific input exists
    input?.addEventListener("input", () => {
      input.classList.remove("is-error");
      const next = input.nextElementSibling;
      if (next?.classList.contains("form-field__error")) next.remove();
    });
  });
}

// ---- Validation ----

function validate() {
  clearErrors();
  let valid = true;

  const nameVal = nameInput.value.trim();
  const emailVal = emailInput.value.trim();
  const phoneVal = phoneInput.value.trim();

  // Rule 1 — Name always required
  if (!nameVal) {
    showError(nameInput, "Your name is required.");
    valid = false;
  }

  // Rule 2 — At least one contact method required
  if (!emailVal && !phoneVal) {
    showError(emailInput, "Provide at least an email address or phone number.");
    valid = false;
  }

  // Rule 3 — Email format check (only if something was entered)
  if (emailVal && !isValidEmail(emailVal)) {
    showError(emailInput, "Enter a valid email address.");
    valid = false;
  }

  // Rule 4 — Phone format check (only if something was entered)
  if (phoneVal && !isValidPhone(phoneVal)) {
    showError(phoneInput, "Enter a valid phone number.");
    valid = false;
  }

  return valid;
}

// ---- Success State ----
const TELEGRAM_LINK = "https://t.me/+UHPnYhMx6aI3NzBk";
function showSuccess(firstName) {
  // Hide current card content
  const header = card.querySelector(".waitlist-card__header");
  const socialProof = card.querySelector(".social-proof");

  [header, form, socialProof].forEach((el) => {
    if (el) el.style.display = "none";
  });

  // Inject success message — fades in via .waitlist-success animation in landing.css
  const success = document.createElement("div");
  success.className = "waitlist-success";
  success.innerHTML = `
    <div class="waitlist-success__icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    
    <h2 class="waitlist-success__title">You're on the list, ${firstName}.</h2>
    
    <p class="waitlist-success__body">
      Your details have been logged. We'll be in touch shortly with the
      priority onboarding documentation prepared for you.
    </p>

    <div class="waitlist-success__tg-wrapper">
      <p class="tg-cta-text">Join our early bird community for real-time launch updates:</p>
      <a href="${TELEGRAM_LINK}" target="_blank" rel="noopener noreferrer" class="tg-join-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Join Telegram
      </a>
    </div>

    <div class="waitlist-success__badge badge-pill">
      <span class="badge-pill__dot"></span>
      <span class="badge-pill__label uppercase">Position secured</span>
    </div>
  `;

  card.appendChild(success);
}

// ---- Submit handler ----

// ---- Submit handler ----
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validate()) return;

    const submitBtn = form.querySelector(".cta-btn");
    // Save the original innerHTML so we don't lose your Lucide icon when reverting
    const originalBtnHTML = submitBtn.innerHTML;

    // 1. Set Loading State
    submitBtn.classList.add("disabled");
    submitBtn.innerText = "Securing Place...";

    const nameVal = nameInput.value.trim();
    // Pass null if empty so Supabase doesn't trigger a unique constraint error on empty strings
    const emailVal = emailInput.value.trim() || null;
    const phoneVal = phoneInput.value.trim() || null;

    // 2. Send Data to Supabase
    const { error } = await supabase
      .from("waitlist")
      .insert([{ name: nameVal, email: emailVal, phone: phoneVal }]);

    // 3. Handle Response
    if (error) {
      console.error("Supabase Error:", error);

      // Check if it's a unique constraint violation (they already signed up)
      if (error.code === "23505") {
        showError(emailInput, "This email is already on the waitlist!");
      } else {
        showError(
          emailInput,
          "There was an issue securing your place. Please try again.",
        );
      }

      // Revert button state on error so they can try again
      submitBtn.classList.remove("disabled");
      submitBtn.innerHTML = originalBtnHTML;
    } else {
      // Success! Grab first name for the success screen
      const firstName = nameVal.split(" ")[0];

      // Clear form inputs
      [nameInput, emailInput, phoneInput].forEach((el) => (el.value = ""));

      // Revert button state (optional since the form hides, but good practice)
      submitBtn.classList.remove("disabled");
      submitBtn.innerHTML = originalBtnHTML;

      // Trigger your success UI
      showSuccess(firstName);
    }
  });
}

// ---- Navbar scroll glass ----
const nav = document.getElementById("nav");

// ---- Mobile hamburger ----
const hamburger = document.getElementById("navHamburger");
const drawer = document.getElementById("navDrawer");

hamburger?.addEventListener("click", () => {
  const isOpen = drawer.classList.toggle("nav__drawer--open");
  hamburger.setAttribute("aria-expanded", String(isOpen));
  drawer.setAttribute("aria-hidden", String(!isOpen));
});

// Close drawer on drawer link click
drawer?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    drawer.classList.remove("nav__drawer--open");
    hamburger.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
  });
});

// ---- Testimonials marquee clone for seamless loop ----
const track = document.getElementById("testiTrack");
if (track) {
  // Clone all children and append so the marquee loops seamlessly
  const cards = Array.from(track.children);
  cards.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
  });
}

// ---- Marquee keyboard accessibility (left/right + pause) ----
const trackWrap = document.querySelector(".testi-track-wrap");
if (track && trackWrap) {
  let manualPaused = false;

  function parseTranslateX(matrix) {
    if (!matrix || matrix === "none") return 0;
    const m = matrix.match(/matrix(3d)?\((.+)\)/);
    if (!m) return 0;
    const values = m[2].split(",").map((s) => s.trim());
    if (m[1]) {
      // matrix3d
      return parseFloat(values[12]) || 0;
    }
    return parseFloat(values[4]) || 0;
  }

  function pauseTrack(freezeTransform = true) {
    const cs = window.getComputedStyle(track);
    const matrix = cs.transform || cs.webkitTransform || "none";
    if (freezeTransform && matrix && matrix !== "none") {
      const tx = parseTranslateX(matrix);
      track.style.transform = `translateX(${tx}px)`;
    }
    track.classList.add("is-paused");
  }

  function resumeTrack() {
    track.classList.remove("is-paused");
    track.style.transform = "";
  }

  function nudge(direction) {
    // direction: -1 (left) | 1 (right)
    pauseTrack(true);
    const cs = window.getComputedStyle(track);
    const matrix = cs.transform || "none";
    let tx = parseTranslateX(matrix);
    const card = track.querySelector(".testi-card");
    const gapStr = window.getComputedStyle(track).gap || "20px";
    const gap = parseFloat(gapStr) || 20;
    const cardWidth = card ? card.offsetWidth : 320;
    const delta = (cardWidth + gap) * direction;
    const newTx = tx - delta; // more negative moves left
    track.style.transform = `translateX(${newTx}px)`;
    manualPaused = true;
  }

  trackWrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudge(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nudge(1);
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (track.classList.contains("is-paused")) {
        resumeTrack();
        manualPaused = false;
      } else {
        pauseTrack();
        manualPaused = true;
      }
    }
  });

  trackWrap.addEventListener("focus", () => {
    pauseTrack();
  });
  trackWrap.addEventListener("blur", () => {
    if (!manualPaused) resumeTrack();
  });
  trackWrap.addEventListener("click", () => {
    if (track.classList.contains("is-paused")) {
      resumeTrack();
      manualPaused = false;
    } else {
      pauseTrack();
      manualPaused = true;
    }
  });

  // Make sure keyboard-focusable visual state is clear
  trackWrap.setAttribute("tabindex", trackWrap.getAttribute("tabindex") || "0");
}

// ---- Stats count-up on intersection ----
(function initStatsCountUp() {
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stats = Array.from(document.querySelectorAll(".stats__value"));
  if (!stats.length) return;

  const parseStat = (text) => {
    const str = (text || "").trim();
    // capture optional non-digit prefix, numeric part, optional non-digit suffix
    const m = str.match(/^(\D*)([\d][\d,\.]*)(\D*)$/);
    if (!m) return null;
    const prefix = m[1] || "";
    const numStr = m[2] || "";
    const suffix = m[3] || "";
    const value = parseFloat(numStr.replace(/,/g, ""));
    if (isNaN(value)) return null;
    return { prefix, value, suffix };
  };

  const formatNumber = (n) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

  const durationDefault = 1200; // ms

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.dataset.countAnimated) {
          obs.unobserve(el);
          return;
        }

        const parsed = parseStat(el.textContent);
        if (!parsed) {
          obs.unobserve(el);
          return;
        }

        const { prefix, value: targetValue, suffix } = parsed;
        el.dataset.countAnimated = "true";

        if (prefersReducedMotion) {
          el.textContent = prefix + formatNumber(targetValue) + suffix;
          obs.unobserve(el);
          return;
        }

        const duration = parseInt(el.dataset.duration, 10) || durationDefault;
        const start = 0;

        el.setAttribute("aria-live", "polite");

        let startTime = null;
        function step(ts) {
          if (startTime === null) startTime = ts;
          const elapsed = ts - startTime;
          const t = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
          const current = Math.round(start + (targetValue - start) * eased);
          el.textContent = prefix + formatNumber(current) + suffix;
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            el.textContent = prefix + formatNumber(targetValue) + suffix;
            el.removeAttribute("aria-live");
            obs.unobserve(el);
          }
        }

        requestAnimationFrame(step);
      });
    },
    { threshold: 0.5 },
  );

  stats.forEach((el) => {
    if (parseStat(el.textContent)) observer.observe(el);
  });
})();

  // ---- Staggered reveal for feature cards & testimonials ----
  function initStaggeredReveal() {
    const prefersReducedMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const groups = [
      {
        containerSelector: ".features__grid",
        itemSelector: ".feature-card",
        itemClass: "reveal--card",
        stagger: 120,
      },
      {
        // Target only original testimonial cards (clones are aria-hidden)
        containerSelector: ".testi-track-wrap",
        itemSelector: ".testi-card:not([aria-hidden=\"true\"])",
        itemClass: "reveal--simple",
        stagger: 90,
      },
    ];

    groups.forEach(({ containerSelector, itemSelector, itemClass, stagger }) => {
      document.querySelectorAll(containerSelector).forEach((container) => {
        if (!container) return;

        const observer = new IntersectionObserver(
          (entries, obs) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;

              const items = Array.from(container.querySelectorAll(itemSelector));
              if (!items.length) {
                obs.unobserve(container);
                return;
              }

              items.forEach((item, idx) => {
                if (item.dataset.revealed) return;

                item.classList.add("reveal", itemClass);
                const delay = idx * stagger;
                item.style.setProperty("--reveal-delay", `${delay}ms`);

                if (prefersReducedMotion) {
                  item.classList.add("revealed");
                  item.dataset.revealed = "true";
                } else {
                  setTimeout(() => {
                    item.classList.add("revealed");
                    item.dataset.revealed = "true";
                  }, delay);
                }
              });

              obs.unobserve(container);
            });
          },
          { threshold: 0.18 },
        );

        observer.observe(container);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStaggeredReveal, { once: true });
  } else {
    initStaggeredReveal();
  }


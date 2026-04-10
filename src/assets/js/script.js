

/**
 * GrowthHaven — Main Entry
 * CSS imports handled here via Vite
 */

// ---- CSS Imports ----
import '../styles/fonts.css'
import '../styles/variables.css'
import '../styles/utils.css'
import '../styles/style.css'
import '../styles/animations.css'
import '../styles/landing.css'
import '../styles/queries.css'

// JS Imports
import { supabase } from './supabase.js';
import { isValidEmail, isValidPhone, updateEl } from './utils.js'



/**
 * Countdown Timer
 * 
 * Fixed launch date: May 13, 2026 at midnight (local time).
 * Every visitor sees the real remaining time from this moment.
 * To change the date, edit only this line.
 */
const LAUNCH_DATE = new Date('2026-05-13T00:00:00');

const els = {
  days:  document.getElementById('cd-days'),
  hours: document.getElementById('cd-hours'),
  mins:  document.getElementById('cd-mins'),
  secs:  document.getElementById('cd-secs'),
};

/** Zero-pads a number to 2 digits: 4 → "04" */
function pad(n) {
  return String(n).padStart(2, '0');
}

/** Called every second. Calculates remaining time and updates the DOM. */
function tick() {
  const remaining = LAUNCH_DATE - Date.now();

  // ---- Launch day reached ----
  if (remaining <= 0) {
    Object.values(els).forEach(el => {
      el.textContent = '00';
      el.classList.remove('ticking');
      el.classList.add('launched'); // triggers blink — see animations.css
    });
    clearInterval(timer);
    return;
  }

  // ---- Calculate units ----
  const totalSecs  = Math.floor(remaining / 1000);
  const days       = Math.floor(totalSecs / 86400);
  const hours      = Math.floor((totalSecs % 86400) / 3600);
  const mins       = Math.floor((totalSecs % 3600) / 60);
  const secs       = totalSecs % 60;

  updateEl(els.days,  pad(days));
  updateEl(els.hours, pad(hours));
  updateEl(els.mins,  pad(mins));
  updateEl(els.secs,  pad(secs));
}

// Run once immediately so there's no 1-second blank on load,
// then update every second.
tick();
const timer = setInterval(tick, 1000);


// ============================================================
//  FORM VALIDATION + SUCCESS STATE
// ============================================================
 
const form       = document.querySelector('.waitlist-form');
const nameInput  = document.getElementById('text');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const card       = document.querySelector('.waitlist-card');
 
// ---- Helpers ----
 

 
function showError(input, message) {
  input.classList.add('is-error');
 
  const err = document.createElement('p');
  err.className = 'form-field__error';
  err.setAttribute('role', 'alert'); // screen reader will announce this
  err.textContent = message;
 
  input.insertAdjacentElement('afterend', err);
}
 
function clearErrors() {
  document.querySelectorAll('.form-field__error').forEach(el => el.remove());
  [nameInput, emailInput, phoneInput].forEach(el => el.classList.remove('is-error'));
}
 
// Clear a field's error the moment the user starts correcting it
[nameInput, emailInput, phoneInput].forEach(input => {
  input.addEventListener('input', () => {
    input.classList.remove('is-error');
    const next = input.nextElementSibling;
    if (next?.classList.contains('form-field__error')) next.remove();
  });
});
 
// ---- Validation ----
 
function validate() {
  clearErrors();
  let valid = true;
 
  const nameVal  = nameInput.value.trim();
  const emailVal = emailInput.value.trim();
  const phoneVal = phoneInput.value.trim();
 
  // Rule 1 — Name always required
  if (!nameVal) {
    showError(nameInput, 'Your name is required.');
    valid = false;
  }
 
  // Rule 2 — At least one contact method required
  if (!emailVal && !phoneVal) {
    showError(emailInput, 'Provide at least an email address or phone number.');
    valid = false;
  }
 
  // Rule 3 — Email format check (only if something was entered)
  if (emailVal && !isValidEmail(emailVal)) {
    showError(emailInput, 'Enter a valid email address.');
    valid = false;
  }
 
  // Rule 4 — Phone format check (only if something was entered)
  if (phoneVal && !isValidPhone(phoneVal)) {
    showError(phoneInput, 'Enter a valid phone number.');
    valid = false;
  }
 
  return valid;
}
 
// ---- Success State ----
 
function showSuccess(firstName) {
  // Hide current card content
  const header      = card.querySelector('.waitlist-card__header');
  const socialProof = card.querySelector('.social-proof');
 
  [header, form, socialProof].forEach(el => {
    if (el) el.style.display = 'none';
  });
 
  // Inject success message — fades in via .waitlist-success animation in landing.css
  const success = document.createElement('div');
  success.className = 'waitlist-success';
  success.innerHTML = `
    <div class="waitlist-success__icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h2 class="waitlist-success__title">You're on the list, ${firstName}.</h2>
    <p class="waitlist-success__body">
      Your details have been logged. We'll be in touch shortly with your
      priority onboarding documentation.
    </p>
    <div class="waitlist-success__badge badge-pill">
      <span class="badge-pill__dot"></span>
      <span class="badge-pill__label uppercase">Position secured</span>
    </div>
  `;
 
  card.appendChild(success);
}
 
// ---- Submit handler ----
 
// ---- Submit handler ----
 
form.addEventListener('submit', async (e) => {
  e.preventDefault();
 
  if (!validate()) return;

  const submitBtn = form.querySelector('.cta-btn');
  // Save the original innerHTML so we don't lose your Lucide icon when reverting
  const originalBtnHTML = submitBtn.innerHTML; 
 
  // 1. Set Loading State
  submitBtn.classList.add('disabled');
  submitBtn.innerText = 'Securing Place...'; 
 
  const nameVal = nameInput.value.trim();
  // Pass null if empty so Supabase doesn't trigger a unique constraint error on empty strings
  const emailVal = emailInput.value.trim() || null; 
  const phoneVal = phoneInput.value.trim() || null;
 
  // 2. Send Data to Supabase
  const { error } = await supabase
    .from('waitlist')
    .insert([
      { name: nameVal, email: emailVal, phone: phoneVal }
    ]);
 
  // 3. Handle Response
  if (error) {
    console.error('Supabase Error:', error);
    
    // Check if it's a unique constraint violation (they already signed up)
    if (error.code === '23505') {
      alert('This email is already on the waitlist!');
    } else {
      alert('There was an issue securing your place. Please try again.');
    }
    
    // Revert button state on error so they can try again
    submitBtn.classList.remove('disabled');
    submitBtn.innerHTML = originalBtnHTML; 
  } else {
    // Success! Grab first name for the success screen
    const firstName = nameVal.split(' ')[0];
   
    // Clear form inputs
    [nameInput, emailInput, phoneInput].forEach(el => (el.value = ''));
   
    // Revert button state (optional since the form hides, but good practice)
    submitBtn.classList.remove('disabled');
    submitBtn.innerHTML = originalBtnHTML;
    
    // Trigger your success UI
    showSuccess(firstName);
  }
});

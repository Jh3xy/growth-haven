

import '../assets/styles/register.css' // inherit register styles
import '../assets/styles/login.css'    // and add login-specific ones


import { signInUser } from '../assets/js/auth.js';

console.log('[auth]: loaded auth-login')

// ---- Password toggle ----
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.classList.toggle('is-visible');
  });
});

// ---- Helpers ----
const emailEl = document.getElementById('loginEmail');
const pwEl    = document.getElementById('loginPw');
const loginBtn = document.getElementById('loginBtn');

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function setError(input, errId, msg) {
  input.classList.add('is-error');
  document.getElementById(errId).textContent = msg;
}

function clearError(input, errId) {
  input.classList.remove('is-error');
  document.getElementById(errId).textContent = '';
}

emailEl.addEventListener('input', () => clearError(emailEl, 'err-email'));
pwEl.addEventListener('input',    () => clearError(pwEl,    'err-pw'));

// ---- Submit ----
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let valid = true;

  if (!emailEl.value.trim()) {
    setError(emailEl, 'err-email', 'Email is required.');
    valid = false;
  } else if (!isValidEmail(emailEl.value.trim())) {
    setError(emailEl, 'err-email', 'Enter a valid email address.');
    valid = false;
  }

  if (!pwEl.value) {
    setError(pwEl, 'err-pw', 'Password is required.');
    valid = false;
  }

  if (!valid) return;

  loginBtn.disabled = true;
  loginBtn.innerText = 'Signing In...';

  const { data, error } = await signInUser(emailEl.value.trim(), pwEl.value);

  if (error) {
    setError(pwEl, 'err-pw', 'Invalid email or password.');
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Sign In <i data-lucide="arrow-right"></i>';
    // Re-initialize lucide icons since innerHTML was changed
    if (window.lucide) window.lucide.createIcons();
  } else {
    loginBtn.innerText = 'Success! Redirecting...';
    window.location.href = '/src/dashboard/';
  }
});
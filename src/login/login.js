

import '../assets/styles/fonts.css'
import '../assets/styles/variables.css'
import '../assets/styles/utils.css'
import '../assets/styles/style.css'
import '../assets/styles/animations.css'
import '../assets/styles/landing.css'
import '../assets/styles/queries.css'
import '../assets/styles/login.css'    // and add login-specific ones


import { signInUser, getUserStatus } from '../assets/js/auth.js';

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
    if (window.lucide) window.lucide.createIcons();
  } else {
    loginBtn.innerText = 'Authenticating Profile...';
    
    // 1. Fetch the user's portal status
    const { data: profile, error: profileError } = await getUserStatus(data.user.id);

    loginBtn.innerText = 'Success! Redirecting...';

    // 2. Perform the Stratified Redirect
    setTimeout(() => {
      if (profile?.role === 'admin') {
        window.location.href = '/src/admin/';
      } else if (profile?.promoter) {
        window.location.href = '/src/affiliate/';
      } else {
        window.location.href = '/src/dashboard/';
      }
    }, 800);
  }
});

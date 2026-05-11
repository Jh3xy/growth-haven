

import '../assets/styles/login.css'    // and add login-specific ones

import posthog from 'posthog-js';
import { signInUser, getUserStatus } from '../assets/js/auth.js';

console.log('[auth]: loaded auth-login')

// Initialize PostHog for Error tracking and Feature Flags
posthog.init('phc_yTajNg3srP52CjfjDBAWnCNBLthdgHXcGzaV4x35CD8n', {
  api_host: 'https://us.i.posthog.com',
  defaults: '2026-01-30',
  autocapture: true,           // Tracks clicks/inputs automatically
  capture_pageview: true,      // Essential for seeing where users go
  capture_exceptions: true,    // Your "Paranoia" line — logs JS crashes to PostHog
  persistence: 'localStorage', // Better than cookies for keeping users "identified"
  loaded: function(ph) {       // Useful for debugging
    console.log("PostHog Loaded Successfully");
  }
})

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

  // PostHog Identify & Set Person Properties
  if (data?.user) {
    posthog.identify(data.user.id); 
    posthog.setPersonProperties({
      email: data.user.email,
      last_login: new Date().toISOString()
    });
  }

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

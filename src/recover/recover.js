

import '../assets/styles/register.css'


import { supabase } from '../assets/js/supabase.js';

// ─── DOM REFS ─────────────────────────────────────────────────
const slider       = document.getElementById('recoverSlider');
const progress     = document.getElementById('recoverProgress');

// Slide 1
const rcEmailForm  = document.getElementById('rcEmailForm');
const rcEmailEl    = document.getElementById('rcEmail');
const rcSendBtn    = document.getElementById('rcSendBtn');

// Slide 2
const rcOtpHint    = document.getElementById('rcOtpHint');
const rcOtpBoxes   = Array.from(document.querySelectorAll('#rcOtpBoxes .otp-box'));
const rcOtpError   = document.getElementById('rcOtpError');
const rcVerifyBtn  = document.getElementById('rcVerifyBtn');
const rcResendBtn  = document.getElementById('rcResendBtn');
const rcResendTimer= document.getElementById('rcResendTimer');
const rcBack1      = document.getElementById('rcBack1');

// Slide 3
const rcPwForm        = document.getElementById('rcPwForm');
const rcNewPwEl       = document.getElementById('rcNewPw');
const rcNewPwConfirmEl= document.getElementById('rcNewPwConfirm');
const rcSetPwBtn      = document.getElementById('rcSetPwBtn');


// ─── STEP NAVIGATION ──────────────────────────────────────────


// INIT STATE
function initializeState() {
  // Restore email so OTP verify still has it after reload
  const savedEmail = localStorage.getItem('gh_recover_email');
  if (savedEmail) {
    rcEmailEl.value = savedEmail;
    rcOtpHint.textContent = savedEmail;
  }
}

initializeState(); // Call it here


// ============================================================
//  STEP STATE — localStorage persistence
// ============================================================
function getStep() {
  return localStorage.getItem("gh_recover_step") || "1";
}

function setStep(step) {
  localStorage.setItem("gh_recover_step", step);
}

function goToStep(step, animate = true) {
  // Suppress CSS transition before touching classes so the mount is instant
  if (!animate) {
    slider.style.transition = "none";
  }

  slider.classList.remove("on-step-2", "on-step-3");
  progress.classList.remove("step-2", "step-3");

  if (!animate) {
    // Re-enable transition after forced instant mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slider.style.transition = "";
      });
    });
  }

  if (step === "2") {
    slider.classList.add("on-step-2");
    progress.classList.add("step-2");
    setTimeout(() => rcOtpBoxes[0].focus(), 520);
  }

  if (step === "3") {
    slider.classList.add("on-step-3");
    progress.classList.add("step-3");
    setTimeout(() => rcNewPwEl.focus(), 520);
  }

  setStep(step);
}

// On load: mount on correct step instantly (Firefox stability fix)
goToStep(getStep(), false);




// ─── HELPERS ──────────────────────────────────────────────────
function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function setError(inputEl, errId, message) {
  inputEl.classList.add('is-error');
  document.getElementById(errId).textContent = message;
}

function clearError(inputEl, errId) {
  inputEl.classList.remove('is-error');
  document.getElementById(errId).textContent = '';
}

// Clear errors on input
rcEmailEl.addEventListener('input', () => clearError(rcEmailEl, 'err-rcEmail'));
rcNewPwEl.addEventListener('input', () => clearError(rcNewPwEl, 'err-rcNewPw'));
rcNewPwConfirmEl.addEventListener('input', () => clearError(rcNewPwConfirmEl, 'err-rcNewPwConfirm'));


// ─── PASSWORD TOGGLE ──────────────────────────────────────────
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.classList.toggle('is-visible', isHidden);
  });
});


// ─── SLIDE 1 — SEND OTP ───────────────────────────────────────
rcEmailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
 
  const email = rcEmailEl.value.trim();
 
  if (!email) {
    setError(rcEmailEl, 'err-rcEmail', 'Email is required.');
    return;
  }
 
  if (!isValidEmail(email)) {
    setError(rcEmailEl, 'err-rcEmail', 'Enter a valid email address.');
    return;
  }
 
  rcSendBtn.disabled = true;
  rcSendBtn.innerText = 'Sending...';
 
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/src/recover/`
  });
 
  if (error) {
    rcSendBtn.disabled = false;
    rcSendBtn.innerHTML = 'Send Verification Code <i data-lucide="send"></i>';
    lucide.createIcons();
    setError(rcEmailEl, 'err-rcEmail', error.message);
    return;
  }
 
  // Store email for OTP hint and potential resend
  rcOtpHint.textContent = email;
  localStorage.setItem('gh_recover_email', email); // Persist so OTP verify survives reload
  rcSendBtn.disabled = false;
  rcSendBtn.innerHTML = 'Send Verification Code <i data-lucide="send"></i>';
  lucide.createIcons();
 
  goToStep('2'); 
  startResendTimer();
});


// ─── SLIDE 2 — VERIFY OTP ─────────────────────────────────────
rcVerifyBtn.addEventListener('click', async () => {
  const code = rcOtpBoxes.map(b => b.value).join('');
  if (code.length < 6) return;
 
  rcVerifyBtn.disabled = true;
  rcVerifyBtn.innerText = 'Verifying...';
 
  const { error } = await supabase.auth.verifyOtp({
    email: rcEmailEl.value.trim(),
    token: code,
    type: 'recovery'
  });
 
  if (error) {
    rcOtpBoxes.forEach(b => b.classList.add('is-error'));
    rcOtpError.textContent = 'Incorrect code. Please try again.';
    rcOtpBoxes[0].focus();
    rcVerifyBtn.disabled = false;
    rcVerifyBtn.innerText = 'Verify & Continue';
    return;
  }
 
  // OTP verified — session is now active, move to step 3
  rcVerifyBtn.innerText = 'Verified!';
  setTimeout(() => goToStep('3'), 500); // Was goToStep(3) — number never matched === "3"
});

function checkOtpComplete() {
  rcVerifyBtn.disabled = rcOtpBoxes.map(b => b.value).join('').length < 6;
}


// ─── SLIDE 2 — VERIFY OTP ─────────────────────────────────────
rcVerifyBtn.addEventListener('click', async () => {
  const code = rcOtpBoxes.map(b => b.value).join('');
  if (code.length < 6) return;

  rcVerifyBtn.disabled = true;
  rcVerifyBtn.innerText = 'Verifying...';

  const { error } = await supabase.auth.verifyOtp({
    email: rcEmailEl.value.trim(),
    token: code,
    type: 'recovery'
  });

  if (error) {
    rcOtpBoxes.forEach(b => b.classList.add('is-error'));
    rcOtpError.textContent = 'Incorrect code. Please try again.';
    rcOtpBoxes[0].focus();
    rcVerifyBtn.disabled = false;
    rcVerifyBtn.innerText = 'Verify & Continue';
    return;
  }

  // OTP verified — session is now active, move to step 3
  rcVerifyBtn.innerText = 'Verified!';
  setTimeout(() => goToStep(3), 500);
});


// ─── SLIDE 2 — RESEND ─────────────────────────────────────────
let resendInterval = null;

function startResendTimer(seconds = 30) {
  rcResendBtn.disabled = true;
  let remaining = seconds;

  function update() {
    rcResendTimer.textContent = `(${remaining}s)`;
    remaining--;
    if (remaining < 0) {
      clearInterval(resendInterval);
      rcResendBtn.disabled = false;
      rcResendTimer.textContent = '';
    }
  }

  update();
  resendInterval = setInterval(update, 1000);
}

rcResendBtn.addEventListener('click', async () => {
  rcResendBtn.disabled = true;
  rcResendBtn.textContent = 'Sending…';

  await supabase.auth.resetPasswordForEmail(rcEmailEl.value.trim(), {
    redirectTo: `${window.location.origin}/src/recover/`
  });

  rcResendBtn.textContent = 'Resend';
  startResendTimer(30);
});


// ─── SLIDE 2 — BACK ───────────────────────────────────────────
rcBack1.addEventListener('click', () => {
  rcOtpBoxes.forEach(b => {
    b.value = '';
    b.classList.remove('is-filled', 'is-error');
  });
  rcOtpError.textContent = '';
  rcVerifyBtn.disabled = true;
  if (resendInterval) clearInterval(resendInterval);
  rcResendTimer.textContent = '';
  rcResendBtn.disabled = false;

  goToStep(1);
});


// ─── SLIDE 3 — SET NEW PASSWORD ───────────────────────────────
rcPwForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const pw = rcNewPwEl.value;
  const pwConfirm = rcNewPwConfirmEl.value;
  let valid = true;

  if (!pw) {
    setError(rcNewPwEl, "err-rcNewPw", "Password is required.");
    valid = false;
  } else if (pw.length < 8) {
    setError(
      rcNewPwEl,
      "err-rcNewPw",
      "Password must be at least 8 characters.",
    );
    valid = false;
  }

  if (pw !== pwConfirm) {
    setError(rcNewPwConfirmEl, "err-rcNewPwConfirm", "Passwords don't match.");
    valid = false;
  }

  if (!valid) return;

  rcSetPwBtn.disabled = true;
  rcSetPwBtn.innerText = "Updating...";

  const { error } = await supabase.auth.updateUser({ password: pw });

  if (error) {
    rcSetPwBtn.disabled = false;
    rcSetPwBtn.innerHTML = 'Update Password <i data-lucide="shield-check"></i>';
    lucide.createIcons();
    setError(rcNewPwEl, "err-rcNewPw", error.message);
    return;
  }

  // Success — sign out and redirect to login so they sign in fresh
  rcSetPwBtn.innerText = "Success! Redirecting...";
  localStorage.removeItem("gh_recover_step"); // Clean up persisted state on success
  localStorage.removeItem("gh_recover_email");
  await supabase.auth.signOut();
  setTimeout(() => {
    window.location.href = "/src/login/";
  }, 1500);
});
 



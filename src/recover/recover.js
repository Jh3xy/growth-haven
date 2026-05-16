

import "../assets/styles/register.css";

import { supabase } from "../assets/js/supabase.js";

// ─── DOM REFS ─────────────────────────────────────────────────
const slider = document.getElementById("recoverSlider");
const progress = document.getElementById("recoverProgress");

// Slide 1
const rcEmailForm = document.getElementById("rcEmailForm");
const rcEmailEl = document.getElementById("rcEmail");
const rcSendBtn = document.getElementById("rcSendBtn");

// Slide 2
const rcOtpHint = document.getElementById("rcOtpHint");
const rcOtpBoxes = Array.from(
  document.querySelectorAll("#rcOtpBoxes .otp-box"),
);
const rcOtpError = document.getElementById("rcOtpError");
const rcVerifyBtn = document.getElementById("rcVerifyBtn");
const rcResendBtn = document.getElementById("rcResendBtn");
const rcResendTimer = document.getElementById("rcResendTimer");
const rcBack1 = document.getElementById("rcBack1");

// Slide 3
const rcPwForm = document.getElementById("rcPwForm");
const rcNewPwEl = document.getElementById("rcNewPw");
const rcNewPwConfirmEl = document.getElementById("rcNewPwConfirm");
const rcSetPwBtn = document.getElementById("rcSetPwBtn");

// ─── INIT STATE ───────────────────────────────────────────────
// Restore email so the OTP hint is still populated after a reload on step 2
function initializeState() {
  const savedEmail = localStorage.getItem("gh_recover_email");
  if (savedEmail) {
    rcEmailEl.value = savedEmail;
    if (rcOtpHint) rcOtpHint.textContent = savedEmail;
  }
}

initializeState();

// ─── STEP STATE ───────────────────────────────────────────────
function getStep() {
  return localStorage.getItem("gh_recover_step") || "1";
}

function setStep(step) {
  localStorage.setItem("gh_recover_step", String(step));
}

function goToStep(step, animate = true) {
  const s = String(step); // always coerce — prevents === type mismatch bugs

  if (!animate) slider.style.transition = "none";

  slider.classList.remove("on-step-2", "on-step-3");
  progress.classList.remove("step-2", "step-3");

  if (!animate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slider.style.transition = "";
      });
    });
  }

  if (s === "2") {
    slider.classList.add("on-step-2");
    progress.classList.add("step-2");
    setTimeout(() => rcOtpBoxes[0]?.focus(), animate ? 520 : 0);
  }

  if (s === "3") {
    slider.classList.add("on-step-3");
    progress.classList.add("step-3");
    setTimeout(() => rcNewPwEl?.focus(), animate ? 520 : 0);
  }

  setStep(s);
}

// Mount on the persisted step instantly (avoids Firefox flash)
goToStep(getStep(), false);

// ─── HELPERS ──────────────────────────────────────────────────
function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function setError(inputEl, errId, message) {
  inputEl.classList.add("is-error");
  document.getElementById(errId).textContent = message;
}

function clearError(inputEl, errId) {
  inputEl.classList.remove("is-error");
  document.getElementById(errId).textContent = "";
}

rcEmailEl.addEventListener("input", () => clearError(rcEmailEl, "err-rcEmail"));
rcNewPwEl.addEventListener("input", () => clearError(rcNewPwEl, "err-rcNewPw"));
rcNewPwConfirmEl.addEventListener("input", () =>
  clearError(rcNewPwConfirmEl, "err-rcNewPwConfirm"),
);

// ─── PASSWORD TOGGLE ──────────────────────────────────────────
document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.classList.toggle("is-visible", isHidden);
  });
});

// ─── SLIDE 1 — SEND OTP ───────────────────────────────────────
rcEmailForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = rcEmailEl.value.trim();

  if (!email) {
    setError(rcEmailEl, "err-rcEmail", "Email is required.");
    return;
  }

  if (!isValidEmail(email)) {
    setError(rcEmailEl, "err-rcEmail", "Enter a valid email address.");
    return;
  }

  rcSendBtn.disabled = true;
  rcSendBtn.innerText = "Sending...";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/src/recover/`,
  });

  if (error) {
    rcSendBtn.disabled = false;
    rcSendBtn.innerHTML = 'Send Verification Code <i data-lucide="send"></i>';
    if (window.lucide) lucide.createIcons();
    setError(rcEmailEl, "err-rcEmail", error.message);
    return;
  }

  if (rcOtpHint) rcOtpHint.textContent = email;
  localStorage.setItem("gh_recover_email", email);

  rcSendBtn.disabled = false;
  rcSendBtn.innerHTML = 'Send Verification Code <i data-lucide="send"></i>';
  if (window.lucide) lucide.createIcons();

  goToStep("2");
  startResendTimer();
});

// ─── SLIDE 2 — OTP BOX EVENT HANDLING ────────────────────────
// so auto-advance didn't work and the verify button never enabled.
rcOtpBoxes.forEach((box, i) => {
  box.addEventListener("keydown", (e) => {
    // Block anything that isn't a digit or a navigation key
    if (
      !/^\d$/.test(e.key) &&
      !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      return;
    }

    // Backspace on an empty box → clear the previous box and jump back
    if (e.key === "Backspace" && !box.value && i > 0) {
      rcOtpBoxes[i - 1].value = "";
      rcOtpBoxes[i - 1].classList.remove("is-filled");
      rcOtpBoxes[i - 1].focus();
    }
  });

  box.addEventListener("input", () => {
    // Strip non-digits and limit to one character
    box.value = box.value.replace(/\D/g, "").slice(0, 1);

    box.classList.toggle("is-filled", box.value !== "");
    box.classList.remove("is-error");
    if (rcOtpError) rcOtpError.textContent = "";

    // Auto-advance to the next box
    if (box.value && i < rcOtpBoxes.length - 1) {
      rcOtpBoxes[i + 1].focus();
    }

    checkOtpComplete();
  });

  box.addEventListener("paste", (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    pasted.split("").forEach((digit, j) => {
      if (rcOtpBoxes[i + j]) {
        rcOtpBoxes[i + j].value = digit;
        rcOtpBoxes[i + j].classList.add("is-filled");
      }
    });
    const lastIdx = Math.min(i + pasted.length, rcOtpBoxes.length - 1);
    rcOtpBoxes[lastIdx].focus();
    checkOtpComplete();
  });
});

// Enables the verify button only when all 6 digits are filled
function checkOtpComplete() {
  rcVerifyBtn.disabled = rcOtpBoxes.map((b) => b.value).join("").length < 6;
}

// ─── SLIDE 2 — VERIFY OTP ─────────────────────────────────────
// Single listener only. The original file had a duplicate that also
// passed goToStep(3) (number) which never matched goToStep's === '3' check.
rcVerifyBtn.addEventListener("click", async () => {
  const code = rcOtpBoxes.map((b) => b.value).join("");
  if (code.length < 6) return;

  rcVerifyBtn.disabled = true;
  rcVerifyBtn.innerText = "Verifying...";

  const { error } = await supabase.auth.verifyOtp({
    email: rcEmailEl.value.trim(),
    token: code,
    type: "recovery",
  });

  if (error) {
    rcOtpBoxes.forEach((b) => b.classList.add("is-error"));
    if (rcOtpError)
      rcOtpError.textContent = "Incorrect code. Please try again.";
    rcOtpBoxes[0].focus();
    rcVerifyBtn.disabled = false;
    rcVerifyBtn.innerText = "Verify & Continue";
    return;
  }

  // Session is now active — move to the password step
  rcVerifyBtn.innerText = "Verified!";
  setTimeout(() => goToStep("3"), 500);
});

// ─── SLIDE 2 — RESEND ─────────────────────────────────────────
let resendInterval = null;

function startResendTimer(seconds = 30) {
  rcResendBtn.disabled = true;
  let remaining = seconds;

  function update() {
    if (rcResendTimer) rcResendTimer.textContent = `(${remaining}s)`;
    remaining--;
    if (remaining < 0) {
      clearInterval(resendInterval);
      rcResendBtn.disabled = false;
      if (rcResendTimer) rcResendTimer.textContent = "";
    }
  }

  update();
  resendInterval = setInterval(update, 1000);
}

rcResendBtn.addEventListener("click", async () => {
  rcResendBtn.disabled = true;
  rcResendBtn.textContent = "Sending…";

  await supabase.auth.resetPasswordForEmail(rcEmailEl.value.trim(), {
    redirectTo: `${window.location.origin}/src/recover/`,
  });

  rcResendBtn.textContent = "Resend";
  startResendTimer(30);
});

// ─── SLIDE 2 — BACK ───────────────────────────────────────────
rcBack1.addEventListener("click", () => {
  rcOtpBoxes.forEach((b) => {
    b.value = "";
    b.classList.remove("is-filled", "is-error");
  });
  if (rcOtpError) rcOtpError.textContent = "";
  rcVerifyBtn.disabled = true;
  if (resendInterval) clearInterval(resendInterval);
  if (rcResendTimer) rcResendTimer.textContent = "";
  rcResendBtn.disabled = false;

  goToStep("1");
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
    if (window.lucide) lucide.createIcons();
    setError(rcNewPwEl, "err-rcNewPw", error.message);
    return;
  }

  rcSetPwBtn.innerText = "Success! Redirecting...";
  localStorage.removeItem("gh_recover_step");
  localStorage.removeItem("gh_recover_email");
  await supabase.auth.signOut();

  setTimeout(() => {
    window.location.href = "/src/login/";
  }, 1500);
});

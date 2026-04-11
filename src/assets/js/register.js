


/**
 * register.js - Register file js module
 */


import '../styles/register.css'


import { signUpUser, verifyEmailOtp, createMemberProfile } from './auth.js';


const slider       = document.getElementById('regSlider');
const progressFill = document.getElementById('progressFill');
const regForm      = document.getElementById('regForm');
const regSubmitBtn = document.getElementById('regSubmitBtn');

const firstNameEl  = document.getElementById('firstName');
const lastNameEl   = document.getElementById('lastName');
const emailEl      = document.getElementById('regEmail');
const pwEl         = document.getElementById('regPw');
const pwConfirmEl  = document.getElementById('regPwConfirm');
const termsEl      = document.getElementById('terms');

const otpBoxes     = Array.from(document.querySelectorAll('.otp-box'));
const otpEmailHint = document.getElementById('otpEmailHint');
const otpError     = document.getElementById('otpError');
const verifyBtn    = document.getElementById('verifyBtn');
const resendBtn    = document.getElementById('resendBtn');
const resendTimer  = document.getElementById('resendTimer');
const backBtn      = document.getElementById('backBtn');

// For the simulated OTP check
const SIMULATED_OTP = '123456';


console.log({ firstNameEl, lastNameEl, emailEl, pwEl, pwConfirmEl });


// INIT STATE
function initializeState() {
  const currentStep = getStep();
  
  if (currentStep === '2') {
    const savedEmail = localStorage.getItem('gh_reg_email');
    if (savedEmail) {
      // These will now work because the variables exist!
      emailEl.value = savedEmail; 
      otpEmailHint.textContent = savedEmail;
      
      // Force the slider to Step 2 immediately on reload
      slider.style.transition = 'none'; // No animation on initial load
      setStep('2');
      setTimeout(() => slider.style.transition = '', 50); // Restore animation
    }
  }
}

initializeState(); // Call it here


// ============================================================
//  STEP STATE — localStorage persistence
// ============================================================
function getStep() {
  return localStorage.getItem('gh_reg_step') || '1';
}

function setStep(step) {
  localStorage.setItem('gh_reg_step', step);
}

function goToStep(step, animate = true) {
  if (!animate) {
    slider.style.transition = 'none';
  }

  if (step === '2') {
    slider.classList.add('on-step-2');
    progressFill.classList.add('step-2');
    // Focus first OTP box after slide completes
    setTimeout(() => otpBoxes[0].focus(), animate ? 520 : 0);
  } else {
    slider.classList.remove('on-step-2');
    progressFill.classList.remove('step-2');
  }

  if (!animate) {
    // Re-enable transition after forced instant mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slider.style.transition = '';
      });
    });
  }

  setStep(step);
}

// On load: mount on correct step instantly (Firefox stability fix)
goToStep(getStep(), false);


// ============================================================
//  PASSWORD TOGGLE

document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    
    // Toggle the input type
    input.type = isHidden ? 'text' : 'password';

    // Toggle a class on the button to let CSS know which icon to show
    btn.classList.toggle('is-visible', isHidden);
  });
});


// ============================================================
//  PASSWORD STRENGTH RULES


// const rules = {
//   length: val => val.length >= 8,
//   case:   val => /[a-z]/.test(val) && /[A-Z]/.test(val),
//   symbol: val => /[^a-zA-Z0-9]/.test(val),
// };

// pwEl.addEventListener('input', () => {
//   const val = pwEl.value;
//   document.querySelectorAll('.pw-rule').forEach(el => {
//     const rule = el.dataset.rule;
//     el.classList.toggle('met', rules[rule](val));
//   });
// });



// ============================================================
//  VALIDATION HELPERS


function setError(inputEl, errId, message) {
  inputEl.classList.add('is-error');
  document.getElementById(errId).textContent = message;
}

function clearError(inputEl, errId) {
  inputEl.classList.remove('is-error');
  if (errId) document.getElementById(errId).textContent = '';
}

// Clear on input
[
  [firstNameEl, 'err-firstName'],
  [lastNameEl,  'err-lastName'],
  [emailEl,     'err-email'],
  [pwEl,        'err-pw'],
  [pwConfirmEl, 'err-pwConfirm'],
].forEach(([el, errId]) => {
  el.addEventListener('input', () => clearError(el, errId));
});

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function validateForm() {
  let valid = true;

  if (!firstNameEl.value.trim()) {
    setError(firstNameEl, 'err-firstName', 'Required');
    valid = false;
  }

  if (!lastNameEl.value.trim()) {
    setError(lastNameEl, 'err-lastName', 'Required');
    valid = false;
  }

  if (!emailEl.value.trim()) {
    setError(emailEl, 'err-email', 'Email is required.');
    valid = false;
  } else if (!isValidEmail(emailEl.value.trim())) {
    setError(emailEl, 'err-email', 'Enter a valid email address.');
    valid = false;
  }

  const pwVal = pwEl.value;
  
  // 1. Check if empty
  if (!pwVal) {
    setError(pwEl, 'err-pw', 'Password is required.');
    valid = false;
  } 
  // 2. Check minimum length
  else if (pwVal.length < 8) {
    setError(pwEl, 'err-pw', 'Password must be at least 8 characters.');
    valid = false;
  }

  // This checks the match regardless of whether other fields are valid
  if (pwConfirmEl.value !== pwVal) {
    setError(pwConfirmEl, 'err-pwConfirm', 'Passwords don\'t match.');
    valid = false;
  }
  

  if (!termsEl.checked) {
    // If you have an error element for terms, use setError
    // setError(termsEl, 'err-terms', 'You must agree to the terms.'); 
    
    // Otherwise, keep your outline but maybe make it stay until they check it?
    termsEl.style.outline = '2px solid var(--status-error)';
    valid = false;
  } else {
    termsEl.style.outline = '';
  }

  return valid;
}



//============================================================
//  FORM SUBMIT → GO TO OTP


regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const email = emailEl.value.trim();
  const password = pwEl.value;         
  const fName = firstNameEl.value.trim();
  const lName = lastNameEl.value.trim();  // Grab from your lastNameEl input

  // Show email in OTP hint (use first part before @)
  const mail = emailEl.value.trim();
  otpEmailHint.textContent = mail;

  // Save email for potential later use
  localStorage.setItem('gh_reg_email', email);

  // Lock btn for loading
  regSubmitBtn.disabled = true;
  regSubmitBtn.classList.add('is-loading');
  regSubmitBtn.innerText = 'Creating Account...';
  
  try {
    const { data, error } = await signUpUser(email, password, fName, lName);
    
    if (error) {
      // RESET THE BUTTON SO THEY CAN TRY AGAIN
      regSubmitBtn.disabled = false;
      regSubmitBtn.classList.remove('is-loading');
      regSubmitBtn.innerHTML = 'Create Account <i data-lucide="shield-check"></i>';
      
      if (error.status === 429) {
        setError(emailEl, 'err-email', 'Too many requests. Please wait a moment.');
      } else {
        setError(emailEl, 'err-email', error.message);
      }
      lucide.createIcons(); // Re-initialize icons in case innerHTML was changed
      return;
    }
    
    // Success
    localStorage.setItem('gh_reg_email', email);
    setStep('2');
    // Ensure the slider moves to the next part of the form
    goToStep('2', true);
  } catch (err) {
    // Catch unexpected crashes
    regSubmitBtn.disabled = false;
    regSubmitBtn.classList.remove('is-loading');
    regSubmitBtn.innerHTML = 'Create Account <i data-lucide="shield-check"></i>';
    console.error("Auth Crash:", err);
  }
  lucide.createIcons(); // Re-initialize icons in case innerHTML was changed
});



//============================================================
//  OTP BOXES LOGIC


otpBoxes.forEach((box, i) => {
  box.addEventListener('keydown', (e) => {
    // Allow: digits, backspace, tab, arrow keys
    if (
      !/^\d$/.test(e.key) &&
      !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)
    ) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Backspace' && !box.value && i > 0) {
      otpBoxes[i - 1].value = '';
      otpBoxes[i - 1].classList.remove('is-filled');
      otpBoxes[i - 1].focus();
    }
  });

  box.addEventListener('input', () => {
    // Sanitise: only digits
    box.value = box.value.replace(/\D/g, '').slice(0, 1);

    box.classList.toggle('is-filled', box.value !== '');
    // Clear any error state on typing
    box.classList.remove('is-error');
    otpError.textContent = '';

    if (box.value && i < otpBoxes.length - 1) {
      otpBoxes[i + 1].focus();
    }

    checkOtpComplete();
  });

  // Handle paste across all boxes
  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    pasted.split('').forEach((digit, j) => {
      if (otpBoxes[i + j]) {
        otpBoxes[i + j].value = digit;
        otpBoxes[i + j].classList.add('is-filled');
      }
    });
    // Focus last filled box
    const lastIdx = Math.min(i + pasted.length, otpBoxes.length - 1);
    otpBoxes[lastIdx].focus();
    checkOtpComplete();
  });
});

function getOtpValue() {
  return otpBoxes.map(b => b.value).join('');
}

function checkOtpComplete() {
  const complete = getOtpValue().length === 6;
  verifyBtn.disabled = !complete;
}


//============================================================
//  OTP VERIFY

verifyBtn.addEventListener('click', async () => {
  const code = otpBoxes.map(b => b.value).join('');
  if (code.length < 6) return;

  verifyBtn.disabled = true;
  verifyBtn.innerText = 'Verifying...';

  // 1. Verify the code with Supabase
  const { data, error } = await verifyEmailOtp(emailEl.value.trim(), code);

  if (error) {
    otpBoxes.forEach(b => b.classList.add('is-error'));
    otpError.textContent = 'Incorrect code. Please try again.';
    otpBoxes[0].focus();
    verifyBtn.disabled = false;
    verifyBtn.innerText = 'Verify & Continue';
    return;
  }

  // 2. OTP is valid, user is now logged in! Create their members profile
  const userId = data.user.id;
  const { error: profileError } = await createMemberProfile(userId, data.user.email);

  if (profileError) {
    console.error('Failed to create member profile:', profileError);
    // You can handle this silently or alert the user
  }

  // 3. Redirect to the authenticated dashboard
  verifyBtn.innerText = 'Verified! Redirecting...';
  setTimeout(() => {
    window.location.href = '/dashboard.html'; 
  }, 1000);
});




//============================================================
//  RESEND TIMER


let resendInterval = null;

function startResendTimer(seconds = 30) {
  resendBtn.disabled = true;
  let remaining = seconds;

  function update() {
    resendTimer.textContent = `(${remaining}s)`;
    remaining--;

    if (remaining < 0) {
      clearInterval(resendInterval);
      resendBtn.disabled = false;
      resendTimer.textContent = '';
    }
  }

  update();
  resendInterval = setInterval(update, 1000);
}

resendBtn.addEventListener('click', () => {
  // Simulate resend
  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending…';

  setTimeout(() => {
    resendBtn.textContent = 'Resend';
    startResendTimer(30);
  }, 600);
});



//============================================================
//  BACK BUTTON

backBtn.addEventListener('click', () => {
  // Clear OTP state
  otpBoxes.forEach(b => {
    b.value = '';
    b.classList.remove('is-filled', 'is-error');
  });
  otpError.textContent = '';
  verifyBtn.disabled = true;
  if (resendInterval) clearInterval(resendInterval);
  resendTimer.textContent = '';
  resendBtn.disabled = false;

  goToStep('1');
});




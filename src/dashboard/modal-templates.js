
/**
 * modal-templates.js — GrowthHaven Modal Content Factories
 */

import { closeModal } from './modal.js';

// ─── CONFIG ──────────────────────────────────────────────────────
const MIN_DEPOSIT    = 6000;
const MIN_WITHDRAWAL = 10000;
const QUICK_AMOUNTS  = [6000, 20000, 30000, 50000];

// ─── HELPERS ─────────────────────────────────────────────────────

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function generateRef(prefix) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GH-${prefix}-${ts}-${rand}`;
}

function renderChips(inputId) {
  return `
    <div class="modal-chips" id="modalChips">
      ${QUICK_AMOUNTS.map(amt => `
        <button class="modal-chip" type="button" data-amount="${amt}" data-target="${inputId}">
          ${formatNaira(amt)}
        </button>
      `).join('')}
    </div>
  `;
}

// ─── SHARED HANDLER — chip wiring ────────────────────────────────

function wireChips(inputId) {
  const chips    = document.querySelectorAll('.modal-chip');
  const inputEl  = document.getElementById(inputId);
  if (!inputEl) return;

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      // Deselect all, select clicked
      chips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');

      inputEl.value = chip.dataset.amount;
      inputEl.classList.remove('is-error');

      // Trigger input event so any live listeners fire
      inputEl.dispatchEvent(new Event('input'));
    });
  });

  // Deselect chips when user types manually
  inputEl.addEventListener('input', () => {
    const typed = Number(inputEl.value);
    chips.forEach(chip => {
      chip.classList.toggle('is-active', Number(chip.dataset.amount) === typed);
    });
  });
}

// ─── RECEIPT SWAP ─────────────────────────────────────────────────

function swapToReceipt(receiptHTML) {
  const bodyEl = document.getElementById('modalBody');
  if (!bodyEl) return;

  bodyEl.innerHTML = receiptHTML;
  if (window.lucide) lucide.createIcons({ nodes: [bodyEl] });

  document.getElementById('modalDoneBtn')?.addEventListener('click', closeModal);
}

// ─── TEMPLATES ───────────────────────────────────────────────────
/**
 * The modal system is fully self-contained — 
 * adding a new type later is just a new key in MODAL_TEMPLATES and a new if in initModalHandlers
 * Nothing else touches.
 */

export const MODAL_TEMPLATES = {

  // ── DEPOSIT ──────────────────────────────────────────────────
  deposit: (data) => ({
    title: 'Deposit Funds',
    body: `
      <p class="modal-balance-hint">
        Wallet balance: <span>${formatNaira(data.walletBalance ?? 0)}</span>
      </p>
      
      <div class="modal-field">
        <label class="modal-label" for="modalDepositAmount">Amount (₦)</label>
        <input
        class="modal-input"
        id="modalDepositAmount"
            type="number"
            min="${MIN_DEPOSIT}"
            placeholder="Enter amount"
            inputmode="numeric"
            />
        <span class="modal-field-error" id="modalDepositError"></span>
      </div>
          
      ${renderChips('modalDepositAmount')}

      <button class="modal-submit-btn" id="modalDepositBtn" type="button">
        Proceed to Payment
        <i data-lucide="arrow-right"></i>
      </button>
    `,
  }),

  // ── WITHDRAWAL ───────────────────────────────────────────────
  withdrawal: (data) => ({
    title: 'Withdraw Funds',
    body: `
      <p class="modal-balance-hint">
        Available: <span>${formatNaira(data.walletBalance ?? 0)}</span>
      </p>

      <div class="modal-field">
        <label class="modal-label" for="modalWithdrawAmount">Amount (₦)</label>
        <input
          class="modal-input"
          id="modalWithdrawAmount"
          type="number"
          min="${MIN_WITHDRAWAL}"
          placeholder="Enter amount"
          inputmode="numeric"
        />
        <span class="modal-field-error" id="modalWithdrawError"></span>
      </div>

      ${renderChips('modalWithdrawAmount')}

      <div class="modal-field">
        <label class="modal-label" for="modalWithdrawBank">Bank Name</label>
        <input
          class="modal-input"
          id="modalWithdrawBank"
          type="text"
          placeholder="e.g. First Bank"
          autocomplete="organization"
        />
      </div>

      <div class="modal-field">
        <label class="modal-label" for="modalWithdrawAccNum">Account Number</label>
        <input
          class="modal-input"
          id="modalWithdrawAccNum"
          type="text"
          inputmode="numeric"
          maxlength="10"
          placeholder="10-digit number"
        />
      </div>

      <div class="modal-field">
        <label class="modal-label" for="modalWithdrawAccName">Account Name</label>
        <input
          class="modal-input"
          id="modalWithdrawAccName"
          type="text"
          placeholder="As registered with bank"
          autocomplete="name"
        />
      </div>

      <button class="modal-submit-btn" id="modalWithdrawBtn" type="button">
        Request Withdrawal
        <i data-lucide="arrow-up-right"></i>
      </button>
    `,
  }),
};

// ─── HANDLERS ────────────────────────────────────────────────────

export function initModalHandlers(type, data) {
  if (type === 'deposit')    initDepositHandlers(data);
  if (type === 'withdrawal') initWithdrawHandlers(data);
}

// ── Deposit ──────────────────────────────────────────────────────

function initDepositHandlers(data) {
  wireChips('modalDepositAmount');

  const btn     = document.getElementById('modalDepositBtn');
  const inputEl = document.getElementById('modalDepositAmount');
  const errorEl = document.getElementById('modalDepositError');

  // Clear error on input
  inputEl?.addEventListener('input', () => {
    inputEl.classList.remove('is-error');
    if (errorEl) errorEl.textContent = '';
  });

  btn?.addEventListener('click', () => {
    const amount = parseFloat(inputEl.value);

    // Validate
    if (!inputEl.value || isNaN(amount)) {
      showFieldError(inputEl, errorEl, 'Please enter an amount.');
      return;
    }
    if (amount < MIN_DEPOSIT) {
      showFieldError(inputEl, errorEl, `Minimum deposit is ${formatNaira(MIN_DEPOSIT)}.`);
      return;
    }

    // Submit
    btn.disabled    = true;
    btn.textContent = 'Processing...';

    console.log('[deposit] Paystack payment initiated', {
      amount,
      userId: data.userId,
    });

    // Show toast
    showToast('Payment gateway coming soon — deposit logged.', 'info');

    // Fake async — swap to receipt after 800ms
    setTimeout(() => {
      const ref            = generateRef('DEP');
      const projectedBal   = (data.walletBalance ?? 0) + amount;

      swapToReceipt(`
        <div class="modal-receipt">
          <div class="modal-receipt__icon">
            <i data-lucide="check"></i>
          </div>
          <p class="modal-receipt__heading">Deposit Initiated</p>
          <p class="modal-receipt__sub">Your payment is being processed.</p>

          <div class="modal-receipt__card">
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Name</span>
              <span class="modal-receipt__val">${data.userName || '—'}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Amount</span>
              <span class="modal-receipt__val">${formatNaira(amount)}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Type</span>
              <span class="modal-receipt__val">Deposit</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Reference</span>
              <span class="modal-receipt__val">${ref}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Date</span>
              <span class="modal-receipt__val">${formatDate(new Date())}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Wallet Balance</span>
              <span class="modal-receipt__val">${formatNaira(projectedBal)}</span>
            </div>
          </div>

          <p class="modal-receipt__ref">ref: ${ref}</p>

          <button class="modal-done-btn" id="modalDoneBtn" type="button">Done</button>
        </div>
      `);
    }, 800);
  });
}

// ── Withdrawal ───────────────────────────────────────────────────

function initWithdrawHandlers(data) {
  wireChips('modalWithdrawAmount');

  const btn       = document.getElementById('modalWithdrawBtn');
  const amountEl  = document.getElementById('modalWithdrawAmount');
  const bankEl    = document.getElementById('modalWithdrawBank');
  const accNumEl  = document.getElementById('modalWithdrawAccNum');
  const accNameEl = document.getElementById('modalWithdrawAccName');
  const errorEl   = document.getElementById('modalWithdrawError');

  // Clear amount error on input
  amountEl?.addEventListener('input', () => {
    amountEl.classList.remove('is-error');
    if (errorEl) errorEl.textContent = '';
  });

  // Account number: digits only
  accNumEl?.addEventListener('input', () => {
    accNumEl.value = accNumEl.value.replace(/\D/g, '').slice(0, 10);
  });

  btn?.addEventListener('click', () => {
    const amount     = parseFloat(amountEl.value);
    const bank       = bankEl.value.trim();
    const accNum     = accNumEl.value.trim();
    const accName    = accNameEl.value.trim();
    const walletBal  = data.walletBalance ?? 0;

    // Validate — show only the first error at a time
    if (!amountEl.value || isNaN(amount)) {
      showFieldError(amountEl, errorEl, 'Please enter an amount.');
      return;
    }
    if (amount < MIN_WITHDRAWAL) {
      showFieldError(amountEl, errorEl, `Minimum withdrawal is ${formatNaira(MIN_WITHDRAWAL)}.`);
      return;
    }
    if (amount > walletBal) {
      showFieldError(amountEl, errorEl, 'Amount exceeds your available balance.');
      return;
    }
    if (!bank) {
      bankEl.classList.add('is-error');
      bankEl.focus();
      return;
    }
    if (accNum.length !== 10) {
      accNumEl.classList.add('is-error');
      accNumEl.focus();
      return;
    }
    if (!accName) {
      accNameEl.classList.add('is-error');
      accNameEl.focus();
      return;
    }

    // Submit
    btn.disabled    = true;
    btn.textContent = 'Submitting...';

    console.log('[withdrawal] Request submitted', {
      amount,
      bank,
      accountNumber: accNum,
      accountName:   accName,
      userId:        data.userId,
    });

    showToast('Withdrawal request received — processing within 2–3 business days.', 'info');

    setTimeout(() => {
      const ref        = generateRef('WDR');
      const remaining  = walletBal - amount;

      swapToReceipt(`
        <div class="modal-receipt">
          <div class="modal-receipt__icon">
            <i data-lucide="check"></i>
          </div>
          <p class="modal-receipt__heading">Withdrawal Requested</p>
          <p class="modal-receipt__sub">Your request has been submitted.</p>

          <div class="modal-receipt__card">
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Name</span>
              <span class="modal-receipt__val">${data.userName || '—'}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Amount</span>
              <span class="modal-receipt__val">${formatNaira(amount)}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Bank</span>
              <span class="modal-receipt__val">${bank}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Account Number</span>
              <span class="modal-receipt__val">${accNum}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Account Name</span>
              <span class="modal-receipt__val">${accName}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Reference</span>
              <span class="modal-receipt__val">${ref}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Date</span>
              <span class="modal-receipt__val">${formatDate(new Date())}</span>
            </div>
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Remaining Balance</span>
              <span class="modal-receipt__val">${formatNaira(remaining)}</span>
            </div>
          </div>

          <p class="modal-receipt__ref">ref: ${ref}</p>

          <button class="modal-done-btn" id="modalDoneBtn" type="button">Done</button>
        </div>
      `);
    }, 800);
  });
}

// ─── SHARED UTILS ────────────────────────────────────────────────

function showFieldError(inputEl, errorEl, message) {
  if (inputEl) inputEl.classList.add('is-error');
  if (errorEl) errorEl.textContent = message;
  inputEl?.focus();
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.invest-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  // Reuse existing invest-toast classes — already styled in dashboard.css
  toast.className = `invest-toast invest-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}


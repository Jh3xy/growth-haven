
/**
 * modal-templates.js — GrowthHaven Modal Content Factories
 */

import { closeModal } from './modal.js';
import { supabase } from '../assets/js/supabase.js';

// ─── CONFIG ──────────────────────────────────────────────────────
const MIN_DEPOSIT    = 6000;
const MIN_WITHDRAWAL = 10000;
const QUICK_AMOUNTS  = [6000, 20000, 30000, 50000];

// ─── HELPERS ─────────────────────────────────────────────────────

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function formatDate(date) {
  return date.toLocaleString('en-GB', {
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



async function writeTransaction({ userId, type, label, amount }) {
  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      user_id: userId,
      type,
      label,
      amount,
      status: 'pending',
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) console.error('[transactions] Write error:', error);
  return data ?? null;
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

  // ── TRANSACTION DETAIL ────────────────────────────────────────
  txn_detail: (data) => {
    const { txn } = data;
    const isIn = [
      "deposit",
      "like",
      "blog_like_reward",
      "stream_rewards",
      "blog_post_reward",
      "mines_win",
      "daily_claim",
      "early_exit",
      "referral_bonus",
      "vault_maturity",
    ].includes(txn.type);
    const sign    = isIn ? '+' : '-';
    const status  = txn.status || 'completed';

    const ICON_MAP = {
      deposit: "arrow-down-to-line",
      withdrawal: "arrow-up-right",
      vault_fund: "shield",
      daily_claim: "sun",
      blog_like_reward: "thumbs-up",
      blog_post_reward: "message-circle-heart",
      stream_rewards: "music",
      early_exit: "door-open",
      referral_bonus: "users",
      vault_maturity: "lock-open",
    };

    const icon = ICON_MAP[txn.type] || 'bell-dot';

    const statusClass = {
      completed: 'txn-row__status--completed',
      pending:   'txn-row__status--pending',
      failed:    'txn-row__status--failed',
    }[status] || 'txn-row__status--completed';

    return {
      title: "Transaction Detail",
      body: `
        <div class="modal-receipt">

          <div class="modal-receipt__icon" style="${
            isIn
              ? ""
              : "background:var(--status-error-bg);border-color:var(--status-error-border);color:var(--status-error-text);"
          }">
            <i data-lucide="${icon}"></i>
          </div>

          <p class="modal-receipt__heading">
            ${sign}${formatNaira(txn.amount)}
          </p>
          <p class="modal-receipt__sub" style="margin-bottom:1.5rem;">${txn.label}</p>

          <div class="modal-receipt__card">

            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Type</span>
              <span class="modal-receipt__val" style="text-transform:capitalize;">
                ${txn.type.replace(/_/g, " ")}
              </span>
            </div>
            <div class="modal-receipt__divider"></div>

            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Status</span>
              <span class="txn-row__status ${statusClass}">
                ${status}
              </span>
            </div>
            <div class="modal-receipt__divider"></div>

            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Date</span>
              <span class="modal-receipt__val">${formatDate(txn.created_at).split("T")[0]}</span>
            </div>

            ${
              txn.reference
                ? `
            <div class="modal-receipt__divider"></div>
            <div class="modal-receipt__row">
              <span class="modal-receipt__key">Reference</span>
              <span class="modal-receipt__val">${txn.reference}</span>
            </div>
            `
                : ""
            }

          </div>

          ${
            txn.reference
              ? `<p class="modal-receipt__ref">ref: ${txn.reference}</p>`
              : ""
          }

          <button class="modal-done-btn" id="modalDoneBtn" type="button">Done</button>

        </div>
      `,
    };
  },

  // ── CHANGE PASSWORD ───────────────────────────────────────────
  change_password: () => ({
    title: 'Change Password',
    body: `
      <div class="modal-field">
        <label class="modal-label" for="modalCurrentPw">Current Password</label>
        <div style="position:relative;">
          <input class="modal-input" id="modalCurrentPw" type="password"
                 placeholder="••••••••" autocomplete="current-password"
                 style="padding-right:3rem;" />
          <button class="modal-pw-toggle" type="button" data-target="modalCurrentPw"
                  aria-label="Toggle password visibility">
            <i data-lucide="eye"     style="width:16px;height:16px;"></i>
            <i data-lucide="eye-off" style="width:16px;height:16px;display:none;"></i>
          </button>
        </div>
      </div>

      <div class="modal-field">
        <label class="modal-label" for="modalNewPw">New Password</label>
        <div style="position:relative;">
          <input class="modal-input" id="modalNewPw" type="password"
                 placeholder="••••••••" autocomplete="new-password"
                 style="padding-right:3rem;" />
          <button class="modal-pw-toggle" type="button" data-target="modalNewPw"
                  aria-label="Toggle new password visibility">
            <i data-lucide="eye"     style="width:16px;height:16px;"></i>
            <i data-lucide="eye-off" style="width:16px;height:16px;display:none;"></i>
          </button>
        </div>
        <span class="modal-field-error" id="modalNewPwError"></span>
      </div>

      <div class="modal-field">
        <label class="modal-label" for="modalConfirmPw">Confirm New Password</label>
        <div style="position:relative;">
          <input class="modal-input" id="modalConfirmPw" type="password"
                 placeholder="••••••••" autocomplete="new-password"
                 style="padding-right:3rem;" />
          <button class="modal-pw-toggle" type="button" data-target="modalConfirmPw"
                  aria-label="Toggle confirm password visibility">
            <i data-lucide="eye"     style="width:16px;height:16px;"></i>
            <i data-lucide="eye-off" style="width:16px;height:16px;display:none;"></i>
          </button>
        </div>
        <span class="modal-field-error" id="modalConfirmPwError"></span>
      </div>

      <button class="modal-submit-btn" id="modalChangePwBtn" type="button">
        Update Password
        <i data-lucide="shield-check"></i>
      </button>
    `,
  }),
};

// ─── HANDLERS ────────────────────────────────────────────────────

export function initModalHandlers(type, data) {
  if (type === 'deposit')    initDepositHandlers(data);
  if (type === 'withdrawal') initWithdrawHandlers(data);
  if (type === 'change_password') initChangePwHandlers();
  if (type === 'txn_detail')  document.getElementById('modalDoneBtn')?.addEventListener('click', closeModal);
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

  btn?.addEventListener('click', async () => {
    const amount = parseFloat(inputEl.value);

    if (!inputEl.value || isNaN(amount)) {
      showFieldError(inputEl, errorEl, 'Please enter an amount.');
      return;
    }
    if (amount < MIN_DEPOSIT) {
      showFieldError(inputEl, errorEl, `Minimum deposit is ${formatNaira(MIN_DEPOSIT)}.`);
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Processing...';

    const { data: result, error } = await supabase.rpc('process_deposit', {
      p_amount: amount,
    });

    if (error || result?.error) {
      btn.disabled    = false;
      btn.textContent = 'Proceed to Payment';
      showFieldError(inputEl, errorEl, result?.error || 'Something went wrong. Try again.');
      return;
    }

    if (window.__ghResetTransactions) window.__ghResetTransactions();

    swapToReceipt(`
      <div class="modal-receipt">
        <div class="modal-receipt__icon">
          <i data-lucide="check"></i>
        </div>
        <p class="modal-receipt__heading">Deposit Initiated</p>
        <p class="modal-receipt__sub">Your payment is being processed.</p>
        <div class="modal-receipt__card">
          <div class="modal-receipt__row">
            <span class="modal-receipt__key">Amount</span>
            <span class="modal-receipt__val">${formatNaira(amount)}</span>
          </div>
          <div class="modal-receipt__divider"></div>
          <div class="modal-receipt__row">
            <span class="modal-receipt__key">Reference</span>
            <span class="modal-receipt__val">${result.reference}</span>
          </div>
          <div class="modal-receipt__divider"></div>
          <div class="modal-receipt__row">
            <span class="modal-receipt__key">Status</span>
            <span class="modal-receipt__val">Pending confirmation</span>
          </div>
        </div>
        <p class="modal-receipt__ref">ref: ${result.reference}</p>
        <button class="modal-done-btn" id="modalDoneBtn" type="button">Done</button>
      </div>
    `);
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

  btn?.addEventListener('click', async () => {
  const amount  = parseFloat(amountEl.value);
  const bank    = bankEl.value.trim();
  const accNum  = accNumEl.value.trim();
  const accName = accNameEl.value.trim();

  // Client-side validation first (UX only — server re-validates)
  if (!amountEl.value || isNaN(amount)) {
    showFieldError(amountEl, errorEl, 'Please enter an amount.');
    return;
  }
  if (amount < MIN_WITHDRAWAL) {
    showFieldError(amountEl, errorEl, `Minimum withdrawal is ${formatNaira(MIN_WITHDRAWAL)}.`);
    return;
  }
  if (!bank)              { bankEl.classList.add('is-error');   bankEl.focus();   return; }
  if (accNum.length !== 10) { accNumEl.classList.add('is-error'); accNumEl.focus(); return; }
  if (!accName)           { accNameEl.classList.add('is-error'); accNameEl.focus(); return; }

  btn.disabled    = true;
  btn.textContent = 'Submitting...';

  const { data: result, error } = await supabase.rpc('process_withdrawal', {
    p_amount:     amount,
    p_bank:       bank,
    p_acc_number: accNum,
    p_acc_name:   accName,
  });

  if (error || result?.error) {
    btn.disabled    = false;
    btn.textContent = 'Request Withdrawal';
    showFieldError(amountEl, errorEl, result?.error || 'Something went wrong. Try again.');
    return;
  }

  if (window.__ghResetTransactions) window.__ghResetTransactions();

  // Update wallet balance in home card without reload
  if (window.__ghUpdateWalletBalance) window.__ghUpdateWalletBalance(result.remaining_balance);

  swapToReceipt(`
    <div class="modal-receipt">
      <div class="modal-receipt__icon">
        <i data-lucide="check"></i>
      </div>
      <p class="modal-receipt__heading">Withdrawal Requested</p>
      <p class="modal-receipt__sub">Your request has been submitted.</p>
      <div class="modal-receipt__card">
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
          <span class="modal-receipt__key">Account</span>
          <span class="modal-receipt__val">${accNum} · ${accName}</span>
        </div>
        <div class="modal-receipt__divider"></div>
        <div class="modal-receipt__row">
          <span class="modal-receipt__key">Reference</span>
          <span class="modal-receipt__val">${result.reference}</span>
        </div>
        <div class="modal-receipt__divider"></div>
        <div class="modal-receipt__row">
          <span class="modal-receipt__key">Remaining Balance</span>
          <span class="modal-receipt__val">${formatNaira(result.remaining_balance)}</span>
        </div>
      </div>
      <p class="modal-receipt__ref">ref: ${result.reference}</p>
      <button class="modal-done-btn" id="modalDoneBtn" type="button">Done</button>
    </div>
  `);
});
}


// ── Change Password ──────────────────────────────────────────────

function initChangePwHandlers() {
  // Wire toggle buttons — lucide icons already rendered by openModal
  document.querySelectorAll('#modalBody .modal-pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.querySelectorAll('[data-lucide]').forEach(icon => {
        // first icon = eye, second = eye-off
        const isEyeOff = icon.getAttribute('data-lucide') === 'eye-off';
        icon.style.display = showing ? (isEyeOff ? 'none' : '') : (isEyeOff ? '' : 'none');
      });
    });
  });

  const newPwEl   = document.getElementById('modalNewPw');
  const confirmEl = document.getElementById('modalConfirmPw');
  const newErrEl  = document.getElementById('modalNewPwError');
  const confErrEl = document.getElementById('modalConfirmPwError');
  const submitBtn = document.getElementById('modalChangePwBtn');

  newPwEl?.addEventListener('input',   () => { newPwEl.classList.remove('is-error');   if (newErrEl)  newErrEl.textContent  = ''; });
  confirmEl?.addEventListener('input', () => { confirmEl.classList.remove('is-error'); if (confErrEl) confErrEl.textContent = ''; });

  submitBtn?.addEventListener('click', async () => {
    const newPw   = newPwEl?.value   || '';
    const confirm = confirmEl?.value || '';
    let valid = true;

    if (newPw.length < 8) {
      newPwEl?.classList.add('is-error');
      if (newErrEl) newErrEl.textContent = 'Password must be at least 8 characters.';
      valid = false;
    }

    if (newPw !== confirm) {
      confirmEl?.classList.add('is-error');
      if (confErrEl) confErrEl.textContent = "Passwords don't match.";
      valid = false;
    }

    if (!valid) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Updating...';

    const { error } = await supabase.auth.updateUser({ password: newPw });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Update Password <i data-lucide="shield-check"></i>';
      if (window.lucide) lucide.createIcons({ nodes: [submitBtn] });
      newPwEl?.classList.add('is-error');
      if (newErrEl) newErrEl.textContent = error.message || 'Update failed. Please try again.';
      return;
    }

    swapToReceipt(`
      <div class="modal-receipt">
        <div class="modal-receipt__icon">
          <i data-lucide="shield-check"></i>
        </div>
        <p class="modal-receipt__heading">Password Updated</p>
        <p class="modal-receipt__sub">Your password has been changed successfully.</p>
        <button class="modal-done-btn" id="modalDoneBtn" type="button">Done</button>
      </div>
    `);
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


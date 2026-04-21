
/**
 * dashboard.js — GrowthHaven Dashboard Entry
 */

// ─── CSS IMPORTS (Vite handles these) ────────────────────────
import '../assets/styles/fonts.css'
import '../assets/styles/variables.css'
import '../assets/styles/utils.css'
import '../assets/styles/style.css'
import '../assets/styles/animations.css'
import '../assets/styles/landing.css'
import '../assets/styles/queries.css'
import '../assets/styles/transactions.css'
import '../assets/styles/dashboard.css'  
import '../assets/styles/support.css';

// ── Modal & Profile system ──
import './modal.css';
import '../assets/styles/profile.css';

import { initProfile } from './profile.js';
import { initTransactions, resetTransactions } from './transactions.js';
import { openModal } from './modal.js';
import { getInitials, formatDate } from '../assets/js/utils.js';
import { supabase } from '../assets/js/supabase.js';

// ─── CONFIG ──────────────────────────────────────────────────
// This is the full URL of your register page.
// In prod, change this to your actual domain.
const REGISTER_URL = `${window.location.origin}/src/register/`;


// ─── GLOBALS ──────────────────────────────────────────────────
window.__ghResetTransactions = resetTransactions;

window.__ghUpdateWalletBalance = (newBalance) => {
  currentWalletBalance = newBalance;
  const el = document.getElementById('walletBalance');
  if (el) el.textContent = Number(newBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 });
};

// ─── DOM REFS ────────────────────────────────────────────────
const greetingText = document.getElementById('greetingText');
const avatarEl     = document.getElementById('avatarInitials');
const headerNameEl = document.getElementById('headerName');
const refCodeEl    = document.getElementById('refCode');
const refLinkEl    = document.getElementById('refLink');
const copyCodeBtn  = document.getElementById('copyCodeBtn');
const copyLinkBtn  = document.getElementById('copyLinkBtn');
const signoutBtn   = document.getElementById('signoutBtn');

let currentWalletBalance = 0;

// ─── AUTH GUARD ──────────────────────────────────────────────
// Reads from localStorage — instant, no network call.
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  window.location.href = '/src/login/';
  throw new Error('No session.');
}

const user = session.user;

// ─── PERSONALISE ─────────────────────────────────────────────
const firstName = user.user_metadata?.first_name || '';
const lastName  = user.user_metadata?.last_name  || '';
const initials  = (firstName[0] || '') + (lastName[0] || '');

avatarEl.textContent    = initials.toUpperCase() || '?';
headerNameEl.textContent = firstName ? `${firstName} ${lastName}`.trim() : '';

if (firstName) {
  greetingText.textContent = `Good day, ${firstName}.`;
}

// ─── FETCH MEMBER DATA ────────────────────────────────────────
const { data: member, error: memberError } = await supabase
  .from('members')
  .select('referral_code, wallet_balance, vault_balance')
  .eq('id', user.id)
  .single();

if (memberError || !member?.referral_code) {
  console.error('[dashboard] Member profile error:', memberError);
  refCodeEl.textContent = 'Error — contact support';
  refCodeEl.classList.remove('skeleton');
  refLinkEl.textContent = 'Could not load link';
  refLinkEl.classList.remove('skeleton');
} else {
  const code = member.referral_code;
  const link = `${REGISTER_URL}?ref=${code}`;

  // ── Code card ──
  refCodeEl.textContent = code;
  refCodeEl.classList.remove('skeleton');
  copyCodeBtn.disabled = false;

  // ── Link card — highlight the code part ──
  refLinkEl.innerHTML =
    `${REGISTER_URL}?ref=<span class="ref-highlight">${code}</span>`;
  refLinkEl.classList.remove('skeleton');
  copyLinkBtn.disabled = false;

  copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => flashCopied(copyCodeBtn));
  });

  copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(link).then(() => flashCopied(copyLinkBtn));
  });
}

// ─── SET BALANCES FROM MEMBER ROW ────────────────────────────
if (member) {
  // Set the JS variable — this is what gates the invest tiles
  currentWalletBalance = Number(member.wallet_balance || 0);

  // Home — Wallet card display
  const walletBalanceEl = document.getElementById('walletBalance');
  if (walletBalanceEl) {
    walletBalanceEl.textContent = currentWalletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 });
    walletBalanceEl.classList.remove('skeleton');
  }

  // Home — Vault card display
  const vaultBal = Number(member.vault_balance || 0);
  const vaultBalanceEl = document.getElementById('vaultBalance');
  const vaultBtn = document.getElementById('fundVaultBtn');
  if (vaultBalanceEl) {
    vaultBalanceEl.textContent = vaultBal.toLocaleString('en-NG', { minimumFractionDigits: 2 });
    vaultBalanceEl.classList.remove('skeleton');
  }
  vaultBtn.textContent = vaultBal > 0 ? 'View Plan' : 'Fund Vault';
  vaultBtn.disabled = vaultBal > 0 ? false : true;
  vaultBtn.addEventListener("click", ()=> {
    const investNavBtn = document.querySelector('[data-nav ="invest"]');
    investNavBtn.click();
  })

  // Home — Vault tier info: clear skeleton, show default until investments is wired
  const vaultTierEl = document.getElementById('vaultTierInfo');
  if (vaultTierEl) {
    vaultTierEl.textContent = vaultBal > 0 ? 'Active plan' : 'No active plan';
    vaultTierEl.classList.remove('skeleton');
  }
}


// ─── COPY FEEDBACK ───────────────────────────────────────────
function flashCopied(btn) {
  btn.classList.add('copied');
  btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i>';
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = '<i data-lucide="copy" style="width:14px;height:14px"></i>';
    if (window.lucide) lucide.createIcons();
  }, 2000);
}

// ─── SIGN OUT ─────────────────────────────────────────────────
if (signoutBtn) {
  signoutBtn.addEventListener('click', async () => {
    signoutBtn.disabled = true;
    signoutBtn.querySelector('span').textContent = 'Signing out...';
    await supabase.auth.signOut();
    localStorage.removeItem('gh_reg_step');
    localStorage.removeItem('gh_reg_email');
    window.location.href = '/src/login/';
  });
}


// ─── REFERRALS ────────────────────────────────────────────────
const refListEl  = document.getElementById('refList');
const refEmptyEl = document.getElementById('refEmpty');
const refCountEl = document.getElementById('refCount');

function renderReferralRow(ref) {
  const row = document.createElement('div');
  row.className = 'dash-ref-row';

  const deposited = ref.has_deposited;

  row.innerHTML = `
    <div class="flex flex-col items-center gap-3">
      <div class="flex gap-4">
        <div class="dash-ref-avatar">${getInitials(ref.first_name, ref.last_name)}</div>
        <div class="flex-col">
          <span class="dash-ref-name">${ref.first_name || ''} ${ref.last_name || ''}</span>
          <span class="dash-ref-meta">Joined ${formatDate(ref.created_at)}</span>
          <div class="flex">
            <span class="dash-ref-pill ${deposited ? 'dash-ref-pill--deposited' : 'dash-ref-pill'}">
              ${deposited ? 'Deposited' : 'Not Deposited'}
            </span>
          </div>
        </div>
      </div>
      </div>
  `;

  return row;
}

(async () => {
  const { data: referrals, error: refError } = await supabase.rpc('get_my_referrals');

  // Clear skeletons regardless of outcome
  refListEl.innerHTML = '';
  refCountEl.classList.remove('skeleton');

  if (refError) {
    console.error('[dashboard] Referrals fetch error:', refError);
    refCountEl.textContent = '—';
    refEmptyEl.classList.remove('hidden');
    return;
  }
  // remove empty state
  if (referrals) {
    refEmptyEl.style.display = 'none';
  }
  
  if (!referrals || referrals.length === 0) {
    refCountEl.textContent = '0';
    refEmptyEl.style.display = 'flex';
    refEmptyEl.classList.remove('hidden');
    return;
  }

  // Populate count badge
  refCountEl.textContent = `${referrals.length} total`;

  // Render each row
  referrals.forEach(ref => {
    refListEl.appendChild(renderReferralRow(ref));
  });
})();
 
 
// ─── RECENT ACTIVITY ─────────────────────────────────────────────

/**
 * renderActivity(data)
 * Renders transaction rows into #activityList.
*
* Expected shape of each item in data[]:
*   { type, label, amount, created_at }
*
* Types: 'deposit' | 'withdrawal' | 'vault_fund' |
*        'daily_claim' | 'referral_bonus' | 'vault_maturity'
*
* Call with an empty array to show the empty state.
* Wire to a real Supabase query when the transactions table is ready.
*/
const activityListEl = document.getElementById('activityList');
function renderActivity(data) {
  if (!activityListEl) return;
  activityListEl.innerHTML = '';
 
  if (!data || data.length === 0) {
    activityListEl.innerHTML = `
      <div class="dash-ref-empty flex-col-center" style="padding: 2.5rem 1.5rem;">
        <div class="dash-ref-empty__icon flex-center">
          <i data-lucide="clock" style="width:20px;height:20px"></i>
        </div>
        <p class="dash-ref-empty__title">No recent activity yet</p>
        <p class="dash-ref-empty__sub">Your transactions will appear here once activity starts.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ nodes: [activityListEl] });
    return;
  }
 
  const iconMap = {
    deposit:        'arrow-down-to-line',
    withdrawal:     'arrow-up-right',
    vault_fund:     'shield',
    daily_claim:    'sun',
    early_exit: 'door-open',
    referral_bonus: 'users',
    vault_maturity: 'lock-open',
  };
 
  const inboundTypes = new Set(['deposit', 'daily_claim', 'early_exit', 'referral_bonus', 'vault_maturity']);
 
  data.forEach(item => {
    const icon     = iconMap[item.type] || 'circle';
    const isIn     = inboundTypes.has(item.type);
    const sign     = isIn ? '+' : '-';
    const amount   = Number(item.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
 
    const row = document.createElement('div');
    row.className = 'dash-activity-row';
    row.innerHTML = `
      <div class="dash-activity-row__left flex items-center gap-3">
        <div class="dash-activity-row__icon dash-activity-row__icon--${item.type} flex-center">
          <i data-lucide="${icon}" style="width:14px;height:14px"></i>
        </div>
        <div class="flex flex-col gap-1">
          <span class="dash-activity-row__label">${item.label || item.type}</span>
          <span class="dash-activity-row__date">${formatDate(item.created_at)}</span>
        </div>
      </div>
      <span class="dash-activity-row__amount ${isIn ? 'dash-activity-row__amount--in' : ''}">
        ${sign}₦${amount}
      </span>
    `;
    activityListEl.appendChild(row);
  });
 
  if (window.lucide) lucide.createIcons({ nodes: [activityListEl] });
}
 
// Stub call — shows empty state until backend is wired


async function fetchTransactions(userId) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('type, label, amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    return data ?? [];
  } catch (error) {
    renderActivity([]);
    return null;
  }
}

const transactions = await fetchTransactions(user.id);
if (transactions) renderActivity(transactions);
 
 
// ─── SPA NAVIGATION ──────────────────────────────────────────────
const sections   = document.querySelectorAll('.dash-section');
const navLinks   = document.querySelectorAll('[data-nav]');
const sidebar    = document.getElementById('dashSidebar');
const overlay    = document.getElementById('sidebarOverlay');
const hamburger  = document.getElementById('sidebarToggle');
 
function closeSidebar() {
  sidebar?.classList.remove('is-open');
  overlay?.classList.remove('is-open');
  hamburger?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
 
function openSidebar() {
  sidebar?.classList.add('is-open');
  overlay?.classList.add('is-open');
  hamburger?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden'; // prevent scroll behind overlay on mobile
}
 
export function switchSection(name) {
  // save current section to Local Storage
  localStorage.setItem('gh_current_tab', name);

  // Hide all, strip active class
  sections.forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('section--active');
  });
  navLinks.forEach(l => l.classList.remove('nav-active'));
 
  const target = document.getElementById(`section-${name}`);
  const link   = document.querySelector(`[data-nav="${name}"]`);
 
  if (target) {
    target.classList.remove('hidden');
    void target.offsetWidth; // force reflow — restarts the CSS animation each switch
    target.classList.add('section--active');
  }
 
  if (link) link.classList.add('nav-active');
 
  closeSidebar();
}
 
// ── Hamburger toggle ──
hamburger?.addEventListener('click', () => {
  sidebar?.classList.contains('is-open') ? closeSidebar() : openSidebar();
});
 
// ── Overlay click closes sidebar ──
overlay?.addEventListener('click', closeSidebar);
 
// ── Escape key closes sidebar ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar?.classList.contains('is-open')) {
    closeSidebar();
  }
});
 
// ── Nav link clicks ──
navLinks.forEach(link => {
  link.addEventListener('click', () => switchSection(link.dataset.nav));
});

// In initInvestEvents or after switchSection is defined:
const investSection = document.getElementById('section-invest');
const investObserver = new MutationObserver(() => {
  if (!investSection.classList.contains('hidden')) {
    loadInvestmentSection();
  }
});
investObserver.observe(investSection, { attributes: true, attributeFilter: ['class'] });
 
// ── Sidebar sign-out button ──
const sidebarSignoutBtn = document.getElementById('sidebarSignoutBtn');
sidebarSignoutBtn?.addEventListener('click', async () => {
  sidebarSignoutBtn.disabled = true;
  sidebarSignoutBtn.querySelector('span').textContent = 'Signing out...';
  await supabase.auth.signOut();
  localStorage.removeItem('gh_reg_step');
  localStorage.removeItem('gh_reg_email');
  window.location.href = '/src/login/';
});


// ── Initialize user Profile ──
initProfile(user);

// ── Init transactions section (lazy-loads data on first visit) ──
initTransactions(user.id);
 

/**
 * INVESTMENTS SECTION
 */

// ─── RATE TABLE ──────────────────────────────────────────────────
// Source of truth for all rate lookups. Do not compute inline.
const PLAN_DURATIONS = [
  { days: 7,  label: '7-Day Fast Plan',       shortLabel: 'Fast' },
  { days: 14, label: '14-Day Standard Plan',   shortLabel: 'Standard' },
  { days: 30, label: '30-Day VIP Plan',        shortLabel: 'VIP' },
];

const PLAN_AMOUNTS = [6000, 12000, 30000, 50000, 100000];


/**
 * Returns { dailyRate, totalRate } for a given amount + duration combo.
 * dailyRate and totalRate are plain numbers (e.g. 5, 35 — not 0.05, 0.35).
 */
function getPlanRate(amount, durationDays) {
  const isHighTier = amount >= 50000;
  if (durationDays === 7)  return isHighTier ? { dailyRate: 6,   totalRate: 42  } : { dailyRate: 5,   totalRate: 35  };
  if (durationDays === 14) return isHighTier ? { dailyRate: 4.5, totalRate: 63  } : { dailyRate: 4,   totalRate: 56  };
  if (durationDays === 30) return isHighTier ? { dailyRate: 3.5, totalRate: 105 } : { dailyRate: 3,   totalRate: 90  };
  return { dailyRate: 0, totalRate: 0 }; // fallback — should never hit
}

/**
 * Returns projected earnings in ₦, capped at the original amount (2x hard cap).
 */
function getProjectedEarnings(amount, durationDays) {
  const { totalRate } = getPlanRate(amount, durationDays);
  const raw = amount * (totalRate / 100);
  return Math.min(raw, amount); // 2x cap: earnings never exceed deposit
}

/**
 * Returns the maturity Date object, shifted to Monday if it falls on a weekend.
 */
function getPayoutDate(startDate, durationDays) {
  const maturity = new Date(startDate);
  maturity.setDate(maturity.getDate() + durationDays);
  const day = maturity.getDay(); // 0=Sun, 6=Sat
  if (day === 6) maturity.setDate(maturity.getDate() + 2); // Sat → Mon
  if (day === 0) maturity.setDate(maturity.getDate() + 1); // Sun → Mon
  return maturity;
}

/**
 * Formats a Date object as "Mon 24 Apr 2026".
 */
function formatPayoutDate(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

/**
 * Formats a number as ₦X,XXX.XX
 */
function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

/**
 * Returns whether the current time (WAT = UTC+1) has passed midnight.
 * Used to determine if the claim window has closed for today.
 */
function isClaimWindowOpen() {
  // WAT is UTC+1
  const nowWAT = new Date(Date.now() + 60 * 60 * 1000); // shift to WAT
  // Claim window: 9 AM – midnight WAT
  const hours = nowWAT.getUTCHours();
  return hours >= 9; // before midnight, after 9 AM WAT
}


// ─── TOAST ───────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const existing = document.querySelector('.invest-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `invest-toast invest-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}


// ─── STUB ACTIVE PLAN DATA ────────────────────────────────────────
// Replace this with a real Supabase query when the schema is ready.
// Shape:
//   { amount, durationDays, startDate (ISO string),
//     dailyRate, accruedEarnings, claimedToday (bool),
//     claimableAmount }



// ─── INVESTMENTS — MAIN LOADER ────────────────────────────────────

async function loadInvestmentSection() {
  const emptyState  = document.getElementById('investEmptyState');
  const activeState = document.getElementById('investActiveState');
  const createFlow  = document.getElementById('createPlanFlow');

  if (!emptyState || !activeState || !createFlow) return;

  // Hide all three states first
  emptyState.classList.add('hidden');
  activeState.classList.add('hidden');
  createFlow.classList.add('hidden');

  let activePlan = null;
  const { data, error } = await supabase
    .from('investments')
    .select('amount, duration_days, daily_rate, accrued_earnings, claimed_today, claimable_amount, start_date, last_claimed_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (data) {
    activePlan = {
      amount: data.amount,
      durationDays: data.duration_days,
      startDate: data.start_date,
      dailyRate: data.daily_rate * 100,
      accruedEarnings: data.accrued_earnings,
      claimedToday: data.last_claimed_at
        ? new Date(data.last_claimed_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' }) 
          === new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' })
        : false,
      claimableAmount: data.claimable_amount,
    };
  } else if (error && error.code !== 'PGRST116') {
    console.error('[invest] loadInvestmentSection error:', error);
  }

  if (!activePlan) {
    emptyState.classList.remove('hidden');
    initEarlyExitToggle(); // still bind it, safe if not in view
    return;
  }

  // Active plan — populate all cards
  populateActivePlan(activePlan);
  populateEarningsCard(activePlan);
  populateEarlyExit(activePlan);

  activeState.classList.remove('hidden');
}


// ─── POPULATE — ACTIVE PLAN CARD ─────────────────────────────────

function populateActivePlan(plan) {
  const amountEl    = document.getElementById('activePlanAmount');
  const labelEl     = document.getElementById('activePlanLabel');
  const progressEl  = document.getElementById('activePlanProgress');
  const progressLbl = document.getElementById('activePlanProgressLabel');
  const remainingEl = document.getElementById('activePlanRemaining');
  const maturityEl  = document.getElementById('activePlanMaturity');

  if (!amountEl) return;

  const { dailyRate } = getPlanRate(plan.amount, plan.durationDays);
  const durationDef   = PLAN_DURATIONS.find(d => d.days === plan.durationDays);
  const planLabel     = durationDef ? `${durationDef.label} · ${dailyRate}% daily` : `${plan.durationDays}-Day Plan`;

  const start     = new Date(plan.startDate);
  const today     = new Date();
  const msPerDay  = 1000 * 60 * 60 * 24;
  const daysIn    = Math.max(0, Math.floor((today - start) / msPerDay));
  const daysLeft  = Math.max(0, plan.durationDays - daysIn);
  const pct       = Math.min(100, Math.round((daysIn / plan.durationDays) * 100));

  const payoutDate    = getPayoutDate(plan.startDate, plan.durationDays);
  const payoutFormatted = formatPayoutDate(payoutDate);

  amountEl.textContent = formatNaira(plan.amount).replace('₦', '');
  amountEl.classList.remove('skeleton');

  if (labelEl) {
    labelEl.textContent = planLabel;
    labelEl.classList.remove('skeleton');
  }

  if (progressEl) progressEl.style.width = `${pct}%`;

  if (progressLbl) {
    progressLbl.textContent = `Day ${daysIn} of ${plan.durationDays}`;
    progressLbl.classList.remove('skeleton');
  }

  if (remainingEl) {
    remainingEl.textContent = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
    remainingEl.classList.remove('skeleton');
  }

  if (maturityEl) {
    maturityEl.textContent = payoutFormatted;
    maturityEl.classList.remove('skeleton');
  }
}


// ─── POPULATE — EARNINGS CARD ─────────────────────────────────────

function populateEarningsCard(plan) {
  const claimableEl = document.getElementById('claimableAmount');
  const accruedEl   = document.getElementById('totalAccrued');
  const claimBtn    = document.getElementById('claimBtn');

  if (!claimableEl) return;

  const expectedYield = Math.round(plan.amount * plan.dailyRate) / 100;
  // dailyRate comes in as a percentage (e.g. 5 for 5%), amount * rate / 100
  const displayYield = plan.claimedToday
    ? 0
    : plan.claimableAmount > 0
      ? plan.claimableAmount
      : +(plan.amount * (plan.dailyRate / 100)).toFixed(2);
  claimableEl.textContent = formatNaira(displayYield).replace('₦', '');
  claimableEl.classList.remove('skeleton');

  if (accruedEl) {
    accruedEl.textContent = formatNaira(plan.accruedEarnings || 0);
  }

  if (!claimBtn) return;

  const windowOpen = isClaimWindowOpen();

  // Remove all state classes before applying the correct one
  claimBtn.classList.remove('invest-claim-btn--claimable', 'invest-claim-btn--claimed', 'invest-claim-btn--missed');

  if (plan.claimedToday) {
    claimBtn.classList.add('invest-claim-btn--claimed');
    claimBtn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px"></i> Claimed Today';
    claimBtn.disabled = true;
  } else if (!windowOpen) {
    claimBtn.classList.add('invest-claim-btn--missed');
    claimBtn.textContent = 'Missed — window closed';
    claimBtn.disabled = true;
  } else {
    claimBtn.classList.add('invest-claim-btn--claimable');
    claimBtn.innerHTML = '<i data-lucide="sun" style="width:16px;height:16px"></i> Claim Today\'s Yield';
    claimBtn.disabled = false;
    claimBtn.addEventListener('click', handleClaim, { once: true });
  }

  if (window.lucide) lucide.createIcons({ nodes: [claimBtn] });
}


// ─── EARLY EXIT ───────────────────────────────────────────────────

function populateEarlyExit(plan) {
  initEarlyExitToggle();

  const conditionsEl  = document.getElementById('exitConditionsList');
  const penaltySummEl = document.getElementById('exitPenaltySummary');
  const penaltyTextEl = document.getElementById('exitPenaltyText');
  const exitBtn       = document.getElementById('earlyExitBtn');

  if (!conditionsEl || !penaltySummEl) return;

  conditionsEl.innerHTML = '';

  const start    = new Date(plan.startDate);
  const today    = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysIn   = Math.max(0, Math.floor((today - start) / msPerDay));
  const pctDays  = daysIn / plan.durationDays;

  const projEarnings = getProjectedEarnings(plan.amount, plan.durationDays);
  const pctAccrued   = projEarnings > 0 ? (plan.accruedEarnings || 0) / projEarnings : 0;

  const cond1Met = pctDays >= 0.5;
  const cond2Met = pctAccrued >= 0.25;

  function condRow(met, text) {
    const icon = met
      ? '<i data-lucide="check" style="width:11px;height:11px"></i>'
      : '<i data-lucide="alert-circle" style="width:11px;height:11px"></i>';
    return `
      <div class="invest-exit-condition invest-exit-condition--${met ? 'met' : 'unmet'} flex items-start gap-2">
        <div class="invest-exit-condition__icon flex-center">${icon}</div>
        <span class="invest-exit-condition__text">${text}</span>
      </div>
    `;
  }

  const daysNeeded = Math.ceil(plan.durationDays * 0.5);
  const c1Text = cond1Met
    ? `You've completed ${daysIn} of ${plan.durationDays} days (${Math.round(pctDays * 100)}%) ✓`
    : `You need to reach day ${daysNeeded} before exiting (currently day ${daysIn}).`;

  const earned25 = (projEarnings * 0.25).toFixed(2);
  const c2Text = cond2Met
    ? `Your accrued earnings (${formatNaira(plan.accruedEarnings)}) meet the 25% threshold ✓`
    : `Accrue at least ${formatNaira(earned25)} before you can exit early (currently ${formatNaira(plan.accruedEarnings || 0)}).`;

  conditionsEl.innerHTML = condRow(cond1Met, c1Text) + condRow(cond2Met, c2Text);
  if (window.lucide) lucide.createIcons({ nodes: [conditionsEl] });

  if (cond1Met && cond2Met) {
    // Determine penalty tier
    const penaltyRate = pctDays < 0.7 ? 0.25 : 0.15;
    const penaltyAmount = (plan.accruedEarnings || 0) * penaltyRate;
    const net = plan.amount + (plan.accruedEarnings || 0) - penaltyAmount;

    if (penaltyTextEl) {
      penaltyTextEl.innerHTML =
        `You are <strong>${Math.round(pctDays * 100)}%</strong> through your plan. ` +
        `Exiting now forfeits <strong>${Math.round(penaltyRate * 100)}% of your accrued earnings ` +
        `(${formatNaira(penaltyAmount.toFixed(2))})</strong>. ` +
        `You will receive <strong>${formatNaira(net.toFixed(2))}</strong> back to your Wallet.`;
    }

    penaltySummEl.classList.remove('hidden');

    if (exitBtn) {
      exitBtn.addEventListener('click', handleEarlyExit, { once: true });
    }
  } else {
    penaltySummEl.classList.add('hidden');
  }
}

function initEarlyExitToggle() {
  const card   = document.getElementById('earlyExitCard');
  const toggle = document.getElementById('earlyExitToggle');
  const panel  = document.getElementById('earlyExitPanel');

  if (!toggle || !panel || !card) return;

  // ── Guard: don't stack listeners on repeated nav visits ──
  if (toggle.dataset.bound === 'true') return;
  toggle.dataset.bound = 'true';

  toggle.addEventListener('click', () => {
    const isOpen = card.classList.toggle('is-open');
    panel.setAttribute('aria-hidden', String(!isOpen));
  });
}


async function handleClaim() {
  const claimBtn    = document.getElementById('claimBtn');
  const claimableEl = document.getElementById('claimableAmount');
  const accruedEl   = document.getElementById('totalAccrued');

  if (!claimBtn) return;

  // ── Optimistic lock: prevent double-tap immediately ──
  claimBtn.disabled = true;
  claimBtn.textContent = 'Claiming...';

  const { data: claimedAmount, error } = await supabase.rpc('process_daily_claim');

  if (error) {
    // Restore the claimable state so they can retry
    claimBtn.disabled = false;
    claimBtn.classList.remove('invest-claim-btn--claimed');
    claimBtn.classList.add('invest-claim-btn--claimable');
    claimBtn.innerHTML = '<i data-lucide="sun" style="width:16px;height:16px"></i> Claim Today\'s Yield';
    if (window.lucide) lucide.createIcons({ nodes: [claimBtn] });

    // Re-attach the listener since { once: true } consumed it
    claimBtn.addEventListener('click', handleClaim, { once: true });

    showToast(error.message || 'Claim failed. Please try again.', 'warning');
    return;
  }

  // ── Surgical DOM updates — no section reload ──

  // Zero out the claimable display
  if (claimableEl) claimableEl.textContent = '0.00';

  // Add the returned amount to the running total
  if (accruedEl) {
    const current = parseFloat(
      accruedEl.textContent.replace(/[₦,]/g, '')
    ) || 0;
    accruedEl.textContent = formatNaira(current + Number(claimedAmount));
  }

  // Switch the button to claimed state
  claimBtn.classList.remove('invest-claim-btn--claimable');
  claimBtn.classList.add('invest-claim-btn--claimed');
  claimBtn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px"></i> Claimed Today';
  claimBtn.disabled = true;
  if (window.lucide) lucide.createIcons({ nodes: [claimBtn] });

  showToast('Yield claimed successfully!', 'success');

  currentWalletBalance += Number(claimedAmount);
  const walletBalanceEl = document.getElementById('walletBalance');
  if (walletBalanceEl) {
    walletBalanceEl.textContent = currentWalletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 });
  }

  // Prepend the new transaction row to the activity list without refetching
  const activityListEl = document.getElementById('activityList');
  if (activityListEl) {
    const emptyState = activityListEl.querySelector('.dash-ref-empty');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = 'dash-activity-row';
    row.innerHTML = `
      <div class="dash-activity-row__left flex items-center gap-3">
        <div class="dash-activity-row__icon dash-activity-row__icon--daily_claim flex-center">
          <i data-lucide="sun" style="width:14px;height:14px"></i>
        </div>
        <div class="flex flex-col gap-1">
          <span class="dash-activity-row__label">Daily yield claimed</span>
          <span class="dash-activity-row__date">${formatDate(new Date().toISOString())}</span>
        </div>
      </div>
      <span class="dash-activity-row__amount dash-activity-row__amount--in">
        +₦${Number(claimedAmount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
      </span>
    `;
    activityListEl.insertBefore(row, activityListEl.firstChild);
    if (window.lucide) lucide.createIcons({ nodes: [row] });
  }
}

async function handleEarlyExit() {
  const exitBtn = document.getElementById('earlyExitBtn');

  if (exitBtn) {
    exitBtn.disabled = true;
    exitBtn.textContent = 'Processing...';
  }

  const { data: netPayout, error } = await supabase.rpc('process_early_exit');

  if (error) {
    // Re-enable and re-attach so they can retry
    if (exitBtn) {
      exitBtn.disabled = false;
      exitBtn.textContent = 'Exit Early';
      exitBtn.addEventListener('click', handleEarlyExit, { once: true });
    }
    showToast(error.message || 'Exit failed. Please try again.', 'warning');
    return;
  }

  // Update wallet balance on the Home tab
  currentWalletBalance += Number(netPayout);
  const walletBalanceEl = document.getElementById('walletBalance');
  if (walletBalanceEl) {
    walletBalanceEl.textContent = currentWalletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 });
  }

  showToast(`Exit successful. ${formatNaira(netPayout)} returned to your wallet.`, 'success');

  // Reload the investment section — this is intentional unlike the claim flow.
  // The entire active plan UI needs to disappear and show the empty state.
  await loadInvestmentSection();
}

async function createPlan(amount, duration) {
  const { dailyRate, totalRate } = getPlanRate(amount, duration);
  
  const { data, error } = await supabase.rpc('create_investment_plan', {
    p_amount:        amount,
    p_duration_days: duration,
    p_daily_rate:    dailyRate / 100,   // store as decimal
    p_total_rate:    totalRate / 100,
  });

  if (error) {
    console.error('[invest] createPlan error:', error);
    showToast(error.message, 'warning');
    return;
  }

  showToast('Plan started successfully!', 'success');
  // Then reload the investment section to show State 2
  await loadInvestmentSection();
}


// ─── CREATE PLAN FLOW ─────────────────────────────────────────────

let selectedAmount   = null;
let selectedDuration = null; // number of days

// ── Show / hide flow ──

function showCreatePlanFlow() {
  const emptyState = document.getElementById('investEmptyState');
  const flow       = document.getElementById('createPlanFlow');
  if (!flow) return;

  emptyState?.classList.add('hidden');
  flow.classList.remove('hidden');

  // Sync wallet balance into the "current balance" label
  updateCreateWalletDisplay();

  // Render Step 1 tiles
  renderAmountTiles();

  // Ensure Step 1 is visible, others hidden
  goToCreateStep(1);
}

function hideCreatePlanFlow() {
  const emptyState = document.getElementById('investEmptyState');
  const flow       = document.getElementById('createPlanFlow');
  if (!flow) return;

  flow.classList.add('hidden');
  emptyState?.classList.remove('hidden');

  // Reset selections
  selectedAmount   = null;
  selectedDuration = null;
}

// ── Step navigation ──

function goToCreateStep(step) {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`createStep${n}`);
    if (!el) return;
    el.classList.toggle('hidden', n !== step);
    if (n === step) {
      void el.offsetWidth;
      el.classList.add('invest-step-enter');
      el.addEventListener('animationend', () => el.classList.remove('invest-step-enter'), { once: true });
    }
  });

  // Update progress bar
  const fill = document.getElementById('createProgressFill');
  if (fill) {
    fill.className = 'invest-create-progress__fill';
    if (step === 2) fill.classList.add('step-2');
    if (step === 3) fill.classList.add('step-3');
  }
}

// ── Step 1 — Amount tiles ──

function updateCreateWalletDisplay() {
  const el = document.getElementById('createWalletBalance');
  if (el) el.textContent = formatNaira(currentWalletBalance);
}

// ── Step 1 — Amount tiles ──

function renderAmountTiles() {
  const grid = document.getElementById('amountTilesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  PLAN_AMOUNTS.forEach(amount => {
    const insufficient = amount > currentWalletBalance;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'invest-amount-tile' + (insufficient ? ' is-disabled' : '');
    if (insufficient) tile.title = 'Insufficient wallet balance';
    tile.dataset.amount = amount;
    tile.innerHTML = `
      <span class="invest-amount-tile__amount">${formatNaira(amount)}</span>
      <span class="invest-amount-tile__tier">${amount >= 50000 ? 'Premium tier' : 'Standard tier'}</span>
    `;

    if (!insufficient) {
      tile.addEventListener('click', () => {
        grid.querySelectorAll('.invest-amount-tile').forEach(t => t.classList.remove('is-selected'));
        tile.classList.add('is-selected');
        selectedAmount = amount;

        // Clear custom input so there's no conflict
        const ci = document.getElementById('investAmount');
        if (ci) { ci.value = ''; ci.classList.remove('is-error'); }

        const next = document.getElementById('step1NextBtn');
        if (next) next.disabled = false;
      });
    }

    grid.appendChild(tile);
  });

  // ── Custom amount input — wired ONCE, outside the loop ──
  const customInput = document.getElementById('investAmount');
  if (!customInput) return;
  customInput.value = '';

  // Remove any previous listener by cloning the node
  const freshInput = customInput.cloneNode(true);
  customInput.parentNode.replaceChild(freshInput, customInput);

  freshInput.addEventListener('input', () => {
    const raw = parseFloat(freshInput.value.replace(/[^0-9.]/g, ''));

    // Deselect any tile when user types
    grid.querySelectorAll('.invest-amount-tile').forEach(t => t.classList.remove('is-selected'));

    const next = document.getElementById('step1NextBtn');

    if (!raw || isNaN(raw)) {
      selectedAmount = null;
      if (next) next.disabled = true;
      freshInput.classList.remove('is-error');
      return;
    }

    if (raw < 6000) {
      selectedAmount = null;
      if (next) next.disabled = true;
      freshInput.classList.add('is-error');
      freshInput.title = 'Minimum investment is ₦6,000';
      return;
    }

    if (raw > currentWalletBalance) {
      selectedAmount = null;
      if (next) next.disabled = true;
      freshInput.classList.add('is-error');
      freshInput.title = 'Amount exceeds your wallet balance';
      return;
    }

    freshInput.classList.remove('is-error');
    freshInput.title = '';
    selectedAmount = raw;
    if (next) next.disabled = false;
  });
}


// ── Step 2 — Duration tiles ──

function renderDurationTiles() {
  const grid = document.getElementById('durationTilesGrid');
  const amountDisplay = document.getElementById('selectedAmountDisplay');
  if (!grid || selectedAmount === null) return;

  if (amountDisplay) amountDisplay.textContent = formatNaira(selectedAmount);

  grid.innerHTML = '';

  const hypotheticalStart = new Date();

  PLAN_DURATIONS.forEach(def => {
    const { dailyRate, totalRate } = getPlanRate(selectedAmount, def.days);
    const earnings    = getProjectedEarnings(selectedAmount, def.days);
    const payout      = getPayoutDate(hypotheticalStart, def.days);
    const payoutStr   = formatPayoutDate(payout);
    const rawMaturity = new Date(hypotheticalStart.getTime() + def.days * 86400000);
    const weekendNote = (rawMaturity.getDay() === 0 || rawMaturity.getDay() === 6)
      ? ' (adjusted from weekend)' : '';

    const tile = document.createElement('button');
    tile.type  = 'button';
    tile.className = 'invest-duration-tile';
    tile.dataset.duration = def.days;
    tile.innerHTML = `
      <div class="invest-duration-tile__header">
        <span class="invest-duration-tile__name">${def.label}</span>
        <span class="invest-duration-tile__daily-rate">${dailyRate}% daily</span>
      </div>
      <div class="invest-duration-tile__meta">
        <div class="invest-duration-tile__stat">
          <span class="invest-duration-tile__stat-label">Total Return</span>
          <span class="invest-duration-tile__stat-value">${totalRate}%</span>
        </div>
        <div class="invest-duration-tile__stat">
          <span class="invest-duration-tile__stat-label">Projected Earnings</span>
          <span class="invest-duration-tile__stat-value">${formatNaira(earnings)}</span>
        </div>
      </div>
      <p class="invest-duration-tile__payout">
        Payout: <strong>${payoutStr}</strong>${weekendNote
          ? ` <em style="font-style:normal;font-size:0.6rem;color:var(--text-secondary)">${weekendNote}</em>`
          : ''}
      </p>
    `;

    tile.addEventListener('click', () => {
      // Deselect other duration tiles (correct class this time)
      grid.querySelectorAll('.invest-duration-tile').forEach(t => t.classList.remove('is-selected'));
      tile.classList.add('is-selected');
      selectedDuration = def.days; // correct variable

      const next = document.getElementById('step2NextBtn');
      if (next) next.disabled = false;
    });

    grid.appendChild(tile);
  });
}

// ── Step 3 — Review summary ──

function populateReviewSummary() {
  if (selectedAmount === null || selectedDuration === null) return;

  const { dailyRate, totalRate } = getPlanRate(selectedAmount, selectedDuration);
  const earnings = getProjectedEarnings(selectedAmount, selectedDuration);
  const payout   = getPayoutDate(new Date(), selectedDuration);

  const def = PLAN_DURATIONS.find(d => d.days === selectedDuration);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('reviewAmount',           formatNaira(selectedAmount));
  set('reviewDuration',         def?.label || `${selectedDuration} days`);
  set('reviewDailyRate',        `${dailyRate}% per day`);
  set('reviewProjectedEarnings', formatNaira(earnings));
  set('reviewPayoutDate',       formatPayoutDate(payout));

  // Update checkbox label with actual maturity date
  const checkLbl = document.getElementById('confirmCheckboxLabel');
  if (checkLbl) {
    checkLbl.textContent =
      `I understand my funds will be locked until ${formatPayoutDate(payout)} and ` +
      `daily claims must be made before midnight WAT.`;
  }
}


// ─── WIRE UP INVEST SECTION EVENTS ───────────────────────────────

(function initInvestEvents() {
  // Start a plan button (empty state CTA)
  document.getElementById('startPlanBtn')?.addEventListener('click', showCreatePlanFlow);

  // Cancel button
  document.getElementById('cancelCreateBtn')?.addEventListener('click', hideCreatePlanFlow);

  // Step 1 → Step 2
  document.getElementById('step1NextBtn')?.addEventListener('click', () => {
    if (selectedAmount === null) return;
    renderDurationTiles();
    goToCreateStep(2);
  });

  // Step 2 → Step 1 (back)
  document.getElementById('step2BackBtn')?.addEventListener('click', () => {
    selectedDuration = null;
    const next = document.getElementById('step2NextBtn');
    if (next) next.disabled = true;
    goToCreateStep(1);
  });

  // Step 2 → Step 3
  document.getElementById('step2NextBtn')?.addEventListener('click', () => {
    if (selectedDuration === null) return;
    populateReviewSummary();
    goToCreateStep(3);
  });

  // Step 3 → Step 2 (back)
  document.getElementById('step3BackBtn')?.addEventListener('click', () => {
    const checkbox = document.getElementById('confirmCheckbox');
    if (checkbox) checkbox.checked = false;
    const btn = document.getElementById('confirmPlanBtn');
    if (btn) btn.disabled = true;
    goToCreateStep(2);
  });

  // Confirm checkbox → enables confirm button
  document.getElementById('confirmCheckbox')?.addEventListener('change', function() {
    const btn = document.getElementById('confirmPlanBtn');
    if (btn) btn.disabled = !this.checked;
  });

  // Confirm & Start Plan
  document.getElementById('confirmPlanBtn')?.addEventListener('click', async () => {
    if (selectedAmount === null || selectedDuration === null) return;
    const btn = document.getElementById('confirmPlanBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
    await createPlan(selectedAmount, selectedDuration);
    const checkbox = document.getElementById('confirmCheckbox');
    if (checkbox) checkbox.checked = false;
    const capitalValue = document.querySelector('.dash-card__hint-value');
    capitalValue.textContent = formatNaira(selectedAmount);
  });
})();


// ─── KICK OFF ────────────────────────────────────────────────────
await loadInvestmentSection();



const depositBtn = document.getElementById('depositBtn');
const withdrawBtn = document.getElementById('withdrawBtn');

// ─── DEPOSIT / WITHDRAW TRIGGERS ─────────────────────────────────
depositBtn?.addEventListener('click', () => {
  openModal('deposit', {
    walletBalance: currentWalletBalance,
    userName:      `${firstName} ${lastName}`.trim(),
    userId:        user.id,
  });
});

withdrawBtn?.addEventListener('click', () => {
  openModal('withdrawal', {
    walletBalance: currentWalletBalance,
    userName:      `${firstName} ${lastName}`.trim(),
    userId:        user.id,
  });
});



// ─── SUPPORT — FAQ ACCORDION ──────────────────────────────────

(function initSupportFaq() {
  const faq = document.getElementById('supportFaq');
  if (!faq) return;

  let openItem = null;

  faq.addEventListener('click', (e) => {
    const trigger = e.target.closest('.support-faq-item__trigger');
    if (!trigger) return;

    const item = trigger.closest('.support-faq-item');
    const body = item.querySelector('.support-faq-item__body');
    const isAlreadyOpen = item === openItem;

    // Close whatever is currently open
    if (openItem) {
      openItem.classList.remove('is-open');
      openItem.querySelector('.support-faq-item__trigger').setAttribute('aria-expanded', 'false');
      openItem.querySelector('.support-faq-item__body').setAttribute('aria-hidden', 'true');
      openItem = null;
    }

    // If we clicked a different item, open it
    if (!isAlreadyOpen) {
      item.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      body.setAttribute('aria-hidden', 'false');
      openItem = item;
    }
  });
})();



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
import '../assets/styles/dashboard.css'   // dashboard-specific styles

import { getInitials, formatDate } from '../assets/js/utils.js';
import { supabase } from '../assets/js/supabase.js';

// ─── CONFIG ──────────────────────────────────────────────────
// This is the full URL of your register page.
// In prod, change this to your actual domain.
const REGISTER_URL = `${window.location.origin}/src/register/`;

// ─── DOM REFS ────────────────────────────────────────────────
const greetingText = document.getElementById('greetingText');
const avatarEl     = document.getElementById('avatarInitials');
const headerNameEl = document.getElementById('headerName');
const refCodeEl    = document.getElementById('refCode');
const refLinkEl    = document.getElementById('refLink');
const copyCodeBtn  = document.getElementById('copyCodeBtn');
const copyLinkBtn  = document.getElementById('copyLinkBtn');
const signoutBtn   = document.getElementById('signoutBtn');

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
  .select('referral_code')
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
signoutBtn.addEventListener('click', async () => {
  signoutBtn.disabled = true;
  signoutBtn.querySelector('span').textContent = 'Signing out...';
  await supabase.auth.signOut();
  localStorage.removeItem('gh_reg_step');
  localStorage.removeItem('gh_reg_email');
  window.location.href = '/src/login/';
});


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
      <div class="flex gap-1">
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





// ─── WALLET & VAULT — STUB ───────────────────────────────────────
// No backend wired yet. Clears skeletons with zero balances.
// Replace the body of each IIFE with real Supabase queries when ready.
 
(async () => {
  const walletBalanceEl = document.getElementById('walletBalance');
  const vaultBalanceEl  = document.getElementById('vaultBalance');
  const vaultTierEl     = document.getElementById('vaultTierInfo');
 
  // TODO: fetch from Supabase (e.g. members.wallet_balance, members.vault_balance)
  // const { data } = await supabase.from('members').select('wallet_balance, vault_balance, plan_name, plan_rate').eq('id', user.id).single();
 
  if (walletBalanceEl) {
    walletBalanceEl.textContent = '0.00';
    walletBalanceEl.classList.remove('skeleton');
  }
 
  if (vaultBalanceEl) {
    vaultBalanceEl.textContent = '0.00';
    vaultBalanceEl.classList.remove('skeleton');
  }
 
  if (vaultTierEl) {
    // Replace with real plan info when available: `${data.plan_name} · ${data.plan_rate}% daily`
    vaultTierEl.textContent = 'No active plan';
    vaultTierEl.classList.remove('skeleton');
  }
})();
 
 
// ─── RECENT ACTIVITY ─────────────────────────────────────────────
const activityListEl = document.getElementById('activityList');
 
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
    referral_bonus: 'users',
    vault_maturity: 'lock-open',
  };
 
  const inboundTypes = new Set(['deposit', 'daily_claim', 'referral_bonus', 'vault_maturity']);
 
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
        <div class="flex-col gap-1">
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
// Replace with: renderActivity(await fetchTransactions(user.id));
renderActivity([]);
 
 
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
 
function switchSection(name) {
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
 
// ── Default: show Home on load ──
switchSection('home');
 




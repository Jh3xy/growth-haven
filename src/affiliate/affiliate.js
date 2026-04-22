
/**
 * affiliate.js — GrowthHaven Promoter Portal Entry
 */

// ─── CSS IMPORTS ─────────────────────────────────────────────
import '../assets/styles/fonts.css'
import '../assets/styles/variables.css'
import '../assets/styles/utils.css'
import '../assets/styles/style.css'
import '../assets/styles/animations.css'
import '../assets/styles/landing.css'
import '../assets/styles/queries.css'
import '../assets/styles/dashboard.css'
import '../assets/styles/transactions.css'
import '../assets/styles/affiliate.css'
import '../dashboard/modal.css'

import { supabase } from '../assets/js/supabase.js';
import { getInitials, formatDate } from '../assets/js/utils.js';


// ─── CONFIG ──────────────────────────────────────────────────
const REGISTER_URL = `${window.location.origin}/src/register/`;


// ─── DOM REFS ────────────────────────────────────────────────
const greetingText    = document.getElementById('greetingText');
const avatarEl        = document.getElementById('avatarInitials');
const headerNameEl    = document.getElementById('headerName');
const refCodeEl       = document.getElementById('refCode');
const refLinkEl       = document.getElementById('refLink');
const copyCodeBtn     = document.getElementById('copyCodeBtn');
const copyLinkBtn     = document.getElementById('copyLinkBtn');
const signoutBtn      = document.getElementById('signoutBtn');
const affiliateBalance  = document.getElementById('affiliateBalance');
const commissionPill    = document.getElementById('commissionPill');
const commissionRateVal = document.getElementById('commissionRateVal');
const withdrawBtn       = document.getElementById('withdrawBtn');


// ═══════════════════════════════════════════════════════════════
// 1. AUTH GUARD
// ═══════════════════════════════════════════════════════════════
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  window.location.href = '/src/login/';
  throw new Error('[affiliate] No session — redirecting to login.');
}

const user = session.user;


// ─── PERSONALISE HEADER ──────────────────────────────────────
const firstName = user.user_metadata?.first_name || '';
const lastName  = user.user_metadata?.last_name  || '';
const initials  = (firstName[0] || '') + (lastName[0] || '');

avatarEl.textContent     = initials.toUpperCase() || '?';
headerNameEl.textContent = firstName ? `${firstName} ${lastName}`.trim() : '';

if (firstName) {
  greetingText.textContent = `Welcome back, ${firstName}.`;
}


// ═══════════════════════════════════════════════════════════════
// 2. PROMOTER GUARD + REFERRAL CODE
// ═══════════════════════════════════════════════════════════════
const { data: member, error: memberError } = await supabase
  .from('members')
  .select('referral_code, promoter')
  .eq('id', user.id)
  .single();

if (memberError || !member) {
  console.error('[affiliate] Member fetch error:', memberError);
  window.location.href = '/src/login/';
  throw new Error('[affiliate] Could not load member record.');
}

if (!member.promoter) {
  console.warn('[affiliate] User is not a promoter — redirecting.');
  window.location.href = '/src/dashboard/';
  throw new Error('[affiliate] Access denied: not a promoter.');
}


// ═══════════════════════════════════════════════════════════════
// 3. PROMOTER PROFILE (commission rate)
// ═══════════════════════════════════════════════════════════════
(async () => {
  const { data: promoterProfile, error: promoterError } = await supabase
    .from('promoters')
    .select('assigned_commission_rate')
    .eq('user_id', user.id)
    .single();

  if (promoterError || promoterProfile?.assigned_commission_rate == null) return;

  const rate = Math.round(promoterProfile.assigned_commission_rate * 100);
  commissionRateVal.textContent = `${rate}%`;
  commissionPill.classList.add('is-loaded');
})();


// ═══════════════════════════════════════════════════════════════
// 4. REFERRAL TOOLS
// ═══════════════════════════════════════════════════════════════
if (!member.referral_code) {
  refCodeEl.textContent = 'Error — contact support';
  refCodeEl.classList.remove('skeleton');
  refLinkEl.textContent = 'Could not load link';
  refLinkEl.classList.remove('skeleton');
} else {
  const code = member.referral_code;
  const link = `${REGISTER_URL}?ref=${code}`;

  refCodeEl.textContent = code;
  refCodeEl.classList.remove('skeleton');
  copyCodeBtn.disabled = false;

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


// ═══════════════════════════════════════════════════════════════
// 5. WITHDRAW STUB — unchanged
// ═══════════════════════════════════════════════════════════════
// withdrawBtn.addEventListener('click', async () => { ... });


// ═══════════════════════════════════════════════════════════════
// 6. SIGN OUT — header button (may be null if commented out in HTML)
//    Sidebar sign out is handled in the nav section below.
// ═══════════════════════════════════════════════════════════════
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


// ═══════════════════════════════════════════════════════════════
// 7. REFERRAL DATA — fetched once, used by both section-home
//    and section-network. Stored in module-level variable.
// ═══════════════════════════════════════════════════════════════

// Shared referral cache
let allReferrals = [];

// ─── Shared row renderer (used by both sections) ─────────────
function formatRelativeTime(isoString) {
  if (!isoString) return 'Never';
  const then = new Date(isoString);
  const diffMs = Date.now() - then.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7)   return `${diffDays}d ago`;
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function renderReferralRow(ref) {
  const row = document.createElement('div');
  row.className = 'dash-ref-row';

  const deposited      = ref.has_deposited;
  const isPromoter     = ref.is_promoter;
  const relativeActive = formatRelativeTime(ref.last_active_at);

  row.innerHTML = `
    <div class="aff-ref-inner">
      <div class="flex items-center gap-3">
        <div class="dash-ref-avatar">${getInitials(ref.first_name, ref.last_name)}</div>
        <div class="aff-ref-identity">
          <div class="aff-ref-name-row flex items-center gap-2">
            <span class="dash-ref-name">${ref.first_name || ''} ${ref.last_name || ''}</span>
            ${isPromoter ? `
              <span class="aff-ref-promoter-badge flex items-center gap-1">
                <i data-lucide="shield-check" style="width:9px;height:9px;stroke-width:2.5"></i>
                Promoter
              </span>` : ''}
          </div>
          <span class="dash-ref-meta">Joined ${formatDate(ref.created_at)}</span>
          <span class="aff-ref-active flex items-center gap-1">
            <i data-lucide="circle" style="width:6px;height:6px;fill:currentColor;stroke:none"></i>
            Active ${relativeActive}
          </span>
        </div>
      </div>
      <span class="dash-ref-pill ${deposited ? 'dash-ref-pill--deposited' : 'dash-ref-pill--pending'}">
        ${deposited ? 'Deposited' : 'Pending'}
      </span>
    </div>
  `;

  if (window.lucide) lucide.createIcons({ nodes: [row] });
  return row;
}

// ─── section-home referral list ───────────────────────────────
const refListEl  = document.getElementById('refList');
const refEmptyEl = document.getElementById('refEmpty');
const refCountEl = document.getElementById('refCount');

(async () => {
  const { data: referrals, error: refError } = await supabase.rpc('get_promoter_referrals');

  refListEl.innerHTML = '';
  refCountEl.classList.remove('skeleton');

  if (refError) {
    console.error('[affiliate] Referrals fetch error:', refError);
    refCountEl.textContent = '—';
    refEmptyEl.classList.remove('hidden');
    return;
  }

  allReferrals = referrals ?? [];

  if (allReferrals.length === 0) {
    refCountEl.textContent = '0';
    refEmptyEl.style.display = 'flex';
    refEmptyEl.classList.remove('hidden');
    return;
  }

  refEmptyEl.style.display = 'none';

  const depositedCount = allReferrals.filter(r => r.has_deposited).length;
  refCountEl.textContent = depositedCount > 0
    ? `${allReferrals.length} total · ${depositedCount} deposited`
    : `${allReferrals.length} total`;

  allReferrals.forEach(ref => refListEl.appendChild(renderReferralRow(ref)));
})();


// ═══════════════════════════════════════════════════════════════
// 8. SPA NAVIGATION
// ═══════════════════════════════════════════════════════════════

const sections  = document.querySelectorAll('.dash-section');
const navLinks  = document.querySelectorAll('[data-nav]');
const sidebar   = document.getElementById('dashSidebar');
const overlay   = document.getElementById('sidebarOverlay');
const hamburger = document.getElementById('sidebarToggle');

// Track which sections have already loaded their data
const loaded = { network: false, withdrawals: false };

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
  document.body.style.overflow = 'hidden';
}

function switchSection(name) {
  sections.forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('section--active');
  });
  navLinks.forEach(l => l.classList.remove('nav-active'));

  const target = document.getElementById(`section-${name}`);
  const link   = document.querySelector(`[data-nav="${name}"]`);

  if (target) {
    target.classList.remove('hidden');
    void target.offsetWidth;
    target.classList.add('section--active');
  }

  if (link) link.classList.add('nav-active');

  // Lazy-load section data on first visit
  if (name === 'network' && !loaded.network)       loadNetworkSection();
  if (name === 'withdrawals' && !loaded.withdrawals) loadWithdrawalsSection();

  closeSidebar();
}

// ── Hamburger ──
hamburger?.addEventListener('click', () => {
  sidebar?.classList.contains('is-open') ? closeSidebar() : openSidebar();
});

// ── Overlay click ──
overlay?.addEventListener('click', closeSidebar);

// ── Escape key ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sidebar?.classList.contains('is-open')) closeSidebar();
});

// ── Nav links ──
navLinks.forEach(link => {
  link.addEventListener('click', () => switchSection(link.dataset.nav));
});

// ── Sidebar sign out ──
document.getElementById('sidebarSignoutBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('sidebarSignoutBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing out...';
  await supabase.auth.signOut();
  localStorage.removeItem('gh_reg_step');
  localStorage.removeItem('gh_reg_email');
  window.location.href = '/src/login/';
});

// ── Boot on home ──
switchSection('home');


// ═══════════════════════════════════════════════════════════════
// 9. NETWORK SECTION
//    Uses the already-fetched allReferrals cache when available.
//    If the RPC hasn't resolved yet (race), re-fetches.
// ═══════════════════════════════════════════════════════════════

async function loadNetworkSection() {
  loaded.network = true;

  const listEl    = document.getElementById('networkRefList');
  const emptyEl   = document.getElementById('networkRefEmpty');
  const countEl   = document.getElementById('networkSummaryCount');
  const depositEl = document.getElementById('networkSummaryDeposited');
  const filterTabs = document.querySelectorAll('#section-network .txn-filter-tab');

  // If allReferrals hasn't populated yet, fetch independently
  let referrals = allReferrals;
  if (referrals.length === 0) {
    const { data, error } = await supabase.rpc('get_promoter_referrals');
    if (error) {
      console.error('[network] Fetch error:', error);
      listEl.innerHTML = '';
      countEl.textContent = '—';
      emptyEl.classList.remove('hidden');
      return;
    }
    referrals = data ?? [];
    // Backfill the cache so section-home can use it if it hasn't rendered yet
    allReferrals = referrals;
  }

  function renderList(subset) {
    listEl.innerHTML = '';

    if (subset.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    subset.forEach(ref => listEl.appendChild(renderReferralRow(ref)));
  }

  function updateSummary(subset) {
    const deposited = subset.filter(r => r.has_deposited).length;
    countEl.classList.remove('skeleton');
    countEl.textContent = `${subset.length} total`;
    depositEl.textContent = deposited > 0 ? `${deposited} deposited` : '';
  }

  // Initial render — all
  renderList(referrals);
  updateSummary(referrals);

  // ── Filter tabs ──
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      const filter = tab.dataset.filter;
      let subset = referrals;
      if (filter === 'deposited') subset = referrals.filter(r => r.has_deposited);
      if (filter === 'pending')   subset = referrals.filter(r => !r.has_deposited);

      renderList(subset);
      updateSummary(subset);
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// 10. WITHDRAWALS SECTION
//     Fetches transactions of type 'withdrawal' for this user.
//     Renders using the existing txn-row classes from transactions.css.
// ═══════════════════════════════════════════════════════════════

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

async function loadWithdrawalsSection() {
  loaded.withdrawals = true;

  const listEl   = document.getElementById('withdrawalList');
  const emptyEl  = document.getElementById('withdrawalEmpty');
  const totalEl  = document.getElementById('totalWithdrawnAmount');

  const { data, error } = await supabase
    .from('transactions')
    .select('id, label, amount, status, reference, created_at')
    .eq('user_id', user.id)
    .eq('type', 'withdrawal')
    .order('created_at', { ascending: false });

  listEl.innerHTML = '';
  totalEl.classList.remove('skeleton');

  if (error) {
    console.error('[withdrawals] Fetch error:', error);
    totalEl.textContent = '—';
    emptyEl.classList.remove('hidden');
    return;
  }

  const withdrawals = data ?? [];

  if (withdrawals.length === 0) {
    totalEl.textContent = formatNaira(0);
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  // Total withdrawn — pending + completed both count as committed
  const total = withdrawals
    .filter(w => w.status !== 'failed')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  totalEl.textContent = formatNaira(total);

  withdrawals.forEach(txn => {
    const status = txn.status || 'pending';

    const statusClass = {
      completed: 'txn-row__status--completed',
      pending:   'txn-row__status--pending',
      failed:    'txn-row__status--failed',
    }[status] || 'txn-row__status--pending';

    const row = document.createElement('div');
    row.className = 'txn-row';
    row.setAttribute('role', 'listitem');

    row.innerHTML = `
      <div class="txn-row__left flex items-center gap-3">
        <div class="txn-row__icon txn-row__icon--withdrawal flex-center">
          <i data-lucide="arrow-up-right" style="width:15px;height:15px;stroke-width:2px"></i>
        </div>
        <div class="flex-col gap-1">
          <span class="txn-row__label">${txn.label || 'Withdrawal'}</span>
          <span class="txn-row__meta">${formatDate(txn.created_at)}</span>
        </div>
      </div>
      <div class="txn-row__right flex-col items-end gap-1">
        <span class="txn-row__amount">-${formatNaira(txn.amount)}</span>
        <span class="txn-row__status ${statusClass}">${status}</span>
      </div>
    `;

    if (window.lucide) lucide.createIcons({ nodes: [row] });
    listEl.appendChild(row);
  });
}

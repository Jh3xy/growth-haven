
/**
 * affiliate.js — GrowthHaven Promoter Portal Entry
 *
 * Auth flow:
 *  1. Check session  → redirect to /src/login/ if none
 *  2. Check member.promoter === true → redirect to /src/dashboard/ if false
 *  3. Fetch promoters table for commission rate
 *  4. Populate referral tools (code + link) from members.referral_code
 *  5. Fetch referrals via get_my_referrals() RPC
 */

// ─── CSS IMPORTS (Vite) ──────────────────────────────────────
import '../assets/styles/fonts.css'
import '../assets/styles/variables.css'
import '../assets/styles/utils.css'
import '../assets/styles/style.css'
import '../assets/styles/animations.css'
import '../assets/styles/landing.css'
import '../assets/styles/queries.css'
import '../assets/styles/dashboard.css'
import '../assets/styles/affiliate.css'

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
const affiliateBalance  = document.getElementById('affiliateBalance');   // target for future payout data
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
//    Single query: fetch both `promoter` flag and `referral_code`
//    so we only hit the DB once before the gate check.
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

// Non-promoters land here by mistake — send them back to their dashboard.
if (!member.promoter) {
  console.warn('[affiliate] User is not a promoter — redirecting.');
  window.location.href = '/src/dashboard/';
  throw new Error('[affiliate] Access denied: not a promoter.');
}


// ═══════════════════════════════════════════════════════════════
// 3. PROMOTER PROFILE (commission rate)
//    Gracefully degraded — missing row just leaves the pill hidden.
// ═══════════════════════════════════════════════════════════════
(async () => {
  const { data: promoterProfile, error: promoterError } = await supabase
    .from('promoters')
    .select('assigned_commission_rate')
    .eq('user_id', user.id)
    .single();

  if (promoterError || promoterProfile?.assigned_commission_rate == null) {
    // Pill stays hidden (opacity: 0) — no rate to show yet.
    return;
  }

  // assigned_commission_rate is stored as a decimal (e.g. 0.40 = 40%)
  const rate = Math.round(promoterProfile.assigned_commission_rate * 100);
  commissionRateVal.textContent = `${rate}%`;
  commissionPill.classList.add('is-loaded');
})();


// ═══════════════════════════════════════════════════════════════
// 4. REFERRAL TOOLS
// ═══════════════════════════════════════════════════════════════
if (!member.referral_code) {
  // Shouldn't happen for a promoter, but handle gracefully.
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

  // ── Link card — highlight the code portion ──
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
// 5. WITHDRAW — MVP STUB
//    withdrawBtn is disabled in HTML (balance = ₦0.00).
//    Wire this up once you have payout logic on the backend.
//
//    To enable:
//      1. Remove `disabled` from the button in index.html
//      2. Uncomment and implement the handler below
// ═══════════════════════════════════════════════════════════════
//
// withdrawBtn.addEventListener('click', async () => {
//   withdrawBtn.disabled = true;
//   withdrawBtn.querySelector('span').textContent = 'Processing...';
//   // Call your payout RPC or edge function here.
// });


// ═══════════════════════════════════════════════════════════════
// 6. SIGN OUT
// ═══════════════════════════════════════════════════════════════
signoutBtn.addEventListener('click', async () => {
  signoutBtn.disabled = true;
  signoutBtn.querySelector('span').textContent = 'Signing out...';
  await supabase.auth.signOut();
  localStorage.removeItem('gh_reg_step');
  localStorage.removeItem('gh_reg_email');
  window.location.href = '/src/login/';
});


// ═══════════════════════════════════════════════════════════════
// 7. REFERRAL LIST
//    Reuses get_my_referrals() RPC — same as standard dashboard.
//    Schema fields used: first_name, last_name, created_at, has_deposited.
// ═══════════════════════════════════════════════════════════════
const refListEl  = document.getElementById('refList');
const refEmptyEl = document.getElementById('refEmpty');
const refCountEl = document.getElementById('refCount');

/**
 * Renders a single referral row.
 * Strictly uses schema fields: first_name, last_name, created_at, has_deposited.
 * No invented fields.
 */
function renderReferralRow(ref) {
  const row = document.createElement('div');
  row.className = 'dash-ref-row';

  const deposited = ref.has_deposited;

  row.innerHTML = `
    <div class="flex flex-col items-center gap-3">
      <div class="flex gap-1">
        <div class="dash-ref-avatar">${getInitials(ref.first_name, ref.last_name)}</div>
        <div class="flex-col">
          <span class="dash-ref-name">${(ref.first_name || '')} ${(ref.last_name || '')}</span>
          <span class="dash-ref-meta">Joined ${formatDate(ref.created_at)}</span>
          <div class="flex">
            <span class="dash-ref-pill ${deposited ? 'dash-ref-pill--deposited' : 'dash-ref-pill--pending'}">
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
    console.error('[affiliate] Referrals fetch error:', refError);
    refCountEl.textContent = '—';
    refEmptyEl.classList.remove('hidden');
    return;
  }

  if (!referrals || referrals.length === 0) {
    refCountEl.textContent = '0';
    refEmptyEl.style.display = 'flex';
    refEmptyEl.classList.remove('hidden');
    return;
  }

  refEmptyEl.style.display = 'none';
  refCountEl.textContent = `${referrals.length} total`;

  referrals.forEach(ref => refListEl.appendChild(renderReferralRow(ref)));
})();


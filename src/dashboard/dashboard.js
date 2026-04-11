
/**
 * dashboard.js — GrowthHaven Dashboard Entry
 */

// ─── CSS IMPORTS (Vite handles these) ────────────────────────
import '../assets/styles/dashboard.css'   // dashboard-specific styles

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
  greetingText.textContent = `Welcome back, ${firstName}.`;
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

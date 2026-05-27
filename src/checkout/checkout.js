

// This file is for the checkout page of Growth Haven. It will contain the code for the checkout process, including the payment gateway integration and the order summary.

// CSS
import './checkout.css';

// JS
import { supabase } from '../assets/js/supabase.js';

console.log("[checkout]: Checkout page loaded");

 
// ── Constants ─────────────────────────────────────────────────
const SESSION_MINUTES = 30          // countdown duration
const URGENT_THRESHOLD_SECONDS = 300 // go red under 5 min
 
// ── DOM refs ──────────────────────────────────────────────────
const coCountdown   = document.getElementById('coCountdown')
const coConfirmBtn  = document.getElementById('coConfirmBtn')
const coCopyAccount = document.getElementById('coCopyAccount')
const coCopyAmount  = document.getElementById('coCopyAmount')
const coCopyRef     = document.getElementById('coCopyRef')
const coStatusBanner = document.getElementById('coStatusBanner')
const coStatusText   = document.getElementById('coStatusText')
 
// ── URL param ─────────────────────────────────────────────────
/**
 * Stored now, used later by the deposit flow.
 * We do NOT trust this for any financial logic — it's only
 * the lookup key. The RPC re-verifies ownership server-side.
 */

const urlParams = new URLSearchParams(window.location.search)
export const depositRef = urlParams.get('ref')?.trim() ?? null
 
// ── Auth guard ────────────────────────────────────────────────
async function guardAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.replace('/login.html')
  }
}
 
// ── Countdown ─────────────────────────────────────────────────
// Starts from SESSION_MINUTES and counts down to 0:00.
// Stores start timestamp in sessionStorage so a page refresh
// doesn't reset the clock — the timer stays honest.
 
const STORAGE_KEY = `co_start_${depositRef ?? 'unknown'}`
 
function startCountdown() {
  if (!coCountdown) return
 
  // If we have a stored start time for this ref, use it.
  // Otherwise record now as the start.
  let startTime = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? '0', 10)
  if (!startTime) {
    startTime = Date.now()
    sessionStorage.setItem(STORAGE_KEY, String(startTime))
  }
 
  const totalMs = SESSION_MINUTES * 60 * 1000
 
  function tick() {
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, totalMs - elapsed)
    const totalSeconds = Math.floor(remaining / 1000)
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
    const ss = String(totalSeconds % 60).padStart(2, '0')
 
    coCountdown.textContent = `${mm}:${ss}`
 
    if (totalSeconds <= URGENT_THRESHOLD_SECONDS) {
      coCountdown.classList.add('is-urgent')
    }
 
    if (remaining <= 0) {
      coCountdown.textContent = '00:00'
      onSessionExpired()
      return
    }
 
    requestAnimationFrame(tick)
  }
 
  requestAnimationFrame(tick)
}
 
function onSessionExpired() {
  // Disable the confirm button and show a status message.
  // The deposit flow can also hook into this if needed.
  if (coConfirmBtn) {
    coConfirmBtn.disabled = true
    coConfirmBtn.textContent = 'Session Expired'
  }
  showStatus('This payment session has expired. Please start a new deposit from your dashboard.', false)
}
 
// ── Status banner ─────────────────────────────────────────────
// Exported so the deposit flow can call it too.
export function showStatus(message, isSuccess = false) {
  if (!coStatusBanner || !coStatusText) return
  coStatusText.textContent = message
  coStatusBanner.classList.toggle('is-success', isSuccess)
  coStatusBanner.hidden = false
}
 
export function hideStatus() {
  if (coStatusBanner) coStatusBanner.hidden = true
}
 
// ── Copy buttons ──────────────────────────────────────────────
// Each button reads the live text from its corresponding field
// at click time, so they work whether the field was populated
// 1 second or 60 seconds ago.
 
const COPY_MAP = {
  coCopyAccount: 'coAccountNumber',
  coCopyAmount:  'coAmountDisplay',
  coCopyRef:     'coReference',
}
 
async function copyFieldValue(fieldId, btn) {
  const field = document.getElementById(fieldId)
  if (!field) return
 
  const value = field.textContent?.trim()
  if (!value) return
 
  try {
    await navigator.clipboard.writeText(value)
    flashCopied(btn)
  } catch {
    // Clipboard API blocked (non-HTTPS in dev, or browser permission)
    // Graceful fallback — select the text so the user can copy manually
    const range = document.createRange()
    range.selectNode(field)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  }
}
 
function flashCopied(btn) {
  // Swap to a checkmark icon briefly, then restore
  const icon = btn.querySelector('i')
  if (!icon) return
 
  const original = icon.getAttribute('data-lucide')
  icon.setAttribute('data-lucide', 'check')
  lucide.createIcons()
 
  btn.style.color = 'var(--brand-primary)'
 
  setTimeout(() => {
    icon.setAttribute('data-lucide', original)
    lucide.createIcons()
    btn.style.color = ''
  }, 1600)
}
 
function bindCopyButtons() {
  for (const [btnId, fieldId] of Object.entries(COPY_MAP)) {
    const btn = document.getElementById(btnId)
    if (!btn) continue
    btn.addEventListener('click', () => copyFieldValue(fieldId, btn))
  }
}
 
// ── Ref guard ─────────────────────────────────────────────────
// If there's no ref in the URL at all, there's nothing to
// show — send them back to the dashboard immediately.
function guardRef() {
  if (!depositRef) {
    window.location.replace('/dashboard.html')
  }
}
 
// ── Init ──────────────────────────────────────────────────────
async function init() {
  guardRef()
  await guardAuth()
 
  lucide.createIcons()
  startCountdown()
  bindCopyButtons()
 
  // Deposit flow will call its own init function from here.
  // It will populate fields, enable copy buttons, and wire
  // up the confirm button once the transaction is verified.
}
 
init()

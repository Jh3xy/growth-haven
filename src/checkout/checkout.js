

// This file is for the checkout page of Growth Haven. It will contain the code for the checkout process, including the payment gateway integration and the order summary.

// CSS
import './checkout.css';

// JS
import { supabase } from '../assets/js/supabase.js';

console.log("[checkout]: Checkout page loaded");

 
// ── Constants ─────────────────────────────────────────────────
const SESSION_MINUTES = 30          // countdown duration
const URGENT_THRESHOLD_SECONDS = 300 // go red under 5 min
const EDGE_BASE = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
const SUPPORT_TELEGRAM = 'growthhavensupport'
 
// ── DOM refs ──────────────────────────────────────────────────
const coCountdown   = document.getElementById('coCountdown')
const coConfirmBtn  = document.getElementById('coConfirmBtn')
const coCopyAccount = document.getElementById('coCopyAccount')
const coCopyAmount  = document.getElementById('coCopyAmount')
const coCopyRef     = document.getElementById('coCopyRef')
const coStatusBanner = document.getElementById('coStatusBanner')
const coStatusText   = document.getElementById('coStatusText')

// ── Bank Config ──────────────────────────────────────────────────
const BANK_DETAILS = {
  bankName:      'Zenith Bank',    
  accountNumber: '1234567890',  
  accountName:   'GrowthHaven Ltd', 
}
 
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

function formatNaira(amount) {
  return (
    "₦" +
    Number(amount).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function populateFields(txn) {
  const amount = formatNaira(txn.amount);

  // Header
  const coRef = document.getElementById("coRef");
  const coPayChip = document.getElementById("coPayChip");
  if (coRef) coRef.textContent = txn.reference; // truncated by CSS overflow
  if (coPayChip) coPayChip.textContent = `Pay ${amount}`;

  // Title
  const coTitleAmount = document.getElementById("coTitleAmount");
  const coTitleBank = document.getElementById("coTitleBank");
  if (coTitleAmount) coTitleAmount.textContent = amount;
  if (coTitleBank) coTitleBank.textContent = BANK_DETAILS.bankName;

  // Card fields
  const coBankName = document.getElementById("coBankName");
  const coAccountNumber = document.getElementById("coAccountNumber");
  const coAmountDisplay = document.getElementById("coAmountDisplay");
  const coReference = document.getElementById("coReference");
  if (coBankName) coBankName.textContent = BANK_DETAILS.bankName;
  if (coAccountNumber) coAccountNumber.textContent = BANK_DETAILS.accountNumber;
  if (coAmountDisplay) coAmountDisplay.textContent = amount;
  if (coReference) coReference.textContent = txn.reference;

  // Enable copy buttons now that there's real data to copy
  if (coCopyAccount) coCopyAccount.disabled = false;
  if (coCopyAmount) coCopyAmount.disabled = false;
  if (coCopyRef) coCopyRef.disabled = false;

  // Enable confirm button
  if (coConfirmBtn) coConfirmBtn.disabled = false;
}



async function loadDeposit() {
  const { data, error } = await supabase.rpc("get_deposit_by_reference", {
    p_reference: depositRef,
  });

  if (error || !data || data.error) {
    const reason =
      data?.error ?? error?.message ?? "Unable to load deposit details.";
    showStatus(reason, false);
    // Leave skeletons in place so the page doesn't look broken —
    // the banner makes the situation clear.
    return;
  }

  // Guard: don't let a completed/failed deposit be re-submitted
  if (data.status === "completed") {
    showStatus(
      "This deposit has already been approved and your wallet credited.",
      true,
    );
    return;
  }

  if (data.status === "failed" || data.status === "reversed") {
    showStatus(
      "This deposit was rejected. Please start a new deposit from your dashboard.",
      false,
    );
    return;
  }

  // status === 'pending' — good to go
  populateFields(data);
}

// ─────────────────────────────────────────────────────────────
// ADDITION 3 — Confirm button handler
// INSERT: after the bindCopyButtons() function block,
//         before the guardRef() function
// ─────────────────────────────────────────────────────────────

function bindConfirmButton() {
  if (!coConfirmBtn) return;

  coConfirmBtn.addEventListener("click", async () => {
    coConfirmBtn.disabled = true;
    coConfirmBtn.classList.add("is-loading");
    coConfirmBtn.textContent = "Submitting…";
    hideStatus();

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(`${EDGE_BASE}/notify-deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reference: depositRef }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || result?.error) {
        throw new Error(result?.error ?? `Server error (${res.status})`);
      }

      // Success — payment submitted, waiting for admin
      coConfirmBtn.classList.remove("is-loading");
      coConfirmBtn.textContent = "Payment Submitted ✓";
      showStatus(
        "We have been notified. An admin will verify your transfer shortly and credit your wallet.",
        true,
      );
      // Read the formatted amount already in the DOM
      const submittedAmount = document.getElementById('coAmountDisplay')?.textContent?.trim() ?? ''
 
      setTimeout(() => {
        const message = encodeURIComponent(
          `Hello GrowthHaven Support, I have completed a deposit of ${submittedAmount} to ${BANK_DETAILS.bankName} — Account: ${BANK_DETAILS.accountNumber}. Reference: ${depositRef}. Please kindly verify my payment and credit my wallet. Thank you.`
        )

        window.open(`https://t.me/${SUPPORT_TELEGRAM}?text=${message}`, '_blank')
      }, 500)

    } catch (err) {
      console.error("[checkout] notify-deposit failed:", err);
      coConfirmBtn.disabled = false;
      coConfirmBtn.classList.remove("is-loading");
      coConfirmBtn.textContent = "I've Sent the Money";
      showStatus(
        "Could not notify our team. Please contact support with your reference: " +
          depositRef,
        false,
      );
    }
  });
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
  bindConfirmButton();
  await loadDeposit();
}
 
init()

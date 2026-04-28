/**
 * casino-modal.js — GrowthHaven Casino Result Modal
 * Self-contained — injects its own styles and DOM.
 * No dependency on the dashboard modal shell.
 *
 * Usage:
 *   import { showCasinoResult } from '../casino-modal.js'
 *
 *   showCasinoResult({
 *     won:        true,
 *     betAmount:  5000,
 *     payout:     9900,
 *     profit:     4900,
 *     multiplier: 1.98,       // optional — shown in subtitle
 *     gameLabel:  'Coin Flip', // shown in header
 *     onPlayAgain: () => reset(),
 *   })
 */

// ─── INJECT STYLES ONCE ───────────────────────────────────────
// Appended to <head> on first import — idempotent.

const STYLE_ID = 'gh-casino-modal-styles'

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = /* css */ `

/* ── OVERLAY ─────────────────────────────────────────────────── */

.cm-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  opacity: 0;
  transition: opacity 0.28s ease;
}

.cm-overlay.is-visible {
  opacity: 1;
}


/* ── PANEL ───────────────────────────────────────────────────── */

.cm-panel {
  width: 100%;
  max-width: 340px;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.32),
    0 2px 0 0 var(--border-subtle) inset;
  overflow: hidden;
  transform: scale(0.92) translateY(12px);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}

.cm-overlay.is-visible .cm-panel {
  transform: scale(1) translateY(0);
}


/* ── GLOW — win vs loss ──────────────────────────────────────── */

.cm-panel--win::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--brand-primary);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.cm-panel--loss::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--status-error);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}


/* ── BODY ────────────────────────────────────────────────────── */

.cm-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 2rem 1.5rem 1.5rem;
  text-align: center;
}


/* ── ICON ────────────────────────────────────────────────────── */

.cm-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  font-size: 1.75rem;
}

.cm-icon--win {
  background: var(--status-success-bg);
  border: 1px solid var(--status-success-border);
  animation: cm-win-pop 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.cm-icon--loss {
  background: var(--status-error-bg);
  border: 1px solid var(--status-error-border);
}

@keyframes cm-win-pop {
  0%   { transform: scale(0.6); opacity: 0; }
  60%  { transform: scale(1.15); }
  100% { transform: scale(1);   opacity: 1; }
}


/* ── LABEL (YOU WON / YOU LOST) ──────────────────────────────── */

.cm-outcome {
  font-size: 1.25rem;
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-tight);
  color: var(--text-primary);
  margin: 0 0 0.25rem;
  line-height: 1.2;
}


/* ── SUBTITLE (e.g. "Cashed out at 2.35×") ──────────────────── */

.cm-subtitle {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  margin: 0 0 1.25rem;
  line-height: 1.5;
}


/* ── AMOUNT ──────────────────────────────────────────────────── */

.cm-amount {
  font-size: clamp(2rem, 8vw, 2.75rem);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-tight);
  line-height: 1;
  margin: 0 0 0.375rem;
}

.cm-amount--win {
  color: var(--status-success-text);
  animation: cm-amount-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
}

html[data-theme='dark'] .cm-amount--win {
  color: var(--status-success);
}

.cm-amount--loss {
  color: var(--status-error-text);
}

html[data-theme='dark'] .cm-amount--loss {
  color: var(--status-error);
}

@keyframes cm-amount-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}


/* ── BET HINT ────────────────────────────────────────────────── */

.cm-bet-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 0 0 1.75rem;
}


/* ── ACTIONS ─────────────────────────────────────────────────── */

.cm-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.cm-btn-play {
  width: 100%;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: var(--brand-primary);
  color: var(--text-on-brand);
  font-family: var(--ff-primary);
  font-size: 1rem;
  font-weight: var(--fw-bold);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  box-shadow: 0 8px 24px hsla(var(--h-primary), var(--s-primary), var(--l-primary), 0.28);
  transition:
    background var(--transition-global),
    transform 0.15s var(--spring),
    box-shadow var(--transition-global);
}

.cm-btn-play:hover {
  background: var(--brand-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 12px 32px hsla(var(--h-primary), var(--s-primary), var(--l-primary), 0.38);
}

.cm-btn-play:active {
  transform: translateY(0);
}

.cm-btn-close {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ff-primary);
  font-size: 0.875rem;
  font-weight: var(--fw-medium);
  color: var(--text-secondary);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: var(--transition-global);
}

.cm-btn-close:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

`
  document.head.appendChild(style)
}


// ─── STATE ───────────────────────────────────────────────────

let activeOverlay = null

function close() {
  if (!activeOverlay) return
  activeOverlay.classList.remove('is-visible')
  // Remove after transition
  setTimeout(() => {
    activeOverlay?.remove()
    activeOverlay = null
  }, 300)
}


// ─── PUBLIC API ───────────────────────────────────────────────

/**
 * showCasinoResult
 *
 * @param {object} opts
 * @param {boolean}  opts.won
 * @param {number}   opts.betAmount
 * @param {number}   opts.payout       — total back (0 if loss)
 * @param {number}   opts.profit       — positive win, negative loss
 * @param {number}  [opts.multiplier]  — displayed in subtitle if provided
 * @param {string}  [opts.gameLabel]   — e.g. 'Coin Flip', 'Mines'
 * @param {function} opts.onPlayAgain  — called when Play Again is clicked
 */
export function showCasinoResult({
  won,
  betAmount,
  payout,
  profit,
  multiplier,
  gameLabel = '',
  onPlayAgain,
}) {
  close() // dismiss any lingering modal first

  const overlay = document.createElement('div')
  overlay.className = 'cm-overlay'

  const icon     = won ? '🏆' : '💥'
  const outcome  = won ? 'You won!' : 'You lost.'
  const amtClass = won ? 'cm-amount--win' : 'cm-amount--loss'
  const amtText  = won
    ? `+${formatNaira(payout)}`
    : `-${formatNaira(Math.abs(profit))}`

  let subtitle = gameLabel
  if (won && multiplier && multiplier > 0) {
    subtitle = `${gameLabel ? gameLabel + ' · ' : ''}${Number(multiplier).toFixed(2)}× multiplier`
  }

  overlay.innerHTML = `
    <div class="cm-panel cm-panel--${won ? 'win' : 'loss'}">
      <div class="cm-body">

        <div class="cm-icon cm-icon--${won ? 'win' : 'loss'}">
          ${icon}
        </div>

        <h2 class="cm-outcome">${outcome}</h2>
        ${subtitle ? `<p class="cm-subtitle">${subtitle}</p>` : ''}

        <p class="cm-amount ${amtClass}">${amtText}</p>
        <p class="cm-bet-hint">Bet: ${formatNaira(betAmount)}</p>

        <div class="cm-actions">
          <button class="cm-btn-play" id="cmPlayAgain" type="button">
            Play Again
          </button>
          <button class="cm-btn-close" id="cmClose" type="button">
            Close
          </button>
        </div>

      </div>
    </div>
  `

  document.body.appendChild(overlay)
  activeOverlay = overlay

  // Animate in — rAF ensures the initial opacity:0 is painted first
  requestAnimationFrame(() => overlay.classList.add('is-visible'))

  overlay.querySelector('#cmPlayAgain').addEventListener('click', () => {
    close()
    onPlayAgain?.()
  })

  overlay.querySelector('#cmClose').addEventListener('click', close)

  // Click outside panel = close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  // Escape = close
  const onKeydown = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeydown) }
  }
  document.addEventListener('keydown', onKeydown)
}


// ─── INTERNAL ─────────────────────────────────────────────────

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}


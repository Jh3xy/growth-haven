

/**
 * casino-modal.js — GrowthHaven Casino Result Modal
 * Styles live in casino-modal.css — import that in your game JS.
 *
 * Usage:
 *   import { showCasinoResult } from '../casino-modal.js'
 *
 *   showCasinoResult({
 *     won:         true,
 *     betAmount:   5000,
 *     payout:      9750,
 *     profit:      4750,
 *     multiplier:  1.95,        // optional
 *     gameLabel:  'Coin Flip',  // optional
 *     onPlayAgain: () => reset(),
 *   })
 */

let activeOverlay = null

function closeCasinoModal() {
  if (!activeOverlay) return
  activeOverlay.classList.remove('is-visible')
  setTimeout(() => {
    activeOverlay?.remove()
    activeOverlay = null
  }, 300)
}

export function showCasinoResult({
  won,
  betAmount,
  payout,
  profit,
  multiplier,
  gameLabel = '',
  onPlayAgain,
}) {
  closeCasinoModal()

  const overlay = document.createElement('div')
  overlay.className = 'cm-overlay'

  const icon = won
    ? `<i data-lucide="trophy"></i>`
    : `<i data-lucide="bomb"></i>`;
  const outcome  = won ? 'You won!' : 'You lost.'
  const amtClass = won ? 'cm-amount--win' : 'cm-amount--loss'
  const amtText  = won
    ? `+${fmt(payout)}`
    : `-${fmt(Math.abs(profit))}`

  let subtitle = ''
  if (won && multiplier && multiplier > 0) {
    subtitle = `${gameLabel ? gameLabel + ' · ' : ''}${Number(multiplier).toFixed(2)}× multiplier`
  } else if (gameLabel) {
    subtitle = gameLabel
  }

  overlay.innerHTML = `
    <div class="cm-panel cm-panel--${won ? 'win' : 'loss'}">
      <div class="cm-body">
        <div class="cm-icon cm-icon--${won ? 'win' : 'loss'}">${icon}</div>
        <h2 class="cm-outcome">${outcome}</h2>
        ${subtitle ? `<p class="cm-subtitle">${subtitle}</p>` : ''}
        <p class="cm-amount ${amtClass}">${amtText}</p>
        <p class="cm-bet-hint">Bet: ${fmt(betAmount)}</p>
        <div class="cm-actions">
          <button class="cm-btn-play" id="cmPlayAgain" type="button">Play Again</button>
          <button class="cm-btn-close" id="cmClose" type="button">Close</button>
        </div>
      </div>
    </div>
  `

  lucide.createIcons() // re-scan for lucide icons
  document.body.appendChild(overlay)
  activeOverlay = overlay

  requestAnimationFrame(() => overlay.classList.add('is-visible'))

  overlay.querySelector('#cmPlayAgain').addEventListener('click', () => {
    closeCasinoModal()
    onPlayAgain?.()
  })

  overlay.querySelector('#cmClose').addEventListener('click', ()=> {
   closeCasinoModal();
    onPlayAgain?.();
  })

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCasinoModal()
    closeCasinoModal()
    // onPlayAgain?.()
  })

  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      closeCasinoModal()
      document.removeEventListener('keydown', onKeydown)
    }
  }
  document.addEventListener('keydown', onKeydown)
}

function fmt(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}
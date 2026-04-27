/**
 * coin-flip.js — GrowthHaven Coin Flip
 */

import '../../assets/styles/fonts.css'
import '../../assets/styles/variables.css'
import '../../assets/styles/utils.css'
import '../../assets/styles/style.css'
import '../../assets/styles/animations.css'
import '../../assets/styles/landing.css'
import '../../assets/styles/queries.css'
import '../../assets/styles/dashboard.css'
import '../mines/mines.css'
import './coin-flip.css'

import { supabase } from '../../assets/js/supabase.js'

// ─── AUTH GUARD ───────────────────────────────────────────────
// Top-level await matches the mines.js pattern — blocks execution
// rather than firing an IIFE that lets the rest of the module run.
const { data: { session } } = await supabase.auth.getSession()

if (!session) {
  window.location.href = '/src/login/'
  throw new Error('[coin-flip] No session — redirecting.')
}

const user = session.user


// ─── STATE ────────────────────────────────────────────────────
const MULTIPLIER = 1.95  // 2× minus house edge

const state = {
  phase:   'idle',   // idle | flipping | result
  choice:  null,     // 'heads' | 'tails'
  won:     false,
}


// ─── DOM REFS ─────────────────────────────────────────────────
const walletDisplay   = document.getElementById('walletDisplay')
const betInput        = document.getElementById('betAmount')
const betError        = document.getElementById('betError')
const betChips        = document.getElementById('betChips')
const chooseHeads     = document.getElementById('chooseHeads')
const chooseTails     = document.getElementById('chooseTails')
const flipBtn         = document.getElementById('flipBtn')
const coinEl          = document.getElementById('coin')
const coinFaceLabel   = document.getElementById('coinFaceLabel')
const resultLabel     = document.getElementById('resultLabel')
const resultAmount    = document.getElementById('resultAmount')
const potentialWinEl  = document.getElementById('potentialWin')
const multiplierEl    = document.getElementById('multiplierDisplay')
const resultPanel     = document.getElementById('resultPanel')


// ─── HELPERS ─────────────────────────────────────────────────
function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}

function setBetError(msg) {
  if (betError) betError.textContent = msg
  betInput?.classList.toggle('is-error', !!msg)
}

function updatePotential() {
  const amount = parseFloat(betInput?.value) || 0
  if (potentialWinEl) potentialWinEl.textContent = formatNaira(amount * MULTIPLIER)
  if (multiplierEl)   multiplierEl.textContent   = `${MULTIPLIER}×`
}

function setPhase(phase) {
  state.phase = phase
  const isFlipping = phase === 'flipping'
  const isResult   = phase === 'result'
  const isIdle     = phase === 'idle'

  // Lock controls ONLY while the coin is flipping
  if (betInput)    betInput.disabled    = isFlipping
  if (flipBtn)     flipBtn.disabled     = isFlipping
  if (chooseHeads) chooseHeads.disabled = isFlipping
  if (chooseTails) chooseTails.disabled = isFlipping
  betChips?.querySelectorAll('.cf-chip').forEach(b => { b.disabled = isFlipping })

  // Coin animation class
  coinEl?.classList.toggle('coin--spinning', isFlipping)

  // Result panel
  resultPanel?.classList.toggle('hidden', isIdle || isFlipping)
}

async function loadWallet() {
  const { data, error } = await supabase
    .from('members')
    .select('wallet_balance')
    .eq('id', user.id)
    .single()

  if (!error && data && walletDisplay) {
    walletDisplay.textContent = formatNaira(data.wallet_balance)
  }
}

function selectChoice(c) {
  state.choice = c
  chooseHeads?.classList.toggle('is-selected', c === 'heads')
  chooseTails?.classList.toggle('is-selected', c === 'tails')

  // Reset result state visually when user picks a new side
  coinEl?.classList.remove('coin--win', 'coin--lose')
  if (coinFaceLabel) coinFaceLabel.textContent = c === 'heads' ? 'H' : 'T'
  coinEl?.classList.toggle('coin--tails', c === 'tails')

  resultPanel?.classList.add('hidden')
  setBetError('')
}

chooseHeads?.addEventListener('click', () => {
  selectChoice('heads');
})
chooseTails?.addEventListener('click', () => {
  selectChoice('tails');
})

// ─── FLIP ─────────────────────────────────────────────────────
flipBtn?.addEventListener('click', async () => {
  setBetError('')

  if (!state.choice) {
    setBetError('Choose Heads or Tails first.')
    return
  }

  const amount = parseFloat(betInput?.value)

  if (!amount || isNaN(amount) || amount <= 0) {
    setBetError('Enter a bet amount.')
    return
  }

  setPhase('flipping')

  // Fire RPC and hold the animation for at least 1s so the spin looks real
  const [{ data, error }] = await Promise.all([
    supabase.rpc('play_coin_flip', {
      p_bet_amount: amount,
      p_choice:     state.choice,
    }),
    new Promise(resolve => setTimeout(resolve, 1000))
  ])

  if (error || data?.error) {
    setPhase('idle')
    setBetError(data?.error || 'Something went wrong. Try again.')
    return
  }

  // Show outcome on coin
  if (coinFaceLabel) coinFaceLabel.textContent = data.outcome === 'heads' ? 'H' : 'T'
  coinEl?.classList.remove('coin--tails')
  coinEl?.classList.toggle('coin--tails', data.outcome === 'tails')
  coinEl?.classList.add(data.won ? 'coin--win' : 'coin--lose')

  // Result text
  const outcomeCap = data.outcome.charAt(0).toUpperCase() + data.outcome.slice(1)
  if (resultLabel) {
    resultLabel.textContent = data.won
      ? `${outcomeCap} — You won!`
      : `${outcomeCap} — You lost.`
  }

  if (resultAmount) {
    resultAmount.textContent = data.won
      ? `+${formatNaira(data.payout_amount)}`
      : `-${formatNaira(amount)}`
    resultAmount.style.color = data.won
      ? 'var(--status-success-text)'
      : 'var(--status-error-text)'
  }

  // Live wallet update — no re-fetch needed
  if (walletDisplay) walletDisplay.textContent = formatNaira(data.new_balance)

  setPhase('result')
})


// ─── CHIPS ───────────────────────────────────────────────────
betChips?.addEventListener('click', (e) => {
  const chip = e.target.closest('.cf-chip')
  if (!chip) return

  if (betInput) betInput.value = chip.dataset.bet
  betChips.querySelectorAll('.cf-chip').forEach(c => c.classList.toggle('is-active', c === chip))
  setBetError('')
  updatePotential()
})

betInput?.addEventListener('input', () => {
  setBetError('')
  updatePotential()
  const val = parseFloat(betInput.value)
  betChips?.querySelectorAll('.cf-chip').forEach(c => {
    c.classList.toggle('is-active', Number(c.dataset.bet) === val)
  })
})


// ─── BOOT ────────────────────────────────────────────────────
updatePotential()
await loadWallet()
if (window.lucide) lucide.createIcons()
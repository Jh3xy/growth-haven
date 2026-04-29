

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
import '../casino-modal.css'
import '../casino-utils.css'

import { supabase }         from '../../assets/js/supabase.js'
import { showCasinoResult } from '../casino-modal.js'
import { formatNaira, initRecentBets } from '../casino-utils.js'

// ─── AUTH GUARD ───────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = '/src/login/'
  throw new Error('[coin-flip] No session')
}
const user = session.user

// ─── STATE ───────────────────────────────────────────────────
const MULTIPLIER = 1.95
const state = { phase: 'idle', choice: null }

// ─── DOM REFS ────────────────────────────────────────────────
const walletDisplay  = document.getElementById('walletDisplay')
const betInput       = document.getElementById('betAmount')
const betError       = document.getElementById('betError')
const betChips       = document.getElementById('betChips')
const chooseHeads    = document.getElementById('chooseHeads')
const chooseTails    = document.getElementById('chooseTails')
const flipBtn        = document.getElementById('flipBtn')
const coinEl         = document.getElementById('coin')
const coinFaceLabel  = document.getElementById('coinFaceLabel')
const potentialWinEl = document.getElementById('potentialWin')
const multiplierEl   = document.getElementById('multiplierDisplay')

// ─── HELPERS ─────────────────────────────────────────────────
function setBetError(msg) {
  if (betError) betError.textContent = msg
  betInput?.classList.toggle('is-error', !!msg)
}

function updatePotential() {
  const amount = parseFloat(betInput?.value) || 0
  if (potentialWinEl) potentialWinEl.textContent = formatNaira(amount * MULTIPLIER)
  if (multiplierEl)   multiplierEl.textContent   = `${MULTIPLIER}×`
}

function setFlipping(isFlipping) {
  state.phase = isFlipping ? 'flipping' : 'idle'
  if (betInput)    betInput.disabled    = isFlipping
  if (flipBtn)     flipBtn.disabled     = isFlipping
  if (chooseHeads) chooseHeads.disabled = isFlipping
  if (chooseTails) chooseTails.disabled = isFlipping
  betChips?.querySelectorAll('.cf-chip').forEach(b => { b.disabled = isFlipping })
  coinEl?.classList.toggle('coin--spinning', isFlipping)
}

async function loadWallet() {
  const { data, error } = await supabase
    .from('members').select('wallet_balance').eq('id', user.id).single()
  if (!error && data && walletDisplay)
    walletDisplay.textContent = formatNaira(data.wallet_balance)
}

function selectChoice(c) {
  state.choice = c
  chooseHeads?.classList.toggle('is-selected', c === 'heads')
  chooseTails?.classList.toggle('is-selected', c === 'tails')
  coinEl?.classList.remove('coin--win', 'coin--lose')
  if (coinFaceLabel) coinFaceLabel.textContent = c === 'heads' ? 'H' : 'T'
  coinEl?.classList.toggle('coin--tails', c === 'tails')
  setBetError('')
}

function resetCoin() {
  coinEl?.classList.remove('coin--win', 'coin--lose', 'coin--tails', 'coin--spinning')
  if (coinFaceLabel)
    coinFaceLabel.textContent = state.choice === 'heads' ? 'H' : state.choice === 'tails' ? 'T' : '?'
}

// ─── CHOICE BUTTONS ──────────────────────────────────────────
chooseHeads?.addEventListener('click', () => selectChoice('heads'))
chooseTails?.addEventListener('click', () => selectChoice('tails'))

// ─── FLIP ────────────────────────────────────────────────────
flipBtn?.addEventListener('click', async () => {
  setBetError('')
  if (!state.choice) { setBetError('Choose Heads or Tails first.'); return }
  const amount = parseFloat(betInput?.value)
  if (!amount || isNaN(amount) || amount <= 0) { setBetError('Enter a bet amount.'); return }

  setFlipping(true)

  const [{ data, error }] = await Promise.all([
    supabase.rpc('play_coin_flip', { p_bet_amount: amount, p_choice: state.choice }),
    new Promise(r => setTimeout(r, 1000))
  ])

  setFlipping(false)

  if (error || data?.error) {
    setBetError(data?.error || 'Something went wrong. Try again.')
    return
  }

  // Update coin to show actual outcome
  if (coinFaceLabel) coinFaceLabel.textContent = data.outcome === 'heads' ? 'H' : 'T'
  coinEl?.classList.remove('coin--tails')
  coinEl?.classList.toggle('coin--tails', data.outcome === 'tails')
  coinEl?.classList.add(data.won ? 'coin--win' : 'coin--lose')

  if (walletDisplay) walletDisplay.textContent = formatNaira(data.new_balance)

  recentBets.prepend({
    outcome_won: data.won,
    bet_amount:  amount,
    profit:      data.profit,
    multiplier:  data.won ? MULTIPLIER : 0,
  })

  showCasinoResult({
    won:         data.won,
    betAmount:   amount,
    payout:      data.payout_amount,
    profit:      data.profit,
    multiplier:  data.won ? MULTIPLIER : 0,
    gameLabel:   'Coin Flip',
    onPlayAgain: resetCoin,
  })
  lucide.createIcons();
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
  betChips?.querySelectorAll('.cf-chip').forEach(c =>
    c.classList.toggle('is-active', Number(c.dataset.bet) === val))
})

// ─── BOOT ────────────────────────────────────────────────────
updatePotential()
const recentBets = initRecentBets('coin_flip', document.getElementById('recentBetsMount'))
await loadWallet()
if (window.lucide) lucide.createIcons()

/**
 * limbo.js — GrowthHaven Limbo
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
import '../casino-modal.css'
import '../casino-utils.css'
import './limbo.css'

import { supabase }  from '../../assets/js/supabase.js'
import { showCasinoResult } from '../casino-modal.js'
import { formatNaira, initRecentBets } from '../casino-utils.js'

// ─── HOUSE EDGE CONSTANT ─────────────────────────────────────
// Single source of truth — mirrors v_house_edge in the RPC.
// Change here only; all client-side math references this.
const HOUSE_EDGE = 0.01

// ─── AUTH GUARD ───────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = '/src/login/'
  throw new Error('[limbo] No session')
}
const user = session.user

// ─── STATE ───────────────────────────────────────────────────
const state = {
  phase: 'idle', // 'idle' | 'rolling'
}

// ─── DOM REFS ────────────────────────────────────────────────
const walletDisplay   = document.getElementById('walletDisplay')
const betInput        = document.getElementById('betAmount')
const betError        = document.getElementById('betError')
const betChips        = document.getElementById('betChips')
const targetInput     = document.getElementById('targetMultiplier')
const targetError     = document.getElementById('targetError')
const potentialWinEl  = document.getElementById('potentialWin')
const winChanceEl     = document.getElementById('winChanceDisplay')
const rollBtn         = document.getElementById('rollBtn')
const limboDisplay    = document.getElementById('limboDisplay')
const limboMultiplier = document.getElementById('limboMultiplier')
const limboUnit       = document.getElementById('limboUnit')
const limboVerdict    = document.getElementById('limboVerdict')
const rocketScene = document.getElementById("limboRocketScene");

// ─── HELPERS ─────────────────────────────────────────────────
function setBetError(msg) {
  if (betError) betError.textContent = msg
  betInput?.classList.toggle('is-error', !!msg)
}

function setTargetError(msg) {
  if (targetError) targetError.textContent = msg
  targetInput?.classList.toggle('is-error', !!msg)
}

function updateStats() {
  const bet    = parseFloat(betInput?.value)  || 0
  const target = parseFloat(targetInput?.value)

  // Potential win
  if (potentialWinEl) {
    potentialWinEl.textContent = (bet > 0 && target >= 1)
      ? formatNaira(bet * target)
      : '₦0.00'
  }

  // Win chance: (1 - HOUSE_EDGE) / target * 100, clamped to [0.01, 99]
  if (winChanceEl) {
    if (target >= 1 && target <= 999) {
      const chance = Math.min(99, Math.max(0.01, ((1 - HOUSE_EDGE) / target) * 100))
      winChanceEl.textContent = `${chance.toFixed(2)}%`
    } else {
      winChanceEl.textContent = '—'
    }
  }
}

function setDisplayState(state, value = null) {
  // Clear all state classes first
  limboDisplay?.classList.remove('is-idle', 'is-rolling', 'is-win', 'is-loss')
  limboDisplay?.classList.add(`is-${state}`)
  rocketScene?.classList.remove("is-idle", "is-rolling", "is-win", "is-loss");
  rocketScene?.classList.add(`is-${state}`) 

  if (state === 'idle') {
    if (limboMultiplier) limboMultiplier.textContent = '—'
  } else if (value !== null) {
    if (limboMultiplier) limboMultiplier.textContent = Number(value).toFixed(2)
  }
}

function setVerdict(text, modifier = '') {
  if (!limboVerdict) return
  limboVerdict.textContent = text
  limboVerdict.className = 'limbo-stage__verdict'
  if (modifier) limboVerdict.classList.add(`limbo-stage__verdict--${modifier}`)
}

function setRolling(isRolling) {
  state.phase               = isRolling ? 'rolling' : 'idle'
  if (betInput)    betInput.disabled    = isRolling
  if (targetInput) targetInput.disabled = isRolling
  if (rollBtn)     rollBtn.disabled     = isRolling
  betChips?.querySelectorAll('.limbo-chip').forEach(b => { b.disabled = isRolling })
}

async function loadWallet() {
  const { data, error } = await supabase
    .from('members').select('wallet_balance').eq('id', user.id).single()
  if (!error && data && walletDisplay)
    walletDisplay.textContent = formatNaira(data.wallet_balance)
}

// ─── ROLLING ANIMATION ────────────────────────────────────────
// Cycles random multipliers visually while the RPC is in-flight.
// Resolves after durationMs — called in parallel with the RPC via Promise.all.
function animateLimbo(durationMs = 1200) {
  setDisplayState('rolling', null)
  setVerdict('Launching…')

  return new Promise(resolve => {
    const interval = setInterval(() => {
      // Random number between 1.00 and 50.00 during roll — gives excitement
      const rand = (1 + Math.random() * 49).toFixed(2)
      if (limboMultiplier) limboMultiplier.textContent = rand
    }, 60)

    setTimeout(() => {
      clearInterval(interval)
      resolve()
    }, durationMs)
  })
}

// ─── ROLL ────────────────────────────────────────────────────
rollBtn?.addEventListener('click', async () => {
  setBetError('')
  setTargetError('')

  const bet    = parseFloat(betInput?.value)
  const target = parseFloat(targetInput?.value)

  // Validate
  let hasError = false
  if (!bet || isNaN(bet) || bet <= 0) {
    setBetError('Enter a bet amount.')
    hasError = true
  }
  if (!target || isNaN(target) || target < 1 || target > 999) {
    setTargetError('Target must be between 1× and 999×.')
    hasError = true
  }
  if (hasError) return

  // Client-side balance guard — prevents animation on obvious failures.
  // Server still validates authoritatively; this just avoids the visual glitch.
  const rawBalance = walletDisplay?.textContent?.replace(/[₦,\s]/g, '') || '0'
  const currentBalance = parseFloat(rawBalance)
  if (!isNaN(currentBalance) && currentBalance < bet) {
    setBetError('Insufficient balance.')
    return
  }

  setRolling(true)

  // RPC + animation run in parallel; we wait for both before rendering result
  const [{ data, error }] = await Promise.all([
    supabase.rpc('play_limbo', {
      p_bet_amount:        bet,
      p_target_multiplier: target,
    }),
    animateLimbo(1200),
  ])

  setRolling(false)

  if (error || data?.error) {
    setBetError(data?.error || 'Something went wrong. Try again.')
    setDisplayState('idle')
    setVerdict('Set your target and launch')
    return
  }

  // ── Render result ─────────────────────────────────────────
  const won    = data.won
  const result = data.result_multiplier

  setDisplayState(won ? 'win' : 'loss', result)

  if (won) {
    setVerdict(
      `Reached ${Number(result).toFixed(2)}× — target was ${Number(target).toFixed(2)}×`,
      'win'
    )
  } else {
    setVerdict(
      `Crashed at ${Number(result).toFixed(2)}× — needed ${Number(target).toFixed(2)}×`,
      'loss'
    )
  }

  if (walletDisplay) walletDisplay.textContent = formatNaira(data.new_balance)

  recentBets.prepend({
    outcome_won: won,
    bet_amount:  bet,
    profit:      data.profit,
    multiplier:  target,
  })

  showCasinoResult({
    won,
    betAmount: bet,
    payout: data.payout,
    profit: data.profit,
    multiplier: won ? target : 0,
    gameLabel: "Limbo",
    onPlayAgain: () => {},
  });
  lucide.createIcons()
})

// ─── RESET ───────────────────────────────────────────────────
function resetStage() {
  setDisplayState('idle')
  setVerdict('Set your target and launch')
}

// ─── CHIPS ───────────────────────────────────────────────────
betChips?.addEventListener('click', (e) => {
  const chip = e.target.closest('.limbo-chip')
  if (!chip) return
  if (betInput) betInput.value = chip.dataset.bet
  betChips.querySelectorAll('.limbo-chip').forEach(c =>
    c.classList.toggle('is-active', c === chip))
  setBetError('')
  updateStats()
})

betInput?.addEventListener('input', () => {
  setBetError('')
  updateStats()
  const val = parseFloat(betInput.value)
  betChips?.querySelectorAll('.limbo-chip').forEach(c =>
    c.classList.toggle('is-active', Number(c.dataset.bet) === val))
})

targetInput?.addEventListener('input', () => {
  setTargetError('')
  updateStats()
})

// ─── BOOT ────────────────────────────────────────────────────
setDisplayState('idle')
updateStats()
const recentBets = initRecentBets('limbo', document.getElementById('recentBetsMount'))
await loadWallet()
if (window.lucide) lucide.createIcons()


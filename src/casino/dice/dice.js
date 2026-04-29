
/**
 * dice.js — GrowthHaven Dice
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
import './dice.css'

import { supabase }          from '../../assets/js/supabase.js'
import { showCasinoResult }  from '../casino-modal.js'
import { formatNaira, initRecentBets } from '../casino-utils.js'

// ─── AUTH GUARD ───────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = '/src/login/'
  throw new Error('[dice] No session')
}
const user = session.user

// ─── STATE ───────────────────────────────────────────────────
const state = {
  direction: 'over',   // 'over' | 'under'
  target: 50,
  phase: 'idle',       // 'idle' | 'rolling'
}

// ─── DOM REFS ────────────────────────────────────────────────
const walletDisplay    = document.getElementById('walletDisplay')
const betInput         = document.getElementById('betAmount')
const betError         = document.getElementById('betError')
const betChips         = document.getElementById('betChips')
const dirOver          = document.getElementById('dirOver')
const dirUnder         = document.getElementById('dirUnder')
const targetSlider     = document.getElementById('targetSlider')
const targetDisplay    = document.getElementById('targetDisplay')
const predictionLabel  = document.getElementById('predictionLabel')
const potentialWinEl   = document.getElementById('potentialWin')
const multiplierEl     = document.getElementById('multiplierDisplay')
const winChanceEl      = document.getElementById('winChanceDisplay')
const rollBtn          = document.getElementById('rollBtn')
const diceFace         = document.getElementById('diceFace')
const diceNumber       = document.getElementById('diceNumber')
const diceVerdict      = document.getElementById('diceVerdict')

// ─── MATH ────────────────────────────────────────────────────
function calcStats(direction, target) {
  const prob = direction === 'over'
    ? (100 - target) / 100
    : (target - 1) / 100
  // Guard against degenerate edges (prob can approach 0 or 1 at slider extremes)
  const safeProp   = Math.max(0.0001, Math.min(0.9999, prob))
  const multiplier = +(0.99 / safeProp).toFixed(4)
  const winChance  = +(safeProp * 100).toFixed(2)
  return { multiplier, winChance }
}

// ─── HELPERS ─────────────────────────────────────────────────
function setBetError(msg) {
  if (betError) betError.textContent = msg
  betInput?.classList.toggle('is-error', !!msg)
}

function updateStats() {
  const bet  = parseFloat(betInput?.value) || 0
  const { multiplier, winChance } = calcStats(state.direction, state.target)

  if (potentialWinEl)  potentialWinEl.textContent  = formatNaira(bet * multiplier)
  if (multiplierEl)    multiplierEl.textContent    = `${multiplier.toFixed(2)}×`
  if (winChanceEl)     winChanceEl.textContent     = `${winChance.toFixed(2)}%`
  if (predictionLabel) predictionLabel.textContent =
    `Roll ${state.direction === 'over' ? 'Over' : 'Under'} ${state.target}`
  if (targetDisplay)   targetDisplay.textContent   = state.target
}

function setRolling(isRolling) {
  state.phase = isRolling ? 'rolling' : 'idle'
  if (betInput)   betInput.disabled   = isRolling
  if (rollBtn)    rollBtn.disabled    = isRolling
  if (dirOver)    dirOver.disabled    = isRolling
  if (dirUnder)   dirUnder.disabled   = isRolling
  if (targetSlider) targetSlider.disabled = isRolling
  betChips?.querySelectorAll('.dice-chip').forEach(b => { b.disabled = isRolling })
}

function resetDie() {
  diceFace?.classList.remove('dice-face--win', 'dice-face--loss', 'dice-face--rolling')
  if (diceNumber) diceNumber.textContent = '?'
  if (diceVerdict) {
    diceVerdict.textContent = 'Set your bet and roll'
    diceVerdict.className = 'dice-stage__verdict'
  }
}

async function loadWallet() {
  const { data, error } = await supabase
    .from('members').select('wallet_balance').eq('id', user.id).single()
  if (!error && data && walletDisplay)
    walletDisplay.textContent = formatNaira(data.wallet_balance)
}

// ─── DIE ANIMATION ───────────────────────────────────────────
// Cycles random numbers during the roll delay, then lands on the real result.
async function animateDie(finalRoll, won, rollDurationMs = 1200) {
  diceFace?.classList.remove('dice-face--win', 'dice-face--loss')
  diceFace?.classList.add('dice-face--rolling')
  if (diceNumber) diceNumber.textContent = '?'

  const cycleInterval = setInterval(() => {
    if (diceNumber) diceNumber.textContent = Math.floor(Math.random() * 100) + 1
  }, 75)

  await new Promise(r => setTimeout(r, rollDurationMs))

  clearInterval(cycleInterval)
  diceFace?.classList.remove('dice-face--rolling')

  if (diceNumber) diceNumber.textContent = finalRoll
  diceFace?.classList.add(won ? 'dice-face--win' : 'dice-face--loss')
}

// ─── DIRECTION TOGGLE ─────────────────────────────────────────
function setDirection(dir) {
  state.direction = dir
  dirOver?.classList.toggle('is-selected',  dir === 'over')
  dirUnder?.classList.toggle('is-selected', dir === 'under')
  updateStats()
}

dirOver?.addEventListener('click',  () => setDirection('over'))
dirUnder?.addEventListener('click', () => setDirection('under'))

// ─── SLIDER ───────────────────────────────────────────────────
targetSlider?.addEventListener('input', () => {
  state.target = parseInt(targetSlider.value, 10)
  updateStats()
})

// ─── BET CHIPS ───────────────────────────────────────────────
betChips?.addEventListener('click', (e) => {
  const chip = e.target.closest('.dice-chip')
  if (!chip) return
  if (betInput) betInput.value = chip.dataset.bet
  betChips.querySelectorAll('.dice-chip').forEach(c =>
    c.classList.toggle('is-active', c === chip))
  setBetError('')
  updateStats()
})

betInput?.addEventListener('input', () => {
  setBetError('')
  updateStats()
  const val = parseFloat(betInput.value)
  betChips?.querySelectorAll('.dice-chip').forEach(c =>
    c.classList.toggle('is-active', Number(c.dataset.bet) === val))
})

// ─── ROLL ────────────────────────────────────────────────────
rollBtn?.addEventListener('click', async () => {
  setBetError('')

  const amount = parseFloat(betInput?.value)
  if (!amount || isNaN(amount) || amount <= 0) {
    setBetError('Enter a bet amount.')
    return
  }

  setRolling(true)

  // Kick off RPC and animation in parallel; wait for both.
  const [{ data, error }] = await Promise.all([
    supabase.rpc('play_dice', {
      p_bet_amount: amount,
      p_direction:  state.direction,
      p_target:     state.target,
    }),
    animateDie(0, false, 1200), // placeholder — real result applied below
  ])

  // The RPC resolves after the animation, so we re-animate with the real result.
  // If the RPC is faster than the animation, we need to show the real number.
  // We handle this by running animation and RPC together, then updating after.
  setRolling(false)

  if (error || data?.error) {
    setBetError(data?.error || 'Something went wrong. Try again.')
    resetDie()
    return
  }

  // Snap die to real result (animation already finished, this is instant)
  diceFace?.classList.remove('dice-face--win', 'dice-face--loss')
  if (diceNumber) diceNumber.textContent = data.roll
  diceFace?.classList.add(data.won ? 'dice-face--win' : 'dice-face--loss')

  // Verdict line
  if (diceVerdict) {
    const dir     = state.direction === 'over' ? 'Over' : 'Under'
    const needed  = `${dir} ${state.target}`
    const check   = data.won ? '✓' : '✗'
    diceVerdict.textContent = `Rolled ${data.roll} — needed ${needed} ${check}`
    diceVerdict.className   =
      `dice-stage__verdict dice-stage__verdict--${data.won ? 'win' : 'loss'}`
  }

  if (walletDisplay) walletDisplay.textContent = formatNaira(data.new_balance)

  recentBets.prepend({
    outcome_won: data.won,
    bet_amount:  amount,
    profit:      data.profit,
    multiplier:  data.won ? data.multiplier : 0,
  })

  showCasinoResult({
    won:         data.won,
    betAmount:   amount,
    payout:      data.payout,
    profit:      data.profit,
    multiplier:  data.won ? data.multiplier : 0,
    gameLabel:   'Dice',
    onPlayAgain: resetDie,
  })
  lucide.createIcons()
})

// ─── BOOT ────────────────────────────────────────────────────
updateStats()
const recentBets = initRecentBets('dice', document.getElementById('recentBetsMount'))
await loadWallet()
if (window.lucide) lucide.createIcons()
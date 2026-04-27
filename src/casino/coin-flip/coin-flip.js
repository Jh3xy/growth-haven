
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

import { supabase } from '../../assets/js/supabase'
import { updateWalletDisplay } from '../../assets/js/wallet-utils'

const clickAudio = document.getElementById('clickAudio')
const betInput = document.getElementById('betAmount')
const betChips = document.getElementById('betChips')
const chooseHeads = document.getElementById('chooseHeads')
const chooseTails = document.getElementById('chooseTails')
const flipBtn = document.getElementById('flipBtn')
const coinWrap = document.getElementById('coinWrap')
const coinResult = document.getElementById('coinResult')
const potentialWinEl = document.getElementById('potentialWin')
const multiplierEl = document.getElementById('multiplier')

// Auth guard
(async function authGuard(){
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = '/src/login/'
    return
  }
})()

const state = {
  phase: 'idle', // idle | flipping | result
  betAmount: 0,
  choice: null,
  payout: 0,
  multiplier: 1
}

function setLocked(isLocked){
  document.body.classList.toggle('locked', isLocked)
  flipBtn.disabled = isLocked
  chooseHeads.disabled = isLocked
  chooseTails.disabled = isLocked
  betInput.disabled = isLocked
  betChips.querySelectorAll('button').forEach(b => b.disabled = isLocked)
}

function formatNaira(amount){
  return '₦' + Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}

// Quick chips
betChips.addEventListener('click', (e) => {
  const btn = e.target.closest('.mines-chip')
  if (!btn) return
  betInput.value = btn.dataset.amount
  updatePotential()
})

function updatePotential(){
  const amount = parseFloat(betInput.value) || 0
  state.betAmount = amount
  const pot = amount * state.multiplier
  potentialWinEl.textContent = formatNaira(pot)
  multiplierEl.textContent = 'x' + state.multiplier
}

// Choice
chooseHeads.addEventListener('click', ()=> selectChoice('heads'))
chooseTails.addEventListener('click', ()=> selectChoice('tails'))

function selectChoice(c){
  state.choice = c
  chooseHeads.classList.toggle('is-selected', c === 'heads')
  chooseTails.classList.toggle('is-selected', c === 'tails')
}

betInput.addEventListener('input', updatePotential)

// Flip
flipBtn.addEventListener('click', async ()=>{
  if (!state.choice) return alert('Choose Heads or Tails')
  const amount = parseFloat(betInput.value)
  if (!amount || amount <= 0) return alert('Enter a valid bet')

  // Lock UI
  state.phase = 'flipping'
  setLocked(true)
  coinWrap.classList.add('is-flipping')
  coinResult.textContent = 'Flipping...'
  clickAudio && clickAudio.play()

  try {
    const { data, error } = await supabase.rpc('play_coin_flip', {
      bet_amount: amount,
      choice: state.choice
    })

    if (error) {
      console.error('RPC error', error)
      coinResult.textContent = 'Error: ' + (error.message || 'Try again')
      return
    }

    // Simulate flip duration to align with animation
    setTimeout(()=>{
      coinWrap.classList.remove('is-flipping')
      state.phase = 'result'

      const outcome = data.outcome || data.choice_winner || data.side || 'heads'
      const payout = Number(data.payout_amount || data.payout || 0)
      const profit = Number(data.profit || (payout - amount))

      if (outcome === 'heads' || outcome === 'H'){
        coinResult.innerHTML = `<strong style="color:var(--brand-primary)">You won ${formatNaira(payout)}</strong>`
      } else {
        coinResult.innerHTML = `<span style="color:var(--text-secondary)">You lost ${formatNaira(amount)}</span>`
      }

      // flash payout color for wins
      if (profit > 0){
        potentialWinEl.style.color = 'var(--brand-primary)'
        setTimeout(()=> potentialWinEl.style.color = '', 1200)
      }

      // refresh wallet display using shared utility
      updateWalletDisplay()

      // unlock UI
      setLocked(false)
    }, 900)

  } catch (err){
    console.error(err)
    coinResult.textContent = 'Unexpected error'
    setLocked(false)
    coinWrap.classList.remove('is-flipping')
  }
})

// initial setup
(function boot(){
  // default multiplier: fair 2x (minus house edge if any)
  state.multiplier = 1.98
  updatePotential()
  // load wallet display
  updateWalletDisplay()
})()

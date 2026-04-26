
/**
 * mines.js — GrowthHaven Mines Game
 */

import '../../assets/styles/fonts.css'
import '../../assets/styles/variables.css'
import '../../assets/styles/utils.css'
import '../../assets/styles/style.css'
import '../../assets/styles/animations.css'
import '../../assets/styles/landing.css'
import '../../assets/styles/queries.css'
import '../../assets/styles/dashboard.css'
import './mines.css'

import { supabase } from '../../assets/js/supabase'

// ─── AUDIO ───────────────────────────────────────────────────
const clickAudio = new Audio('/assets/audio/camera-shutter.wav')
const bgAudio = document.getElementById('bgMusic')
bgAudio.loop = true
bgAudio.volume = 0

const musicToggle = document.getElementById('musicToggle')
let isMusicMuted = localStorage.getItem('gh_casino_music') === 'muted'

function fadeAudio(audio, targetVolume, duration) {
  const startVolume = audio.volume
  const startTime = Date.now()
  const fade = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    audio.volume = startVolume + (targetVolume - startVolume) * progress
    if (progress < 1) requestAnimationFrame(fade)
  }
  fade()
}

function updateMusicIcon() {
  if (isMusicMuted) {
    //Set audio state in Localstorage to 'muted' by default
    localStorage.setItem('gh_casino_music', 'muted')
  } else {
    //Set to unmuted and play audio 
    localStorage.setItem('gh_casino_music', 'unmuted')
    // bgAudio.play().then(() => {
    //   fadeAudio(bgAudio, 1, 800)
    //   isMusicMuted = false
    //   updateMusicIcon()
    // }).catch(err => console.error('Audio play failed:', err))
  }
  const icon = musicToggle.querySelector('[data-lucide]')
  icon.setAttribute('data-lucide', isMusicMuted ? 'volume-x' : 'volume-2')
  if (window.lucide) lucide.createIcons({ nodes: [musicToggle] })
}

updateMusicIcon()

musicToggle.addEventListener('click', () => {
  if (isMusicMuted) {
    bgAudio.play().then(() => {
      fadeAudio(bgAudio, 1, 800)
      isMusicMuted = false
      localStorage.setItem('gh_casino_music', 'unmuted')
      updateMusicIcon()
    }).catch(err => console.error('Audio play failed:', err))
  } else {
    fadeAudio(bgAudio, 0, 800)
    setTimeout(() => bgAudio.pause(), 800)
    isMusicMuted = true
    localStorage.setItem('gh_casino_music', 'muted')
    updateMusicIcon()
  }
})

// ─── AUTH GUARD ──────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = '/src/login/'
  throw new Error('[mines] No session')
}
const user = session.user


// ─── GAME STATE ──────────────────────────────────────────────
// Single object — never scattered across loose variables
const state = {
  phase: 'idle',          // idle | active | result
  sessionId: null,
  betAmount: 0,
  minesCount: 3,
  revealedTiles: [],      // array of revealed tile indices (0-24)
  mineTiles: [],          // populated on game over
  multiplier: 1,
  winnings: 0,
  isRevealing: false,     // race condition guard
}


// ─── DOM REFS ────────────────────────────────────────────────
const walletDisplay     = document.getElementById('walletDisplay')
const betInput          = document.getElementById('betAmount')
const betError          = document.getElementById('betError')
const betChips          = document.getElementById('betChips')
const minesCountRow     = document.getElementById('minesCountRow')
const minesSelectedLabel= document.getElementById('minesSelectedLabel')
const startBtn          = document.getElementById('startBtn')
const playAgainBtn      = document.getElementById('playAgainBtn')
const cashoutBtn        = document.getElementById('cashoutBtn')
const minesGrid         = document.getElementById('minesGrid')

const controlsIdle      = document.getElementById('controlsIdle')
const controlsActive    = document.getElementById('controlsActive')
const controlsResult    = document.getElementById('controlsResult')

const activeBetDisplay  = document.getElementById('activeBetDisplay')
const multiplierDisplay = document.getElementById('multiplierDisplay')
const winningsDisplay   = document.getElementById('winningsDisplay')
const activeMinesDisplay= document.getElementById('activeMinesDisplay')
const resultIcon        = document.getElementById('resultIcon')
const resultLabel       = document.getElementById('resultLabel')
const resultAmount      = document.getElementById('resultAmount')


// ─── HELPERS ─────────────────────────────────────────────────
function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}

function setBetError(msg) {
  betError.textContent = msg
  betInput.classList.toggle('is-error', !!msg)
}

function resetCashoutButton() {
  cashoutBtn.innerHTML = `<i data-lucide="hand-coins" style="width:16px;height:16px"></i> Cash Out`
  cashoutBtn.disabled = true

  if (window.lucide) lucide.createIcons({ nodes: [cashoutBtn] })
}

function showPhase(phase) {
  controlsIdle.classList.toggle('hidden', phase !== 'idle')
  controlsActive.classList.toggle('hidden', phase !== 'active')
  controlsResult.classList.toggle('hidden', phase !== 'result')

  const isIdle = phase === 'idle'
  const isActive = phase === 'active'

  betInput.disabled = !isIdle
  startBtn.disabled = !isIdle

  betChips.querySelectorAll('.mines-chip').forEach((chip) => {
    chip.disabled = !isIdle
  })

  minesCountRow.querySelectorAll('.mines-count-btn').forEach((btn) => {
    btn.disabled = !isIdle
  })

  if (isActive) {
    cashoutBtn.disabled = state.revealedTiles.length === 0 || state.isRevealing
  } else {
    resetCashoutButton()
    minesGrid.querySelectorAll('.mines-tile').forEach((tile) => {
      tile.disabled = true
    })
  }

  state.phase = phase
}

// Get bet input value on load
function getSavedAmount() {
  const savedAmount = localStorage.getItem('savedBetAmount')
  return savedAmount ? parseFloat(savedAmount) : 0
}

getSavedAmount() && (betInput.value = getSavedAmount());

// ─── WALLET ──────────────────────────────────────────────────
async function loadWallet() {
  const { data, error } = await supabase
    .from('members')
    .select('wallet_balance')
    .eq('id', user.id)
    .single()

  if (!error && data) {
    walletDisplay.textContent = formatNaira(data.wallet_balance)
  }
}


// ─── MINES COUNT SELECTOR ─────────────────────────────────────
function buildMinesSelector() {
  minesCountRow.innerHTML = ''
  for (let i = 1; i <= 24; i++) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mines-count-btn' + (i === state.minesCount ? ' is-selected' : '')
    btn.textContent = i
    btn.dataset.count = i
    btn.addEventListener('click', () => {
      state.minesCount = i
      minesCountRow.querySelectorAll('.mines-count-btn').forEach(b => {
        b.classList.toggle('is-selected', Number(b.dataset.count) === i)
      })
      minesSelectedLabel.textContent = `${i} mine${i === 1 ? '' : 's'} selected`
    })
    minesCountRow.appendChild(btn)
  }
  minesSelectedLabel.textContent = `${state.minesCount} mines selected`
}


// ─── GRID ─────────────────────────────────────────────────────
function buildGrid() {
  minesGrid.innerHTML = ''
  for (let i = 0; i < 25; i++) {
    const tile = document.createElement('button')
    tile.type = 'button'
    tile.className = 'mines-tile'
    tile.dataset.index = i
    tile.setAttribute('aria-label', `Tile ${i + 1}`)
    tile.setAttribute('role', 'gridcell')
    tile.disabled = state.phase !== 'active'
    tile.innerHTML = `
      <span class="mines-tile__gem" aria-hidden="true">
        <i data-lucide="gem" style="width:22px;height:22px;stroke-width:1.5"></i>
      </span>
      <span class="mines-tile__mine hidden" aria-hidden="true">
        <i data-lucide="bomb" style="width:22px;height:22px;stroke-width:1.5"></i>
      </span>
    `
    tile.addEventListener('click', () => onTileClick(i))
    minesGrid.appendChild(tile)
  }
  if (window.lucide) lucide.createIcons({ nodes: [minesGrid] })
}

function updateGrid() {
  const tiles = minesGrid.querySelectorAll('.mines-tile')

  tiles.forEach((tile, i) => {
    const isRevealed = state.revealedTiles.includes(i)
    const isMine = state.mineTiles.includes(i)
    const gem = tile.querySelector('.mines-tile__gem')
    const mine = tile.querySelector('.mines-tile__mine')

    tile.classList.remove('is-safe', 'is-mine', 'is-idle')
    tile.disabled = state.phase !== 'active'

    if (isMine && state.phase === 'result') {
      tile.classList.add('is-mine')
      gem.classList.add('hidden')
      mine.classList.remove('hidden')
      tile.disabled = true
    } else if (isRevealed) {
      tile.classList.add('is-safe')
      gem.classList.remove('hidden')
      mine.classList.add('hidden')
      tile.disabled = true
    } else {
      gem.classList.remove('hidden')
      mine.classList.add('hidden')
    }

    // Already-revealed tiles stay locked
    if (isRevealed) tile.disabled = true
  })
}


// ─── SESSION RESUME ───────────────────────────────────────────
// Called on page load — restores board if user has an active game
async function checkActiveSession() {
  const { data, error } = await supabase.rpc('get_active_mines_session')
  if (error || !data?.session) return

  const s = data.session
  state.phase        = 'active'
  state.sessionId    = s.id
  state.betAmount    = s.bet_amount
  state.minesCount   = s.mines_count
  state.revealedTiles= s.revealed_tiles ?? []
  state.multiplier   = s.multiplier
  state.winnings     = s.accrued_winnings

  buildGrid()
  updateGrid()
  syncActiveControls()
  showPhase('active')
}


// ─── START GAME ───────────────────────────────────────────────
async function startGame() {
  setBetError('')
  const bet = parseFloat(betInput.value)

  if (!bet || isNaN(bet)) {
    setBetError('Enter a bet amount.')
    return
  }

  startBtn.disabled = true
  startBtn.innerHTML = `<i data-lucide="loader" style="width:16px;height:16px"></i> Starting...`
  if (window.lucide) lucide.createIcons({ nodes: [startBtn] })

  const { data, error } = await supabase.rpc('start_mines_game', {
    p_bet_amount:  bet,
    p_mines_count: state.minesCount,
  })

  if (error || data?.error) {
    setBetError(data?.error || 'Something went wrong. Try again.')
    startBtn.disabled = false
    startBtn.innerHTML = `<i data-lucide="play" style="width:16px;height:16px"></i> Start Game`
    if (window.lucide) lucide.createIcons({ nodes: [startBtn] })
    return
  }

  state.sessionId     = data.session_id
  state.betAmount     = bet
  state.phase         = 'active'
  state.revealedTiles = []
  state.mineTiles     = []
  state.multiplier    = 1
  state.winnings      = 0

  await loadWallet()
  buildGrid()
  syncActiveControls()
  showPhase('active')
  if (window.lucide) lucide.createIcons();
}


// ─── TILE CLICK ───────────────────────────────────────────────
async function onTileClick(index) {
  if (state.phase !== 'active' || state.isRevealing || state.revealedTiles.includes(index)) return

  // Play click sound immediately on tile click
  clickAudio.currentTime = 0
  clickAudio.play().catch(err => console.error('Click sound failed:', err))

  state.isRevealing = true

  const tile = minesGrid.querySelector(`[data-index="${index}"]`)
  tile.disabled = true
  tile.classList.add('is-revealing')

  try {
    const { data, error } = await supabase.rpc('reveal_tile', {
      p_session_id: state.sessionId,
      p_tile_index: index,
    })

    // 1. Check for errors immediately
    if (error || data?.error) {
      tile.disabled = false // Re-enable so they can try again
      console.error('[mines] reveal_tile error:', error || data.error)
      return 
    }

    // 2. Handle Game Over (Hit a mine)
    if (data.hit) {
      state.mineTiles = data.mine_positions
      state.phase = 'result'
      cashoutBtn.disabled = true
      updateGrid()
      showResult('lost', data.bet_amount)
      await loadWallet()
      return
    }

    // 3. Handle Safe Tile
    state.revealedTiles = [...state.revealedTiles, index]
    state.multiplier = data.multiplier
    state.winnings = data.accrued_winnings

    updateGrid()
    syncActiveControls()
    cashoutBtn.disabled = false // Game is safe to cash out now

  } catch (err) {
    // This catches network crashes or unexpected JS errors
    console.error('[mines] Critical reveal error:', err)
    tile.disabled = false
  } finally {
    // This runs NO MATTER WHAT (success or failure)
    tile.classList.remove('is-revealing')
    state.isRevealing = false
  }
}


// ─── CASHOUT ──────────────────────────────────────────────────
async function cashout() {
  if (state.phase !== 'active') return

  cashoutBtn.disabled = true
  cashoutBtn.textContent = 'Processing...'

  const { data, error } = await supabase.rpc('cashout_mines', {
    p_session_id: state.sessionId,
  })

  if (error || data?.error) {
    cashoutBtn.disabled = false
    cashoutBtn.innerHTML = `<i data-lucide="hand-coins" style="width:16px;height:16px"></i> Cash Out`
    if (window.lucide) lucide.createIcons({ nodes: [cashoutBtn] })
    console.error('[mines] cashout error:', error || data.error)
    return
  }

  state.mineTiles = data.mine_positions
  state.phase     = 'result'
  updateGrid()
  showResult('won', data.payout, data.multiplier)
  await loadWallet()
}


// ─── SYNC ACTIVE CONTROLS ─────────────────────────────────────
function syncActiveControls() {
  activeBetDisplay.textContent   = formatNaira(state.betAmount)
  multiplierDisplay.textContent  = `${Number(state.multiplier).toFixed(2)}×`
  winningsDisplay.textContent    = formatNaira(state.winnings)
  activeMinesDisplay.textContent = `${state.minesCount}`
}


// ─── SHOW RESULT ──────────────────────────────────────────────
function showResult(outcome, amount, multiplier = null) {
  showPhase('result')

  if (outcome === 'won') {
    resultIcon.innerHTML = `
      <div class="mines-result-icon__inner mines-result-icon__inner--win">
        <i data-lucide="trophy" style="width:28px;height:28px;stroke-width:1.5"></i>
      </div>`
    resultLabel.textContent  = multiplier ? `Cashed out at ${Number(multiplier).toFixed(2)}×` : 'You won!'
    resultAmount.textContent = formatNaira(amount)
    resultAmount.style.color = 'var(--status-success-text)'
  } else {
    resultIcon.innerHTML = `
      <div class="mines-result-icon__inner mines-result-icon__inner--loss">
        <i data-lucide="bomb" style="width:28px;height:28px;stroke-width:1.5"></i>
      </div>`
    resultLabel.textContent  = 'Mine hit — better luck next time'
    resultAmount.textContent = `-${formatNaira(amount)}`
    resultAmount.style.color = 'var(--status-error-text)'
  }

  if (window.lucide) lucide.createIcons({ nodes: [resultIcon] })
}


// ─── PLAY AGAIN ───────────────────────────────────────────────
function resetToIdle() {
  state.sessionId     = null
  state.betAmount     = 0
  state.revealedTiles = []
  state.mineTiles     = []
  state.multiplier    = 1
  state.winnings      = 0
  state.isRevealing   = false

  betInput.value = ''
  setBetError('')

  startBtn.disabled = false
  startBtn.innerHTML = `<i data-lucide="play" style="width:16px;height:16px"></i> Start Game`
  resetCashoutButton()

  buildGrid()
  // Disable all tiles in idle
  minesGrid.querySelectorAll('.mines-tile').forEach(t => t.disabled = true)
  activeMinesDisplay.textContent = '-';
  winningsDisplay.textContent = '₦0.00';
  multiplierDisplay.textContent = '1.00x';
  activeBetDisplay.textContent = '₦0.00';

  showPhase('idle')
  if (window.lucide) lucide.createIcons()
}


// ─── EVENT LISTENERS ─────────────────────────────────────────
startBtn.addEventListener('click', ()=> {
  // Grab Input value and save amount to localStorage
  let betAmount = betInput.value;
  localStorage.setItem('savedBetAmount', betAmount);
  startGame()
})
playAgainBtn.addEventListener('click', ()=> {
  resetToIdle()
  getSavedAmount() && (betInput.value = getSavedAmount());
})
cashoutBtn.addEventListener('click', cashout)

betChips.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-bet]')
  if (!chip) return
  betInput.value = chip.dataset.bet
  // Save the input amount to localStorage
  localStorage.setItem('savedBetAmount', chip.dataset.bet);
  setBetError('')
  betChips.querySelectorAll('.mines-chip').forEach(c => {
    c.classList.toggle('is-active', c === chip)
  })
})

betInput.addEventListener('input', () => {
  setBetError('')
  const val = parseFloat(betInput.value)
  betChips.querySelectorAll('.mines-chip').forEach(c => {
    c.classList.toggle('is-active', Number(c.dataset.bet) === val)
  })
})


// ─── BOOT ────────────────────────────────────────────────────
buildMinesSelector()
buildGrid()
// Tiles are disabled at idle — enable only when a game starts
minesGrid.querySelectorAll('.mines-tile').forEach(t => t.disabled = true)

await Promise.all([loadWallet(), checkActiveSession()])

// If no active session was found, stay on idle
if (state.phase === 'idle') {
  if (window.lucide) lucide.createIcons()
}

/**
 * casino-utils.js — GrowthHaven Casino Shared Utilities
 * Import from any casino game file.
 *
 * Usage:
 *   import { formatNaira, initRecentBets, prependBet } from '../casino-utils.js'
 *
 *   // On boot — pass game type + the element to mount into
 *   const recentBets = initRecentBets('coin_flip', document.getElementById('recentBetsMount'))
 *
 *   // After a round resolves — add to top of list without re-fetching
 *   recentBets.prepend({ outcome_won, bet_amount, profit, multiplier })
 */

import { supabase } from '../assets/js/supabase.js'

// ─── FORMATTING ──────────────────────────────────────────────

export function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}

export function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}


// ─── RECENT BETS ACCORDION ───────────────────────────────────
//
// Renders a collapsible "Recent Bets" section into `mountEl`.
// The mount element should be an empty div placed at the top of
// the controls panel, before the title.
//
// Returns { prepend } so the caller can optimistically add new
// rows without re-fetching after each round.

export function initRecentBets(gameType, mountEl) {
  if (!mountEl) return { prepend: () => {} }

  let isOpen    = false
  let isLoaded  = false
  let listEl    = null   // the <div> holding rows — populated lazily

  // ── Build shell ───────────────────────────────────────────
  mountEl.innerHTML = `
    <div class="casino-rb">
      <button class="casino-rb__toggle" type="button" id="rbToggle">
        <span class="casino-rb__label">Recent Bets</span>
        <span class="casino-rb__count hidden" id="rbCount"></span>
        <svg class="casino-rb__chevron" xmlns="http://www.w3.org/2000/svg"
             width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <div class="casino-rb__panel hidden" id="rbPanel">
        <div class="casino-rb__list" id="rbList">
          <div class="casino-rb__loading">Loading...</div>
        </div>
      </div>
    </div>
  `

  const toggleBtn = mountEl.querySelector('#rbToggle')
  const panel     = mountEl.querySelector('#rbPanel')
  const countEl   = mountEl.querySelector('#rbCount')
  listEl          = mountEl.querySelector('#rbList')

  // ── Toggle ────────────────────────────────────────────────
  toggleBtn.addEventListener('click', async () => {
    isOpen = !isOpen
    panel.classList.toggle('hidden', !isOpen)
    toggleBtn.classList.toggle('is-open', isOpen)

    if (isOpen && !isLoaded) {
      await fetchAndRender()
    }
  })

  // ── Fetch ─────────────────────────────────────────────────
  async function fetchAndRender() {
    const { data, error } = await supabase.rpc('get_game_history', {
      p_game_type: gameType,
      p_limit:     20,
    })

    listEl.innerHTML = ''

    if (error || !data || data.length === 0) {
      listEl.innerHTML = '<p class="casino-rb__empty">No bets yet.</p>'
      isLoaded = true
      return
    }

    data.forEach(round => listEl.appendChild(buildRow(round)))

    // Update count badge
    countEl.textContent = data.length
    countEl.classList.remove('hidden')

    isLoaded = true
  }

  // ── Build a single row ────────────────────────────────────
  function buildRow(round) {
    const row = document.createElement('div')
    row.className = 'casino-rb__row'

    const sign   = round.outcome_won ? '+' : '-'
    const amount = Math.abs(round.profit)
    const mult   = round.multiplier > 0 ? `${Number(round.multiplier).toFixed(2)}×` : '—'

    row.innerHTML = `
      <span class="casino-rb__dot casino-rb__dot--${round.outcome_won ? 'win' : 'loss'}"></span>
      <span class="casino-rb__bet">${formatNaira(round.bet_amount)}</span>
      <span class="casino-rb__mult">${mult}</span>
      <span class="casino-rb__profit casino-rb__profit--${round.outcome_won ? 'win' : 'loss'}">
        ${sign}${formatNaira(amount)}
      </span>
      <span class="casino-rb__time">${timeAgo(round.created_at)}</span>
    `
    return row
  }

  // ── Prepend — called after each round without re-fetching ─
  function prepend(round) {
    // Add to count badge
    const current = parseInt(countEl.textContent) || 0
    countEl.textContent = Math.min(current + 1, 20)
    countEl.classList.remove('hidden')

    // If panel is open, insert at top
    if (isLoaded && listEl) {
      const empty = listEl.querySelector('.casino-rb__empty')
      if (empty) empty.remove()

      const row = buildRow({
        ...round,
        created_at: new Date().toISOString(),
      })
      row.classList.add('casino-rb__row--new')
      listEl.insertBefore(row, listEl.firstChild)

      // Keep max 20 rows in the DOM
      const rows = listEl.querySelectorAll('.casino-rb__row')
      if (rows.length > 20) rows[rows.length - 1].remove()
    }
  }

  return { prepend }
}
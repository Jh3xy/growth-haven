

/**
 * casino.js — GrowthHaven Casino Lobby
 * Place at: src/dashboard/casino.js
 *
 * Export is called once when section-sports becomes visible.
 * Wired via MutationObserver in dashboard.js — see additions file.
 */

let initialized = false;

// Shared filter state — both search and tabs read/write these
let activeFilter = 'originals'; // 'originals' | 'new'
let activeQuery  = '';

export function initCasinoSection() {
  if (initialized) return;
  initialized = true;

  const cards = Array.from(document.querySelectorAll('.casino-game-card'));

  initWinsTicker();
  initWalletDisplay();
  initGameSearch(cards);
  initFilterTabs(cards);

  if (window.lucide) lucide.createIcons();
}


// ─── WINS TICKER ──────────────────────────────────────────────

function initWinsTicker() {
  const track = document.getElementById('casinoTickerTrack');
  if (!track) return;

  // Clone all items and append — creates seamless loop.
  // The CSS animation moves -50% (exactly one full set's width).
  Array.from(track.children).forEach(item => {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
  });

  // Pause on hover
  const wrap = track.closest('.casino-ticker-wrap');
  if (!wrap) return;
  wrap.addEventListener('mouseenter', () => track.classList.add('is-paused'));
  wrap.addEventListener('mouseleave', () => track.classList.remove('is-paused'));
}


// ─── WALLET DISPLAY ───────────────────────────────────────────

function initWalletDisplay() {
  const el  = document.getElementById('casinoWalletBalance');
  const btn = document.getElementById('casinoBalanceRefresh');

  function render() {
    const balance = window.__ghCurrentWalletBalance ?? 0;
    if (el) {
      el.textContent = '₦' + Number(balance).toLocaleString('en-NG', { minimumFractionDigits: 2 });
      el.classList.remove('skeleton');
    }
  }

  render();

  btn?.addEventListener('click', () => {
    render();
    btn.classList.add('is-spinning');
    setTimeout(() => btn.classList.remove('is-spinning'), 700);
  });
}


// ─── GAME SEARCH ──────────────────────────────────────────────

function initGameSearch(cards) {
  const input      = document.getElementById('casinoSearch');
  const emptyState = document.getElementById('casinoSearchEmpty');
  if (!input) return;

  function handleSearch() {
    activeQuery = input.value.trim().toLowerCase();
    applyFilters(cards, emptyState);
  }
 
  input.addEventListener('input',  handleSearch);
  input.addEventListener('search', handleSearch); // belt-and-suspenders: fires on native × and Enter
}


// ─── FILTER TABS ──────────────────────────────────────────────

function initFilterTabs(cards) {
  const tabs       = document.querySelectorAll('.casino-filter-tab');
  const emptyState = document.getElementById('casinoSearchEmpty');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      activeFilter = tab.dataset.filter;
      applyFilters(cards, emptyState);
    });
  });
}


// ─── SHARED FILTER LOGIC ──────────────────────────────────────
// Tab runs first, search narrows within the tab result.
// 'originals' tab shows ALL cards (both live + coming soon).
// 'new' tab shows only data-category="new" cards.

function applyFilters(cards, emptyState) {
  let visible = 0;

  cards.forEach(card => {
    const name     = (card.dataset.gameName || '').toLowerCase();
    const category = card.dataset.category  || 'originals';

    const tabMatch    = activeFilter === 'originals' || category === activeFilter;
    const searchMatch = !activeQuery || name.includes(activeQuery);
    const show        = tabMatch && searchMatch;

    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  if (!emptyState) return;

  emptyState.classList.toggle('hidden', visible > 0);

  if (visible === 0) {
    const msgEl = emptyState.querySelector('.casino-search-empty__text');
    if (msgEl) {
      msgEl.textContent = activeQuery
        ? `No games found for "${activeQuery}"`
        : 'No games in this category yet';
    }
  }
}


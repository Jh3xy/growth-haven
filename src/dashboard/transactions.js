

/**
 * transactions.js — GrowthHaven Transactions Section
 */

import { supabase }           from '../assets/js/supabase.js';
import { formatDate }         from '../assets/js/utils.js';
import { openModal }          from './modal.js';

// ─── CONFIG ──────────────────────────────────────────────────────

const PAGE_SIZE = 15;

const FILTER_GROUPS = {
  all: null,
  deposit: ["deposit"],
  casino: ["mines_bet", "mines_win", "coin-flip"],
  withdrawal: ["withdrawal"],
  vault: ["vault_fund", "vault_maturity", "early_exit"],
  earnings: ["daily_claim", "referral_bonus"],
  blog: ["blog_like_reward", "blog_post_reward"],
  stream: ["stream_rewards"],
};

const INBOUND_TYPES = new Set([
  "deposit",
  "like",
  "blog_like_reward",
  "stream_rewards",
  "blog_post_reward",
  "mines_win",
  "daily_claim",
  "early_exit",
  "referral_bonus",
  "vault_maturity",
]);

const ICON_MAP = {
  deposit: "arrow-down-to-line",
  withdrawal: "arrow-up-right",
  vault_fund: "shield",
  daily_claim: "sun",
  blog_like_reward: "thumbs-up",
  blog_post_reward: "message-circle-heart",
  stream_rewards: "music",
  early_exit: "door-open",
  referral_bonus: "users",
  vault_maturity: "lock-open",
};

// ─── STATE ───────────────────────────────────────────────────────

let allTransactions = [];
let filteredTxns    = [];
let currentPage     = 1;
let activeFilter    = 'all';
let isLoaded        = false; // guard: only fetch once

// ─── DOM REFS ─────────────────────────────────────────────────────

const listEl      = document.getElementById('txnList');
const emptyEl     = document.getElementById('txnEmpty');
const emptySubEl  = document.getElementById('txnEmptySub');
const countEl     = document.getElementById('txnCount');
const totalEl     = document.getElementById('txnTotal');
const loadWrapEl  = document.getElementById('txnLoadWrap');
const loadMoreBtn = document.getElementById('txnLoadMore');
const filterTabs  = document.querySelectorAll('.txn-filter-tab');

// ─── HELPERS ──────────────────────────────────────────────────────

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function getSign(type) {
  return INBOUND_TYPES.has(type) ? '+' : '-';
}

function calcNetTotal(txns) {
  return txns.reduce((acc, t) => {
    const amt = Number(t.amount);
    return INBOUND_TYPES.has(t.type) ? acc + amt : acc - amt;
  }, 0);
}

// ─── FILTER ───────────────────────────────────────────────────────

function applyFilter(filter) {
  activeFilter  = filter;
  currentPage   = 1;
  const types   = FILTER_GROUPS[filter];
  filteredTxns  = types
    ? allTransactions.filter(t => types.includes(t.type))
    : [...allTransactions];

  updateSummary();
  renderList();
}

// ─── SUMMARY STRIP ────────────────────────────────────────────────

function updateSummary() {
  const count  = filteredTxns.length;
  const net    = calcNetTotal(filteredTxns);
  const isPos  = net >= 0;

  if (countEl) {
    countEl.classList.remove('skeleton');
    countEl.textContent = `${count} transaction${count !== 1 ? 's' : ''}`;
  }

  if (totalEl) {
    totalEl.classList.remove('skeleton');
    totalEl.textContent = `Net: ${isPos ? '+' : ''}${formatNaira(Math.abs(net))}`;
    totalEl.style.color = isPos
      ? 'var(--status-success-text)'
      : 'var(--status-error-text)';
  }
}

// ─── ROW RENDERER ─────────────────────────────────────────────────

function renderRow(txn) {
  const isIn   = INBOUND_TYPES.has(txn.type);
  const sign   = isIn ? '+' : '-';
  const icon   = ICON_MAP[txn.type] || 'bell-dot';
  const status = txn.status || 'completed';

  const row = document.createElement('div');
  row.className = 'txn-row';
  row.setAttribute('role', 'listitem');
  row.dataset.txnId = txn.id;

  row.innerHTML = `
    <div class="txn-row__left flex items-center gap-3">
      <div class="txn-row__icon txn-row__icon--${txn.type} flex-center">
        <i data-lucide="${icon}" style="width:15px;height:15px;stroke-width:2px"></i>
      </div>
      <div class="flex-col gap-1">
        <span class="txn-row__label">${txn.label}</span>
        <span class="txn-row__meta">${formatDate(txn.created_at)}</span>
      </div>
    </div>
    <div class="txn-row__right flex-col items-end gap-1">
      <span class="txn-row__amount ${isIn ? 'txn-row__amount--in' : ''}">
        ${sign}${formatNaira(txn.amount)}
      </span>
      <span class="txn-row__status txn-row__status--${status}">
        ${status}
      </span>
    </div>
  `;

  row.addEventListener('click', () => {
    openModal('txn_detail', { txn });
  });

  if (window.lucide) lucide.createIcons({ nodes: [row] });

  return row;
}

// ─── LIST RENDERER ────────────────────────────────────────────────

function renderList() {
  if (!listEl) return;

  listEl.innerHTML = '';

  if (filteredTxns.length === 0) {
    emptyEl?.classList.remove('hidden');

    if (emptySubEl) {
      emptySubEl.textContent = activeFilter === 'all'
        ? 'Your activity will appear here once you make a deposit.'
        : `No ${activeFilter} transactions yet.`;
    }

    loadWrapEl?.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');

  const slice = filteredTxns.slice(0, currentPage * PAGE_SIZE);

  // with this:
  slice.forEach(txn => listEl.appendChild(renderRow(txn)));
  if (window.lucide) lucide.createIcons({ nodes: [listEl] });

  // Load more visibility
  if (filteredTxns.length > slice.length) {
    loadWrapEl?.classList.remove('hidden');
    if (loadMoreBtn) loadMoreBtn.disabled = false;
  } else {
    loadWrapEl?.classList.add('hidden');
  }
}

// ─── FETCH ────────────────────────────────────────────────────────

export async function loadTransactions(userId) {
  // Only fetch once — switching tabs reuses cached data
  if (isLoaded) return;

  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, label, amount, status, reference, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Clear skeleton rows
  if (listEl) listEl.innerHTML = '';

  if (error) {
    console.error('[transactions] Fetch error:', error);
    if (emptyEl) {
      emptyEl.classList.remove('hidden');
      if (emptySubEl) emptySubEl.textContent = 'Could not load transactions. Please refresh.';
    }
    if (countEl) { countEl.classList.remove('skeleton'); countEl.textContent = '—'; }
    if (totalEl) { totalEl.classList.remove('skeleton'); totalEl.textContent = ''; }
    return;
  }

  allTransactions = data ?? [];
  isLoaded        = true;

  applyFilter(activeFilter);
}

// ─── INIT ─────────────────────────────────────────────────────────

export function initTransactions(userId) {

  // ── Filter tab clicks ──
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      applyFilter(tab.dataset.filter);
    });
  });

  // ── Load more ──
  loadMoreBtn?.addEventListener('click', () => {
    currentPage++;
    renderList();
  });

  // ── Lazy-load: only hit Supabase when the section is first opened ──
  // The nav click handler in dashboard.js calls switchSection('transact').
  // We hook into that by watching the section becoming visible.
  const section = document.getElementById('section-transact');
  if (!section) return;

  const observer = new MutationObserver(() => {
    if (!section.classList.contains('hidden')) {
      loadTransactions(userId);
    }
  });

  observer.observe(section, { attributes: true, attributeFilter: ['class'] });
}



export function resetTransactions() {
  isLoaded = false;
  allTransactions = [];
  filteredTxns = [];
}


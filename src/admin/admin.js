/**
 * admin.js - GrowthHaven Admin Dashboard Entry
 */

import '../assets/styles/fonts.css'
import '../assets/styles/variables.css'
import '../assets/styles/utils.css'
import '../assets/styles/style.css'
import '../assets/styles/animations.css'
import '../assets/styles/landing.css'
import '../assets/styles/queries.css'
import '../assets/styles/dashboard.css'
import '../assets/styles/transactions.css'
import '../dashboard/modal.css'
import './admin.css'

import { supabase } from '../assets/js/supabase.js';
import { formatDate, getInitials } from '../assets/js/utils.js';

const headerNameEl = document.getElementById('headerName');
const avatarEl = document.getElementById('avatarInitials');
const sections = [...document.querySelectorAll('.dash-section')];
const navLinks = [...document.querySelectorAll('.dash-nav-link[data-nav]')];
const sidebar = document.getElementById('dashSidebar');
const overlay = document.getElementById('sidebarOverlay');
const hamburger = document.getElementById('sidebarToggle');
const sidebarSignoutBtn = document.getElementById('sidebarSignoutBtn');
const overviewSectionInner = document.querySelector('#section-home .dash-section__inner');
const membersSectionInner = document.querySelector('#section-members .dash-section__inner');
const withdrawalsSectionInner = document.querySelector('#section-withdrawals .dash-section__inner');

const VALID_SECTIONS = new Set(['home', 'members', 'withdrawals']);
const SECTION_STORAGE_KEY = 'gh_admin_current_tab';
const loadedSections = { members: false, withdrawals: false };

let membersState = {
  items: [],
  query: '',
  expandedId: null,
  loading: false,
};

let withdrawalsState = {
  items: [],
  filter: 'all',
  loading: false,
};

const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  window.location.href = '/src/login/';
  throw new Error('[admin] No session.');
}

const { data: member } = await supabase
  .from('members')
  .select('role, first_name, last_name')
  .eq('id', session.user.id)
  .single();

if (!member || member.role !== 'admin') {
  window.location.href = '/src/dashboard/';
  throw new Error('[admin] Access denied.');
}

const firstName = member.first_name || '';
const lastName = member.last_name || '';

if (avatarEl) {
  avatarEl.textContent = getInitials(firstName, lastName);
}

if (headerNameEl) {
  headerNameEl.textContent = `${firstName} ${lastName}`.trim() || 'Admin';
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-NG');
}

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMemberFullName(memberRecord) {
  const first = memberRecord.first_name || '';
  const last = memberRecord.last_name || '';
  const fullName = `${first} ${last}`.trim();
  return fullName || 'Unnamed member';
}

function getRoleClass(role) {
  const normalizedRole = (role || 'user').toLowerCase();
  return `admin-pill--role-${normalizedRole}`;
}

function formatMaybeDate(value) {
  return value ? formatDate(value) : 'Unavailable';
}

function getStatusClass(status) {
  const normalizedStatus = (status || '').toLowerCase();

  if (normalizedStatus === 'completed') return 'txn-row__status--completed';
  if (normalizedStatus === 'pending') return 'txn-row__status--pending';
  if (normalizedStatus === 'approved') return 'txn-row__status--approved';
  if (normalizedStatus === 'rejected') return 'txn-row__status--rejected';
  return 'txn-row__status--failed';
}

function getWithdrawalSortWeight(status) {
  if (status === 'pending') return 0;
  if (status === 'approved') return 1;
  return 2;
}

function getFilteredWithdrawals() {
  const nextItems = [...withdrawalsState.items];

  const filteredItems = withdrawalsState.filter === 'all'
    ? nextItems
    : nextItems.filter((item) => item.role === withdrawalsState.filter.slice(0, -1));

  return filteredItems.sort((left, right) => {
    const weightDiff = getWithdrawalSortWeight(left.status) - getWithdrawalSortWeight(right.status);
    if (weightDiff !== 0) return weightDiff;

    const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightDate - leftDate;
  });
}

function debounce(callback, delay = 200) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

function setOverviewValue(elementId, value, formatter = (nextValue) => nextValue) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.classList.remove('skeleton');
  element.textContent = formatter(value);
}

function setOverviewMeta(elementId, text) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.classList.remove('skeleton');
  element.textContent = text;
}

function renderOverviewShell() {
  if (!overviewSectionInner) return;

  overviewSectionInner.innerHTML = `
    <div class="greeting">
      <h1 class="dash-welcome-card__greeting" id="greetingText">
        Good day${firstName ? `, ${firstName}` : ''}.
      </h1>
      <p class="dash-welcome-card__sub">
        Welcome to the Admin Dashboard! <br> A live snapshot of GrowthHaven members, vault activity, and withdrawal demand.
      </p>
    </div>

    <div class="admin-stats-grid">
      <div class="dash-card">
        <p class="dash-card__label flex items-center gap-2 uppercase">
          <i data-lucide="users" style="width:13px;height:13px"></i>
          Total Members
        </p>
        <span class="admin-stat-card__value skeleton" id="overviewTotalMembers">0</span>
        <p class="admin-stat-card__meta skeleton" id="overviewTotalMembersMeta">Loading members</p>
      </div>

      <div class="dash-card">
        <p class="dash-card__label flex items-center gap-2 uppercase">
          <i data-lucide="badge-percent" style="width:13px;height:13px"></i>
          Total Promoters
        </p>
        <span class="admin-stat-card__value skeleton" id="overviewTotalPromoters">0</span>
        <p class="admin-stat-card__meta skeleton" id="overviewTotalPromotersMeta">Loading promoters</p>
      </div>

      <div class="dash-card">
        <p class="dash-card__label flex items-center gap-2 uppercase">
          <i data-lucide="hourglass" style="width:13px;height:13px"></i>
          Pending Withdrawals
        </p>
        <span class="admin-stat-card__value skeleton" id="overviewPendingWithdrawals">0</span>
        <p class="admin-stat-card__meta skeleton" id="overviewPendingWithdrawalsMeta">Loading requests</p>
      </div>

      <div class="dash-card">
        <p class="dash-card__label flex items-center gap-2 uppercase">
          <i data-lucide="wallet" style="width:13px;height:13px"></i>
          Total Deposits Ever
        </p>
        <span class="admin-stat-card__value skeleton" id="overviewTotalDeposits">N0.00</span>
        <p class="admin-stat-card__meta skeleton" id="overviewTotalDepositsMeta">Loading deposits</p>
      </div>

      <div class="dash-card">
        <p class="dash-card__label flex items-center gap-2 uppercase">
          <i data-lucide="shield-check" style="width:13px;height:13px"></i>
          Active Vault Plans
        </p>
        <span class="admin-stat-card__value skeleton" id="overviewActiveVaultPlans">0</span>
        <p class="admin-stat-card__meta skeleton" id="overviewActiveVaultPlansMeta">Loading plans</p>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function loadTotalMembersStat() {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true });

  if (error) {
    setOverviewValue('overviewTotalMembers', '--');
    setOverviewMeta('overviewTotalMembersMeta', 'Could not load members');
    return;
  }

  setOverviewValue('overviewTotalMembers', count, formatCount);
  setOverviewMeta('overviewTotalMembersMeta', 'Registered member accounts');
}

async function loadTotalPromotersStat() {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .or('role.eq.promoter,promoter.eq.true');

  if (error) {
    setOverviewValue('overviewTotalPromoters', '--');
    setOverviewMeta('overviewTotalPromotersMeta', 'Could not load promoters');
    return;
  }

  setOverviewValue('overviewTotalPromoters', count, formatCount);
  setOverviewMeta('overviewTotalPromotersMeta', 'Members flagged as promoters');
}

async function loadPendingWithdrawalsStat() {
  const { data, count, error } = await supabase
    .from('withdrawal_requests')
    .select('amount', { count: 'exact' })
    .eq('status', 'pending');

  if (error) {
    setOverviewValue('overviewPendingWithdrawals', '--');
    setOverviewMeta('overviewPendingWithdrawalsMeta', 'Could not load pending withdrawals');
    return;
  }

  const totalAmount = (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  setOverviewValue('overviewPendingWithdrawals', count, formatCount);
  setOverviewMeta(
    'overviewPendingWithdrawalsMeta',
    `${formatNaira(totalAmount)} awaiting review`
  );
}

async function loadTotalDepositsStat() {
  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('type', 'deposit')
    .eq('status', 'completed');

  if (error) {
    setOverviewValue('overviewTotalDeposits', '--');
    setOverviewMeta('overviewTotalDepositsMeta', 'Could not load deposit volume');
    return;
  }

  const totalAmount = (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  setOverviewValue('overviewTotalDeposits', totalAmount, formatNaira);
  setOverviewMeta('overviewTotalDepositsMeta', 'Completed deposits across all time');
}

async function loadActiveVaultPlansStat() {
  const { count, error } = await supabase
    .from('investments')
    .select('user_id', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) {
    setOverviewValue('overviewActiveVaultPlans', '--');
    setOverviewMeta('overviewActiveVaultPlansMeta', 'Could not load active plans');
    return;
  }

  setOverviewValue('overviewActiveVaultPlans', count, formatCount);
  setOverviewMeta('overviewActiveVaultPlansMeta', 'Vault plans currently running');
}

async function loadOverviewSection() {
  renderOverviewShell();

  await Promise.allSettled([
    loadTotalMembersStat(),
    loadTotalPromotersStat(),
    loadPendingWithdrawalsStat(),
    loadTotalDepositsStat(),
    loadActiveVaultPlansStat(),
  ]);
}

function renderWithdrawalsSection() {
  if (!withdrawalsSectionInner) return;

  if (!document.getElementById('withdrawalsListStack')) {
    withdrawalsSectionInner.innerHTML = `
      <div class="admin-section-head">
        <div class="admin-section-head__content">
          <h2 class="admin-section-head__title">Withdrawals</h2>
          <p class="admin-section-head__sub">Review payout requests, separate user and promoter queues, and move requests through the approval flow.</p>
        </div>

        <div class="admin-section-tools">
          <button class="admin-refresh-btn" id="withdrawalsRefreshBtn" type="button" aria-label="Refresh withdrawals">
            <i data-lucide="refresh-cw" style="width:16px;height:16px"></i>
          </button>
        </div>
      </div>

      <div class="txn-filters" role="tablist" aria-label="Filter withdrawals">
        <button class="txn-filter-tab is-active" data-withdrawal-filter="all" type="button">All</button>
        <button class="txn-filter-tab" data-withdrawal-filter="users" type="button">Users</button>
        <button class="txn-filter-tab" data-withdrawal-filter="promoters" type="button">Promoters</button>
      </div>

      <div class="admin-stack" id="withdrawalsListStack"></div>
    `;

    document.getElementById('withdrawalsRefreshBtn')?.addEventListener('click', async () => {
      await loadWithdrawalsSection({ force: true });
    });

    withdrawalsSectionInner.querySelector('.txn-filters')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-withdrawal-filter]');
      if (!button) return;

      withdrawalsState.filter = button.dataset.withdrawalFilter;
      withdrawalsSectionInner
        .querySelectorAll('[data-withdrawal-filter]')
        .forEach((tab) => tab.classList.toggle('is-active', tab === button));

      renderWithdrawalsList();
    });

    document.getElementById('withdrawalsListStack')?.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-withdrawal-action]');
      if (!actionButton) return;

      const withdrawalId = actionButton.dataset.withdrawalId;
      const nextStatus = actionButton.dataset.withdrawalAction;
      await updateWithdrawalStatus(withdrawalId, nextStatus, actionButton);
    });
  }

  renderWithdrawalsList();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderWithdrawalsList() {
  const withdrawalsListStack = document.getElementById('withdrawalsListStack');
  if (!withdrawalsListStack) return;

  const filteredWithdrawals = getFilteredWithdrawals();
  const listMarkup = withdrawalsState.loading
    ? `
      <div class="admin-list-card">
        <div class="admin-withdrawal-item">
          <div class="admin-withdrawal-main">
            <span class="admin-withdrawal-name skeleton">Loading request</span>
            <span class="admin-withdrawal-meta skeleton">Loading bank details</span>
            <span class="admin-withdrawal-bank skeleton">Loading date</span>
          </div>
          <div class="admin-withdrawal-side">
            <span class="admin-withdrawal-amount skeleton">₦0.00</span>
            <div class="admin-pill-row">
              <span class="admin-pill skeleton">Role</span>
              <span class="txn-row__status skeleton">Status</span>
            </div>
          </div>
        </div>
        <div class="admin-withdrawal-item">
          <div class="admin-withdrawal-main">
            <span class="admin-withdrawal-name skeleton">Loading request</span>
            <span class="admin-withdrawal-meta skeleton">Loading bank details</span>
            <span class="admin-withdrawal-bank skeleton">Loading date</span>
          </div>
          <div class="admin-withdrawal-side">
            <span class="admin-withdrawal-amount skeleton">₦0.00</span>
            <div class="admin-pill-row">
              <span class="admin-pill skeleton">Role</span>
              <span class="txn-row__status skeleton">Status</span>
            </div>
          </div>
        </div>
      </div>
    `
    : filteredWithdrawals.length
      ? `
        <div class="admin-list-card">
          ${filteredWithdrawals.map((withdrawal) => {
            const roleLabel = withdrawal.role === 'promoter' ? 'promoter' : 'user';
            const status = withdrawal.status || 'pending';
            const canApprove = status === 'pending';
            const canComplete = status === 'approved';
            const canReject = status === 'pending' || status === 'approved';

            return `
              <div class="admin-withdrawal-item">
                <div class="admin-withdrawal-main">
                  <span class="admin-withdrawal-name">${escapeHtml(withdrawal.requester_name)}</span>
                  <span class="admin-withdrawal-meta">${escapeHtml(withdrawal.bank)} · ${escapeHtml(withdrawal.account_name)} · ${escapeHtml(withdrawal.account_number)}</span>
                  <span class="admin-withdrawal-bank">${escapeHtml(formatMaybeDate(withdrawal.created_at))}</span>
                </div>

                <div class="admin-withdrawal-side">
                  <span class="admin-withdrawal-amount">${escapeHtml(formatNaira(withdrawal.amount))}</span>
                  <div class="admin-pill-row">
                    <span class="admin-pill ${getRoleClass(roleLabel)}">${escapeHtml(roleLabel)}</span>
                    <span class="txn-row__status ${getStatusClass(status)}">${escapeHtml(status)}</span>
                  </div>
                  ${(canApprove || canComplete || canReject) ? `
                    <div class="admin-withdrawal-actions">
                      ${canApprove ? `
                        <button
                          class="dash-action-btn dash-action-btn--primary"
                          type="button"
                          data-withdrawal-id="${escapeHtml(withdrawal.id)}"
                          data-withdrawal-action="approved"
                        >
                          Approve
                        </button>
                      ` : ''}
                      ${canComplete ? `
                        <button
                          class="dash-action-btn dash-action-btn--primary"
                          type="button"
                          data-withdrawal-id="${escapeHtml(withdrawal.id)}"
                          data-withdrawal-action="completed"
                        >
                          Mark Complete
                        </button>
                      ` : ''}
                      ${canReject ? `
                        <button
                          class="dash-action-btn dash-action-btn--danger"
                          type="button"
                          data-withdrawal-id="${escapeHtml(withdrawal.id)}"
                          data-withdrawal-action="rejected"
                        >
                          Reject
                        </button>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `
      : `
        <div class="admin-empty">
          No withdrawal requests found for this filter.
        </div>
      `;

  withdrawalsListStack.innerHTML = listMarkup;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function getFilteredMembers() {
  const query = membersState.query.trim().toLowerCase();
  if (!query) return membersState.items;

  return membersState.items.filter((memberRecord) => {
    const fullName = getMemberFullName(memberRecord).toLowerCase();
    const email = (memberRecord.email || '').toLowerCase();
    return fullName.includes(query) || email.includes(query);
  });
}

function renderMembersSection() {
  if (!membersSectionInner) return;

  if (!document.getElementById('membersListStack')) {
    membersSectionInner.innerHTML = `
      <div class="admin-section-head">
        <div class="admin-section-head__content">
          <h2 class="admin-section-head__title">Members</h2>
          <p class="admin-section-head__sub">Search the member base, inspect balances and referral lineage, and assign promoter access.</p>
        </div>
      </div>
      
      <div class="admin-search">
        <div class="admin-input__wrap">
          <i data-lucide="search" style="width:16px;height:16px"></i>
          <input
            class="admin-search__input"
            id="membersSearchInput"
            type="search"
            placeholder="Search by member name or email"
            value="${escapeHtml(membersState.query)}"
          />
        </div>
        <div class="admin-section-tools">
          <button class="admin-refresh-btn" id="membersRefreshBtn" type="button" aria-label="Refresh members">
            <i data-lucide="refresh-cw" style="width:16px;height:16px"></i>
          </button>
        </div>
      </div>

      <div class="admin-stack" id="membersListStack"></div>
    `;

    const searchInput = document.getElementById('membersSearchInput');
    const debouncedSearch = debounce((nextQuery) => {
      membersState.query = nextQuery;
      renderMembersList();
    }, 200);

    searchInput?.addEventListener('input', (event) => {
      debouncedSearch(event.target.value);
    });

    document.getElementById('membersRefreshBtn')?.addEventListener('click', async () => {
      await loadMembersSection({ force: true });
    });

    document.getElementById('membersListStack')?.addEventListener('click', async (event) => {
      const toggleButton = event.target.closest('[data-member-toggle]');
      if (toggleButton) {
        const memberId = toggleButton.dataset.memberToggle;
        membersState.expandedId = membersState.expandedId === memberId ? null : memberId;
        renderMembersList();
        return;
      }

      const promoteButton = event.target.closest('[data-promote-member]');
      if (promoteButton) {
        const memberId = promoteButton.dataset.promoteMember;
        await promoteMember(memberId, promoteButton);
      }
    });
  }

  renderMembersList();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderMembersList() {
  const membersListStack = document.getElementById('membersListStack');
  if (!membersListStack) return;

  const filteredMembers = getFilteredMembers();
  const listMarkup = membersState.loading
    ? `
      <div class="admin-list-card">
        <div class="admin-member-item">
          <button class="admin-member-toggle" type="button" disabled>
            <div class="admin-member-main">
              <span class="admin-member-name skeleton">Loading member</span>
              <span class="admin-member-email skeleton">Loading email</span>
            </div>
            <div class="admin-member-side">
            <span class="admin-member-email skeleton">Loading date</span>
              <div class="admin-pill-row">
                <span class="admin-pill skeleton">Role</span>
                <span class="admin-pill skeleton">Deposit</span>
              </div>
            </div>
          </button>
        </div>
        <div class="admin-member-item">
          <button class="admin-member-toggle" type="button" disabled>
            <div class="admin-member-main">
              <span class="admin-member-name skeleton">Loading member</span>
              <span class="admin-member-email skeleton">Loading email</span>
            </div>
            <div class="admin-member-side">
              <div class="admin-pill-row">
                <span class="admin-pill skeleton">Role</span>
                <span class="admin-pill skeleton">Deposit</span>
              </div>
              <span class="admin-member-email skeleton">Loading date</span>
            </div>
          </button>
        </div>
      </div>
    `
    : filteredMembers.length
      ? `
        <div class="admin-list-card" id="membersList">
          ${filteredMembers.map((memberRecord) => {
            const isOpen = membersState.expandedId === memberRecord.id;
            const isPromoter = memberRecord.role === 'promoter' || memberRecord.promoter === true;
            const referralSource = memberRecord.referrer_code || 'Direct signup';
            const lastSeen = memberRecord.last_active_at || memberRecord.created_at;

            return `
              <div class="admin-member-item ${isOpen ? 'is-open' : ''}" data-member-id="${escapeHtml(memberRecord.id)}">
                <button class="admin-member-toggle" type="button" data-member-toggle="${escapeHtml(memberRecord.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
                  <div class="admin-member-main">
                    <span class="admin-member-name">${escapeHtml(getMemberFullName(memberRecord))}</span>
                    <span class="admin-member-email">${escapeHtml(memberRecord.email || 'No email')}</span>
                    <span class="admin-member-email">Joined ${escapeHtml(formatMaybeDate(memberRecord.created_at))}</span>
                  </div>
                  <div class="admin-member-side">
                    <div class="admin-pill-row">
                      <span class="admin-pill ${getRoleClass(memberRecord.role || 'user')}">${escapeHtml(memberRecord.role || 'user')}</span>
                      <span class="admin-pill ${memberRecord.has_deposited ? 'admin-pill--deposited' : 'admin-pill--not-deposited'}">
                        ${memberRecord.has_deposited ? 'Deposited' : 'No deposit'}
                      </span>
                    </div>
                    <i class="admin-member-chevron" data-lucide="chevron-down" style="width:16px;height:16px"></i>
                  </div>
                </button>

                <div class="admin-member-panel">
                  <div class="admin-member-panel__inner">
                    <div class="admin-member-details">
                      <div class="admin-member-detail-grid">
                        <div class="admin-member-detail">
                          <span class="admin-member-detail__label">Referral Code</span>
                          <span class="admin-member-detail__value">${escapeHtml(memberRecord.referral_code || 'Not set')}</span>
                        </div>
                        <div class="admin-member-detail">
                          <span class="admin-member-detail__label">Referrer</span>
                          <span class="admin-member-detail__value">${escapeHtml(referralSource)}</span>
                        </div>
                        <div class="admin-member-detail">
                          <span class="admin-member-detail__label">Wallet Balance</span>
                          <span class="admin-member-detail__value">${escapeHtml(formatNaira(memberRecord.wallet_balance))}</span>
                        </div>
                        <div class="admin-member-detail">
                          <span class="admin-member-detail__label">Vault Balance</span>
                          <span class="admin-member-detail__value">${escapeHtml(formatNaira(memberRecord.vault_balance))}</span>
                        </div>
                        <div class="admin-member-detail">
                          <span class="admin-member-detail__label">Last Seen</span>
                          <span class="admin-member-detail__value">${escapeHtml(formatMaybeDate(lastSeen))}</span>
                        </div>
                      </div>

                      <div>
                        <button
                          class="dash-action-btn ${isPromoter ? 'dash-action-btn--secondary' : 'dash-action-btn--primary'}"
                          type="button"
                          data-promote-member="${escapeHtml(memberRecord.id)}"
                          ${isPromoter ? 'disabled' : ''}
                        >
                          ${isPromoter ? 'Already Promoter' : 'Make Promoter'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `
      : `
        <div class="admin-empty">
          ${membersState.items.length ? 'No members match your current search.' : 'No members found yet.'}
        </div>
      `;

  membersListStack.innerHTML = listMarkup;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function loadMembersSection({ force = false } = {}) {
  if (!membersSectionInner) return;
  if (membersState.loading) return;
  if (loadedSections.members && !force) return;

  membersState.loading = true;
  renderMembersSection();

  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, email, role, promoter, has_deposited, created_at, referral_code, referrer_code, wallet_balance, vault_balance')
    .order('created_at', { ascending: false });

  membersState.loading = false;

  if (error) {
    membersState.items = [];
    renderMembersSection();
    const membersListStack = document.getElementById('membersListStack');
    if (membersListStack) {
      membersListStack.innerHTML = `
        <div class="admin-empty">
          Could not load members right now. Try refreshing this section.
        </div>
      `;
    }
    return;
  }

  membersState.items = data || [];
  loadedSections.members = true;
  renderMembersSection();
}

async function promoteMember(memberId, button) {
  if (!memberId) return;

  button.disabled = true;
  button.textContent = 'Updating...';

  const { error } = await supabase
    .from('members')
    .update({ role: 'promoter', promoter: true })
    .eq('id', memberId);

  if (error) {
    button.disabled = false;
    button.textContent = 'Make Promoter';
    return;
  }

  membersState.items = membersState.items.map((memberRecord) => (
    memberRecord.id === memberId
      ? { ...memberRecord, role: 'promoter', promoter: true }
      : memberRecord
  ));

  renderMembersSection();
  await loadTotalPromotersStat();
}

async function loadWithdrawalsSection({ force = false } = {}) {
  if (!withdrawalsSectionInner) return;
  if (withdrawalsState.loading) return;
  if (loadedSections.withdrawals && !force) return;

  withdrawalsState.loading = true;
  renderWithdrawalsSection();

  const { data: requests, error: requestsError } = await supabase
    .from('withdrawal_requests')
    .select('id, user_id, role, amount, bank, account_number, account_name, status, reference, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (requestsError) {
    withdrawalsState.loading = false;
    withdrawalsState.items = [];
    renderWithdrawalsSection();
    const withdrawalsListStack = document.getElementById('withdrawalsListStack');
    if (withdrawalsListStack) {
      withdrawalsListStack.innerHTML = `
        <div class="admin-empty">
          Could not load withdrawal requests right now. Try refreshing this section.
        </div>
      `;
    }
    return;
  }

  const userIds = [...new Set((requests || []).map((item) => item.user_id).filter(Boolean))];

  let membersById = new Map();
  if (userIds.length) {
    const { data: memberRecords } = await supabase
      .from('members')
      .select('id, first_name, last_name')
      .in('id', userIds);

    membersById = new Map(
      (memberRecords || []).map((memberRecord) => [memberRecord.id, getMemberFullName(memberRecord)])
    );
  }

  withdrawalsState.items = (requests || []).map((item) => ({
    ...item,
    requester_name: membersById.get(item.user_id) || 'Unknown member',
  }));

  withdrawalsState.loading = false;
  loadedSections.withdrawals = true;
  renderWithdrawalsSection();
}

async function updateWithdrawalStatus(withdrawalId, nextStatus, button) {
  if (!withdrawalId || !nextStatus) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Updating...';

  const { data, error } = await supabase.rpc('admin_update_withdrawal_status', {
    p_withdrawal_id: withdrawalId,
    p_new_status: nextStatus,
  });

  if (error) {
    button.disabled = false;
    button.textContent = originalText;
    return;
  }

  withdrawalsState.items = withdrawalsState.items.map((item) => (
    item.id === withdrawalId
      ? { ...item, ...data }
      : item
  ));

  renderWithdrawalsSection();
  await loadPendingWithdrawalsStat();
}

function closeSidebar() {
  sidebar?.classList.remove('is-open');
  overlay?.classList.remove('is-open');
  hamburger?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function openSidebar() {
  sidebar?.classList.add('is-open');
  overlay?.classList.add('is-open');
  hamburger?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

export function switchSection(name) {
  const activeSection = VALID_SECTIONS.has(name) ? name : 'home';

  localStorage.setItem(SECTION_STORAGE_KEY, activeSection);

  sections.forEach((section) => {
    section.classList.add('hidden');
    section.classList.remove('section--active');
  });

  navLinks.forEach((link) => {
    link.classList.remove('nav-active');
  });

  const target = document.getElementById(`section-${activeSection}`);
  const link = document.querySelector(`[data-nav="${activeSection}"]`);

  if (target) {
    target.classList.remove('hidden');
    void target.offsetWidth;
    target.classList.add('section--active');
  }

  if (link) {
    link.classList.add('nav-active');
  }

  if (activeSection === 'members') {
    loadMembersSection();
  }

  if (activeSection === 'withdrawals') {
    loadWithdrawalsSection();
  }

  closeSidebar();
}

hamburger?.addEventListener('click', () => {
  sidebar?.classList.contains('is-open') ? closeSidebar() : openSidebar();
});

overlay?.addEventListener('click', closeSidebar);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sidebar?.classList.contains('is-open')) {
    closeSidebar();
  }
});

navLinks.forEach((link) => {
  link.addEventListener('click', () => switchSection(link.dataset.nav));
});

sidebarSignoutBtn?.addEventListener('click', async () => {
  sidebarSignoutBtn.disabled = true;

  const label = sidebarSignoutBtn.querySelector('span');
  if (label) {
    label.textContent = 'Signing out...';
  }

  await supabase.auth.signOut();
  localStorage.removeItem('gh_reg_step');
  localStorage.removeItem('gh_reg_email');
  localStorage.removeItem(SECTION_STORAGE_KEY);
  window.location.href = '/src/login/';
});

const initialSection = localStorage.getItem(SECTION_STORAGE_KEY) || 'home';
switchSection(initialSection);
await loadOverviewSection();



/**
 * quest.js - GrowthHaven Quests System
 * 
 */

import { supabase } from "../assets/js/supabase.js";


// ─── CONFIG ───────────────────────────────────────────────────────

const TG_COMMUNITY_URL = "https://t.me/+UHPnYhMx6aI3NzBk";

// Category labels for the UI
const CATEGORY_LABELS = {
  onboarding: "Onboarding",
  daily: "Daily",
  retention: "Streak",
  feature: "Feature",
};

// Sort order for the quest list — "ready to claim" always surfaces first
const STATUS_SORT = { completed: 0, in_progress: 1, available: 2, claimed: 3 };

// Human-readable progress strings per rule_key
const PROGRESS_TEXT = {
  stream_5_today: (p, t) => `${Math.floor(p)} / ${t} songs`,
  play_3_games_today: (p, t) => `${Math.floor(p)} / ${t} games`,
  multi_action_daily: (p, t) => `${Math.floor(p)} / ${t} activity types`,
  vault_hold_7: (p, t) => `Day ${Math.floor(p)} / ${t}`,
  login_streak_7: (p, t) => `Day ${Math.floor(p)} / ${t}`,
  login_streak_14: (p, t) => `Day ${Math.floor(p)} / ${t}`,
};


// ─── MODULE STATE ─────────────────────────────────────────────────

let initialized = false;
let allQuests   = [];
let activeTab   = 'all';
let pwaInstallSheet = null;
let pwaInstallSheetLastFocus = null;
let pwaInstallBodyOverflow = "";
let pwaInstallSheetKeyHandler = null;

const IOS_INSTALL_STEPS = [
  {
    icon: "share",
    title: "Tap Share",
    body: "Use Safari's share button in the bottom toolbar.",
  },
  {
    icon: "list-plus",
    title: "Choose Add to Home Screen",
    body: "Scroll through the actions and select Add to Home Screen.",
  },
  {
    icon: "badge-check",
    title: "Launch GrowthHaven",
    body: "Open GrowthHaven from your home screen to unlock this quest.",
  },
];


// ─── INIT ─────────────────────────────────────────────────────────

/**
 * Call once when the quest section becomes visible.
 * Wired via MutationObserver in dashboard.js 
 */
export async function initQuestSection() {
  if (initialized) return;
  initialized = true;

  initFilterTabs();
  await loadQuests();
}


// ─── DATA ─────────────────────────────────────────────────────────

async function loadQuests() {
  /**
   * Ensure today's login is stamped BEFORE get_user_quests runs.
   * Get_user_quests calculates streak progress live from user_login_days
   */
  const { error: streakError} = await supabase.rpc("record_daily_login");
    if (streakError) {
      console.warn("[quest]: Could not record streak", streakError);
      // Not fatal — we can still load quests, just streak progress may be inaccurate
    }

  const { data, error } = await supabase.rpc("get_user_quests");

  clearSkeletons();

  if (error) {
    console.error("[quests] Load error:", error);
    showQuestEmpty("Could not load quests. Please refresh the page.");
    return;
  }

  // Sort: ready-to-claim first, then in-progress, available, claimed last
  allQuests = (data || []).sort(
    (a, b) =>
      (STATUS_SORT[a.status] ?? 2) - (STATUS_SORT[b.status] ?? 2) ||
      a.sort_order - b.sort_order,
  );

  // Check if standalone PWA launched; auto-completes quest if verified
  await verifyAndCompletePwaQuest();

  renderQuests();
}

async function verifyAndCompletePwaQuest() {
  const pwaQuest = allQuests.find((q) => q.rule_key === "install_app");
  if (!pwaQuest) return;

  // Nothing to update if already completed or claimed
  if (pwaQuest.status === "completed" || pwaQuest.status === "claimed") {
    return;
  }

  // Detect standalone mode
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    if (window.__ghPwaInstallState) {
      window.__ghPwaInstallState.isStandalone = true;
    }

    console.log("[PWA] Standalone launch verified. Auto-completing quest...");

    // Optimistically update the local array so the user gets immediate feedback
    pwaQuest.status = "completed";
    pwaQuest.progress = pwaQuest.target_value;

    // Persist to the database
    const { error } = await supabase
      .from("user_quests")
      .update({
        status: "completed",
        progress: pwaQuest.target_value,
        completed_at: new Date().toISOString(),
      })
      .eq("id", pwaQuest.user_quest_id);

    if (error) {
      console.error("[PWA] Failed to write progress to DB:", error);
      // Revert local optimistic change if backend call failed
      pwaQuest.status = "available";
      pwaQuest.progress = 0;
    }
  }
}

// ─── FILTER TABS ──────────────────────────────────────────────────

function initFilterTabs() {
  document.querySelectorAll('#questFilterTabs .quest-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#questFilterTabs .quest-filter-tab').forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      activeTab = tab.dataset.filter;
      renderQuests();
    });
  });
}


// ─── RENDER ───────────────────────────────────────────────────────

function renderQuests() {
  const listEl  = document.getElementById('questList');
  const emptyEl = document.getElementById('questEmpty');
  if (!listEl) return;

  // Filter by active tab
  const visible = activeTab === 'all'
    ? allQuests
    : allQuests.filter(q => q.category === activeTab || q.quest_type === activeTab);

  listEl.innerHTML = '';

  if (!visible.length) {
    emptyEl?.classList.remove('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');

  // Active quests first, claimed last
  const active  = visible.filter(q => q.status !== 'claimed');
  const claimed = visible.filter(q => q.status === 'claimed');

  [...active, ...claimed].forEach(quest => {
    listEl.appendChild(renderQuestCard(quest));
  });

  updateSummary(visible);
  if (window.lucide) window.lucide.createIcons({ nodes: [listEl] });
}

function updateSummary(quests) {
  const summaryEl = document.getElementById('questSummary');
  if (!summaryEl) return;

  const total       = quests.length;
  const claimed     = quests.filter(q => q.status === 'claimed').length;
  const completable = quests.filter(q => q.status === 'completed').length;

  summaryEl.innerHTML = `
    <span class="quest-summary__count">${claimed} / ${total} completed</span>
    ${completable > 0
      ? `<span class="quest-summary__ready">${completable} ready to claim</span>`
      : ''}
  `;
}

function renderQuestCard(quest) {
  const card = document.createElement("div");
  card.className = "quest-card dash-card";
  card.dataset.questId = quest.user_quest_id;
  card.dataset.status = quest.status;

  const isClaimed = quest.status === "claimed";
  const isCompletable = quest.status === "completed";
  const showProgress = quest.target_value > 1 && !isClaimed;
  const pct = Math.min((quest.progress / quest.target_value) * 100, 100);
  const catLabel = CATEGORY_LABELS[quest.category] || quest.category;
  const typeLabel =
    quest.quest_type === "daily"
      ? "Resets daily"
      : quest.quest_type === "weekly"
        ? "Resets weekly"
        : "One-time";

  const progressLabel = PROGRESS_TEXT[quest.rule_key]
    ? PROGRESS_TEXT[quest.rule_key](quest.progress, quest.target_value)
    : `${Math.floor(quest.progress)} / ${quest.target_value}`;

  const rewardFormatted = Number(quest.reward_amount).toLocaleString("en-NG");

  // ── CTA area — three states ────────────────────────────────────
  let ctaHtml = "";

  if (isClaimed) {
    ctaHtml = `
      <div class="quest-claimed-badge flex items-center gap-1">
        <i data-lucide="check-circle" style="width:13px;height:13px" aria-hidden="true"></i>
        <span>Claimed</span>
      </div>
    `;
  } else if (quest.rule_key === "telegram_join") {
    ctaHtml = `
      <div class="quest-tg-row flex items-center gap-2">
        <a class="quest-tg-link flex items-center gap-1"
           href="${TG_COMMUNITY_URL}"
           aria-label="Open Telegram community">
          <i data-lucide="send" style="width:12px;height:12px" aria-hidden="true"></i>
          Join
        </a>
        <button class="quest-claim-btn quest-claim-btn--claimable"
                data-quest-id="${quest.user_quest_id}" type="button">
          Claim ₦${rewardFormatted}
        </button>
      </div>
    `;
  } else if (quest.rule_key === "install_app" && !isCompletable) {
    // Render active CTA buttons with guides on how to install
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    ctaHtml = `
      <button class="quest-claim-btn quest-pwa-guide-btn" data-quest-id="${quest.user_quest_id}" type="button">
        ${isIOS ? "How to Install" : "Install App"}
      </button>
    `;
  } else {
    ctaHtml = `
      <button
        class="quest-claim-btn ${isCompletable ? "quest-claim-btn--claimable" : "quest-claim-btn--locked"}"
        data-quest-id="${quest.user_quest_id}"
        type="button"
        ${isCompletable ? "" : "disabled"}
        aria-label="${isCompletable ? `Claim ₦${rewardFormatted} reward` : "Quest not yet complete"}"
      >
        ${
          isCompletable
            ? `<i data-lucide="gift" style="width:13px;height:13px" aria-hidden="true"></i> Claim ₦${rewardFormatted}`
            : `₦${rewardFormatted} reward`
        }
      </button>
    `;
  }

  card.innerHTML = `
    <!-- Top Row: Icon, Information, & Right-Side CTA -->
    <div class="quest-card__main-row">
      <div class="quest-card__left">
        <!-- Icon -->
        <div class="quest-card__icon flex-center" aria-hidden="true">
          <i data-lucide="${quest.icon_name}" style="width:16px;height:16px"></i>
        </div>
        <!-- Meta Details -->
        <div class="quest-card__meta">
          <div class="quest-card__title-row">
            <span class="quest-card__title">${quest.title}</span>
            <span class="quest-card__sub-pill">${catLabel}</span>
          </div>
          <p class="quest-card__desc">${quest.description}</p>
        </div>
      </div>
      
      </div>
      <div class="quest-card__footer">
        ${ctaHtml}
      </div>

    <!-- Bottom Row: Spanning Progress Bar -->
    ${
      showProgress
        ? `
    <div class="quest-card__progress-wrap" role="progressbar"
         aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"
         aria-label="${progressLabel}">
      <div class="quest-card__progress-meta">
        <span class="quest-card__progress-label">${progressLabel}</span>
        <span class="quest-card__progress-pct">${Math.round(pct)}%</span>
      </div>
      <div class="quest-card__progress-track">
        <div class="quest-card__progress-fill" style="width:${pct}%"></div>
      </div>
    </div>
    `
        : ""
    }
  `;

  // Wire claim actions
  card
    .querySelectorAll(
      ".quest-claim-btn[data-quest-id]:not(.quest-pwa-guide-btn)",
    )
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        handleClaim(
          quest.user_quest_id,
          card,
          quest.title,
          quest.reward_amount,
        );
      });
    });

  // Wire active PWA install helper guide
  card.querySelectorAll(".quest-pwa-guide-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await handlePwaInstallClick(btn);
    });
  });

  return card;
}

async function handlePwaInstallClick(triggerBtn) {
  if (isPwaStandalone()) {
    showQuestToast("GrowthHaven is already running as an installed app.", "success");
    return;
  }

  if (isInTelegramBrowser()) {
    showQuestToast(
      "PWAs cannot be installed inside Telegram. Open GrowthHaven in Chrome or Safari first.",
      "warning",
    );
    return;
  }

  if (isIOSDevice()) {
    openPwaInstallSheet(triggerBtn);
    return;
  }

  if (typeof window.__ghTriggerAndroidInstall !== "function") {
    showQuestToast(
      "Open your browser menu and choose Install app or Add to Home screen.",
      "info",
    );
    return;
  }

  triggerBtn.disabled = true;
  const originalText = triggerBtn.textContent;
  triggerBtn.textContent = "Opening...";

  const result = await window.__ghTriggerAndroidInstall();

  triggerBtn.disabled = false;
  triggerBtn.textContent = originalText;

  if (result?.outcome === "accepted") {
    showQuestToast("Install started. Open GrowthHaven from your home screen to complete this quest.");
  } else if (result?.outcome === "dismissed") {
    showQuestToast("Install was dismissed. You can try again from this quest card.", "info");
  } else if (result?.outcome === "error") {
    showQuestToast("Could not open the install prompt. Use your browser menu to install GrowthHaven.", "warning");
  } else {
    showQuestToast(
      "Chrome: open the menu, then choose Install app or Add to Home screen.",
      "info",
    );
  }
}

function openPwaInstallSheet(triggerEl) {
  closePwaInstallSheet({ restoreFocus: false });

  pwaInstallSheetLastFocus = triggerEl || document.activeElement;
  pwaInstallBodyOverflow = document.body.style.overflow;

  const sheet = document.createElement("div");
  sheet.className = "quest-pwa-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "questPwaSheetTitle");
  sheet.innerHTML = `
    <div class="quest-pwa-sheet__backdrop" data-pwa-sheet-close></div>
    <section class="quest-pwa-sheet__panel" role="document">
      <div class="quest-pwa-sheet__handle" aria-hidden="true"></div>
      <div class="quest-pwa-sheet__header">
        <div class="quest-pwa-sheet__app-icon" aria-hidden="true">
          <img src="/assets/pwa/icon.svg" alt="" />
        </div>
        <div class="quest-pwa-sheet__title-wrap">
          <h2 class="quest-pwa-sheet__title" id="questPwaSheetTitle">Install GrowthHaven</h2>
          <p class="quest-pwa-sheet__subtitle">Add the app to your Home Screen, then launch it there to complete this quest.</p>
        </div>
        <button class="quest-pwa-sheet__close" type="button" aria-label="Close" data-pwa-sheet-close>
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </div>
      <div class="quest-pwa-sheet__steps">
        ${IOS_INSTALL_STEPS.map((step, index) => `
          <div class="quest-pwa-sheet__step">
            <div class="quest-pwa-sheet__step-icon" aria-hidden="true">
              <i data-lucide="${step.icon}"></i>
            </div>
            <div class="quest-pwa-sheet__step-copy">
              <span class="quest-pwa-sheet__step-kicker">Step ${index + 1}</span>
              <p class="quest-pwa-sheet__step-title">${step.title}</p>
              <p class="quest-pwa-sheet__step-body">${step.body}</p>
            </div>
          </div>
        `).join("")}
      </div>
      <button class="quest-pwa-sheet__done" type="button" data-pwa-sheet-close>
        Got it
      </button>
    </section>
  `;

  document.body.appendChild(sheet);
  document.body.style.overflow = "hidden";
  pwaInstallSheet = sheet;

  sheet.querySelectorAll("[data-pwa-sheet-close]").forEach((el) => {
    el.addEventListener("click", () => closePwaInstallSheet());
  });

  pwaInstallSheetKeyHandler = (event) => {
    if (event.key === "Escape") closePwaInstallSheet();
  };
  document.addEventListener("keydown", pwaInstallSheetKeyHandler);

  requestAnimationFrame(() => {
    sheet.classList.add("is-open");
    sheet.querySelector(".quest-pwa-sheet__close")?.focus();
  });

  if (window.lucide) window.lucide.createIcons({ nodes: [sheet] });
}

function closePwaInstallSheet(options = {}) {
  const { restoreFocus = true } = options;
  const sheet = pwaInstallSheet;
  if (!sheet) return;

  sheet.classList.remove("is-open");
  document.body.style.overflow = pwaInstallBodyOverflow;

  if (pwaInstallSheetKeyHandler) {
    document.removeEventListener("keydown", pwaInstallSheetKeyHandler);
    pwaInstallSheetKeyHandler = null;
  }

  window.setTimeout(() => {
    sheet.remove();
    if (pwaInstallSheet === sheet) pwaInstallSheet = null;
    if (restoreFocus) pwaInstallSheetLastFocus?.focus?.();
  }, 260);
}

function isIOSDevice() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) && !window.MSStream;
}

function isInTelegramBrowser() {
  return /Telegram/i.test(navigator.userAgent || "");
}

function isPwaStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function getStatusLabel(status) {
  const labels = { available: 'Available', in_progress: 'In Progress', completed: 'Ready!', claimed: 'Done' };
  return labels[status] || status;
}



// ─── CLAIM ────────────────────────────────────────────────────────

async function handleClaim(userQuestId, card, title, reward) {
  const allClaimBtns = card.querySelectorAll('.quest-claim-btn');

  allClaimBtns.forEach(btn => {
    btn.disabled    = true;
    btn.textContent = 'Claiming...';
  });

  const { data: newBalance, error } = await supabase.rpc('claim_quest', {
    p_user_quest_id: userQuestId,
  });

  if (error) {
    console.error('[quests] Claim error:', error);
    showQuestToast(error.message || 'Claim failed. Please try again.', 'warning');

    // Restore button
    allClaimBtns.forEach(btn => {
      btn.disabled    = false;
      btn.textContent = `Claim ₦${Number(reward).toLocaleString('en-NG')}`;
    });
    return;
  }

  // Update global wallet balance (defined in dashboard.js)
  window.__ghUpdateWalletBalance?.(newBalance);

  // Update the card in-place — no full reload
  card.dataset.status = 'claimed';

  const statusBadge = card.querySelector('.quest-status-badge');
  if (statusBadge) {
    statusBadge.className   = 'quest-status-badge quest-status-badge--claimed';
    statusBadge.textContent = 'Done';
  }

  const footer = card.querySelector('.quest-card__footer');
  if (footer) {
    const ctaArea = footer.querySelector('.quest-claim-btn, .quest-tg-row, .quest-claimed-badge');
    if (ctaArea) {
      ctaArea.outerHTML = `
        <div class="quest-claimed-badge flex items-center gap-1">
          <i data-lucide="check-circle" style="width:13px;height:13px" aria-hidden="true"></i>
          <span>Claimed</span>
        </div>
      `;
    }
    if (window.lucide) window.lucide.createIcons({ nodes: [footer] });
  }

  // Update local state so filter re-renders stay correct
  const q = allQuests.find(x => x.user_quest_id === userQuestId);
  if (q) q.status = 'claimed';

  updateSummary(activeTab === 'all'
    ? allQuests
    : allQuests.filter(q => q.category === activeTab || q.quest_type === activeTab));

  showQuestToast(`₦${Number(reward).toLocaleString('en-NG')} added to your wallet!`);

  // Refresh home activity feed
  window.__ghRefreshActivity?.();
}



// ─── UTILS ────────────────────────────────────────────────────────

function clearSkeletons() {
  document.querySelectorAll('#questList .quest-skeleton').forEach(el => el.remove());
}

function showQuestEmpty(message) {
  const emptyEl = document.getElementById('questEmpty');
  if (!emptyEl) return;
  const sub = emptyEl.querySelector('.quest-empty__sub');
  if (sub && message) sub.textContent = message;
  emptyEl.classList.remove('hidden');
}

function showQuestToast(message, type = 'success') {
  // Reuses existing invest-toast classes from dashboard.css
  const existing = document.querySelector('.invest-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `invest-toast invest-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity    = '0';
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}



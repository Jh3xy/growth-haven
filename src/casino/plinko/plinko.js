/**
 * plinko.js — GrowthHaven Plinko
 */

import "../../assets/styles/fonts.css";
import "../../assets/styles/variables.css";
import "../../assets/styles/utils.css";
import "../../assets/styles/style.css";
import "../../assets/styles/animations.css";
import "../../assets/styles/landing.css";
import "../../assets/styles/queries.css";
import "../../assets/styles/dashboard.css";
import "../mines/mines.css";
import "../casino-modal.css";
import "../casino-utils.css";
import "../dice/dice.css";
import "./plinko.css";

import { supabase } from "../../assets/js/supabase.js";
import { showCasinoResult } from "../casino-modal.js";
import { formatNaira, initRecentBets } from "../casino-utils.js";

// ─── AUTH GUARD ───────────────────────────────────────────────
const {
  data: { session },
} = await supabase.auth.getSession();
if (!session) {
  window.location.href = "/src/login/";
  throw new Error("[plinko] No session");
}
const user = session.user;

// ─── CONSTANTS ───────────────────────────────────────────────
const HOUSE_EDGE = 0.01;
const STEP_MS = 120; // ms per peg step
const PEG_MARGIN = 24; // px above first peg row
const MIN_WIDTH_FOR_16_ROWS = 520; // require wider board width for 16 rows to stay readable

function formatMultiplierLabel(mult) {
  return `${Number.isInteger(mult) ? mult.toFixed(0) : mult}×`;
}

// Multiplier tables — must mirror play_plinko RPC exactly
const MULT_TABLES = {
  low: {
    8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    12: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 0.3, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    16: [
      16.0, 9.0, 4.0, 2.0, 1.4, 1.1, 1.0, 0.7, 0.5, 0.7, 1.0, 1.1, 1.4, 2.0,
      4.0, 9.0, 16.0,
    ],
  },
  medium: {
    8: [13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0],
    12: [24.0, 5.0, 2.0, 0.9, 0.5, 0.3, 0.2, 0.3, 0.5, 0.9, 2.0, 5.0, 24.0],
    16: [
      110.0, 41.0, 10.0, 5.0, 2.0, 0.9, 0.5, 0.3, 0.2, 0.3, 0.5, 0.9, 2.0, 5.0,
      10.0, 41.0, 110.0,
    ],
  },
  high: {
    8: [29.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29.0],
    12: [46.0, 6.0, 2.0, 0.5, 0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 2.0, 6.0, 46.0],
    16: [
      999.0, 200.0, 60.0, 15.0, 3.0, 0.9, 0.3, 0.2, 0.1, 0.2, 0.3, 0.9, 3.0,
      15.0, 60.0, 200.0, 999.0,
    ],
  },
};

// ─── STATE ───────────────────────────────────────────────────
const state = {
  risk: "low",
  rows: 8,
  phase: "idle", // 'idle' | 'waiting' | 'animating'
};

// ─── DOM REFS ────────────────────────────────────────────────
const walletDisplay = document.getElementById("walletDisplay");
const betInput = document.getElementById("betAmount");
const betError = document.getElementById("betError");
const betChips = document.getElementById("betChips");
const dropBtn = document.getElementById("dropBtn");
const potentialWin = document.getElementById("potentialWin");
const maxMultEl = document.getElementById("maxMult");
const minMultEl = document.getElementById("minMult");
const boardWrap = document.querySelector(".plinko-board-wrap");
const boardEl = document.getElementById("plinkoBoard");
const ballEl = document.getElementById("plinkoBall");
const bucketsEl = document.getElementById("plinkoBuckets");

const riskBtns = {
  low: document.getElementById("riskLow"),
  medium: document.getElementById("riskMed"),
  high: document.getElementById("riskHigh"),
};

const rowBtns = {
  8: document.getElementById("rows8"),
  12: document.getElementById("rows12"),
  16: document.getElementById("rows16"),
};

// ─── GEOMETRY ────────────────────────────────────────────────
// Row spacing shrinks as row count grows so the board stays a
// consistent visual shape across row modes and viewport sizes.
function rowSpacing(rows) {
  const width = Math.max(boardWrap.clientWidth, 240);
  const targetHeight = Math.min(width * 0.75, 420);
  return Math.max(24, Math.floor(targetHeight / rows));
}

// Board wrap height: enough to contain all peg rows + landing zone.
function boardHeight(rows) {
  return PEG_MARGIN + rows * rowSpacing(rows) + 44;
}

// Horizontal unit: board divided into (rows+1) equal columns.
// The (rows+1) buckets each occupy one unit; pegs sit at unit midpoints.
function boardUnit(rows) {
  const w = boardWrap.clientWidth || 240;
  return w / (rows + 1);
}

// Pixel centre of peg at (rowIndex, pegIndex).
// Row 0 has 1 peg; row r has (r+1) pegs, staggered so they
// interleave with the row above — standard Galton board layout.
function pegXY(r, p, rows, unit) {
  return {
    x: ((rows - r) / 2 + p) * unit + unit / 2,
    y: PEG_MARGIN + r * rowSpacing(rows),
  };
}

// Pixel x-centre of bucket at index b.
function bucketCX(b, unit) {
  return (b + 0.5) * unit;
}

// ─── BOARD RENDER ─────────────────────────────────────────────
function renderBoard() {
  if (!rowsSupported(state.rows)) {
    state.rows = 12;
    Object.values(rowBtns).forEach((b) => b.classList.remove("is-selected"));
    rowBtns[12]?.classList.add("is-selected");
  }

  const { rows, risk } = state;
  const unit = boardUnit(rows);
  const mults = MULT_TABLES[risk][rows];
  const pegSize = Math.max(6, Math.min(12, Math.floor(unit * 0.08)));
  const ballSize = Math.max(16, Math.min(24, Math.floor(unit * 0.14)));

  boardWrap.style.setProperty("--plinko-peg-size", `${pegSize}px`);
  boardWrap.style.setProperty("--plinko-ball-size", `${ballSize}px`);
  boardWrap.style.height = boardHeight(rows) + "px";
  boardWrap.classList.toggle("plinko-rows-16", rows === 16);
  bucketsEl.classList.toggle("plinko-rows-16", rows === 16);
  boardEl.innerHTML = "";
  bucketsEl.innerHTML = "";

  // Pegs
  for (let r = 0; r < rows; r++) {
    for (let p = 0; p <= r; p++) {
      const { x, y } = pegXY(r, p, rows, unit);
      const peg = document.createElement("div");
      peg.className = "plinko-peg";
      peg.style.left = x + "px";
      peg.style.top = y + "px";
      peg.dataset.row = r;
      peg.dataset.peg = p;
      boardEl.appendChild(peg);
    }
  }

  // Buckets
  mults.forEach((mult, i) => {
    const tier = mult >= 2 ? "green" : mult >= 1 ? "yellow" : "red";
    const bucket = document.createElement("div");
    bucket.className = `plinko-bucket plinko-bucket--${tier}`;
    bucket.dataset.index = i;
    bucket.textContent = formatMultiplierLabel(mult);
    bucketsEl.appendChild(bucket);
  });

  updateRowButtons();
  snapBallToStart();
}

// ─── BALL HELPERS ─────────────────────────────────────────────
function snapBallToStart() {
  const { rows } = state;
  const unit = boardUnit(rows);
  const cx = (rows / 2) * unit + unit / 2;

  // Kill transition for an instant snap, then hide
  ballEl.style.transition = "none";
  ballEl.style.left = cx + "px";
  ballEl.style.top = PEG_MARGIN - 16 + "px";
  ballEl.classList.remove("is-waiting");
  ballEl.classList.add("is-hidden");

  // Clear any peg highlights and bucket landings
  boardEl
    .querySelectorAll(".plinko-peg.is-active")
    .forEach((el) => el.classList.remove("is-active"));
  bucketsEl
    .querySelectorAll(".plinko-bucket.is-landed")
    .forEach((el) => el.classList.remove("is-landed"));
}

function moveBall(x, y, ms = STEP_MS) {
  ballEl.style.transition = `top ${ms}ms cubic-bezier(0.45,0.05,0.55,0.95), left ${ms}ms cubic-bezier(0.45,0.05,0.55,0.95)`;
  ballEl.style.left = x + "px";
  ballEl.style.top = y + "px";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ANIMATION ────────────────────────────────────────────────
// Steps the ball through each peg in the returned path array.
// Each peg takes STEP_MS to traverse, so total animation is
// rows × STEP_MS ≈ 1–2 s depending on row count.
async function animateDrop(path, bucketIndex) {
  const { rows } = state;
  const unit = boardUnit(rows);
  const rs = rowSpacing(rows);

  // Show ball at top, no transition for the initial snap
  const startCX = (rows / 2) * unit + unit / 2;
  ballEl.style.transition = "none";
  ballEl.style.left = startCX + "px";
  ballEl.style.top = PEG_MARGIN - 16 + "px";
  ballEl.classList.remove("is-hidden", "is-waiting");

  // One frame so the transition:none commits before we re-enable it
  await sleep(16);

  let col = 0; // peg column within current row (= right-turn count so far)

  for (let r = 0; r < rows; r++) {
    const { x, y } = pegXY(r, col, rows, unit);

    // Highlight the peg the ball is heading to
    const pegEl = boardEl.querySelector(
      `.plinko-peg[data-row="${r}"][data-peg="${col}"]`,
    );
    if (pegEl) pegEl.classList.add("is-active");

    moveBall(x, y);
    await sleep(STEP_MS);

    if (pegEl) pegEl.classList.remove("is-active");

    // Apply direction for the next step
    if (path[r]) col++; // Right → column increments
    // Left  → column stays
  }

  // Drop into the landing bucket
  const bx = bucketCX(bucketIndex, unit);
  const by = PEG_MARGIN + rows * rs + 10;
  moveBall(bx, by, STEP_MS * 0.8);
  await sleep(STEP_MS);

  const bucketEl = bucketsEl.querySelector(
    `.plinko-bucket[data-index="${bucketIndex}"]`,
  );
  if (bucketEl) bucketEl.classList.add("is-landed");
}

// ─── STATS ───────────────────────────────────────────────────
function updateStats() {
  const bet = parseFloat(betInput?.value) || 0;
  const mults = MULT_TABLES[state.risk][state.rows];
  const max = Math.max(...mults);
  const min = Math.min(...mults);

  if (potentialWin) potentialWin.textContent = formatNaira(bet * max);
  if (maxMultEl) maxMultEl.textContent = formatMultiplierLabel(max);
  if (minMultEl) minMultEl.textContent = formatMultiplierLabel(min);
}

function rowsSupported(rows) {
  if (rows !== 16) return true;
  return boardWrap.clientWidth >= MIN_WIDTH_FOR_16_ROWS;
}

function updateRowButtons() {
  const support16 = rowsSupported(16);
  const btn16 = rowBtns[16];

  if (btn16) {
    btn16.disabled = !support16;
    btn16.title = support16
      ? "Play with 16 rows"
      : "16 rows requires a wider screen";
  }

  if (!support16 && state.rows === 16) {
    state.rows = 12;
    Object.values(rowBtns).forEach((b) => b.classList.remove("is-selected"));
    rowBtns[12]?.classList.add("is-selected");
  }
}

// ─── CONTROLS LOCK ────────────────────────────────────────────
function setDisabled(disabled) {
  dropBtn.disabled = disabled;
  betInput.disabled = disabled;
  Object.values(riskBtns).forEach((b) => (b.disabled = disabled));
  Object.values(rowBtns).forEach((b) => (b.disabled = disabled));
  betChips
    ?.querySelectorAll(".dice-chip")
    .forEach((b) => (b.disabled = disabled));
}

// ─── ERROR ───────────────────────────────────────────────────
function setBetError(msg) {
  if (betError) betError.textContent = msg;
  betInput?.classList.toggle("is-error", !!msg);
}

const debounce = (fn, delay = 120) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

window.addEventListener(
  "resize",
  debounce(() => {
    if (state.phase === "idle") renderBoard();
  }, 150),
);

// ─── RISK TOGGLE ──────────────────────────────────────────────
Object.entries(riskBtns).forEach(([risk, btn]) => {
  btn.addEventListener("click", () => {
    if (state.phase !== "idle") return;
    state.risk = risk;
    Object.values(riskBtns).forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    renderBoard();
    updateStats();
  });
});

// ─── ROW TOGGLE ───────────────────────────────────────────────
Object.entries(rowBtns).forEach(([rows, btn]) => {
  btn.addEventListener("click", () => {
    if (state.phase !== "idle" || btn.disabled) return;
    state.rows = parseInt(rows, 10);
    Object.values(rowBtns).forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    renderBoard();
    updateStats();
  });
});

// ─── BET CHIPS ────────────────────────────────────────────────
betChips?.addEventListener("click", (e) => {
  const chip = e.target.closest(".dice-chip");
  if (!chip) return;
  betInput.value = chip.dataset.bet;
  betChips
    .querySelectorAll(".dice-chip")
    .forEach((c) => c.classList.toggle("is-active", c === chip));
  setBetError("");
  updateStats();
});

betInput?.addEventListener("input", () => {
  setBetError("");
  updateStats();
  const val = parseFloat(betInput.value);
  betChips
    ?.querySelectorAll(".dice-chip")
    .forEach((c) =>
      c.classList.toggle("is-active", Number(c.dataset.bet) === val),
    );
});

// ─── WALLET ───────────────────────────────────────────────────
async function loadWallet() {
  const { data, error } = await supabase
    .from("members")
    .select("wallet_balance")
    .eq("id", user.id)
    .single();
  if (!error && data && walletDisplay)
    walletDisplay.textContent = formatNaira(data.wallet_balance);
}

// ─── DROP ────────────────────────────────────────────────────
dropBtn?.addEventListener("click", async () => {
  setBetError("");

  const amount = parseFloat(betInput?.value);
  if (!amount || isNaN(amount) || amount <= 0) {
    setBetError("Enter a bet amount.");
    return;
  }

  // Lock controls and show waiting ball at top
  state.phase = "waiting";
  setDisabled(true);

  const unit = boardUnit(state.rows);
  const centerX = (state.rows / 2) * unit + unit / 2;
  ballEl.style.transition = "none";
  ballEl.style.left = centerX + "px";
  ballEl.style.top = PEG_MARGIN - 16 + "px";
  ballEl.classList.remove("is-hidden");
  ballEl.classList.add("is-waiting");

  // Call the RPC
  const { data, error } = await supabase.rpc("play_plinko", {
    p_bet_amount: amount,
    p_rows: state.rows,
    p_risk: state.risk,
  });

  ballEl.classList.remove("is-waiting");

  if (error || data?.error) {
    setBetError(data?.error || "Something went wrong. Try again.");
    state.phase = "idle";
    setDisabled(false);
    snapBallToStart();
    return;
  }

  // Animate path, then settle
  state.phase = "animating";
  await animateDrop(data.path, data.bucket_index);

  // Update wallet and recent bets
  if (walletDisplay) walletDisplay.textContent = formatNaira(data.new_balance);
  recentBets.prepend({
    outcome_won: data.won,
    bet_amount: amount,
    profit: data.profit,
    multiplier: data.multiplier,
  });

  // Show result modal; onPlayAgain re-enables everything
  showCasinoResult({
    won: data.won,
    betAmount: amount,
    payout: data.payout,
    profit: data.profit,
    multiplier: data.multiplier,
    gameLabel: "Plinko",
    onPlayAgain: () => {
      state.phase = "idle";
      setDisabled(false);
      snapBallToStart();
    },
  });
  lucide.createIcons();
});

// ─── BOOT ─────────────────────────────────────────────────────
renderBoard();
updateStats();
const recentBets = initRecentBets(
  "plinko",
  document.getElementById("recentBetsMount"),
);
await loadWallet();
if (window.lucide) lucide.createIcons();

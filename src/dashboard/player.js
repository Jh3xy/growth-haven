

/**
 * music.js — GrowthHaven Music Section
 * src/dashboard/music.js
 */

import { supabase } from '../assets/js/supabase.js'

let hasAccess = false;
let initialized  = false
const PAGE_SIZE  = 26

// ─── STATE ────────────────────────────────────────────────────────

const state = {
  allSongs: [],
  filteredSongs: [],
  queue: [],
  currentIndex: 0,
  currentTrack: null,
  playing: false,
  expanded: false,
  ytReady: false,
  player: null,
  likedSongs: new Set(),
  seekInterval: null,
  displayCount: PAGE_SIZE,

  // — NEW: stream reward keys —
  rewardStatusLoaded: false, // true once get_stream_user_status has resolved
  rewardedSongs: new Set(), // video_ids fully rewarded today (from DB)
  isCapped: false, // daily earnings cap reached
  todayEarnings: 0, // numeric total earned today (informational)
  rewardSession: null, // { session_id, started_at, required_seconds, videoId }
  rewardTimer: null, // setInterval ref for the local tracking ticker
  rewardElapsed: 0, // local seconds counter (UI only — server is truth)
  rewardState: "idle", // current active-track reward state string
};

let loadingCardEl = null
let _consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;


// ─── INIT ─────────────────────────────────────────────────────────

export async function initMusicSection(user) {
  if (initialized) return;
  initialized = true;
  await checkAccess(user);

  console.log("[music] Initializing...");

  loadYouTubeAPI();
  await Promise.all([fetchCatalog(), fetchLikedSongs()]);

  buildDynamicTabs(); 
  initFilterTabs();
  initSearch();
  initMiniPlayer();
  initExpandedPlayer();
  initLoadMore();
  initKeyboardShortcuts();
  renderSongs(state.allSongs);
  // Reward system initialises AFTER first render so cards exist in the DOM.
  await initStreamRewards();
}


// gate user utility function

const section = document.getElementById("overlayWrap");
async function checkAccess(user) {
  const { data, error } = await supabase
    .from("members")
    .select("has_deposited")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[player] Failed to check deposit gate:", error);
    return false;
  }

  hasAccess = Boolean(data?.has_deposited);
  // console.log(hasAccess)
  section.classList.toggle("is-gated", !hasAccess);
  document.body.style.overflow = hasAccess ? "" : "hidden";
  return hasAccess;
}

const gateDepositBtn = document.getElementById("musicGateDepositBtn");
const depositBtn = document.getElementById("depositBtn");
gateDepositBtn?.addEventListener('click', () => {
    depositBtn.click();
  });


// ─── YOUTUBE IFRAME API ───────────────────────────────────────────

function loadYouTubeAPI() {
  if (window.YT?.Player) { state.ytReady = true; return }

  // Must be on window BEFORE the script tag fires
  window.onYouTubeIframeAPIReady = () => {
    state.ytReady = true
    console.log('[music] YT API ready')
  }

  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return

  const tag = document.createElement('script')
  tag.src   = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
}


// ─── DATA FETCHING ────────────────────────────────────────────────

async function fetchCatalog() {
  const { data, error } = await supabase
    .from('music_catalog')
    .select('*')
    .eq('embeddable', true)
    .order('last_refreshed', { ascending: false })

  if (error) { console.error('[music] fetchCatalog:', error); return }

  state.allSongs      = data || []
  state.filteredSongs = state.allSongs
  state.queue         = state.allSongs
}

async function fetchLikedSongs() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('liked_songs')
    .select('video_id')
    .eq('user_id', user.id)

  if (error) { console.error('[music] fetchLikedSongs:', error); return }

  state.likedSongs = new Set((data || []).map(s => s.video_id))
}


// ─── FILTER TABS ──────────────────────────────────────────────────

function initFilterTabs() {
  const tabBar = document.getElementById("musicFilterTabs");
  if (!tabBar) return;

  tabBar.addEventListener("click", (e) => {
    const tab = e.target.closest(".music-filter-tab");
    if (!tab) return;

    tabBar.querySelectorAll(".music-filter-tab").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    state.displayCount = PAGE_SIZE;
    applyFilters();
  });
}


// ─── SEARCH ───────────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('musicSearch')
  if (!input) return
  let debounce
  input.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      state.displayCount = PAGE_SIZE   // reset pagination on search
      applyFilters()
    }, 280)
  })
}


// ─── FILTER LOGIC ─────────────────────────────────────────────────
function applyFilters() {
  const filter =
    document.querySelector("#musicFilterTabs .music-filter-tab.is-active")
      ?.dataset.filter || "all";
  const query =
    document.getElementById("musicSearch")?.value.toLowerCase().trim() || "";

  let results = [...state.allSongs];

  if (filter === "all") {
    // Default catalog order — fetchCatalog already sorts by last_refreshed desc
  } else if (filter === "new") {
    // Sort by YouTube publish date, most recent first
    results.sort(
      (a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0),
    );
  } else if (filter === "popular") {
    // Sort by view count, highest first
    results.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  } else if (filter === "short") {
    // Under 2 minutes — good for quick listens
    results = results.filter((s) => s.duration > 0 && s.duration < 120);
  } else {
    // Dynamic category tab — exact match against s.category (case-insensitive)
    results = results.filter((s) => s.category?.toLowerCase() === filter);
  }

  if (query) {
    results = results.filter(
      (s) =>
        s.title?.toLowerCase().includes(query) ||
        s.artist?.toLowerCase().includes(query),
    );
  }

  state.filteredSongs = results;
  renderSongs(state.filteredSongs);
}

/**
 * Reads unique category values from state.allSongs, sorts them alphabetically,
  and appends one tab per category to the end of #musicFilterTabs.
  The data-filter-type="category" attribute is the removal selector so this
  is safe to call multiple times without duplicating tabs.
 */
function buildDynamicTabs() {
  const tabBar = document.getElementById('musicFilterTabs')
  if (!tabBar) return
 
  // Remove any stale category tabs from a previous call
  tabBar.querySelectorAll('[data-filter-type="category"]').forEach(t => t.remove())
 
  const categories = [
    ...new Set(state.allSongs.map(s => s.category).filter(Boolean))
  ].sort()
 
  categories.forEach(category => {
    const btn = document.createElement('button')
    btn.className = 'music-filter-tab'
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', 'false')
    btn.setAttribute('type', 'button')
    btn.dataset.filter = category.toLowerCase()
    btn.dataset.filterType = 'category'
    btn.textContent = category
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    tabBar.appendChild(btn)
  })
}


// ─── RENDER SONGS ─────────────────────────────────────────────────

function renderSongs(songs) {
  const grid = document.getElementById("musicSongsGrid");
  const empty = document.getElementById("musicGridEmpty");
  const loadMore = document.getElementById("musicLoadMore");
  if (!grid) return;

  if (!songs.length) {
    grid.innerHTML = "";
    empty?.classList.remove("hidden");
    loadMore?.classList.add("hidden");
    return;
  }

  empty?.classList.add("hidden");

  // Client-side pagination — all data already fetched, just slice for display
  const displayed = songs.slice(0, state.displayCount);

  grid.innerHTML = displayed
    .map((song, i) => {
      const liked = state.likedSongs.has(song.video_id);
      const artist = escHtml(song.artist || "Unknown Artist");
      const title = escHtml(song.title || "Untitled");
      const duration = fmtTime(song.duration || "null");

      return `
      <div class="music-song-card" role="listitem" data-video-id="${song.video_id}">
        <div class="music-song-card__thumb-wrap">
          <img class="music-song-card__thumb" src="${song.thumbnail || ""}" alt="${title}" loading="lazy" />
          <button class="music-song-card__play-overlay" data-index="${i}" aria-label="Play ${title}" type="button">
            <i data-lucide="play" style="width:22px;height:22px"></i>
          </button>
          <div class="music-reward-strip" data-reward-state="idle"></div>
          <div class="music-reward-check" aria-hidden="true"></div>
        </div>
        <div class="music-song-card__info">
          <div class="flex-between">
            <span class="music-song-card__artist">${artist}</span>
            <span class="music-song-card__artist">${duration}</span>
          </div>
          <span class="music-song-card__title">${title}</span>
        </div>
        <div class="music-song-card__actions">
          <button class="music-song-card__play-btn" data-index="${i}" aria-label="Play" type="button">
            <i data-lucide="play" style="width:13px;height:13px"></i>
          </button>
          <button class="music-song-card__like-btn ${liked ? "is-liked" : ""}" data-video-id="${song.video_id}" aria-label="${liked ? "Unlike" : "Like"}" type="button">
            <i data-lucide="heart" style="width:13px;height:13px"></i>
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  window.lucide?.createIcons({ nodes: [grid] });
  // Re-stamp reward states onto the freshly rendered cards.
  applyInitialCardStates();

  // Play buttons (thumbnail overlay + action row button share [data-index])
  grid.querySelectorAll("[data-index]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      playTrack(parseInt(btn.dataset.index, 10));
    });
  });

  // Like buttons
  grid.querySelectorAll(".music-song-card__like-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLike(btn.dataset.videoId, btn);
    });
  });

  // Show / hide the load-more button
  if (loadMore) {
    loadMore.classList.toggle("hidden", songs.length <= state.displayCount);
  }
}


// ─── LOAD MORE ────────────────────────────────────────────────────

function initLoadMore() {
  document.getElementById('musicLoadMore')?.addEventListener('click', () => {
    state.displayCount += PAGE_SIZE
    renderSongs(state.filteredSongs)
  })
}


// ─── PLAY TRACK ───────────────────────────────────────────────────

function playTrack(index) {
  const track = state.filteredSongs[index];
  if (!track) return;

  resetRewardSession();

  state.queue = [...state.filteredSongs];
  state.currentIndex = index;
  state.currentTrack = track;

  setCardLoading(index);
  updateMiniPlayer(track);
  showMiniPlayer();
  if (state.expanded) updateExpandedPlayer(track);
  logPlayHistory(track.video_id);

  if (!state.player) {
    const tryCreate = () => {
      if (!state.ytReady) {
        setTimeout(tryCreate, 100);
        return;
      }

      state.player = new YT.Player("ytPlayer", {
        height: "100%",
        width: "100%",
        videoId: track.video_id,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e) => {
            e.target.playVideo();
            state.playing = true;
            syncPlayIcons();
          },
          onStateChange: onPlayerStateChange,
          onError: onPlayerError,
        },
      });
    };
    tryCreate();
  } else {
    state.player.loadVideoById(track.video_id);
    state.playing = true;
    syncPlayIcons();
  }
}

function onPlayerStateChange(event) {
  switch (event.data) {
    case YT.PlayerState.ENDED:
      // Attempt reward completion before auto-advancing to next track.
      // onTrackEnded is fire-and-forget; playNext() runs immediately after.
      onTrackEnded();
      playNext();
      break;
    case YT.PlayerState.PLAYING:
      state.playing = true;
      syncPlayIcons();
      startSeekUpdater();
      clearCardLoading();
      _consecutiveErrors = 0; // reset on any successful play
      onTrackPlaying();
      break;
    case YT.PlayerState.PAUSED:
      state.playing = false;
      syncPlayIcons();
      stopSeekUpdater();
      onTrackPaused();
      break;
  }
}

// Auto-skip unavailable / embed-blocked videos
function onPlayerError(event) {
  console.warn('[music] Video error code:', event.data, '— skipping')
  clearCardLoading()
  _consecutiveErrors++
 
  if (_consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    _consecutiveErrors = 0
    state.playing = false; 
    syncPlayIcons(); 
    window.showToast?.('Some tracks aren\'t available. Try another.', 'warning')
    return // stop auto-advancing — user picks deliberately from here
  }
 
  playNext()
}


// ─── LOADING STATE ────────────────────────────────────────────────

function setCardLoading(index) {
  clearCardLoading()
  const cards   = document.querySelectorAll('#musicSongsGrid .music-song-card:not(.music-song-card--skeleton)')
  loadingCardEl = cards[index] || null
  loadingCardEl?.classList.add('is-loading')
}

function clearCardLoading() {
  loadingCardEl?.classList.remove('is-loading')
  loadingCardEl = null
}


// ─── MINI PLAYER ──────────────────────────────────────────────────

function initMiniPlayer() {
  document.getElementById('miniPrevBtn')?.addEventListener('click',      playPrevious)
  document.getElementById('miniPlayPauseBtn')?.addEventListener('click', togglePlayPause)
  document.getElementById('miniNextBtn')?.addEventListener('click',      playNext)
  document.getElementById('miniExpandBtn')?.addEventListener('click',    openExpandedPlayer)
}

function showMiniPlayer() {
  document.getElementById('musicMiniPlayer')?.classList.add('is-visible')
  document.body.classList.add('music-player-active')
}

function updateMiniPlayer(track) {
  const thumb  = document.getElementById('miniThumb')
  const title  = document.getElementById('miniTitle')
  const artist = document.getElementById('miniArtist')
  if (thumb)  thumb.src         = track.thumbnail || ''
  if (title)  title.textContent  = track.title     || ''
  if (artist) artist.textContent = track.artist    || 'Unknown Artist'
}


// ─── EXPANDED PLAYER ──────────────────────────────────────────────

function initExpandedPlayer() {
  document.getElementById('expandedCloseBtn')?.addEventListener('click',      closeExpandedPlayer)
  document.getElementById('expandedPrevBtn')?.addEventListener('click',       playPrevious)
  document.getElementById('expandedPlayPauseBtn')?.addEventListener('click',  togglePlayPause)
  document.getElementById('expandedNextBtn')?.addEventListener('click',       playNext)
  document.getElementById('musicExpandedBackdrop')?.addEventListener('click', closeExpandedPlayer)

  document.getElementById('expandedLikeBtn')?.addEventListener('click', () => {
    if (state.currentTrack) {
      toggleLike(state.currentTrack.video_id, document.getElementById('expandedLikeBtn'))
    }
  })

  const seekBar = document.getElementById('musicSeekBar')
  seekBar?.addEventListener('input', () => {
    if (!state.player) return
    const dur = state.player.getDuration?.() || 0
    if (!dur) return
    state.player.seekTo((seekBar.value / 100) * dur, true)
  })
}

function openExpandedPlayer() {
  state.expanded = true
  document.getElementById('musicExpandedPlayer')?.classList.add('is-open')
  document.getElementById('musicExpandedBackdrop')?.classList.add('is-visible')
  document.body.classList.add('music-expanded-open')   // body scroll lock
  if (state.currentTrack) updateExpandedPlayer(state.currentTrack)
  startSeekUpdater()
}

function closeExpandedPlayer() {
  state.expanded = false
  document.getElementById('musicExpandedPlayer')?.classList.remove('is-open')
  document.getElementById('musicExpandedBackdrop')?.classList.remove('is-visible')
  document.body.classList.remove('music-expanded-open')
  stopSeekUpdater()
}

function updateExpandedPlayer(track) {
  const title   = document.getElementById('expandedTitle')
  const artist  = document.getElementById('expandedArtist')
  const likeBtn = document.getElementById('expandedLikeBtn')
  if (title)   title.textContent  = track.title  || ''
  if (artist)  artist.textContent = track.artist || 'Unknown Artist'
  if (likeBtn) likeBtn.classList.toggle('is-liked', state.likedSongs.has(track.video_id))
}


// ─── SEEK UPDATER ─────────────────────────────────────────────────

function startSeekUpdater() {
  stopSeekUpdater()
  state.seekInterval = setInterval(() => {
    if (!state.player || !state.expanded) return
    const cur = state.player.getCurrentTime?.() || 0
    const dur = state.player.getDuration?.()    || 0
    if (!dur) return

    const seekBar = document.getElementById('musicSeekBar')
    if (seekBar) seekBar.value = (cur / dur) * 100

    const curEl = document.getElementById('seekCurrentTime')
    const durEl = document.getElementById('seekTotalTime')
    if (curEl) curEl.textContent = fmtTime(cur)
    if (durEl) durEl.textContent = fmtTime(dur)
  }, 1000)
}

function stopSeekUpdater() {
  clearInterval(state.seekInterval)
  state.seekInterval = null
}


// ─── CONTROLS ─────────────────────────────────────────────────────

function togglePlayPause() {
  if (!state.player) return
  state.playing ? state.player.pauseVideo() : state.player.playVideo()
}

function playNext() {
  if (!state.queue.length) return
  const next = (state.currentIndex + 1) % state.queue.length
  state.filteredSongs = state.queue
  playTrack(next)
}

function playPrevious() {
  if (!state.queue.length) return
  const prev = state.currentIndex === 0 ? state.queue.length - 1 : state.currentIndex - 1
  state.filteredSongs = state.queue
  playTrack(prev)
}

/**
 * syncPlayIcons
 * Lucide replaces <i> tags with <svg> on first render, so btn.querySelector('i')
 * returns null on subsequent calls. Fix: re-inject the <i> tag fresh each time,
 * then call createIcons to re-render it.
 */
function syncPlayIcons() {
  const icon = state.playing ? 'pause' : 'play'

  const miniBtn     = document.getElementById('miniPlayPauseBtn')
  const expandedBtn = document.getElementById('expandedPlayPauseBtn')

  if (miniBtn) {
    miniBtn.innerHTML = `<i data-lucide="${icon}" style="width:18px;height:18px"></i>`
    window.lucide?.createIcons({ nodes: [miniBtn] })
  }
  if (expandedBtn) {
    expandedBtn.innerHTML = `<i data-lucide="${icon}" style="width:26px;height:26px"></i>`
    window.lucide?.createIcons({ nodes: [expandedBtn] })
  }
}


// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────

function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (!state.currentTrack) return
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return

    switch (e.key) {
      case ' ':
      case 'Spacebar':
        e.preventDefault()
        togglePlayPause()
        break
      case 'ArrowRight':
        e.preventDefault()
        playNext()
        break
      case 'ArrowLeft':
        e.preventDefault()
        playPrevious()
        break
      case 'Escape':
        if (state.expanded) closeExpandedPlayer()
        break
    }
  })
}


// ─── LIKE / UNLIKE ────────────────────────────────────────────────

async function toggleLike(videoId, btn) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const isLiked = state.likedSongs.has(videoId)

  if (isLiked) {
    const { error } = await supabase
      .from('liked_songs')
      .delete()
      .eq('user_id', user.id)
      .eq('video_id', videoId)

    if (!error) {
      state.likedSongs.delete(videoId)
      document.querySelectorAll(`.music-song-card__like-btn[data-video-id="${videoId}"]`)
        .forEach(b => b.classList.remove('is-liked'))
      btn?.classList.remove('is-liked')
    }
  } else {
    const track = state.allSongs.find(s => s.video_id === videoId)
    if (!track) return

    const { error } = await supabase
      .from('liked_songs')
      .insert({
        user_id:  user.id,
        video_id: videoId,
        track_metadata: {
          title:     track.title,
          artist:    track.artist,
          thumbnail: track.thumbnail,
          duration:  track.duration,
        },
      })

    if (!error) {
      state.likedSongs.add(videoId)
      document.querySelectorAll(`.music-song-card__like-btn[data-video-id="${videoId}"]`)
        .forEach(b => b.classList.add('is-liked'))
      btn?.classList.add('is-liked')
    }
  }

  // Re-sync expanded like button if this track is playing
  if (state.currentTrack?.video_id === videoId) {
    document.getElementById('expandedLikeBtn')
      ?.classList.toggle('is-liked', state.likedSongs.has(videoId))
  }
}


// ─── PLAY HISTORY ─────────────────────────────────────────────────

let _historyTimer = null

async function logPlayHistory(videoId) {
  clearTimeout(_historyTimer)
  _historyTimer = setTimeout(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('play_history').insert({ user_id: user.id, video_id: videoId })
  }, 5000)
}


// ─── UTILS ────────────────────────────────────────────────────────

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}




 // ─── STREAM REWARDS - INITIALIZATION  ─────────────────────────


/**
 * initStreamRewards
 *
 * Called once at the end of initMusicSection(), after cards are in the DOM.
 * 1. Fetches today's reward status from the server.
 * 2. Seeds state with rewarded songs, cap status, and earnings total.
 * 3. Injects the reward pill into the mini player info area.
 * 4. Injects the reward tracker row into the expanded player.
 * 5. Stamps initial reward states onto all visible cards.
 */

async function initStreamRewards() {
  // Inject UI elements first so they exist before any state is applied.
  injectMiniPill()
  injectExpandedTracker()
 
  try {
    const { data, error } = await supabase.rpc('get_stream_user_status')
    if (error) throw error
 
    // RPC returns a single-row table — Supabase wraps it in an array.
    const status = Array.isArray(data) ? data[0] : data
    if (!status) return
 
    state.todayEarnings  = Number(status.today_earnings)  || 0
    state.isCapped       = Boolean(status.is_fully_capped)
    state.rewardedSongs  = new Set(status.rewarded_songs  || [])
 
  } catch (err) {
    // Non-fatal: if this fails the UI stays in idle state.
    // Common cause: user has no deposit (function returns empty).
    console.warn('[stream] get_stream_user_status failed:', err.message)
  } finally {
    // Mark as loaded regardless — applyInitialCardStates guards on this flag.
    state.rewardStatusLoaded = true
    applyInitialCardStates()
  }
}


/**
 * injectMiniPill
 *
 * Creates and inserts the reward status pill into the mini player.
 * Targets the element containing miniTitle / miniArtist and appends
 * the pill as a third child below the artist text.
 *
 * If your mini player info wrapper has a specific ID (e.g. "miniInfo"),
 * replace the querySelector below with getElementById('miniInfo').
 */
function injectMiniPill() {
  // Guard: don't inject twice (e.g. if initMusicSection somehow fires again)
  if (document.getElementById("rewardPill")) return;

  // The mini player info area sits alongside the thumb and controls.
  // We locate it by finding the parent of the known #miniTitle element.
  const miniTitle = document.getElementById("miniTitle");
  if (!miniTitle) return;

  const infoWrap =
    miniTitle.closest(".music-mini-player__info") || miniTitle.parentElement;
  if (!infoWrap) return;

  const pill = document.createElement("div");
  pill.id = "rewardPill";
  pill.className = "music-reward-pill";
  pill.dataset.rewardState = "idle";
  pill.setAttribute("aria-live", "polite");
  pill.setAttribute("aria-label", "Reward status");
  pill.innerHTML = `
    <span class="music-reward-pill__dot"></span>
    <span class="music-reward-pill__label"></span>
  `;

  infoWrap.appendChild(pill);

  // Dot on the thumbnail corner — injected into top-row since #miniThumb is an img
  const topRow = miniTitle.closest(".music-mini-player__bar");
  if (topRow && !document.getElementById("miniRewardDot")) {
    const dot = document.createElement("span");
    dot.id = "miniRewardDot";
    dot.className = "music-mini-reward-dot";
    topRow.appendChild(dot);
  }
}



/**
 * injectExpandedTracker
 *
 * Creates and inserts the reward tracker row (text + live counter) into
 * the expanded player, between the artist line and the seek bar row.
 *
 * Targets #expandedArtist and inserts the tracker immediately after it.
 * If your expanded player meta wrapper has a specific container ID, you
 * can use insertAdjacentElement on that instead.
 */
function injectExpandedTracker() {
  if (document.getElementById("rewardTracker")) return;

  const tracker = document.createElement("div");
  tracker.id = "rewardTracker";
  tracker.className = "music-reward-tracker";
  tracker.dataset.rewardState = "idle";
  tracker.setAttribute("aria-live", "polite");
  tracker.setAttribute("aria-label", "Stream reward progress");
  tracker.innerHTML = `
    <div class="music-reward-tracker__left">
      <span class="music-reward-tracker__dot"></span>
      <span class="music-reward-tracker__label"></span>
    </div>
    <span class="music-reward-tracker__time" id="rewardTrackerTime"></span>
  `;

  const videoWrap = document.querySelector(".music-yt-wrap");
  if (!videoWrap) return;
  videoWrap.appendChild(tracker);
}

/**
 * applyInitialCardStates
 *
 * Stamps data-reward-state onto every rendered card based on the loaded
 * server status. Called:
 *   - After initStreamRewards resolves (first load).
 *   - At the end of every renderSongs() call (filter / search / load-more).
 *
 * The rewardStatusLoaded guard ensures it's a no-op on the first renderSongs
 * call that happens before initStreamRewards has resolved.
 */
function applyInitialCardStates() {
  if (!state.rewardStatusLoaded) return
 
  const cards = document.querySelectorAll(
    '#musicSongsGrid .music-song-card:not(.music-song-card--skeleton)'
  )
 
  cards.forEach(card => {
    const videoId = card.dataset.videoId
    if (!videoId) return
 
    let status = 'idle'
    if (state.isCapped)                         status = 'capped'
    else if (state.rewardedSongs.has(videoId))  status = 'already_earned_today'
 
    // Stamp the card root (CSS uses [data-reward-state] on card for the check badge)
    card.dataset.rewardState = status
 
    // Stamp the strip child
    const strip = card.querySelector('.music-reward-strip')
    if (strip) {
      strip.dataset.rewardState = status
      // Full-width fill for terminal states — no JS animation needed
      if (status !== 'idle') {
        strip.style.setProperty('--progress', '100%')
      }
    }
  })
 
  // If the daily cap is hit, also lock all three surfaces immediately.
  // This handles the edge case where the user opens the dashboard already capped.
  if (state.isCapped) {
    setMiniPillState('capped')
    setTrackerState('capped')
  }
}



// ─── STREAM REWARDS — PLAYER HOOKS ───────────────────────────────────
 
// Duration retry cap — prevents infinite loop if getDuration() stays 0.
let _durationRetries = 0
const MAX_DURATION_RETRIES = 6  // 6 × 500ms = 3 seconds max wait


/**
 * onTrackPlaying
 *
 * Called from onPlayerStateChange when YT fires PLAYING.
 * Decides whether to start a fresh reward session, resume an existing
 * one (pause → play), or skip (already earned / cap hit).
 *
 * Async because it may call start_stream RPC.
 * NOT awaited by onPlayerStateChange — that's intentional; YT callbacks
 * must return synchronously. Errors are caught internally.
 */
async function onTrackPlaying() {
  const track = state.currentTrack
  if (!track) return
 
  const videoId = track.video_id
 
  // ── Guard: already rewarded this track today ──────────────────────
  if (state.rewardedSongs.has(videoId)) {
    setAllSurfacesRewardState('already_earned_today', videoId)
    return
  }
 
  // ── Guard: daily cap hit ──────────────────────────────────────────
  if (state.isCapped) {
    setAllSurfacesRewardState('capped', videoId)
    return
  }
 
  // ── Resume: same track, session already open (pause → play) ──────
  // The local timer was stopped by onTrackPaused. The server's wall clock
  // kept running, so we just resume the local ticker from where it was.
  if (state.rewardSession && state.rewardSession.videoId === videoId) {
    startRewardTimer(state.rewardSession)
    setAllSurfacesRewardState('active', videoId)
    return
  }
 
  // ── Fresh session: get video duration, then call start_stream ─────
  const duration = Math.round(state.player?.getDuration?.() || 0)
 
  if (!duration) {
    // YT occasionally returns 0 on the first PLAYING event for a new video.
    // Retry a limited number of times before giving up.
    if (_durationRetries < MAX_DURATION_RETRIES) {
      _durationRetries++
      setTimeout(onTrackPlaying, 500)
    } else {
      _durationRetries = 0
      console.warn('[stream] getDuration() stayed 0 — skipping reward session')
    }
    return
  }
 
  _durationRetries = 0  // reset for the next track
 
  try {
    const { data, error } = await supabase.rpc('start_stream', {
      p_song_id:          videoId,
      p_duration_seconds: duration,
      p_is_resync:        false,
    })
 
    if (error) throw error
 
    const session = Array.isArray(data) ? data[0] : data
 
    state.rewardSession = {
      session_id:       session.session_id,
      started_at:       new Date(session.started_at),
      required_seconds: session.required_seconds,
      videoId,
    }
    state.rewardElapsed = 0
 
    startRewardTimer(state.rewardSession)
    setAllSurfacesRewardState('active', videoId)
 
  } catch (err) {
    handleStreamStartError(err, videoId)
  }
}


/**
 * onTrackPaused
 *
 * Called from onPlayerStateChange when YT fires PAUSED.
 * Stops the local timer. The strip freezes at its current --progress value
 * because the CSS transition only runs on active state (no animation on paused).
 */
function onTrackPaused() {
  // Only transition to paused if we were actively earning.
  // Avoids overwriting 'earned' or 'already_earned_today' states.
  if (state.rewardState !== 'active') return
 
  stopRewardTimer()
 
  state.rewardState = 'paused'
  const videoId = state.currentTrack?.video_id
  if (videoId) setAllSurfacesRewardState('paused', videoId)
}
 
 
/**
 * onTrackEnded
 *
 * Called from onPlayerStateChange when YT fires ENDED, BEFORE playNext().
 * If an unrewarded session is active, fires complete_stream immediately.
 * The server's wall-clock will have at least matched required_seconds
 * (since the track played to the end), so approval is expected.
 *
 * completeStream is defined in Block 3 and handles success + errors.
 */
function onTrackEnded() {
  stopRewardTimer()
 
  const hasSession    = Boolean(state.rewardSession)
  const alreadyEarned = state.rewardState === 'earned'
 
  if (hasSession && !alreadyEarned) {
    // Fire-and-forget: playNext() runs immediately after this returns.
    // completeStream handles its own error logging and UI cleanup.
    completeStream(state.rewardSession.session_id)
  }
}
 
 
/**
 * resetRewardSession
 *
 * Called at the top of playTrack() every time a new track is selected.
 * Stops the timer and zeroes all session-specific state so nothing
 * carries over from the previous track.
 *
 * Does NOT reset rewardedSongs, isCapped, or todayEarnings —
 * those are day-level state and must persist across track switches.
 */
function resetRewardSession() {
  stopRewardTimer()
 
  state.rewardSession  = null
  state.rewardElapsed  = 0
  state.rewardState    = 'idle'
 
  // Reset the mini pill and tracker to idle immediately.
  // The card strip for the previous track keeps its earned/already_earned
  // state — applyInitialCardStates handles that on re-render.
  setMiniPillState('idle')
  setTrackerState('idle')
}
 
 
/**
 * handleStreamStartError
 *
 * Maps backend error messages (from start_stream RPC) to UI states.
 * The backend raises named exceptions with specific messages —
 * we match on those strings rather than error codes for reliability
 * since Supabase surfaces the message field most consistently.
 */
function handleStreamStartError(err, videoId) {
  const msg = err?.message || ''
 
  console.warn('[stream] start_stream error:', msg)
 
  // Song already rewarded today (race condition — rewardedSongs check missed it)
  if (msg.includes('already earned a reward for this track')) {
    state.rewardedSongs.add(videoId)
    setAllSurfacesRewardState('already_earned_today', videoId)
    return
  }
 
  // Daily cap reached
  if (msg.includes('Daily streaming reward limit')) {
    state.isCapped = true
    setAllSurfacesRewardState('capped', videoId)
    // Also lock all other visible cards
    applyInitialCardStates()
    window.showToast?.('Daily limit reached — come back tomorrow!', 'warning')
    return
  }
 
  // User hasn't completed a deposit — reward system unavailable to them
  if (msg.includes('completed deposit')) {
    // Silently leave cards in idle state; don't confuse users with error UI
    setAllSurfacesRewardState('idle', videoId)
    window.showToast?.('Complete a deposit to start earning stream rewards.', 'info')
    return
  }
 
  // Unauthorized (session expired mid-session)
  if (msg.includes('Unauthorized')) {
    setAllSurfacesRewardState('idle', videoId)
    return
  }
 
  // Generic fallback — don't show error state in UI, just stay idle
  setAllSurfacesRewardState('idle', videoId)
}


// ─── STREAM REWARDS — TRACKING ENGINE ────────────────────────

// Label maps — one source of truth for all surface text
const PILL_LABELS = {
  idle:                 '',
  active:               'Earning',
  paused:               'Paused',
  earned:               '₦100 Earned!',
  capped:               'Cap Reached',
  already_earned_today: 'Earned Today',
}
 
const TRACKER_LABELS = {
  idle:                 '',
  active:               'Earning reward',
  paused:               'Timer paused',
  earned:               '₦100 earned!',
  capped:               'Daily limit reached',
  already_earned_today: 'Already earned today',
}


// ─── TIMER ───────────
 
/**
 * startRewardTimer
 *
 * Starts (or resumes) the local 1-second interval ticker.
 * On each tick:
 *   - Increments state.rewardElapsed (actual listened seconds, UI only)
 *   - Updates the strip's --progress CSS custom property on the active card
 *   - Updates the tracker time display in the expanded player
 *   - Fires completeStream() when local elapsed >= required_seconds
 *
 * @param {object} session  The active state.rewardSession object.
 */
function startRewardTimer(session) {
  stopRewardTimer()  // safety — never run two timers concurrently
 
  state.rewardTimer = setInterval(async () => {
    // Guard against race: timer fires between pause and clearInterval
    if (!state.playing) return
 
    state.rewardElapsed++
 
    const pct = Math.min(
      (state.rewardElapsed / session.required_seconds) * 100,
      100
    )
 
    // ── Update card strip fill ──────────────────────────────────────
    document
      .querySelectorAll(`.music-song-card[data-video-id="${session.videoId}"] .music-reward-strip`)
      .forEach(strip => strip.style.setProperty('--progress', `${pct}%`))
 
    // ── Update tracker time display ─────────────────────────────────
    const timeEl = document.getElementById('rewardTrackerTime')
    if (timeEl) {
      timeEl.textContent = `${fmtTime(state.rewardElapsed)} / ${fmtTime(session.required_seconds)}`
    }
 
    // ── Threshold met: attempt reward completion ────────────────────
    if (state.rewardElapsed >= session.required_seconds) {
      stopRewardTimer()
      await completeStream(session.session_id)
    }
 
  }, 1000)
}
 
 
/**
 * stopRewardTimer
 *
 * Clears the interval and nullifies the ref.
 * Safe to call even if no timer is running.
 */
function stopRewardTimer() {
  if (state.rewardTimer) {
    clearInterval(state.rewardTimer)
    state.rewardTimer = null
  }
}


// ─── REWARD COMPLETION ────────────────────────────────────────────────────────
 
/**
 * completeStream
 *
 * Calls the complete_stream RPC. The server re-validates timing,
 * marks the session as rewarded, credits the wallet, and logs the
 * transaction — all atomically.
 *
 * On success: handleRewardComplete() updates all UI.
 * On failure: logs the rejection and resets UI to a safe idle state
 *             (e.g. server rejected because timing gap wasn't met,
 *              or session was already rewarded by a duplicate call).
 *
 * @param {string} sessionId  The UUID from state.rewardSession.session_id
 */
async function completeStream(sessionId) {
  try {
    const { data: newBalance, error } = await supabase.rpc('complete_stream', {
      p_session_id: sessionId,
    })
 
    if (error) throw error
 
    handleRewardComplete(newBalance)
 
  } catch (err) {
    console.warn('[stream] complete_stream rejected:', err.message)
 
    // Don't leave a broken "active" state — reset cleanly
    const videoId = state.rewardSession?.videoId
    state.rewardSession = null
    state.rewardState   = 'idle'
 
    if (videoId) setAllSurfacesRewardState('idle', videoId)
  }
}
 
 
/**
 * handleRewardComplete
 *
 * Called when complete_stream returns successfully.
 * Updates: state, card, mini pill, tracker, wallet balance, toast, float.
 *
 * @param {number} newBalance  The updated wallet_balance returned by the RPC.
 */
function handleRewardComplete(newBalance) {
  const videoId = state.rewardSession?.videoId
 
  // ── Update day-level state ──────────────────────────────────────
  if (videoId) state.rewardedSongs.add(videoId)
  state.todayEarnings += 100  // approximate — server is authoritative
  state.rewardSession  = null
  state.rewardState    = 'earned'
 
  // ── Update all surfaces ─────────────────────────────────────────
  if (videoId) {
    setAllSurfacesRewardState('earned', videoId)
    spawnEarnFloat(videoId)
  }
 
  // ── Update global wallet balance display ────────────────────────
  // __ghUpdateWalletBalance is defined in dashboard.js and updates
  // the header balance counter without a full profile re-fetch.
  window.__ghUpdateWalletBalance?.(newBalance)
 
  // ── Toast notification ──────────────────────────────────────────
  window.showToast?.('+₦100 earned! Keep streaming to earn more.', 'success')
}
 
 
// ─── FLOAT ANIMATION ──────────────────────────────────────────────────────────
 
/**
 * spawnEarnFloat
 *
 * Creates a "+₦100" pill that floats up out of the song card thumbnail
 * and fades out. The CSS animation (earn-float-up) is defined in
 * stream-rewards.css. The element removes itself when the animation ends.
 *
 * @param {string} videoId
 */
function spawnEarnFloat(videoId) {
  const card = document.querySelector(`.music-song-card[data-video-id="${videoId}"]`)
  if (!card) return
 
  const thumbWrap = card.querySelector('.music-song-card__thumb-wrap')
  if (!thumbWrap) return
 
  const float = document.createElement('div')
  float.className   = 'music-earn-float'
  float.textContent = '+₦100'
  thumbWrap.appendChild(float)
 
  // Self-cleaning: remove from DOM when CSS animation completes
  float.addEventListener('animationend', () => float.remove(), { once: true })
}
 
 
// ─── SURFACE UPDATERS ─────────────────────────────────────────────────────────
 
/**
 * setAllSurfacesRewardState
 *
 * Single entry point that updates all three surfaces atomically.
 * Always call this instead of the individual setters to keep surfaces in sync.
 *
 * @param {string} status   One of: idle|active|paused|earned|capped|already_earned_today
 * @param {string} videoId  The video_id of the track being updated (for card targeting)
 */
function setAllSurfacesRewardState(status, videoId) {
  state.rewardState = status
  if (videoId) setCardRewardState(videoId, status)
  setMiniPillState(status)
  setTrackerState(status)
}
 
 
/**
 * setCardRewardState
 *
 * Stamps data-reward-state on the card root and its reward strip child.
 * The CSS in stream-rewards.css responds to [data-reward-state] on both
 * the card (check badge visibility) and the strip (colour + animation).
 *
 * Targets ALL cards with this video_id — a song can appear in the grid
 * multiple times if load-more is active (it shouldn't, but be safe).
 *
 * @param {string} videoId
 * @param {string} status
 */
function setCardRewardState(videoId, status) {
  document
    .querySelectorAll(`.music-song-card[data-video-id="${videoId}"]`)
    .forEach(card => {
      card.dataset.rewardState = status
 
      const strip = card.querySelector('.music-reward-strip')
      if (!strip) return
 
      strip.dataset.rewardState = status
 
      // Terminal states get a full-width fill immediately (no animation).
      // Active state uses the JS-driven --progress property from startRewardTimer.
      if (['earned', 'already_earned_today', 'capped'].includes(status)) {
        strip.style.setProperty('--progress', '100%')
      }
 
      // Resetting to idle: clear the fill so next play starts from 0
      if (status === 'idle') {
        strip.style.setProperty('--progress', '0%')
      }
    })
}
 
 
/**
 * setMiniPillState
 *
 * Updates the reward pill in the mini player (injected by injectMiniPill).
 *
 * @param {string} status
 */
function setMiniPillState(status) {
  const pill = document.getElementById('rewardPill')
  if (!pill) return
 
  pill.dataset.rewardState = status
  const miniPlayer = document.getElementById("musicMiniPlayer");
  if (miniPlayer) miniPlayer.dataset.rewardState = status;
 
  const label = pill.querySelector('.music-reward-pill__label')
  if (label) label.textContent = PILL_LABELS[status] ?? ''
}
 
 
/**
 * setTrackerState
 *
 * Updates the reward tracker row in the expanded player (injected by
 * injectExpandedTracker). Also clears the time display for non-progress states.
 *
 * @param {string} status
 */
function setTrackerState(status) {
  const tracker = document.getElementById('rewardTracker')
  if (!tracker) return
 
  tracker.dataset.rewardState = status
 
  const label = tracker.querySelector('.music-reward-tracker__label')
  if (label) label.textContent = TRACKER_LABELS[status] ?? ''
 
  // Clear the elapsed/required counter for states where it has no meaning
  const timeEl = document.getElementById('rewardTrackerTime')
  if (timeEl && status !== 'active' && status !== 'paused') {
    timeEl.textContent = ''
  }
}




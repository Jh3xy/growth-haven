

/**
 * music.js — GrowthHaven Music Section
 * Place at: src/dashboard/music.js
 *
 * Export called once when #section-music becomes visible.
 * Wired via MutationObserver in dashboard.js (same pattern as casino.js).
 */

import { supabase } from '../assets/js/supabase.js'

let initialized = false

// ─── PLAYER STATE ─────────────────────────────────────────────────

const state = {
  allSongs:      [],      // full catalog from Supabase
  filteredSongs: [],      // current view after filter/search
  queue:         [],      // snapshot of filteredSongs at time of play
  currentIndex:  0,
  currentTrack:  null,
  playing:       false,
  expanded:      false,
  ytReady:       false,
  player:        null,    // YT.Player instance
  likedSongs:    new Set(),
  seekInterval:  null,
  pendingPlayToken: 0,
}


// ─── INIT ─────────────────────────────────────────────────────────

export async function initMusicSection() {
  if (initialized) return
  initialized = true

  console.log('[music] Initializing...')

  loadYouTubeAPI()
  await Promise.all([fetchCatalog(), fetchLikedSongs()])

  initFilterTabs()
  initSearch()
  initMiniPlayer()
  initExpandedPlayer()
  renderSongs(state.allSongs)
}


// ─── YOUTUBE IFRAME API ───────────────────────────────────────────

function loadYouTubeAPI() {
  // Already loaded by a previous init call
  if (window.YT?.Player) {
    state.ytReady = true
    return
  }

  // Set the global callback BEFORE injecting the script tag
  window.onYouTubeIframeAPIReady = () => {
    state.ytReady = true
    console.log('[music] YouTube IFrame API ready')
  }

  // Don't inject twice if another section already added it
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return

  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
}


// ─── DATA FETCHING ────────────────────────────────────────────────

async function fetchCatalog() {
  const { data, error } = await supabase
    .from('music_catalog')
    .select('*')
    .eq('embeddable', true)
    .order('last_refreshed', { ascending: false })

  if (error) {
    console.error('[music] fetchCatalog:', error)
    return
  }

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

  if (error) {
    console.error('[music] fetchLikedSongs:', error)
    return
  }

  state.likedSongs = new Set((data || []).map(s => s.video_id))
}


// ─── FILTER TABS ──────────────────────────────────────────────────

function initFilterTabs() {
  const tabs = document.querySelectorAll('#musicFilterTabs .music-filter-tab')

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('is-active')
        t.setAttribute('aria-selected', 'false')
      })
      tab.classList.add('is-active')
      tab.setAttribute('aria-selected', 'true')
      applyFilters()
    })
  })
}


// ─── SEARCH ───────────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('musicSearch')
  if (!input) return

  let debounce
  input.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(applyFilters, 280)
  })
}


// ─── SHARED FILTER LOGIC ──────────────────────────────────────────
// Tab filters first, search query narrows within that result.

function applyFilters() {
  const activeTab   = document.querySelector('#musicFilterTabs .music-filter-tab.is-active')
  const filter      = activeTab?.dataset.filter || 'all'
  const query       = document.getElementById('musicSearch')?.value.toLowerCase().trim() || ''

  let results = state.allSongs

  if (filter !== 'all') {
    results = results.filter(s =>
      s.artist?.toLowerCase().includes(filter) ||
      s.title?.toLowerCase().includes(filter)
    )
  }

  if (query) {
    results = results.filter(s =>
      s.title?.toLowerCase().includes(query) ||
      s.artist?.toLowerCase().includes(query)
    )
  }

  state.filteredSongs = results
  renderSongs(state.filteredSongs)
}


// ─── RENDER SONGS ─────────────────────────────────────────────────

function renderSongs(songs) {
  const grid  = document.getElementById('musicSongsGrid')
  const empty = document.getElementById('musicGridEmpty')
  if (!grid) return

  if (!songs.length) {
    grid.innerHTML = ''
    empty?.classList.remove('hidden')
    return
  }

  empty?.classList.add('hidden')

  grid.innerHTML = songs.map((song, i) => {
    const videoId = getTrackVideoId(song)
    const liked   = state.likedSongs.has(videoId)
    const artist  = escHtml(getTrackArtist(song))
    const title   = escHtml(getTrackTitle(song))
    const thumb   = escHtml(getTrackThumb(song))

    return `
      <div class="music-song-card" role="listitem">
        <div class="music-song-card__thumb-wrap">
          <img
            class="music-song-card__thumb"
            src="${thumb}"
            alt="${title}"
            loading="lazy"
          />
          <button class="music-song-card__play-overlay" data-index="${i}" aria-label="Play ${title}" type="button">
            <i data-lucide="play" style="width:22px;height:22px"></i>
          </button>
        </div>
        <div class="music-song-card__info">
          <span class="music-song-card__artist">${artist}</span>
          <span class="music-song-card__title">${title}</span>
        </div>
        <div class="music-song-card__actions">
          <button class="music-song-card__play-btn" data-index="${i}" aria-label="Play ${title}" type="button">
            <i data-lucide="play" style="width:13px;height:13px"></i>
          </button>
          <button
            class="music-song-card__like-btn ${liked ? 'is-liked' : ''}"
            data-video-id="${escHtml(videoId)}"
            aria-label="${liked ? 'Unlike' : 'Like'} ${title}"
            type="button"
          >
            <i data-lucide="heart" style="width:13px;height:13px"></i>
          </button>
        </div>
      </div>
    `
  }).join('')

  if (window.lucide) lucide.createIcons({ nodes: [grid] })

  // Delegated listeners — one each for play and like
  grid.querySelectorAll('[data-index]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      playTrack(parseInt(btn.dataset.index, 10))
    })
  })

  grid.querySelectorAll('.music-song-card__like-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      toggleLike(btn.dataset.videoId, btn)
    })
  })
}


// ─── PLAY TRACK ───────────────────────────────────────────────────

function playTrack(index) {
  const track = state.filteredSongs[index]
  if (!track) return
  const videoId = getTrackVideoId(track)
  if (!videoId) {
    console.warn('[music] Cannot play track without video_id:', track)
    return
  }

  // Snapshot the current filtered list as the queue
  state.queue        = [...state.filteredSongs]
  state.currentIndex = index
  state.currentTrack = track
  const playToken    = ++state.pendingPlayToken

  updateMiniPlayer(track)
  updateExpandedPlayer(track)
  resetSeekUI()
  showMiniPlayer()
  logPlayHistory(videoId)

  if (!state.player) {
    // YT API may still be loading — poll until ready
    const tryCreate = () => {
      if (playToken !== state.pendingPlayToken) return
      if (!state.ytReady) { setTimeout(tryCreate, 100); return }
      const currentVideoId = getTrackVideoId(state.currentTrack)
      if (!currentVideoId) return

      state.player = new YT.Player('ytPlayer', {
        height: '100%',
        width:  '100%',
        videoId: currentVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady:       e => { e.target.playVideo(); state.playing = true; syncPlayIcons() },
          onStateChange: onPlayerStateChange,
        },
      })
    }
    tryCreate()
  } else {
    state.player.loadVideoById(videoId)
    state.playing = true
    syncPlayIcons()
  }
}

function onPlayerStateChange(event) {
  switch (event.data) {
    case YT.PlayerState.ENDED:
      playNext()
      break
    case YT.PlayerState.PLAYING:
      state.playing = true
      syncPlayIcons()
      startSeekUpdater()
      break
    case YT.PlayerState.PAUSED:
      state.playing = false
      syncPlayIcons()
      stopSeekUpdater()
      break
  }
}


// ─── MINI PLAYER ──────────────────────────────────────────────────

function initMiniPlayer() {
  document.getElementById('miniPrevBtn')?.addEventListener('click', playPrevious)
  document.getElementById('miniPlayPauseBtn')?.addEventListener('click', togglePlayPause)
  document.getElementById('miniNextBtn')?.addEventListener('click', playNext)
  document.getElementById('miniExpandBtn')?.addEventListener('click', openExpandedPlayer)
}

function showMiniPlayer() {
  document.getElementById('musicMiniPlayer')?.classList.add('is-visible')
  document.body.classList.add('music-player-active') // shifts .floats up in CSS
}

function updateMiniPlayer(track) {
  const thumb  = document.getElementById('miniThumb')
  const title  = document.getElementById('miniTitle')
  const artist = document.getElementById('miniArtist')
  if (thumb) {
    thumb.src = getTrackThumb(track)
    thumb.alt = getTrackTitle(track)
  }
  if (title)  title.textContent  = getTrackTitle(track)
  if (artist) artist.textContent = getTrackArtist(track)
}


// ─── EXPANDED PLAYER ──────────────────────────────────────────────

function initExpandedPlayer() {
  document.getElementById('expandedCloseBtn')?.addEventListener('click', closeExpandedPlayer)
  document.getElementById('expandedPrevBtn')?.addEventListener('click', playPrevious)
  document.getElementById('expandedPlayPauseBtn')?.addEventListener('click', togglePlayPause)
  document.getElementById('expandedNextBtn')?.addEventListener('click', playNext)

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
  if (state.currentTrack) updateExpandedPlayer(state.currentTrack)
  startSeekUpdater()
}

function closeExpandedPlayer() {
  state.expanded = false
  document.getElementById('musicExpandedPlayer')?.classList.remove('is-open')
  stopSeekUpdater()
}

function updateExpandedPlayer(track) {
  const title   = document.getElementById('expandedTitle')
  const artist  = document.getElementById('expandedArtist')
  const likeBtn = document.getElementById('expandedLikeBtn')
  const videoId = getTrackVideoId(track)
  if (title)   title.textContent  = getTrackTitle(track)
  if (artist)  artist.textContent = getTrackArtist(track)
  if (likeBtn) likeBtn.classList.toggle('is-liked', state.likedSongs.has(videoId))
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

function resetSeekUI() {
  const seekBar = document.getElementById('musicSeekBar')
  const curEl = document.getElementById('seekCurrentTime')
  const durEl = document.getElementById('seekTotalTime')
  if (seekBar) seekBar.value = 0
  if (curEl) curEl.textContent = '0:00'
  if (durEl) durEl.textContent = '0:00'
}


// ─── CONTROLS ─────────────────────────────────────────────────────

function togglePlayPause() {
  if (!state.player) return
  state.playing ? state.player.pauseVideo() : state.player.playVideo()
}

function playNext() {
  if (!state.queue.length) return
  const next = (state.currentIndex + 1) % state.queue.length
  state.filteredSongs = state.queue  // restore queue as active view
  playTrack(next)
}

function playPrevious() {
  if (!state.queue.length) return
  const prev = state.currentIndex === 0
    ? state.queue.length - 1
    : state.currentIndex - 1
  state.filteredSongs = state.queue
  playTrack(prev)
}

function syncPlayIcons() {
  const icon = state.playing ? 'pause' : 'play'

  ;[
    document.getElementById('miniPlayPauseBtn'),
    document.getElementById('expandedPlayPauseBtn'),
  ].forEach(btn => {
    if (!btn) return
    btn.querySelector('i')?.setAttribute('data-lucide', icon)
    if (window.lucide) lucide.createIcons({ nodes: [btn] })
  })
}


// ─── LIKE / UNLIKE ────────────────────────────────────────────────

async function toggleLike(videoId, btn) {
  if (!videoId) return

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isLiked = state.likedSongs.has(videoId)

    if (isLiked) {
      const { error } = await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', user.id)
        .eq('video_id', videoId)

      if (error) throw error
      state.likedSongs.delete(videoId)
      syncLikeButtons(videoId, false, btn)
    } else {
      const track = state.allSongs.find(s => getTrackVideoId(s) === videoId)
      if (!track) return

      const { error } = await supabase
        .from('liked_songs')
        .insert({
          user_id: user.id,
          video_id: videoId,
          track_metadata: {
            title:     getTrackTitle(track),
            artist:    getTrackArtist(track),
            thumbnail: getTrackThumb(track),
            duration:  track.duration || track.duration_seconds || null,
          },
        })

      if (error) throw error
      state.likedSongs.add(videoId)
      syncLikeButtons(videoId, true, btn)
    }
  } catch (error) {
    console.error('[music] toggleLike:', error)
  }
}


// ─── PLAY HISTORY ─────────────────────────────────────────────────

let _historyTimer = null

async function logPlayHistory(videoId) {
  clearTimeout(_historyTimer)
  _historyTimer = setTimeout(async () => {
    if (getTrackVideoId(state.currentTrack) !== videoId) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('play_history').insert({ user_id: user.id, video_id: videoId })
      if (error) throw error
    } catch (error) {
      console.error('[music] logPlayHistory:', error)
    }
  }, 5000) // log after 5 seconds of actual play
}


// ─── UTILITIES ────────────────────────────────────────────────────

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function getTrackTitle(track) {
  return track?.title || track?.name || track?.song_title || 'Untitled'
}

function getTrackArtist(track) {
  return track?.artist || track?.artist_name || track?.channel_title || 'Unknown Artist'
}

function getTrackThumb(track) {
  return track?.thumbnail || track?.thumbnail_url || track?.image || track?.artwork_url || ''
}

function getTrackVideoId(track) {
  return track?.video_id || track?.youtube_id || track?.youtube_video_id || ''
}

function syncLikeButtons(videoId, liked, btn) {
  document.querySelectorAll(`.music-song-card__like-btn[data-video-id="${attrSelectorEscape(videoId)}"]`)
    .forEach(b => b.classList.toggle('is-liked', liked))
  btn?.classList.toggle('is-liked', liked)

  if (getTrackVideoId(state.currentTrack) === videoId) {
    document.getElementById('expandedLikeBtn')?.classList.toggle('is-liked', liked)
  }
}

function attrSelectorEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&')
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}



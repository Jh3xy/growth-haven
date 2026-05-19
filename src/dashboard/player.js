

/**
 * music.js — GrowthHaven Music Section
 * src/dashboard/music.js
 */

import { supabase } from '../assets/js/supabase.js'

let initialized  = false
const PAGE_SIZE  = 25

// ─── STATE ────────────────────────────────────────────────────────

const state = {
  allSongs:     [],
  filteredSongs:[],
  queue:        [],
  currentIndex: 0,
  currentTrack: null,
  playing:      false,
  expanded:     false,
  ytReady:      false,
  player:       null,
  likedSongs:   new Set(),
  seekInterval: null,
  displayCount: PAGE_SIZE,
}

let loadingCardEl = null


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
  initLoadMore()
  initKeyboardShortcuts()
  renderSongs(state.allSongs)
}


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
  document.querySelectorAll('#musicFilterTabs .music-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#musicFilterTabs .music-filter-tab').forEach(t => {
        t.classList.remove('is-active')
        t.setAttribute('aria-selected', 'false')
      })
      tab.classList.add('is-active')
      tab.setAttribute('aria-selected', 'true')
      state.displayCount = PAGE_SIZE   // reset pagination on filter change
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
    debounce = setTimeout(() => {
      state.displayCount = PAGE_SIZE   // reset pagination on search
      applyFilters()
    }, 280)
  })
}


// ─── FILTER LOGIC ─────────────────────────────────────────────────

function applyFilters() {
  const filter = document.querySelector('#musicFilterTabs .music-filter-tab.is-active')?.dataset.filter || 'all'
  const query  = document.getElementById('musicSearch')?.value.toLowerCase().trim() || ''

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
  const grid     = document.getElementById('musicSongsGrid')
  const empty    = document.getElementById('musicGridEmpty')
  const loadMore = document.getElementById('musicLoadMore')
  if (!grid) return

  if (!songs.length) {
    grid.innerHTML = ''
    empty?.classList.remove('hidden')
    loadMore?.classList.add('hidden')
    return
  }

  empty?.classList.add('hidden')

  // Client-side pagination — all data already fetched, just slice for display
  const displayed = songs.slice(0, state.displayCount)

  grid.innerHTML = displayed.map((song, i) => {
    const liked  = state.likedSongs.has(song.video_id)
    const artist = escHtml(song.artist || 'Unknown Artist')
    const title  = escHtml(song.title  || 'Untitled')

    return `
      <div class="music-song-card" role="listitem">
        <div class="music-song-card__thumb-wrap">
          <img class="music-song-card__thumb" src="${song.thumbnail || ''}" alt="${title}" loading="lazy" />
          <button class="music-song-card__play-overlay" data-index="${i}" aria-label="Play ${title}" type="button">
            <i data-lucide="play" style="width:22px;height:22px"></i>
          </button>
        </div>
        <div class="music-song-card__info">
          <span class="music-song-card__artist">${artist}</span>
          <span class="music-song-card__title">${title}</span>
        </div>
        <div class="music-song-card__actions">
          <button class="music-song-card__play-btn" data-index="${i}" aria-label="Play" type="button">
            <i data-lucide="play" style="width:13px;height:13px"></i>
          </button>
          <button class="music-song-card__like-btn ${liked ? 'is-liked' : ''}" data-video-id="${song.video_id}" aria-label="${liked ? 'Unlike' : 'Like'}" type="button">
            <i data-lucide="heart" style="width:13px;height:13px"></i>
          </button>
        </div>
      </div>
    `
  }).join('')

  window.lucide?.createIcons({ nodes: [grid] })

  // Play buttons (thumbnail overlay + action row button share [data-index])
  grid.querySelectorAll('[data-index]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      playTrack(parseInt(btn.dataset.index, 10))
    })
  })

  // Like buttons
  grid.querySelectorAll('.music-song-card__like-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      toggleLike(btn.dataset.videoId, btn)
    })
  })

  // Show / hide the load-more button
  if (loadMore) {
    loadMore.classList.toggle('hidden', songs.length <= state.displayCount)
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
  const track = state.filteredSongs[index]
  if (!track) return

  state.queue        = [...state.filteredSongs]
  state.currentIndex = index
  state.currentTrack = track

  setCardLoading(index)
  updateMiniPlayer(track)
  showMiniPlayer()
  if (state.expanded) updateExpandedPlayer(track)
  logPlayHistory(track.video_id)

  if (!state.player) {
    const tryCreate = () => {
      if (!state.ytReady) { setTimeout(tryCreate, 100); return }

      state.player = new YT.Player('ytPlayer', {
        height:   '100%',
        width:    '100%',
        videoId:  track.video_id,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady:       e  => { e.target.playVideo(); state.playing = true; syncPlayIcons() },
          onStateChange: onPlayerStateChange,
          onError:       onPlayerError,
        },
      })
    }
    tryCreate()
  } else {
    state.player.loadVideoById(track.video_id)
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
      clearCardLoading()   // remove spinner once video actually starts
      break
    case YT.PlayerState.PAUSED:
      state.playing = false
      syncPlayIcons()
      stopSeekUpdater()
      break
  }
}

// Auto-skip unavailable / embed-blocked videos
function onPlayerError(event) {
  console.warn('[music] Video error code:', event.data, '— skipping')
  clearCardLoading()
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


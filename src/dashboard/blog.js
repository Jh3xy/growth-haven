

import { getInitials, formatDate, initImagePreviewOverlay } from '../assets/js/utils.js';
import { renderPostContent } from '../assets/js/post-content-renderer.js';

const POSTS_PER_PAGE = 20;

function formatRelativeTime(isoString) {
  if (!isoString) return '';

  const then = new Date(isoString).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return formatDate(isoString);
}

function pluralizeLikes(count) {
  return `${count.toLocaleString('en-NG')} ${count === 1 ? 'like' : 'likes'}`;
}

function showBlogToast(message, type = 'success') {
  const existing = document.querySelector('.blog-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `blog-toast blog-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    window.setTimeout(() => toast.remove(), 240);
  }, 2600);
}


function initGuidelinesStrips() {
  document.querySelectorAll(".blog-rules-strip").forEach((strip) => {
    const trigger = strip.querySelector(".blog-rules-trigger");
    const panel = strip.querySelector(".blog-rules-panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", () => {
      const isOpen = strip.classList.toggle("is-open");

      // ARIA state
      strip.setAttribute("aria-expanded", String(isOpen));
      panel.setAttribute("aria-hidden", String(!isOpen));
    });
  });
}

// Call immediately 
initGuidelinesStrips();

async function handleShare(post) {
  // we use this file path so vercel can pick it up and intercept to render dynamic meta tags when links are shared
  const shareUrl = `${window.location.origin}/p?id=${post.id}`;
 
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Post on GrowthHaven',
        url: shareUrl,
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[blog] Share failed:', err);
        showBlogToast('Could not open share sheet.', 'warning');
      }
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showBlogToast('Link copied to clipboard.');
    } catch {
      showBlogToast('Could not copy link. Try manually.', 'warning');
    }
  }
}

function normalizeAuthor(author) {
  if (Array.isArray(author)) return author[0] || {};
  return author || {};
}

// Conditionally render img and avatar url or initials
function renderAvatarContent(avatarUrl, fullName, initials) {
  if (!avatarUrl) return initials;
  return `<img
    src="${avatarUrl}"
    alt="${fullName}"
    class="blog-post__avatar-img"
    onerror="this.style.display='none';this.parentElement.dataset.fallback='true'"
  />`;
  // onerror hides the broken img and lets the CSS :not([data-fallback]) fallback
}

function createPostElement(post, { onLike, onDelete, currentUserId } = {}) {
  const author = normalizeAuthor(post.author || post.members);
  const firstName = author.first_name || "";
  const lastName = author.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || "GrowthHaven Member";
  const initials = getInitials(firstName, lastName);

  // Only show delete if the current user owns this post
  const canDelete = Boolean(currentUserId && post.user_id === currentUserId);

  const article = document.createElement("article");
  article.className = "blog-post";
  article.setAttribute("role", "listitem");
  article.dataset.postId = post.id;

  article.innerHTML = `
  <!-- Three-dot context menu — top-right of the card -->
    <div class="blog-post__menu">
      <button
        class="blog-post__menu-btn"
        type="button"
        aria-label="Post options"
        aria-haspopup="true"
        aria-expanded="false"
      >
        <i data-lucide="more-vertical" style="width:15px;height:15px"></i>
      </button>
      <div class="blog-post__dropdown" role="menu" aria-hidden="true">
        <button class="blog-dropdown-item blog-dropdown-item--share" role="menuitem" type="button">
          <i data-lucide="external-link" style="width:13px;height:13px"></i>
          <span>Share</span>
        </button>
        ${
          canDelete
            ? `
        <button class="blog-dropdown-item blog-dropdown-item--delete" role="menuitem" type="button">
          <i data-lucide="trash-2" style="width:13px;height:13px"></i>
          <span>Delete</span>
        </button>
        `
            : ""
        }
      </div>
    </div>

    <div class="blog-post__topline">
      <div class="blog-post-content">
        <span class="blog-post__avatar" aria-hidden="true" data-initials="${initials}">${renderAvatarContent(author.avatar_url, fullName, initials)}</span>
        <div class="blog-post-content_wrap">
          <div class="blog-post__author">
            <span class="blog-post__name"></span>
            <time class="blog-post__time" datetime="${post.created_at || ""}">${formatRelativeTime(post.created_at)}</time>
          </div>
          <p class="blog-post__content"></p>
          <button class="blog-read-more hidden" type="button" aria-expanded="false">Read more</button>
          ${post.image_url ? `<div class="blog-post__media"><img src="${post.image_url}" alt="" loading="lazy" /></div>` : ""}
        </div>
      </div>
      <div class="blog-post__actions">
        <div class="blog-post__actions-primary">
          <button
            class="blog-like-btn${post.userLiked ? " is-liked" : ""}"
            type="button"
            aria-label="Like post"
            aria-pressed="${post.userLiked ? "true" : "false"}"
            ${post.userLiked ? "disabled" : ""}
          >
            <i data-lucide="heart" style="width:17px;height:17px"></i>
          </button>
          —
          <span class="blog-like-count">${pluralizeLikes(post.likeCount || 0)}</span>
        </div>
        <div class="blog-post__actions-secondary">
          <button
            class="blog-like-btn blog-share-btn"
            type="button"
            aria-label="Share post"
          >
            <i data-lucide="external-link" style="width:17px;height:17px"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  article.querySelector(".blog-post__name").textContent = fullName;
  renderPostContent(article.querySelector(".blog-post__content"), post.content);
  setupReadMore(article);
  // ── Image skeleton ──
  setupMediaLoading(article);

  article
    .querySelector(".blog-like-btn")
    ?.addEventListener("click", (event) => {
      onLike?.({
        post,
        article,
        button: event.currentTarget,
      });
    });

  article.querySelector(".blog-share-btn")?.addEventListener("click", () => {
    handleShare(post);
  });

  // ── Inline share button (actions row) ──
  article
    .querySelector(".blog-share-btn")
    ?.addEventListener("click", () => handleShare(post));

  // ── Three-dot menu wiring ──
  const menuBtn = article.querySelector(".blog-post__menu-btn");
  const dropdown = article.querySelector(".blog-post__dropdown");
  const dropShare = article.querySelector(".blog-dropdown-item--share");
  const dropDelete = article.querySelector(".blog-dropdown-item--delete");

  menuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    dropdown.setAttribute("aria-hidden", String(!isOpen));

    // Close any other open dropdowns in the feed
    document.querySelectorAll(".blog-post__dropdown.is-open").forEach((d) => {
      if (d !== dropdown) {
        d.classList.remove("is-open");
        d.setAttribute("aria-hidden", "true");
        d.previousElementSibling?.setAttribute("aria-expanded", "false");
      }
    });
  });

  dropShare?.addEventListener("click", () => {
    dropdown.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
    handleShare(post);
  });

  dropDelete?.addEventListener("click", () => {
    dropdown.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
    onDelete?.({ post, article });
  });

  return article;
}

function setupReadMore(article) {
  const content = article.querySelector('.blog-post__content');
  const button = article.querySelector('.blog-read-more');

  if (!content || !button) return;

  if (article.querySelector('.blog-post__media')) {
    article.classList.add('blog-post--has-media');
  }

  content.classList.add('is-collapsed');

  requestAnimationFrame(() => {
    const hasOverflow = content.scrollHeight > content.clientHeight + 1;

    button.classList.toggle('hidden', !hasOverflow);
    content.classList.toggle('is-collapsible', hasOverflow);

    // console.log('[blog] Read more measured:', {
    //   postId: article.dataset.postId,
    //   hasOverflow,
    //   scrollHeight: content.scrollHeight,
    //   visibleHeight: content.clientHeight,
    //   hasMedia: article.classList.contains('blog-post--has-media'),
    // });
  });

  button.addEventListener('click', () => {
    const expanded = article.classList.toggle('is-expanded');
    content.classList.toggle('is-collapsed', !expanded);
    button.textContent = expanded ? 'Show less' : 'Read more';
    button.setAttribute('aria-expanded', String(expanded));
  });
}

function setupMediaLoading(article) {
  const mediaDiv = article.querySelector('.blog-post__media');
  if (!mediaDiv) return;
 
  const img = mediaDiv.querySelector('img');
  if (!img) return;
 
  // Mark as loading — CSS reads this class for the skeleton state
  mediaDiv.classList.add('is-loading');
 
  // Already cached and painted — remove skeleton immediately
  if (img.complete && img.naturalWidth > 0) {
    mediaDiv.classList.remove('is-loading');
    return;
  }
 
  img.addEventListener('load', () => {
    mediaDiv.classList.remove('is-loading');
  }, { once: true });
 
  img.addEventListener('error', () => {
    // Image failed — remove the entire block cleanly rather than
    // leaving a broken skeleton in the feed
    mediaDiv.remove();
    article.classList.remove('blog-post--has-media');
  }, { once: true });
}

export function initBlogSection({ user, supabase, openDeposit }) {
  const section = document.getElementById('section-blog');
  const feed = document.getElementById('blogFeed');
  const empty = document.getElementById('blogEmpty');
  const loadMoreBtn = document.getElementById('blogLoadMoreBtn');
  const gateDepositBtn = document.getElementById('blogGateDepositBtn');

  let currentPage = 0;
  let initialized = false;
  let loading = false;
  let hasMore = true;
  let hasAccess = false;

  initImagePreviewOverlay(feed, { 
    imageSelector: '.blog-post__media img',
  });

  if (!section || !feed || !empty || !loadMoreBtn) {
    console.warn('[blog] Blog section markup is missing. Feed initialization skipped.');
    return async function noopBlogLoader() {};
  }

  gateDepositBtn?.addEventListener('click', () => {
    document.body.style.overflow = "";
    openDeposit?.();
  });

  loadMoreBtn.addEventListener('click', () => {
    console.log('[blog] Load more clicked.');
    loadPosts();
  });

  async function refreshWalletBalance() {
    const { data, error } = await supabase
      .from('members')
      .select('wallet_balance')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('[blog] Failed to refresh wallet balance after like:', error);
      return;
    }

    window.__ghUpdateWalletBalance?.(Number(data?.wallet_balance || 0));
    // console.log('[blog] Wallet balance refreshed after like:', data?.wallet_balance);
  }

  async function refreshActivity() {
    window.__ghResetTransactions?.();
    await window.__ghRefreshActivity?.();
    // console.log('[blog] Activity refresh requested after like.');
  }

  async function handleLike({ post, article, button }) {
    if (!post?.id || !button || button.disabled) return;

    if (post.user_id === user.id) {
      // console.log('[blog] Self-like prevented on client.', { postId: post.id });
      showBlogToast('You cannot like your own post.', 'warning');
      return;
    }

    const countEl = article.querySelector('.blog-like-count');
    const currentCount = Number(countEl?.dataset.count || post.likeCount || 0);
    const nextCount = currentCount + 1;

    button.disabled = true;
    button.classList.add('is-liked', 'is-pending');
    button.setAttribute('aria-pressed', 'true');
    if (countEl) {
      countEl.dataset.count = String(nextCount);
      countEl.textContent = pluralizeLikes(nextCount);
    }

    // console.log('[blog] Like RPC started:', { postId: post.id, likerId: user.id });

    const { data, error } = await supabase.rpc('process_post_like', {
      p_post_id: post.id,
      p_liker_id: user.id,
    });

    button.classList.remove('is-pending');

    if (error) {
      console.error('[blog] Like RPC failed:', error);
      button.disabled = false;
      button.classList.remove('is-liked');
      button.setAttribute('aria-pressed', 'false');
      if (countEl) {
        countEl.dataset.count = String(currentCount);
        countEl.textContent = pluralizeLikes(currentCount);
      }

      const message = error.message?.includes("already liked")
        ? "You've already liked this post."
        : error.message?.includes("own post")
          ? "You cannot like your own post."
          : error.message?.includes("rate_limit_cooldown")
            ? "Slow down — wait a moment before your next like."
            : error.message?.includes("rate_limit_daily")
              ? "You've reached your daily like limit. Come back tomorrow."
              : "Could not like post. Try again.";
      showBlogToast(message, 'warning');
      return;
    }

    post.userLiked = true;
    post.likeCount = nextCount;
    showBlogToast(`Post liked. ₦${Number(data?.liker_earned || 100).toLocaleString('en-NG')} earned.`);
    await refreshWalletBalance();
    await refreshActivity();

    // console.log('[blog] Like RPC succeeded:', {
    //   postId: post.id,
    //   result: data,
    // });
  }
  
  async function checkAccess() {
    const { data, error } = await supabase
      .from('members')
      .select('has_deposited')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('[blog] Failed to check deposit gate:', error);
      return false;
    }

    hasAccess = Boolean(data?.has_deposited);
    section.classList.toggle('is-gated', !hasAccess);
    document.body.style.overflow = hasAccess ? "" : "hidden";
    // console.log('[blog] Gate check complete:', { hasAccess });
    return hasAccess;
  }

  function clearSkeletons() {
    feed.querySelectorAll('.blog-post--skeleton').forEach((node) => node.remove());
  }

  function resetFeed() {
    currentPage = 0;
    hasMore = true;
    feed.innerHTML = '';
    empty.classList.add('hidden');
    loadMoreBtn.classList.add('hidden');
  }

  async function handleDelete({ post, article }) {
    // Dim the post immediately — gives instant feedback
    article.style.opacity = "0.45";
    article.style.pointerEvents = "none";

    const { error } = await supabase
      .from("posts") // ← adjust table name if yours differs
      .delete()
      .eq("id", post.id)
      .eq("user_id", user.id); // server-side safety guard

    if (error) {
      // Restore the post — something went wrong
      article.style.opacity = "";
      article.style.pointerEvents = "";
      showBlogToast("Could not delete post. Try again.", "warning");
      console.error("[blog] Delete error:", error);
      return;
    }

    // Animate collapse then remove from DOM
    const height = article.offsetHeight;
    article.style.height = height + "px";
    article.style.overflow = "hidden";
    article.style.transition =
      "opacity 0.25s ease, height 0.3s var(--spring), padding 0.3s ease, margin 0.3s ease";

    requestAnimationFrame(() => {
      article.style.opacity = "0";
      article.style.height = "0";
      article.style.paddingTop = "0";
      article.style.paddingBottom = "0";
      article.style.marginBottom = "0";
      article.style.borderWidth = "0";

      article.addEventListener(
        "transitionend",
        () => {
          article.remove();
          showBlogToast("Post deleted.", "success");
        },
        { once: true },
      );
    });
  }

  document.addEventListener(
    "click",
    () => {
      document.querySelectorAll(".blog-post__dropdown.is-open").forEach((d) => {
        d.classList.remove("is-open");
        d.setAttribute("aria-hidden", "true");
        d.previousElementSibling?.setAttribute("aria-expanded", "false");
      });
    },
    true,
  ); 

  async function loadPosts() {
    if (loading || !hasMore ) {
      //posts load regardless; gate overlay covers them visually
      return;
    }

    loading = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';

    const start = currentPage * POSTS_PER_PAGE;
    // console.log('[blog] Loading posts via RPC:', { start });
 
    const { data: rawPosts, error } = await supabase.rpc('get_blog_posts', {
      p_limit: POSTS_PER_PAGE,
      p_offset: start,
    });
 
    clearSkeletons();
 
    if (error) {
      console.error('[blog] Failed to load posts:', error);
      empty.classList.remove('hidden');
      empty.querySelector('.blog-empty__title').textContent = 'Could not load posts';
      empty.querySelector('.blog-empty__sub').textContent = 'Refresh the page and try again.';
      loading = false;
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load more';
      return;
    }
 
    const posts = (rawPosts || []).map((p) => ({
      ...p,
      author: {
        first_name: p.author_first_name,
        last_name: p.author_last_name,
        avatar_url: p.author_avatar_url || null,
      },
      likeCount: Number(p.like_count || 0),
      userLiked: Boolean(p.user_liked),
      created_at:
        p.created_at instanceof Date
          ? p.created_at.toISOString()
          : p.created_at,
    }));

    if (!posts?.length && currentPage === 0) {
      // console.log('[blog] No posts found. Showing empty state.');
      empty.classList.remove('hidden');
    }

    posts.forEach((post) => {
      feed.appendChild(createPostElement(post, {
        onLike: handleLike,     
        onDelete: handleDelete,
        currentUserId: user.id,
      }));
    });

    if (window.lucide) window.lucide.createIcons();

    currentPage += 1;
    hasMore = posts.length === POSTS_PER_PAGE;
    loadMoreBtn.classList.toggle('hidden', !hasMore);
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load more';
    loading = false;

    // console.log('[blog] Posts loaded:', {
    //   received: posts?.length || 0,
    //   currentPage,
    //   hasMore,
    // });
  }

  async function loadBlogSection({ force = false } = {}) {
    // checkAccess sets hasAccess and toggles .is-gated on the section (shows/hides overlay)
    await checkAccess();

    if (initialized && !force) return;

    resetFeed();
    initialized = true;
    await loadPosts(); // always runs — overlay covers feed visually for non-deposited members
  }

  return loadBlogSection;
}

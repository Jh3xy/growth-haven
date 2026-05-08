import { getInitials, formatDate } from '../assets/js/utils.js';

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

function normalizeAuthor(author) {
  if (Array.isArray(author)) return author[0] || {};
  return author || {};
}

function createPostElement(post, { onLike }) {
  const author = normalizeAuthor(post.author || post.members);
  const firstName = author.first_name || '';
  const lastName = author.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'GrowthHaven Member';
  const initials = getInitials(firstName, lastName);

  const article = document.createElement('article');
  article.className = 'blog-post';
  article.setAttribute('role', 'listitem');
  article.dataset.postId = post.id;

  article.innerHTML = `
    <div class="blog-post__topline">
      <div class="blog-post-content">
        <span class="blog-post__avatar" aria-hidden="true">${initials}</span>
        <div class="blog-post-content_wrap">
          <div class="blog-post__author">
            <span class="blog-post__name"></span>
            <time class="blog-post__time" datetime="${post.created_at || ""}">${formatRelativeTime(post.created_at)} ago</time>
          </div>
          <p class="blog-post__content"></p>
          <button class="blog-read-more hidden" type="button" aria-expanded="false">Read more</button>
        </div>
      </div>
      <div class="blog-post__actions">
        <button
          class="blog-like-btn${post.userLiked ? " is-liked" : ""}"
          type="button"
          aria-label="Like post"
          aria-pressed="${post.userLiked ? 'true' : 'false'}"
          ${post.userLiked ? 'disabled' : ''}
        >
          <i data-lucide="heart" style="width:17px;height:17px"></i>
        </button>
        —
        <span class="blog-like-count">${pluralizeLikes(post.likeCount || 0)}</span>
      </div>
    </div>
  `;

  article.querySelector('.blog-post__name').textContent = fullName;
  article.querySelector('.blog-post__content').textContent = post.content || '';
  setupReadMore(article);
  article.querySelector('.blog-like-btn')?.addEventListener('click', (event) => {
    onLike?.({
      post,
      article,
      button: event.currentTarget,
    });
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

  if (!section || !feed || !empty || !loadMoreBtn) {
    console.warn('[blog] Blog section markup is missing. Feed initialization skipped.');
    return async function noopBlogLoader() {};
  }

  gateDepositBtn?.addEventListener('click', () => {
    console.log('[blog] Gate deposit CTA clicked.');
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
    console.log('[blog] Wallet balance refreshed after like:', data?.wallet_balance);
  }

  async function refreshActivity() {
    window.__ghResetTransactions?.();
    await window.__ghRefreshActivity?.();
    console.log('[blog] Activity refresh requested after like.');
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

      const message = error.message?.includes('already liked')
        ? "You've already liked this post."
        : error.message?.includes('own post')
          ? 'You cannot like your own post.'
          : 'Could not like post. Try again.';
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

  async function loadPosts() {
    if (loading || !hasMore || !hasAccess) {
      // console.log('[blog] Load skipped:', { loading, hasMore, hasAccess });
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
      feed.appendChild(createPostElement(post, { onLike: handleLike }));
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
    // console.log('[blog] Section load requested:', { initialized, force });

    const accessGranted = await checkAccess();
    if (!accessGranted) {
      // console.log('[blog] Feed gated because member has not deposited.');
      return;
    }

    if (initialized && !force) return;

    resetFeed();
    initialized = true;
    await loadPosts();
  }

  return loadBlogSection;
}

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

function normalizeAuthor(author) {
  if (Array.isArray(author)) return author[0] || {};
  return author || {};
}

function createPostElement(post) {
  const author = normalizeAuthor(post.author);
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
        </div>
      </div>
      <div class="blog-post__actions">
        <button class="blog-like-btn${post.userLiked ? " is-liked" : ""}" type="button" aria-label="Like post">
          <i data-lucide="heart" style="width:17px;height:17px"></i>
        </button>
        ·
        <span class="blog-like-count">${pluralizeLikes(post.likeCount || 0)}</span>
      </div>
    </div>
  `;

  article.querySelector('.blog-post__name').textContent = fullName;
  article.querySelector('.blog-post__content').textContent = post.content || '';
  article.querySelector('.blog-like-btn')?.addEventListener('click', () => {
    console.log('[blog] Like button clicked. Phase D will connect this to process_post_like.', {
      postId: post.id,
      alreadyLiked: Boolean(post.userLiked),
    });
  });

  return article;
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
    console.log('[blog] Gate check complete:', { hasAccess });
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
      console.log('[blog] Load skipped:', { loading, hasMore, hasAccess });
      return;
    }

    loading = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';

    const start = currentPage * POSTS_PER_PAGE;
    const end = start + POSTS_PER_PAGE - 1;
    console.log('[blog] Loading posts:', { start, end });

    const { data: posts, error } = await supabase
      .from('posts')
      .select(`
        id,
        user_id,
        content,
        created_at,
        is_dummy,
        author:members!posts_user_id_fkey(first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .range(start, end);

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

    const postIds = (posts || []).map((post) => post.id);
    const likeCounts = new Map();
    const likedByUser = new Set();

    if (postIds.length) {
      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select('post_id, user_id')
        .in('post_id', postIds);

      if (likesError) {
        console.error('[blog] Failed to load likes for posts:', likesError);
      } else {
        likes.forEach((like) => {
          likeCounts.set(like.post_id, (likeCounts.get(like.post_id) || 0) + 1);
          if (like.user_id === user.id) likedByUser.add(like.post_id);
        });
      }
    }

    if (!posts?.length && currentPage === 0) {
      console.log('[blog] No posts found. Showing empty state.');
      empty.classList.remove('hidden');
    }

    posts?.forEach((post) => {
      feed.appendChild(createPostElement({
        ...post,
        likeCount: likeCounts.get(post.id) || 0,
        userLiked: likedByUser.has(post.id),
      }));
    });

    if (window.lucide) window.lucide.createIcons();

    currentPage += 1;
    hasMore = Boolean(posts && posts.length === POSTS_PER_PAGE);
    loadMoreBtn.classList.toggle('hidden', !hasMore);
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load more';
    loading = false;

    console.log('[blog] Posts loaded:', {
      received: posts?.length || 0,
      currentPage,
      hasMore,
    });
  }

  async function loadBlogSection({ force = false } = {}) {
    console.log('[blog] Section load requested:', { initialized, force });

    const accessGranted = await checkAccess();
    if (!accessGranted) {
      console.log('[blog] Feed gated because member has not deposited.');
      return;
    }

    if (initialized && !force) return;

    resetFeed();
    initialized = true;
    await loadPosts();
  }

  return loadBlogSection;
}

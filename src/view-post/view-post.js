

// ─── PAGE SPECIFIC STYLING - others imported via /src/assests/js/script.js ───────────────
import '../assets/styles/blog.css';
import './view-post.css';

import { supabase } from "../assets/js/supabase.js";
import { getInitials, initImagePreviewOverlay } from "../assets/js/utils.js";

// ── DOM Refs ─────────────────────────────────────────────────────────
const vpMain  = document.getElementById('vpMain');
const vpSkeleton  = document.getElementById('vpSkeleton');
const vpPost  = document.getElementById('vpPost');
const vpAvatar = document.getElementById('vpAvatar');
const vpAuthorName  = document.getElementById('vpAuthorName');
const vpTime  = document.getElementById('vpTime');
const vpContent   = document.getElementById('vpContent');
const vpMedia   = document.getElementById('vpMedia');
const vpImage  = document.getElementById('vpImage');
const vpLikeCount  = document.getElementById('vpLikeCount');
const vpError  = document.getElementById('vpError');
const vpGuestCta = document.getElementById('vpGuestCta');
const vpLockedCta = document.getElementById('vpLockedCta');
const vpFullActions = document.getElementById('vpFullActions');
const vpLikeBtn  = document.getElementById('vpLikeBtn');
const vpLikeBtnLabel = document.getElementById('vpLikeBtnLabel');
const vpBackNav  = document.getElementById('vpBackNav');

initImagePreviewOverlay(vpMain, {
  imageSelector: ".vp-post__media img",
});


// ── Helpers ──────────────────────────────────────────────────────────
 
function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff  = Math.max(0, Date.now() - new Date(isoString).getTime());
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return 'now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
 
function pluralizeLikes(count) {
  const n = Number(count) || 0;
  return `${n.toLocaleString('en-NG')} ${n === 1 ? 'like' : 'likes'}`;
}
 
function showToast(message, type = 'success') {
  const existing = document.querySelector('.vp-toast');
  if (existing) existing.remove();
 
  const toast = document.createElement('div');
  toast.className = `vp-toast vp-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
 
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 240);
  }, 2600);
}
 

 
// ── State layer helpers ───────────────────────────────────────────────
 
function showError() {
  vpSkeleton?.classList.add('hidden');
  vpError?.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons({ nodes: [vpError] });
}
 
function showGuestCta() {
  // For guests the back link goes to the landing page, not the dashboard
  if (vpBackNav) {
    vpBackNav.href = '/';
    const label = vpBackNav.querySelector('span');
    if (label) label.textContent = 'GrowthHaven';
  }
  vpGuestCta?.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons({ nodes: [vpGuestCta] });
}
 
function showLockedCta() {
  vpLockedCta?.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons({ nodes: [vpLockedCta] });
}
 
function showFullActions() {
  vpFullActions?.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons({ nodes: [vpFullActions] });
}

function setupReadMore(article) {
  const content = article.querySelector(".blog-post__content");
  const button = article.querySelector(".blog-read-more");

  if (!content || !button) return;

  if (article.querySelector(".blog-post__media")) {
    article.classList.add("blog-post--has-media");
  }

  content.classList.add("is-collapsed");

  requestAnimationFrame(() => {
    const hasOverflow = content.scrollHeight > content.clientHeight + 1;

    button.classList.toggle("hidden", !hasOverflow);
    content.classList.toggle("is-collapsible", hasOverflow);

  });

  button.addEventListener("click", () => {
    const expanded = article.classList.toggle("is-expanded");
    content.classList.toggle("is-collapsed", !expanded);
    button.textContent = expanded ? "Show less" : "Read more";
    button.setAttribute("aria-expanded", String(expanded));
  });
}

// ── Render post card ─────────────────────────────────────────────────
 
function renderPost(post) {
  const firstName = post.author_first_name || '';
  const lastName  = post.author_last_name  || '';
  const fullName  = `${firstName} ${lastName}`.trim() || 'GrowthHaven Member';
 
  if (vpAvatar)     vpAvatar.textContent    = getInitials(firstName, lastName) || 'GH';
  if (vpAuthorName) vpAuthorName.textContent = fullName;
  if (vpContent) {
    vpContent.innerHTML =
      `
      <p class="post-content blog-post__content">
        ${post.content}
      </p>
      <button class="blog-read-more hidden" type="button" aria-expanded="false">Read more</button>
        ` || "";
  }
  const article = document.querySelector(".vp-post__content");
  setupReadMore(article);

  if (vpTime) {
    vpTime.textContent = formatRelativeTime(post.created_at);
    vpTime.setAttribute('datetime', post.created_at || '');
  }
 
  if (vpLikeCount) {
    vpLikeCount.textContent = pluralizeLikes(post.like_count || 0);
  }
 
  // Reveal image only if one exists
  if (post.image_url && vpMedia && vpImage) {
    vpImage.src = post.image_url;
    vpMedia.classList.remove('hidden');
  }
 
  vpSkeleton?.classList.add('hidden');
  vpPost?.classList.remove('hidden');
 
  if (window.lucide) window.lucide.createIcons({ nodes: [vpPost] });
}


// ── Like handler ─────────────────────────────────────────────────────
 
async function handleLike(postId, userId, currentCount) {
  if (!vpLikeBtn || vpLikeBtn.disabled) return;
 
  // Optimistic UI
  vpLikeBtn.disabled = true;
  vpLikeBtn.classList.add('is-pending');
  const nextCount = currentCount + 1;
  if (vpLikeCount) vpLikeCount.textContent = pluralizeLikes(nextCount);
 
  const { data, error } = await supabase.rpc('process_post_like', {
    p_post_id:  postId,
    p_liker_id: userId,
  });
 
  vpLikeBtn.classList.remove('is-pending');
 
  if (error) {
    // Roll back
    if (vpLikeCount) vpLikeCount.textContent = pluralizeLikes(currentCount);
    vpLikeBtn.disabled = false;
 
    const message = error.message?.includes('already liked')
      ? "You've already liked this post."
      : error.message?.includes('own post')
        ? 'You cannot like your own post.'
        : 'Could not like post. Try again.';
 
    showToast(message, 'warning');
 
    // Re-attach since { once: true } consumed the listener
    vpLikeBtn.addEventListener('click', () => handleLike(postId, userId, currentCount), { once: true });
    return;
  }
 
  // Commit
  vpLikeBtn.classList.add('is-liked');
  vpLikeBtn.setAttribute('aria-pressed', 'true');
  if (vpLikeBtnLabel) vpLikeBtnLabel.textContent = 'Liked';
  if (window.lucide) window.lucide.createIcons({ nodes: [vpLikeBtn] });
 
  const earned = Number(data?.liker_earned || 100);
  showToast(`Post liked. ₦${earned.toLocaleString('en-NG')} earned.`);
}




// ── Init ─────────────────────────────────────────────────────────────
 
(async function init() {
 
  //  Read and validate post ID from URL
  const params = new URLSearchParams(window.location.search);
  const postId = params.get('id');
 
  if (!postId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) {
    console.warn('[view-post] Missing or malformed post ID:', postId);
    showError();
    return;
  }
 
  // Fetch post — public RPC
  const { data: post, error: fetchError } = await supabase
    .rpc('get_public_post', { p_post_id: postId })
    .single();
 
  if (fetchError || !post) {
    console.error('[view-post] Post fetch failed:', fetchError);
    showError();
    return;
  }
 
  //  Render post — always visible regardless of auth state
  renderPost(post);
 
  //  Resolve auth state
  const { data: { session } } = await supabase.auth.getSession();
 
  if (!session) {
    showGuestCta();
    return;
  }
 
  const user = session.user;
 
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('has_deposited')
    .eq('id', user.id)
    .single();
 
  if (memberError || !member?.has_deposited) {
    showLockedCta();
    return;
  }
 
  //  Full access — check if this user already liked this post
  const { data: existingLike } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();
 
  showFullActions();
 
  const liveCount = Number(post.like_count || 0);
 
  if (existingLike) {
    // Already liked — locked state on the button
    vpLikeBtn?.classList.add('is-liked');
    vpLikeBtn?.setAttribute('aria-pressed', 'true');
    if (vpLikeBtn) vpLikeBtn.disabled = true;
    if (vpLikeBtnLabel) vpLikeBtnLabel.textContent = 'Liked';
    if (window.lucide) window.lucide.createIcons({ nodes: [vpLikeBtn] });
  } else {
    vpLikeBtn?.addEventListener(
      'click',
      () => handleLike(postId, user.id, liveCount),
      { once: true },
    );
  }
 
})();
 



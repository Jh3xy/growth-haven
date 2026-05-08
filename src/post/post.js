import '../assets/styles/fonts.css';
import '../assets/styles/variables.css';
import '../assets/styles/utils.css';
import '../assets/styles/style.css';
import '../assets/styles/animations.css';
import '../assets/styles/queries.css';
import './post.css';

import { supabase } from '../assets/js/supabase.js';
import { getInitials } from '../assets/js/utils.js';

if (window.lucide) {
  window.lucide.createIcons();
}

const DASHBOARD_BLOG_URL = '/src/dashboard/?page=blog';
const MAX_POST_LENGTH = 500;

const form = document.getElementById('postForm');
const textarea = document.getElementById('postContent');
const counter = document.getElementById('postCounter');
const submitBtn = document.getElementById('postSubmitBtn');
const errorEl = document.getElementById('postError');
const authorAvatar = document.getElementById('postAuthorAvatar');
const authorName = document.getElementById('postAuthorName');

const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  window.location.href = '/src/login/';
  throw new Error('[post] No active session');
}

const user = session.user;

function setError(message = '') {
  errorEl.textContent = message;
}

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting || !textarea.value.trim();
  submitBtn.classList.toggle('is-loading', isSubmitting);
  submitBtn.querySelector('span').textContent = isSubmitting ? 'Posting...' : 'Post';
}

function updateCounter() {
  const length = textarea.value.length;
  counter.textContent = `${length}/${MAX_POST_LENGTH}`;
  counter.classList.toggle('is-warning', length >= 420 && length < MAX_POST_LENGTH);
  counter.classList.toggle('is-danger', length >= MAX_POST_LENGTH);
  submitBtn.disabled = length === 0 || length > MAX_POST_LENGTH;
  if (length > 0) setError('');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `post-toast post-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

async function loadAuthor() {
  const { data: member, error } = await supabase
    .from('members')
    .select('first_name, last_name, has_deposited')
    .eq('id', user.id)
    .single();

  if (error || !member) {
    console.error('[post] Member profile error:', error);
    setError('Could not load your profile. Refresh and try again.');
    submitBtn.disabled = true;
    return;
  }

  if (!member.has_deposited) {
    showToast('Make your first deposit to unlock posting.', 'warning');
    window.setTimeout(() => {
      window.location.href = DASHBOARD_BLOG_URL;
    }, 900);
    return;
  }

  const firstName = member.first_name || user.user_metadata?.first_name || '';
  const lastName = member.last_name || user.user_metadata?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'GrowthHaven Member';

  authorName.innerHTML = fullName;
  authorAvatar.innerHTML = getInitials(firstName, lastName);
}

textarea.addEventListener('input', updateCounter);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const content = textarea.value.trim();

  if (!content) {
    setError('Write something before posting.');
    textarea.focus();
    return;
  }

  if (content.length > MAX_POST_LENGTH) {
    setError(`Posts must be ${MAX_POST_LENGTH} characters or less.`);
    textarea.focus();
    return;
  }

  setSubmitting(true);
  setError('');

  const { error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      content,
      is_dummy: false,
    });

  if (error) {
    console.error('[post] Failed to create post:', error);
    setError('Could not publish your post. Please try again.');
    showToast('Post failed. Try again.', 'error');
    setSubmitting(false);
    return;
  }

  showToast('Post published.');
  window.setTimeout(() => {
    window.location.href = DASHBOARD_BLOG_URL;
  }, 650);
});

await loadAuthor();
updateCounter();

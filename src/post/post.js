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
const MAX_POST_LENGTH = 5000;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1200;
const COMPRESSION_QUALITY = 0.78;

const form = document.getElementById('postForm');
const textarea = document.getElementById('postContent');
const counter = document.getElementById('postCounter');
const submitBtn = document.getElementById('postSubmitBtn');
const errorEl = document.getElementById('postError');
const authorAvatar = document.getElementById('postAuthorAvatar');
const authorName = document.getElementById('postAuthorName');
const imageInput = document.getElementById('postImageInput');
const imagePreview = document.getElementById('postImagePreview');
const imageThumbnail = document.getElementById('postImageThumbnail');
const imageRemoveBtn = document.getElementById('postImageRemove');

// State variables
let selectedImageFile = null;
let isImageLoaded = false;
let compressedImageBlob = null;

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
  submitBtn.disabled = isSubmitting || !canSubmit();
  submitBtn.classList.toggle("is-loading", isSubmitting);
  submitBtn.querySelector("span").textContent = isSubmitting
    ? "Posting..."
    : "Post";
}

function canSubmit() {
  const length = textarea.value.length;
  return (length > 0 || isImageLoaded) && length <= MAX_POST_LENGTH;
}

function updateCounter() {
  const length = textarea.value.length;
  counter.textContent = `${length}/${MAX_POST_LENGTH}`;
  counter.classList.toggle(
    "is-warning",
    length >= 4000 && length < MAX_POST_LENGTH,
  );
  counter.classList.toggle("is-danger", length >= MAX_POST_LENGTH);
  submitBtn.disabled = !canSubmit();
  if (length > 0) setError("");
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
    .select('first_name, last_name, has_deposited, avatar_url')
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

  authorName.textContent = fullName;
  authorName.classList.remove('skeleton');
  // Conditionally build pfp with avatar or initials
  if (member.avatar_url) {
    // Show PFP — remove text content so initials don't show behind the img
    authorAvatar.textContent = "";
    const img = document.createElement("img");
    img.src = member.avatar_url;
    img.alt = fullName;
    img.className = "post-author-avatar-img";
    img.onerror = () => {
      // If the URL is stale or 404, fall back to initials silently
      authorAvatar.removeChild(img);
      authorAvatar.textContent = getInitials(firstName, lastName);
    };
    authorAvatar.appendChild(img);
  } else {
    authorAvatar.textContent = getInitials(firstName, lastName);
  }

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


/**
 * Compress image using Canvas API
 * - Resizes to max 1200px width (maintains aspect ratio)
 * - Exports as JPEG at 0.78 quality
 * - Target: 200-400KB for typical phone photos
 */
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let { width, height } = img;
        
        // Resize if wider than max width
        if (width > MAX_IMAGE_WIDTH) {
          height = Math.round((height * MAX_IMAGE_WIDTH) / width);
          width = MAX_IMAGE_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas compression failed'));
              return;
            }
            console.log('[post] Image compressed:', {
              original: `${(file.size / 1024).toFixed(0)}KB`,
              compressed: `${(blob.size / 1024).toFixed(0)}KB`,
              dimensions: `${width}×${height}`,
            });
            resolve(blob);
          },
          'image/jpeg',
          COMPRESSION_QUALITY
        );
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}


function clearImageSelection() {
  isImageLoaded = false;
  selectedImageFile = null;
  compressedImageBlob = null;
  imageInput.value = "";
  imagePreview.classList.add("hidden");
  imageThumbnail.style.backgroundImage = "";
  submitBtn.disabled = !canSubmit();
}


async function handleImageSelection(file) {
  if (!file) return;
  if (isImageLoaded) {
    // prevent double upload
    showToast("An image is already selected. Remove it before adding another.", "info");
    return;
  }

  // Validate MIME type
  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    showToast("Only JPEG, PNG, and WebP images are supported.", "warning");
    clearImageSelection();
    return;
  }

  // Validate size
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    showToast(`Image must be under ${MAX_IMAGE_SIZE_MB}MB.`, "warning");
    clearImageSelection();
    return;
  }

  try {
    // Compress the image
    const blob = await compressImage(file);
    compressedImageBlob = blob;
    selectedImageFile = file;
    isImageLoaded = true;
    // Show preview
    const previewUrl = URL.createObjectURL(blob);
    imageThumbnail.style.backgroundImage = `url(${previewUrl})`;
    imagePreview.classList.remove("hidden");

    // Re-initialize Lucide icons for the remove button
    if (window.lucide) {
      window.lucide.createIcons({ nodes: [imagePreview] });
    }
    submitBtn.disabled = !canSubmit();
  } catch (error) {
    console.error("[post] Image compression failed:", error);
    showToast("Failed to process image. Try a different file.", "error");
    clearImageSelection();
  }
}


imageInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleImageSelection(file);
});

imageRemoveBtn.addEventListener("click", () => {
  clearImageSelection();
});


textarea.addEventListener('input', updateCounter);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = textarea.value.trim();

  if (!content && !compressedImageBlob) {
    setError("Write something or attach an image before posting.");
    textarea.focus();
    return;
  }

  if (content.length > MAX_POST_LENGTH) {
    setError(`Posts must be ${MAX_POST_LENGTH} characters or less.`);
    textarea.focus();
    return;
  }

  setSubmitting(true);
  setError("");

  try {
    //  Insert post and get the ID back
    const { data: newPost, error: insertError } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        content: content || null,
        is_dummy: false,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    const postId = newPost.id;
    console.log("[post] Post created:", postId);

    // Upload image if one was selected
    if (compressedImageBlob) {
      const filePath = `${user.id}/${postId}/image.jpg`;

      console.log("[post] Uploading image to:", filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(filePath, compressedImageBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        console.error("[post] Image upload failed:", uploadError);
        showToast("Post created, but image upload failed.", "warning");
        // Post exists without image - acceptable, continue to redirect
        window.setTimeout(() => {
          window.location.href = DASHBOARD_BLOG_URL;
        }, 1200);
        return;
      }

      console.log("[post] Image uploaded:", uploadData.path);

      // Step 3: Get public URL
      const { data: urlData } = supabase.storage
        .from("post-images")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      console.log("[post] Public URL:", publicUrl);

      // Step 4: Update post with image_url
      const { error: updateError } = await supabase
        .from("posts")
        .update({ image_url: publicUrl })
        .eq("id", postId);

      if (updateError) {
        console.error("[post] Failed to update image_url:", updateError);
        showToast("Post created, but image link failed.", "warning");
      }
    }

    textarea.value = "";
    showToast("Post published.");
    window.setTimeout(() => {
      window.location.href = DASHBOARD_BLOG_URL;
    }, 650);
  } catch (error) {
    console.error("[post] Failed to create post:", error);
    setError("Could not publish your post. Please try again.");
    showToast("Post failed. Try again.", "error");
    setSubmitting(false);
  }
});

await loadAuthor();
updateCounter();



/**
 * profile.js — GrowthHaven Dashboard Profile Section
 */

import { supabase }              from '../assets/js/supabase.js';
import { getInitials, isValidPhone } from '../assets/js/utils.js';
import { openModal }             from './modal.js';


// ─── INIT ────────────────────────────────────────────────────────

export function initProfile(user) {
  const section = document.getElementById('section-profile');
  if (!section) return;

  let loaded = false;

  const observer = new MutationObserver(() => {
    if (!section.classList.contains('hidden') && !loaded) {
      loaded = true;
      loadProfile(user);
    }
  });

  observer.observe(section, { attributes: true, attributeFilter: ['class'] });

  document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
    // cancel edit mode if active
    if (!document.getElementById('profileSaveBtn')?.classList.contains('hidden')) {
      document.getElementById('profileCancelBtn')?.click();
    }
    openModal('change_password', {});
  });
}


// ─── LOAD ────────────────────────────────────────────────────────

async function loadProfile(user) {
  const { data: member, error } = await supabase
    .from('members')
    .select('first_name, last_name, email, phone, referral_code, created_at, avatar_url')
    .eq('id', user.id)
    .single();

  if (error || !member) {
    console.error('[profile] Fetch error:', error);
    return;
  }

  populateIdentity(member);
  populateFields(member);
  initEditFlow(user, member);
  initAvatarUpload(user, member.avatar_url);
}



function renderAvatarEl(el, avatarUrl, initials, fullName = "") {
  // Remove any existing photo (safe on first render too)
  el.querySelector(".avatar-photo")?.remove();
  // Text layer: initials always sit underneath as a fallback
  el.textContent = initials;

  if (!avatarUrl) return;

  const img = document.createElement("img");
  img.src = avatarUrl;
  img.alt = fullName;
  img.className = "avatar-photo";
  // On error: img removes itself, initials text underneath is already visible
  img.onerror = () => img.remove();
  el.appendChild(img);
}

// ─── IDENTITY BLOCK ──────────────────────────────────────────────

function populateIdentity(member) {
  const avatarEl  = document.getElementById('profileAvatar');
  const nameEl    = document.getElementById('profileName');
  const emailEl   = document.getElementById('profileEmail');
  const sinceEl   = document.getElementById('profileSince');
  const refPillEl = document.getElementById('profileRefPill');
  const refCodeEl = document.getElementById('profileRefCode');


  const initials = getInitials(member.first_name, member.last_name);
  const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();
  const since    = member.created_at
    ? new Date(member.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '—';

  if (avatarEl)
    renderAvatarEl(avatarEl, member.avatar_url, initials || "?", fullName);

  if (nameEl)    { nameEl.textContent  = fullName || '—';    nameEl.classList.remove('skeleton'); }
  if (emailEl)   { emailEl.textContent = member.email || '—';  emailEl.classList.remove('skeleton'); }
  if (sinceEl)   { sinceEl.textContent = `Member since ${since}`;   sinceEl.classList.remove('skeleton'); }

  if (refPillEl && refCodeEl) {
    refCodeEl.textContent = member.referral_code || '—';
    refPillEl.classList.remove('skeleton');
    if (window.lucide) lucide.createIcons({ nodes: [refPillEl] });
  }
}


// ─── FIELD POPULATION ────────────────────────────────────────────

function populateFields(member) {
  const firstEl = document.getElementById('profileFirstName');
  const lastEl  = document.getElementById('profileLastName');
  const phoneEl = document.getElementById('profilePhone');

  if (firstEl) firstEl.value = member.first_name || '';
  if (lastEl)  lastEl.value  = member.last_name  || '';
  if (phoneEl) phoneEl.value = member.phone      || '';
}


function initAvatarUpload(user, currentAvatarUrl) {
  const avatarEl = document.getElementById("profileAvatar");
  const addBtn = document.querySelector(".add-profile-btn");
  const editBtn = document.getElementById("profileEditBtn");
  const cancelBtn = document.getElementById("profileCancelBtn");
  const saveBtn = document.getElementById("profileSaveBtn");

  if (!avatarEl) return;

  // Create a hidden file input — no HTML change needed
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  let isEditing = false;
  let committedUrl = currentAvatarUrl || null; // last confirmed-good URL

  // ── Track edit mode so avatar click only fires in edit mode ──
  editBtn?.addEventListener("click", () => {
    isEditing = true;
    avatarEl.classList.add("is-editable");
    addBtn?.classList.add("is-visible");
  });

  function exitEditMode() {
    isEditing = false;
    avatarEl.classList.remove("is-editable");
    addBtn?.classList.remove("is-visible");
  }

  cancelBtn?.addEventListener("click", exitEditMode);

  // saveBtn click exits edit mode via existing initEditFlow logic;
  // we also need to clear the editable state here
  saveBtn?.addEventListener("click", () => {
    // Wait one tick so initEditFlow's setEditing(false) runs first
    setTimeout(exitEditMode, 0);
  });

  // ── Trigger file picker on avatar or pencil btn click ──
  function onAvatarClick() {
    if (!isEditing) return;
    fileInput.click();
  }

  avatarEl.addEventListener("click", onAvatarClick);
  addBtn?.addEventListener("click", (e) => {
    e.stopPropagation(); // prevent bubbling to avatarEl listener
    onAvatarClick();
  });

  // ── Handle file selection ──
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // reset so same file can be re-selected
    if (!file) return;

    // Client-side guards (storage also enforces these, this is UX only)
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      showAvatarError("Only JPEG, PNG, or WebP images are accepted.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showAvatarError("Image must be under 2MB.");
      return;
    }

    // Optimistic update — show local blob immediately
    const blobUrl = URL.createObjectURL(file);
    renderAvatarEl(avatarEl, blobUrl, avatarEl.textContent);
    avatarEl.classList.add("is-uploading");

    const ext = file.name.split(".").pop().toLowerCase() || "jpg";
    const path = `${user.id}/avatar.${ext}`;

    // Upload — upsert:true overwrites any previous file at the same path
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    avatarEl.classList.remove("is-uploading");

    if (uploadError) {
      console.error("[profile] Avatar upload failed:", uploadError);
      renderAvatarEl(avatarEl, committedUrl, avatarEl.textContent); // revert
      showAvatarError("Upload failed. Please try again.");
      return;
    }

    // Get the stable public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    // Persist to members table
    const { error: dbError } = await supabase
      .from("members")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);

    if (dbError) {
      console.error("[profile] avatar_url update failed:", dbError);
      renderAvatarEl(avatarEl, committedUrl, avatarEl.textContent); // revert
      showAvatarError("Could not save photo. Please try again.");
      return;
    }

    // Commit: replace blob URL with real CDN URL
    committedUrl = publicUrl;
    // Add cache-buster so the browser doesn't serve the old image
    const freshUrl = `${publicUrl}?t=${Date.now()}`;
    renderAvatarEl(avatarEl, freshUrl, avatarEl.textContent);

    // Sync header avatar
    const headerAvatar = document.getElementById("avatarInitials");
    if (headerAvatar) {
      const initials = headerAvatar.textContent || "";
      renderAvatarEl(headerAvatar, freshUrl, initials);
    }

    URL.revokeObjectURL(blobUrl); // clean up
  });

  // ── Inline error helper (reuses profile-field-error pattern) ──
  function showAvatarError(msg) {
    const existing = document.getElementById("avatarUploadError");
    if (existing) {
      existing.textContent = msg;
      return;
    }
    const err = document.createElement("p");
    err.id = "avatarUploadError";
    err.className = "profile-field-error";
    err.style.textAlign = "center";
    err.style.marginTop = "0.5rem";
    err.textContent = msg;
    avatarEl.closest(".profile-identity")?.appendChild(err);
    setTimeout(() => err.remove(), 4000);
  }
}

// ─── EDIT FLOW ───────────────────────────────────────────────────

function initEditFlow(user, originalMember) {
  const editBtn   = document.getElementById('profileEditBtn');
  const saveBtn   = document.getElementById('profileSaveBtn');
  const cancelBtn = document.getElementById('profileCancelBtn');
  const successEl = document.getElementById('profileSuccess');

  const firstEl = document.getElementById('profileFirstName');
  const lastEl  = document.getElementById('profileLastName');
  const phoneEl = document.getElementById('profilePhone');
  const inputs  = [firstEl, lastEl, phoneEl].filter(Boolean);

  // Tracks last confirmed-good values so Cancel can restore correctly
  let savedValues = {
    first_name: originalMember.first_name || '',
    last_name:  originalMember.last_name  || '',
    phone:      originalMember.phone      || '',
  };

  // ── Helpers ──

  function setEditing(active) {
    inputs.forEach(el => {
      if (active) el.removeAttribute('readonly');
      else        el.setAttribute('readonly', '');
    });
    editBtn?.classList.toggle('hidden', active);
    saveBtn?.classList.toggle('hidden', !active);
    cancelBtn?.classList.toggle('hidden', !active);
    if (active && firstEl) firstEl.focus();
  }

  function clearErrors() {
    inputs.forEach(el => el.classList.remove('is-error'));
    ['err-profileFirstName', 'err-profileLastName', 'err-profilePhone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  function setFieldError(inputEl, errId, msg) {
    inputEl?.classList.add('is-error');
    const el = document.getElementById(errId);
    if (el) el.textContent = msg;
  }

  function validate() {
    clearErrors();
    let valid = true;

    if (!firstEl?.value.trim()) {
      setFieldError(firstEl, 'err-profileFirstName', 'First name is required.');
      valid = false;
    }
    if (!lastEl?.value.trim()) {
      setFieldError(lastEl, 'err-profileLastName', 'Last name is required.');
      valid = false;
    }
    const phone = phoneEl?.value.trim();
    if (phone && !isValidPhone(phone)) {
      setFieldError(phoneEl, 'err-profilePhone', 'Enter a valid phone number.');
      valid = false;
    }

    return valid;
  }

  // Clear error on input
  inputs.forEach(el => {
    const errEl = document.getElementById('err-' + el.id);
    el.addEventListener('input', () => {
      el.classList.remove('is-error');
      if (errEl) errEl.textContent = '';
    });
  });

  // ── Handlers ──

  editBtn?.addEventListener('click', () => {
    successEl?.classList.add('hidden');
    setEditing(true);
  });

  cancelBtn?.addEventListener('click', () => {
    if (firstEl) firstEl.value = savedValues.first_name;
    if (lastEl)  lastEl.value  = savedValues.last_name;
    if (phoneEl) phoneEl.value = savedValues.phone;
    clearErrors();
    setEditing(false);
  });

  saveBtn?.addEventListener('click', async () => {
    if (!validate()) return;

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const firstName = firstEl?.value.trim() || "";
    const lastName = lastEl?.value.trim() || "";
    const phone = phoneEl?.value.trim() || null;

    // 1. Persist to members table
    const { error: dbError } = await supabase
      .from("members")
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq("id", user.id);

    if (dbError) {
      console.error("[profile] Save error:", dbError);
      saveBtn.disabled = false;
      saveBtn.innerHTML =
        '<i data-lucide="check" style="width:12px;height:12px"></i> Save Changes';
      if (window.lucide) lucide.createIcons({ nodes: [saveBtn] });
      setFieldError(
        firstEl,
        "err-profileFirstName",
        "Could not save. Please try again.",
      );
      return;
    }

    // 2. Keep auth metadata in sync so initials survive a page refresh
    await supabase.auth.updateUser({
      data: { first_name: firstName, last_name: lastName },
    });

    // 3. Update identity block in-place
    const fullName = `${firstName} ${lastName}`.trim();
    const newInitials = getInitials(firstName, lastName) || "?";

    const nameEl = document.getElementById("profileName");
    const avatarEl = document.getElementById("profileAvatar");
    const headerAvatar = document.getElementById("avatarInitials"); // declared FIRST
    const headerName = document.getElementById("headerName");

    if (nameEl) nameEl.textContent = fullName;

    // Read the current photo URL directly from the DOM.
    // This avoids the cross-scope dependency on committedUrl entirely —
    // whatever photo is currently showing in the circle is the right one.
    const existingImg = avatarEl?.querySelector(".avatar-photo");
    const currentAvatarUrl = existingImg?.src || null;

    if (avatarEl) renderAvatarEl(avatarEl, currentAvatarUrl, newInitials);
    if (headerAvatar)
      renderAvatarEl(headerAvatar, currentAvatarUrl, newInitials.toUpperCase());
    if (headerName) headerName.textContent = fullName;

    // 5. Advance the saved baseline so Cancel works correctly going forward
    savedValues = {
      first_name: firstName,
      last_name: lastName,
      phone: phone || "",
    };

    // 6. Revert UI
    saveBtn.disabled = false;
    saveBtn.innerHTML =
      '<i data-lucide="check" style="width:12px;height:12px"></i> Save Changes';
    if (window.lucide) lucide.createIcons({ nodes: [saveBtn] });

    setEditing(false);

    if (successEl) {
      successEl.classList.remove("hidden");
      setTimeout(() => successEl.classList.add("hidden"), 4000);
    }
  });
}

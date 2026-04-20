

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
    .select('first_name, last_name, email, phone, referral_code, created_at')
    .eq('id', user.id)
    .single();

  if (error || !member) {
    console.error('[profile] Fetch error:', error);
    return;
  }

  populateIdentity(member);
  populateFields(member);
  initEditFlow(user, member);
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

  if (avatarEl)  avatarEl.textContent  = initials || '?';

  if (nameEl)    { nameEl.textContent  = fullName || '—';               nameEl.classList.remove('skeleton'); }
  if (emailEl)   { emailEl.textContent = member.email || '—';           emailEl.classList.remove('skeleton'); }
  if (sinceEl)   { sinceEl.textContent = `Member since ${since}`;       sinceEl.classList.remove('skeleton'); }

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

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving...';

    const firstName = firstEl?.value.trim() || '';
    const lastName  = lastEl?.value.trim()  || '';
    const phone     = phoneEl?.value.trim() || null;

    // 1. Persist to members table
    const { error: dbError } = await supabase
      .from('members')
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq('id', user.id);

    if (dbError) {
      console.error('[profile] Save error:', dbError);
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px"></i> Save Changes';
      if (window.lucide) lucide.createIcons({ nodes: [saveBtn] });
      setFieldError(firstEl, 'err-profileFirstName', 'Could not save. Please try again.');
      return;
    }

    // 2. Keep auth metadata in sync so initials survive a page refresh
    await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName } });

    // 3. Update identity block in-place
    const fullName = `${firstName} ${lastName}`.trim();
    const newInitials = getInitials(firstName, lastName) || '?';

    const nameEl    = document.getElementById('profileName');
    const avatarEl  = document.getElementById('profileAvatar');
    if (nameEl)   nameEl.textContent   = fullName;
    if (avatarEl) avatarEl.textContent = newInitials;

    // 4. Update header avatar + name (rendered from user_metadata on load)
    const headerAvatar = document.getElementById('avatarInitials');
    const headerName   = document.getElementById('headerName');
    if (headerAvatar) headerAvatar.textContent = newInitials.toUpperCase();
    if (headerName)   headerName.textContent   = fullName;

    // 5. Advance the saved baseline so Cancel works correctly going forward
    savedValues = { first_name: firstName, last_name: lastName, phone: phone || '' };

    // 6. Revert UI
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px"></i> Save Changes';
    if (window.lucide) lucide.createIcons({ nodes: [saveBtn] });

    setEditing(false);

    if (successEl) {
      successEl.classList.remove('hidden');
      setTimeout(() => successEl.classList.add('hidden'), 4000);
    }
  });
}



/**
 * modal.js — GrowthHaven Modal Manager
 */

import { MODAL_TEMPLATES, initModalHandlers } from './modal-templates.js';

const shell    = document.getElementById('modalShell');
const titleEl  = document.getElementById('modalTitle');
const bodyEl   = document.getElementById('modalBody');
const closeBtn = document.getElementById('modalClose');
const backdrop = document.getElementById('modalBackdrop');

let isOpen = false;

export function openModal(type, data = {}) {
  const template = MODAL_TEMPLATES[type];
  if (!template) {
    console.warn(`[modal] Unknown modal type: "${type}"`);
    return;
  }

  const { title, body } = template(data);

  titleEl.textContent = title;
  bodyEl.innerHTML    = body;

  shell.setAttribute('aria-hidden', 'false');
  shell.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  isOpen = true;

  // Re-init Lucide for injected icons
  if (window.lucide) lucide.createIcons({ nodes: [bodyEl] });

  // Wire type-specific handlers after DOM is ready
  initModalHandlers(type, data);
}

export function closeModal() {
  if (!isOpen) return;

  shell.classList.remove('is-open');
  shell.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  isOpen = false;

  // Clear body after transition so there's no flash on next open
  const panel = shell.querySelector('.modal-shell__panel');
  const duration = parseFloat(
    getComputedStyle(panel).transitionDuration
  ) * 1000 || 350;

  setTimeout(() => {
    titleEl.textContent = '';
    bodyEl.innerHTML    = '';
  }, duration);
}

// ── Shell-level event listeners  ──────────────────

closeBtn.addEventListener('click', closeModal);

backdrop.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen) closeModal();
});

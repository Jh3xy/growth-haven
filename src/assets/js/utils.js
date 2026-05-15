
// Growth Haven reusuables functions and helpers

// CountDown Helpers

export function isValidEmail(val) {
  // Catches most typos without being overkill
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}
 
export function isValidPhone(val) {
  // Strips formatting chars, checks for 7–15 digits (ITU-T E.164 range)
  return /^\d{7,15}$/.test(val.replace(/[\s\-().+]/g, ''));
}

export function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function getInitials(firstName, lastName) {
  return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || '?';
}


/**
 * initImagePreviewOverlay
 *
 * Attaches a delegated click listener to containerEl. Clicks on any <img>
 * matching imageSelector open a full-screen preview overlay.
 *
 * The overlay box has an absolute-positioned download anchor (top-right)
 * ready to wire up — just set downloadBtn.href when needed.
 *
 * @param {Element} containerEl         The element to watch for image clicks
 * @param {object}  [options]
 * @param {string}  [options.imageSelector='img']  CSS selector for clickable images
 * @returns {function} destroy — removes listeners and the overlay from the DOM
 */
export function initImagePreviewOverlay(containerEl, options = {}) {
  if (!containerEl) return () => {};
 
  const { imageSelector = 'img' } = options;
 
  let overlay    = null;
  let overlayImg = null;
  let closeBtn   = null;
  let downloadBtn = null;
 
  // ── Build overlay lazily on first open ──
  function buildOverlay() {
    if (overlay) return;
 
    // Backdrop
    overlay = document.createElement('div');
    overlay.className = 'img-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image preview');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position:        'fixed',
      inset:           '0',
      zIndex:          '500',
      background:      'rgba(0,0,0,0.9)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         '1.25rem',
      opacity:         '0',
      pointerEvents:   'none',
      transition:      'opacity 0.2s ease',
    });
 
    // Image box — the visible centered container
    const box = document.createElement('div');
    box.className = 'img-overlay__box';
    Object.assign(box.style, {
      position:        'relative',
      maxWidth:        '80vw',
      maxHeight:       '90vh',
      background:      'var(--surface-card, #111)',
      borderRadius:    '8px',
      overflow:        'visible',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      boxShadow:       '0 24px 64px rgba(0,0,0,0.6)',
    });
 
    // The image
    overlayImg = document.createElement('img');
    overlayImg.className = 'img-overlay__img';
    overlayImg.alt = '';
    Object.assign(overlayImg.style, {
      maxWidth:     '100%',
      maxHeight:    '88vh',
      objectFit:    'contain',
      borderRadius: '6px',
      display:      'block',
    });
 
    // Download button — top-right of box, href wired on open
    downloadBtn = document.createElement('a');
    downloadBtn.className = 'img-overlay__download';
    downloadBtn.setAttribute('aria-label', 'Download image');
    downloadBtn.download = 'image';
    downloadBtn.target = '_blank';
    downloadBtn.rel = 'noopener noreferrer';
    Object.assign(downloadBtn.style, {
      position:       'absolute',
      top:            '-14px',
      right:          '22px',
      width:          '30px',
      height:         '30px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'var(--surface-card, #fff)',
      border:         '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
      borderRadius:   '50%',
      cursor:         'pointer',
      color:          'var(--text-secondary, #aaa)',
      textDecoration: 'none',
      boxShadow:      '0 2px 8px rgba(0,0,0,0.35)',
      zIndex:         '1',
    });
    downloadBtn.innerHTML = '<i data-lucide="download" style="width:13px;height:13px;pointer-events:none"></i>';
 
    // Close button — top-right corner of box
    closeBtn = document.createElement('button');
    closeBtn.className = 'img-overlay__close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close preview');
    Object.assign(closeBtn.style, {
      position:       'absolute',
      top:            '-14px',
      right:          '-14px',
      width:          '30px',
      height:         '30px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'var(--surface-card, #fff)',
      border:         '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
      borderRadius:   '50%',
      cursor:         'pointer',
      color:          'var(--text-primary, #fff)',
      boxShadow:      '0 2px 8px rgba(0,0,0,0.35)',
      padding:        '0',
      fontFamily:     'inherit',
      minHeight:      'unset',
      zIndex:         '1',
    });
    closeBtn.innerHTML = '<i data-lucide="x" style="width:13px;height:13px;pointer-events:none"></i>';
 
    // Clicks on the box/image don't bubble up to the backdrop close handler
    box.addEventListener('click', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', closeOverlay);
 
    // Clicking the dark backdrop closes the overlay
    overlay.addEventListener('click', closeOverlay);
 
    box.appendChild(overlayImg);
    box.appendChild(downloadBtn);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
 
    if (window.lucide) window.lucide.createIcons({ nodes: [box] });
  }
 
  function openOverlay(src) {
    buildOverlay();

    // Show the overlay immediately — don't wait on the blob fetch
    overlayImg.src = src;
    downloadBtn.href = src; // fallback: direct link until blob resolves
    downloadBtn.download = "image.jpg";

    overlay.setAttribute("aria-hidden", "false");
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeBtn?.focus());

    // Fetch image as blob so the download button forces a file save
    fetch(src)
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        // Extract filename from the URL path, strip query params
        const filename = src.split("/").pop().split("?")[0] || "image.jpg";
        downloadBtn.href = blobUrl;
        downloadBtn.download = filename;
        // Store for cleanup on close
        downloadBtn._blobUrl = blobUrl;
      })
      .catch(() => {
        // Fetch failed (e.g. network error) — the direct-link fallback above stays
        console.warn(
          "[img-overlay] Blob fetch failed, download will open in new tab.",
        );
      });
  }
 
  function closeOverlay() {
    if (!overlay) return;
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    document.removeEventListener("keydown", onKeyDown);

    // Revoke the blob URL created for download to free memory
    if (downloadBtn?._blobUrl) {
      URL.revokeObjectURL(downloadBtn._blobUrl);
      downloadBtn._blobUrl = null;
    }
  }
 
  function onKeyDown(e) {
    if (e.key === 'Escape') closeOverlay();
  }
 
  function handleContainerClick(e) {
    if (!e.target.matches(imageSelector)) return;
    // Guard: skip broken images (no src) 
    if (!e.target.src) return;
    openOverlay(e.target.src);
  }
 
  containerEl.addEventListener('click', handleContainerClick);
 
  return function destroy() {
    containerEl.removeEventListener('click', handleContainerClick);
    document.removeEventListener('keydown', onKeyDown);
    overlay?.remove();
    overlay = null;
  };
}


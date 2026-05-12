

/**
 * Dashboard Carousel Header
 * Wraps section headers with auto-advancing background carousel
 * Usage: initCarouselHeader('#carouselId', [imagePaths])
 */
 
const AUTO_ADVANCE_DELAY = 3000; // 3 seconds
 
export function initCarouselHeader(containerId, images) {
  const container = document.getElementById(containerId);
  if (!container || !images?.length) {
    console.warn(
      `[carousel] Container "${containerId}" not found or no images provided`,
    );
    return;
  }

  let currentIndex = 0;
  let autoPlayInterval = null;
  let isPaused = false;

  // Get existing content (the header)
  const existingContent = container.querySelector(
    ".dash-carousel-header__content",
  );
  if (!existingContent) {
    console.warn(
      `[carousel] No .dash-carousel-header__content found in "${containerId}"`,
    );
    return;
  }

  // Build track
  const track = document.createElement("div");
  track.className = "dash-carousel-header__track";

  images.forEach((src, index) => {
    const slide = document.createElement("div");
    slide.className = "dash-carousel-header__slide";
    slide.innerHTML = `<img src="${src}" alt="" loading="${index === 0 ? "eager" : "lazy"}" />`;
    track.appendChild(slide);
  });

  // Build overlay
  const overlay = document.createElement("div");
  overlay.className = "dash-carousel-header__overlay";

  // Build dots
  const dots = document.createElement("div");
  dots.className = "dash-carousel-header__dots";
  dots.setAttribute("role", "tablist");
  dots.setAttribute("aria-label", "Carousel navigation");

  images.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.className = "dash-carousel-header__dot";
    dot.type = "button";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
    dot.setAttribute("aria-selected", index === 0 ? "true" : "false");
    dot.dataset.index = index;
    if (index === 0) dot.classList.add("is-active");
    dots.appendChild(dot);
  });

  // Inject into container (before content)
  container.insertBefore(track, existingContent);
  container.insertBefore(overlay, existingContent);
  container.appendChild(dots);

  // Navigation logic
  function goToSlide(index) {
    if (index < 0 || index >= images.length) return;

    currentIndex = index;
    track.style.transform = `translateX(-${index * 100}%)`;

    // Update dots
    dots.querySelectorAll(".dash-carousel-header__dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-selected", i === index ? "true" : "false");
    });

    // NEW: Update Slide Classes for the zoom effect
    track
      .querySelectorAll(".dash-carousel-header__slide")
      .forEach((slide, i) => {
        slide.classList.toggle("is-active", i === index);
      });
  }

  // Ensure the first slide is active on init
  setTimeout(() => goToSlide(0), 100);

  function nextSlide() {
    const next = (currentIndex + 1) % images.length;
    goToSlide(next);
  }

  function startAutoPlay() {
    if (isPaused) return;
    stopAutoPlay();
    autoPlayInterval = setInterval(nextSlide, AUTO_ADVANCE_DELAY);
  }

  function stopAutoPlay() {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
  }

  // Dot click handlers
  dots.querySelectorAll(".dash-carousel-header__dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const index = Number(dot.dataset.index);
      goToSlide(index);
      stopAutoPlay();
      startAutoPlay();
    });
  });

  // Pause on hover
  container.addEventListener("mouseenter", () => {
    isPaused = true;
    stopAutoPlay();
  });

  container.addEventListener("mouseleave", () => {
    isPaused = false;
    startAutoPlay();
  });

  // Pause on focus
  dots.addEventListener("focusin", () => {
    isPaused = true;
    stopAutoPlay();
  });

  dots.addEventListener("focusout", () => {
    isPaused = false;
    startAutoPlay();
  });

  // Start
  startAutoPlay();

  console.log(
    `[carousel] Initialized "${containerId}" with ${images.length} slides`,
  );

  // Cleanup
  return function destroy() {
    stopAutoPlay();
  };
}


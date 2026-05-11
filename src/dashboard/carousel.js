

/**
 * Dashboard Carousel
 * Auto-advancing banner carousel with dot navigation
 * Usage: initCarousel('#carouselId', [imagePaths])
 */
 
const AUTO_ADVANCE_DELAY = 5000; // 5 seconds
 
export function initCarousel(containerId, images) {
  const container = document.getElementById(containerId);
  if (!container || !images?.length) {
    console.warn(`[carousel] Container "${containerId}" not found or no images provided`);
    return;
  }
 
  let currentIndex = 0;
  let autoPlayInterval = null;
  let isPaused = false;
 
  // Build carousel HTML
  const track = document.createElement('div');
  track.className = 'dash-carousel__track';
 
  images.forEach((src, index) => {
    const slide = document.createElement('div');
    slide.className = 'dash-carousel__slide';
    slide.innerHTML = `<img src="${src}" alt="Dashboard banner ${index + 1}" loading="${index === 0 ? 'eager' : 'lazy'}" />`;
    track.appendChild(slide);
  });
 
  const dots = document.createElement('div');
  dots.className = 'dash-carousel__dots';
  dots.setAttribute('role', 'tablist');
  dots.setAttribute('aria-label', 'Carousel navigation');
 
  images.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.className = 'dash-carousel__dot';
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
    dot.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    dot.dataset.index = index;
    if (index === 0) dot.classList.add('is-active');
    dots.appendChild(dot);
  });
 
  container.appendChild(track);
  container.appendChild(dots);
  container.classList.add('dash-carousel');
 
  // Navigation logic
  function goToSlide(index) {
    if (index < 0 || index >= images.length) return;
 
    currentIndex = index;
    track.style.transform = `translateX(-${index * 100}%)`;
 
    // Update dots
    dots.querySelectorAll('.dash-carousel__dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }
 
  function nextSlide() {
    const next = (currentIndex + 1) % images.length;
    goToSlide(next);
  }
 
  function startAutoPlay() {
    if (isPaused) return;
    stopAutoPlay(); // Clear any existing interval
    autoPlayInterval = setInterval(nextSlide, AUTO_ADVANCE_DELAY);
  }
 
  function stopAutoPlay() {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
  }
 
  // Dot click handlers
  dots.querySelectorAll('.dash-carousel__dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      const index = Number(dot.dataset.index);
      goToSlide(index);
      stopAutoPlay();
      startAutoPlay(); // Resume after manual navigation
    });
  });
 
  // Pause on hover (UX + accessibility)
  container.addEventListener('mouseenter', () => {
    isPaused = true;
    stopAutoPlay();
    container.classList.add('is-paused');
  });
 
  container.addEventListener('mouseleave', () => {
    isPaused = false;
    container.classList.remove('is-paused');
    startAutoPlay();
  });
 
  // Pause on focus (keyboard navigation)
  dots.addEventListener('focusin', () => {
    isPaused = true;
    stopAutoPlay();
  });
 
  dots.addEventListener('focusout', () => {
    isPaused = false;
    startAutoPlay();
  });
 
  // Start auto-play
  startAutoPlay();
 
  // Cleanup function (call when section unmounts if needed)
  return function destroy() {
    stopAutoPlay();
    container.innerHTML = '';
    container.classList.remove('dash-carousel');
  };
}


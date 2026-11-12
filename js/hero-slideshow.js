(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const slides = Array.from(hero.querySelectorAll('.hero-slide'));
  const statements = Array.from(hero.querySelectorAll('.hero-statement'));
  if (slides.length < 2) return;

  // Shuffle once on each visit, keeping every photo in the rotation.
  for (let i = slides.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [slides[i], slides[j]] = [slides[j], slides[i]];
  }

  let current = 0;
  let currentStatement = 0;
  let timer;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
      slide.setAttribute('aria-hidden', String(i !== index));
    });
    statements.forEach((statement, i) => {
      statement.classList.toggle('is-active', i === currentStatement);
      statement.setAttribute('aria-hidden', String(i !== currentStatement));
    });
  }

  function updatePlayback() {
    window.clearInterval(timer);
    if (!reducedMotion.matches && !document.hidden) {
      timer = window.setInterval(() => {
        current = (current + 1) % slides.length;
        if (statements.length) currentStatement = (currentStatement + 1) % statements.length;
        showSlide(current);
      }, 5000);
    }
  }

  showSlide(current);
  document.addEventListener('visibilitychange', updatePlayback);
  reducedMotion.addEventListener('change', updatePlayback);
  updatePlayback();
})();

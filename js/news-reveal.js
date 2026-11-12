(() => {
  const sections = document.querySelectorAll('.home-news, .home-faq .intro-photo, .director-profile, .home-about, .home-medical .medical-entry, .home-staff .staff-card, .home-services > .schedule-panel, .home-services > .reservation-preview, .page-home .clinic-hours > .schedule-panel, .page-home .clinic-reservation > .reservation-preview, .page-about .about-intro, .page-about .about-block, .page-about .staff-card, .page-about .photo-gallery, .page-news .news-article, .page-medical .medical-entry, .page-medical .clinical-gallery figure');
  if (!sections.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target.matches('.page-about .staff-card')) {
        if (!entry.isIntersecting) entry.target.classList.remove('is-revealed');
        else if (entry.intersectionRatio >= 0.2) entry.target.classList.add('is-revealed');
        return;
      }
      if (!entry.isIntersecting) return;
      if (entry.target.matches('.home-news') && entry.intersectionRatio < 0.12) return;
      if (entry.target.matches('.home-faq .intro-photo, .page-news .news-article, .page-medical .medical-entry, .page-medical .clinical-gallery figure') && entry.intersectionRatio < 0.12) return;
      if (entry.target.matches('.home-staff .staff-card') && entry.intersectionRatio < 0.2) return;
      if (entry.target.classList.contains('director-profile') && entry.intersectionRatio < 0.2) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: [0, 0.12, 0.2, 0.25] });
  sections.forEach((section) => observer.observe(section));
})();

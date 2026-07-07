// ---------- Mobile Navigation ----------
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('mainNav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    document.body.classList.toggle('nav-open', open);
  });
  // Untermenüs am Handy auf-/zuklappen
  nav.querySelectorAll('.has-sub > a').forEach(a => {
    a.addEventListener('click', e => {
      if (window.innerWidth <= 920) {
        const li = a.parentElement;
        if (!li.classList.contains('open')) {
          e.preventDefault();
          li.classList.add('open');
        }
      }
    });
  });
}

// ---------- Scroll-Reveal ----------
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
    });
  }, { threshold: 0.08 });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('visible'));
}

// ---------- Zähler-Animation (Über uns) ----------
document.querySelectorAll('.stat-value[data-count]').forEach(el => {
  const target = parseInt(el.dataset.count, 10);
  if (isNaN(target)) return;
  const io = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    const start = performance.now(), dur = 1400;
    const tick = now => {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.5 });
  io.observe(el);
});

// ---------- Lightbox ----------
const lb = document.getElementById('lightbox');
if (lb) {
  const lbImg = lb.querySelector('img');
  const lbCap = lb.querySelector('.lb-caption');
  let items = [], idx = 0;

  function show(i) {
    idx = (i + items.length) % items.length;
    lbImg.src = items[idx].href;
    lbCap.textContent = items[idx].dataset.caption || '';
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.hidden = true;
    lbImg.src = '';
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-lightbox]').forEach(grid => {
    const links = [...grid.querySelectorAll('a.gallery-item')];
    links.forEach((a, i) => a.addEventListener('click', e => {
      e.preventDefault();
      items = links;
      show(i);
    }));
  });
  document.querySelectorAll('.glightbox-single').forEach(img => {
    img.addEventListener('click', () => {
      items = [{ href: img.src, dataset: {} }];
      show(0);
    });
  });

  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', () => show(idx - 1));
  lb.querySelector('.lb-next').addEventListener('click', () => show(idx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });

  // Wischgesten am Handy
  let touchX = null;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });
}

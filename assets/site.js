/* Tirion Analytics — page interactions (nav, scroll veil, reveals, motion toggle, TOC). */
(() => {
  'use strict';

  const nav = document.querySelector('.nav');
  const veil = document.querySelector('.scene .veil');
  const dimOnScroll = !document.body.classList.contains('page-legal');
  const maxVeil = parseFloat(document.body.dataset.veil || '0.55');

  function onScroll() {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('is-solid', y > 12);
    if (veil && dimOnScroll) veil.style.opacity = String(Math.min(1, y / (window.innerHeight * 0.9)) * maxVeil);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  // Fade sections in as they enter the viewport.
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('is-in'));
  }

  // Pause / play the animated background.
  const toggle = document.querySelector('[data-motion-toggle]');
  const motion = window.TirionMotion;
  if (toggle && motion) {
    const pauseIcon = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="2.6" height="9" rx="1" fill="currentColor"/><rect x="7.4" y="1.5" width="2.6" height="9" rx="1" fill="currentColor"/></svg>';
    const playIcon = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4c0 .5.5.8.9.5l6.3-4.2c.4-.2.4-.8 0-1L3.9 1.3c-.4-.3-.9 0-.9.5Z" fill="currentColor"/></svg>';
    const render = paused => {
      toggle.innerHTML = (paused ? playIcon : pauseIcon) + `<span>${paused ? 'Play background motion' : 'Pause background motion'}</span>`;
      toggle.setAttribute('aria-pressed', String(paused));
    };
    render(motion.paused);
    toggle.addEventListener('click', () => motion.set(!motion.paused));
    motion.listeners.push(render);
  } else if (toggle) {
    toggle.hidden = true;
  }

  // Highlight the current document in the compliance table of contents.
  const tocLinks = [...document.querySelectorAll('.toc a[href^="#"]')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const visible = new Set();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      const current = tocLinks.map(a => a.getAttribute('href').slice(1)).find(id => visible.has(id));
      if (current) tocLinks.forEach(a => a.classList.toggle('is-active', a === byId.get(current)));
    }, { rootMargin: '-20% 0px -60% 0px' });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  // Contact form: check the fields, send them to /api/contact, and show the result in place.
  // Without JavaScript the form posts normally and the server redirects back with ?sent or ?error.
  const form = document.querySelector('[data-contact-form]');
  if (form) {
    const status = form.querySelector('[data-contact-status]');
    const button = form.querySelector('button[type="submit"]');
    const show = (text, kind) => { status.textContent = text; status.className = 'contact-status' + (kind ? ` is-${kind}` : ''); };
    const fields = [
      [form.elements.email, v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
      [form.elements.message, v => v.length > 0],
    ];
    const params = new URLSearchParams(location.search);
    if (params.has('sent')) show('Thanks, your message was sent.', 'ok');
    if (params.has('error')) show('Sorry, your message could not be sent. Please try again.', 'error');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      let firstBad = null;
      fields.forEach(([input, valid]) => {
        const ok = valid(input.value.trim());
        input.setAttribute('aria-invalid', String(!ok));
        document.getElementById(input.getAttribute('aria-describedby')).hidden = ok;
        if (!ok && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); show(''); return; }

      button.disabled = true;
      show('Sending…');
      let code = 0;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: form.elements.email.value.trim(), message: form.elements.message.value.trim(), website: form.elements.website.value }),
        });
        code = res.status;
        if (!res.ok) throw new Error('send failed');
        form.reset();
        show('Thanks, your message was sent. We will reply to the email address you provided.', 'ok');
      } catch {
        show(code === 429 ? 'Too many messages in a short time. Please wait a minute and try again.' : 'Sorry, your message could not be sent. Please try again in a moment.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  }
})();

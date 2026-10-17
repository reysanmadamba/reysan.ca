// G-WEB/OS behaviour: boot, particle field, decoding headline, holo cards, launch sequence, terminal form.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  // theme
  const root = document.documentElement;
  const saved = store.get('gweb-theme');
  if (saved) root.dataset.theme = saved;
  $('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next; store.set('gweb-theme', next);
  });

  // boot sequence (short, once per session)
  const boot = $('.boot');
  let seen = false; try { seen = sessionStorage.getItem('gweb-boot') === '1'; sessionStorage.setItem('gweb-boot', '1'); } catch {}
  if (boot) {
    if (calm || seen) boot.classList.add('done');
    else {
      requestAnimationFrame(() => { $('.bar i', boot).style.width = '100%'; });
      setTimeout(() => boot.classList.add('done'), 1300);
    }
  }

  // header + mobile nav
  const top = $('.top');
  const onScroll = () => top.classList.toggle('scrolled', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('.burger'), nav = $('.nav');
  burger?.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  nav?.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); burger?.setAttribute('aria-expanded', false); } });

  // cursor glow
  const glow = $('.cursor');
  if (glow && matchMedia('(pointer:fine)').matches && !calm) addEventListener('pointermove', e => { glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, { passive: true });
  else glow?.remove();

  // particle field
  const cv = $('#field');
  if (cv) {
    const ctx = cv.getContext('2d');
    let W, H, pts = [], mouse = { x: -999, y: -999 }, running = true, raf;
    const css = n => getComputedStyle(root).getPropertyValue(n).trim();
    const resize = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, W * H / 14000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: Math.random() * 1.6 + .4 }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const c1 = css('--cyan'), c2 = css('--violet');
      for (const p of pts) {
        if (!calm) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 140 && !calm) { p.x += dx / d * .8; p.y += dy / d * .8; }
      }
      ctx.lineWidth = .6;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) { ctx.strokeStyle = c2; ctx.globalAlpha = (1 - d / 120) * .35; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      ctx.globalAlpha = .9; ctx.fillStyle = c1;
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (running && !calm) raf = requestAnimationFrame(draw);
    };
    resize(); draw();
    addEventListener('resize', () => { resize(); if (calm) draw(); });
    cv.parentElement.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    cv.parentElement.addEventListener('pointerleave', () => { mouse = { x: -999, y: -999 }; });
    new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running && !calm) { cancelAnimationFrame(raf); draw(); } }).observe(cv);
    document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running && !calm) { cancelAnimationFrame(raf); draw(); } });
  }

  // decoding headline
  const rot = $('[data-rotate]');
  if (rot && !calm) {
    const words = rot.dataset.rotate.split('|'), glyphs = '<>/\\=+*#01_';
    let i = 0;
    const decode = word => {
      let f = 0; const total = 22;
      const tick = () => {
        f++;
        rot.innerHTML = '<span>' + [...word].map((ch, k) => {
          if (ch === ' ') return ' ';
          return f / total > k / word.length ? ch : `<b class="ch">${glyphs[Math.random() * glyphs.length | 0]}</b>`;
        }).join('') + '</span>';
        if (f < total) requestAnimationFrame(tick);
        else rot.innerHTML = `<span>${word}</span>`;
      };
      tick();
    };
    setInterval(() => { i = (i + 1) % words.length; decode(words[i]); }, 2600);
  }

  // build log filters
  const fbtn = $$('[data-filter]');
  fbtn.forEach(b => b.addEventListener('click', () => {
    fbtn.forEach(x => x.setAttribute('aria-pressed', x === b));
    const f = b.dataset.filter;
    $$('.grid .card').forEach(c => { c.hidden = !(f === 'all' || c.dataset.kind.split(' ').includes(f)); });
  }));

  // holo tilt + hover scroll distance
  $$('.card').forEach(card => {
    const scr = $('.screen', card);
    const setH = () => scr && card.style.setProperty('--screen-h', scr.clientHeight + 'px');
    setH(); addEventListener('resize', setH);
    if (calm || !matchMedia('(pointer:fine)').matches) return;
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--ry', (x - .5) * 10 + 'deg'); card.style.setProperty('--rx', (.5 - y) * 8 + 'deg');
      card.style.setProperty('--mx', x * 100 + '%'); card.style.setProperty('--my', y * 100 + '%');
    });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
  });

  // orbiting stack badges
  $$('.orbit .spin').forEach(ring => {
    const items = $$('span', ring), n = items.length;
    items.forEach((el, k) => { const a = k / n * Math.PI * 2; el.style.left = 50 + Math.cos(a) * 50 + '%'; el.style.top = 50 + Math.sin(a) * 50 + '%'; });
  });

  // launch sequence progress
  const seq = $('.seq');
  if (seq) {
    const stages = $$('.stage', seq);
    const upd = () => {
      const r = seq.getBoundingClientRect(), vh = innerHeight;
      const p = Math.max(0, Math.min(1, (vh * .85 - r.top) / (r.height + vh * .35)));
      seq.style.setProperty('--p', p * 100 + '%');
      stages.forEach((s, k) => s.classList.toggle('lit', p >= k / (stages.length - 1) - .02));
    };
    addEventListener('scroll', upd, { passive: true }); upd();
  }

  // stat counters
  const count = el => {
    const end = +el.dataset.count; if (calm) { el.textContent = end + (el.dataset.suffix || ''); return; }
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + (el.dataset.suffix || ''); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };

  // reveal
  root.classList.add('js');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    $$('[data-count]', e.target).forEach(count);
    io.unobserve(e.target);
  }), { threshold: .14 });
  $$('.rv, .art, .hud').forEach(el => io.observe(el));

  // terminal contact form: composes an email in the visitor's mail app
  const form = $('[data-contact]');
  if (form) {
    const out = $('.out', form);
    const type = async lines => {
      out.innerHTML = '';
      for (const l of lines) { out.innerHTML += l + '\n'; await new Promise(r => setTimeout(r, calm ? 0 : 280)); }
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const d = new FormData(form);
      const needs = d.getAll('need');
      const body = [`Name: ${d.get('name')}`, `Email: ${d.get('email')}`, `Business: ${d.get('business') || '-'}`, `Looking for: ${needs.join(', ') || '-'}`, '', d.get('message') || ''].join('\n');
      await type(['> packaging request…', `> modules: ${needs.join(' + ') || 'tbd'}`, '<b>✓ ready.</b> opening your mail app…']);
      location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent('New project – ' + (d.get('business') || d.get('name')))}&body=${encodeURIComponent(body)}`;
    });
  }

  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();

// pricing page editor demo + contact prefill from ?need=&plan=
(() => {
  const ed = document.querySelector('.editor');
  if (ed) {
    const price = ed.querySelector('[data-price]'), mirror = document.querySelector('[data-mirror]');
    const swaps = [...document.querySelectorAll('.swap')], calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const cycle = async () => {
      ed.classList.add('play');
      for (const v of ['15.9', '15.', '15', '1', '', '1', '16', '16.', '16.4', '16.49']) { price.textContent = v; await wait(110); }
      await wait(900);
      swaps.forEach(s => s.classList.add('swapped'));
      mirror.textContent = '16.49'; mirror.parentElement.classList.add('flash');
      await wait(2600);
      ed.classList.remove('play'); swaps.forEach(s => s.classList.remove('swapped')); mirror.parentElement.classList.remove('flash');
      price.textContent = mirror.textContent = '15.99';
      await wait(1400);
    };
    let running = false;
    new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || running) return;
      running = true;
      if (calm) { ed.classList.add('play'); price.textContent = mirror.textContent = '16.49'; swaps.forEach(s => s.classList.add('swapped')); return; }
      for (;;) await cycle();
    }, { threshold: .4 }).observe(ed);
  }
  const form = document.querySelector('[data-contact]');
  const q = new URLSearchParams(location.search);
  if (form && (q.get('need') || q.get('plan'))) {
    const need = q.get('need');
    form.querySelectorAll('input[name="need"]').forEach(c => { if (c.value === need) c.checked = true; });
    const msg = form.querySelector('textarea[name="message"]');
    const plans = { Basic: 'Launch (Basic, one-time)', Standard: 'Self-Serve (Standard, with my own editor)', Premium: 'Done-For-You (Premium, monthly)' };
    if (plans[q.get('plan')]) msg.value = 'I am interested in the ' + plans[q.get('plan')] + ' website plan.\n\n';
    else if (need && need !== 'Website') msg.value = 'This is what I would like to solve or automate:\n\n';
  }
})();

// email add-on: type through example mailbox names; contact form note for ?addon=email
(() => {
  const box = document.querySelector('[data-mailbox]');
  if (box && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const names = ['contact', 'orders', 'catering', 'hello'];
    let i = 0;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    (async () => {
      for (;;) {
        await wait(2200);
        const cur = names[i]; i = (i + 1) % names.length; const next = names[i];
        for (let k = cur.length; k >= 0; k--) { box.textContent = cur.slice(0, k); await wait(55); }
        for (let k = 1; k <= next.length; k++) { box.textContent = next.slice(0, k); await wait(85); }
      }
    })();
  }
  const form = document.querySelector('[data-contact]');
  if (form && new URLSearchParams(location.search).get('addon') === 'email') {
    const msg = form.querySelector('textarea[name="message"]');
    msg.value = (msg.value ? msg.value.trimEnd() + '\n' : '') + 'I would also like business email set up (contact@mybusiness.ca).\n\n';
    form.querySelectorAll('input[name="need"]').forEach(c => { if (c.value === 'Website') c.checked = true; });
  }
})();

// domain add-on: a looping fake name search; contact form note for ?addon=domain
(() => {
  const name = document.querySelector('[data-domain]');
  if (name && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const res = name.closest('.domain-search').querySelector('.ds-result'), label = res.querySelector('span:last-child');
    const names = ['nameofbusiness', 'yourbakery', 'yourgrill', 'yourcleaning'];
    let i = 0;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    (async () => {
      for (;;) {
        await wait(2400);
        const cur = names[i]; i = (i + 1) % names.length; const next = names[i];
        for (let k = cur.length; k >= 0; k--) { name.textContent = cur.slice(0, k); await wait(40); }
        res.classList.add('checking'); label.innerHTML = '<b>Checking</b> · searching registries…';
        for (let k = 1; k <= next.length; k++) { name.textContent = next.slice(0, k); await wait(80); }
        await wait(700);
        res.classList.remove('checking'); label.innerHTML = '<b>Available</b> · ready to register';
      }
    })();
  }
  const form = document.querySelector('[data-contact]');
  if (form && new URLSearchParams(location.search).get('addon') === 'domain') {
    const msg = form.querySelector('textarea[name="message"]');
    msg.value = (msg.value ? msg.value.trimEnd() + '\n' : '') + 'I do not have a domain yet. Please handle the purchase and setup.\n\n';
    form.querySelectorAll('input[name="need"]').forEach(c => { if (c.value === 'Website') c.checked = true; });
  }
})();

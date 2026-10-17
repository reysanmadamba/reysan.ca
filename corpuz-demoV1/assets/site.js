// Shared behaviour for both Corpuz demo sites.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = v => '$' + v.toFixed(2);

  // mobile nav
  const toggle = $('[data-nav-toggle]'), nav = $('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
      document.body.classList.toggle('nav-open', open);
    });
  }

  // open / closed, in Edmonton time. Tue-Sun 10:00-18:00, closed Monday.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Edmonton', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const dayIdx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const mins = +parts.hour * 60 + +parts.minute;
  const openDay = dayIdx !== 0;
  const isOpen = openDay && mins >= 600 && mins < 1080;
  let status;
  if (isOpen) status = 'Open now · until 6 PM';
  else if (openDay && mins < 600) status = 'Opens today at 10 AM';
  else status = dayIdx === 0 || dayIdx === 6 && mins >= 1080 ? 'Closed · opens Tuesday 10 AM' : 'Closed · opens tomorrow 10 AM';
  $$('[data-open-status]').forEach(el => { el.textContent = status; el.classList.add(isOpen ? 'is-open' : 'is-closed'); });
  $$(`[data-day="${dayIdx}"]`).forEach(el => el.classList.add('today'));

  // menu filters
  const filters = $$('[data-filter]');
  filters.forEach(b => b.addEventListener('click', () => {
    filters.forEach(x => x.setAttribute('aria-pressed', x === b));
    const f = b.dataset.filter;
    $$('[data-family]').forEach(el => { el.hidden = !(f === 'all' || el.dataset.family === f); });
  }));

  // build-a-box pre-order
  const box = $('[data-box]');
  if (box) {
    const state = { size: 6, items: [] };
    const slots = $('[data-box-slots]', box), total = $('[data-box-total]', box), note = $('[data-box-note]', box);
    const count = $('[data-box-count]', box), sms = $('[data-box-sms]', box), copy = $('[data-box-copy]', box);
    const nameIn = $('[data-box-name]', box), dateIn = $('[data-box-date]', box);
    if (dateIn) {
      const t = new Date(); t.setDate(t.getDate() + 1);
      dateIn.min = t.toISOString().slice(0, 10);
    }
    const summary = () => {
      const lines = state.items.map(i => i.name);
      const when = dateIn && dateIn.value ? new Date(dateIn.value + 'T12:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) : '(date)';
      const who = nameIn && nameIn.value.trim() ? nameIn.value.trim() : '(name)';
      return `Hi Corpuz! I'd like to pre-order a ${state.size}-piece box for pickup on ${when}:\n- ${lines.join('\n- ')}\nName: ${who}`;
    };
    const render = () => {
      slots.style.setProperty('--cols', state.size === 6 ? 3 : 4);
      slots.innerHTML = '';
      for (let i = 0; i < state.size; i++) {
        const it = state.items[i];
        const el = document.createElement(it ? 'button' : 'span');
        el.className = 'slot' + (it ? ' filled' : '');
        if (it) {
          el.type = 'button';
          el.style.setProperty('--fill', it.color);
          el.innerHTML = `<i aria-hidden="true"></i><span>${it.name}</span>`;
          el.setAttribute('aria-label', `Remove ${it.name}`);
          el.addEventListener('click', () => { state.items.splice(i, 1); render(); });
        } else el.innerHTML = `<i aria-hidden="true"></i><span>${i + 1}</span>`;
        slots.appendChild(el);
      }
      const n = state.items.length, unique = new Set(state.items.map(i => i.id)).size;
      const sum = state.items.reduce((a, i) => a + i.price, 0);
      count.textContent = `${n} of ${state.size}`;
      $$('[data-box-chip]').forEach(el => { el.textContent = `${n}/${state.size}`; });
      if (n === state.size && unique === n) {
        total.textContent = state.size === 6 ? '$27.80 + tax' : '$54.00';
        note.textContent = state.size === 6 ? 'Assorted box price: six different flavours.' : 'Assorted box price: twelve different flavours, no tax.';
      } else {
        total.textContent = n ? money(sum) : '$0.00';
        note.textContent = n < state.size ? `Add ${state.size - n} more to fill the box.` : 'Repeated flavours are charged per piece.';
        if (n === state.size && unique < n) note.textContent = 'Repeated flavours are charged per piece.';
      }
      const ready = n === state.size;
      sms.setAttribute('aria-disabled', !ready);
      sms.href = ready ? `sms:${box.dataset.tel}?&body=${encodeURIComponent(summary())}` : '#';
      $$('[data-add]').forEach(b => b.classList.toggle('in-box', state.items.some(i => i.id === b.dataset.id)));
    };
    $$('[data-box-size]').forEach(b => b.addEventListener('click', () => {
      state.size = +b.dataset.boxSize;
      state.items = state.items.slice(0, state.size);
      $$('[data-box-size]').forEach(x => x.setAttribute('aria-pressed', x === b));
      render();
    }));
    $$('[data-add]').forEach(b => b.addEventListener('click', () => {
      if (state.items.length >= state.size) { note.textContent = 'Your box is full. Tap a donut in the box to swap it out.'; box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); return; }
      state.items.push({ id: b.dataset.id, name: b.dataset.name, price: +b.dataset.price, color: b.dataset.color });
      render();
    }));
    $('[data-box-clear]', box).addEventListener('click', () => { state.items = []; render(); });
    sms.addEventListener('click', e => { if (sms.getAttribute('aria-disabled') === 'true') { e.preventDefault(); note.textContent = `Fill all ${state.size} spots first.`; } });
    if (copy) copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(summary()); copy.textContent = 'Copied!'; }
      catch { copy.textContent = 'Copy failed'; }
      setTimeout(() => { copy.textContent = 'Copy order'; }, 1800);
    });
    [nameIn, dateIn].forEach(el => el && el.addEventListener('input', render));
    render();
  }

  // investment inquiry: composes an email in the visitor's own mail app
  const form = $('[data-invest]');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    const body = ['Name: ' + d.get('name'), 'Email: ' + d.get('email'), 'Phone: ' + (d.get('phone') || '-'),
      'City / area of interest: ' + (d.get('city') || '-'), 'Investment range: ' + d.get('range'), '', d.get('message') || ''].join('\n');
    location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent('Investment partnership inquiry – ' + d.get('name'))}&body=${encodeURIComponent(body)}`;
    const done = $('[data-invest-done]');
    if (done) done.hidden = false;
  });

  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  $$('.reveal').forEach(el => io.observe(el));
})();

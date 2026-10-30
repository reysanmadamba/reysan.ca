// Receipt Parser trial: capture receipts from an email window, read them with
// Claude (via the reysan-ca-backend function), flag anything that needs fixing.
// Everything lives in memory in this tab; nothing is stored server-side.

const DEFAULT_API = 'https://reysan-ca-backend-77ah.vercel.app/api/receipt-extract';
const MAX_LONG_EDGE = 2000;           // px; plenty for receipt text, keeps uploads small
const MAX_PDF_BYTES = 3 * 1024 * 1024; // Vercel's 4.5 MB body limit, after base64
const LOW_CONFIDENCE = 0.7;
const DOUBLE_CHARGE_MINUTES = 30;
const MOTION_GAP_MS = 250;
const MOVING_SHARE = 0.01;

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = {
  items: [],
  nextId: 1,
  stream: null,
  track: null,
  grabber: null,
  video: null,
  pip: null,
  target: null,      // { id, mode: 'append' | 'replace' } for the next capture
  lastSig: null,
  replaceId: null,   // upload row waiting for a replacement file
  crop: store.get('rp.crop'),
  code: store.get('rp.code', ''),
  demoTick: 0,
  undo: null,
  grabbing: false,   // between the two frames of the moving-email check
  moving: null,      // { mode } when the last capture was refused because the email was moving
  adding: null,      // { id, field, value, error } or { id, more: true } for the + buttons in the box
  tab: 'all',        // which list shows: 'all', 'review' or 'refund'
};
const API = store.get('rp.api', DEFAULT_API);

const $ = (sel, root = document) => root.querySelector(sel);
const boxEl = $('#box');
const heroEl = $('.hero');

const ICON = {
  check: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8 5.7-5.8"/></svg>',
  warn: '<svg class="i" viewBox="0 0 24 24"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/></svg>',
  error: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  camera: '<svg class="i" viewBox="0 0 24 24"><path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  plus: '<svg class="i" viewBox="0 0 24 24"><path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 10v5M9.5 12.5h5"/></svg>',
  file: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

// ---------- small helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cents = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function money(c, cur) {
  if (c === null || c === undefined) return '—';
  try { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: cur || 'CAD' }).format(c / 100); }
  catch { return `${(c / 100).toFixed(2)} ${cur || ''}`.trim(); }
}
function shortDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return s || '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return dt.toLocaleDateString('en-CA', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// "STAPLES #2045", "Staples Inc." -> "staples"
function normVendor(v) {
  return String(v || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/\b(store|location|branch|unit)\s*#?\s*\d+\b/g, ' ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|ulc|the)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function toast(msg, undoFn) {
  const hosts = [$('#toast')];
  // The floating window has its own copy, since the page may be hidden behind Outlook.
  if (S.pip) {
    let el = S.pip.document.getElementById('pipToast');
    if (!el) {
      el = S.pip.document.createElement('div');
      el.id = 'pipToast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      S.pip.document.body.append(el);
    }
    hosts.push(el);
  }
  const hide = () => hosts.forEach((t) => { t.hidden = true; });
  hosts.forEach((t) => {
    t.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button type="button">Undo</button>' : ''}`;
    t.hidden = false;
    if (undoFn) t.querySelector('button').onclick = () => { undoFn(); hide(); };
  });
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hide, undoFn ? 7000 : 4500);
}

const label = (it) => {
  const x = it.extraction;
  const parts = [x?.vendor || it.name || (it.source === 'capture' ? `Capture ${it.n}` : 'Receipt')];
  if (x?.date) parts.push(shortDate(x.date));
  return parts.join(' · ');
};

// ---------- checks (all math in code, never by the model) ----------

function assess(it) {
  const issues = [];
  let action = it.source === 'capture' ? 'replace' : 'file';
  const x = it.extraction;

  if (it.status === 'error') {
    return finish(it, [{ level: 'red', text: it.error || "Couldn't read this one" }], 'retry');
  }
  if (it.local) return finish(it, [{ level: 'red', text: it.local.title, detail: it.local.detail }], it.local.action);
  if (!x) return finish(it, [], null);

  if (!it.reviewed) {
    if (!x.is_receipt) {
      issues.push({ level: 'red', text: "This doesn't look like a receipt", detail: x.notes || 'Open the receipt email and capture it again.' });
    } else if (x.image_quality !== 'clear') {
      issues.push({ level: 'red', text: `Too ${x.image_quality === 'dark' ? 'dark' : 'blurry'} to read reliably`, detail: 'Zoom the email in a bit, then recapture.' });
    } else if ((x.cut_off && !it.manual?.includes('total')) || x.total === null) {
      action = it.source === 'capture' ? 'append' : 'file';
      issues.push({
        level: 'red',
        text: x.total === null ? "Can't see the total" : 'Part of the receipt is cut off',
        detail: (x.cut_off_detail ? `${x.cut_off_detail} ` : '') + (it.source === 'capture' ? 'Scroll down in the email, then capture the rest.' : 'Try the full PDF, or enter the total.'),
      });
    }
  }
  if (it.keep && issues.some((i) => i.level === 'red')) {
    issues.forEach((i) => { if (i.level === 'red') { i.level = 'yellow'; i.text = `Kept as is: ${i.text.toLowerCase()}`; } });
  }

  if (x.is_receipt || it.reviewed) {
    if (x.receipt_count > 1) issues.push({ level: 'yellow', text: `Shows ${x.receipt_count} receipts; only the first was read. Capture each one on its own.` });

    // Before review a missing total is already a red "can't see the total".
    const required = it.reviewed ? ['vendor', 'date', 'subtotal', 'total', 'currency'] : ['vendor', 'date', 'subtotal', 'currency'];
    const missing = required.filter((f) => x[f] === null || x[f] === '');
    if (missing.length) issues.push({ level: 'yellow', text: `Missing ${missing.join(', ')}` });

    const sub = cents(x.subtotal);
    const total = cents(x.total);
    if (sub !== null && total !== null) {
      const extra = [x.gst, x.pst, x.hst, x.other_tax, x.tip].reduce((s, v) => s + (cents(v) ?? 0), 0);
      const diff = total - (sub + extra);
      if (Math.abs(diff) > 1) {
        issues.push({ level: 'yellow', text: `Doesn't add up: subtotal + tax + tip = ${money(sub + extra, x.currency)}, but the total says ${money(total, x.currency)}` });
      }
    }
    if (sub > 0) {
      for (const [field, max, name] of [['gst', 0.05, 'GST'], ['hst', 0.15, 'HST'], ['pst', 0.1, 'PST']]) {
        const t = cents(x[field]);
        if (t !== null && t > Math.round(sub * max) + 2) {
          issues.push({ level: 'yellow', text: `${name} is ${((t / sub) * 100).toFixed(1)}% of the subtotal, higher than any province charges` });
        }
      }
      if (cents(x.gst) > 0 && cents(x.hst) > 0) issues.push({ level: 'yellow', text: 'Has both GST and HST, which is unusual' });
    }
    if (x.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) issues.push({ level: 'yellow', text: `Date "${x.date}" isn't a full date` });
      else if (x.date > today()) issues.push({ level: 'yellow', text: 'Date is in the future' });
      else if (!it.reviewed && x.date_ambiguous && swappedDate(x.date) && swappedDate(x.date) <= today()) {
        issues.push({ level: 'yellow', text: `Date could be ${shortDate(x.date)} or ${shortDate(swappedDate(x.date))}. Check the receipt.` });
      }
    }
    if (!it.reviewed && x.confidence < LOW_CONFIDENCE) issues.push({ level: 'yellow', text: 'Low confidence. Double-check the numbers.' });
    if (it.chargeOf) {
      const other = S.items.find((o) => o.id === it.chargeOf);
      if (other) {
        const gap = Math.abs(paidAt(x) - paidAt(other.extraction));
        const apart = gap === 0 ? 'at the same time' : `${gap} minute${gap === 1 ? '' : 's'} apart`;
        issues.unshift({ level: 'yellow', text: `Same amount as ${other.extraction.vendor || 'another receipt'} at ${clockTime(other.extraction.time)}, ${apart}. Is this really a second purchase? If not, ask for a refund`, dup: true, charge: true });
      }
    } else if (it.dupOf) {
      const other = S.items.find((o) => o.id === it.dupOf);
      if (other) {
        const dateNote = other.extraction.date === x.date ? '' : `, but the dates were read differently (${shortDate(x.date)} and ${shortDate(other.extraction.date)}). Check which is right`;
        issues.push({ level: 'yellow', text: `Looks like the same receipt as ${label(other)}${dateNote}`, dup: true });
      }
    }
  }
  if (it.followUp && !issues.length) issues.push({ level: 'yellow', text: 'Flagged by you' });
  return finish(it, issues, action);
}

function finish(it, issues, action) {
  it.issues = issues;
  it.action = action;
  it.level = it.status === 'reading' ? null : issues.some((i) => i.level === 'red') ? 'red' : issues.length ? 'yellow' : 'green';
  return it;
}

// 2026-03-05 and 2026-05-03 can be the same printed date (03/05/2026) read two ways.
function swappedDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m || +m[3] > 12 || m[2] === m[3]) return null;
  return `${m[1]}-${m[3]}-${m[2]}`;
}

// Minutes since the epoch, so a pair just before and after midnight still compares.
function paidAt(x) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x?.date || '') || !/^\d{2}:\d{2}$/.test(x?.time || '')) return null;
  const [y, m, d] = x.date.split('-').map(Number);
  const [h, min] = x.time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min) / 60000;
}

function clockTime(t) {
  const [h, m] = String(t || '').split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function findDuplicates() {
  const seen = [];
  for (const it of [...S.items].sort((a, b) => a.id - b.id)) {
    it.dupOf = null;
    it.chargeOf = null;
    const x = it.extraction;
    if (!x?.is_receipt) continue;
    const v = normVendor(x.vendor);
    const t = cents(x.total);
    if (!v || !x.date || t === null) continue;
    const rn = String(x.receipt_number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const swapped = swappedDate(x.date);
    const at = paidAt(x);
    // Same receipt number means the same receipt; otherwise two payments minutes apart may be a double charge.
    const charge = at === null ? null : seen.find((s) => s.v === v && s.t === t && s.at !== null
      && Math.abs(s.at - at) <= DOUBLE_CHARGE_MINUTES && !(s.rn && s.rn === rn) && (s.at !== at || (s.rn && rn)));
    const hit = seen.find((s) => s.v === v && (s.date === x.date || s.date === swapped) && s.t === t && (!s.rn || !rn || s.rn === rn));
    if (!it.dupOk) {
      if (charge) it.chargeOf = charge.id;
      else if (hit) it.dupOf = hit.id;
    }
    seen.push({ id: it.id, v, date: x.date, t, rn, at });
  }
}

function reassessAll() {
  findDuplicates();
  S.items.forEach(assess);
}

// ---------- screen capture ----------

async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Capturing needs Edge or Chrome on a computer. You can still drop PDFs below.');
    return false;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'window', frameRate: 5, cursor: 'never' },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (e) {
    if (e.name !== 'NotAllowedError') toast(`Couldn't start capturing: ${e.message}`);
    return false;
  }
  S.stream = stream;
  S.track = stream.getVideoTracks()[0];
  S.track.addEventListener('ended', () => stopCapture(true));
  S.grabber = 'ImageCapture' in window ? new ImageCapture(S.track) : null;
  S.video = document.createElement('video');
  Object.assign(S.video, { muted: true, playsInline: true, srcObject: stream });
  S.video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
  document.body.append(S.video);
  S.video.play().catch(() => {});
  render();
  await openPip();
  return true;
}

function stopCapture(fromBrowser = false) {
  S.stream?.getTracks().forEach((t) => t.stop());
  S.video?.remove();
  Object.assign(S, { stream: null, track: null, grabber: null, video: null, target: null });
  if (S.pip) S.pip.close();
  if (fromBrowser) toast('Capturing stopped.');
  render();
}

async function openPip() {
  if (!('documentPictureInPicture' in window)) {
    $('#pipBtn').hidden = true;
    toast("This browser can't float the box. Put this window next to Outlook and use the box on this page.");
    return false;
  }
  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 340, height: 380 });
    for (const sheet of document.styleSheets) {
      try {
        const style = pip.document.createElement('style');
        style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
        pip.document.head.append(style);
      } catch {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.append(link);
      }
    }
    pip.document.title = 'Receipt capture';
    pip.document.body.classList.add('pip');
    pip.document.body.append(boxEl);
    pip.addEventListener('pagehide', () => {
      heroEl.append(boxEl);
      S.pip = null;
      render();
    });
    S.pip = pip;
    $('#pipBtn').hidden = true;
    render();
    return true;
  } catch {
    // Needs a fresh click: the share dialog can use up the browser's "user clicked" allowance.
    $('#pipBtn').hidden = false;
    render();
    return false;
  }
}

async function grabBitmap() {
  if (S.grabber) {
    try { return await S.grabber.grabFrame(); } catch { /* fall back to the video element */ }
  }
  if (!S.video.videoWidth) await new Promise((r) => setTimeout(r, 400));
  return createImageBitmap(S.video);
}

// Crops (if set), scales and encodes a frame. Also returns a 64x64 grey
// signature for the instant blank / same-as-last checks.
function encodeFrame(src, w, h, crop) {
  let sx = 0, sy = 0, sw = w, sh = h;
  if (crop) {
    sx = Math.round(crop.x * w); sy = Math.round(crop.y * h);
    sw = Math.max(1, Math.round(crop.w * w)); sh = Math.max(1, Math.round(crop.h * h));
  }
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(sw, sh));
  const cw = Math.round(sw * scale), ch = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);

  let dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  if (dataUrl.length > 1_300_000) dataUrl = canvas.toDataURL('image/jpeg', 0.75);

  // 256px is fine enough that two emails differing only in a few digits don't look identical.
  const SIG = 256;
  const small = document.createElement('canvas');
  small.width = SIG; small.height = SIG;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, SIG, SIG);
  const px = sctx.getImageData(0, 0, SIG, SIG).data;
  const grey = new Uint8ClampedArray(SIG * SIG);
  let sum = 0;
  for (let i = 0; i < grey.length; i++) { grey[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += grey[i]; }
  const mean = sum / grey.length;
  let v = 0;
  for (const g of grey) v += (g - mean) ** 2;

  return {
    media_type: 'image/jpeg',
    dataUrl,
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    w: cw, h: ch,
    sig: { grey, std: Math.sqrt(v / grey.length) },
  };
}

// Same email captured twice: practically every pixel matches. A false "same" would
// block a real receipt, so this only fires on near-identical frames; true repeats
// that slip through are still caught by the vendor/date/total duplicate check.
function changedShare(a, b) {
  if (a.grey.length !== b.grey.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.grey.length; i++) if (Math.abs(a.grey[i] - b.grey[i]) > 32) changed++;
  return changed / a.grey.length;
}

const sameImage = (a, b) => changedShare(a, b) < 0.0005;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isBusy = () => S.grabbing || S.items.some((i) => i.source === 'capture' && i.status === 'reading');

// We can't see scrolling in another app, so two frames a moment apart stand in for it.
async function grabStill(force) {
  const first = await grabBitmap();
  const img = encodeFrame(first, first.width, first.height, S.crop);
  first.close?.();
  if (force) return img;
  await wait(MOTION_GAP_MS);
  // A window with nothing changing may not send a new frame at all, which also means it's still.
  const second = await Promise.race([grabBitmap(), wait(700)]);
  if (!second) return img;
  const later = encodeFrame(second, second.width, second.height, S.crop);
  second.close?.();
  return changedShare(img.sig, later.sig) > MOVING_SHARE ? null : later;
}

async function capture(mode, force) {
  if (!S.stream) { await startCapture(); return; }
  if (isBusy()) return;
  S.grabbing = true;
  S.moving = null;
  S.adding = null;
  render();
  let img;
  try { img = await grabStill(force); }
  catch { S.grabbing = false; render(); toast("Couldn't grab the window. Is it minimized?"); return; }
  S.grabbing = false;
  if (!img) {
    S.moving = { mode: mode || null };
    render();
    return;
  }

  // Recapture: the next capture goes to the row being fixed.
  const target = mode ? { id: mode.id, mode: mode.mode } : S.target;
  S.target = null;
  if (target) {
    const it = S.items.find((i) => i.id === target.id);
    if (it) {
      it.snapshot = { images: it.images, extraction: it.extraction };
      it.images = target.mode === 'append' ? [...it.images, img] : [img];
      it.keep = false;
      it.local = null;
      S.lastSig = img.sig;
      return read(it);
    }
  }

  const it = addItem('capture', [img]);
  if (img.w < 300 || img.h < 150) {
    setLocal(it, 'Capture is too small', 'Make the Outlook window bigger, or redo the crop area.', 'replace');
  } else if (img.sig.std < 3) {
    setLocal(it, 'Capture looks blank', 'Is Outlook minimized? Restore the window, then recapture.', 'replace');
  } else if (S.lastSig && sameImage(img.sig, S.lastSig)) {
    setLocal(it, 'Same as your last capture', 'Did you click the next email first?', 'same');
  } else {
    S.lastSig = img.sig;
    read(it);
  }
  S.lastSig = img.sig;
}

function setLocal(it, title, detail, action) {
  it.status = 'local';
  it.local = { title, detail, action };
  assess(it);
  render();
}

function addItem(source, images, name) {
  const it = { id: S.nextId++, n: S.items.filter((i) => i.source === source).length + 1, source, name, images, status: 'reading', createdAt: Date.now() };
  S.items.push(it);
  return it;
}

// Clicking Capture again after a red cut-off is a retry, not a second receipt:
// a complete capture of the same receipt takes the cut-off row's place.
function replaceCutOff(it) {
  const x = it.extraction;
  if (it.source !== 'capture' || !x.is_receipt || x.cut_off || x.total === null || x.image_quality !== 'clear') return;
  const v = normVendor(x.vendor);
  if (!v) return;
  const number = (r) => String(r.receipt_number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const previous = S.items.filter((o) => o.source === 'capture' && o.id < it.id).sort((a, b) => b.id - a.id)[0];
  const old = S.items.find((o) => {
    const y = o.extraction;
    if (o.source !== 'capture' || o.id >= it.id || o.level !== 'red' || !y?.is_receipt || !(y.cut_off || y.total === null)) return false;
    if (normVendor(y.vendor) !== v) return false;
    if (y.date && y.date !== x.date && y.date !== swappedDate(x.date)) return false;
    if (number(y) && number(x) && number(y) !== number(x)) return false;
    // With no total to compare, only the capture right before this one counts.
    return y.total === null ? o === previous : cents(y.total) === cents(x.total);
  });
  if (!old) return;
  const idx = S.items.indexOf(old);
  S.items.splice(idx, 1);
  toast('Replaced the cut-off capture with this one.', () => {
    S.items.splice(Math.min(idx, S.items.length), 0, old);
    reassessAll();
    render();
  });
}

// ---------- reading (Claude via backend, or demo data) ----------

async function read(it) {
  it.status = 'reading';
  it.error = null;
  assess(it);
  render();
  try {
    const result = S.code ? await callApi(it) : await mockExtract(it);
    it.extraction = result.extraction;
    it.manual = null;
    it.ms = result.ms;
    it.model = result.model;
    it.status = 'done';
    it.snapshot = null;
    replaceCutOff(it);
  } catch (e) {
    if (it.snapshot?.extraction) {
      // A failed recapture never loses the first one.
      it.images = it.snapshot.images;
      it.extraction = it.snapshot.extraction;
      it.status = 'done';
      it.snapshot = null;
      toast(`The recapture couldn't be read (${e.message}). Kept the first one.`);
    } else {
      it.status = 'error';
      it.error = e.message;
    }
  }
  reassessAll();
  render();
}

async function callApi(it) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70_000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: S.code, today: today(), files: it.images.map((i) => ({ media_type: i.media_type, data: i.data })) }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { $('#codeInput').focus(); throw new Error('Wrong access code'); }
    if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
    return body;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Took too long, try again');
    if (e instanceof TypeError) throw new Error("Couldn't reach the reader. Check your connection");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Demo mode: sample results so anyone can try the flow without an access code.
// The scenarios walk through green, cut-off, duplicate, math, not-a-receipt, double charge and a missing subtotal.
const BLANK = {
  is_receipt: true, vendor: null, date: null, receipt_number: null, subtotal: null, gst: null, pst: null, hst: null,
  other_tax: null, tip: null, total: null, currency: 'CAD', payment_method: 'credit_card', category: null,
  image_quality: 'clear', cut_off: false, cut_off_detail: null, receipt_count: 1, email_sender: null,
  email_subject: null, email_date: null, confidence: 0.95, notes: null, time: null, date_ambiguous: false,
};
const DEMO = [
  () => ({ vendor: 'Staples #2045', date: daysAgo(3), receipt_number: '2045-118832', subtotal: 43.04, gst: 2.15, pst: 3.01, total: 48.2, category: 'office_supplies', email_sender: 'Staples Canada', email_subject: 'Your Staples receipt' }),
  () => ({ vendor: 'Air Canada', date: daysAgo(6), receipt_number: 'AC7Q2K', subtotal: 398.15, gst: 14.6, total: 412.75, category: 'travel', email_sender: 'Air Canada', email_subject: 'Your booking receipt: Calgary to Toronto' }),
  () => ({ vendor: 'Uber', date: daysAgo(12), subtotal: 23.4, gst: 1.17, total: null, category: 'travel', cut_off: true, cut_off_detail: 'The total and payment lines are below the bottom edge.', email_sender: 'Uber Receipts', email_subject: 'Your Tuesday evening trip with Uber', confidence: 0.8 }),
  () => ({ vendor: 'Staples #2045', date: daysAgo(3), receipt_number: '2045-118832', subtotal: 43.04, gst: 2.15, pst: 3.01, total: 48.2, category: 'office_supplies', email_sender: 'Staples Canada', email_subject: 'Fwd: Your Staples receipt' }),
  () => ({ vendor: 'Tim Hortons', date: daysAgo(2), subtotal: 12.5, gst: 0.63, total: 13.4, category: 'meals', payment_method: 'debit', confidence: 0.86 }),
  () => ({ is_receipt: false, vendor: 'Best Buy', category: null, currency: null, notes: 'This is a promotional newsletter, not a receipt.', email_sender: 'Best Buy', email_subject: 'Fall deals end Sunday' }),
  () => ({ vendor: 'The Keg Steakhouse', date: daysAgo(9), subtotal: 86.0, gst: 4.3, tip: 15.48, total: 105.78, category: 'meals' }),
  () => ({ vendor: 'Amazon.ca', date: daysAgo(1), time: '14:12', receipt_number: '702-118', subtotal: 59.99, gst: 3.0, total: 62.99, category: 'office_supplies' }),
  () => ({ vendor: 'Amazon.ca', date: daysAgo(1), time: '14:31', receipt_number: '702-204', subtotal: 59.99, gst: 3.0, total: 62.99, category: 'office_supplies' }),
  () => ({ vendor: 'Petro-Canada', date: daysAgo(4), gst: 2.86, total: 60.06, category: 'fuel', payment_method: 'debit' }),
  () => ({ vendor: 'Shell', date: daysAgo(1), subtotal: 61.9, gst: 3.1, total: 65.0, category: 'fuel', payment_method: 'credit_card' }),
];

async function mockExtract(it) {
  await new Promise((r) => setTimeout(r, 1400 + Math.random() * 1400));
  if (it.images.length > 1 && it.extraction?.vendor === 'Uber') {
    return { extraction: { ...it.extraction, total: 27.92, tip: 3.35, cut_off: false, cut_off_detail: null, confidence: 0.94 }, ms: 2100 };
  }
  if (it.snapshot && it.extraction) {
    return { extraction: { ...it.extraction, cut_off: false, image_quality: 'clear', is_receipt: true, total: it.extraction.total ?? 19.95 }, ms: 1900 };
  }
  const make = DEMO[S.demoTick++ % DEMO.length];
  return { extraction: { ...BLANK, ...make() }, ms: 1800, model: 'demo' };
}

// ---------- uploads and drag-in ----------

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

async function imageFileToCapture(file) {
  const bitmap = await createImageBitmap(file);
  const img = encodeFrame(bitmap, bitmap.width, bitmap.height, null);
  bitmap.close?.();
  return img;
}

async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const names = files.map((f) => `${f.name} (${f.type || 'unknown type'})`);
  toast(`Got ${files.length} file${files.length > 1 ? 's' : ''}: ${names.join(', ')}`);

  if (S.replaceId) {
    const it = S.items.find((i) => i.id === S.replaceId);
    S.replaceId = null;
    if (it && files[0]) {
      const part = await fileToPart(files[0]);
      if (part.error) return toast(part.error);
      it.snapshot = { images: it.images, extraction: it.extraction };
      it.images = [part];
      it.name = files[0].name;
      it.local = null;
      it.keep = false;
      return read(it);
    }
  }

  for (const f of files) {
    const part = await fileToPart(f);
    const it = addItem('upload', part.error ? [] : [part], f.name);
    if (part.error) setLocal(it, part.error, part.detail, 'file');
    else read(it);
  }
  render();
}

async function fileToPart(f) {
  const name = f.name.toLowerCase();
  if (f.type === 'application/pdf' || name.endsWith('.pdf')) {
    if (f.size > MAX_PDF_BYTES) return { error: 'PDF is too large for the trial (3 MB max)', detail: 'Capture it from the screen instead.' };
    const dataUrl = await readAsDataUrl(f);
    return { media_type: 'application/pdf', pdf: true, dataUrl, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  }
  if (f.type.startsWith('image/')) {
    try { return await imageFileToCapture(f); } catch { return { error: "Couldn't open that image", detail: 'Try a JPG or PNG.' }; }
  }
  if (name.endsWith('.msg') || name.endsWith('.eml')) {
    return { error: "Email files can't be read in the trial yet", detail: 'Open the email and drag the PDF attachment instead, or capture it.' };
  }
  return { error: `Can't read ${f.type || 'this kind of file'}`, detail: 'Drop a PDF or an image of the receipt.' };
}

// ---------- actions ----------

function removeItem(id) {
  const idx = S.items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [it] = S.items.splice(idx, 1);
  reassessAll();
  render();
  toast('Receipt deleted.', () => {
    S.items.splice(Math.min(idx, S.items.length), 0, it);
    reassessAll();
    render();
  });
}

function startFix(it) {
  if (it.source !== 'capture') {
    S.replaceId = it.id;
    $('#fileInput').click();
    return;
  }
  S.target = { id: it.id, mode: it.action === 'append' ? 'append' : 'replace' };
  render();
  if (!S.stream) startCapture();
  else toast(`Go to that email in Outlook, then click Capture in the box. It'll go to ${label(it)}.`);
}

function saveAdded() {
  const a = S.adding;
  const it = S.items.find((i) => i.id === a?.id);
  if (!it?.extraction) { S.adding = null; return render(); }
  const type = FIELDS.find(([f]) => f === a.field)?.[2];
  const raw = String(a.value ?? '').trim();
  let value = raw;
  let error = '';
  if (type === 'num') {
    value = Number(raw.replace(/[$,\s]/g, ''));
    if (raw === '' || !Number.isFinite(value) || value < 0) error = 'Type an amount, like 43.04';
  } else if (a.field === 'currency') {
    value = raw.toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) error = 'Use a 3-letter code like CAD or USD';
  } else if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    error = 'Pick the date';
  } else if (type === 'time' && !/^\d{2}:\d{2}$/.test(raw)) {
    error = 'Pick the time';
  } else if (raw === '') {
    error = 'Type something first';
  }
  if (error) { a.error = error; return render(); }
  it.extraction[a.field] = value;
  it.manual = [...new Set([...(it.manual || []), a.field])];
  S.adding = null;
  reassessAll();
  render();
}

function onAction(act, id, field) {
  const it = S.items.find((i) => i.id === id);
  switch (act) {
    case 'capture': return capture();
    case 'capture-anyway': return capture(S.moving?.mode || undefined, true);
    case 'add': S.adding = { id, field, value: '' }; return render();
    case 'add-more': S.adding = { id, more: true }; return render();
    case 'add-cancel': S.adding = null; return render();
    case 'add-save': return saveAdded();
    case 'not-dup':
      if (!it) return;
      it.dupOk = true; it.followUp = null; reassessAll(); return render();
    case 'follow':
      if (!it) return;
      it.followUp = field || null;
      assess(it);
      render();
      return field && toast(`Saved to the ${FOLLOW_UP[field]} tab.`);
    case 'tab': S.tab = field; return render();
    case 'start': return startCapture();
    case 'stop': return stopCapture();
    case 'crop': return openCrop();
    case 'pip': return openPip();
    case 'append': return it && capture({ id: it.id, mode: 'append' });
    case 'replace': return it && capture({ id: it.id, mode: 'replace' });
    case 'fix': return it && startFix(it);
    case 'retry': return it && read(it);
    case 'cancel-target': S.target = null; return render();
    case 'keep':
      if (!it) return;
      if (it.local?.action === 'same') { it.local = null; return read(it); }
      it.keep = true; assess(it); return render();
    case 'delete':
    case 'trash': return it && removeItem(it.id);
    case 'open': return it && openDetail(it, field);
    default: return undefined;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || boxEl.contains(el)) return;
  e.stopPropagation();
  onAction(el.dataset.act, Number(el.dataset.id), el.dataset.field);
});
// The box may live in the floating window's document, so it gets its own listener.
boxEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el) onAction(el.dataset.act, Number(el.dataset.id), el.dataset.field);
});
boxEl.addEventListener('input', (e) => {
  if (S.adding && e.target.matches('[data-add-input]')) { S.adding.value = e.target.value; S.adding.error = ''; }
});
boxEl.addEventListener('keydown', (e) => {
  if (!e.target.matches('[data-add-input]')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveAdded(); }
  if (e.key === 'Escape') { S.adding = null; render(); }
});

// ---------- rendering ----------

function statusIcon(it) {
  if (it.status === 'reading') return '<span class="spin" aria-label="Reading"></span>';
  return it.level === 'green' ? ICON.check : it.level === 'yellow' ? ICON.warn : ICON.error;
}

const sourceLabel = (it) => `${it.source === 'capture' ? 'Scan' : 'Upload'}${it.manual?.length ? ' + manual input' : ''}`;

const fieldName = (f) => FIELDS.find(([k]) => k === f)?.[1] || titleCase(f);

// Fields a person can still fill in, the ones the checks want first.
function missingFields(it) {
  const x = it.extraction;
  if (!x || (!x.is_receipt && !it.reviewed)) return [];
  return ['vendor', 'date', 'subtotal', 'total', 'currency'].filter((f) => x[f] === null || x[f] === undefined || x[f] === '');
}

function otherEmptyFields(it) {
  const x = it.extraction;
  if (!x || (!x.is_receipt && !it.reviewed)) return [];
  const missing = missingFields(it);
  return FIELDS.map(([f]) => f).filter((f) => !missing.includes(f) && (x[f] === null || x[f] === undefined || x[f] === ''));
}

// The + buttons in the floating box, so a missing value can be typed while the email is open.
function addControls(it) {
  const a = S.adding?.id === it.id ? S.adding : null;
  if (a?.field) {
    const type = FIELDS.find(([f]) => f === a.field)?.[2];
    const inputType = type === 'num' ? 'text' : type;
    return `<div class="add-field"><label>${esc(fieldName(a.field))}
        <input data-add-input type="${inputType}" ${type === 'num' ? 'inputmode="decimal" placeholder="0.00"' : ''} value="${esc(a.value || '')}"></label>
      ${a.error ? `<div class="add-err">${esc(a.error)}</div>` : ''}
      <div class="acts"><button class="btn sm primary" data-act="add-save">Save</button><button class="btn sm" data-act="add-cancel">Cancel</button></div></div>`;
  }
  const chip = (f) => `<button class="chip" data-act="add" data-id="${it.id}" data-field="${f}">+ ${esc(fieldName(f))}</button>`;
  const missing = missingFields(it).map(chip);
  const others = otherEmptyFields(it);
  const rest = a?.more ? others.map(chip) : others.length ? [`<button class="chip plain" data-act="add-more" data-id="${it.id}">+ More</button>`] : [];
  return missing.length || rest.length ? `<div class="chips">${[...missing, ...rest].join('')}</div>` : '';
}

function detailLine(it) {
  const x = it.extraction;
  if (!x) return it.source === 'upload' ? esc(it.name || '') : `Captured ${new Date(it.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const bits = [];
  if (it.level !== 'green' && (x.email_sender || x.email_subject)) {
    bits.push(`From ${esc(x.email_sender || 'unknown')}${x.email_subject ? ` · “${esc(x.email_subject)}”` : ''}`);
  } else {
    if (x.date) bits.push(esc(shortDate(x.date)));
    if (x.category) bits.push(esc(titleCase(x.category)));
    for (const [f, n] of [['gst', 'GST'], ['pst', 'PST'], ['hst', 'HST'], ['tip', 'Tip']]) {
      if (cents(x[f])) bits.push(`${n} ${money(cents(x[f]), x.currency)}`);
    }
  }
  bits.push(`<span class="src">${sourceLabel(it)}</span>`);
  return bits.join(' · ');
}

const FOLLOW_UP = { review: 'Needs review', refund: 'For refund' };

function dupButton(it) {
  const issue = it.issues?.find((i) => i.dup);
  const follow = (value, text) => `<button class="btn sm" data-act="follow" data-id="${it.id}" data-field="${value}">${text}</button>`;
  const clear = issue ? `<button class="btn sm" data-act="not-dup" data-id="${it.id}">${issue.charge ? "Yes, it's a real purchase" : 'Not a duplicate'}</button>` : '';
  if (it.followUp) return `${clear}${it.followUp === 'review' ? follow('refund', FOLLOW_UP.refund) : follow('review', FOLLOW_UP.review)}${issue ? '' : follow('', 'Remove flag')}`;
  if (!issue) return '';
  return `${clear}${follow('review', FOLLOW_UP.review)}${follow('refund', FOLLOW_UP.refund)}`;
}

function fixButtons(it) {
  const chips = missingFields(it).map((f) => `<button class="chip" data-act="open" data-id="${it.id}" data-field="${f}">+ ${esc(fieldName(f))}</button>`).join('');
  const extras = `${dupButton(it)}${chips}`;
  if (it.level !== 'red' && !(it.level === 'yellow' && it.source === 'capture' && it.issues.some((i) => !i.dup && /cut off|blurry|dark/i.test(i.text)))) return extras ? `<div class="rbtns">${extras}</div>` : '';
  const btns = [];
  if (it.action === 'retry') btns.push(`<button class="btn sm" data-act="retry" data-id="${it.id}">Try again</button>`);
  else if (it.source === 'capture') btns.push(`<button class="btn sm" data-act="fix" data-id="${it.id}">${ICON.camera}${it.action === 'append' ? 'Capture the rest' : 'Recapture'}</button>`);
  else btns.push(`<button class="btn sm" data-act="fix" data-id="${it.id}">${ICON.file}Replace file</button>`);
  if (it.extraction) btns.push(`<button class="btn sm" data-act="open" data-id="${it.id}">Edit</button>`);
  return `<div class="rbtns">${btns.join('')}${extras}</div>`;
}

function renderList() {
  const list = $('#list');
  const items = [...S.items].filter((i) => S.tab === 'all' || i.followUp === S.tab).sort((a, b) => b.id - a.id);
  const inTab = (t) => S.items.filter((i) => i.followUp === t).length;
  $('#listTabs').innerHTML = [['all', 'All', S.items.length], ['review', FOLLOW_UP.review, inTab('review')], ['refund', FOLLOW_UP.refund, inTab('refund')]]
    .map(([t, name, n]) => `<button class="list-tab ${S.tab === t ? 'on' : ''}" role="tab" aria-selected="${S.tab === t}" data-act="tab" data-field="${t}">${name}<span>${n}</span></button>`).join('');
  list.innerHTML = S.tab !== 'all' && !items.length ? `<p class="tab-empty">Nothing here yet.</p>` : items.map((it) => {
    const x = it.extraction;
    const first = it.images[0];
    const thumb = !first
      ? `<div class="thumb pdf">${ICON.file}</div>`
      : first.pdf
        ? '<div class="thumb pdf">PDF</div>'
        : `<div class="thumb" style="background-image:url(${first.dataUrl})">${it.images.length > 1 ? `<span class="n">${it.images.length} parts</span>` : ''}</div>`;
    const issue = it.issues?.[0];
    const more = (it.issues?.length || 0) > 1 ? ` <span class="muted">+${it.issues.length - 1} more</span>` : '';
    const why = issue ? `<div class="why">${esc(issue.text)}${issue.detail ? `. ${esc(issue.detail)}` : ''}${more}</div>` : '';
    const target = S.target?.id === it.id ? '<div class="why" style="color:var(--accent)">Waiting for your next capture…</div>' : '';
    const total = x && cents(x.total) !== null ? `${money(cents(x.total), x.currency)}<small>${esc(x.currency || '')}</small>` : '';
    const name = it.status === 'reading' ? '<span class="muted">Reading…</span>' : esc(x?.vendor || it.name || (it.source === 'capture' ? `Capture ${it.n}` : 'Unknown vendor'));
    return `<div class="row ${it.level || ''}" data-act="open" data-id="${it.id}">
      <div class="st">${statusIcon(it)}</div>
      ${thumb}
      <div style="min-width:0"><div class="v">${name}${it.followUp ? `<span class="pill ${it.followUp}">${FOLLOW_UP[it.followUp]}</span>` : ''}</div><div class="d">${detailLine(it)}</div>${target || why}${fixButtons(it)}</div>
      <div class="amt">${total}</div>
      <button class="trash" data-act="trash" data-id="${it.id}" aria-label="Delete receipt">${ICON.trash}</button>
    </div>`;
  }).join('');

  const counts = { green: 0, yellow: 0, red: 0, reading: 0 };
  S.items.forEach((i) => { counts[i.status === 'reading' ? 'reading' : i.level || 'reading']++; });
  $('#countLabel').textContent = S.items.length
    ? [`${S.items.length} total`, counts.green && `${counts.green} ready`, counts.yellow && `${counts.yellow} to check`, counts.red && `${counts.red} to fix`, counts.reading && `${counts.reading} reading`].filter(Boolean).join(' · ')
    : 'Nothing yet';

  // "Your total": green rows only, one line per currency, never mixed. A follow-up tab totals its own rows.
  const byCur = new Map();
  for (const it of S.items) {
    if (S.tab === 'all' ? it.level !== 'green' : it.followUp !== S.tab || !it.extraction) continue;
    const cur = (it.extraction.currency || 'CAD').toUpperCase();
    const t = byCur.get(cur) || { n: 0, total: 0, tax: 0 };
    t.n++;
    t.total += cents(it.extraction.total) || 0;
    t.tax += ['gst', 'pst', 'hst', 'other_tax'].reduce((s, f) => s + (cents(it.extraction[f]) || 0), 0);
    byCur.set(cur, t);
  }
  $('#totals').innerHTML = byCur.size
    ? `<span>${S.tab === 'refund' ? 'Total to get back' : S.tab === 'review' ? 'Total under review' : 'Your total (ready receipts only)'}</span>${[...byCur].map(([cur, t]) => `<div><b>${money(t.total, cur)}</b> <span>${cur} · ${t.n} receipt${t.n > 1 ? 's' : ''} · tax ${money(t.tax, cur)}</span></div>`).join('')}`
    : `<span>${S.tab === 'all' ? 'Your total shows here once receipts are ready.' : ''}</span>`;
}

function renderBox() {
  const latest = [...S.items].filter((i) => i.source === 'capture').sort((a, b) => b.id - a.id)[0];
  const capturing = !!S.stream;
  const n = S.items.filter((i) => i.source === 'capture').length;
  let html = `<div class="box-head"><span><span class="dot ${capturing ? 'live' : ''}"></span>${capturing ? 'Capturing' : 'Not capturing'}</span><span>${n} captured</span></div>`;

  if (S.moving) {
    html += `<div class="card red"><div class="t">${ICON.error}The email was moving</div>
      <div class="d">Don't scroll while capturing. Nothing was saved. Stop scrolling, then click Capture.</div>
      <div class="acts"><button class="btn sm" data-act="capture-anyway">Capture anyway</button></div></div>`;
  } else if (S.target) {
    const t = S.items.find((i) => i.id === S.target.id);
    html += `<div class="card target"><div class="t">${S.target.mode === 'append' ? 'Capturing the rest of' : 'Recapturing'} ${esc(t ? label(t) : 'receipt')}</div>
      <div class="d">Open that email${S.target.mode === 'append' ? ', scroll to the total' : ''}, then click Capture.</div>
      <div class="acts"><button class="btn sm" data-act="cancel-target">Cancel</button></div></div>`;
  } else if (!latest) {
    html += `<div class="card"><div class="t">${capturing ? 'Ready' : 'Start here'}</div><div class="d">${capturing ? 'Click a receipt email in Outlook, then click Capture.' : 'Click Start capturing and pick your Outlook window.'}</div></div>`;
  } else if (latest.status === 'reading') {
    html += `<div class="card"><div class="t"><span class="spin"></span>Reading…</div><div class="d">Stay on this email. Capture comes back when it's done.</div></div>`;
  } else if (latest.level === 'red') {
    const issue = latest.issues[0];
    const acts = latest.local?.action === 'same'
      ? `<button class="btn sm danger" data-act="delete" data-id="${latest.id}">Delete it</button><button class="btn sm" data-act="keep" data-id="${latest.id}">Keep it</button>`
      : latest.action === 'retry'
        ? `<button class="btn sm danger" data-act="retry" data-id="${latest.id}">Try again</button><button class="btn sm" data-act="delete" data-id="${latest.id}">Delete</button>`
        : `${latest.action === 'append' ? `<button class="btn sm danger" data-act="append" data-id="${latest.id}">${ICON.plus}Capture the rest</button>` : ''}
           <button class="btn sm ${latest.action === 'append' ? '' : 'danger'}" data-act="replace" data-id="${latest.id}">${ICON.camera}Recapture${latest.action === 'append' ? ' all' : ''}</button>
           ${latest.extraction ? `<button class="btn sm" data-act="keep" data-id="${latest.id}">Keep anyway</button>` : ''}
           <button class="btn sm" data-act="delete" data-id="${latest.id}">Delete</button>`;
    html += `<div class="card red"><div class="t">${ICON.error}${esc(issue.text)}</div>
      <div class="d">${esc(label(latest))}${issue.detail ? `. ${esc(issue.detail)}` : ''}</div><div class="acts">${acts}</div>${addControls(latest)}</div>`;
  } else if (latest.level === 'yellow') {
    const first = latest.issues[0];
    html += `<div class="card yellow"><div class="t">${ICON.warn}${latest.followUp ? `Saved to ${FOLLOW_UP[latest.followUp]}` : first.charge ? 'Paid twice?' : 'Saved, check it later'}</div>
      <div class="d">${esc(label(latest))}. ${esc(first.text)}</div>
      ${dupButton(latest) ? `<div class="acts">${dupButton(latest)}<button class="btn sm" data-act="delete" data-id="${latest.id}">Delete</button></div>` : ''}${addControls(latest)}</div>`;
  } else {
    const x = latest.extraction;
    html += `<div class="card green"><div class="t">${ICON.check}${esc(x.vendor || 'Receipt')} · ${money(cents(x.total), x.currency)}</div>
      <div class="d">${[shortDate(x.date), titleCase(x.category)].filter(Boolean).map(esc).join(' · ')}. Go to the next email.</div>${addControls(latest)}</div>`;
  }

  const earlierRed = S.items.filter((i) => i.level === 'red' && i !== latest && i.source === 'capture');
  if (earlierRed.length && !S.target) {
    const r = earlierRed[earlierRed.length - 1];
    html += `<div class="pending"><span>${earlierRed.length} earlier capture${earlierRed.length > 1 ? 's' : ''} need${earlierRed.length > 1 ? '' : 's'} fixing: ${esc(label(r))}</span><button class="btn sm" data-act="fix" data-id="${r.id}">Fix</button></div>`;
  }

  const busy = isBusy();
  html += capturing
    ? `<button class="btn primary big" data-act="capture" ${busy ? 'disabled' : ''}>${busy ? `<span class="spin"></span>${S.grabbing ? 'Hold still…' : 'Reading…'}` : `${ICON.camera}Capture`}</button>`
    : `<button class="btn primary big" data-act="start">${ICON.camera}Start capturing</button>`;
  html += `<div class="box-foot"><button class="link" data-act="crop">${S.crop ? 'Crop area: on' : 'Set crop area'}</button>${capturing ? '<button class="link" data-act="stop">Stop</button>' : ''}</div>`;
  boxEl.innerHTML = html;
  boxEl.querySelector('[data-add-input]')?.focus();
}

function render() {
  renderBox();
  renderList();
  const capturing = !!S.stream;
  $('#startLabel').textContent = capturing ? 'Stop capturing' : 'Start capturing';
  $('#startBtn').classList.toggle('primary', !capturing);
  $('#pipBtn').hidden = !capturing || !!S.pip || !('documentPictureInPicture' in window);
  $('#cropLabel').textContent = S.crop ? 'Change crop area' : 'Set crop area';
  $('#modeNote').innerHTML = S.code
    ? '<b>Live:</b> captures are read by Claude, well under a cent each.'
    : '<b>Demo mode:</b> results are sample data, so you can practise the flow. Enter an access code to read real receipts.';
}

// ---------- detail / edit ----------

const FIELDS = [
  ['vendor', 'Vendor', 'text', true], ['date', 'Date', 'date'], ['time', 'Time', 'time'], ['receipt_number', 'Receipt #', 'text'],
  ['subtotal', 'Subtotal', 'num'], ['gst', 'GST', 'num'], ['pst', 'PST', 'num'], ['hst', 'HST', 'num'],
  ['other_tax', 'Other tax', 'num'], ['tip', 'Tip', 'num'], ['total', 'Total', 'num'], ['currency', 'Currency', 'text'],
];
const CATEGORIES = ['meals', 'travel', 'lodging', 'fuel', 'office_supplies', 'software', 'equipment', 'telecom', 'professional_services', 'other'];

function closeModal() { $('#modalRoot').innerHTML = ''; }

function openDetail(it, focusField) {
  const x = it.extraction || { ...BLANK, currency: 'CAD' };
  const imgs = it.images.map((p, i) => (p.pdf
    ? `<div class="pdfbox">${ICON.file}<p>PDF receipt</p><a href="${p.dataUrl}" target="_blank" rel="noopener" download="${esc(it.name || 'receipt.pdf')}">Open PDF</a></div>`
    : `<img src="${p.dataUrl}" alt="Receipt image ${i + 1}">`)).join('') || '<div class="pdfbox">No image</div>';
  const issues = (it.issues?.length ? it.issues : [{ level: 'green', text: 'Looks good. Nothing to fix.' }])
    .map((i) => `<div class="issue ${i.level}">${esc(i.text)}${i.detail ? `. ${esc(i.detail)}` : ''}</div>`).join('');
  const inputs = FIELDS.map(([f, name, type, wide]) => {
    const v = x[f];
    const val = v === null || v === undefined ? '' : type === 'num' ? Number(v).toFixed(2) : v;
    return `<label class="${wide ? 'wide' : ''}">${name}<input name="${f}" type="${type === 'num' ? 'number' : type}" ${type === 'num' ? 'step="0.01" inputmode="decimal"' : ''} value="${esc(val)}"></label>`;
  }).join('');
  const meta = [
    x.email_sender && `From: ${esc(x.email_sender)}`,
    x.email_subject && `Subject: “${esc(x.email_subject)}”`,
    x.email_date && `Received: ${esc(shortDate(x.email_date))}`,
    x.notes && `Note: ${esc(x.notes)}`,
    it.ms && `Read in ${(it.ms / 1000).toFixed(1)}s${it.model && it.model !== 'demo' ? ` by ${esc(it.model)}` : ''}`,
    `Source: ${sourceLabel(it)}${it.manual?.length ? ` (${esc(it.manual.map(fieldName).join(', '))})` : ''}`,
  ].filter(Boolean).join('<br>');

  $('#modalRoot').innerHTML = `<div class="overlay" data-close>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Receipt details">
      <div class="modal-head"><h3>${esc(label(it))}</h3><button class="trash" data-close aria-label="Close">${ICON.x}</button></div>
      <form class="modal-body" id="editForm">
        <div class="imgs">${imgs}</div>
        <div class="fields">
          <div class="issues">${issues}</div>
          ${inputs}
          <label class="wide">Follow-up<select name="followUp"><option value="">None</option>${Object.entries(FOLLOW_UP).map(([v, n]) => `<option value="${v}" ${it.followUp === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="wide">Category<select name="category"><option value="">Unknown</option>${CATEGORIES.map((c) => `<option value="${c}" ${x.category === c ? 'selected' : ''}>${titleCase(c)}</option>`).join('')}</select></label>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
        </div>
      </form>
      <div class="modal-foot">
        <div style="display:flex;gap:8px">
          <button class="btn danger" data-m="delete">${ICON.trash}Delete</button>
          ${it.source === 'capture' ? `<button class="btn" data-m="fix">${ICON.camera}Recapture</button>` : `<button class="btn" data-m="fix">${ICON.file}Replace file</button>`}
        </div>
        <div style="display:flex;gap:8px"><button class="btn" data-close>Cancel</button><button class="btn primary" data-m="save">Save</button></div>
      </div>
    </div></div>`;

  const root = $('#modalRoot');
  if (focusField) root.querySelector(`input[name="${focusField}"]`)?.focus();
  root.querySelector('.overlay').addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target.closest('button[data-close]')) return closeModal();
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (m === 'delete') { closeModal(); removeItem(it.id); }
    if (m === 'fix') { closeModal(); startFix(it); }
    if (m === 'save') {
      const form = new FormData($('#editForm'));
      const next = { ...x };
      for (const [f, , type] of FIELDS) {
        const raw = String(form.get(f) ?? '').trim();
        next[f] = raw === '' ? null : type === 'num' ? Number(raw) : raw;
      }
      if (next.currency) next.currency = next.currency.toUpperCase();
      if (next.currency && !/^[A-Z]{3}$/.test(next.currency)) {
        const input = $('#editForm input[name="currency"]');
        input.setCustomValidity('Use a 3-letter code like CAD or USD');
        input.reportValidity();
        input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
        return;
      }
      const badNumber = FIELDS.find(([f, , type]) => type === 'num' && next[f] !== null && !Number.isFinite(next[f]));
      if (badNumber) return toast(`${badNumber[1]} isn't a number.`);
      next.category = form.get('category') || null;
      const edited = FIELDS.filter(([f, , type]) => (type === 'num' ? cents(next[f]) !== cents(x[f]) : (next[f] ?? null) !== (x[f] ?? null))).map(([f]) => f);
      if ((next.category ?? null) !== (x.category ?? null)) edited.push('category');
      if (edited.length) it.manual = [...new Set([...(it.manual || []), ...edited])];
      next.is_receipt = true;
      it.followUp = form.get('followUp') || null;
      it.extraction = next;
      it.reviewed = true;
      it.status = 'done';
      it.local = null;
      closeModal();
      reassessAll();
      render();
      toast('Saved.');
    }
  });
}

// ---------- crop area ----------

async function openCrop() {
  if (!S.stream && !(await startCapture())) return;
  window.focus();
  const bitmap = await grabBitmap();
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();

  $('#modalRoot').innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="Set crop area">
    <div class="modal-head"><h3>Set crop area</h3><button class="trash" data-c="cancel" aria-label="Close">${ICON.x}</button></div>
    <p class="crop-help">Drag a box around Outlook's reading pane, where the email shows. Every capture will be cut to this area. Leave a little room at the bottom for longer emails.</p>
    <div class="crop-stage" id="stage"><div class="crop-rect" id="rect" hidden></div></div>
    <div class="modal-foot"><button class="btn" data-c="clear">No crop (whole window)</button>
      <div style="display:flex;gap:8px"><button class="btn" data-c="cancel">Cancel</button><button class="btn primary" data-c="save">Save crop area</button></div></div>
  </div></div>`;
  const stage = $('#stage');
  const rect = $('#rect');
  stage.prepend(canvas);
  let sel = S.crop ? { ...S.crop } : null;
  const draw = () => {
    if (!sel) { rect.hidden = true; return; }
    rect.hidden = false;
    Object.assign(rect.style, { left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` });
  };
  draw();
  let start = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  stage.addEventListener('pointerdown', (e) => { start = pos(e); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (!start) return;
    const p = pos(e);
    sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    draw();
  });
  stage.addEventListener('pointerup', () => { start = null; if (sel && (sel.w < 0.05 || sel.h < 0.05)) { sel = null; draw(); } });

  $('#modalRoot').querySelector('.modal').addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (!c) return;
    if (c === 'clear') { S.crop = null; store.set('rp.crop', null); toast('Crop removed. Captures use the whole window.'); }
    if (c === 'save') {
      if (!sel) return toast('Drag a box on the picture first.');
      S.crop = sel; store.set('rp.crop', sel); toast('Crop area saved.');
    }
    closeModal();
    render();
  });
}

// ---------- Excel export ----------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
}

async function exportExcel() {
  const rows = [...S.items].filter((i) => i.extraction).sort((a, b) => a.id - b.id);
  if (!rows.length) return toast('Nothing to export yet.');
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  } catch {
    return toast("Couldn't load the Excel tool. Check your connection.");
  }
  const data = rows.map((it) => {
    const x = it.extraction;
    return {
      Status: it.level === 'green' ? 'Ready' : it.level === 'yellow' ? 'Check' : 'Fix',
      'Follow-up': FOLLOW_UP[it.followUp] || '',
      Vendor: x.vendor, Date: x.date, Time: x.time, 'Receipt #': x.receipt_number,
      Subtotal: x.subtotal, GST: x.gst, PST: x.pst, HST: x.hst, 'Other tax': x.other_tax, Tip: x.tip, Total: x.total,
      Currency: x.currency, Category: titleCase(x.category), Payment: titleCase(x.payment_method),
      Notes: (it.issues || []).map((i) => i.text).join('; '),
      Source: sourceLabel(it),
      'Manual fields': (it.manual || []).map(fieldName).join(', '),
      File: it.source === 'capture' ? '' : it.name,
    };
  });
  const ws = window.XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0]).map((k) => ({ wch: Math.max(k.length + 2, k === 'Vendor' || k === 'Notes' ? 28 : 12) }));
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Receipts');
  window.XLSX.writeFile(wb, `receipts-${today()}.xlsx`);
}

// ---------- help tour ----------

const ILL = {
  flow: `<div class="ill"><div class="ill-flow">
    <div class="s">Click email<small>in Outlook</small></div><span class="arr">→</span>
    <div class="s">Capture<small>in the box</small></div><span class="arr">→</span>
    <div class="s" style="color:var(--green)">✓ Done<small>in seconds</small></div></div></div>`,
  share: `<div class="ill"><div class="share">
    <div class="bar">Choose what to share</div>
    <div class="tabs"><span>Chrome tab</span><span class="on">Window</span><span>Entire screen</span></div>
    <div class="wins"><div class="win">Excel</div><div class="win on pulse">Outlook</div><div class="win">Teams</div></div>
    <div class="btns"><span>Cancel</span><span class="on">Share</span></div></div></div>`,
  box: `<div class="ill"><div class="box" style="max-width:240px;margin:0 auto">
    <div class="box-head"><span><span class="dot live"></span>Capturing</span><span>3 captured</span></div>
    <div class="card green"><div class="t">✓ Staples · $48.20</div><div class="d">Oct 3 · Office supplies. Go to the next email.</div></div>
    <div class="btn primary big pulse">Capture</div></div></div>`,
  red: `<div class="ill"><div class="card red" style="animation:none"><div class="t">Part of the receipt is cut off</div>
    <div class="d">Uber · Oct 14. Scroll down in the email, then capture the rest.</div>
    <div class="acts"><span class="btn sm danger pulse">Capture the rest</span><span class="btn sm">Recapture all</span></div></div>
    <div class="card yellow"><div class="t">Saved, check it later</div><div class="d">Looks like the same receipt as Staples · Oct 3</div></div></div>`,
};

const TOUR = [
  { title: 'Capture receipts in two clicks', html: '<p>No downloading, no saving to folders. You click a receipt email, click Capture, and it\'s read for you.</p>' + ILL.flow },
  { target: '#codeField', title: 'Your access code', html: "<p>Type the code you were given. No code? Leave it empty: everything works in demo mode with sample results, so you can practise first.</p>" },
  { target: '#startBtn', title: 'Start capturing', html: '<p>Click this, and your browser asks what to share:</p>' + ILL.share + '<ol><li>Click the <b>Window</b> tab</li><li>Click your <b>Outlook</b> window</li><li>Click <b>Share</b></li></ol><p>Outlook has to be open, not minimized. It works with the Outlook app or Outlook in a browser.</p>' },
  { title: 'A box floats on top of Outlook', html: '<p>After you share, a small box pops out and stays on top of every window, even when you click into Outlook. Drag it to a corner.</p>' + ILL.box + "<p>Don't see it? Click <b>Open floating box</b>. In Firefox or Safari it stays on this page; put this window next to Outlook.</p>" },
  { title: 'Your rhythm', html: '<ol><li>Click a receipt email in Outlook</li><li>Click <b>Capture</b> in the box</li><li>Wait a few seconds for the green check, then click the next email</li></ol><p>Capture locks while a receipt is being read, so nothing gets saved twice. Don\'t scroll while you click it: if the email is moving, you\'ll get a warning and nothing is saved.</p><p>Prefer to stay on one email until it\'s green: if something\'s wrong, you\'re already in the right place to fix it.</p>' },
  { title: 'When it goes red', html: ILL.red + '<p><b>Red means fix it now</b>, while the email is still open. If the total is cut off, scroll down and click <b>Capture the rest</b>: both parts are read as one receipt.</p><p><b>Yellow</b> means it\'s saved; check it later in your list.</p>' },
  { title: 'Missing something? Paid twice?', html: '<p><b>Missing a detail?</b> The box shows a <b>+</b> button, like <b>+ Subtotal</b>. Click it and type what you see in the email. The receipt\'s source then says <b>Scan + manual input</b>.</p><p><b>Paid twice?</b> If two receipts from the same vendor have the same amount within 30 minutes, you\'ll get a warning. Click <b>Yes, it\'s a real purchase</b> to clear it, or send it to the <b>Needs review</b> or <b>For refund</b> tab above your list so you can come back to it.</p>' },
  { target: '#cropBtn', title: 'Zoom in once (optional)', html: "<p>Draw a box around Outlook's reading pane, once. Every capture is cut to that area, so small text reads better and your inbox list stays out of the picture.</p>" },
  { target: '#dropZone', title: 'PDFs and attachments', html: '<p>Got PDF receipts? Drag them here, or drag an attachment straight out of Outlook. Whole emails (.msg files) can\'t be read yet, so drag the attachment or capture it instead.</p>' },
  { target: '.list-card', title: 'Your receipts', html: '<p><b style="color:var(--green)">Green check</b>: good to go. <b style="color:var(--amber)">Yellow</b>: check it. <b style="color:var(--red)">Red</b>: needs fixing.</p><p>Click any row to see the image next to the fields and fix anything. The trash icon deletes it, and you get a few seconds to Undo.</p>' },
  { target: '#exportBtn', title: 'Totals and Excel', html: '<p>Your total counts green receipts only, one line per currency. When you\'re done, click <b>Download Excel</b>.</p><p>You can open this tour again any time with <b>Help</b>.</p>' },
];

let tourStep = -1;

function openTour(step = 0) {
  tourStep = step;
  store.set('rp.toured', true);
  drawTour();
}
function closeTour() {
  tourStep = -1;
  $('#tourRoot').innerHTML = '';
}

function drawTour() {
  const step = TOUR[tourStep];
  if (!step) return closeTour();
  let target = step.target ? $(step.target) : null;
  if (target && !document.contains(target)) target = null;
  if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });

  const dots = TOUR.map((_, i) => `<i class="${i === tourStep ? 'on' : ''}"></i>`).join('');
  $('#tourRoot').innerHTML = `<div class="tour-dim ${target ? '' : 'solid'}" data-t="close"></div><div class="tour-ring" ${target ? '' : 'hidden'}></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-label="${esc(step.title)}">
      <div class="step">Step ${tourStep + 1} of ${TOUR.length}</div>
      <h4>${esc(step.title)}</h4>
      ${step.html}
      <div class="nav"><div class="dots">${dots}</div>
        <div style="display:flex;gap:8px">
          ${tourStep > 0 ? '<button class="btn sm" data-t="back">Back</button>' : '<button class="btn sm ghost" data-t="close">Skip</button>'}
          <button class="btn sm primary" data-t="next">${tourStep === TOUR.length - 1 ? 'Done' : 'Next'}</button>
        </div></div>
    </div>`;
  const ring = $('.tour-ring');
  const card = $('.tour-card');
  const place = () => {
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!target) {
      Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${Math.max(16, (vh - ch) / 2)}px` });
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
    let top, left;
    if (r.bottom + 16 + ch <= vh - 16) {
      top = r.bottom + 16;
    } else if (r.top - ch - 16 >= 16) {
      top = r.top - ch - 16;
    } else if (r.right + 16 + cw <= vw - 16 || r.left - cw - 16 >= 16) {
      // Not enough room above or below: sit beside the target so it stays visible.
      left = r.right + 16 + cw <= vw - 16 ? r.right + 16 : r.left - cw - 16;
      top = clamp(r.top + r.height / 2 - ch / 2, 16, vh - ch - 16);
    } else {
      top = clamp(vh - ch - 16, 16, vh);
    }
    left ??= clamp(r.left + r.width / 2 - cw / 2, 16, vw - cw - 16);
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  };
  place();
  drawTour.place = place;
  card.querySelector('[data-t="next"]').focus();
}

$('#tourRoot').addEventListener('click', (e) => {
  const t = e.target.closest('[data-t]')?.dataset.t;
  if (t === 'close') closeTour();
  if (t === 'next') { tourStep++; drawTour(); }
  if (t === 'back') { tourStep--; drawTour(); }
});
window.addEventListener('resize', () => { if (tourStep >= 0) drawTour.place?.(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (tourStep >= 0) closeTour(); else closeModal(); }
  if (tourStep < 0) return;
  if (e.key === 'ArrowRight') { tourStep++; drawTour(); }
  if (e.key === 'ArrowLeft' && tourStep > 0) { tourStep--; drawTour(); }
});

// ---------- wiring ----------

$('#startBtn').addEventListener('click', () => (S.stream ? stopCapture() : startCapture()));
$('#pipBtn').addEventListener('click', () => openPip());
$('#cropBtn').addEventListener('click', () => openCrop());
$('#helpBtn').addEventListener('click', () => openTour(0));
$('#exportBtn').addEventListener('click', exportExcel);
$('#pickBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });

const codeInput = $('#codeInput');
codeInput.value = S.code;
codeInput.addEventListener('change', () => {
  S.code = codeInput.value.trim();
  store.set('rp.code', S.code);
  render();
  toast(S.code ? 'Access code saved. New captures are read live.' : 'Demo mode on.');
});

const drop = $('#dropZone');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; drop.classList.add('over'); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('over'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove('over');
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  else toast('That drop had no files in it. Try dragging the attachment instead of the email.');
});
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } });

window.addEventListener('beforeunload', (e) => {
  if (S.items.length) { e.preventDefault(); e.returnValue = ''; }
});

render();
if (!store.get('rp.toured', false)) setTimeout(() => openTour(0), 500);

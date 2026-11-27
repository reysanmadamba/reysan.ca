// Receipt Parser trial: capture receipts from an email window, read them with
// Claude (via the reysan-ca-backend function), flag anything that needs fixing.
// Everything lives in memory in this tab; nothing is stored server-side.

const DEFAULT_API = 'https://reysan-ca-backend-77ah.vercel.app/api/receipt-extract';
const MAX_LONG_EDGE = 2000;           // px; plenty for receipt text, keeps uploads small
const MAX_PDF_BYTES = 3 * 1024 * 1024; // Vercel's 4.5 MB body limit, after base64
const LOW_CONFIDENCE = 0.7;
const DOUBLE_CHARGE_MINUTES = 30;
const MAX_TEXT_CHARS = 100_000; // pasted email text, the reader's limit too
const PASTE_HINT = 'Gmail or a long email? Click in the email, press Ctrl+A then Ctrl+C, then click Paste copied email.';

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = {
  items: [],
  nextId: 1,
  pip: null,         // the floating drop box, when it's open
  replaceId: null,   // upload row waiting for a replacement file
  code: store.get('rp.code', ''),
  demoTick: 0,
  tab: 'all',        // which list shows: 'all', 'review' or 'refund'
  totalScope: store.get('rp.totalScope', 'ready'), // the total: 'ready' receipts only, or 'all' including ones to review
  mini: false,       // the floating drop box shrunk to a small bar
  editing: null,     // the drop box row being edited in place, and what's been typed so far
  editDraft: {},
  editError: '',
  moreOpen: new Set(), // rows whose warning explanation is open
  savedAt: 0,        // when the list was last saved in this browser
  attach: [],        // dropped emails: { id, title, sender, subject, files: [{ name, itemId, skipped, reason, hidden }] }
  nextGroup: 1,
  user: store.get('rp.user', { name: '', email: '' }), // typed in for now; comes from the login once accounts exist
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
  folder: '<svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  eye: '<svg class="i" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  expand: '<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
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
    .replace(/\b(inc|incorporated|ltd|limited|llc|llp|lp|pbc|plc|gmbh|pty|corp|corporation|co|company|ulc|the)\b/g, ' ')
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
  const parts = [x?.vendor || it.name || 'Receipt'];
  if (x?.date) parts.push(shortDate(x.date));
  return parts.join(' · ');
};

// ---------- checks (all math in code, never by the model) ----------

// Canadian receipts only: no tax, or less than the lowest rate. Exempt items make this
// legitimate sometimes, so it's a question for the person rather than an error.
// The receipt itself often says "5%" (of the taxed items only), so the short line says this is the
// page's own math, and See more shows the sum, so nobody thinks the numbers were made up.
function lowTax(x, sub) {
  const part = (f) => cents(x[f]) ?? 0;
  const gst = part('gst');
  const hst = part('hst');
  const tax = gst + hst + part('pst') + part('other_tax');
  const m = (c) => money(c, x.currency);
  const pct = (t) => `${((t / sub) * 100).toFixed(1)}%`;
  const why = (name, t, usual) => ({
    text: `${name} works out to ${pct(t)} of the subtotal by our math, under the usual ${usual}`,
    more: `The receipt may well say ${usual}, and that's fine. This page checks the math itself: ${name} ${m(t)} ÷ subtotal ${m(sub)} = ${pct(t)}. `
      + `That usually means something on the receipt isn't taxed (like a fee marked N or an exempt item), so the ${usual} only applies to part of the subtotal. `
      + 'The numbers were read from the receipt. If they match it, click Keep. If not, click Review and fix them.',
  });
  if (tax === 0) {
    return {
      text: "No tax shown. Fine if it's tax-exempt or already in the price",
      more: `No GST, PST or HST was found on this receipt, so the page counts $0 tax on the ${m(sub)} subtotal. `
        + "That's fine for tax-exempt purchases or prices that already include tax. If the receipt does show tax, click Review and add it. Otherwise click Keep.",
    };
  }
  if (hst > 0) return hst < Math.round(sub * 0.13) - 2 ? why('HST', hst, '13% to 15%') : null;
  if (gst > 0) return gst < Math.round(sub * 0.05) - 2 ? why('GST', gst, '5%') : null;
  return tax < Math.round(sub * 0.05) - 2 ? why('Tax', tax, '5%') : null;
}

function assess(it) {
  const issues = [];
  let action = it.source === 'upload' ? 'file' : 'paste';
  const x = it.extraction;

  if (it.status === 'error') {
    return finish(it, [{ level: 'red', text: it.error || "Couldn't read this one" }], 'retry');
  }
  if (it.local) return finish(it, [{ level: 'red', text: it.local.title, detail: it.local.detail }], it.local.action);
  if (!x) return finish(it, [], null);

  if (!it.reviewed && !it.kept) {
    if (!x.is_receipt) {
      issues.push({ level: 'red', text: "This doesn't look like a receipt", detail: x.notes || 'Drop the receipt email or its PDF instead.' });
    } else if (x.image_quality !== 'clear') {
      issues.push({ level: 'red', text: `Too ${x.image_quality === 'dark' ? 'dark' : 'blurry'} to read reliably`, detail: 'Try the PDF, or a clearer picture.' });
    } else if ((x.cut_off && !it.manual?.includes('total')) || x.total === null) {
      issues.push({
        level: 'red',
        text: x.total === null ? "Can't see the total" : 'Part of the receipt is cut off',
        detail: (x.cut_off_detail ? `${x.cut_off_detail} ` : '') + (it.source === 'upload' ? 'Try the full PDF, or enter the total.' : `The text stops before the total. ${PASTE_HINT}`),
      });
    }
  }
  if (it.keep && issues.some((i) => i.level === 'red')) {
    issues.forEach((i) => { if (i.level === 'red') { i.level = 'yellow'; i.text = `Kept as is: ${i.text.toLowerCase()}`; } });
  }

  if (x.is_receipt || it.reviewed) {
    if (x.receipt_count > 1 && !it.part) issues.push({ level: 'yellow', text: `Shows ${x.receipt_count} receipts; only the first was read. Drop each one on its own.` });

    // Before review a missing total is already a red "can't see the total".
    const required = it.reviewed ? ['vendor', 'date', 'subtotal', 'total', 'currency'] : ['vendor', 'date', 'subtotal', 'currency'];
    // A free receipt, like after-hours parking, has no subtotal to ask for.
    // An installment payment is one part of a bill: Total is what was paid this time, and the
    // subtotal and tax (if shown) belong to the whole bill, so neither is asked for nor added up.
    const missing = required.filter((f) => (x[f] === null || x[f] === '') && !(f === 'subtotal' && (cents(x.total) === 0 || it.installment)));
    if (missing.length) issues.push({ level: 'yellow', text: `Missing ${missing.join(', ')}` });

    const sub = cents(x.subtotal);
    const total = cents(x.total);
    if (sub !== null && total !== null && !it.installment) {
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
    if (!it.reviewed && !it.softOk) {
      if (total === 0) issues.push({ level: 'yellow', text: 'Total is $0.00. Check it was read right', soft: true });
      const low = sub > 0 && x.currency === 'CAD' && !it.installment ? lowTax(x, sub) : null;
      if (low) issues.push({ level: 'yellow', text: low.text, more: low.more, soft: true });
    }
    if (x.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) issues.push({ level: 'yellow', text: `Date "${x.date}" isn't a full date` });
      else if (x.date > today()) issues.push({ level: 'yellow', text: 'Date is in the future' });
      else if (!it.reviewed && x.date_ambiguous && swappedDate(x.date) && swappedDate(x.date) <= today()) {
        issues.push({ level: 'yellow', text: `Date could be ${shortDate(x.date)} or ${shortDate(swappedDate(x.date))}. Check the receipt.` });
      }
    }
    if (!it.reviewed && x.confidence < LOW_CONFIDENCE) issues.push({ level: 'yellow', text: 'Low confidence. Double-check the numbers.' });
    if (it.unpaid && !it.softOk) {
      issues.push({ level: 'yellow', text: "Invoice, not paid yet: there's no receipt for it and it isn't marked paid, so it isn't counted. Add the receipt, or click Looks right if it was paid", soft: true, review: true });
    }
    if (it.billFor?.length) {
      const list = it.billFor.map((id) => S.items.find((o) => o.id === id)).filter(Boolean);
      issues.push({ level: 'grey', text: `Invoice for ${list.length > 1 ? `${list.length} payments` : 'a payment'} in your list (${list.map(label).join(', ')}): the payment${list.length > 1 ? 's are' : ' is'} counted instead` });
    }
    if (isRefund(x)) {
      const orig = S.items.find((o) => o.id === it.refundOf);
      if (!orig && !it.softOk) {
        issues.push({ level: 'yellow', text: 'Refund with no matching purchase in your list. Add the purchase, or click Looks right to count it', soft: true, review: true });
      } else if (orig && (orig.chargeOf || orig.dupOf)) {
        issues.push({ level: 'grey', text: `Refund for ${label(orig)}, which isn't counted: the charge and the refund cancel out` });
      }
    }
    if (it.chargeOf) {
      const other = S.items.find((o) => o.id === it.chargeOf);
      if (other && it.refundedCents >= cents(x.total)) {
        issues.push({ level: 'grey', text: `Second charge, refunded in full: it and its refund cancel out` });
      } else if (other) {
        const gap = Math.abs(paidAt(x) - paidAt(other.extraction));
        const apart = gap === 0 ? 'at the same time' : `${gap} minute${gap === 1 ? '' : 's'} apart`;
        issues.unshift({ level: 'yellow', text: `Same amount as ${other.extraction.vendor || 'another receipt'} at ${clockTime(other.extraction.time)}, ${apart}. Is this really a second purchase? If not, ask for a refund`, dup: true, charge: true, of: other.id });
      }
    } else if (it.dupOf) {
      const other = S.items.find((o) => o.id === it.dupOf);
      if (other) {
        const dateNote = other.extraction.date === x.date ? '' : `, but the dates were read differently (${shortDate(x.date)} and ${shortDate(other.extraction.date)}). Check which is right`;
        const pair = [x.document_type, other.extraction.document_type].includes('invoice');
        issues.push({ level: 'yellow', text: pair ? `Same payment as ${label(other)}: one is the invoice, the other the receipt. Keep one${dateNote}` : `Looks like the same receipt as ${label(other)}${dateNote}`, dup: true, of: other.id, pair });
      }
    }
  }
  // Kept: a person checked it and says it's right. Only "linked to another row" notes stay.
  if (it.kept) return finish(it, issues.filter((i) => i.level === 'grey'), action);
  if (it.followUp && !issues.length) issues.push({ level: 'yellow', text: 'Flagged by you' });
  return finish(it, issues, action);
}

function finish(it, issues, action) {
  it.issues = issues;
  it.action = action;
  it.level = it.status === 'reading' ? null
    : issues.some((i) => i.level === 'red') ? 'red'
      : issues.some((i) => i.level !== 'grey') ? 'yellow'
        : issues.length ? 'grey' : 'green';
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

const numberKey = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isRefund = (x) => x?.document_type === 'refund';
// Refunds are kept as positive amounts and shown and totalled as money back.
const signedCents = (it, field = 'total') => { const c = cents(it.extraction?.[field]); return c === null ? null : isRefund(it.extraction) ? -c : c; };

// Links rows that belong together, strongest evidence first, and stops at the first rule that decides:
// 1 same receipt number (with the same vendor, or the same amount and day): the same document twice
// 2 same invoice number, one without a receipt number: an invoice and its receipt
// 3 same invoice number, different receipt numbers: installment payments on one bill (not duplicates)
// 4 same vendor, amount and day, at the same time or with no time to tell: probably the same receipt
// 5 same vendor and amount 2 to 30 minutes apart: maybe paid twice (not for rows from one email)
// Then: an invoice with no payment isn't counted and needs review; a refund is linked to its purchase.
function findDuplicates() {
  const rows = [...S.items].sort((a, b) => a.id - b.id);
  for (const it of rows) Object.assign(it, { dupOf: null, chargeOf: null, refundOf: null, payment: null, billFor: null, unpaid: false, refundedCents: 0 });
  const long = (k) => k.length >= 4;
  const seen = [];
  const refunds = [];
  for (const it of rows) {
    const x = it.extraction;
    if (!x?.is_receipt) continue;
    const t = cents(x.total);
    if (t === null) continue;
    const e = { it, id: it.id, v: normVendor(x.vendor), date: x.date, t, rn: numberKey(x.receipt_number), inv: numberKey(x.invoice_number), ref: numberKey(x.refers_to), at: paidAt(x), group: it.groupId, kind: x.document_type || 'receipt' };
    if (e.kind === 'refund') { refunds.push(e); continue; }
    if (!it.dupOk) {
      const sameDay = (s) => !!(s.date && e.date && (s.date === e.date || s.date === swappedDate(e.date)));
      const otherBill = (s) => long(s.inv) && long(e.inv) && s.inv !== e.inv;
      const hit = (long(e.rn) && seen.find((s) => s.rn === e.rn && (s.v === e.v || (s.t === e.t && sameDay(s)))))
        || (long(e.inv) && seen.find((s) => s.inv === e.inv && s.t === e.t && (!s.rn || !e.rn)))
        || (e.v && seen.find((s) => s.v === e.v && s.t === e.t && sameDay(s) && (!s.rn || !e.rn || s.rn === e.rn) && !otherBill(s)
          && (s.at === null || e.at === null || Math.abs(s.at - e.at) < 2)));
      if (hit && hit.kind === 'invoice' && e.kind !== 'invoice' && !hit.it.dupOk) {
        // An invoice and its receipt: the receipt is the proof of payment, so it's the one that counts.
        hit.it.dupOf = it.id;
      } else if (hit) {
        it.dupOf = hit.id;
      } else if (e.at !== null && e.v) {
        const charge = seen.find((s) => s.v === e.v && s.t === e.t && s.at !== null && Math.abs(s.at - e.at) <= DOUBLE_CHARGE_MINUTES
          && (Math.abs(s.at - e.at) >= 2 || (s.rn && e.rn && s.rn !== e.rn))
          && !(it.groupId && s.group === it.groupId) && !(long(e.inv) && s.inv === e.inv) && !(long(e.rn) && s.rn === e.rn));
        if (charge) it.chargeOf = charge.id;
      }
    }
    seen.push(e);
  }

  const live = seen.filter((s) => !s.it.dupOf);
  const payments = live.filter((s) => s.kind !== 'invoice' && long(s.inv));
  for (const s of live.filter((b) => b.kind === 'invoice')) {
    const paid = long(s.inv) ? payments.filter((p) => p.inv === s.inv) : [];
    if (paid.length) s.it.billFor = paid.map((p) => p.id);
    else s.it.unpaid = true;
  }
  const byBill = new Map();
  for (const p of payments) byBill.set(p.inv, [...(byBill.get(p.inv) || []), p]);
  for (const [inv, list] of byBill) {
    if (list.length < 2) continue;
    const bill = live.find((b) => b.kind === 'invoice' && b.inv === inv);
    let paid = 0;
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.id - b.id).forEach((p, i) => {
      paid += p.t;
      p.it.payment = { n: i + 1, count: list.length, paid, of: bill ? bill.t : null, number: p.it.extraction.invoice_number };
    });
  }

  const refundSeen = [];
  for (const r of refunds) {
    const copy = refundSeen.find((s) => (long(r.rn) && s.rn === r.rn) || (s.v === r.v && s.t === r.t && s.date === r.date && (!s.rn || !r.rn)));
    if (copy && !r.it.dupOk) { r.it.dupOf = copy.id; continue; }
    refundSeen.push(r);
    const keys = [r.ref, r.inv, r.rn].filter(long);
    const orig = live.find((s) => keys.some((k) => k === s.rn || k === s.inv))
      || [...live].reverse().find((s) => s.v && s.v === r.v && s.t >= r.t && (!r.date || !s.date || s.date <= r.date));
    if (orig) {
      r.it.refundOf = orig.id;
      orig.it.refundedCents += r.t;
    }
  }
}

function reassessAll() {
  findDuplicates();
  S.items.forEach(assess);
}

// ---------- the floating drop box ----------

// A small window that stays on top of every other window, Outlook included, to drop emails onto.
async function openPip() {
  if (!('documentPictureInPicture' in window)) {
    toast("This browser can't float the drop box. Drop emails and files on this page instead, or use Edge or Chrome.");
    return false;
  }
  if (S.pip) return true;
  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width: BOX_SIZE.full[0], height: BOX_SIZE.full[1] });
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
    pip.document.title = 'Receipt drop box';
    pip.document.body.classList.add('pip');
    pip.document.body.append(boxEl);
    pip.document.addEventListener('paste', takePaste);
    pip.document.addEventListener('dragover', (e) => { e.preventDefault(); boxEl.classList.add('over'); });
    pip.document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) boxEl.classList.remove('over'); });
    pip.document.addEventListener('drop', (e) => {
      e.preventDefault();
      boxEl.classList.remove('over');
      takeDrop(e);
    });
    pip.addEventListener('pagehide', () => {
      heroEl.append(boxEl);
      S.pip = null;
      S.mini = false;
      render();
    });
    S.pip = pip;
    render();
    return true;
  } catch (e) {
    console.error('Drop box failed to open', e);
    toast("Couldn't open the drop box. Click Open drop box again.");
    return false;
  }
}

// The browser's X closes the floating window, which people fear loses their list (it doesn't). Shrink
// shrinks it to a small bar instead, still taking drops, and Expand brings it back.
const BOX_SIZE = { full: [380, 680], mini: [380, 150] };

function setMini(on) {
  S.mini = on;
  render();
  try { S.pip?.resizeTo(...BOX_SIZE[on ? 'mini' : 'full']); } catch { /* the window keeps its size */ }
}

// What the browser's own "back to tab" button does, for anyone who doesn't spot it: closes the
// drop box and shows the full list, where receipts are reviewed and exported.
function openApp() {
  S.pip?.close();
  window.focus();
  $('.list-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// A file picker from whichever window was clicked, so it opens from the floating drop box too.
// With folder, every file in the folder and its subfolders is picked.
// Chrome won't open a file window from inside the floating drop box, so the page opens it. A click in
// the box counts as a click on the page too, which is what lets the page do that. The page is brought
// forward first, so the file window shows up in front instead of behind Outlook.
function pickFiles(folder = false) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  if (folder) input.webkitdirectory = true;
  else input.accept = 'application/pdf,image/*,.msg,.eml';
  // Kept on the page until it's used, so the browser can't throw it away while the file window is open.
  const done = () => setTimeout(() => input.remove(), 0);
  input.addEventListener('change', () => { handleFiles(input.files); done(); });
  input.addEventListener('cancel', done);
  document.body.append(input);
  if (S.pip) window.focus();
  input.click();
}

// Shrinks a picture to a size that's plenty for receipt text, as a JPEG for the reader.
function encodeImage(src, w, h) {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  let dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  if (dataUrl.length > 1_300_000) dataUrl = canvas.toDataURL('image/jpeg', 0.75);
  return { media_type: 'image/jpeg', dataUrl, data: dataUrl.slice(dataUrl.indexOf(',') + 1), w: cw, h: ch };
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
// ---------- reading (Claude via backend, or demo data) ----------

// One paste, email or file can hold several receipts (a Gmail thread with two parking receipts, a statement):
// the first stays on this row and each of the others gets its own row from the same source.
function splitExtras(it, extras) {
  // Reading it again replaces the rows it made last time.
  if (it.splitChildren?.length) S.items = S.items.filter((o) => !it.splitChildren.includes(o.id));
  it.splitChildren = [];
  it.part = null;
  if (!extras.length) return;
  // From one source, so they're never each other's "paid twice".
  if (!it.groupId) it.groupId = S.nextGroup++;
  it.part = { n: 1, of: extras.length + 1 };
  extras.forEach((x, i) => {
    if (it.fromEmail) {
      x.email_sender ||= it.fromEmail.sender;
      x.email_subject ||= it.fromEmail.subject;
    }
    const child = addItem(it.source, it.images, it.name);
    Object.assign(child, {
      text: it.text, html: it.html, fromEmail: it.fromEmail, emailDate: it.emailDate, folder: it.folder, groupId: it.groupId,
      extraction: x, status: 'done', ms: it.ms, model: it.model, part: { n: i + 2, of: extras.length + 1 }, splitParent: it.id,
    });
    it.splitChildren.push(child.id);
  });
}

const partLabel = (it) => (it.part ? `${it.part.n} of ${it.part.of} receipts in this ${it.source === 'paste' ? 'paste' : it.source === 'email' ? 'email' : 'file'}` : '');

async function read(it) {
  it.status = 'reading';
  it.error = null;
  assess(it);
  render();
  try {
    const result = await readOne(it);
    it.extraction = result.extraction;
    if (it.fromEmail) {
      it.extraction.email_sender ||= it.fromEmail.sender;
      it.extraction.email_subject ||= it.fromEmail.subject;
    }
    it.manual = null;
    it.ms = result.ms;
    it.model = result.model;
    it.status = 'done';
    it.snapshot = null;
    splitExtras(it, result.extras || []);
  } catch (e) {
    if (it.snapshot?.extraction) {
      // A replacement file that can't be read never loses the first one.
      it.images = it.snapshot.images;
      it.extraction = it.snapshot.extraction;
      it.status = 'done';
      it.snapshot = null;
      toast(`The new file couldn't be read (${e.message}). Kept the first one.`);
    } else {
      it.status = 'error';
      it.error = e.message;
    }
  }
  reassessAll();
  if (it.source === 'email' && it.emailHasFiles && it.status === 'done' && !it.extraction.is_receipt && S.items.includes(it)) {
    // The email's own text just points to its attachments: off the receipt list, but still in the drop box's list.
    S.items.splice(S.items.indexOf(it), 1);
    S.attach.forEach((g) => g.files.forEach((f) => { if (f.itemId === it.id) Object.assign(f, { itemId: null, skipped: true, reason: 'No receipt in the text' }); }));
    reassessAll();
  }
  render();
}

// A folder can hold hundreds of files: read a few at a time and queue the rest.
const READS_AT_ONCE = 3;
let readsRunning = 0;
const readQueue = [];

async function readOne(it) {
  if (readsRunning >= READS_AT_ONCE) {
    it.queued = true;
    render();
    await new Promise((resolve) => readQueue.push(resolve));
    it.queued = false;
    render();
  }
  readsRunning++;
  try {
    return S.code ? await callApi(it) : await mockExtract(it);
  } finally {
    readsRunning--;
    readQueue.shift()?.();
  }
}

async function callApi(it) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70_000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(it.text
        ? { code: S.code, today: today(), text: it.text }
        : { code: S.code, today: today(), files: it.images.map((i) => ({ media_type: i.media_type, data: i.data })) }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { $('#codeInput').focus(); throw new Error('Wrong access code'); }
    if (res.status === 429) throw new Error('Reading limit reached (150 every 10 minutes). Click Try again in a few minutes');
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
  email_subject: null, email_date: null, confidence: 0.95, notes: null, time: null, date_ambiguous: false, attachments: [], invoice_number: null, document_type: 'receipt', refers_to: null,
};
const DEMO = [
  () => ({ vendor: 'Staples #2045', date: daysAgo(3), receipt_number: '2045-118832', subtotal: 43.04, gst: 2.15, pst: 3.01, total: 48.2, category: 'office_supplies', email_sender: 'Staples Canada', email_subject: 'Your Staples receipt' }),
  () => ({ vendor: 'Air Canada', date: daysAgo(6), receipt_number: 'AC7Q2K', subtotal: 393.1, gst: 19.65, total: 412.75, category: 'travel', email_sender: 'Air Canada', email_subject: 'Your booking receipt: Calgary to Toronto' }),
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

async function imageFileToPart(file) {
  const bitmap = await createImageBitmap(file);
  const img = encodeImage(bitmap, bitmap.width, bitmap.height);
  bitmap.close?.();
  return img;
}

// Ctrl+V of an email's text: the whole receipt however long, with nothing cut off or misread.
function takePaste(e) {
  if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
  const data = e.clipboardData;
  if (!data) return;
  if (data.files?.length) {
    e.preventDefault();
    handleFiles(data.files);
    return;
  }
  let text = data.getData('text/plain');
  if (!text.trim()) {
    const html = data.getData('text/html');
    // Keep rows and cells apart, or "Subtotal" and "12.00" from separate cells run together.
    const spaced = html.replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n$&').replace(/<\/t[dh]>/gi, ' $&');
    if (html) text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent || '';
  }
  e.preventDefault();
  takeText(text);
}

function takeText(raw) {
  const text = String(raw || '').trim();
  if (text.length < 20) return toast(`Nothing to paste yet. ${PASTE_HINT}`);
  if (text.length > MAX_TEXT_CHARS) return toast("That's too much text for one receipt. Copy just the one email.");
  if (S.items.some((i) => i.text === text)) return toast('Already pasted that one.');
  const it = addItem('paste', []);
  it.text = text;
  read(it);
}

// The Paste button reads what was copied. It asks through the window the box is in, because
// the browser only hands the clipboard to the window that was just clicked.
async function pasteFromButton() {
  const nav = boxEl.ownerDocument.defaultView.navigator;
  try {
    takeText(await nav.clipboard.readText());
  } catch {
    toast('The browser didn\'t allow reading what you copied. Click Allow if it asks, or click the box and press Ctrl+V.');
  }
}

document.addEventListener('paste', takePaste);

// The browser only lets a dropped folder be read during the drop, so its entries are taken right away.
async function filesInEntries(entries) {
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) {
      out.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
      return;
    }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

function takeDrop(e) {
  const entries = [...(e.dataTransfer?.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  const folder = entries.find((en) => en.isDirectory);
  if (folder) return filesInEntries(entries).then((files) => handleFiles(files, folder.name));
  if (e.dataTransfer?.files?.length) return handleFiles(e.dataTransfer.files);
  // Gmail hands over a link to the file inside Gmail, which another site isn't allowed to open.
  const types = [...(e.dataTransfer?.types || [])];
  if (types.some((t) => t.toLowerCase() === 'downloadurl') || /mail\.google\.com/.test(e.dataTransfer?.getData('text/uri-list') || '')) {
    toast("Gmail doesn't hand over the file when you drag it. Click the download arrow on the attachment, then drag it from the browser's downloads list (top right) onto this box.");
  } else {
    toast('That drop had no files in it. Try dragging the attachment instead of the email.');
  }
}

// An email dragged out of Outlook: its text is read like a paste, and each PDF or image attached to it
// like a dropped file. They're listed together in the box, and count as one email for the paid-twice check.
// Pictures inside an email (logos, banners) point at its attachments by content id; swap in the pictures
// themselves so the email looks right when reviewed. Pictures on the internet stay blocked.
function withInlinePictures(mail) {
  if (!mail.html) return '';
  let html = mail.html;
  for (const a of mail.attachments) {
    if (!a.cid || !a.bytes || !a.inline) continue;
    let bin = '';
    for (let i = 0; i < a.bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, a.bytes.subarray(i, i + 0x8000));
    const url = `data:${a.type || 'image/png'};base64,${btoa(bin)}`;
    html = html.split(`cid:${a.cid}`).join(url);
  }
  return html;
}

async function takeEmailFile(f) {
  let mail;
  try {
    const { readEmailFile } = await import('./email.js');
    mail = readEmailFile(new Uint8Array(await f.arrayBuffer()), f.name);
  } catch {
    return toast(`Couldn't open ${f.name}. Drag its attachment, or copy the email's text instead.`);
  }
  // Every attachment is listed with what happened to it, so it's clear nothing was missed. PDFs and the
  // pictures a browser can open are read; logos shown inside the email are only counted.
  const readable = (a) => a.bytes && !a.inline && (/pdf|image\/(png|jpe?g|webp|gif)/i.test(a.type) || /\.(pdf|png|jpe?g|webp|gif)$/i.test(a.name));
  const files = mail.attachments.filter(readable);
  const logos = mail.attachments.filter((a) => a.inline).length;
  const group = {
    id: S.nextGroup++, fromId: -1, sig: '', title: mail.subject || f.name, sender: mail.sender, subject: mail.subject, dropped: true, email: true, files: [],
    note: `${mail.attachments.length - logos} attachment${mail.attachments.length - logos === 1 ? '' : 's'} in this email${logos ? `, plus ${logos} picture${logos > 1 ? 's' : ''} shown inside it (left out)` : ''}.`,
  };
  S.attach.push(group); // before the reads start, so a quick "see attached" answer can take itself off the list
  const fromEmail = { sender: mail.sender, subject: mail.subject };
  const text = [mail.sender && `From: ${mail.sender}`, mail.subject && `Subject: ${mail.subject}`, mail.date && `Date: ${mail.date}`]
    .filter(Boolean).join('\n') + `\n\n${mail.text}`;
  if (mail.text.trim().length >= 20) {
    const it = addItem('email', [], f.name);
    Object.assign(it, { text: text.slice(0, MAX_TEXT_CHARS), fromEmail, groupId: group.id, emailHasFiles: files.length > 0, html: withInlinePictures(mail), emailDate: mail.date });
    group.files.push({ name: 'Email text', itemId: it.id });
    read(it);
  }
  for (const a of files) {
    const ext = (/\.(\w+)$/.exec(a.name) || [])[1]?.toLowerCase();
    const type = a.type || { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || '';
    const part = await fileToPart(new File([a.bytes], a.name, { type }));
    const it = addItem('upload', part.error ? [] : [part], a.name);
    Object.assign(it, { fromEmail, groupId: group.id });
    group.files.push({ name: a.name, itemId: it.id });
    if (part.error) setLocal(it, part.error, part.detail, 'file');
    else read(it);
  }
  for (const a of mail.attachments.filter((x) => !x.inline && !readable(x))) {
    group.files.push({ name: a.name, skipped: true, reason: a.bytes ? 'Not a PDF or picture' : 'Not a file' });
  }
  if (!group.files.some((x) => x.itemId)) {
    S.attach.splice(S.attach.indexOf(group), 1);
    return toast(`${f.name} has no text or PDF to read.`);
  }
  render();
}

const JUNK_FILE = /^(\.|~\$|desktop\.ini$|thumbs\.db$)/i;
const READABLE_FILE = (f) => /^(application\/pdf|image\/)/i.test(f.type) || /\.(pdf|png|jpe?g|webp|gif|heic|msg|eml)$/i.test(f.name);

async function handleFiles(fileList, folderName) {
  const all = [...fileList].filter((f) => !JUNK_FILE.test(f.name));
  if (!all.length) return toast(folderName ? `“${folderName}” has no files in it.` : 'Nothing to read in that.');
  const folder = folderName || all[0].webkitRelativePath?.split('/')[0] || '';
  const files = all.filter(READABLE_FILE);
  const unreadable = all.filter((f) => !READABLE_FILE(f));
  toast(folder
    ? `Reading ${files.length} file${files.length === 1 ? '' : 's'} from “${folder}”${unreadable.length ? `. ${unreadable.length} can't be read (not a PDF, picture or email)` : ''}.`
    : `Got ${all.length} file${all.length > 1 ? 's' : ''}: ${all.map((f) => f.name).join(', ')}`);
  if (S.code && files.length > 150) {
    toast(`That's ${files.length} files. The trial reads up to 150 every 10 minutes, so some may need Try again after a few minutes.`);
  }
  if (unreadable.length) {
    S.attach.push({
      id: S.nextGroup++, title: folder || 'Your upload', subject: folder || 'your upload', sender: '', folder: true,
      files: unreadable.map((f) => ({ name: f.name, skipped: true, reason: 'Not a PDF, picture or email' })),
    });
  }

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
    if (/\.(msg|eml)$/i.test(f.name)) {
      await takeEmailFile(f);
      continue;
    }
    const part = await fileToPart(f);
    const it = addItem('upload', part.error ? [] : [part], f.name);
    if (folder) it.folder = folder;
    if (part.error) setLocal(it, part.error, part.detail, 'file');
    else read(it);
  }
  render();
}

async function fileToPart(f) {
  const name = f.name.toLowerCase();
  if (f.type === 'application/pdf' || name.endsWith('.pdf')) {
    if (f.size > MAX_PDF_BYTES) return { error: 'PDF is too large for the trial (3 MB max)', detail: 'Enter its details by hand, or ask for a smaller copy.' };
    const dataUrl = await readAsDataUrl(f);
    return { media_type: 'application/pdf', pdf: true, dataUrl, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  }
  if (f.type.startsWith('image/')) {
    try { return await imageFileToPart(f); } catch { return { error: "Couldn't open that image", detail: 'Try a JPG or PNG.' }; }
  }
  if (name.endsWith('.msg') || name.endsWith('.eml')) {
    return { error: "An email can't replace a receipt", detail: 'Drop the email on the box to read it as a new receipt instead.' };
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

// A warning's longer explanation, behind See more so the list stays short.
function seeMore(it, issue) {
  if (!issue?.more) return '';
  const open = S.moreOpen.has(it.id);
  return ` <button class="link see-more" data-act="more" data-id="${it.id}" aria-expanded="${open}">${open ? 'See less' : 'See more'}</button>${open ? `<span class="more-text">${esc(issue.more)}</span>` : ''}`;
}

const TYPES = [['receipt', 'Receipt'], ['installment', 'Installment payment'], ['invoice', 'Invoice (not paid)'], ['refund', 'Refund']];
const typeOf = (it) => (it.installment ? 'installment' : it.extraction?.document_type === 'invoice' ? 'invoice' : it.extraction?.document_type === 'refund' ? 'refund' : 'receipt');

// Saves what a person typed or chose. Anything changed marks the source "manual input".
// values holds only the fields shown; returns an error to show, or '' when saved.
function applyEdits(it, values) {
  const x = it.extraction || { ...BLANK, currency: 'CAD' };
  const next = { ...x };
  for (const [f, name, type] of FIELDS) {
    if (!(f in values)) continue;
    const raw = String(values[f] ?? '').trim();
    next[f] = raw === '' ? null : type === 'num' ? Number(raw.replace(/[$,\s]/g, '')) : raw;
    if (type === 'num' && next[f] !== null && !Number.isFinite(next[f])) return `${name} isn't a number.`;
  }
  if (next.currency) next.currency = next.currency.toUpperCase();
  if (next.currency && !/^[A-Z]{3}$/.test(next.currency)) return 'Currency: use a 3-letter code like CAD or USD.';
  const edited = FIELDS.filter(([f, , type]) => f in values && (type === 'num' ? cents(next[f]) !== cents(x[f]) : (next[f] ?? null) !== (x[f] ?? null))).map(([f]) => f);
  if ('category' in values) {
    next.category = values.category || null;
    if ((next.category ?? null) !== (x.category ?? null)) edited.push('category');
  }
  if ('type' in values) {
    if (values.type !== typeOf(it)) edited.push('type');
    next.document_type = values.type === 'installment' ? 'receipt' : values.type;
    it.installment = values.type === 'installment';
  }
  if (edited.length) it.manual = [...new Set([...(it.manual || []), ...edited])];
  if ('note' in values) it.userNote = String(values.note || '').trim() || null;
  if ('followUp' in values) it.followUp = values.followUp || null;
  next.is_receipt = true;
  Object.assign(it, { extraction: next, reviewed: true, status: 'done', local: null });
  reassessAll();
  render();
  return '';
}

// The drop box can't show the page's review window (it's behind Outlook), so it edits in place.
const BOX_FIELDS = ['vendor', 'date', 'total', 'subtotal', 'gst', 'pst', 'hst', 'tip'];

function boxEditor(it) {
  const x = it.extraction || {};
  const d = S.editDraft;
  const val = (f, type) => (f in d ? d[f] : x[f] === null || x[f] === undefined ? '' : type === 'num' ? Number(x[f]).toFixed(2) : x[f]);
  const inputs = BOX_FIELDS.map((f) => {
    const [, name, type] = FIELDS.find(([k]) => k === f);
    return `<label class="${f === 'vendor' ? 'wide' : ''}">${name}<input name="${f}" type="${type === 'num' ? 'text' : type}" ${type === 'num' ? 'inputmode="decimal"' : ''} value="${esc(val(f, type))}"></label>`;
  }).join('');
  const type = 'type' in d ? d.type : typeOf(it);
  const canKeep = (it.level === 'yellow' || it.level === 'red') && cents(x.total) !== null;
  return `<div class="inline-edit">${inputs}
    <label class="wide">Type<select name="type">${TYPES.map(([v, n]) => `<option value="${v}" ${type === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="wide">Your note<textarea name="note" rows="2" placeholder="For example: installment 2 of 3">${esc('note' in d ? d.note : it.userNote || '')}</textarea></label>
    ${S.editError ? `<p class="add-err wide">${esc(S.editError)}</p>` : ''}
    <div class="wide edit-btns">
      ${it.images.length || it.html || it.text ? `<button class="mini" data-act="view-doc" data-id="${it.id}">${ICON.expand}See the document</button>` : ''}
      <button class="mini keep" data-act="edit-save" data-id="${it.id}">${ICON.check}Save</button>
      ${canKeep ? `<button class="mini" data-act="keep" data-id="${it.id}">Keep as is</button>` : ''}
      <button class="link" data-act="edit-cancel" data-id="${it.id}">Cancel</button></div></div>`;
}

function saveBoxEdit(it) {
  const form = boxEl.querySelector('.inline-edit');
  const values = Object.fromEntries([...form.querySelectorAll('[name]')].map((el) => [el.name, el.value]));
  S.editError = applyEdits(it, values);
  if (S.editError) {
    S.editDraft = values;
    return render();
  }
  S.editing = null;
  S.editDraft = {};
  render();
  toast(`Saved ${label(it)}.`);
}

// Review opens the document beside what was read, in the app's tab, so the drop box stays open.
function reviewItem(it) {
  it.viewed = true;
  // In the floating drop box, edit right there: the page's window would open behind Outlook.
  if (S.pip) {
    Object.assign(S, { editing: S.editing === it.id ? null : it.id, editDraft: {}, editError: '' });
    return render();
  }
  render();
  openDetail(it);
}

function keepItem(it) {
  if (!it.extraction || cents(it.extraction.total) === null) {
    toast('Add the total first, then Keep.');
    return reviewItem(it);
  }
  Object.assign(it, { kept: true, dupOk: true, softOk: true });
  reassessAll();
  render();
  toast(`Kept: ${label(it)} is counted.`, () => {
    Object.assign(it, { kept: false, dupOk: false, softOk: false });
    reassessAll();
    render();
  });
}

function startFix(it) {
  S.replaceId = it.id;
  $('#fileInput').click();
}

function onAction(act, id, field) {
  const it = S.items.find((i) => i.id === id);
  switch (act) {
    case 'pick': return pickFiles();
    case 'pick-folder': return pickFiles(true);
    case 'paste': return pasteFromButton();
    case 'pip': return openPip();
    case 'open-app': return openApp();
    case 'minimize': return setMini(true);
    case 'select':
      if (it) it.selected = !it.selected;
      return render();
    case 'select-all': return selectAll(field === 'box' ? boxRows() : listRows());
    case 'bulk': return bulk(field);
    case 'save': return saveNow(true);
    case 'expand': return setMini(false);
    case 'box-done':
      if (it) it.boxDone = true;
      return render();
    case 'box-done-all':
      // Clears what's settled; anything still to review or fix stays.
      S.items.forEach((i) => { if (i.status !== 'reading' && (i.level === 'green' || i.level === 'grey')) i.boxDone = true; });
      S.attach.forEach((g) => g.files.forEach((f) => { if (f.skipped) f.hidden = true; }));
      return render();
    case 'skip-hide': {
      const file = S.attach.find((g) => g.id === id)?.files[Number(field)];
      if (file) file.hidden = true;
      return render();
    }
    case 'not-dup':
      if (!it) return;
      it.dupOk = true; it.followUp = null; reassessAll(); return render();
    case 'soft-ok':
      if (!it) return;
      it.softOk = true; assess(it); return render();
    case 'follow':
      if (!it) return;
      it.followUp = field || null;
      assess(it);
      render();
      return field && toast(`Saved to the ${FOLLOW_UP[field]} tab.`);
    case 'tab': S.tab = field; return render();
    case 'total-scope':
      S.totalScope = field;
      store.set('rp.totalScope', field);
      return render();
    case 'fix': return it && startFix(it);
    case 'retry': return it && read(it);
    case 'keep': return it && keepItem(it);
    case 'review': return it && reviewItem(it);
    case 'edit-save': return it && saveBoxEdit(it);
    case 'more':
      if (!S.moreOpen.delete(id)) S.moreOpen.add(id);
      return render();
    case 'edit-cancel':
      Object.assign(S, { editing: null, editDraft: {}, editError: '' });
      return render();
    case 'view-doc': return it && openViewer(it, boxEl.ownerDocument);
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
// The paste box reads what's pasted (or dropped) into it straight away, then empties for the next one.
boxEl.addEventListener('input', (e) => {
  if (!e.target.matches('[data-paste-box]') || !/insertFromPaste|insertFromDrop/.test(e.inputType || '')) return;
  const text = e.target.value;
  e.target.value = '';
  takeText(text);
});

// What's typed in the drop box editor is kept, so a refresh of the list doesn't lose it.
boxEl.addEventListener('input', (e) => {
  if (S.editing && e.target.closest('.inline-edit') && e.target.name) S.editDraft[e.target.name] = e.target.value;
});

boxEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // Rendering replaces the clicked button, so the page-wide listener would no longer see it inside the box.
  e.stopPropagation();
  onAction(el.dataset.act, Number(el.dataset.id), el.dataset.field);
});

// ---------- saved in this browser, so the list is still here next time ----------

const DB = { name: 'receipt-parser', store: 'state', key: 'list' };

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB.name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDo(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB.store, mode);
    const req = fn(tx.objectStore(DB.store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

let saveTimer = null;
let restoring = true; // no saving until the saved list has loaded, or an empty page would overwrite it
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 800);
}

// A file still being read is saved as stopped, with Try again, since the read can't resume after a reload.
async function saveNow(announce) {
  clearTimeout(saveTimer);
  if (restoring) return;
  const items = S.items.map(({ snapshot, queued, ...it }) => ({
    ...it,
    images: it.images.map(({ blobUrl, ...p }) => p),
    ...(it.status === 'reading' ? { status: 'error', error: 'Stopped before it was read. Click Try again' } : {}),
  }));
  try {
    await dbDo('readwrite', (st) => st.put({ v: 1, items, attach: S.attach, nextId: S.nextId, nextGroup: S.nextGroup, savedAt: Date.now() }, DB.key));
    S.savedAt = Date.now();
    renderSaved();
    if (announce) toast('Saved. Your list will be here when you come back to this page on this computer.');
  } catch {
    if (announce) toast("Couldn't save in this browser. Download Excel to keep a copy.");
  }
}

async function restoreSaved() {
  try {
    const d = await dbDo('readonly', (st) => st.get(DB.key));
    if (!d?.items?.length) return;
    Object.assign(S, { items: d.items, attach: d.attach || [], nextId: d.nextId, nextGroup: d.nextGroup, savedAt: d.savedAt });
    reassessAll();
    render();
    const active = S.items.filter((i) => !i.archived).length;
    toast(`Welcome back: your ${active} receipt${active === 1 ? '' : 's'} from ${new Date(d.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} are here.`);
  } catch { /* nothing saved, or storage blocked: start empty */ } finally {
    restoring = false;
  }
}

function renderSaved() {
  const text = S.savedAt ? `Saved on this computer at ${new Date(S.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
  $('#savedNote').textContent = text;
  boxEl.querySelector('.saved-note')?.replaceChildren(text);
}

// ---------- picking several rows at once ----------

const active = () => S.items.filter((i) => !i.archived);
const selected = () => S.items.filter((i) => i.selected);

function removeMany(list, message) {
  const gone = new Set(list);
  const before = [...S.items];
  S.items = S.items.filter((i) => !gone.has(i));
  list.forEach((i) => { i.selected = false; });
  reassessAll();
  render();
  toast(message, () => {
    S.items = before;
    reassessAll();
    render();
  });
}

function bulk(what) {
  const list = selected();
  if (!list.length && what !== 'clear-all') return;
  const n = list.length;
  const many = `${n} receipt${n === 1 ? '' : 's'}`;
  if (what === 'cancel') list.forEach((i) => { i.selected = false; });
  if (what === 'review') {
    list.forEach((i) => { i.followUp = 'review'; i.selected = false; });
    toast(`${many} moved to Needs review.`);
  }
  if (what === 'archive' || what === 'unarchive') {
    const on = what === 'archive';
    list.forEach((i) => { i.archived = on; i.selected = false; if (on) i.boxDone = true; });
    toast(on ? `${many} archived: out of your list and total, kept under Archived.` : `${many} back in your list.`, () => {
      list.forEach((i) => { i.archived = !on; });
      reassessAll();
      render();
    });
  }
  if (what === 'delete') return removeMany(list, `${many} deleted.`);
  if (what === 'clear-all') {
    const all = active();
    if (!all.length) return toast('Nothing to delete.');
    return removeMany(all, `Deleted ${all.length} receipt${all.length === 1 ? '' : 's'}. Archived ones are kept.`);
  }
  reassessAll();
  render();
}

function selectAll(rows) {
  const on = !rows.every((i) => i.selected);
  rows.forEach((i) => { i.selected = on; });
  render();
}

function bulkBar(where) {
  const n = selected().length;
  if (!n) return '';
  const archiving = where === 'list' && S.tab === 'archived';
  return `<div class="bulk-bar"><b>${n} selected</b>
    <button class="btn sm" data-act="bulk" data-field="review">${ICON.warn}Review later</button>
    <button class="btn sm" data-act="bulk" data-field="${archiving ? 'unarchive' : 'archive'}">${ICON.folder}${archiving ? 'Unarchive' : 'Archive'}</button>
    <button class="btn sm danger" data-act="bulk" data-field="delete">${ICON.trash}Delete</button>
    <button class="link" data-act="bulk" data-field="cancel">Cancel</button></div>`;
}

const checkbox = (it) => `<input type="checkbox" class="sel" data-act="select" data-id="${it.id}" ${it.selected ? 'checked' : ''} aria-label="Select ${esc(label(it))}">`;

// ---------- rendering ----------

function statusIcon(it) {
  if (it.status === 'reading') return '<span class="spin" aria-label="Reading"></span>';
  if (it.level === 'grey') return '<span class="not-counted" aria-label="Not counted">–</span>';
  return it.level === 'green' ? ICON.check : it.level === 'yellow' ? ICON.warn : ICON.error;
}

// How a row relates to others: an installment, a refund, or a purchase that was refunded.
function linkLine(it) {
  const x = it.extraction;
  if (!x) return '';
  const cur = x.currency;
  if (it.payment) {
    const p = it.payment;
    return `Payment ${p.n} on invoice ${p.number}: ${money(p.paid, cur)}${p.of !== null ? ` of ${money(p.of, cur)}` : ''} paid so far`;
  }
  if (isRefund(x)) {
    const orig = S.items.find((o) => o.id === it.refundOf);
    return orig ? `Refund for ${label(orig)}` : 'Refund';
  }
  if (it.refundedCents) {
    const t = cents(x.total);
    return it.refundedCents >= t ? 'Refunded in full' : `${money(it.refundedCents, cur)} of ${money(t, cur)} refunded`;
  }
  return '';
}

const SOURCE_NAMES = { upload: 'Upload', paste: 'Paste', email: 'Email' };
const sourceLabel = (it) => `${SOURCE_NAMES[it.source]}${it.manual?.length ? ' + manual input' : ''}`;

const fieldName = (f) => FIELDS.find(([k]) => k === f)?.[1] || titleCase(f);

// Fields a person can still fill in, the ones the checks want first.
function missingFields(it) {
  const x = it.extraction;
  if (!x || (!x.is_receipt && !it.reviewed)) return [];
  return ['vendor', 'date', 'subtotal', 'total', 'currency'].filter((f) => (x[f] === null || x[f] === undefined || x[f] === '') && !(f === 'subtotal' && cents(x.total) === 0));
}

function detailLine(it) {
  const x = it.extraction;
  if (!x) return it.source === 'upload' ? esc(it.name || '') : it.source === 'paste' ? 'Pasted text' : 'Email text';
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
  const link = linkLine(it);
  if (it.part) bits.push(esc(partLabel(it)));
  if (it.userNote) bits.push(`<i class="user-note">Note: ${esc(it.userNote)}</i>`);
  if (link) bits.push(`<b class="link-line">${esc(link)}</b>`);
  bits.push(`<span class="src">${sourceLabel(it)}</span>`);
  return bits.join(' · ');
}

const FOLLOW_UP = { review: 'Needs review', refund: 'For refund' };

// A row's tab: the one a person chose, or Needs review when a check sends it there (an unpaid invoice, say).
const followUpOf = (it) => it.followUp || (it.issues?.some((i) => i.review) ? 'review' : null);

function pill(it) {
  const f = followUpOf(it);
  if (f === 'refund' && it.refundedCents) return '<span class="pill done">Refunded</span>';
  return f ? `<span class="pill ${f}">${FOLLOW_UP[f]}</span>` : '';
}

function dupButton(it) {
  const issue = it.issues?.find((i) => i.dup);
  const follow = (value, text) => `<button class="btn sm" data-act="follow" data-id="${it.id}" data-field="${value}">${text}</button>`;
  const clear = issue ? `<button class="btn sm" data-act="not-dup" data-id="${it.id}">${issue.charge ? "Yes, it's a real purchase" : 'Not a duplicate'}</button>` : '';
  if (it.followUp) return `${clear}${it.followUp === 'review' ? follow('refund', FOLLOW_UP.refund) : follow('review', FOLLOW_UP.review)}${issue ? '' : follow('', 'Remove flag')}`;
  if (!issue) return '';
  return `${clear}${follow('review', FOLLOW_UP.review)}${follow('refund', FOLLOW_UP.refund)}`;
}

const softButton = (it) => (it.issues?.some((i) => i.soft) ? `<button class="btn sm" data-act="soft-ok" data-id="${it.id}">Looks right</button>` : '');

function fixButtons(it) {
  const chips = missingFields(it).map((f) => `<button class="chip" data-act="open" data-id="${it.id}" data-field="${f}">+ ${esc(fieldName(f))}</button>`).join('');
  const btns = [];
  if (it.level === 'red') {
    if (it.action === 'retry') btns.push(`<button class="btn sm" data-act="retry" data-id="${it.id}">Try again</button>`);
    else if (it.source === 'upload') btns.push(`<button class="btn sm" data-act="fix" data-id="${it.id}">${ICON.file}Replace file</button>`);
    if (it.extraction) btns.push(`<button class="btn sm" data-act="open" data-id="${it.id}">Edit</button>`);
  }
  const all = `${btns.join('')}${dupButton(it)}${softButton(it)}${chips}`;
  return all ? `<div class="rbtns">${all}</div>` : '';
}

// The rows the app list shows for the current tab, newest first.
function listRows() {
  const rows = S.tab === 'archived' ? S.items.filter((i) => i.archived) : S.tab === 'all' ? active() : active().filter((i) => followUpOf(i) === S.tab);
  return rows.sort((a, b) => b.id - a.id);
}

// The rows the drop box shows: not archived, not cleared from it.
const boxRows = () => S.items.filter((i) => !i.boxDone && !i.archived).sort((a, b) => b.id - a.id);

function renderList() {
  const list = $('#list');
  const inTab = (t) => active().filter((i) => followUpOf(i) === t);
  const items = listRows();
  const archived = S.items.filter((i) => i.archived).length;
  $('#listTabs').innerHTML = [['all', 'All', active().length], ['review', FOLLOW_UP.review, inTab('review').length], ['refund', FOLLOW_UP.refund, inTab('refund').length], ['archived', 'Archived', archived]]
    .map(([t, name, n]) => `<button class="list-tab ${S.tab === t ? 'on' : ''}" role="tab" aria-selected="${S.tab === t}" data-act="tab" data-field="${t}">${name}<span>${n}</span></button>`).join('');
  $('#bulkList').innerHTML = items.length
    ? `<label class="select-all"><input type="checkbox" data-act="select-all" data-field="list" ${items.every((i) => i.selected) ? 'checked' : ''}> Select all</label>${bulkBar('list')}`
    : '';
  list.innerHTML = S.tab !== 'all' && !items.length ? `<p class="tab-empty">Nothing here yet.</p>` : items.map((it) => {
    const x = it.extraction;
    const first = it.images[0];
    const thumb = it.text
      ? `<div class="thumb pdf text">${it.source === 'email' ? 'EMAIL' : 'TEXT'}</div>`
      : !first
      ? `<div class="thumb pdf">${ICON.file}</div>`
      : first.pdf
        ? '<div class="thumb pdf">PDF</div>'
        : `<div class="thumb" style="background-image:url(${first.dataUrl})">${it.images.length > 1 ? `<span class="n">${it.images.length} parts</span>` : ''}</div>`;
    const issue = it.issues?.[0];
    const more = (it.issues?.length || 0) > 1 ? ` <span class="muted">+${it.issues.length - 1} more</span>` : '';
    const why = issue ? `<div class="why">${esc(issue.text)}${issue.detail ? `. ${esc(issue.detail)}` : ''}${more}${seeMore(it, issue)}</div>` : '';
    const total = x && cents(x.total) !== null ? `${money(signedCents(it), x.currency)}<small>${esc(x.currency || '')}</small>` : '';
    const name = it.status === 'reading' ? '<span class="muted">Reading…</span>' : esc(x?.vendor || it.name || 'Unknown vendor');
    return `<div class="row ${it.level || ''} ${it.selected ? 'selected' : ''}" data-act="open" data-id="${it.id}">
      ${checkbox(it)}
      <div class="st">${statusIcon(it)}</div>
      ${thumb}
      <div style="min-width:0"><div class="v">${name}${pill(it)}</div><div class="d">${detailLine(it)}</div>${why}${fixButtons(it)}</div>
      <div class="amt">${total}</div>
      <button class="trash" data-act="trash" data-id="${it.id}" aria-label="Delete receipt">${ICON.trash}</button>
    </div>`;
  }).join('');

  const counts = { green: 0, yellow: 0, red: 0, grey: 0, reading: 0 };
  active().forEach((i) => { counts[i.status === 'reading' ? 'reading' : i.level || 'reading']++; });
  $('#countLabel').textContent = active().length
    ? [`${active().length} total`, counts.green && `${counts.green} ready`, counts.yellow && `${counts.yellow} to check`, counts.red && `${counts.red} to fix`, counts.grey && `${counts.grey} not counted`, counts.reading && `${counts.reading} reading`].filter(Boolean).join(' · ')
    : 'Nothing yet';

  // "Your total": ready rows, or with the toggle also the ones to review, one line per currency, never
  // mixed. Possible duplicates stay out either way: they're likely the same receipt twice. A follow-up
  // tab totals its own rows.
  const withReview = S.tab === 'all' && S.totalScope === 'all';
  const counts_ = (it) => it.level === 'green' || (withReview && it.level === 'yellow' && !it.dupOf && it.extraction);
  const byCur = new Map();
  for (const it of active()) {
    if (S.tab === 'all' ? !counts_(it) : followUpOf(it) !== S.tab || !it.extraction) continue;
    const cur = (it.extraction.currency || 'CAD').toUpperCase();
    const t = byCur.get(cur) || { n: 0, review: 0, total: 0, tax: 0 };
    t.n++;
    if (it.level === 'yellow') t.review++;
    t.total += signedCents(it) || 0;
    t.tax += ['gst', 'pst', 'hst', 'other_tax'].reduce((s, f) => s + (signedCents(it, f) || 0), 0);
    byCur.set(cur, t);
  }
  const toggle = S.tab === 'all' ? `<div class="total-toggle" role="group" aria-label="What the total counts">
      <button type="button" class="${withReview ? '' : 'on'}" data-act="total-scope" data-field="ready" aria-pressed="${!withReview}">Ready only</button>
      <button type="button" class="${withReview ? 'on' : ''}" data-act="total-scope" data-field="all" aria-pressed="${withReview}">Include to review</button></div>` : '';
  const title = S.tab === 'refund' ? 'Total to get back' : S.tab === 'review' ? 'Total under review' : withReview ? 'Your total, including receipts to review' : 'Your total (ready receipts only)';
  $('#totals').innerHTML = toggle + (byCur.size
    ? `<span>${title}</span>${[...byCur].map(([cur, t]) => `<div><b>${money(t.total, cur)}</b> <span>${cur} · ${t.n} receipt${t.n > 1 ? 's' : ''}${t.review ? ` (${t.review} to review)` : ''} · tax ${money(t.tax, cur)}</span></div>`).join('')}${withReview ? '<span class="total-note">Possible duplicates are left out.</span>' : ''}`
    : `<span>${S.tab === 'all' ? 'Your total shows here once receipts are ready.' : ''}</span>`);
}

// One short phrase per part of an email: its amount when it counts, otherwise why it doesn't.
// What one part of an email turned out to be, in a few words. Duplicates point at the line they repeat.
function partNote(it, lineOf) {
  const x = it.extraction;
  const dup = it.issues?.find((i) => i.dup);
  const other = dup && S.items.find((o) => o.id === dup.of);
  const ref = other ? (lineOf(other.id) ? `#${lineOf(other.id)}` : label(other)) : 'another receipt';
  const amount = other && cents(other.extraction?.total) !== null ? `the ${money(cents(other.extraction.total), other.extraction.currency)} ` : '';
  if (it.level === 'green') return linkLine(it) ? `${linkLine(it)}, counted` : x?.document_type === 'invoice' ? 'Invoice, counted' : 'Receipt, counted';
  if (it.level === 'grey') return `${it.issues[0]?.text || 'Not counted'}`;
  if (it.unpaid) return 'Invoice, not paid yet: not counted, needs review';
  if (dup?.charge) return `Paid twice? Same amount as ${ref}`;
  if (dup && x?.document_type === 'invoice') return `Invoice for ${amount}receipt ${ref}, possible duplicate, not counted`;
  if (dup && dup.pair) return `Receipt for ${amount}invoice ${ref}, possible duplicate, not counted`;
  if (dup) return `Same as ${ref}, possible duplicate, not counted`;
  if (x && !x.is_receipt) return 'Not a receipt';
  if (it.level === 'red') return it.issues[0]?.text || 'Needs fixing';
  return it.issues[0]?.text || 'Check it';
}

// The drop box: one big place to drop emails and files, and a list of everything scanned with
// what happened to it. Done (✓) clears a line from here; it stays in the full list.
function renderBox() {
  // While someone is typing in the drop box editor, leave the box as it is so the cursor isn't lost.
  const editor = boxEl.querySelector('.inline-edit');
  const focused = boxEl.ownerDocument.activeElement;
  if (S.editing && editor?.contains(focused) && focused.matches('input, textarea, select')) return;
  const shown = boxRows();
  const skipped = S.attach.flatMap((g) => g.files.map((f, i) => ({ g, f, i })).filter(({ f }) => f.skipped && !f.hidden));
  const lineOf = (id) => shown.findIndex((i) => i.id === id) + 1;
  const word = { green: 'Done', yellow: 'Review', grey: 'Not counted', red: 'Failed' };
  const from = (it) => [it.fromEmail?.subject ? `From “${it.fromEmail.subject}”` : it.folder ? `${it.name} · in “${it.folder}”` : it.source === 'upload' ? it.name : it.source === 'paste' ? 'Pasted text' : '', partLabel(it)].filter(Boolean).join(' · ');
  const rows = shown.map((it, n) => {
    const x = it.extraction;
    const total = signedCents(it);
    const reading = it.status === 'reading';
    const main = x?.is_receipt ? `${total !== null ? `<b>${money(total, x.currency)}</b> ` : ''}${esc(x.vendor || it.name || 'Receipt')}` : esc(it.name || label(it));
    const ahead = it.queued ? S.items.filter((o) => o.queued && o.id < it.id).length : 0;
    const note = !reading ? partNote(it, lineOf) : it.queued ? `Waiting in line${ahead ? `, ${ahead} ahead` : ''}` : 'Reading…';
    const canKeep = !reading && (it.level === 'yellow' || it.level === 'red') && cents(x?.total) !== null;
    const acts = reading ? '' : S.editing === it.id ? boxEditor(it) : `<div class="scan-btns">
        <button class="mini ${it.viewed ? 'viewed' : ''}" data-act="review" data-id="${it.id}" title="${it.viewed ? 'You opened this one. Click to open it again' : 'Open the document beside what was read'}">${it.viewed ? `${ICON.check}Reviewed` : `${ICON.eye}Review`}</button>
        ${canKeep ? `<button class="mini keep" data-act="keep" data-id="${it.id}">${ICON.check}Keep</button>` : ''}</div>`;
    return `<li class="scan ${reading ? 'reading' : it.level} ${it.selected ? 'selected' : ''}">${checkbox(it)}${statusIcon(it)}
      <div class="att-text"><span class="att-main"><span class="att-num">${n + 1}.</span> ${main}</span>
        <span class="att-note">${reading ? '' : `<b class="tag ${it.level}">${word[it.level] || ''}</b> `}${esc(note)}${!reading && note === it.issues?.[0]?.text ? seeMore(it, it.issues[0]) : ''}</span>
        ${from(it) && from(it) !== it.name ? `<span class="att-from">${esc(from(it))}</span>` : x?.is_receipt && from(it) ? `<span class="att-from">${esc(from(it))}</span>` : ''}
        ${it.userNote ? `<span class="att-from user-note">Note: ${esc(it.userNote)}</span>` : ''}
        ${reading ? `<span class="progress ${it.queued ? 'queued' : ''}"></span>` : acts}</div>
      <div class="scan-acts"><button class="icon-btn" data-act="trash" data-id="${it.id}" title="Delete" aria-label="Delete">${ICON.trash}</button></div></li>`;
  }).join('') + skipped.map(({ g, f, i }) => `<li class="scan grey"><span class="att-n">–</span><span class="not-counted">–</span>
      <div class="att-text"><span class="att-main">${esc(f.name)}</span><span class="att-note"><b class="tag grey">Not read</b> ${esc(f.reason || 'Skipped')}</span>
        <span class="att-from">${esc(g.folder ? `In “${g.subject}”` : `From “${g.subject || g.title}”`)}</span></div>
      <div class="scan-acts"><button class="icon-btn" data-act="skip-hide" data-id="${g.id}" data-field="${i}" title="Hide from the drop box" aria-label="Hide">${ICON.x}</button></div></li>`).join('');

  if (S.mini && S.pip) {
    const count = (lvl) => S.items.filter((i) => i.level === lvl && !i.boxDone).length;
    const busy = S.items.filter((i) => i.status === 'reading').length;
    boxEl.innerHTML = `<div class="mini-bar">
      <div class="mini-drop"><b>Drop here to scan</b>
        <span>${[busy && `${busy} reading`, count('green') && `${count('green')} done`, count('yellow') && `${count('yellow')} to review`, count('red') && `${count('red')} failed`].filter(Boolean).join(' · ') || `${S.items.length} scanned`}</span></div>
      <button class="btn sm" data-act="expand">Expand</button></div>`;
    return;
  }
  boxEl.innerHTML = `<div class="box-head"><span>Drop box</span><span>${S.items.length} scanned${S.pip ? ' <button class="link" data-act="minimize" title="Makes the box a small bar. You can still drop emails on it.">Shrink</button>' : ''}</span></div>
    <button class="dropzone" data-act="pick">
      <svg class="i" viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <b>Drop the email here to scan</b>
      <span>Drag a receipt email from Outlook, or PDFs, pictures or a whole folder.</span>
    </button>
    <div class="upload-btns">
      <button class="btn" data-act="pick">${ICON.file}Upload files</button>
      <button class="btn" data-act="pick-folder">${ICON.folder}Upload folder</button>
    </div>
    <label class="paste-area"><b>Or paste an email's text</b>
      <span>For Gmail or any email: select all the email text (Ctrl+A), copy it (Ctrl+C), and paste it here (Ctrl+V). It's read as soon as you paste.</span>
      <textarea data-paste-box rows="3" placeholder="Paste the email text here"></textarea></label>
    <div class="scan-head">${shown.length ? `<label class="select-all"><input type="checkbox" data-act="select-all" data-field="box" ${shown.every((i) => i.selected) ? 'checked' : ''}> <b>Scanned</b></label>` : '<b>Scanned</b>'}
      ${rows ? `<span class="scan-tools"><button class="mini" data-act="box-done-all" title="Hides the Done lines from this box. They stay in your list.">${ICON.check}Hide done</button><button class="mini danger" data-act="bulk" data-field="clear-all" title="Deletes everything in your list. You can undo it.">${ICON.trash}Delete all</button></span>` : ''}</div>
    ${bulkBar('box')}
    ${rows ? `<ul class="scan-list">${rows}</ul>` : '<p class="scan-empty">Nothing yet. Each email and file you drop shows up here: Done, Review or Failed, with the reason.</p>'}
    ${S.pip ? `<button class="btn primary open-app" data-act="open-app">Open the app to review and export</button>
      <p class="box-note">Closing this box keeps everything: your list is saved on this computer. <button class="link" data-act="save">Save now</button> <span class="saved-note"></span></p>` : ''}`;
}

function render() {
  renderBox();
  renderList();
  renderSaved();
  saveSoon();
  // The drop box only shows as the floating window; the page keeps the one list, below.
  const canFloat = 'documentPictureInPicture' in window;
  boxEl.hidden = !S.pip;
  const btn = $('#dropBoxBtn');
  btn.hidden = !canFloat;
  btn.disabled = !!S.pip;
  btn.lastChild.textContent = S.pip ? ' Drop box is open' : ' Open drop box';
  // Firefox and Safari can't float a window: the page's own drop area takes over, with a clear alert.
  document.body.classList.toggle('no-float', !canFloat);
  // Chrome and Edge use the floating drop box; the page's own drop area is for browsers that can't float it.
  // Dropping anywhere on the page still works in every browser.
  $('#dropZone').hidden = canFloat;
  $('#floatNote').innerHTML = !canFloat
    ? "<b>This browser can't float the drop box.</b> It works in Chrome or Edge. Here, put this window beside Outlook (on Windows: Windows key + Left arrow) and drag emails onto the big area below."
    : S.pip ? 'The drop box is floating on your screen. Your list is below.' : '';
  $('#modeNote').innerHTML = S.code
    ? '<b>Live:</b> receipts are read by Claude and converted into Excel.'
    : '<b>Demo mode:</b> results are sample data, so you can practise the flow. Enter an access code to read real receipts.';
}

// ---------- detail / edit ----------

const FIELDS = [
  ['vendor', 'Vendor', 'text', true], ['date', 'Date', 'date'], ['time', 'Time', 'time'], ['receipt_number', 'Receipt #', 'text'], ['invoice_number', 'Invoice #', 'text'],
  ['subtotal', 'Subtotal', 'num'], ['gst', 'GST', 'num'], ['pst', 'PST', 'num'], ['hst', 'HST', 'num'],
  ['other_tax', 'Other tax', 'num'], ['tip', 'Tip', 'num'], ['total', 'Total', 'num'], ['currency', 'Currency', 'text'],
];
const CATEGORIES = ['meals', 'travel', 'lodging', 'fuel', 'office_supplies', 'software', 'equipment', 'telecom', 'professional_services', 'other'];

function closeModal() { $('#modalRoot').innerHTML = ''; }

// A PDF shown in the review window: a blob link, since browsers won't show a data: PDF in a frame.
function pdfUrl(part) {
  if (!part.blobUrl) {
    const bytes = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
    part.blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }
  return part.blobUrl;
}

// An email shown the way it was written, in a frame that can't run scripts, follow links or load
// anything from the internet (which would tell the sender it was opened).
function emailDoc(it) {
  const x = it.extraction || {};
  const head = [
    ['From', it.fromEmail?.sender || x.email_sender],
    ['Subject', it.fromEmail?.subject || x.email_subject],
    ['Date', it.emailDate || x.email_date],
  ].filter(([, v]) => v).map(([k, v]) => `<div><b>${k}:</b> ${esc(v)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
    <style>body{margin:0;background:#fff;color:#111;font:14px/1.5 system-ui,sans-serif}.mail-head{padding:14px 18px;border-bottom:1px solid #ddd;background:#f6f6f4;font-size:13px}.mail-body{padding:16px 18px}img{max-width:100%;height:auto}</style>
    </head><body><div class="mail-head">${head}</div><div class="mail-body">${it.html}</div></body></html>`;
}

// Expand: the document full screen, to read the email (or PDF, or picture) properly.
function openViewer(it, doc = document) {
  const body = it.images.length
    ? it.images.map((p, i) => (p.pdf ? `<iframe class="viewer-doc" src="${pdfUrl(p)}" title="${esc(it.name || 'PDF')}"></iframe>` : `<img class="viewer-img" src="${p.dataUrl}" alt="Receipt image ${i + 1}">`)).join('')
    : it.html ? `<iframe class="viewer-doc" sandbox srcdoc="${esc(emailDoc(it))}" title="The email"></iframe>`
      : `<pre class="viewer-text">${esc(it.text || '')}</pre>`;
  let root = doc.getElementById('viewerRoot');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'viewerRoot';
    doc.body.append(root);
  }
  root.innerHTML = `<div class="viewer" role="dialog" aria-modal="true" aria-label="${esc(label(it))}">
    <div class="viewer-head"><b>${esc(label(it))}</b><button class="btn sm" data-viewer-close>${ICON.x}Close</button></div>
    <div class="viewer-body">${body}</div></div>`;
  root.querySelector('[data-viewer-close]').addEventListener('click', () => closeViewer(doc));
}

function closeViewer(doc = document) {
  const root = doc.getElementById('viewerRoot');
  if (!root?.innerHTML) return false;
  root.innerHTML = '';
  return true;
}

function openDetail(it, focusField) {
  const x = it.extraction || { ...BLANK, currency: 'CAD' };
  const imgs = it.images.map((p, i) => (p.pdf
    ? `<iframe class="pdf-view" src="${pdfUrl(p)}" title="${esc(it.name || 'Receipt PDF')}"></iframe><a class="pdf-open" href="${pdfUrl(p)}" target="_blank" rel="noopener">Open the PDF in a new tab</a>`
    : `<img src="${p.dataUrl}" alt="Receipt image ${i + 1}">`)).join('') || (it.html ? `<iframe class="email-view" sandbox srcdoc="${esc(emailDoc(it))}" title="The email"></iframe>` : it.text ? `<pre class="pasted">${esc(it.text)}</pre>` : '<div class="pdfbox">No image</div>');
  const tools = it.images.length || it.html || it.text ? `<div class="doc-tools"><button type="button" class="btn sm" data-m="expand">${ICON.expand}Expand</button>${it.html ? '<span class="muted">Pictures from the internet are hidden for privacy.</span>' : ''}</div>` : '';
  const issues = (it.issues?.length ? it.issues : [{ level: 'green', text: 'Looks good. Nothing to fix.' }])
    .map((i) => `<div class="issue ${i.level}">${esc(i.text)}${i.detail ? `. ${esc(i.detail)}` : ''}${i.more ? `<span class="more-text">${esc(i.more)}</span>` : ''}</div>`).join('');
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
        <div class="imgs">${tools}${imgs}</div>
        <div class="fields">
          <div class="issues">${issues}</div>
          ${inputs}
          <label class="wide">Type<select name="type">${TYPES.map(([v, n]) => `<option value="${v}" ${typeOf(it) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="wide">Your note<textarea name="note" rows="2" placeholder="For example: installment 2 of 3">${esc(it.userNote || '')}</textarea></label>
          <label class="wide">Follow-up<select name="followUp"><option value="">None</option>${Object.entries(FOLLOW_UP).map(([v, n]) => `<option value="${v}" ${it.followUp === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="wide">Category<select name="category"><option value="">Unknown</option>${CATEGORIES.map((c) => `<option value="${c}" ${x.category === c ? 'selected' : ''}>${titleCase(c)}</option>`).join('')}</select></label>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
        </div>
      </form>
      <div class="modal-foot">
        <div style="display:flex;gap:8px">
          <button class="btn danger" data-m="delete">${ICON.trash}Delete</button>
          ${it.source === 'upload' ? `<button class="btn" data-m="fix">${ICON.file}Replace file</button>` : ''}
        </div>
        <div style="display:flex;gap:8px"><button class="btn" data-close>Cancel</button>
          ${(it.level === 'yellow' || it.level === 'red') && cents(x.total) !== null ? `<button class="btn keep" data-m="keep">${ICON.check}Keep, it's right</button>` : ''}
          <button class="btn primary" data-m="save">Save changes</button></div>
      </div>
    </div></div>`;

  const root = $('#modalRoot');
  if (focusField) root.querySelector(`input[name="${focusField}"]`)?.focus();
  root.querySelector('.overlay').addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target.closest('button[data-close]')) return closeModal();
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (m === 'delete') { closeModal(); removeItem(it.id); }
    if (m === 'keep') { closeModal(); keepItem(it); }
    if (m === 'expand') openViewer(it);
    if (m === 'fix') { closeModal(); startFix(it); }
    if (m === 'save') {
      const form = new FormData($('#editForm'));
      const values = Object.fromEntries([...FIELDS.map(([f]) => f), 'category', 'type', 'note', 'followUp'].map((f) => [f, form.get(f)]));
      const err = applyEdits(it, values);
      if (err) return toast(err);
      closeModal();
      toast('Saved.');
    }
  });
}

// ---------- Excel export ----------


// Amounts as numbers for Excel, negative for a refund.
const money2 = (it, field) => { const c = signedCents(it, field); return c === null ? null : c / 100; };

const EXPORT_COLUMNS = [
  ['Employee name', () => S.user.name], ['Employee email', () => S.user.email],
  ['Department', () => S.user.department || ''], ['Employee ID', () => S.user.employeeId || ''],
  ['Status', (it) => ({ green: 'Ready', yellow: 'Check', grey: 'Not counted' }[it.level] || 'Fix')],
  ['Type', (it, x) => (it.installment ? 'Installment payment' : it.payment ? 'Payment' : titleCase(x.document_type || 'receipt'))],
  ['Follow-up', (it) => FOLLOW_UP[it.followUp] || ''],
  ['Vendor', (it, x) => x.vendor], ['Date', (it, x) => x.date], ['Time', (it, x) => x.time], ['Receipt #', (it, x) => x.receipt_number], ['Invoice #', (it, x) => x.invoice_number],
  ['Subtotal', (it) => money2(it, 'subtotal')], ['GST', (it) => money2(it, 'gst')], ['PST', (it) => money2(it, 'pst')], ['HST', (it) => money2(it, 'hst')],
  ['Other tax', (it) => money2(it, 'other_tax')], ['Tip', (it) => money2(it, 'tip')], ['Total', (it) => money2(it, 'total')], ['Currency', (it, x) => x.currency],
  ['Category', (it, x) => titleCase(x.category)], ['Payment', (it, x) => titleCase(x.payment_method)],
  ['Notes', (it) => [it.userNote && `Your note: ${it.userNote}`, linkLine(it), ...(it.issues || []).map((i) => i.text)].filter(Boolean).join('; ')],
  ['Source', (it) => sourceLabel(it)],
  ['Manual fields', (it) => (it.manual || []).map(fieldName).join(', ')],
  ['File', (it) => it.name || ''],
];

// What goes in the Excel: everything, or only the ready (green) receipts if the person chose that.
let exportScope = 'all';
// Who submitted it always goes in, so finance can tell people's files apart.
const REQUIRED_COLUMNS = ['Employee name', 'Employee email', 'Department'];

// The (?) beside each column in the download window.
const COLUMN_HELP = {
  'Employee name': 'Your name, on every row, so finance knows whose receipts these are. Always included.',
  'Employee email': 'Your email, on every row. Always included.',
  Department: 'Your department, on every row, so receipts can be charged to the right budget. Always included.',
  'Employee ID': 'Your employee number, if your company uses one. Optional: leave it empty if you don\'t have one.',
  Status: 'Ready (checked and counted), Check (needs a look), Fix (invalid or failed) or Not counted. The row colour matches.',
  Type: 'Receipt (proof of payment), Invoice (a bill), Payment or Installment payment (one payment of several on a bill) or Refund (money back).',
  'Follow-up': 'Needs review or For refund, if the receipt was sent to one of those tabs.',
  Vendor: 'The business that was paid, as printed on the receipt.',
  Date: 'The date of the purchase on the receipt, as year-month-day.',
  Time: 'The time of the purchase, from the receipt or else the email it came in. Used to spot paying twice.',
  'Receipt #': 'The receipt, transaction or order number printed on it.',
  'Invoice #': 'The invoice number, if one is printed. An invoice and its receipt share it.',
  Subtotal: 'The amount before tax and tip.',
  GST: 'Goods and Services Tax (federal, 5%).',
  PST: 'Provincial Sales Tax, including Quebec QST and Manitoba RST.',
  HST: 'Harmonized Sales Tax: GST and PST combined, in provinces like Ontario and the Atlantic provinces.',
  'Other tax': 'Any other tax or fee shown as a tax line, like a deposit or an environmental fee.',
  Tip: 'The tip or gratuity, if any.',
  Total: 'The total paid, as printed. Refunds show as a negative amount.',
  Currency: 'The currency, like CAD or USD.',
  Category: 'The kind of expense: meals, travel, lodging, fuel, office supplies, software and so on.',
  Payment: 'How it was paid: credit card, debit, cash, e-transfer, cheque or other.',
  Notes: 'Your own note first, then what the checks found, like a possible duplicate, and how a row links to others.',
  Source: 'How it got in: Upload (a dropped or chosen file), Email (a dragged email) or Paste, plus manual input if someone typed a value.',
  'Manual fields': 'Which values a person typed or changed by hand.',
  File: 'The file name the receipt came from.',
};

const exportRows = () => active().filter((i) => i.extraction && (exportScope === 'all' || i.level === 'green')).sort((a, b) => a.id - b.id);

// Before a download that would include receipts still needing a look, say which and ask. All green: no question.
function confirmExport() {
  exportScope = 'all';
  const rows = exportRows();
  if (!rows.length) return toast('Nothing to export yet.');
  const flagged = rows.filter((i) => i.level !== 'green');
  if (!flagged.length) return openExport();
  const ready = rows.length - flagged.length;
  const kinds = [
    [flagged.filter((i) => i.issues?.some((x) => x.dup && !x.charge)).length, 'might be a duplicate', 'might be duplicates'],
    [flagged.filter((i) => i.issues?.some((x) => x.charge)).length, 'might be paid twice', 'might be paid twice'],
    [flagged.filter((i) => i.level === 'yellow' && !i.issues?.some((x) => x.dup)).length, 'has a warning to check', 'have a warning to check'],
    [flagged.filter((i) => i.level === 'red').length, 'is invalid or failed', 'are invalid or failed'],
    [flagged.filter((i) => i.level === 'grey').length, "isn't counted (linked to another row)", "aren't counted (linked to another row)"],
  ].filter(([n]) => n).map(([n, one, many]) => `<li><b>${n}</b> ${n === 1 ? one : many}</li>`).join('');
  const names = flagged.slice(0, 6).map((i) => `<li>${esc(label(i))}${cents(i.extraction?.total) !== null ? ` · ${money(signedCents(i), i.extraction.currency)}` : ''}: ${esc(i.issues?.[0]?.text || '')}</li>`).join('');
  $('#modalRoot').innerHTML = `<div class="overlay" data-close><div class="modal export" role="dialog" aria-modal="true" aria-label="Some receipts need a look">
    <div class="modal-head"><h3>Download including receipts that need a look?</h3><button class="trash" data-close aria-label="Close">${ICON.x}</button></div>
    <div class="export-body">
      <p>${flagged.length} of your ${rows.length} receipts aren't ready:</p>
      <ul class="warn-kinds">${kinds}</ul>
      <ul class="warn-list">${names}${flagged.length > 6 ? `<li class="muted">and ${flagged.length - 6} more</li>` : ''}</ul>
      <p class="muted">Their Status column in Excel says Check, Fix or Not counted.</p>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-x="all">Include them (${rows.length})</button>
        <button class="btn primary" data-x="ready" ${ready ? '' : 'disabled'}>Only ready ones (${ready})</button></div></div>
  </div></div>`;
  $('#modalRoot .overlay').addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target.closest('button[data-close]')) return closeModal();
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (!x) return;
    exportScope = x;
    openExport();
  });
}

function cleanFileName(name) {
  const clean = String(name).replace(/\.xlsx$/i, '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return clean || `receipts-${today()}`;
}

function openExport() {
  const rows = exportRows();
  if (!rows.length) return toast('Nothing to export yet.');
  const off = new Set(store.get('rp.exportOff', []));
  $('#modalRoot').innerHTML = `<div class="overlay" data-close><div class="modal export" role="dialog" aria-modal="true" aria-label="Download Excel">
    <div class="modal-head"><h3>Download Excel</h3><button class="trash" data-close aria-label="Close">${ICON.x}</button></div>
    <form class="export-body" id="exportForm">
      <label class="export-name">File name
        <span><input name="filename" type="text" value="receipts-${today()}" autocomplete="off" spellcheck="false"><b>.xlsx</b></span>
      </label>
      <div class="export-user">
        <label>Your name <i class="req">required</i><input name="username" type="text" value="${esc(S.user.name)}" autocomplete="name" required></label>
        <label>Your email <i class="req">required</i><input name="useremail" type="email" value="${esc(S.user.email)}" autocomplete="email" required></label>
        <label>Department <i class="req">required</i><input name="department" type="text" value="${esc(S.user.department || '')}" autocomplete="organization-title" required></label>
        <label>Employee ID <i>optional</i><input name="employeeid" type="text" value="${esc(S.user.employeeId || '')}" autocomplete="off"></label>
      </div>
      <fieldset>
        <legend>Columns to include</legend>
        <div class="export-all"><button type="button" class="link" data-x="all">Tick all</button><button type="button" class="link" data-x="none">Untick all</button></div>
        <div class="export-cols">${EXPORT_COLUMNS.map(([h]) => {
          const required = REQUIRED_COLUMNS.includes(h);
          return `<div class="col-opt"><label title="${required ? 'Always included' : ''}"><input type="checkbox" name="col" value="${esc(h)}" ${required || !off.has(h) ? 'checked' : ''} ${required ? 'disabled' : ''}>${esc(h)}</label><button type="button" class="col-q" data-x="help" data-col="${esc(h)}" aria-label="What is ${esc(h)}?" title="${esc(COLUMN_HELP[h] || '')}">?</button></div>`;
        }).join('')}</div>
        <p class="col-help" id="colHelp" hidden></p>
      </fieldset>
      <p class="add-err" id="exportErr" hidden></p>
    </form>
    <div class="modal-foot"><span class="muted export-count">${rows.length} receipt${rows.length > 1 ? 's' : ''}</span>
      <div style="display:flex;gap:8px"><button class="btn" data-close>Cancel</button><button class="btn primary" data-x="download">Download</button></div></div>
  </div></div>`;
  const root = $('#modalRoot');
  const boxes = () => [...root.querySelectorAll('input[name="col"]')];
  const name = root.querySelector('input[name="filename"]');
  name.select();
  const showErr = (msg) => { $('#exportErr').textContent = msg; $('#exportErr').hidden = false; };
  const go = () => {
    const picked = boxes().filter((b) => b.checked).map((b) => b.value);
    const field = (n) => root.querySelector(`input[name="${n}"]`);
    const user = { name: field('username').value.trim(), email: field('useremail').value.trim(), department: field('department').value.trim(), employeeId: field('employeeid').value.trim() };
    const missing = (n, msg) => { field(n).classList.add('missing'); field(n).focus(); showErr(msg); };
    if (!user.name) return missing('username', 'Type your name (required).');
    if (!/^\S+@\S+\.\S+$/.test(user.email)) return missing('useremail', 'Type your email (required).');
    if (!user.department) return missing('department', 'Type your department (required).');
    S.user = user;
    store.set('rp.user', S.user);
    store.set('rp.exportOff', boxes().filter((b) => !b.checked && !b.disabled).map((b) => b.value));
    const file = cleanFileName(name.value);
    closeModal();
    downloadExcel(file, picked);
  };
  $('#exportForm').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  root.querySelector('.overlay').addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target.closest('button[data-close]')) return closeModal();
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'all' || x === 'none') {
      boxes().forEach((b) => { if (!b.disabled) b.checked = x === 'all'; });
      $('#exportErr').hidden = true;
    }
    if (x === 'help') {
      const col = e.target.closest('[data-col]').dataset.col;
      const help = $('#colHelp');
      const same = !help.hidden && help.dataset.col === col;
      help.dataset.col = col;
      help.innerHTML = `<b>${esc(col)}</b>: ${esc(COLUMN_HELP[col] || '')}`;
      help.hidden = same;
      root.querySelectorAll('.col-q').forEach((q) => q.classList.toggle('on', !same && q.dataset.col === col));
    }
    if (x === 'download') go();
  });
  $('#exportForm').addEventListener('input', (e) => { $('#exportErr').hidden = true; e.target.classList.remove('missing'); });
}

// The download: one row per receipt, coloured by its status, and a sheet explaining the colours.
async function downloadExcel(file, headers) {
  let buildXlsx;
  try {
    ({ buildXlsx } = await import('./xlsx.js'));
  } catch {
    return toast("Couldn't make the Excel file. Check your connection and try again.");
  }
  const columns = EXPORT_COLUMNS.filter(([h]) => headers.includes(h));
  const rows = exportRows();
  const blob = buildXlsx([
    {
      name: 'Receipts',
      headers: columns.map(([h]) => h),
      rows: rows.map((it) => columns.map(([, get]) => get(it, it.extraction) ?? null)),
      levels: rows.map((it) => it.level),
      widths: columns.map(([k]) => Math.max(k.length + 3, k === 'Vendor' || k === 'Notes' ? 30 : k === 'Employee email' || k === 'File' ? 26 : 12)),
      filter: true,
    },
    {
      name: 'Colour key',
      headers: ['Colour', 'Status', 'What it means'],
      rows: [
        ['Green', 'Ready', 'Checked and counted.'],
        ['Yellow', 'Check', 'Needs a look: a possible duplicate, paid twice, a warning, or an unpaid invoice.'],
        ['Red', 'Fix', "Invalid or failed: not a receipt, unreadable, or the total couldn't be read."],
        ['Grey', 'Not counted', 'Linked to another row, like an invoice whose payment is listed, or a refunded second charge.'],
      ],
      levels: ['green', 'yellow', 'red', 'grey'],
      widths: [10, 14, 80],
    },
  ]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${file}.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast(`Downloaded ${file}.xlsx`);
}

// ---------- help tour ----------

const ILL = {
  flow: `<div class="ill"><div class="ill-flow">
    <div class="s">Drag an email<small>from Outlook</small></div><span class="arr">→</span>
    <div class="s">Drop box<small>drop it here</small></div><span class="arr">→</span>
    <div class="s" style="color:var(--green)">✓ Read<small>in seconds</small></div></div></div>`,
  box: `<div class="ill"><div class="box" style="max-width:250px;margin:0 auto">
    <div class="box-head"><span>Drop box</span><span>3 scanned</span></div>
    <div class="dropzone pulse"><b>Drop the email here to scan</b></div>
    <ul class="scan-list">
      <li class="scan green"><span class="att-n">1.</span>✓<div class="att-text"><span class="att-main"><b>$132.24</b> Anthropic</span><span class="att-note"><b class="tag green">Done</b> Receipt, counted</span></div></li>
      <li class="scan yellow"><span class="att-n">2.</span>!<div class="att-text"><span class="att-main"><b>$132.24</b> Anthropic</span><span class="att-note"><b class="tag yellow">Review</b> Invoice for the receipt #1, possible duplicate</span></div></li>
    </ul></div></div>`,
};

const TOUR = [
  { title: 'Drop your receipts, that\'s it', html: '<p>Drag a receipt email from Outlook onto the drop box. Its text and every PDF attached are read, the math is checked, and duplicates are flagged. Nothing to download or save first.</p>' + ILL.flow },
  { target: '#codeField', title: 'Your access code', html: "<p>Type the code you were given. No code? Leave it empty: everything works in demo mode with sample results, so you can practise first.</p>" },
  { target: '#dropBoxBtn', title: 'Open the drop box', html: '<p>Click <b>Open drop box</b>. A small window pops out and stays on top of every window, Outlook included. Drag it next to your inbox.</p><p>Using Firefox or Safari? They can\'t float it: drop emails and files on the area under the heading instead.</p>' },
  { title: 'Drag an email onto it', html: ILL.box + '<ol><li>In your Outlook inbox, press and hold on a receipt email</li><li>Drag it onto <b>Drop the email here to scan</b> and let go</li><li>Each part gets a line: <b>Done</b> (counted), <b>Review</b> (needs a look, with the reason) or <b>Failed</b> (with the reason)</li></ol><p><b>Review</b> opens the document next to what was read, so you can check it and fix anything. <b>Keep</b> says it\'s right: the line turns green and counts. The trash deletes it. <b>Hide done</b> tidies the drop box (those lines stay in your list), and <b>Open the app</b> takes you back here to export.</p>' },
  { title: 'Files, folders and Gmail', html: '<p>Drop PDFs or pictures on the drop box or anywhere on this page, or use <b>Upload files</b> in the drop box. <b>Upload folder</b> reads every file in a folder: receipts, non-receipts, and files it can\'t read are all listed so you can see what happened to each.</p><p><b>Gmail?</b> Gmail can\'t drag emails out. Click in the email, press <b>Ctrl+A</b> then <b>Ctrl+C</b>, and paste it into the <b>Or paste an email\'s text</b> box in the drop box (or press Ctrl+V on this page). For a Gmail attachment, download it, then drag it in.</p>' },
  { target: '.list-card', title: 'Your receipts', html: '<p><b style="color:var(--green)">Green check</b>: counted. <b style="color:var(--amber)">Yellow</b>: check it. <b style="color:var(--red)">Red</b>: needs fixing. Grey: linked to another row and not counted, like an invoice whose payment is in the list.</p><p>Click any row to see it next to the fields and fix anything. <b>Needs review</b> and <b>For refund</b> collect the rows to come back to.</p><p>Tick the boxes to act on several at once: <b>Review later</b>, <b>Archive</b> (out of your list and total, kept under Archived) or <b>Delete</b>. Your list is saved on this computer, so it\'s still here when you come back. <b>Delete all</b> starts fresh.</p>' },
  { title: 'Missing something? Paid twice?', html: '<p><b>Missing a detail?</b> The row shows a <b>+</b> button, like <b>+ Subtotal</b>: click it and type what the receipt says. Its source then says <b>manual input</b>.</p><p><b>Paid twice?</b> The same vendor and amount within 30 minutes gets a warning. Send it to <b>For refund</b>, and when the refund arrives it shows as <b>Refunded</b>. An invoice that was never paid goes to <b>Needs review</b> and isn\'t counted.</p>' },
  { target: '#exportBtn', title: 'Totals and Excel', html: '<p>Your total counts green receipts only, minus refunds, one line per currency. When you\'re done, click <b>Download Excel</b>, name the file, add your name and email, and untick any columns you don\'t need.</p><p>You can open this tour again any time with <b>Help</b>.</p>' },
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
  if (e.key === 'Escape') { if (tourStep >= 0) closeTour(); else if (!closeViewer()) closeModal(); }
  if (tourStep < 0) return;
  if (e.key === 'ArrowRight') { tourStep++; drawTour(); }
  if (e.key === 'ArrowLeft' && tourStep > 0) { tourStep--; drawTour(); }
});

// ---------- wiring ----------

$('#dropBoxBtn').addEventListener('click', () => openPip());
$('#helpBtn').addEventListener('click', () => openTour(0));
$('#exportBtn').addEventListener('click', confirmExport);
$('#pickBtn').addEventListener('click', () => $('#fileInput').click());
$('#pickFolderBtn').addEventListener('click', () => pickFiles(true));
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
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; drop.classList.add('over'); boxEl.classList.add('over'); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { drop.classList.remove('over'); boxEl.classList.remove('over'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove('over');
  boxEl.classList.remove('over');
  takeDrop(e);
});
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } });

window.addEventListener('beforeunload', (e) => {
  if (S.items.some((i) => i.status === 'reading')) { e.preventDefault(); e.returnValue = ''; }
});

render();
restoreSaved();
if (!store.get('rp.toured', false)) setTimeout(() => openTour(0), 500);

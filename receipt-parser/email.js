// Reads an email file dragged out of Outlook: .msg from Outlook for Windows, .eml from most others.
// Returns { sender, subject, date, text, html, attachments: [{ name, type, bytes, inline, cid }] }.
// Written here rather than pulled from a library, so no outside code runs on receipts.

export function readEmailFile(bytes, name) {
  const isMsg = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (isMsg) return readMsg(bytes);
  if (/\.msg$/i.test(name)) throw new Error('Not an Outlook message file');
  return readEml(bytes);
}

// ---------- shared ----------

const utf16 = (b) => new TextDecoder('utf-16le').decode(b).replace(/\0+$/, '');

function latin1(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return s;
}

const charBytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function decodeText(b, charset) {
  try { return new TextDecoder(charset || 'utf-8').decode(b); } catch { return new TextDecoder('utf-8').decode(b); }
}

// Rows and cells kept apart, so "Subtotal" and "12.00" from separate cells don't run together.
export function htmlToText(html) {
  const spaced = String(html)
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n$&')
    .replace(/<\/t[dh]>/gi, ' $&');
  const text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent || '';
  return text.replace(/[ \t ]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

const isPicture = (name, type) => /^image\//i.test(type || '') || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name || '');

// ---------- .msg: an OLE compound file holding MAPI properties ----------

function readCompoundFile(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const sec = 1 << dv.getUint16(30, true);
  const mini = 1 << dv.getUint16(32, true);
  const dirStart = dv.getUint32(48, true);
  const miniCutoff = dv.getUint32(56, true);
  const miniFatStart = dv.getUint32(60, true);
  let difat = dv.getUint32(68, true);
  const difatCount = dv.getUint32(72, true);
  const END = 0xfffffffa;
  const at = (s) => (s + 1) * sec;

  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const s = dv.getUint32(76 + i * 4, true);
    if (s >= END) break;
    fatSectors.push(s);
  }
  for (let k = 0; k < difatCount && difat < END; k++) {
    const per = sec / 4 - 1;
    for (let i = 0; i < per; i++) {
      const s = dv.getUint32(at(difat) + i * 4, true);
      if (s < END) fatSectors.push(s);
    }
    difat = dv.getUint32(at(difat) + per * 4, true);
  }
  const fat = new Uint32Array(fatSectors.length * (sec / 4));
  fatSectors.forEach((s, i) => { for (let j = 0; j < sec / 4; j++) fat[i * (sec / 4) + j] = dv.getUint32(at(s) + j * 4, true); });

  const chain = (start, table) => {
    const out = [];
    const seen = new Set();
    for (let s = start; s < END && s < table.length && !seen.has(s); s = table[s]) { seen.add(s); out.push(s); }
    return out;
  };
  const readChain = (start) => {
    const secs = chain(start, fat);
    const out = new Uint8Array(secs.length * sec);
    secs.forEach((s, i) => out.set(u8.subarray(at(s), at(s) + sec), i * sec));
    return out;
  };

  const dir = readChain(dirStart);
  const ddv = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = ddv.getUint16(o + 64, true);
    entries.push({
      name: len > 2 ? utf16(dir.subarray(o, o + len - 2)) : '',
      type: dir[o + 66],
      left: ddv.getUint32(o + 68, true),
      right: ddv.getUint32(o + 72, true),
      child: ddv.getUint32(o + 76, true),
      start: ddv.getUint32(o + 116, true),
      size: ddv.getUint32(o + 120, true),
    });
  }
  const root = entries[0];
  const miniStream = readChain(root.start);
  const miniFatBytes = readChain(miniFatStart);
  const miniFat = new Uint32Array(miniFatBytes.buffer, 0, Math.floor(miniFatBytes.length / 4));

  const data = (e) => {
    if (e.size < miniCutoff) {
      const out = new Uint8Array(e.size);
      let pos = 0;
      for (const s of chain(e.start, miniFat)) {
        const piece = miniStream.subarray(s * mini, s * mini + mini);
        out.set(piece.subarray(0, Math.min(piece.length, e.size - pos)), pos);
        pos += piece.length;
        if (pos >= e.size) break;
      }
      return out;
    }
    return readChain(e.start).subarray(0, e.size);
  };
  const children = (storage) => {
    const out = [];
    const stack = storage.child < entries.length ? [storage.child] : [];
    const seen = new Set();
    while (stack.length) {
      const i = stack.pop();
      if (i >= entries.length || seen.has(i)) continue;
      seen.add(i);
      const e = entries[i];
      out.push(e);
      if (e.left < entries.length) stack.push(e.left);
      if (e.right < entries.length) stack.push(e.right);
    }
    return out;
  };
  return { root, data, children };
}

function readMsg(u8) {
  const cf = readCompoundFile(u8);
  const propsOf = (storage) => {
    const map = new Map();
    for (const e of cf.children(storage)) if (e.type === 2 && e.name.startsWith('__substg1.0_')) map.set(e.name.slice(12).toUpperCase(), e);
    return map;
  };
  const str = (map, tag) => {
    const unicode = map.get(tag + '001F');
    if (unicode) return utf16(cf.data(unicode)).trim();
    const ansi = map.get(tag + '001E');
    return ansi ? decodeText(cf.data(ansi), 'windows-1252').replace(/\0+$/, '').trim() : '';
  };
  const bin = (map, tag) => { const e = map.get(tag + '0102'); return e ? cf.data(e) : null; };

  const top = propsOf(cf.root);
  const html = bin(top, '1013') ? decodeText(bin(top, '1013')) : str(top, '1013');
  const body = str(top, '1000') || (html ? htmlToText(html) : '');
  const senderName = str(top, '0C1A') || str(top, '0042');
  const senderEmail = str(top, '5D01') || str(top, '0C1F') || str(top, '0065');

  const attachments = [];
  for (const e of cf.children(cf.root)) {
    if (e.type !== 1 || !e.name.startsWith('__attach_version1.0_')) continue;
    const a = propsOf(e);
    const name = str(a, '3707') || str(a, '3704') || 'attachment';
    const type = str(a, '370E');
    // Outlook gives attachments of a forwarded email a content id too, so only a picture with one
    // counts as shown inside the email (a logo); a PDF is always an attachment.
    const cid = str(a, '3712');
    attachments.push({ name, type, bytes: bin(a, '3701'), inline: !!cid && isPicture(name, type), cid });
  }
  return {
    sender: senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderName || senderEmail,
    subject: str(top, '0037'),
    date: '',
    text: body,
    html: html || '',
    attachments,
  };
}

// ---------- .eml: plain MIME ----------

function decodeWords(s) {
  return String(s || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    const b = enc.toUpperCase() === 'B'
      ? charBytes(atob(txt))
      : charBytes(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))));
    return decodeText(b, cs);
  }).replace(/\?=\s+=\?/g, '');
}

function param(value, key) {
  const m = new RegExp(`${key}\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i').exec(value || '');
  return m ? decodeWords(m[1] ?? m[2]) : '';
}

function splitPart(raw) {
  const cut = raw.search(/\r?\n\r?\n/);
  const head = cut < 0 ? raw : raw.slice(0, cut);
  const body = cut < 0 ? '' : raw.slice(cut).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

function walk(raw, out) {
  const { headers, body } = splitPart(raw);
  const type = (headers['content-type'] || 'text/plain').split(';')[0].trim().toLowerCase();
  if (type.startsWith('multipart/')) {
    const boundary = param(headers['content-type'], 'boundary');
    if (!boundary) return;
    const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`));
    for (const p of parts.slice(1)) if (p.trim()) walk(p, out);
    return;
  }
  const encoding = (headers['content-transfer-encoding'] || '').toLowerCase();
  const bytes = encoding === 'base64' ? charBytes(atob(body.replace(/[^A-Za-z0-9+/=]/g, '')))
    : encoding === 'quoted-printable' ? charBytes(body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))))
      : charBytes(body);
  const disposition = headers['content-disposition'] || '';
  const filename = param(disposition, 'filename') || param(headers['content-type'], 'name');
  if (filename || /^attachment/i.test(disposition)) {
    const cid = (headers['content-id'] || '').replace(/[<>]/g, '').trim();
    out.attachments.push({ name: filename || 'attachment', type, bytes, inline: !!cid && isPicture(filename, type), cid });
  } else if (type === 'text/plain' && !out.plain) {
    out.plain = decodeText(bytes, param(headers['content-type'], 'charset'));
  } else if (type === 'text/html' && !out.html) {
    out.html = decodeText(bytes, param(headers['content-type'], 'charset'));
  }
}

function readEml(u8) {
  const raw = latin1(u8);
  const { headers } = splitPart(raw);
  const out = { attachments: [], plain: '', html: '' };
  walk(raw, out);
  return {
    sender: decodeWords(headers.from),
    subject: decodeWords(headers.subject),
    date: headers.date || '',
    text: (out.plain || (out.html ? htmlToText(out.html) : '')).trim(),
    html: out.html || '',
    attachments: out.attachments,
  };
}

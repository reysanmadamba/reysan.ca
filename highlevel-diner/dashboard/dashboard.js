// Highlevel Diner dashboard: hours, menu and art wall.
//
// Sign-in is the same Supabase Auth as the main reysan.ca dashboard; all
// data goes through the reysan.ca backend, which checks the session and
// locks a tenant_admin to their own tenant (api/menu.js, ?resource=site and
// ?resource=art). The publishable key is public by design — it only allows
// signing in here.

const SUPABASE_URL = 'https://kuxukkknasjlfpahcled.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-fVzlBpMI2AoynUYjOyvwA_0FkivXts';
const API = 'https://reysan-ca-backend-77ah.vercel.app/api';
const MAX_SIDE = 1600;

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

// super_admin isn't locked to a tenant, so the backend needs to be told
// which one; tenant_admin gets theirs from the session and sends nothing.
let tenantId = null;

// Hours + menu are edited together and saved in one go.
let content = null;
let savedSnapshot = '';

/* ================= helpers ================= */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function button(label, className, onClick, title) {
    const b = el('button', className, label);
    b.type = 'button';
    if (title) {
        b.title = title;
        b.setAttribute('aria-label', title);
    }
    b.addEventListener('click', onClick);
    return b;
}

// A labelled input bound to obj[key]; typing marks the page as unsaved.
function boundField(label, obj, key, { multiline, placeholder, className } = {}) {
    const wrap = el('label', className, label);
    const input = el(multiline ? 'textarea' : 'input');
    if (multiline) input.rows = 2;
    if (placeholder) input.placeholder = placeholder;
    input.value = obj[key] || '';
    input.addEventListener('input', () => {
        obj[key] = input.value;
        markDirty();
    });
    wrap.append(input);
    return wrap;
}

function tagToggles(obj) {
    const wrap = el('div', 'tag-toggles');
    obj.tags ??= [];
    for (const [tag, label] of [['GF', 'Gluten free'], ['V', 'Vegan']]) {
        const box = el('label', 'check small');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = obj.tags.includes(tag);
        input.addEventListener('change', () => {
            obj.tags = input.checked ? [...obj.tags, tag] : obj.tags.filter((t) => t !== tag);
            markDirty();
        });
        box.append(input, ` ${label}`);
        wrap.append(box);
    }
    return wrap;
}

function moveInArray(arr, index, delta) {
    const to = index + delta;
    if (to < 0 || to >= arr.length) return false;
    [arr[index], arr[to]] = [arr[to], arr[index]];
    return true;
}

function showError(id, message) {
    $(id).textContent = message || '';
    $(id).hidden = !message;
}

let toastTimer;
function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), 3000);
}

/* ================= views & tabs ================= */
function show(view) {
    for (const id of ['loginView', 'noAccessView', 'appView', 'loadingView']) $(id).hidden = id !== view;
    $('signOut').hidden = view === 'loginView' || view === 'loadingView';
    if (view !== 'appView') $('saveBar').hidden = true;
}

function selectTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    for (const t of ['hours', 'menu', 'art']) $(`tab-${t}`).hidden = t !== name;
    document.body.dataset.tab = name; // CSS hides the hours/menu save bar on the Art tab
    try { localStorage.setItem('hl-dash-tab', name); } catch { /* storage blocked */ }
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

/* ================= api ================= */
async function api(path, method = 'GET', body) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Please sign in again.');
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
    return json;
}

function resourceApi(resource, method, body) {
    const query = method === 'GET' && tenantId ? `&tenant_id=${tenantId}` : '';
    const payload = body && tenantId ? { ...body, tenant_id: tenantId } : body;
    return api(`/menu?resource=${resource}${query}`, method, payload);
}

/* ================= session ================= */
async function start() {
    show('loadingView');
    const { data } = await supabase.auth.getSession();
    if (!data.session) return show('loginView');

    try {
        const me = await api('/me');
        if (me.role === 'super_admin') {
            const { tenants } = await api('/tenants');
            const tenant = tenants.find((t) => t.slug === HL.SITE_SLUG);
            if (!tenant) throw new Error(`No "${HL.SITE_SLUG}" account yet. Run highlevel-diner.sql in Supabase first.`);
            tenantId = tenant.id;
        } else if (me.tenant?.slug !== HL.SITE_SLUG) {
            $('noAccessMsg').textContent = 'This account isn’t set up for Highlevel Diner. Sign out and use the Highlevel login.';
            return show('noAccessView');
        }
    } catch (err) {
        $('noAccessMsg').textContent = err.message;
        return show('noAccessView');
    }

    show('appView');
    let tab = 'hours';
    try { tab = localStorage.getItem('hl-dash-tab') || tab; } catch { /* storage blocked */ }
    selectTab(['hours', 'menu', 'art'].includes(tab) ? tab : 'hours');
    loadContent();
    loadPieces();
}

$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('loginError');
    $('loginBtn').disabled = true;
    const { error } = await supabase.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
    });
    $('loginBtn').disabled = false;
    if (error) return showError('loginError', 'Wrong email or password.');
    $('loginPassword').value = '';
    start();
});

$('signOut').addEventListener('click', async () => {
    if (isDirty() && !confirm('You have unsaved changes. Sign out anyway?')) return;
    await supabase.auth.signOut();
    tenantId = null;
    content = null;
    savedSnapshot = '';
    $('grid').replaceChildren();
    show('loginView');
});

/* ================= hours + menu content ================= */
// First visit: nothing saved yet, so start from what the live menu page
// shows today. Nothing changes on the website until they press Save.
async function currentWebsiteMenu() {
    const res = await fetch('../highlevel-menus.html', { cache: 'no-store' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    return HL.extractMenu(doc.getElementById('menuContent') || doc);
}

async function loadContent() {
    showError('contentError');
    try {
        const { content: saved } = await resourceApi('site', 'GET');
        content = {
            hours: saved?.hours?.length === 7 ? saved.hours : structuredClone(HL.DEFAULT_HOURS),
            menu: saved?.menu?.sections?.length ? saved.menu : await currentWebsiteMenu()
        };
        $('firstTimeNotice').hidden = !!saved;
        savedSnapshot = saved ? JSON.stringify(content) : '';
        renderHoursEditor();
        renderMenuEditor();
        updateSaveBar();
    } catch (err) {
        showError('contentError', `Couldn’t load your hours and menu: ${err.message}`);
    }
}

const isDirty = () => content && JSON.stringify(content) !== savedSnapshot;

function updateSaveBar() {
    $('saveBar').hidden = !isDirty();
    $('saveStatus').textContent = savedSnapshot ? 'You have unsaved changes' : 'Not published from the dashboard yet';
    $('discardBtn').hidden = !savedSnapshot;
}

function markDirty() {
    updateSaveBar();
    updateHoursPreview();
}

$('saveBtn').addEventListener('click', async () => {
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Saving…';
    try {
        // Keep editing the same objects the form is bound to; the server
        // stores exactly what was sent.
        await resourceApi('site', 'PUT', content);
        savedSnapshot = JSON.stringify(content);
        $('firstTimeNotice').hidden = true;
        updateSaveBar();
        toast('Saved — the website is updated.');
    } catch (err) {
        alert(`Couldn’t save: ${err.message}`);
    } finally {
        $('saveBtn').disabled = false;
        $('saveBtn').textContent = 'Save changes';
    }
});

$('discardBtn').addEventListener('click', () => {
    if (!confirm('Undo all changes since your last save?')) return;
    loadContent();
});

window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
});

/* ================= hours editor ================= */
function updateHoursPreview() {
    if (!content) return;
    const labels = HL.hoursGroups(content.hours).sort((a, b) => a.closed - b.closed).map(HL.groupLabel);
    $('hoursPreview').textContent = labels.join(' · ');
}

function renderHoursEditor() {
    $('hoursList').replaceChildren(...content.hours.map((day) => {
        const row = el('div', `hours-row${day.closed ? ' is-closed' : ''}`);
        const name = el('span', 'hours-day', day.day);

        const openBox = el('label', 'check');
        const open = el('input');
        open.type = 'checkbox';
        open.checked = !day.closed;
        openBox.append(open, ' Open');

        const times = el('div', 'hours-times');
        const from = el('input');
        from.type = 'time';
        from.value = day.open;
        from.setAttribute('aria-label', `${day.day} opening time`);
        const to = el('input');
        to.type = 'time';
        to.value = day.close;
        to.setAttribute('aria-label', `${day.day} closing time`);
        times.append(from, el('span', 'to', 'to'), to);
        const closedText = el('span', 'closed-text', 'Closed');

        const sync = () => {
            row.classList.toggle('is-closed', day.closed);
            times.hidden = day.closed;
            closedText.hidden = !day.closed;
        };
        open.addEventListener('change', () => { day.closed = !open.checked; sync(); markDirty(); });
        from.addEventListener('input', () => { day.open = from.value; markDirty(); });
        to.addEventListener('input', () => { day.close = to.value; markDirty(); });
        sync();

        row.append(name, openBox, times, closedText);
        return row;
    }));
    updateHoursPreview();
}

/* ================= menu editor ================= */
const openSections = new Set(); // which sections stay expanded across re-renders

function sectionSummaryText(section) {
    if (section.kind === 'happy-hour') return `${section.specials?.length || 0} daily specials`;
    if (section.kind === 'wine') return `${section.tables.reduce((n, t) => n + t.rows.length, 0)} wines`;
    const n = section.items?.length || 0;
    return `${n} item${n === 1 ? '' : 's'}`;
}

function rowControls(arr, index, rerender, what) {
    const wrap = el('div', 'row-controls');
    const up = button('↑', 'icon-btn', () => moveInArray(arr, index, -1) && (markDirty(), rerender()), `Move ${what} up`);
    const down = button('↓', 'icon-btn', () => moveInArray(arr, index, 1) && (markDirty(), rerender()), `Move ${what} down`);
    up.disabled = index === 0;
    down.disabled = index === arr.length - 1;
    const remove = button('✕', 'icon-btn danger', () => {
        const name = arr[index].name || arr[index].title || `this ${what}`;
        if (!confirm(`Remove "${name}"?`)) return;
        arr.splice(index, 1);
        markDirty();
        rerender();
    }, `Remove ${what}`);
    wrap.append(up, down, remove);
    return wrap;
}

function itemsEditor(section, rerender) {
    const list = el('div', 'item-list');
    section.items.forEach((item, i) => {
        const card = el('div', 'item-card');
        const top = el('div', 'item-top');
        top.append(
            boundField('Name', item, 'name', { className: 'grow' }),
            boundField('Price', item, 'price', { placeholder: '$0.00', className: 'price' })
        );
        card.append(
            top,
            boundField('Description', item, 'description', { multiline: true, placeholder: 'Optional' }),
            el('div', 'item-bottom')
        );
        card.lastChild.append(tagToggles(item), rowControls(section.items, i, rerender, 'item'));
        list.append(card);
    });
    const add = button('+ Add item', 'btn-outline small', () => {
        section.items.push({ name: '', tags: [], price: '', description: '' });
        markDirty();
        rerender();
        list.parentElement.querySelector('.item-card:last-of-type input')?.focus();
    });
    const wrap = el('div');
    wrap.append(list, add);
    return wrap;
}

function happyHourEditor(section, rerender) {
    const wrap = el('div');
    const grid = el('div', 'field-grid');
    grid.append(
        boundField('When', section, 'time', { placeholder: '2pm – 7pm Daily' }),
        boundField('Deal', section, 'deal', { placeholder: '6oz House Wine · Pints' }),
        boundField('Deal price', section, 'dealPrice', { placeholder: '$7.00' }),
        boundField('Specials heading', section, 'specialsTitle')
    );
    const list = el('div', 'item-list');
    section.specials.forEach((special, i) => {
        const card = el('div', 'item-card');
        card.append(
            boundField('Special', special, 'name', { placeholder: 'Tequila Tuesday' }),
            boundField('Details', special, 'detail', { placeholder: 'Any 1oz tequila cocktail $7.50' }),
            rowControls(section.specials, i, rerender, 'special')
        );
        list.append(card);
    });
    wrap.append(grid, el('h4', 'sub-heading', 'Daily specials'), list, button('+ Add special', 'btn-outline small', () => {
        section.specials.push({ name: '', detail: '' });
        markDirty();
        rerender();
    }));
    return wrap;
}

function wineEditor(section, rerender) {
    const wrap = el('div');
    section.tables.forEach((table, ti) => {
        const box = el('div', 'wine-box');
        const head = el('div', 'wine-head');
        head.append(boundField('Wine list name', table, 'title', { className: 'grow' }), rowControls(section.tables, ti, rerender, 'wine list'));
        box.append(head);

        const cols = el('div', 'wine-cols');
        cols.append(el('span', 'muted small-text', 'Price columns:'));
        table.columns.forEach((_, ci) => {
            const input = el('input', 'col-input');
            input.value = table.columns[ci];
            input.placeholder = '(none)';
            input.setAttribute('aria-label', `Price column ${ci + 1}`);
            input.addEventListener('input', () => { table.columns[ci] = input.value; markDirty(); });
            cols.append(input);
        });
        box.append(cols);

        const list = el('div', 'item-list');
        table.rows.forEach((row, ri) => {
            const card = el('div', 'item-card');
            const top = el('div', 'item-top');
            top.append(boundField('Wine', row, 'name', { className: 'grow' }), boundField('Grape / region', row, 'detail', { className: 'grow' }));
            const prices = el('div', 'wine-prices');
            table.columns.forEach((col, ci) => {
                const label = el('label', 'price', col || `Price ${ci + 1}`);
                const input = el('input');
                input.value = row.prices[ci] || '';
                input.addEventListener('input', () => { row.prices[ci] = input.value; markDirty(); });
                label.append(input);
                prices.append(label);
            });
            card.append(top, prices, rowControls(table.rows, ri, rerender, 'wine'));
            list.append(card);
        });
        box.append(list, button('+ Add wine', 'btn-outline small', () => {
            table.rows.push({ name: '', detail: '', prices: table.columns.map(() => '') });
            markDirty();
            rerender();
        }));
        wrap.append(box);
    });
    return wrap;
}

function renderMenuEditor() {
    const sections = content.menu.sections;
    const rerender = () => renderMenuEditor();

    $('menuSections').replaceChildren(...sections.map((section, si) => {
        const details = el('details', 'menu-sec');
        details.open = openSections.has(section);
        details.addEventListener('toggle', () => (details.open ? openSections.add(section) : openSections.delete(section)));

        const summary = el('summary');
        const titleWrap = el('span', 'sec-title-wrap');
        if (section.heading) titleWrap.append(el('span', 'sec-heading', section.heading));
        titleWrap.append(el('span', 'sec-title', section.title || 'Untitled section'), el('span', 'sec-count', sectionSummaryText(section)));
        summary.append(titleWrap, el('span', 'chev', '▾'));
        details.append(summary);

        const body = el('div', 'sec-body');
        const fields = el('div', 'field-grid');
        fields.append(boundField('Section name', section, 'title'));
        if (section.kind !== 'happy-hour') {
            fields.append(
                boundField('Note under the name', section, 'subtitle', { placeholder: 'e.g. $9.50 or Served 8am–11am' }),
                boundField('Group heading above it', section, 'heading', { placeholder: 'Optional, e.g. Drinks' })
            );
        }
        body.append(fields);

        if (section.kind === 'happy-hour') body.append(happyHourEditor(section, rerender));
        else if (section.kind === 'wine') body.append(wineEditor(section, rerender));
        else body.append(itemsEditor(section, rerender));

        const footer = el('div', 'sec-footer');
        footer.append(el('span', 'muted small-text', 'Section:'), rowControls(sections, si, rerender, 'section'));
        body.append(footer);

        // section name edits should update the closed header without a re-render
        body.querySelector('input')?.addEventListener('input', (e) => {
            titleWrap.querySelector('.sec-title').textContent = e.target.value || 'Untitled section';
        });

        details.append(body);
        return details;
    }));
}

$('addSection').addEventListener('click', () => {
    const section = { kind: 'items', anchor: '', heading: '', title: 'New section', tags: [], subtitle: '', items: [] };
    content.menu.sections.push(section);
    openSections.add(section);
    markDirty();
    renderMenuEditor();
    $('menuSections').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ================= art ================= */
// Phone photos are often 5–10 MB, over Vercel's request body limit. Shrink
// to at most 1600px on the long side and re-encode as JPEG — plenty for a
// gallery, and usually well under 1 MB.
async function resizeToDataUrl(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
}

let previewUrl = null;
$('fileInput').addEventListener('change', () => {
    const file = $('fileInput').files[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = file ? URL.createObjectURL(file) : null;
    $('preview').src = previewUrl || '';
    $('preview').hidden = !file;
    $('dropText').hidden = !!file;
});

$('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('uploadError');
    const file = $('fileInput').files[0];
    const title = $('titleInput').value.trim();
    const artist = $('artistInput').value.trim();
    if (!file) return showError('uploadError', 'Choose an image first.');
    if (!title || !artist) return showError('uploadError', 'A title and the artist’s name are required.');

    $('uploadBtn').disabled = true;
    $('uploadBtn').textContent = 'Uploading…';
    try {
        await resourceApi('art', 'POST', {
            title,
            artist_name: artist,
            description: $('descInput').value.trim() || undefined,
            published: $('publishInput').checked,
            image: await resizeToDataUrl(file)
        });
        $('uploadForm').reset();
        $('fileInput').dispatchEvent(new Event('change'));
        toast('Art uploaded.');
        loadPieces();
    } catch (err) {
        showError('uploadError', err.message);
    } finally {
        $('uploadBtn').disabled = false;
        $('uploadBtn').textContent = 'Upload art';
    }
});

function artField(label, value, multiline) {
    const wrap = el('label', null, label);
    const input = el(multiline ? 'textarea' : 'input');
    if (multiline) input.rows = 3;
    input.value = value || '';
    wrap.append(input);
    return { wrap, input };
}

function renderPiece(piece) {
    const card = el('article', `piece${piece.published ? '' : ' is-hidden'}`);
    const img = el('img');
    img.src = piece.image_url;
    img.alt = `${piece.title} by ${piece.artist_name}`;
    img.loading = 'lazy';

    const body = el('div', 'piece-body');
    const actions = el('div', 'actions');
    const error = el('p', 'error');
    error.hidden = true;

    async function run(action, done) {
        actions.querySelectorAll('button').forEach((b) => (b.disabled = true));
        error.hidden = true;
        try {
            await action();
            if (done) toast(done);
            loadPieces();
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            actions.querySelectorAll('button').forEach((b) => (b.disabled = false));
        }
    }

    function viewMode() {
        body.replaceChildren(
            el('span', `pill${piece.published ? '' : ' off'}`, piece.published ? 'On website' : 'Hidden'),
            el('div', 'piece-title', piece.title),
            el('div', 'piece-artist', `by ${piece.artist_name}`)
        );
        if (piece.description) body.append(el('p', 'piece-desc', piece.description));
        actions.replaceChildren(
            button('Edit', null, editMode),
            button(piece.published ? 'Hide' : 'Show', null, () =>
                run(() => resourceApi('art', 'PATCH', { id: piece.id, published: !piece.published }),
                    piece.published ? 'Hidden from the website.' : 'Now showing on the website.')),
            button('Delete', 'danger', () => {
                if (!confirm(`Delete "${piece.title}" by ${piece.artist_name}? This can’t be undone.`)) return;
                run(() => resourceApi('art', 'DELETE', { id: piece.id }), 'Deleted.');
            })
        );
        body.append(actions, error);
    }

    function editMode() {
        const title = artField('Title', piece.title);
        const artist = artField('Artist’s name', piece.artist_name);
        const desc = artField('Description', piece.description, true);
        body.replaceChildren(title.wrap, artist.wrap, desc.wrap);
        actions.replaceChildren(
            button('Save', 'primary', () => {
                if (!title.input.value.trim() || !artist.input.value.trim()) {
                    error.textContent = 'Title and artist are required.';
                    error.hidden = false;
                    return;
                }
                run(() => resourceApi('art', 'PATCH', {
                    id: piece.id,
                    title: title.input.value.trim(),
                    artist_name: artist.input.value.trim(),
                    description: desc.input.value.trim() || null
                }), 'Saved.');
            }),
            button('Cancel', null, viewMode)
        );
        body.append(actions, error);
    }

    viewMode();
    card.append(img, body);
    return card;
}

async function loadPieces() {
    showError('listError');
    try {
        const { pieces = [] } = await resourceApi('art', 'GET');
        $('grid').replaceChildren(...pieces.map(renderPiece));
        $('count').textContent = `(${pieces.length})`;
        $('emptyMsg').hidden = pieces.length > 0;
    } catch (err) {
        showError('listError', err.message);
    }
}

start();

// Shared by the public site (main.js) and the dashboard: the editable
// content's shape, how to read it out of the static menu page, and how to
// render it back into the page.
//
//   hours: [{ day, closed, open: "08:00", close: "21:00" }]  Monday → Sunday
//   menu:  { sections: [...] }, each section one of
//     { kind: "items", anchor, heading, title, tags, subtitle,
//       items: [{ name, tags, price, description }] }
//     { kind: "happy-hour", anchor, title, time, deal, dealPrice,
//       specialsTitle, specials: [{ name, detail }] }
//     { kind: "wine", anchor, heading, title, tags, subtitle,
//       tables: [{ title, columns: [...], rows: [{ name, detail, prices: [...] }] }] }
//
// Everything is rendered with textContent, never innerHTML, since the
// content is typed into the dashboard.

window.HL = (() => {
    const API = "https://reysan-ca-backend-77ah.vercel.app/api/menu";
    const SITE_SLUG = "highlevel-diner";
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const TAGS = ["GF", "V"];

    const DEFAULT_HOURS = DAYS.map(day => ({ day, closed: day === "Monday", open: "08:00", close: "21:00" }));

    /* ---------- fetch ---------- */
    let sitePromise = null;
    function fetchSiteContent() {
        sitePromise ??= fetch(`${API}?resource=site&public=${SITE_SLUG}`)
            .then(res => (res.ok ? res.json() : {}))
            .then(json => json.content || null)
            .catch(() => null);
        return sitePromise;
    }

    /* ---------- dom helpers ---------- */
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function tagSpans(tags) {
        return (tags || []).filter(t => TAGS.includes(t)).flatMap(t => [" ", el("span", `diet-tag ${t === "V" ? "vg" : "gf"}`, t)]);
    }

    /* ---------- hours ---------- */
    function formatTime(hhmm) {
        const [h, m] = (hhmm || "00:00").split(":").map(Number);
        const suffix = h >= 12 ? "pm" : "am";
        const hour = h % 12 || 12;
        return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
    }

    const dayRange = day => (day.closed ? "Closed" : `${formatTime(day.open)} – ${formatTime(day.close)}`);

    // Runs of consecutive days with identical hours, starting the week where
    // the hours change so a run like Sat–Sun–Mon isn't split at the Sunday
    // → Monday boundary.
    function hoursGroups(hours) {
        const same = (a, b) => a.closed === b.closed && (a.closed || (a.open === b.open && a.close === b.close));
        let start = hours.findIndex((d, i) => !same(d, hours[(i + 6) % 7]));
        if (start < 0) return [{ days: hours.map(d => d.day), ...hours[0] }];
        const groups = [];
        for (let n = 0; n < 7; n++) {
            const day = hours[(start + n) % 7];
            const last = groups[groups.length - 1];
            if (last && same(last, day)) last.days.push(day.day);
            else groups.push({ days: [day.day], closed: day.closed, open: day.open, close: day.close });
        }
        return groups;
    }

    function groupLabel(group) {
        const { days } = group;
        const span = days.length === 1 ? days[0] : days.length === 2 ? `${days[0]} & ${days[1]}` : `${days[0]} to ${days[days.length - 1]}`;
        if (group.closed) return days.length === 1 ? `Closed ${days[0]}s` : `Closed ${span}`;
        return days.length === 7 ? `Daily: ${dayRange(group)}` : `${span}: ${dayRange(group)}`;
    }

    // Fills every [data-hours] element on the page:
    //   inline → "Tuesday to Sunday: 8am – 9pm · Closed Mondays"
    //   footer → same, joined with " | "
    //   lines  → one <p> per group
    //   table  → one row per day (Find Us page)
    function renderHours(hours) {
        if (!Array.isArray(hours) || hours.length !== 7) return;
        const labels = hoursGroups(hours).sort((a, b) => a.closed - b.closed).map(groupLabel);
        document.querySelectorAll("[data-hours]").forEach(node => {
            const mode = node.dataset.hours;
            if (mode === "inline") node.textContent = labels.join(" · ");
            else if (mode === "footer") node.textContent = labels.join(" | ");
            else if (mode === "lines") node.replaceChildren(...labels.map(l => el("p", null, l)));
            else if (mode === "table") {
                node.replaceChildren(...hours.map(d => {
                    const tr = el("tr");
                    tr.append(el("td", null, d.day), el("td", null, dayRange(d)));
                    return tr;
                }));
            }
        });
    }

    /* ---------- menu: read from the static page ---------- */
    const clean = s => (s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
    const textNoTags = node => {
        const copy = node.cloneNode(true);
        copy.querySelectorAll(".diet-tag").forEach(t => t.remove());
        return clean(copy.textContent);
    };
    const tagsOf = node => [...node.querySelectorAll(".diet-tag")].map(t => t.textContent.trim());

    function extractMenu(root) {
        const sections = [];
        for (const block of root.querySelectorAll(".menu-section, .happy-hour")) {
            if (block.classList.contains("happy-hour")) {
                const deal = block.querySelector(".happy-hour-deal");
                const dealPrice = clean(deal.querySelector("span")?.textContent);
                sections.push({
                    kind: "happy-hour",
                    anchor: block.id || "",
                    title: clean(block.querySelector("h2")?.textContent),
                    time: clean(block.querySelector(".happy-hour-time")?.textContent),
                    deal: clean(deal.textContent).replace(dealPrice, "").trim(),
                    dealPrice,
                    specialsTitle: clean(block.querySelector("h3")?.textContent),
                    specials: [...block.querySelectorAll(".special")].map(s => ({
                        name: clean(s.querySelector("h4")?.textContent),
                        detail: clean(s.querySelector("p")?.textContent)
                    }))
                });
                continue;
            }

            const kids = [...block.children];
            let heading = "";
            let anchorUsed = false;
            kids.forEach((k, i) => {
                if (!k.classList.contains("menu-section-title")) return;
                // a title directly followed by another title is a group heading
                if (kids[i + 1]?.classList.contains("menu-section-title")) return void (heading = textNoTags(k));

                const section = {
                    kind: "items",
                    anchor: anchorUsed ? "" : block.id || "",
                    heading,
                    title: textNoTags(k),
                    tags: tagsOf(k),
                    subtitle: "",
                    items: []
                };
                anchorUsed = true;
                heading = "";

                let next = kids[i + 1];
                if (next?.classList.contains("menu-section-sub")) {
                    section.subtitle = clean(next.textContent);
                    next = kids[i + 2];
                }
                if (next?.classList.contains("menu-grid")) {
                    section.items = [...next.querySelectorAll(".menu-item")].map(item => ({
                        name: textNoTags(item.querySelector(".menu-item-name")),
                        tags: tagsOf(item.querySelector(".menu-item-name")),
                        price: clean(item.querySelector(".menu-item-price")?.textContent),
                        description: clean(item.querySelector(".menu-item-desc")?.textContent)
                    }));
                } else if (next?.classList.contains("wine-wrap")) {
                    section.kind = "wine";
                    delete section.items;
                    section.tables = [...next.querySelectorAll("table")].map(table => {
                        const heads = [...table.querySelectorAll("thead th")].map(th => clean(th.textContent));
                        return {
                            title: heads[0],
                            columns: heads.slice(1),
                            rows: [...table.querySelectorAll("tbody tr")].map(tr => {
                                const cells = [...tr.children];
                                return {
                                    name: clean(cells[0].querySelector("strong")?.textContent),
                                    detail: clean(cells[0].querySelector("span")?.textContent),
                                    prices: cells.slice(1).map(td => clean(td.textContent))
                                };
                            })
                        };
                    });
                }
                sections.push(section);
            });
        }
        return { sections };
    }

    /* ---------- menu: render into the page ---------- */
    function sectionTitle(text, tags, extraTop) {
        const title = el("div", "menu-section-title", text);
        title.append(...tagSpans(tags));
        if (extraTop) title.style.marginTop = "16px";
        return title;
    }

    function renderItems(section) {
        const grid = el("div", "menu-grid");
        for (const item of section.items || []) {
            const node = el("div", "menu-item");
            const header = el("div", "menu-item-header");
            const name = el("span", "menu-item-name", item.name);
            name.append(...tagSpans(item.tags));
            header.append(name);
            if (item.price) header.append(el("span", "menu-item-price", item.price));
            node.append(header);
            if (item.description) node.append(el("div", "menu-item-desc", item.description));
            grid.append(node);
        }
        return grid;
    }

    function renderWine(section) {
        const wrap = el("div", "wine-wrap");
        for (const t of section.tables || []) {
            const table = el("table", "wine-table");
            const headRow = el("tr");
            headRow.append(el("th", null, t.title), ...t.columns.map(c => el("th", null, c)));
            const thead = el("thead");
            thead.append(headRow);
            const tbody = el("tbody");
            for (const row of t.rows) {
                const tr = el("tr");
                const first = el("td");
                first.append(el("strong", null, row.name), el("span", null, row.detail));
                tr.append(first, ...t.columns.map((_, i) => el("td", null, row.prices[i] || "")));
                tbody.append(tr);
            }
            table.append(thead, tbody);
            wrap.append(table);
        }
        return wrap;
    }

    function renderHappyHour(section) {
        const block = el("div", "happy-hour");
        if (section.anchor) block.id = section.anchor;
        const deal = el("p", "happy-hour-deal", section.deal);
        if (section.dealPrice) deal.append(" ", el("span", null, section.dealPrice));
        const grid = el("div", "specials-grid");
        for (const s of section.specials || []) {
            const card = el("div", "special");
            card.append(el("h4", null, s.name), el("p", null, s.detail));
            grid.append(card);
        }
        block.append(el("h2", null, section.title), el("p", "happy-hour-time", section.time), deal);
        if (section.specials?.length) block.append(el("h3", null, section.specialsTitle), grid);
        return block;
    }

    function renderMenu(menu, container) {
        if (!menu?.sections?.length || !container) return;
        container.replaceChildren(...menu.sections.map(section => {
            if (section.kind === "happy-hour") return renderHappyHour(section);
            const block = el("div", "menu-section");
            if (section.anchor) block.id = section.anchor;
            if (section.heading) block.append(sectionTitle(section.heading));
            block.append(
                sectionTitle(section.title, section.tags, !!section.heading),
                el("div", "menu-section-sub", section.subtitle || " "),
                section.kind === "wine" ? renderWine(section) : renderItems(section)
            );
            return block;
        }));
    }

    return { API, SITE_SLUG, DAYS, TAGS, DEFAULT_HOURS, fetchSiteContent, hoursGroups, groupLabel, formatTime, renderHours, extractMenu, renderMenu };
})();

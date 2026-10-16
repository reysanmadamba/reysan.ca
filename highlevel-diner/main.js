document.addEventListener("DOMContentLoaded", () => {

    // =========================
    // NAV (ALL PAGES)
    // =========================
    const toggle = document.getElementById("navToggle");
    const menu = document.getElementById("mobileMenu");
    const closeBtn = document.getElementById("navClose");

    if (toggle && menu && closeBtn) {
        toggle.onclick = () => menu.classList.add("active");
        closeBtn.onclick = () => menu.classList.remove("active");

        document.querySelectorAll(".mobile-menu a").forEach(link => {
            link.addEventListener("click", () => {
                menu.classList.remove("active");
            });
        });
    }

    // =========================
    // RESERVATION MODAL (SAFE)
    // =========================
    const modal = document.getElementById("reservationModal");
    const frame = document.getElementById("toastFrame");
    const fallback = document.getElementById("fallbackMsg");

    if (modal && frame) {

        // 🔥 OPEN FROM FORM (HOME)
        window.openReservation = function () {
            const date = document.getElementById("resDate")?.value;
            const time = document.getElementById("resTime")?.value;
            const people = document.getElementById("resPeople")?.value || 2;

            if (!date || !time) {
                alert("Please select date and time");
                return;
            }

            const formatted = formatToToast(date, time);

            const url = `https://tables.toasttab.com/restaurants/605ed5a7-f0de-4ccd-a5c0-31c514082741/reserve?partySize=${people}&dateTime=${formatted}`;

            frame.src = url;
            modal.style.display = "block";

            // fallback check
            setTimeout(() => {
                try {
                    frame.contentWindow.location.href;
                } catch (e) {
                    if (fallback) fallback.style.display = "block";
                }
            }, 1500);
        };

        // OPEN FROM NAV (ALL PAGES)
        window.openReservationFromNav = function (e) {
            e.preventDefault();

            const today = new Date();

            const resDate = document.getElementById("resDate");
            const resTime = document.getElementById("resTime");
            const resPeople = document.getElementById("resPeople");

            if (resDate && resTime && resPeople) {
                resDate.value = today.toISOString().split("T")[0];
                resTime.value = "09:00";
                resPeople.value = 2;
                openReservation();
            } else {
                // menu page fallback (no form)
                const formatted = today.toISOString();
                const url = `https://tables.toasttab.com/restaurants/605ed5a7-f0de-4ccd-a5c0-31c514082741/reserve?partySize=2&dateTime=${formatted}`;
                frame.src = url;
                modal.style.display = "block";
            }
        };

        // CLOSE MODAL
        const closeBtnModal = document.querySelector(".res-close");
        if (closeBtnModal) {
            closeBtnModal.onclick = () => {
                modal.style.display = "none";
                frame.src = "";
            };
        }

        // CLICK OUTSIDE CLOSE (single version only)
        window.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.style.display = "none";
                frame.src = "";
            }
        });

        // FALLBACK BUTTON
        window.openToastDirect = function () {
            window.open(frame.src, "_blank");
        };
    }

    // =========================
    // DEFAULT VALUES (HOME ONLY)
    // =========================
    const resDate = document.getElementById("resDate");
    const resTime = document.getElementById("resTime");
    const resPeople = document.getElementById("resPeople");

    if (resDate && resTime && resPeople) {
        const today = new Date();
        resDate.value = today.toISOString().split("T")[0];
        resTime.value = "09:00";
        resPeople.value = 2;
    }

    // =========================
    // SAVED HOURS + MENU (ALL PAGES)
    // What the owner saved in the dashboard replaces the hours text and the
    // menu sections. Until something is saved, or if the request fails, the
    // page keeps the content it was published with.
    // =========================
    window.HL?.fetchSiteContent().then(content => {
        if (!content) return;
        HL.renderHours(content.hours);
        HL.renderMenu(content.menu, document.getElementById("menuContent"));
    });

    // =========================
    // ART GALLERY FROM DASHBOARD (ART PAGE ONLY)
    // Pieces uploaded at /highlevel-diner/dashboard replace the placeholder
    // cards. If there are none yet, or the request fails, the placeholders
    // stay as they are.
    // =========================
    const artGallery = document.getElementById("artGallery");

    if (artGallery?.dataset.gallery) {
        const el = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text) node.textContent = text;
            return node;
        };

        fetch(`${HL.API}?resource=art&public=${encodeURIComponent(artGallery.dataset.gallery)}`)
            .then(res => res.ok ? res.json() : { pieces: [] })
            .then(({ pieces }) => {
                if (!pieces?.length) return;
                artGallery.replaceChildren(...pieces.map(piece => {
                    const card = el("article", "art-card");
                    card.tabIndex = 0;

                    const frame = el("div", "art-frame");
                    const img = el("img");
                    img.src = piece.image_url;
                    img.alt = `${piece.title} by ${piece.artist_name}`;
                    img.loading = "lazy";
                    frame.append(img);

                    card.append(
                        frame,
                        el("h3", "art-title", piece.title),
                        el("p", "art-artist", `by ${piece.artist_name}`)
                    );
                    if (piece.description) card.append(el("p", "art-desc", piece.description));
                    return card;
                }));
            })
            .catch(() => { /* keep placeholders */ });
    }

    // =========================
    // ART LIGHTBOX (ART PAGE ONLY)
    // =========================
    const lightbox = document.getElementById("artLightbox");

    if (lightbox) {
        const lbFrame = document.getElementById("artLightboxFrame");
        const lbTitle = document.getElementById("artLightboxTitle");
        const lbArtist = document.getElementById("artLightboxArtist");
        const lbDesc = document.getElementById("artLightboxDesc");

        const openArt = (card) => {
            lbFrame.innerHTML = card.querySelector(".art-frame").innerHTML;
            lbTitle.textContent = card.querySelector(".art-title")?.textContent || "";
            lbArtist.textContent = card.querySelector(".art-artist")?.textContent || "";
            lbDesc.textContent = card.querySelector(".art-desc")?.textContent || "";
            lightbox.classList.add("active");
        };

        const closeArt = () => lightbox.classList.remove("active");

        // Delegated, so cards loaded from the dashboard later still open.
        const gallery = document.getElementById("artGallery");
        gallery?.addEventListener("click", (e) => {
            const card = e.target.closest(".art-card");
            if (card) openArt(card);
        });
        gallery?.addEventListener("keydown", (e) => {
            const card = e.target.closest(".art-card");
            if (card && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                openArt(card);
            }
        });

        document.getElementById("artLightboxClose").onclick = closeArt;
        lightbox.addEventListener("click", (e) => {
            if (e.target === lightbox) closeArt();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeArt();
        });
    }

    // =========================
    // FORMAT FUNCTION (SHARED)
    // =========================
    function formatToToast(date, time) {
        const dt = new Date(`${date}T${time}`);

        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');

        const offset = -dt.getTimezoneOffset();
        const sign = offset >= 0 ? "+" : "-";
        const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
        const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:00.000${sign}${offsetHours}:${offsetMinutes}`;
    }

});
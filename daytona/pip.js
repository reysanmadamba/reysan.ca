// Pop-out chat for the Daytona demo.
//
// Moves the existing chat panel into a small always-on-top window (Document
// Picture-in-Picture, Chrome and Edge on desktop) so the conversation stays
// visible when the visitor opens a listing in another tab or switches apps.
//
// It opens (1) when the visitor clicks a listing or sunlight link in the chat,
// (2) when the tab is hidden while a chat is in progress, and (3) from the
// pop-out button in the chat header. The first time it asks "Keep chatting in
// this window?" and remembers the answer. After that the chat stays in the
// floating window until the visitor brings it back. Browsers without the
// feature keep the normal chat.
//
// Standalone on purpose: it only moves the #chatPanel element, so daytona.js
// needs no changes (the panel keeps its event listeners when it moves).
(function () {
    var panel = document.getElementById('chatPanel');
    var log = document.getElementById('chatLog');
    var header = panel && panel.querySelector('.chat-panel-header');
    if (!panel || !log || !header) return;

    var CONSENT_KEY = 'dt_pip_consent'; // 'allow' | 'dismissed'
    var FULL = { width: 360, height: 640 };
    var ASK = { width: 360, height: 300 };
    var LISTING_LINK = /daytonahomes\.ca|\/daytona\/shadow-check/i;

    var pipWin = null;   // the floating window, while it is open
    var marker = null;   // comment node that remembers where the panel lives on the page
    var opening = false; // true while the window is being requested

    // Once the visitor says "Keep chatting here", the chat stays in the floating
    // window until they bring it back (the page's chat button, or the window's own
    // "back to tab" button). Chrome only opens this window right after a click or
    // keypress on the page, so re-opening it every time the visitor leaves can't be
    // relied on; keeping it open is what makes it follow them. Add ?pipfold to fold
    // the chat back into the page whenever the visitor returns instead (for comparing).
    var STAY = !/[?&]pipfold\b/.test(location.search);

    // While the chat floats, the page's chat button says so and brings it back.
    var fab = document.getElementById('chatToggle');
    var fabText = fab && fab.querySelector('span');
    var fabOriginal = fabText ? fabText.textContent : '';
    function setFloating(on) { if (fabText) fabText.textContent = on ? 'Bring chat back' : fabOriginal; }

    // A short diary of what happened and why, readable as dtPip.log, so a window
    // that doesn't open can be explained instead of guessed at.
    var events = [];
    function note(msg) {
        events.push(new Date().toTimeString().slice(0, 8) + '  ' + msg);
        if (events.length > 40) events.shift();
    }
    function activation() {
        var u = navigator.userActivation;
        return u ? 'click or keypress in the last few seconds: ' + (u.isActive ? 'yes' : 'no') : 'activation unknown';
    }

    // Add ?pipreset to the page address to forget the saved answer (for testing).
    if (/[?&]pipreset\b/.test(location.search)) {
        try { localStorage.removeItem(CONSENT_KEY); } catch (e) { /* ignore */ }
    }
    function getConsent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }
    function setConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch (e) { /* ignore */ } }

    function api() { return window.documentPictureInPicture; }
    function supported() { return !!api() && typeof api().requestWindow === 'function'; }

    // A chat is "in progress" once the visitor has passed the check and sent at
    // least one message, and the demo's message limit hasn't ended it.
    function chatInProgress() {
        if (!panel.classList.contains('open') || log.style.display === 'none') return false;
        var input = panel.querySelector('#chatInput');
        if (input && input.disabled) return false;
        return !!log.querySelector('.msg.user');
    }

    // ---- the small "Keep chatting in this window?" prompt ----
    function showAsk(win) {
        var doc = win.document;
        var style = doc.createElement('style');
        style.textContent = [
            'body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#1a1a1a;background:#fff}',
            '.ask{padding:28px;width:100%;box-sizing:border-box}',
            'h1{font-size:17px;line-height:1.35;margin:0 0 8px}',
            'p{font-size:14px;line-height:1.45;margin:0 0 20px;color:#444}',
            'button{display:block;width:100%;font:600 15px system-ui,sans-serif;padding:12px;border-radius:10px;border:0;cursor:pointer;margin-top:10px}',
            '.yes{background:#F2661F;color:#fff}.yes:hover{background:#C94F14}',
            '.no{background:#eee;color:#222}.no:hover{background:#e2e2e2}'
        ].join('');
        doc.head.appendChild(style);

        var box = doc.createElement('div');
        box.className = 'ask';
        var h = doc.createElement('h1');
        h.textContent = 'Keep chatting in this window?';
        var p = doc.createElement('p');
        p.textContent = 'Your conversation with Dakota stays open while you look at a listing or switch tabs or apps.';
        var yes = doc.createElement('button');
        yes.className = 'yes';
        yes.type = 'button';
        yes.textContent = 'Keep chatting here';
        var no = doc.createElement('button');
        no.className = 'no';
        no.type = 'button';
        no.textContent = 'Close window';
        box.appendChild(h);
        box.appendChild(p);
        box.appendChild(yes);
        box.appendChild(no);
        doc.body.appendChild(box);

        yes.addEventListener('click', function () {
            setConsent('allow');
            try { win.resizeTo(FULL.width, FULL.height); } catch (e) { /* the browser may refuse; the chat still fits */ }
            box.remove();
            style.remove();
            mountChat(win).catch(closePip);
        });
        no.addEventListener('click', function () {
            setConsent('dismissed');
            closePip();
        });
        yes.focus();
    }

    // ---- move the real chat panel into the window ----
    async function mountChat(win) {
        var doc = win.document;
        doc.body.className = document.body.className;

        var waits = [];
        [].forEach.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) {
            var c = doc.createElement('link');
            c.rel = 'stylesheet';
            c.href = l.href; // already an absolute address
            waits.push(new Promise(function (done) { c.onload = c.onerror = done; }));
            doc.head.appendChild(c);
        });
        [].forEach.call(document.querySelectorAll('style'), function (s) {
            doc.head.appendChild(doc.createElement('style')).textContent = s.textContent;
        });
        // In the small window the panel fills it, and the page-only buttons go away
        // (the window has its own close and "back to tab" buttons).
        var fit = doc.createElement('style');
        fit.textContent = [
            'html,body{margin:0;height:100%;background:var(--paper-2,#fff)}',
            '#chatPanel.chat-panel{position:static;width:100%;height:100vh;min-height:0;max-height:none;border:0;border-radius:0;box-shadow:none;display:flex}',
            '#chatClose,.dt-pip-btn{display:none!important}'
        ].join('');
        doc.head.appendChild(fit);

        // Wait for the site styles so the chat doesn't flash unstyled, but not forever.
        await Promise.race([Promise.all(waits), new Promise(function (r) { setTimeout(r, 1500); })]);
        if (pipWin !== win) return; // closed while the styles were loading

        marker = document.createComment('dakota-chat-home');
        panel.parentNode.insertBefore(marker, panel);
        doc.body.appendChild(panel);
        setFloating(true);
        panel.classList.add('open');
        log.scrollTop = log.scrollHeight;
        var input = panel.querySelector('#chatInput');
        if (input) { try { input.focus(); } catch (e) { /* ignore */ } }
    }

    // ---- bring the panel home and close the window ----
    function restore() {
        setFloating(false);
        if (marker && marker.parentNode) {
            marker.parentNode.insertBefore(panel, marker);
            marker.remove();
        }
        marker = null;
    }
    function closePip() {
        var win = pipWin;
        pipWin = null;
        restore(); // the panel goes back to the page first, so nothing is lost
        if (win) { try { win.close(); } catch (e) { /* already closed */ } note('window closed, chat is back in the page'); }
    }
    // The visitor pressed the window's own X or its "back to tab" button.
    function onPipHide() {
        if (pipWin) note('window closed by the visitor, chat is back in the page');
        pipWin = null;
        restore();
    }

    function openPip(direct, why) {
        why = why || 'direct call';
        if (!supported()) { note('skipped (' + why + '): this browser has no floating windows'); return; }
        if (pipWin || opening) { note('skipped (' + why + '): a window is already open or opening'); return; }
        var ask = !direct && getConsent() !== 'allow';
        opening = true;
        note('opening (' + why + '), ' + (ask ? 'asking first' : 'full chat') + '; ' + activation());
        // requestWindow has to be called right here, not after a delay, so that it
        // still counts as part of the click when this runs from a click handler.
        var request;
        try { request = api().requestWindow(ask ? ASK : FULL); } catch (e) {
            opening = false;
            note('refused (' + why + '): ' + (e && e.name) + ': ' + (e && e.message));
            return;
        }
        request.then(function (win) {
            pipWin = win;
            win.addEventListener('pagehide', onPipHide);
            note('window opened');
            if (ask) showAsk(win);
            else mountChat(win).catch(closePip);
        }).catch(function (e) {
            // The browser said no (for example no click happened first): keep the normal chat.
            note('refused (' + why + '): ' + (e && e.name) + ': ' + (e && e.message));
        }).then(function () { opening = false; });
    }

    // ---- when it opens ----
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (!chatInProgress()) note('tab hidden: no chat in progress, nothing to do');
            else if (getConsent() === 'dismissed') note('tab hidden: visitor said no earlier, nothing to do');
            else openPip(false, 'tab hidden');
        } else {
            note('tab visible again' + (pipWin ? (STAY ? ', keeping the window open' : ', folding the chat back') : ''));
            if (pipWin && !STAY) closePip(); // the visitor is back, so the chat goes back into the page
        }
    });

    // A click on a listing or sunlight link is a click the browser trusts, so the
    // window can open right then, before the new tab takes over the screen.
    log.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a || !LISTING_LINK.test(a.href)) return;
        if (!pipWin && chatInProgress() && getConsent() !== 'dismissed') openPip(false, 'listing link click');
    });

    // While the chat is floating, the page's chat button brings it back into the page.
    if (fab) {
        fab.addEventListener('click', function (e) {
            if (pipWin) { e.stopImmediatePropagation(); closePip(); }
        }, true);
    }

    // The pop-out button in the chat header (only where the browser supports it).
    if (supported()) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dt-pip-btn';
        btn.title = 'Pop out chat';
        btn.setAttribute('aria-label', 'Pop out chat');
        btn.style.cssText = 'margin-left:auto;margin-right:14px;display:inline-flex;align-items:center';
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="11" y="10" width="8" height="6" rx="1" fill="currentColor"/></svg>';
        btn.addEventListener('click', function () {
            setConsent('allow'); // pressing the button is the visitor's own choice
            openPip(true, 'header button');
        });
        header.insertBefore(btn, header.querySelector('#chatClose'));
    }

    window.dtPip = { open: openPip, close: closePip, isOpen: function () { return !!pipWin; }, log: events };
})();

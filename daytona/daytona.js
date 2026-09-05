(function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // scroll progress (same behavior as main site)
    var bar = document.getElementById('progress');
    function updateProgress() {
        var h = document.documentElement;
        var scrolled = h.scrollTop;
        var max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
    }
    document.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    if (!reduce && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else {
        document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    // ============================================================
    // Chat widget — talks to daytona-chat.js / daytona-verify-captcha.js
    // EDIT HERE if your backend deploys to a different URL
    // ============================================================
    var BASE_URL = 'https://reysan-ca-backend-77ah.vercel.app';
    var CHAT_ENDPOINT = BASE_URL + '/api/daytona-chat';
    var CAPTCHA_ENDPOINT = BASE_URL + '/api/daytona-captcha';
    var MAX_MESSAGES = 20; // keep in sync with MAX_MESSAGES_PER_SESSION in daytona-chat.js

    var chatToggle = document.getElementById('chatToggle');
    var chatPanel = document.getElementById('chatPanel');
    var chatClose = document.getElementById('chatClose');
    var chatLog = document.getElementById('chatLog');
    var chatInput = document.getElementById('chatInput');
    var chatSend = document.getElementById('chatSend');
    var chatInputRow = document.getElementById('chatInputRow');
    var chatIntake = document.getElementById('chatIntake');
    var startChat = document.getElementById('startChat');
    var captchaQuestion = document.getElementById('captchaQuestion');
    var captchaAnswer = document.getElementById('captchaAnswer');

    var sessionId = 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var currentChallengeToken = '';
    var sessionToken = '';
    var captchaLoaded = false;
    var chatEnded = false;
    var conversation = []; // [{role:'user'|'assistant', content: string}, ...]

    // ============================================================
    // escapeHtml + linkify — messages are inserted with innerHTML so we can
    // turn URLs into real clickable links. escapeHtml runs FIRST on the raw
    // text (so any literal <, >, & from either the visitor or the AI can't
    // be interpreted as HTML/script), then linkify wraps plain http(s) URLs
    // in <a> tags afterward. Order matters — never linkify before escaping.
    // ============================================================
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function linkify(rawText) {
        var safe = escapeHtml(rawText);
        var urlPattern = /(https?:\/\/[^\s<]+)/g;
        return safe.replace(urlPattern, function (url) {
            // trim trailing punctuation a sentence might leave stuck to the URL
            var trailing = '';
            var match = url.match(/[).,!?]+$/);
            if (match) {
                trailing = match[0];
                url = url.slice(0, url.length - trailing.length);
            }
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>' + trailing;
        });
    }

    async function loadCaptcha() {
        if (!startChat || !captchaQuestion) return;
        startChat.disabled = true;
        captchaQuestion.textContent = 'Loading verification...';
        try {
            var res = await fetch(CAPTCHA_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sessionId })
            });
            var data = await res.json();
            currentChallengeToken = data.challengeToken;
            captchaQuestion.textContent = data.question + ' ';
            captchaAnswer.value = '';
            startChat.disabled = false;
            captchaLoaded = true;
        } catch (err) {
            captchaQuestion.textContent = 'Verification failed to load. Refresh the page.';
        }
    }

    if (chatToggle && chatPanel) {
        chatToggle.addEventListener('click', function () {
            var opening = !chatPanel.classList.contains('open');
            chatPanel.classList.toggle('open');
            if (opening && !captchaLoaded) {
                loadCaptcha();
            }
        });
        chatClose.addEventListener('click', function () {
            chatPanel.classList.remove('open');
        });
    }

    function addMsg(text, who) {
        var div = document.createElement('div');
        div.className = 'msg ' + who;
        var label = (who === 'user' ? 'you' : 'dakota');
        div.innerHTML = '<span class="who">' + label + '</span>' + linkify(text);
        chatLog.appendChild(div);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    function lockChat(message) {
        addMsg(message, 'assistant');
        chatEnded = true;
        chatInput.disabled = true;
        chatInput.placeholder = 'Chat closed';
        chatSend.disabled = true;
    }

    if (startChat) {
        startChat.addEventListener('click', async function () {
            var answer = captchaAnswer.value.trim();
            if (!answer) {
                alert('Please answer the verification question.');
                return;
            }

            startChat.disabled = true;
            startChat.textContent = 'Verifying...';

            try {
                var res = await fetch(CAPTCHA_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId, challengeToken: currentChallengeToken, answer: answer })
                });
                var data = await res.json();

                if (!data.correct) {
                    alert('Incorrect answer, try again.');
                    startChat.textContent = 'Start chat';
                    startChat.disabled = false;
                    loadCaptcha();
                    return;
                }

                sessionToken = data.sessionToken;

                chatIntake.style.display = 'none';
                chatLog.style.display = 'block';
                chatInputRow.style.display = 'flex';
                addMsg("Hi, I'm Dakota, an AI demo assistant for Daytona Homes — not a real employee, just a prototype. Ask me about the building process, communities, or describe the home you're looking for.", 'assistant');
                chatInput.focus();
            } catch (err) {
                alert('Something went wrong verifying. Try again.');
                startChat.textContent = 'Start chat';
                startChat.disabled = false;
            }
        });
    }

    async function sendChat() {
        if (chatEnded) return;
        var message = chatInput.value.trim();
        if (!message) return;

        var userTurns = conversation.filter(function (m) { return m.role === 'user'; }).length;
        if (userTurns >= MAX_MESSAGES) {
            lockChat("We've hit the message limit for this demo session — thanks for chatting!");
            return;
        }

        addMsg(message, 'user');
        conversation.push({ role: 'user', content: message });
        chatInput.value = '';
        chatSend.disabled = true;

        try {
            var res = await fetch(CHAT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken: sessionToken, messages: conversation })
            });

            if (res.status === 401) {
                addMsg('Session expired — please restart the verification.', 'assistant');
                chatLog.style.display = 'none';
                chatInputRow.style.display = 'none';
                chatIntake.style.display = 'flex';
                loadCaptcha();
                return;
            }

            var data = await res.json();
            var reply = data.reply || "Sorry, I couldn't get an answer just now.";
            addMsg(reply, 'assistant');
            conversation.push({ role: 'assistant', content: reply });

            if (data.disconnected) {
                chatEnded = true;
                chatInput.disabled = true;
                chatInput.placeholder = 'Chat closed';
                chatSend.disabled = true;
                return;
            }

            if (data.limitReached) {
                lockChat("That's the message limit for this demo session — thanks for chatting!");
            }
        } catch (err) {
            addMsg('Sorry, something went wrong.', 'assistant');
        } finally {
            if (!chatEnded) chatSend.disabled = false;
        }
    }

    if (chatSend) {
        chatSend.addEventListener('click', sendChat);
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendChat();
        });
    }
})();
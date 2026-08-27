(function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // typewriter effect for hero prompt + heading
    if (!reduce) {
        var promptEl = document.getElementById('typePrompt');
        var headingEl = document.getElementById('typeHeading');

        function typeInto(el, text, speed, done) {
            el.textContent = '';
            var i = 0;
            var id = setInterval(function () {
                el.textContent += text.charAt(i);
                i++;
                if (i >= text.length) {
                    clearInterval(id);
                    if (done) done();
                }
            }, speed);
        }

        if (promptEl && headingEl) {
            var promptText = promptEl.textContent;
            var headingHTML = headingEl.innerHTML;
            var headingText = headingEl.textContent;

            typeInto(promptEl, promptText, 45, function () {
                setTimeout(function () {
                    typeInto(headingEl, headingText, 16, function () {
                        headingEl.innerHTML = headingHTML;
                    });
                }, 150);
            });
        }
    }

    // scroll progress
    var bar = document.getElementById('progress');
    function updateProgress() {
        var h = document.documentElement;
        var scrolled = h.scrollTop;
        var max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
    }
    document.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    // reveal on scroll
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

    // active nav link on scroll
    var sections = ['about', 'projects', 'skills', 'contact'].map(function (id) {
        return document.getElementById(id);
    }).filter(Boolean);
    var navLinks = document.querySelectorAll('.navlinks a');
    function updateNav() {
        var pos = window.scrollY + 120;
        var current = null;
        sections.forEach(function (sec) {
            if (sec.offsetTop <= pos) current = sec.id;
        });
        navLinks.forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === '#' + current);
        });
    }
    document.addEventListener('scroll', updateNav, { passive: true });
    updateNav();

    // subtle card tilt on hover
    if (!reduce && matchMedia('(hover:hover)').matches) {
        document.querySelectorAll('.card').forEach(function (card) {
            card.addEventListener('mousemove', function (e) {
                var r = card.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width - 0.5;
                var y = (e.clientY - r.top) / r.height - 0.5;
                card.style.transform = 'perspective(600px) rotateX(' + (-y * 3) + 'deg) rotateY(' + (x * 3) + 'deg) translateY(-2px)';
            });
            card.addEventListener('mouseleave', function () {
                card.style.transform = '';
            });
        });
    }

    // chat widget
    var chatToggle = document.getElementById('chatToggle');
    var chatPanel = document.getElementById('chatPanel');
    var chatClose = document.getElementById('chatClose');
    var chatLog = document.getElementById('chatLog');
    var chatInput = document.getElementById('chatInput');
    var chatSend = document.getElementById('chatSend');
    var chatInputRow = document.getElementById('chatInputRow');
    var chatIntake = document.getElementById('chatIntake');
    var startChat = document.getElementById('startChat');
    var visitorName = document.getElementById('visitorName');
    var visitorEmail = document.getElementById('visitorEmail');
    var captchaQuestion = document.getElementById('captchaQuestion');
    var captchaAnswer = document.getElementById('captchaAnswer');

    var CHAT_ENDPOINT = 'https://reysan-ca-backend-77ah.vercel.app/api/chat';
    var CAPTCHA_ENDPOINT = 'https://reysan-ca-backend-77ah.vercel.app/api/captcha';

    var chatEnded = false;
    var messageCount = 0;
    var MAX_MESSAGES = 10;
    var currentName = '';
    var currentEmail = '';
    var sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    var currentChallengeToken = '';
    var sessionToken = '';
    var captchaLoaded = false;

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
            captchaQuestion.textContent = data.question + ' =';
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
        div.innerHTML = '<span class="who">' + (who === 'user' ? 'you' : 'assistant') + '</span>' + text;
        chatLog.appendChild(div);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    function endChat() {
        addMsg('Conversation ended due to inappropriate content. Please ask questions related to my work only.', 'assistant');
        chatEnded = true;
        chatInput.disabled = true;
        chatInput.placeholder = 'Chat closed';
        chatSend.disabled = true;
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    if (startChat) {
        startChat.addEventListener('click', async function () {
            var name = visitorName.value.trim();
            var email = visitorEmail.value.trim();
            var answer = captchaAnswer.value.trim();

            if (!name || !email) {
                alert('Please enter your name and email to continue.');
                return;
            }

            if (!isValidEmail(email)) {
                alert('Please enter a valid email address (e.g. name@example.com).');
                return;
            }

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
                currentName = name;
                currentEmail = email;

                chatIntake.style.display = 'none';
                chatLog.style.display = 'block';
                chatInputRow.style.display = 'flex';
                addMsg('Hi ' + name + '! Ask me anything about Rey\'s skills, projects, or availability.', 'assistant');
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

        messageCount++;
        if (messageCount > MAX_MESSAGES) {
            endChat();
            return;
        }

        addMsg(message, 'user');
        chatInput.value = '';
        chatSend.disabled = true;

        try {
            var res = await fetch(CHAT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    name: currentName,
                    email: currentEmail,
                    sessionId: sessionId,
                    sessionToken: sessionToken
                })
            });
            var data = await res.json();

            if (data.needsCaptcha) {
                addMsg('Quick re-verification needed — please solve this and try again.', 'assistant');
                chatLog.style.display = 'none';
                chatInputRow.style.display = 'none';
                chatIntake.style.display = 'flex';
                loadCaptcha();
                return;
            }

            if (res.status === 429) {
                addMsg(data.error || "You've hit the message limit for now.", 'assistant');
                return;
            }

            if (res.status === 403) {
                addMsg(data.error || "Access temporarily restricted.", 'assistant');
                chatInput.disabled = true;
                chatSend.disabled = true;
                return;
            }

            if (data.flagged) {
                endChat();
                return;
            }

            addMsg(data.answer || "Sorry, I couldn't get an answer.", 'assistant');
        } catch (err) {
            addMsg("Sorry, something went wrong. Try emailing contact@reysan.ca instead.", 'assistant');
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
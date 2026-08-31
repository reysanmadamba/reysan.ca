(function () {
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

    // EDIT HERE if the backend deployment URL ever changes
    var CHAT_ENDPOINT = 'https://reysan-ca-backend-77ah.vercel.app/api/planetcom-chat';
    var CAPTCHA_ENDPOINT = 'https://reysan-ca-backend-77ah.vercel.app/api/planetcom-captcha';

    var chatEnded = false;
    var messageCount = 0;
    var MAX_MESSAGES = 20; // keep in sync with MAX_MESSAGES_PER_SESSION in planetcom-chat.js
    var conversation = [];
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
        div.innerHTML = '<span class="who">' + (who === 'user' ? 'you' : 'assistant') + '</span>' + text;
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
                addMsg("Hi! This is an AI demo assistant built by Rey to show what a PlanetCom FAQ bot could look like \u2014 not a PlanetCom employee. Ask me about our Managed IT or PlanetCom Creative services.", 'assistant');
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
            lockChat("We've hit the message limit for this demo session \u2014 thanks for chatting! Reach PlanetCom directly at 780-467-5253 or helpdesk@planetcom.ca to keep going.");
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
                body: JSON.stringify({
                    sessionToken: sessionToken,
                    messages: conversation
                })
            });
            var data = await res.json();

            if (res.status === 401) {
                addMsg('Session expired \u2014 please refresh the page to start a new chat.', 'assistant');
                chatInput.disabled = true;
                chatSend.disabled = true;
                return;
            }

            var reply = data.reply || "Sorry, I couldn't get an answer just now.";
            addMsg(reply, 'assistant');
            conversation.push({ role: 'assistant', content: reply });

            if (data.limitReached) {
                lockChat("That's the message limit for this demo session \u2014 thanks for chatting!");
            } else if (data.disconnected) {
                lockChat('Ending this chat here \u2014 for real PlanetCom questions, reach helpdesk@planetcom.ca or 780-467-5253.');
            }
        } catch (err) {
            addMsg('Sorry, something went wrong. Try emailing helpdesk@planetcom.ca instead.', 'assistant');
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
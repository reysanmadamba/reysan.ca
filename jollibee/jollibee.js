const CAPTCHA_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/jollibee-captcha';
const CHAT_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/jollibee-chat';
const STORE_PHONE = '780-000-0000'; // TODO: replace with the real store contact number

let sessionToken = null;
let history = [];
let customerId = null;
let phoneVerified = false;
let orderId = null;
let lastKnownStatus = null;
let pollTimer = null;

const gateEl = document.getElementById('gate');
const gateErrorEl = document.getElementById('gate-error');
const chatViewEl = document.getElementById('chat-view');
const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = formEl.querySelector('button.send');

// Called by the Turnstile widget once the visitor passes the check.
// Must be global — Turnstile invokes it by name from data-callback.
window.onTurnstileSuccess = async function (turnstileToken) {
    gateErrorEl.textContent = '';

    try {
        const res = await fetch(CAPTCHA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turnstileToken })
        });
        const data = await res.json();

        if (!res.ok || data.error) {
            gateErrorEl.textContent = data.error || 'Verification failed. Please refresh and try again.';
            return;
        }

        sessionToken = data.token;
        gateEl.style.display = 'none';
        chatViewEl.style.display = 'flex';
        addMessage("Hi! I'm your Jollibee ordering assistant. What's your name and phone number so we can get started?", 'bot');
        inputEl.focus();
    } catch (err) {
        gateErrorEl.textContent = "Couldn't verify — check your connection and refresh.";
    }
};

function addMessage(text, who) {
    const div = document.createElement('div');
    div.className = 'msg ' + who;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage(text) {
    if (!text.trim() || !sessionToken) return;
    addMessage(text, 'user');
    inputEl.value = '';
    sendBtn.disabled = true;

    try {
        const res = await fetch(CHAT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history,
                token: sessionToken,
                customerId,
                phoneVerified,
                orderId
            })
        });
        const data = await res.json();

        if (!res.ok || data.error) {
            addMessage(data.error || 'Something went wrong, please try again.', 'error');
        } else {
            addMessage(data.reply, 'bot');
            history = data.history || history;
            customerId = data.customerId ?? customerId;
            phoneVerified = data.phoneVerified ?? phoneVerified;

            if (data.orderId && data.orderId !== orderId) {
                orderId = data.orderId;
                lastKnownStatus = 'new';
                startPolling();
            }
        }
    } catch (err) {
        addMessage("Couldn't reach the kitchen — check your connection and try again.", 'error');
    } finally {
        sendBtn.disabled = false;
        inputEl.focus();
    }
}

formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(inputEl.value);
});

const POLL_INTERVAL_MS = 15000;

function startPolling() {
    if (pollTimer) return; // already running
    pollTimer = setInterval(checkOrderStatus, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

async function checkOrderStatus() {
    if (!orderId || !sessionToken) return;

    try {
        const res = await fetch(CHAT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkStatus: true, orderId, token: sessionToken })
        });
        const data = await res.json();
        if (!res.ok || data.error) return; // fail silently, this is a background check

        if (data.status !== lastKnownStatus) {
            if (data.status === 'accepted') {
                addMessage(
                    `🎉 Good news — your order's been accepted and is being prepared! It should be ready in about ${data.eta_minutes} minutes. Crew might call you at your phone number if they have any clarification about your order.`,
                    'bot'
                );
            } else if (data.status === 'ready') {
                addMessage(
                    `Transaction complete. Please pick up your order now. If you have any questions, call ${STORE_PHONE}.`,
                    'bot'
                );
                closeChat();
            }
            lastKnownStatus = data.status;
        }

        if (data.status === 'ready' || data.status === 'completed') stopPolling();
    } catch (err) {
        // silent — this is a background poll, not worth surfacing a network error for
    }
}

function closeChat() {
    inputEl.disabled = true;
    sendBtn.disabled = true;
    inputEl.placeholder = 'Order complete';
}
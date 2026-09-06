const CAPTCHA_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/jollibee-captcha';
const CHAT_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/jollibee-chat';

let sessionToken = null;
let history = [];
let customerId = null;
let phoneVerified = false;

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
                phoneVerified
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
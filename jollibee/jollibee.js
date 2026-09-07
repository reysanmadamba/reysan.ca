const CAPTCHA_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/jollibee-captcha';
const CHAT_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/jollibee-chat';
const STORE_PHONE = '780-000-0000'; // TODO: replace with the real store contact number

let sessionToken = null;
let history = [];
let customerId = null;
let phoneVerified = false;
let orderId = null;
let offTopicCount = 0;
let otpReminderCount = 0;
let lastKnownStatus = null;
let lastKnownTotal = null;
let lastMessageCheckTime = null;
let inTakeover = false;
let pollTimer = null;
let conversationStarted = false; // guards against Turnstile silently re-verifying mid-session

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

    // Turnstile can re-verify silently in the background during a long
    // session and call this callback again — only greet/show the chat the
    // FIRST time. Later calls just refresh sessionToken without disrupting
    // the conversation already in progress.
    if (!conversationStarted) {
      conversationStarted = true;
      gateEl.style.display = 'none';
      chatViewEl.style.display = 'flex';
      addMessage("Hi! I'm your Jollibee ordering assistant. What's your name and phone number so we can get started?", 'bot');
      inputEl.focus();
    }
  } catch (err) {
    if (!conversationStarted) gateErrorEl.textContent = "Couldn't verify — check your connection and refresh.";
  }
};

function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = who === 'bot' ? stripMarkdown(text) : text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Serverless functions can have a real cold-start delay — this makes sure
// the customer sees SOMETHING happening immediately rather than a chat
// that looks frozen while the function spins up.
function showTypingIndicator() {
  hideTypingIndicator(); // never stack more than one
  const div = document.createElement('div');
  div.className = 'msg bot typing-indicator';
  div.id = 'jb-typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTypingIndicator() {
  const existing = document.getElementById('jb-typing-indicator');
  if (existing) existing.remove();
}

// Safety net — the system prompt tells the model not to use markdown, but
// that's a request, not a guarantee. Strip common markdown symbols so they
// never render as literal asterisks/hashes in a plain-text chat bubble.
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // **bold**
    .replace(/__(.*?)__/g, '$1')     // __bold__
    .replace(/^#{1,6}\s+/gm, '')     // # headers
    .replace(/^[-*]\s+/gm, '• ')     // bullet markers -> a plain bullet
    .replace(/\s+(\d+\.\s)/g, '\n$1'); // break run-together numbered list items onto their own lines
}

async function sendMessage(text) {
  if (!text.trim() || !sessionToken) return;
  addMessage(text, 'user');
  inputEl.value = '';
  sendBtn.disabled = true;
  showTypingIndicator();

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
        orderId,
        offTopicCount,
        otpReminderCount
      })
    });
    const data = await res.json();
    hideTypingIndicator();

    if (!res.ok || data.error) {
      addMessage(data.error || 'Something went wrong, please try again.', 'error');
    } else if (data.takeoverActive) {
      // AI is paused — a staff member is handling this conversation. No
      // auto-reply; their message will arrive via polling instead.
      customerId = data.customerId ?? customerId;
      phoneVerified = data.phoneVerified ?? phoneVerified;
      orderId = data.orderId ?? orderId;
      if (!inTakeover) {
        inTakeover = true;
        addMessage("Connecting you with our team — they'll reply here shortly.", 'staff');
      }
      if (!lastMessageCheckTime) lastMessageCheckTime = new Date().toISOString();
      startPolling();
    } else {
      addMessage(data.reply, 'bot');
      history = data.history || history;
      customerId = data.customerId ?? customerId;
      phoneVerified = data.phoneVerified ?? phoneVerified;
      offTopicCount = data.offTopicCount ?? offTopicCount;
      otpReminderCount = data.otpReminderCount ?? otpReminderCount;

      if (data.conversationEnded) {
        closeChat('Conversation ended');
        return;
      }

      if (data.orderId && data.orderId !== orderId) {
        orderId = data.orderId;
        lastKnownStatus = 'new';
        lastKnownTotal = null; // this is a different order now — don't compare its total against the old one's
      }

      // Poll from the moment identity is known — a customer can be flagged
      // for staff attention before ever placing an order.
      if (customerId && !lastMessageCheckTime) {
        lastMessageCheckTime = new Date().toISOString();
        startPolling();
      }
    }
  } catch (err) {
    addMessage("Couldn't reach the kitchen — check your connection and try again.", 'error');
  } finally {
    hideTypingIndicator();
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
  if (!customerId || !sessionToken) return;

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkStatus: true,
        orderId,
        customerId,
        token: sessionToken,
        messagesSince: lastMessageCheckTime
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) return; // fail silently, this is a background check

    if (data.newMessages && data.newMessages.length > 0) {
      data.newMessages.forEach((m) => addMessage(m.message, m.sender === 'staff' ? 'staff' : 'bot'));
      lastMessageCheckTime = data.newMessages[data.newMessages.length - 1].created_at;
    }

    // Keep inTakeover in sync with the server in both directions — if the
    // customer's first sign of a takeover is staff messages arriving via
    // this poll (not their own message send), inTakeover needs to flip on
    // here too, or their next send will redundantly show the "connecting"
    // message even though they can already see staff talking to them.
    if (data.takeoverActive && !inTakeover) {
      inTakeover = true;
    } else if (inTakeover && !data.takeoverActive) {
      inTakeover = false;
    }

    if (data.status && data.status !== lastKnownStatus) {
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
      } else if (data.status === 'cancelled') {
        addMessage(
          `Your order has been cancelled. If this wasn't expected, please contact the store at ${STORE_PHONE}.`,
          'bot'
        );
      }
      lastKnownStatus = data.status;
    } else if (data.total && lastKnownTotal && data.total !== lastKnownTotal && data.status !== 'cancelled') {
      // Status didn't change, but the total did — staff edited the order's
      // items directly (e.g. after a phone call), so let the customer know
      // rather than leaving them looking at a stale total, guessing what changed.
      const itemLines = (data.items || []).map((i) => `• ${i.qty}x ${i.name} — $${(i.qty * i.price).toFixed(2)}`).join('\n');
      addMessage(
        `Your order #${data.order_number} has been updated. Here's what it looks like now:\n${itemLines}\nNew total: $${Number(data.total).toFixed(2)}`,
        'bot'
      );
    }
    if (data.total) lastKnownTotal = data.total;

    if (data.status === 'ready' || data.status === 'completed' || data.status === 'cancelled') stopPolling();
  } catch (err) {
    // silent — this is a background poll, not worth surfacing a network error for
  }
}

function closeChat(placeholderText = 'Order complete') {
  inputEl.disabled = true;
  sendBtn.disabled = true;
  inputEl.placeholder = placeholderText;
}
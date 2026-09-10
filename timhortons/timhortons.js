const CAPTCHA_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/timhortons-captcha';
const CHAT_URL = 'https://reysan-ca-backend-77ah.vercel.app/api/timhortons-chat';
const STORE_PHONE = '780-000-0000'; // TODO: replace with the real store contact number

let sessionToken = null;
let history = [];
let customerId = null;
let customerAuth = null; // proves to the server we actually own customerId — see timhortons-chat.js
let phoneVerified = false;
let orderId = null;
let offTopicCount = 0;
let otpReminderCount = 0;
let guestInfoReminderCount = 0;
let lastKnownStatus = null;
let lastKnownTotal = null;
let overdueNotified = false;
let lastMessageCheckTime = null;
let inTakeover = false;
let pollTimer = null;
let conversationStarted = false; // guards against Turnstile silently re-verifying mid-session
let displayedMessages = []; // {text, who} — replayed on restore so a refresh doesn't look like the chat forgot everything

const SESSION_KEY = 'timhortons_session';
const SESSION_MAX_AGE_MS = 25 * 60 * 1000; // a bit under the server's own ~30 min token expiry

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      savedAt: Date.now(),
      sessionToken, history, customerId, customerAuth, phoneVerified, orderId,
      offTopicCount, otpReminderCount, guestInfoReminderCount,
      lastKnownStatus, lastKnownTotal, lastMessageCheckTime, inTakeover,
      displayedMessages
    }));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — fine,
    // this is a convenience feature, not something to break the chat over.
  }
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.sessionToken || Date.now() - saved.savedAt > SESSION_MAX_AGE_MS) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }

    sessionToken = saved.sessionToken;
    history = saved.history || [];
    customerId = saved.customerId;
    customerAuth = saved.customerAuth || null;
    phoneVerified = saved.phoneVerified;
    orderId = saved.orderId;
    offTopicCount = saved.offTopicCount || 0;
    otpReminderCount = saved.otpReminderCount || 0;
    guestInfoReminderCount = saved.guestInfoReminderCount || 0;
    lastKnownStatus = saved.lastKnownStatus;
    lastKnownTotal = saved.lastKnownTotal;
    lastMessageCheckTime = saved.lastMessageCheckTime;
    inTakeover = saved.inTakeover || false;
    displayedMessages = saved.displayedMessages || [];

    conversationStarted = true;
    gateEl.style.display = 'none';
    chatViewEl.style.display = 'flex';
    displayedMessages.forEach((m) => renderMessage(m.text, m.who));
    if (customerId) startPolling();
    return true;
  } catch {
    return false;
  }
}

const gateEl = document.getElementById('gate');
const gateErrorEl = document.getElementById('gate-error');
const chatViewEl = document.getElementById('chat-view');
const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = formEl.querySelector('button.send');

const sessionRestored = restoreSession();

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
      addMessage("Hi! I'm your Tim Hortons ordering assistant. What's your name and phone number so we can get started?", 'bot');
      inputEl.focus();
    }
    saveSession();
  } catch (err) {
    if (!conversationStarted) gateErrorEl.textContent = "Couldn't verify — check your connection and refresh.";
  }
};

// Appends a bubble to the DOM only — no state tracking. Used both for new
// messages (via addMessage) and for replaying history on restore.
function renderMessage(text, who) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = who === 'bot' ? stripMarkdown(text) : text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(text, who) {
  renderMessage(text, who);
  displayedMessages.push({ text, who });
  saveSession();
}

// Serverless functions can have a real cold-start delay — this makes sure
// the customer sees SOMETHING happening immediately rather than a chat
// that looks frozen while the function spins up.
function showTypingIndicator() {
  hideTypingIndicator(); // never stack more than one
  const div = document.createElement('div');
  div.className = 'msg bot typing-indicator';
  div.id = 'th-typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTypingIndicator() {
  const existing = document.getElementById('th-typing-indicator');
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
        customerAuth,
        phoneVerified,
        orderId,
        offTopicCount,
        otpReminderCount,
        guestInfoReminderCount
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
      customerAuth = data.customerAuth ?? customerAuth;
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
      customerAuth = data.customerAuth ?? customerAuth;
      phoneVerified = data.phoneVerified ?? phoneVerified;
      offTopicCount = data.offTopicCount ?? offTopicCount;
      otpReminderCount = data.otpReminderCount ?? otpReminderCount;
      guestInfoReminderCount = data.guestInfoReminderCount ?? guestInfoReminderCount;

      if (data.conversationEnded) {
        closeChat('Conversation ended');
        return;
      }

      if (data.orderId && data.orderId !== orderId) {
        orderId = data.orderId;
        lastKnownStatus = 'new';
        lastKnownTotal = null; // this is a different order now — don't compare its total against the old one's
        overdueNotified = false;
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
// While a staff member is actively chatting live, 15s between checks feels
// slow for a back-and-forth conversation — poll much faster during a
// takeover, and fall back to the normal, cheaper interval otherwise.
const TAKEOVER_POLL_INTERVAL_MS = 4000;
let currentPollIntervalMs = null;

function startPolling() {
  const desired = inTakeover ? TAKEOVER_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  if (pollTimer && currentPollIntervalMs === desired) return; // already running at the right speed
  if (pollTimer) clearInterval(pollTimer);
  currentPollIntervalMs = desired;
  pollTimer = setInterval(checkOrderStatus, desired);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  currentPollIntervalMs = null;
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
        customerAuth,
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
      startPolling(); // speed up now that a human is live
    } else if (inTakeover && !data.takeoverActive) {
      inTakeover = false;
      startPolling(); // back to the normal, cheaper interval
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
      } else if (data.status === 'completed') {
        // Usually reached via 'ready' first (which already closes the chat),
        // but this is a safety net in case a status jumps straight here.
        addMessage('Thank you for ordering! We hope you enjoyed it.', 'bot');
        closeChat('Order complete');
      } else if (data.status === 'cancelled') {
        addMessage(
          data.cancellation_reason
            ? `We're sorry, but your order has been cancelled: ${data.cancellation_reason}. Please contact the store at ${STORE_PHONE} if you have questions.`
            : `We're sorry, but your order has been cancelled. Please contact the store at ${STORE_PHONE} if you have questions.`,
          'bot'
        );
        closeChat('Order cancelled');
      } else if (data.status === 'no_show') {
        addMessage(
          `We're sorry, but this order was marked as a no-show since it wasn't picked up in time. Please contact the store at ${STORE_PHONE} if you'd still like to arrange pickup.`,
          'bot'
        );
        closeChat('Order not picked up');
      }
      lastKnownStatus = data.status;
      overdueNotified = false; // fresh status change resets the one-time overdue nudge
    } else if (
      data.status === 'accepted' &&
      data.remaining_minutes === 0 &&
      !overdueNotified
    ) {
      // Still "accepted" (staff hasn't marked it ready yet) but the ETA has
      // already passed — a one-time nudge so the customer isn't left
      // wondering, without repeating it every single poll.
      addMessage(
        `Your order should be ready by now — if you haven't heard from us, feel free to check with the store or call ${STORE_PHONE}.`,
        'bot'
      );
      overdueNotified = true;
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

    if (data.status === 'ready' || data.status === 'completed' || data.status === 'cancelled' || data.status === 'no_show') stopPolling();
  } catch (err) {
    // silent — this is a background poll, not worth surfacing a network error for
  }
}

function closeChat(placeholderText = 'Order complete') {
  inputEl.disabled = true;
  sendBtn.disabled = true;
  inputEl.placeholder = placeholderText;
}
// Applies saved theme on load and wires up the toggle button on every page.
(function () {
  var saved = localStorage.getItem('darfour-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();

function updateToggleLabel() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = isDark ? 'White template' : 'Dark template';
  }
}

function toggleTheme() {
  var html = document.documentElement;
  var isDark = html.getAttribute('data-theme') === 'dark';
  var next = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('darfour-theme', next);
  updateToggleLabel();
}

document.addEventListener('DOMContentLoaded', updateToggleLabel);

// Placeholder contact form handler (contact.html only).
// Wire this up to a real form backend (e.g. Formspree, a serverless
// function, or your own API) before going live.
function handleContactSubmit(event) {
  event.preventDefault();
  var status = document.getElementById('form-status');
  if (status) {
    status.textContent = 'This form is not connected yet. Hook it up to a form backend to receive messages.';
  }
}

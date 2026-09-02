var NOTIFIER_ICONS = {
  info: '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  success: '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  warn: '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  error: '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};

var container = null;
var MAX_TOASTS = 6;
var DEFAULT_DURATION = 2500;

function ensureContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.getElementById('notifier-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notifier-container';
      container.className = 'notifier-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }
  }
  return container;
}

function createSvg(html) {
  var d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild || d.firstChild || d;
}

function dismiss(toast) {
  if (!toast || toast._dismissed) return;
  toast._dismissed = true;
  if (toast._timer) clearTimeout(toast._timer);
  toast.classList.add('notifier-out');
  toast.addEventListener('animationend', function () {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  });
  setTimeout(function () {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 350);
}

function show(opts) {
  if (typeof opts === 'string') {
    opts = { message: opts };
  }
  opts = opts || {};
  var type = opts.type || 'info';
  if (type === 'warning') type = 'warn';
  var title = opts.title || '';
  var message = opts.message || '';
  var duration = typeof opts.duration === 'number' ? opts.duration : DEFAULT_DURATION;
  var customIcon = opts.icon;

  var parent = ensureContainer();

  while (parent.children.length >= MAX_TOASTS) {
    dismiss(parent.firstElementChild);
  }

  var toast = document.createElement('div');
  toast.className = 'notifier-toast notifier-' + type;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  var iconBox = document.createElement('div');
  iconBox.className = 'notifier-icon';
  var iconSvg = customIcon && NOTIFIER_ICONS[customIcon]
    ? NOTIFIER_ICONS[customIcon]
    : (NOTIFIER_ICONS[type] || NOTIFIER_ICONS.info);
  iconBox.appendChild(createSvg(iconSvg));
  toast.appendChild(iconBox);

  var body = document.createElement('div');
  body.className = 'notifier-body';

  if (title) {
    var titleEl = document.createElement('div');
    titleEl.className = 'notifier-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);
  }

  if (message) {
    var msgEl = document.createElement('div');
    msgEl.className = 'notifier-message';
    msgEl.textContent = message;
    body.appendChild(msgEl);
  }

  toast.appendChild(body);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'notifier-close';
  closeBtn.title = 'Dismiss';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createSvg(NOTIFIER_ICONS.close));
  closeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    dismiss(toast);
  });
  toast.appendChild(closeBtn);

  if (duration > 0) {
    var progress = document.createElement('div');
    progress.className = 'notifier-progress';
    var progressBar = document.createElement('div');
    progressBar.className = 'notifier-progress-bar';
    progressBar.style.animationDuration = duration + 'ms';
    progress.appendChild(progressBar);
    toast.appendChild(progress);

    var remaining = duration;
    var startTime = Date.now();

    var startTimer = function (time) {
      startTime = Date.now();
      toast._timer = setTimeout(function () {
        dismiss(toast);
      }, time);
    };

    toast.addEventListener('mouseenter', function () {
      if (toast._dismissed) return;
      clearTimeout(toast._timer);
      remaining -= (Date.now() - startTime);
      progressBar.style.animationPlayState = 'paused';
    });

    toast.addEventListener('mouseleave', function () {
      if (toast._dismissed) return;
      progressBar.style.animationPlayState = 'running';
      startTimer(Math.max(remaining, 500));
    });

    startTimer(duration);
  }

  if (typeof opts.onClick === 'function') {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', function (e) {
      if (e.target !== closeBtn && !closeBtn.contains(e.target)) {
        opts.onClick(e);
      }
    });
  }

  parent.appendChild(toast);
  return toast;
}

function clearAll() {
  if (!container) return;
  var toasts = Array.prototype.slice.call(container.children);
  toasts.forEach(dismiss);
}

export var Notifier = {
  show: show,
  dismiss: dismiss,
  clearAll: clearAll,
  info: function (message, title, opts) {
    opts = opts || {};
    opts.type = 'info';
    opts.message = message;
    if (title) opts.title = title;
    return show(opts);
  },
  success: function (message, title, opts) {
    opts = opts || {};
    opts.type = 'success';
    opts.message = message;
    if (title) opts.title = title;
    return show(opts);
  },
  warn: function (message, title, opts) {
    opts = opts || {};
    opts.type = 'warn';
    opts.message = message;
    if (title) opts.title = title;
    return show(opts);
  },
  error: function (message, title, opts) {
    opts = opts || {};
    opts.type = 'error';
    opts.message = message;
    if (title) opts.title = title;
    return show(opts);
  }
};

if (typeof window !== 'undefined') {
  window.Notifier = Notifier;
}

export default Notifier;

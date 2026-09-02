/**
 * hotkeys.js - Modular Keyboard Shortcuts Management & Help Modal for trintrin.
 */

import { createIcon } from './icons.js';

/**
 * Check if an element is an editable text container where standard typing occurs.
 * @param {EventTarget|HTMLElement|null} target
 * @returns {boolean}
 */
export function isEditableElement(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  var tag = target.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    var type = (target.getAttribute('type') || 'text').toLowerCase();
    var nonTextTypes = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'color', 'range'];
    return nonTextTypes.indexOf(type) === -1;
  }
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
    return true;
  }
  return false;
}

/**
 * Detect if current platform is macOS / Apple environment.
 * @returns {boolean}
 */
export function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent || '');
}

/**
 * Formats a key token for display (e.g. 'Mod' -> '⌘' on Mac, 'Ctrl' on Windows/Linux).
 * @param {string} token
 * @returns {string}
 */
export function formatKeyToken(token) {
  var mac = isMac();
  var t = String(token || '').trim();
  var lower = t.toLowerCase();

  if (lower === 'mod' || lower === 'cmdorctrl' || lower === 'command' || lower === 'cmd' || lower === '⌘') {
    return mac ? { type: 'icon', icon: 'cmdKey', title: 'Command (⌘)', text: '⌘' } : { type: 'text', text: 'Ctrl' };
  }
  if (lower === 'shift' || lower === '⇧') {
    return mac ? { type: 'icon', icon: 'shiftKey', title: 'Shift (⇧)', text: 'Shift' } : { type: 'text', text: 'Shift' };
  }
  if (lower === 'alt' || lower === 'option' || lower === 'opt' || lower === '⌥') {
    return mac ? { type: 'icon', icon: 'optKey', title: 'Option (⌥)', text: 'Alt' } : { type: 'text', text: 'Alt' };
  }
  if (lower === 'ctrl' || lower === 'control' || lower === '⌃') {
    return { type: 'text', text: 'Ctrl' };
  }
  if (lower === 'enter' || lower === 'return') {
    return { type: 'text', text: 'Enter' };
  }
  if (lower === 'escape' || lower === 'esc') {
    return { type: 'text', text: 'Esc' };
  }
  if (lower === 'slash' || lower === '/') {
    return { type: 'text', text: '/' };
  }
  if (lower === 'comma' || lower === ',') {
    return { type: 'text', text: ',' };
  }
  if (lower === 'question' || lower === '?') {
    return { type: 'text', text: '?' };
  }
  if (lower === 'space') {
    return { type: 'text', text: 'Space' };
  }
  if (lower === 'arrowup') return { type: 'text', text: '↑' };
  if (lower === 'arrowdown') return { type: 'text', text: '↓' };
  if (lower === 'arrowleft') return { type: 'text', text: '←' };
  if (lower === 'arrowright') return { type: 'text', text: '→' };

  return { type: 'text', text: t };
}

export function formatKey(token) {
  var item = formatKeyToken(token);
  return item.text || token;
}

export function formatComboTokens(combo) {
  if (!combo) return [];
  var parts = String(combo).split('+').map(function (p) { return p.trim(); }).filter(Boolean);
  return parts.map(formatKeyToken);
}

/**
 * Parses a combo string into a matcher object.
 * @param {string} combo
 * @returns {object}
 */
export function parseCombo(combo) {
  var parts = String(combo).split('+').map(function (p) { return p.trim(); }).filter(Boolean);
  var matcher = {
    ctrl: false,
    meta: false,
    mod: false,
    shift: false,
    alt: false,
    key: '',
    raw: combo
  };

  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].toLowerCase();
    if (p === 'ctrl' || p === 'control') {
      matcher.ctrl = true;
    } else if (p === 'meta' || p === 'cmd' || p === 'command') {
      matcher.meta = true;
    } else if (p === 'mod' || p === 'cmdorctrl') {
      matcher.mod = true;
    } else if (p === 'shift') {
      matcher.shift = true;
    } else if (p === 'alt' || p === 'option') {
      matcher.alt = true;
    } else {
      matcher.key = parts[i];
    }
  }

  return matcher;
}

/**
 * Checks if a KeyboardEvent matches a parsed combo or combo string.
 * @param {KeyboardEvent} event
 * @param {string|object} comboOrMatcher
 * @returns {boolean}
 */
export function matchesEvent(event, comboOrMatcher) {
  if (!event) return false;
  var matcher = typeof comboOrMatcher === 'string' ? parseCombo(comboOrMatcher) : comboOrMatcher;

  // Modifier checks
  if (matcher.mod) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    if (matcher.ctrl && !event.ctrlKey) return false;
    if (!matcher.ctrl && event.ctrlKey && !matcher.mod) return false;
    if (matcher.meta && !event.metaKey) return false;
    if (!matcher.meta && event.metaKey && !matcher.mod) return false;
  }

  if (matcher.shift && !event.shiftKey) return false;
  // If shift modifier was not requested, but the key itself is a shift-produced character (e.g. '?'),
  // we do not reject shiftKey.
  if (!matcher.shift && event.shiftKey && matcher.key !== '?') return false;

  if (matcher.alt && !event.altKey) return false;
  if (!matcher.alt && event.altKey) return false;

  var eventKey = event.key;
  var targetKey = matcher.key;

  if (!targetKey) return true;

  // Handle special aliases
  if (targetKey.toLowerCase() === 'esc' || targetKey.toLowerCase() === 'escape') {
    return eventKey === 'Escape' || eventKey === 'Esc';
  }
  if (targetKey.toLowerCase() === 'enter' || targetKey.toLowerCase() === 'return') {
    return eventKey === 'Enter';
  }
  if (targetKey === '?' || targetKey.toLowerCase() === 'question') {
    return eventKey === '?' || (event.shiftKey && eventKey === '/');
  }
  if (targetKey === '/' || targetKey.toLowerCase() === 'slash') {
    return eventKey === '/' && !event.shiftKey;
  }
  if (targetKey === ',' || targetKey.toLowerCase() === 'comma') {
    return eventKey === ',' && !event.shiftKey;
  }

  return eventKey.toLowerCase() === targetKey.toLowerCase();
}

/**
 * HotkeyManager coordinates global keyboard shortcut listeners and allows
 * hotkey definitions with descriptions and categories.
 */
export class HotkeyManager {
  constructor(options) {
    options = options || {};
    this.hotkeys = [];
    this.enabled = true;
    this.target = options.target || (typeof window !== 'undefined' ? window : null);
    this.modal = options.modal || null;
    this.onEscape = options.onEscape || null;
    this.boundKeyDown = this.handleKeyDown.bind(this);

    if (options.autoAttach !== false && this.target) {
      this.attach();
    }
  }

  /**
   * Register a new shortcut definition.
   * @param {object} def
   * @returns {HotkeyManager}
   */
  register(def) {
    if (!def || (!def.combo && !def.combos)) return this;
    var combos = def.combos || (Array.isArray(def.combo) ? def.combo : [def.combo]);
    var parsedCombos = combos.map(parseCombo);

    var item = {
      id: def.id || (typeof def.combo === 'string' ? def.combo : combos[0]),
      combos: combos,
      parsedCombos: parsedCombos,
      description: def.description || '',
      category: def.category || 'General',
      icon: def.icon || '',
      handler: def.handler || function () {},
      allowInInputs: Boolean(def.allowInInputs),
      preventDefault: def.preventDefault !== false,
      order: typeof def.order === 'number' ? def.order : 100
    };

    this.hotkeys.push(item);
    return this;
  }

  /**
   * Register multiple shortcut definitions.
   * @param {object[]} defs
   * @returns {HotkeyManager}
   */
  registerAll(defs) {
    if (Array.isArray(defs)) {
      defs.forEach(this.register.bind(this));
    }
    return this;
  }

  /**
   * Unregister a shortcut by id or combo string.
   * @param {string} id
   * @returns {HotkeyManager}
   */
  unregister(id) {
    this.hotkeys = this.hotkeys.filter(function (h) {
      return h.id !== id && h.combos.indexOf(id) === -1;
    });
    return this;
  }

  /**
   * Get all registered hotkeys.
   * @returns {object[]}
   */
  getHotkeys() {
    return this.hotkeys.slice();
  }

  /**
   * Get hotkeys grouped by category.
   * @returns {object} Map of category name to hotkey definitions.
   */
  getCategories() {
    var groups = {};
    for (var i = 0; i < this.hotkeys.length; i++) {
      var h = this.hotkeys[i];
      var cat = h.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(h);
    }
    return groups;
  }

  /**
   * Set reference to HotkeysModal instance.
   * @param {HotkeysModal} modal
   */
  setModal(modal) {
    this.modal = modal;
  }

  /**
   * Primary keydown event dispatcher.
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    if (!this.enabled || !event) return;

    var inEditable = isEditableElement(event.target);

    // Rule: When inside an input/textarea/editable box
    if (inEditable) {
      // If user clicks Escape in a text box: blur it so hotkeys can run normally!
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        if (event.target && typeof event.target.blur === 'function') {
          event.target.blur();
        }
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        return;
      }

      // Check if any registered hotkey explicitly allows execution inside inputs (e.g. Cmd+Enter to run query)
      for (var i = 0; i < this.hotkeys.length; i++) {
        var hk = this.hotkeys[i];
        if (!hk.allowInInputs) continue;

        for (var c = 0; c < hk.parsedCombos.length; c++) {
          if (matchesEvent(event, hk.parsedCombos[c])) {
            if (hk.preventDefault) event.preventDefault();
            hk.handler(event);
            return;
          }
        }
      }

      // Hotkeys should not work on any text-box or input box -> purely for writing text
      return;
    }

    // When NOT in an editable box:
    // Handle Escape: Close hotkeys modal if open, close open popovers, or run custom onEscape handler
    if (event.key === 'Escape' || event.key === 'Esc') {
      if (this.modal && this.modal.isOpen()) {
        event.preventDefault();
        this.modal.close();
        return;
      }

      var openPops = document.querySelectorAll('.pop.open');
      if (openPops.length > 0) {
        event.preventDefault();
        openPops.forEach(function (pop) { pop.classList.remove('open'); });
        return;
      }

      if (typeof this.onEscape === 'function') {
        this.onEscape(event);
      }
      return;
    }

    // Match registered hotkeys
    for (var j = 0; j < this.hotkeys.length; j++) {
      var item = this.hotkeys[j];
      for (var k = 0; k < item.parsedCombos.length; k++) {
        if (matchesEvent(event, item.parsedCombos[k])) {
          if (item.preventDefault) event.preventDefault();
          item.handler(event);
          return;
        }
      }
    }
  }

  /**
   * Attach global keydown listener.
   */
  attach() {
    if (this.target && this.target.addEventListener) {
      this.target.addEventListener('keydown', this.boundKeyDown, false);
    }
  }

  /**
   * Detach global keydown listener.
   */
  detach() {
    if (this.target && this.target.removeEventListener) {
      this.target.removeEventListener('keydown', this.boundKeyDown, false);
    }
  }

  /**
   * Cleanup resources.
   */
  destroy() {
    this.detach();
    if (this.modal) {
      this.modal.destroy();
      this.modal = null;
    }
    this.hotkeys = [];
  }
}

/**
 * HotkeysModal renders a clean, accessible dialog showing all registered shortcuts.
 */
export class HotkeysModal {
  constructor(manager, options) {
    options = options || {};
    this.manager = manager;
    this.title = options.title || 'Keyboard Shortcuts';
    this.tip = options.tip || 'Press <kbd>Esc</kbd> while inside any text box to exit and use shortcuts.';
    this.backdropEl = null;
    this.modalEl = null;
    this.previousActiveElement = null;
    this._isOpen = false;

    if (this.manager) {
      this.manager.setModal(this);
    }
  }

  /**
   * Check if modal is currently visible.
   * @returns {boolean}
   */
  isOpen() {
    return this._isOpen;
  }

  /**
   * Build and mount modal DOM elements.
   */
  render() {
    if (this.backdropEl && document.body.contains(this.backdropEl)) {
      this.updateContent();
      return this.backdropEl;
    }

    var backdrop = document.createElement('div');
    backdrop.className = 'hotkeys-backdrop';
    backdrop.id = 'hotkeysModalBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    var modal = document.createElement('div');
    modal.className = 'hotkeys-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'hotkeysModalTitle');

    // Header
    var header = document.createElement('div');
    header.className = 'hotkeys-header';

    var titleBox = document.createElement('div');
    titleBox.className = 'hotkeys-title';
    titleBox.id = 'hotkeysModalTitle';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'hotkeys-title-icon';
    iconSpan.appendChild(createIcon('keyboard'));
    titleBox.appendChild(iconSpan);

    var titleText = document.createElement('span');
    titleText.textContent = this.title;
    titleBox.appendChild(titleText);
    header.appendChild(titleBox);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'hotkeys-close-btn';
    closeBtn.title = 'Close (Esc)';
    closeBtn.setAttribute('aria-label', 'Close keyboard shortcuts modal');
    closeBtn.appendChild(createIcon('close'));
    closeBtn.addEventListener('click', this.close.bind(this));
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'hotkeys-body';
    body.id = 'hotkeysModalBody';
    modal.appendChild(body);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'hotkeys-footer';
    var tipBox = document.createElement('div');
    tipBox.className = 'hotkeys-tip';
    tipBox.innerHTML = this.tip;
    footer.appendChild(tipBox);

    var closeHint = document.createElement('div');
    closeHint.className = 'hotkeys-close-hint';
    closeHint.innerHTML = '<kbd>Esc</kbd> to close';
    footer.appendChild(closeHint);

    modal.appendChild(footer);

    backdrop.appendChild(modal);

    // Click outside modal to close
    backdrop.addEventListener('click', (function (event) {
      if (event.target === backdrop) {
        this.close();
      }
    }).bind(this));

    // Prevent clicks inside modal from closing
    modal.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;
    this.modalEl = modal;

    this.updateContent();
    return backdrop;
  }

  /**
   * Update categorized shortcuts list inside modal body.
   */
  updateContent() {
    if (!this.backdropEl) return;
    var body = this.backdropEl.querySelector('#hotkeysModalBody');
    if (!body) return;

    body.innerHTML = '';
    var categories = this.manager ? this.manager.getCategories() : {};
    var categoryOrder = ['Query & Execution', 'Navigation & Panels', 'Results & Data Table', 'Saved Queries', 'General & Help'];
    var categoryIcons = {
      'Query & Execution': 'play',
      'Navigation & Panels': 'sidebar',
      'Results & Data Table': 'table',
      'Saved Queries': 'bookmark',
      'General & Help': 'keyboard'
    };

    // Sort categories according to preferred display order
    var keys = Object.keys(categories);
    keys.sort(function (a, b) {
      var idxA = categoryOrder.indexOf(a);
      var idxB = categoryOrder.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    for (var i = 0; i < keys.length; i++) {
      var catName = keys[i];
      var list = categories[catName];
      if (!list || !list.length) continue;

      var section = document.createElement('div');
      section.className = 'hotkeys-section';

      var catTitle = document.createElement('h4');
      catTitle.className = 'hotkeys-section-title';
      if (categoryIcons[catName]) {
        var catIco = document.createElement('span');
        catIco.className = 'hotkeys-section-icon';
        catIco.appendChild(createIcon(categoryIcons[catName]));
        catTitle.appendChild(catIco);
      }
      var catTitleText = document.createElement('span');
      catTitleText.textContent = catName;
      catTitle.appendChild(catTitleText);
      section.appendChild(catTitle);

      var grid = document.createElement('div');
      grid.className = 'hotkeys-grid';

      for (var j = 0; j < list.length; j++) {
        var hk = list[j];
        var row = document.createElement('div');
        row.className = 'hotkeys-row';

        var labelBox = document.createElement('div');
        labelBox.className = 'hotkeys-label-box';

        if (hk.icon) {
          var rowIcon = document.createElement('span');
          rowIcon.className = 'hotkeys-row-icon';
          rowIcon.appendChild(createIcon(hk.icon));
          labelBox.appendChild(rowIcon);
        }

        var label = document.createElement('span');
        label.className = 'hotkeys-label';
        label.textContent = hk.description || hk.id;
        labelBox.appendChild(label);
        row.appendChild(labelBox);

        var keysBox = document.createElement('span');
        keysBox.className = 'hotkeys-keys';

        // Render formatted combos
        var comboStr = hk.combos[0] || '';
        var tokens = formatComboTokens(comboStr);
        for (var t = 0; t < tokens.length; t++) {
          var tok = tokens[t];
          var kbd = document.createElement('kbd');
          kbd.className = 'hotkeys-kbd';

          if (tok && typeof tok === 'object' && tok.type === 'icon' && tok.icon) {
            if (tok.title) kbd.title = tok.title;
            var keyIco = document.createElement('span');
            keyIco.className = 'hotkeys-key-icon';
            keyIco.appendChild(createIcon(tok.icon));
            kbd.appendChild(keyIco);
          } else {
            var text = (tok && typeof tok === 'object' ? tok.text : tok) || '';
            kbd.textContent = text;
          }

          keysBox.appendChild(kbd);
          if (t < tokens.length - 1 && !isMac()) {
            var plus = document.createElement('span');
            plus.className = 'hotkeys-plus';
            plus.textContent = '+';
            keysBox.appendChild(plus);
          }
        }

        row.appendChild(keysBox);
        grid.appendChild(row);
      }

      section.appendChild(grid);
      body.appendChild(section);
    }
  }

  /**
   * Open the shortcuts modal dialog.
   */
  open() {
    this.render();
    this.previousActiveElement = document.activeElement;
    this.backdropEl.classList.add('open');
    this.backdropEl.setAttribute('aria-hidden', 'false');
    this._isOpen = true;

    // Focus close button for accessibility
    var closeBtn = this.backdropEl.querySelector('.hotkeys-close-btn');
    if (closeBtn) {
      setTimeout(function () { closeBtn.focus(); }, 50);
    }
  }

  /**
   * Close the shortcuts modal dialog.
   */
  close() {
    if (!this.backdropEl || !this._isOpen) return;
    this.backdropEl.classList.remove('open');
    this.backdropEl.setAttribute('aria-hidden', 'true');
    this._isOpen = false;

    // Restore previous focus
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      try {
        this.previousActiveElement.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  /**
   * Toggle modal open/closed state.
   */
  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Remove modal from DOM.
   */
  destroy() {
    if (this.backdropEl && this.backdropEl.parentNode) {
      this.backdropEl.parentNode.removeChild(this.backdropEl);
    }
    this.backdropEl = null;
    this.modalEl = null;
    this._isOpen = false;
  }
}

/**
 * Setup standard hotkeys for trintrin.
 * @param {object} actions Callbacks for each action
 * @param {object} options Additional options
 * @returns {{ manager: HotkeyManager, modal: HotkeysModal }}
 */
export function initHotkeys(actions, options) {
  actions = actions || {};
  var manager = new HotkeyManager(options);
  var modal = new HotkeysModal(manager, options);

  // Register Standard Trintrin Hotkeys
  manager.registerAll([
    // Query & Execution
    {
      id: 'run-query',
      combo: 'Mod+Enter',
      category: 'Query & Execution',
      description: 'Run SQL query',
      icon: 'play',
      allowInInputs: true,
      handler: function () { if (actions.runQuery) actions.runQuery(); }
    },
    {
      id: 'focus-editor',
      combo: 'e',
      category: 'Query & Execution',
      description: 'Focus SQL editor',
      icon: 'edit',
      handler: function () { if (actions.focusEditor) actions.focusEditor(); }
    },
    {
      id: 'snipe-table',
      combos: ['Mod+Shift+L', 'l'],
      category: 'Query & Execution',
      description: 'Locate query table in tree (Snipe)',
      icon: 'snipe',
      allowInInputs: true,
      handler: function () { if (actions.snipeTable) actions.snipeTable(); }
    },

    // Navigation & Panels
    {
      id: 'toggle-sidebar',
      combo: 'b',
      category: 'Navigation & Panels',
      description: 'Toggle sidebar visibility',
      icon: 'sidebar',
      handler: function () { if (actions.toggleSidebar) actions.toggleSidebar(); }
    },
    {
      id: 'tab-explore',
      combo: '1',
      category: 'Navigation & Panels',
      description: 'Switch to Explore panel',
      icon: 'catalog',
      handler: function () { if (actions.switchTabExplore) actions.switchTabExplore(); }
    },
    {
      id: 'tab-saved',
      combo: '2',
      category: 'Navigation & Panels',
      description: 'Switch to Saved queries panel',
      icon: 'bookmark',
      handler: function () { if (actions.switchTabSaved) actions.switchTabSaved(); }
    },
    {
      id: 'filter-tree',
      combo: 'f',
      category: 'Navigation & Panels',
      description: 'Filter catalog tree',
      icon: 'filter',
      handler: function () { if (actions.focusTreeFilter) actions.focusTreeFilter(); }
    },
    {
      id: 'reload-catalogs',
      combo: 'r',
      category: 'Navigation & Panels',
      description: 'Reload catalogs & schemas',
      icon: 'reload',
      handler: function () { if (actions.reloadCatalogs) actions.reloadCatalogs(); }
    },

    // Results & Data Table
    {
      id: 'search-table',
      combo: '/',
      category: 'Results & Data Table',
      description: 'Search across visible columns',
      icon: 'search',
      handler: function () { if (actions.focusSearch) actions.focusSearch(); }
    },
    {
      id: 'clear-filters',
      combo: 'c',
      category: 'Results & Data Table',
      description: 'Clear search and column filters',
      icon: 'clear',
      handler: function () { if (actions.clearFilters) actions.clearFilters(); }
    },
    {
      id: 'download-csv',
      combo: 'd',
      category: 'Results & Data Table',
      description: 'Download results as CSV',
      icon: 'download',
      handler: function () { if (actions.downloadCsv) actions.downloadCsv(); }
    },
    {
      id: 'toggle-columns',
      combo: 'v',
      category: 'Results & Data Table',
      description: 'Toggle visible columns menu',
      icon: 'columns',
      handler: function () { if (actions.toggleColumns) actions.toggleColumns(); }
    },

    // Saved Queries
    {
      id: 'save-query',
      combo: 's',
      category: 'Saved Queries',
      description: 'Save current query',
      icon: 'bookmark',
      handler: function () { if (actions.saveCurrentQuery) actions.saveCurrentQuery(); }
    },
    {
      id: 'export-saved',
      combo: 'Mod+Shift+E',
      category: 'Saved Queries',
      description: 'Export saved queries JSON',
      icon: 'upload',
      handler: function () { if (actions.exportSavedQueries) actions.exportSavedQueries(); }
    },
    {
      id: 'import-saved',
      combo: 'Mod+Shift+I',
      category: 'Saved Queries',
      description: 'Import saved queries JSON',
      icon: 'download',
      handler: function () { if (actions.importSavedQueries) actions.importSavedQueries(); }
    },

    // General & Help
    {
      id: 'test-connection',
      combo: 't',
      category: 'General & Help',
      description: 'Test Trino connection',
      icon: 'zap',
      handler: function () { if (actions.testConnection) actions.testConnection(); }
    },
    {
      id: 'toggle-settings',
      combo: ',',
      category: 'General & Help',
      description: 'Toggle Settings menu',
      icon: 'settings',
      handler: function () { if (actions.toggleSettings) actions.toggleSettings(); }
    },
    {
      id: 'show-shortcuts',
      combos: ['?', 'Shift+/'],
      category: 'General & Help',
      description: 'Show keyboard shortcuts help',
      icon: 'keyboard',
      handler: function () { modal.toggle(); }
    },
    {
      id: 'escape-info',
      combo: 'Esc',
      category: 'General & Help',
      description: 'Exit text input / Close modal or menu',
      icon: 'escape',
      handler: function () {
        // Handled directly by manager
      }
    }
  ]);

  return { manager: manager, modal: modal };
}

if (typeof window !== 'undefined') {
  window.TrintrinHotkeys = {
    isEditableElement: isEditableElement,
    isMac: isMac,
    formatKey: formatKey,
    formatComboTokens: formatComboTokens,
    parseCombo: parseCombo,
    matchesEvent: matchesEvent,
    HotkeyManager: HotkeyManager,
    HotkeysModal: HotkeysModal,
    initHotkeys: initHotkeys
  };
}

export default {
  isEditableElement: isEditableElement,
  isMac: isMac,
  formatKey: formatKey,
  formatComboTokens: formatComboTokens,
  parseCombo: parseCombo,
  matchesEvent: matchesEvent,
  HotkeyManager: HotkeyManager,
  HotkeysModal: HotkeysModal,
  initHotkeys: initHotkeys
};

(function () {
  'use strict';

  var RENDER_CAP = 3000;
  var HUDI = /^_hoodie_/;
  var PICK_WIDTH = 30;
  var MIN_COL = 56, MAX_COL = 460, WIDTH_SAMPLE = 300;
  var CELL_FONT = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var HEAD_FONT = '620 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var el = function (id) { return document.getElementById(id); };

  var state = {
    columns: [], rows: [], filters: [], hidden: new Set(), widths: {},
    search: '', sort: null, selected: new Set(), view: []
  };
  var settings = { hideHudi: true, theme: 'auto' };
  var saved = [];
  var pendingView = null;   // a saved query's view, applied once its own SQL comes back

  var SVGS = {
    sidebar: '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    settings: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    reload: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    play: '<svg class="icon fill" viewBox="0 0 24 24" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    chevronRight: '<svg class="icon" viewBox="0 0 24 24" width="10" height="10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevronDown: '<svg class="icon" viewBox="0 0 24 24" width="10" height="10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" width="12" height="12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    columns: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>',
    clear: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    sortAsc: '<svg class="icon" viewBox="0 0 24 24" width="10" height="10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    sortDesc: '<svg class="icon" viewBox="0 0 24 24" width="10" height="10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    catalog: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    schema: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    table: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
    column: '<svg class="icon" viewBox="0 0 24 24" width="12" height="12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
    bookmark: '<svg class="icon" viewBox="0 0 24 24" width="13" height="13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
  };

  function createIcon(name) {
    var raw = SVGS[name];
    if (!raw) { return document.createTextNode(''); }
    var div = document.createElement('div');
    div.innerHTML = raw;
    return div.firstElementChild;
  }

  /* ---------- persistence (localStorage for browser state, server API for queries) ---------- */

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem('trintrin.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem('trintrin.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /* ---------- helpers ---------- */

  function text(value) { return value === null || value === undefined ? '' : String(value); }
  function quote(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }
  function visibleColumns() {
    var out = [];
    for (var i = 0; i < state.columns.length; i++) { if (!state.hidden.has(i)) { out.push(i); } }
    return out;
  }
  function showError(message) {
    var box = el('error');
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
  }

  function ask(server, user, path, payload) {
    payload.server = server;
    payload.user = user;
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) { return response.json(); }).then(function (result) {
      if (result.error) { throw new Error(result.error); }
      return result;
    });
  }
  function query(sql) {
    return ask(el('server').value.trim(), el('user').value.trim(), '/api/query', { sql: sql });
  }

  /* ---------- connection test ---------- */

  function setPill(kind, message) {
    el('dot').className = kind;
    el('pillText').textContent = message;
  }

  el('test').addEventListener('click', function () {
    var button = el('test');
    button.disabled = true;
    setPill('', 'testing…');
    ask(el('server').value.trim(), el('user').value.trim(), '/api/ping', {}).then(function (info) {
      setPill('ok', 'Trino ' + info.version + ' · ' + info.environment + ' · ' + info.state.toLowerCase() +
                    ' · up ' + info.uptime + ' · ' + info.elapsed_ms + ' ms');
      showError('');
      store('server', el('server').value.trim());
      store('user', el('user').value.trim());
      loadCatalogs();
    }).catch(function (error) {
      setPill('bad', 'unreachable');
      showError(String(error.message || error));
    }).then(function () { button.disabled = false; });
  });

  /* ---------- explorer: catalogs > schemas > tables > columns ---------- */

  function setTwisty(twisty, open) {
    twisty.textContent = '';
    twisty.appendChild(createIcon(open ? 'chevronDown' : 'chevronRight'));
  }

  function makeNode(label, type, options) {
    options = options || {};
    var li = document.createElement('li');
    var node = document.createElement('div');
    node.className = 'node' + (options.leaf ? ' leaf' : '');

    var twisty = document.createElement('span');
    twisty.className = 'tw';
    if (!options.leaf) {
      setTwisty(twisty, false);
    }
    node.appendChild(twisty);

    if (options.icon) {
      var ico = document.createElement('span');
      ico.className = 'ico';
      ico.appendChild(createIcon(options.icon));
      node.appendChild(ico);
    }

    var name = document.createElement('span');
    name.className = 'nm';
    name.textContent = label;
    name.title = label;
    node.appendChild(name);

    if (type) {
      var kind = document.createElement('span');
      kind.className = 'ty';
      kind.textContent = type;
      node.appendChild(kind);
    }
    if (options.onRun) {
      var go = document.createElement('button');
      go.className = 'go';
      go.appendChild(createIcon('play'));
      go.title = 'Query this table';
      go.addEventListener('click', function (event) { event.stopPropagation(); options.onRun(); });
      node.appendChild(go);
    }

    li.appendChild(node);
    if (options.leaf) { return li; }

    var children = document.createElement('ul');
    children.hidden = true;
    li.appendChild(children);

    var loaded = false;
    var toggle = function () {
      children.hidden = !children.hidden;
      setTwisty(twisty, !children.hidden);
      if (!loaded && !children.hidden) {
        loaded = true;
        var pending = document.createElement('li');
        pending.className = 'note';
        pending.textContent = 'loading…';
        children.appendChild(pending);
        options.expand(children).catch(function (error) {
          children.textContent = '';
          var failed = document.createElement('li');
          failed.className = 'note';
          failed.textContent = String(error.message || error);
          children.appendChild(failed);
          loaded = false;
        });
      }
    };
    twisty.addEventListener('click', toggle);
    name.addEventListener('click', function () { toggle(); if (options.onSelect) { options.onSelect(); } });
    return li;
  }

  function fill(container, rows, build) {
    container.textContent = '';
    if (!rows.length) {
      var none = document.createElement('li');
      none.className = 'note';
      none.textContent = 'empty';
      container.appendChild(none);
      return;
    }
    rows.forEach(function (row) { container.appendChild(build(row)); });
  }

  function tableNode(catalog, schema, table) {
    var fqn = quote(catalog) + '.' + quote(schema) + '.' + quote(table);
    var select = 'SELECT *\nFROM ' + fqn + '\nLIMIT 100';
    return makeNode(table, '', {
      icon: 'table',
      onSelect: function () { el('sql').value = select; store('sql', select); },
      onRun: function () { el('sql').value = select; store('sql', select); run(); },
      expand: function (children) {
        return query('DESCRIBE ' + fqn).then(function (result) {
          fill(children, result.rows, function (row) {
            return makeNode(row[0], row[1], { leaf: true, icon: 'column' });
          });
        });
      }
    });
  }

  function schemaNode(catalog, schema) {
    return makeNode(schema, '', {
      icon: 'schema',
      expand: function (children) {
        return query('SHOW TABLES FROM ' + quote(catalog) + '.' + quote(schema)).then(function (result) {
          fill(children, result.rows, function (row) { return tableNode(catalog, schema, row[0]); });
        });
      }
    });
  }

  function catalogNode(catalog) {
    return makeNode(catalog, '', {
      icon: 'catalog',
      expand: function (children) {
        return query('SHOW SCHEMAS FROM ' + quote(catalog)).then(function (result) {
          fill(children, result.rows, function (row) { return schemaNode(catalog, row[0]); });
        });
      }
    });
  }

  function loadCatalogs() {
    var tree = el('tree'), note = el('treeNote');
    tree.textContent = '';
    note.textContent = 'Loading catalogs…';
    note.hidden = false;
    query('SHOW CATALOGS').then(function (result) {
      note.hidden = true;
      result.rows.forEach(function (row) { tree.appendChild(catalogNode(row[0])); });
    }).catch(function (error) {
      note.hidden = false;
      note.textContent = 'Could not list catalogs — ' + (error.message || error);
    });
  }

  /* client-side filtering over what is currently rendered in the tree */
  el('treeFilter').addEventListener('input', function () {
    var needle = this.value.trim().toLowerCase();
    var all = el('tree').querySelectorAll('li');
    if (!needle) {
      all.forEach(function (li) { li.style.display = ''; });
      return;
    }
    all.forEach(function (li) {
      var nameEl = li.querySelector('.nm');
      var textContent = nameEl ? nameEl.textContent.toLowerCase() : '';
      var matches = textContent.indexOf(needle) !== -1;
      li.style.display = matches ? '' : 'none';
      if (matches) {
        var parent = li.parentElement;
        while (parent && parent.id !== 'tree') {
          if (parent.tagName === 'UL') { parent.hidden = false; }
          if (parent.tagName === 'LI') { parent.style.display = ''; }
          parent = parent.parentElement;
        }
      }
    });
  });
  el('reload').addEventListener('click', loadCatalogs);

  /* ---------- saved queries (stored on machine via /api/saved) ---------- */

  function currentView() {
    var hidden = [];
    state.hidden.forEach(function (i) { hidden.push(state.columns[i]); });
    var filters = {};
    state.filters.forEach(function (val, i) {
      if (val) { filters[state.columns[i]] = val; }
    });
    return {
      hidden: hidden,
      filters: filters,
      search: state.search,
      sort: state.sort ? { column: state.columns[state.sort.column], direction: state.sort.direction } : null
    };
  }

  function applyView(view) {
    if (!view) { return; }
    var indexOf = {};
    state.columns.forEach(function (name, index) { indexOf[name] = index; });

    state.hidden = new Set();
    (view.hidden || []).forEach(function (name) {
      if (indexOf[name] !== undefined) { state.hidden.add(indexOf[name]); }
    });

    state.filters = state.columns.map(function () { return ''; });
    Object.keys(view.filters || {}).forEach(function (name) {
      if (indexOf[name] !== undefined) { state.filters[indexOf[name]] = view.filters[name]; }
    });

    state.search = view.search || '';
    el('search').value = state.search;

    state.sort = view.sort && indexOf[view.sort.column] !== undefined
      ? { column: indexOf[view.sort.column], direction: view.sort.direction }
      : null;
  }

  function describeView(view) {
    if (!view) { return 'no saved view'; }
    var bits = [];
    var plural = function (count, noun) { return count + ' ' + noun + (count === 1 ? '' : 's'); };
    if (view.hidden && view.hidden.length) { bits.push(plural(view.hidden.length, 'hidden column')); }
    var filterCount = view.filters ? Object.keys(view.filters).length : 0;
    if (filterCount) { bits.push(plural(filterCount, 'column filter')); }
    if (view.search) { bits.push('search "' + view.search + '"'); }
    if (view.sort) { bits.push('sorted by ' + view.sort.column); }
    return bits.length ? bits.join(', ') : 'no filters or hidden columns';
  }

  function loadSaved() {
    return fetch('/api/saved').then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    }).then(function (data) {
      var list = Array.isArray(data.saved) ? data.saved : [];
      if (!list.length) {
        var legacy = load('saved', []);
        if (legacy && legacy.length) {
          saved = legacy;
          saveSaved(saved);
          try { localStorage.removeItem('trintrin.saved'); } catch (e) {}
          return;
        }
      }
      saved = list;
      renderSaved();
    }).catch(function () {
      saved = load('saved', []);
      renderSaved();
    });
  }

  function saveSaved(list) {
    saved = list;
    renderSaved();
    fetch('/api/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved: list })
    }).catch(function (error) {
      showError('Could not save queries to machine: ' + (error.message || error));
    });
  }

  function renderSaved() {
    var list = el('savedList');
    list.textContent = '';

    if (!saved.length) {
      var note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Nothing saved yet. Write a query, then hit Save current query.';
      list.appendChild(note);
      return;
    }

    saved.forEach(function (item, index) {
      var row = document.createElement('div');
      row.className = 'saved-item';

      var ico = document.createElement('span');
      ico.className = 'ico';
      ico.appendChild(createIcon('bookmark'));
      row.appendChild(ico);

      var name = document.createElement('span');
      name.className = 'nm';
      name.textContent = item.name;
      name.title = item.sql + '\n\n' + describeView(item.view);
      name.addEventListener('click', function () {
        el('sql').value = item.sql;
        store('sql', item.sql);
        pendingView = item.view ? { sql: item.sql.trim(), view: item.view } : null;
        el('status').textContent = pendingView
          ? 'Loaded "' + item.name + '" - run it to restore ' + describeView(item.view)
          : 'Loaded "' + item.name + '"';
      });
      row.appendChild(name);

      var remove = document.createElement('button');
      remove.className = 'del';
      remove.appendChild(createIcon('trash'));
      remove.title = 'Delete query';
      remove.addEventListener('click', function (event) {
        event.stopPropagation();
        saved.splice(index, 1);
        saveSaved(saved);
      });
      row.appendChild(remove);

      list.appendChild(row);
    });
  }

  el('saveCurrent').addEventListener('click', function () {
    var sql = el('sql').value.trim();
    if (!sql) { return; }
    var name = window.prompt('Name this query', sql.split('\n')[0].slice(0, 60));
    if (!name) { return; }
    var existing = -1;
    for (var i = 0; i < saved.length; i++) { if (saved[i].name === name) { existing = i; } }
    var entry = { name: name, sql: sql, view: currentView() };
    if (existing >= 0) { saved[existing] = entry; } else { saved.push(entry); }
    saveSaved(saved);
  });

  /* ---------- results: columns, filters, sorting, selection ---------- */

  function applyDefaultHiding() {
    state.hidden = new Set();
    if (settings.hideHudi) {
      state.columns.forEach(function (name, index) { if (HUDI.test(name)) { state.hidden.add(index); } });
    }
  }

  function renderColumnPicker() {
    var list = el('colsList');
    list.textContent = '';
    state.columns.forEach(function (name, index) {
      var label = document.createElement('label');
      label.className = 'check';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !state.hidden.has(index);
      box.addEventListener('change', function () {
        if (box.checked) { state.hidden.delete(index); }
        else { state.hidden.add(index); state.filters[index] = ''; }
        redraw();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(name));
      list.appendChild(label);
    });
    var btn = el('colsBtn');
    btn.textContent = '';
    btn.appendChild(createIcon('columns'));
    btn.appendChild(document.createTextNode(' Columns (' + visibleColumns().length + '/' + state.columns.length + ')'));
  }

  function matches(row) {
    var visible = visibleColumns();
    for (var i = 0; i < visible.length; i++) {
      var needle = state.filters[visible[i]];
      if (needle && text(row[visible[i]]).toLowerCase().indexOf(needle) === -1) { return false; }
    }
    if (!state.search) { return true; }
    for (var j = 0; j < visible.length; j++) {
      if (text(row[visible[j]]).toLowerCase().indexOf(state.search) !== -1) { return true; }
    }
    return false;
  }

  function recompute() {
    var view = [];
    for (var i = 0; i < state.rows.length; i++) {
      if (matches(state.rows[i])) { view.push(i); }
    }
    if (state.sort) {
      var col = state.sort.column, dir = state.sort.direction === 'asc' ? 1 : -1;
      view.sort(function (a, b) {
        var va = state.rows[a][col], vb = state.rows[b][col];
        if (va === null || va === undefined) { return 1; }
        if (vb === null || vb === undefined) { return -1; }
        if (typeof va === 'number' && typeof vb === 'number') { return (va - vb) * dir; }
        return String(va).localeCompare(String(vb)) * dir;
      });
    }
    state.view = view;
  }

  /* ---------- text width measurement & column auto-sizing ---------- */

  var measureCanvas = null;
  function measure(textValue, font) {
    if (!measureCanvas) { measureCanvas = document.createElement('canvas'); }
    var ctx = measureCanvas.getContext('2d');
    ctx.font = font;
    return ctx.measureText(textValue).width;
  }

  function autoWidth(index) {
    if (state.widths[index]) { return state.widths[index]; }
    var max = measure(state.columns[index], HEAD_FONT) + 24;
    var sample = Math.min(state.rows.length, WIDTH_SAMPLE);
    for (var i = 0; i < sample; i++) {
      var val = state.rows[i][index];
      if (val === null || val === undefined) { continue; }
      var w = measure(String(val), CELL_FONT) + 18;
      if (w > max) { max = w; }
    }
    return Math.max(MIN_COL, Math.min(MAX_COL, Math.ceil(max)));
  }

  /* ---------- table rendering ---------- */

  function attachGrip(th, index, colEl) {
    var grip = document.createElement('span');
    grip.className = 'grip';
    grip.title = 'Drag to resize column';
    grip.addEventListener('click', function (event) { event.stopPropagation(); });
    grip.addEventListener('mousedown', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var startX = event.clientX;
      var startWidth = colEl.offsetWidth;
      document.body.classList.add('resizing');
      var move = function (e) {
        var next = Math.max(MIN_COL, startWidth + (e.clientX - startX));
        colEl.style.width = next + 'px';
        state.widths[index] = next;
      };
      var stop = function () {
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', stop);
    });
    th.appendChild(grip);
  }

  function renderHead() {
    var head = el('head'), filterRow = el('filterRow'), colgroup = el('colgroup');
    head.textContent = ''; filterRow.textContent = ''; colgroup.textContent = '';

    var pickCol = document.createElement('col');
    pickCol.style.width = PICK_WIDTH + 'px';
    colgroup.appendChild(pickCol);

    var cols = {};
    visibleColumns().forEach(function (index) {
      var col = document.createElement('col');
      col.style.width = autoWidth(index) + 'px';
      colgroup.appendChild(col);
      cols[index] = col;
    });

    var pick = document.createElement('th');
    pick.className = 'pick';
    var all = document.createElement('input');
    all.type = 'checkbox';
    all.id = 'selectAll';
    all.title = 'Select every matching row';
    all.addEventListener('change', function () {
      state.view.forEach(function (i) { if (all.checked) { state.selected.add(i); } else { state.selected.delete(i); } });
      renderBody();
    });
    pick.appendChild(all);
    head.appendChild(pick);
    var filterPick = document.createElement('th');
    filterPick.className = 'pick';
    filterRow.appendChild(filterPick);

    visibleColumns().forEach(function (index) {
      var th = document.createElement('th');
      th.textContent = state.columns[index];
      th.title = 'Sort by ' + state.columns[index];
      if (state.sort && state.sort.column === index) {
        var arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.appendChild(createIcon(state.sort.direction === 'asc' ? 'sortAsc' : 'sortDesc'));
        th.appendChild(arrow);
      }
      th.addEventListener('click', function () {
        if (!state.sort || state.sort.column !== index) { state.sort = { column: index, direction: 'asc' }; }
        else if (state.sort.direction === 'asc') { state.sort = { column: index, direction: 'desc' }; }
        else { state.sort = null; }
        redraw();
      });
      attachGrip(th, index, cols[index]);
      head.appendChild(th);

      var cell = document.createElement('th');
      var input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'filter';
      input.value = state.filters[index] || '';
      input.addEventListener('input', function () {
        state.filters[index] = input.value.trim().toLowerCase();
        recompute();
        renderBody();
      });
      cell.appendChild(input);
      filterRow.appendChild(cell);
    });
  }

  function renderBody() {
    var body = el('body');
    body.textContent = '';
    var visible = visibleColumns();
    var shown = Math.min(state.view.length, RENDER_CAP);
    var fragment = document.createDocumentFragment();

    for (var n = 0; n < shown; n++) {
      var index = state.view[n], row = state.rows[index];
      var tr = document.createElement('tr');
      if (state.selected.has(index)) { tr.className = 'selected'; }

      var pick = document.createElement('td');
      pick.className = 'pick';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = state.selected.has(index);
      box.addEventListener('change', (function (rowIndex, trEl, checkbox) {
        return function () {
          if (checkbox.checked) { state.selected.add(rowIndex); trEl.className = 'selected'; }
          else { state.selected.delete(rowIndex); trEl.className = ''; }
          updateStatus();
        };
      })(index, tr, box));
      pick.appendChild(box);
      tr.appendChild(pick);

      for (var c = 0; c < visible.length; c++) {
        var value = row[visible[c]];
        var td = document.createElement('td');
        if (value === null || value === undefined) { td.textContent = 'NULL'; td.className = 'null'; }
        else { td.textContent = String(value); td.title = String(value); }
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }
    body.appendChild(fragment);

    var all = el('selectAll');
    if (all) {
      var picked = state.view.filter(function (i) { return state.selected.has(i); }).length;
      all.checked = picked > 0 && picked === state.view.length;
      all.indeterminate = picked > 0 && picked < state.view.length;
    }
    updateStatus(shown);
  }

  function redraw() {
    renderColumnPicker();
    renderHead();
    recompute();
    renderBody();
  }

  function updateStatus(shown) {
    var parts = [state.view.length + ' of ' + state.rows.length + ' rows'];
    if (state.selected.size) { parts.push(state.selected.size + ' selected'); }
    if (state.hidden.size) { parts.push(state.hidden.size + ' columns hidden'); }
    if (shown !== undefined && shown < state.view.length) { parts.push('showing first ' + shown); }
    el('status').textContent = parts.join(' · ');
  }

  /* ---------- CSV export ---------- */

  function csvCell(value) {
    var cell = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  }

  el('download').addEventListener('click', function () {
    if (!state.columns.length) { return; }
    var visible = visibleColumns();
    var indices = state.selected.size
      ? state.view.filter(function (i) { return state.selected.has(i); })
      : state.view;
    if (!indices.length || !visible.length) { return; }

    var lines = [visible.map(function (i) { return csvCell(state.columns[i]); }).join(',')];
    indices.forEach(function (i) {
      lines.push(visible.map(function (c) { return csvCell(state.rows[i][c]); }).join(','));
    });

    var url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'trintrin_results.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------- run ---------- */

  function run() {
    var sql = el('sql').value.trim();
    if (!sql) { return; }
    store('server', el('server').value.trim());
    store('user', el('user').value.trim());
    store('sql', sql);

    var button = el('run');
    button.disabled = true;
    button.textContent = 'Running…';
    showError('');
    el('status').textContent = 'Running…';
    var started = Date.now();

    query(sql).then(function (result) {
      state.columns = result.columns || [];
      state.rows = result.rows || [];
      state.filters = state.columns.map(function () { return ''; });
      state.widths = {};
      state.selected = new Set();
      state.sort = null;
      state.search = '';
      el('search').value = '';
      applyDefaultHiding();
      if (pendingView && pendingView.sql === sql) { applyView(pendingView.view); }
      pendingView = null;
      el('empty').hidden = true;
      el('table').hidden = false;
      redraw();
      el('status').textContent = state.rows.length + ' rows in ' + (Date.now() - started) + ' ms';
    }).catch(function (error) {
      showError(String(error.message || error));
      el('status').textContent = 'Query failed';
    }).then(function () {
      button.disabled = false;
      button.textContent = '';
      button.appendChild(createIcon('play'));
      button.appendChild(document.createTextNode(' Run query'));
    });
  }

  /* ---------- wiring ---------- */

  el('run').addEventListener('click', run);
  el('search').addEventListener('input', function () {
    state.search = this.value.trim().toLowerCase();
    recompute();
    renderBody();
  });
  el('clear').addEventListener('click', function () {
    state.filters = state.columns.map(function () { return ''; });
    state.search = '';
    el('search').value = '';
    recompute();
    renderHead();
    renderBody();
  });

  el('colsAll').addEventListener('click', function () { state.hidden = new Set(); redraw(); });
  el('colsNone').addEventListener('click', function () {
    state.hidden = new Set(state.columns.map(function (_, i) { return i; }));
    redraw();
  });
  el('colsNoHudi').addEventListener('click', function () { applyDefaultHiding(); redraw(); });

  el('hideHudi').addEventListener('change', function () {
    settings.hideHudi = this.checked;
    store('settings', settings);
  });
  el('toggleSide').addEventListener('click', function () { el('side').classList.toggle('hidden'); });

  document.querySelectorAll('.tabs button').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (other) { other.classList.remove('on'); });
      document.querySelectorAll('.pane').forEach(function (pane) { pane.classList.remove('on'); });
      tab.classList.add('on');
      el('pane-' + tab.dataset.pane).classList.add('on');
    });
  });

  ['settingsPop', 'colsPop'].forEach(function (id) {
    var pop = el(id);
    pop.querySelector('button').addEventListener('click', function (event) {
      event.stopPropagation();
      var open = pop.classList.contains('open');
      document.querySelectorAll('.pop').forEach(function (other) { other.classList.remove('open'); });
      if (!open) { pop.classList.add('open'); }
    });
    pop.querySelector('.sheet').addEventListener('click', function (event) { event.stopPropagation(); });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.pop').forEach(function (pop) { pop.classList.remove('open'); });
  });
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run(); }
    if (event.key === 'Escape') {
      document.querySelectorAll('.pop').forEach(function (pop) { pop.classList.remove('open'); });
    }
  });

  /* ---------- theme (auto / light / dark) ---------- */

  function applyTheme(theme) {
    settings.theme = (theme === 'dark' || theme === 'light') ? theme : 'auto';
    store('settings', settings);
    if (settings.theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
    updateThemeUI();
  }

  function updateThemeUI() {
    var active = settings.theme || 'auto';
    ['themeAuto', 'themeLight', 'themeDark'].forEach(function (id) {
      var b = el(id);
      if (!b) { return; }
      var mode = id.replace('theme', '').toLowerCase();
      if (active === mode) {
        b.classList.add('primary');
      } else {
        b.classList.remove('primary');
      }
    });
  }

  el('themeAuto').addEventListener('click', function () { applyTheme('auto'); });
  el('themeLight').addEventListener('click', function () { applyTheme('light'); });
  el('themeDark').addEventListener('click', function () { applyTheme('dark'); });

  /* ---------- sidebar resizer ---------- */

  var DEFAULT_SIDE_WIDTH = 268;
  var MIN_SIDE_WIDTH = 160;

  function initSidebarResizer() {
    var side = el('side');
    var resizer = el('sideResizer');
    if (!side || !resizer) { return; }

    var savedWidth = load('sideWidth', DEFAULT_SIDE_WIDTH);
    if (savedWidth && typeof savedWidth === 'number' && savedWidth >= MIN_SIDE_WIDTH) {
      side.style.width = savedWidth + 'px';
    }

    resizer.addEventListener('dblclick', function () {
      side.style.width = DEFAULT_SIDE_WIDTH + 'px';
      store('sideWidth', DEFAULT_SIDE_WIDTH);
    });

    resizer.addEventListener('mousedown', function (event) {
      event.preventDefault();
      var startX = event.clientX;
      var startWidth = side.offsetWidth;
      document.body.classList.add('resizing-side');

      var move = function (e) {
        var maxAllowed = Math.max(MIN_SIDE_WIDTH, window.innerWidth - 300);
        var nextWidth = Math.min(maxAllowed, Math.max(MIN_SIDE_WIDTH, startWidth + (e.clientX - startX)));
        side.style.width = nextWidth + 'px';
      };

      var stop = function () {
        document.body.classList.remove('resizing-side');
        store('sideWidth', side.offsetWidth);
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
      };

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', stop);
    });
  }

  /* ---------- boot ---------- */

  settings = load('settings', settings);
  applyTheme(settings.theme || 'auto');
  el('hideHudi').checked = settings.hideHudi;
  el('server').value = load('server', el('server').value);
  el('user').value = load('user', el('user').value);
  el('sql').value = load('sql', '');
  initSidebarResizer();
  loadSaved();
  loadCatalogs();
})();

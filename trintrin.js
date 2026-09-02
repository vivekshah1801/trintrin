import { Notifier } from './webutils/notifier.js';
import { createIcon } from './webutils/icons.js';
import { load, store } from './webutils/storage.js';
import { autoWidth as calcAutoWidth } from './webutils/measure.js';
import { downloadCsv } from './webutils/csv.js';
import { snipeCurrent } from './webutils/snipe.js';
import { initHotkeys } from './webutils/hotkeys.js';

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
var selectedSaved = new Set();
var draggedSavedIndex = null;
var pendingView = null; // a saved query's view, applied once its own SQL comes back

/* ---------- helpers ---------- */

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

function autoWidth(index) {
  return calcAutoWidth(state.columns, state.rows, state.widths, index, {
    headFont: HEAD_FONT,
    cellFont: CELL_FONT,
    minCol: MIN_COL,
    maxCol: MAX_COL,
    widthSample: WIDTH_SAMPLE
  });
}

async function ask(server, user, path, payload) {
  payload.server = server;
  payload.user = user;
  var response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  var result = await response.json();
  if (result.error) { throw new Error(result.error); }
  return result;
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
    if (Notifier) {
      Notifier.success('Connected to Trino ' + info.version + ' (' + info.environment + ')', 'Connection OK');
    }
  }).catch(function (error) {
    setPill('bad', 'unreachable');
    showError(String(error.message || error));
    if (Notifier) {
      Notifier.error(String(error.message || error), 'Connection Failed');
    }
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
  li.dataset.name = label;
  if (options.kind) { li.dataset.kind = options.kind; }
  if (options.catalog) { li.dataset.catalog = options.catalog; }
  if (options.schema) { li.dataset.schema = options.schema; }
  if (options.table) { li.dataset.table = options.table; }

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
  if (options.leaf) {
    li.expandNode = function () { return Promise.resolve(null); };
    return li;
  }

  var children = document.createElement('ul');
  children.hidden = true;
  li.appendChild(children);

  var loaded = false;
  var loadingPromise = null;

  var expandNode = function () {
    children.hidden = false;
    setTwisty(twisty, true);

    if (loaded) {
      return Promise.resolve(children);
    }
    if (loadingPromise) {
      return loadingPromise;
    }

    var pending = document.createElement('li');
    pending.className = 'note';
    pending.textContent = 'loading…';
    children.appendChild(pending);

    loadingPromise = Promise.resolve().then(function () {
      return options.expand(children);
    }).then(function () {
      loaded = true;
      loadingPromise = null;
      return children;
    }).catch(function (error) {
      children.textContent = '';
      var failed = document.createElement('li');
      failed.className = 'note';
      failed.textContent = String(error.message || error);
      children.appendChild(failed);
      loaded = false;
      loadingPromise = null;
      throw error;
    });

    return loadingPromise;
  };

  var toggle = function () {
    if (!children.hidden) {
      children.hidden = true;
      setTwisty(twisty, false);
    } else {
      expandNode();
    }
  };

  li.expandNode = expandNode;
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
    kind: 'table',
    catalog: catalog,
    schema: schema,
    table: table,
    icon: 'table',
    onSelect: function () { el('sql').value = select; store('sql', select); },
    onRun: function () { el('sql').value = select; store('sql', select); run(); },
    expand: async function (children) {
      var result = await query('DESCRIBE ' + fqn);
      fill(children, result.rows, function (row) {
        return makeNode(row[0], row[1], { leaf: true, icon: 'column', kind: 'column' });
      });
    }
  });
}

function schemaNode(catalog, schema) {
  return makeNode(schema, '', {
    kind: 'schema',
    catalog: catalog,
    schema: schema,
    icon: 'schema',
    expand: async function (children) {
      var result = await query('SHOW TABLES FROM ' + quote(catalog) + '.' + quote(schema));
      fill(children, result.rows, function (row) { return tableNode(catalog, schema, row[0]); });
    }
  });
}

function catalogNode(catalog) {
  return makeNode(catalog, '', {
    kind: 'catalog',
    catalog: catalog,
    icon: 'catalog',
    expand: async function (children) {
      var result = await query('SHOW SCHEMAS FROM ' + quote(catalog));
      fill(children, result.rows, function (row) { return schemaNode(catalog, row[0]); });
    }
  });
}

var catalogsPromise = null;
function loadCatalogs() {
  var tree = el('tree'), note = el('treeNote');
  tree.textContent = '';
  note.textContent = 'Loading catalogs…';
  note.hidden = false;
  catalogsPromise = query('SHOW CATALOGS').then(function (result) {
    note.hidden = true;
    result.rows.forEach(function (row) { tree.appendChild(catalogNode(row[0])); });
    return result;
  }).catch(function (error) {
    note.hidden = false;
    note.textContent = 'Could not list catalogs — ' + (error.message || error);
    throw error;
  });
  return catalogsPromise;
}

function ensureCatalogsLoaded() {
  var tree = el('tree');
  if (tree && tree.children.length > 0) {
    return Promise.resolve();
  }
  if (catalogsPromise) {
    return catalogsPromise;
  }
  return loadCatalogs();
}

/* ---------- explore tree snipe ---------- */

function handleSnipe() {
  snipeCurrent({
    sqlEl: el('sql'),
    tree: el('tree'),
    side: el('side'),
    filterInput: el('treeFilter'),
    snipeBtn: el('snipeTable'),
    ensureCatalogsLoaded: ensureCatalogsLoaded,
    showError: showError
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

async function loadSaved() {
  try {
    var res = await fetch('/api/saved');
    if (!res.ok) { throw new Error('HTTP ' + res.status); }
    var data = await res.json();
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
  } catch (error) {
    saved = load('saved', []);
    renderSaved();
  }
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

function updateSavedSelectionUI() {
  var total = saved.length;
  var count = selectedSaved.size;
  var toolbar = el('savedToolbar');
  if (total > 0) {
    toolbar.hidden = false;
    el('savedSelectedCount').textContent = count;
    var delBtn = el('deleteSelectedSaved');
    delBtn.disabled = count === 0;
    delBtn.style.opacity = count === 0 ? '0.45' : '1';
  } else {
    toolbar.hidden = true;
  }
}

function renderSaved() {
  var list = el('savedList');
  list.textContent = '';
  updateSavedSelectionUI();

  if (!saved.length) {
    var note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'Nothing saved yet. Write a query, then hit Save current query.';
    list.appendChild(note);
    return;
  }

  saved.forEach(function (item, index) {
    var row = document.createElement('div');
    row.className = 'saved-item' + (selectedSaved.has(index) ? ' selected' : '');
    row.draggable = true;
    row.dataset.index = index;

    // Drag Handle / Grip
    var grip = document.createElement('span');
    grip.className = 'grip';
    grip.title = 'Drag to reorder';
    grip.appendChild(createIcon('grip'));
    row.appendChild(grip);

    // Multi-select checkbox
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'saved-check';
    chk.title = 'Select query';
    chk.checked = selectedSaved.has(index);
    chk.addEventListener('change', function (event) {
      event.stopPropagation();
      if (chk.checked) {
        selectedSaved.add(index);
        row.classList.add('selected');
      } else {
        selectedSaved.delete(index);
        row.classList.remove('selected');
      }
      updateSavedSelectionUI();
    });
    row.appendChild(chk);

    // Bookmark Icon
    var ico = document.createElement('span');
    ico.className = 'ico';
    ico.appendChild(createIcon('bookmark'));
    row.appendChild(ico);

    // Query Name
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

    // Individual Delete Button
    var remove = document.createElement('button');
    remove.className = 'del';
    remove.appendChild(createIcon('trash'));
    remove.title = 'Delete query';
    remove.addEventListener('click', function (event) {
      event.stopPropagation();
      saved.splice(index, 1);
      selectedSaved.delete(index);
      saveSaved(saved);
    });
    row.appendChild(remove);

    // Drag & Drop Reordering Handlers
    row.addEventListener('dragstart', function (event) {
      draggedSavedIndex = index;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });

    row.addEventListener('dragover', function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      var rect = row.getBoundingClientRect();
      var mid = rect.top + rect.height / 2;
      if (event.clientY < mid) {
        row.classList.add('drag-over-top');
        row.classList.remove('drag-over-bottom');
      } else {
        row.classList.add('drag-over-bottom');
        row.classList.remove('drag-over-top');
      }
    });

    row.addEventListener('dragleave', function () {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    row.addEventListener('drop', function (event) {
      event.preventDefault();
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      if (draggedSavedIndex === null || draggedSavedIndex === index) { return; }

      var rect = row.getBoundingClientRect();
      var placeBefore = event.clientY < (rect.top + rect.height / 2);

      var itemToMove = saved.splice(draggedSavedIndex, 1)[0];
      var targetIndex = draggedSavedIndex < index
        ? (placeBefore ? index - 1 : index)
        : (placeBefore ? index : index + 1);

      saved.splice(targetIndex, 0, itemToMove);
      selectedSaved.clear();
      saveSaved(saved);
    });

    row.addEventListener('dragend', function () {
      draggedSavedIndex = null;
      document.querySelectorAll('.saved-item').forEach(function (node) {
        node.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
      });
    });

    list.appendChild(row);
  });
}

el('savedSelectAll').addEventListener('click', function () {
  selectedSaved = new Set(saved.map(function (_, i) { return i; }));
  renderSaved();
});

el('savedSelectNone').addEventListener('click', function () {
  selectedSaved.clear();
  renderSaved();
});

el('deleteSelectedSaved').addEventListener('click', function () {
  if (!selectedSaved.size) { return; }
  var count = selectedSaved.size;
  if (!window.confirm('Delete ' + count + ' selected ' + (count === 1 ? 'query' : 'queries') + '?')) {
    return;
  }
  saved = saved.filter(function (_, i) { return !selectedSaved.has(i); });
  selectedSaved.clear();
  saveSaved(saved);
  el('status').textContent = 'Deleted ' + count + ' saved ' + (count === 1 ? 'query' : 'queries');
  if (Notifier) {
    Notifier.info('Deleted ' + count + ' saved ' + (count === 1 ? 'query' : 'queries'), 'Queries Deleted');
  }
});

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
  if (Notifier) {
    Notifier.success('Query "' + name + '" saved', 'Saved');
  }
});

el('exportSaved').addEventListener('click', function () {
  if (!saved.length) {
    showError('No saved queries to export.');
    if (Notifier) {
      Notifier.warn('No saved queries to export.', 'Export Saved');
    }
    return;
  }
  var json = JSON.stringify(saved, null, 2);
  var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'trintrin_queries.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  showError('');
  el('status').textContent = 'Exported ' + saved.length + ' saved ' + (saved.length === 1 ? 'query' : 'queries');
  if (Notifier) {
    Notifier.success('Exported ' + saved.length + ' saved ' + (saved.length === 1 ? 'query' : 'queries'), 'Export Successful');
  }
});

el('importSaved').addEventListener('click', function () {
  el('importFile').value = '';
  el('importFile').click();
});

el('importFile').addEventListener('change', function (event) {
  var file = event.target.files && event.target.files[0];
  if (!file) { return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var parsed = JSON.parse(e.target.result);
      var items = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.saved) ? parsed.saved : [parsed]);
      var valid = [];
      items.forEach(function (item) {
        if (item && typeof item === 'object' && typeof item.sql === 'string' && item.sql.trim()) {
          valid.push({
            name: String(item.name || item.sql.split('\n')[0].slice(0, 60)),
            sql: String(item.sql),
            view: item.view || null
          });
        }
      });
      if (!valid.length) {
        showError('No valid queries found in imported file.');
        if (Notifier) {
          Notifier.error('No valid queries found in imported file.', 'Import Failed');
        }
        return;
      }
      var countNew = 0, countUpdated = 0;
      valid.forEach(function (entry) {
        var idx = -1;
        for (var i = 0; i < saved.length; i++) {
          if (saved[i].name === entry.name) { idx = i; break; }
        }
        if (idx >= 0) {
          saved[idx] = entry;
          countUpdated++;
        } else {
          saved.push(entry);
          countNew++;
        }
      });
      selectedSaved.clear();
      saveSaved(saved);
      showError('');
      var msg = 'Imported ' + valid.length + ' queries';
      if (countUpdated && countNew) { msg += ' (' + countNew + ' new, ' + countUpdated + ' updated)'; }
      else if (countUpdated) { msg += ' (' + countUpdated + ' updated)'; }
      el('status').textContent = msg;
      if (Notifier) {
        Notifier.success(msg, 'Import Successful');
      }
    } catch (err) {
      showError('Could not import queries: ' + (err.message || err));
      if (Notifier) {
        Notifier.error('Could not import queries: ' + (err.message || err), 'Import Failed');
      }
    }
  };
  reader.onerror = function () {
    showError('Failed to read import file.');
    if (Notifier) {
      Notifier.error('Failed to read import file.', 'Import Failed');
    }
  };
  reader.readAsText(file);
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

el('download').addEventListener('click', function () {
  if (!state.columns.length) { return; }
  var visible = visibleColumns();
  var indices = state.selected.size
    ? state.view.filter(function (i) { return state.selected.has(i); })
    : state.view;
  if (!indices.length || !visible.length) { return; }
  downloadCsv(state.columns, state.rows, visible, indices, 'trintrin_results.csv');
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

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach(function (other) { other.classList.remove('on'); });
  document.querySelectorAll('.pane').forEach(function (pane) { pane.classList.remove('on'); });
  var tabBtn = document.querySelector('.tabs button[data-pane="' + name + '"]');
  if (tabBtn) tabBtn.classList.add('on');
  var paneEl = el('pane-' + name);
  if (paneEl) paneEl.classList.add('on');
}

function focusEditor() {
  var sqlInput = el('sql');
  if (sqlInput) {
    sqlInput.focus();
    sqlInput.selectionStart = sqlInput.value.length;
    sqlInput.selectionEnd = sqlInput.value.length;
  }
}

function focusTreeFilter() {
  var side = el('side');
  if (side && side.classList.contains('hidden')) {
    side.classList.remove('hidden');
  }
  switchTab('explore');
  var filterInput = el('treeFilter');
  if (filterInput) {
    filterInput.focus();
    filterInput.select();
  }
}

function focusTableSearch() {
  var searchInput = el('search');
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
}

function togglePop(id) {
  var pop = el(id);
  if (!pop) return;
  var open = pop.classList.contains('open');
  document.querySelectorAll('.pop').forEach(function (other) { other.classList.remove('open'); });
  if (!open) { pop.classList.add('open'); }
}

document.querySelectorAll('.tabs button').forEach(function (tab) {
  tab.addEventListener('click', function () {
    switchTab(tab.dataset.pane);
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

if (el('snipeTable')) {
  el('snipeTable').addEventListener('click', handleSnipe);
}

var hotkeys = initHotkeys({
  runQuery: run,
  focusEditor: focusEditor,
  snipeTable: handleSnipe,
  toggleSidebar: function () { el('toggleSide').click(); },
  switchTabExplore: function () { switchTab('explore'); },
  switchTabSaved: function () { switchTab('saved'); },
  focusTreeFilter: focusTreeFilter,
  reloadCatalogs: function () { el('reload').click(); },
  focusSearch: focusTableSearch,
  clearFilters: function () { el('clear').click(); },
  downloadCsv: function () { el('download').click(); },
  toggleColumns: function () { togglePop('colsPop'); },
  saveCurrentQuery: function () { el('saveCurrent').click(); },
  exportSavedQueries: function () { el('exportSaved').click(); },
  importSavedQueries: function () { el('importSaved').click(); },
  testConnection: function () { el('test').click(); },
  toggleSettings: function () { togglePop('settingsPop'); }
});

if (el('hotkeysBtn')) {
  el('hotkeysBtn').addEventListener('click', function () {
    hotkeys.modal.open();
  });
}

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

import { extractTableReference } from './sql.js';
import { Notifier } from './notifier.js';

export function findChildLi(container, name) {
  if (!container) return null;
  var lower = String(name).toLowerCase();
  var children = container.querySelectorAll(':scope > li');
  for (var i = 0; i < children.length; i++) {
    var item = children[i];
    var itemName = item.dataset.name || (item.querySelector('.nm') && item.querySelector('.nm').textContent);
    if (itemName && itemName.toLowerCase() === lower) {
      return item;
    }
  }
  return null;
}

export function locateSchemaAndTable(catalogLi, target) {
  var catName = catalogLi.dataset.name || target.catalog;
  console.log('[Snipe] Expanding catalog:', catName);
  return catalogLi.expandNode().then(function (schemasUl) {
    if (!target.schema) {
      console.log('[Snipe] No schema specified, searching all schemas in catalog:', catName);
      return searchSchemasInCatalog(catalogLi, target.table);
    }

    console.log('[Snipe] Looking for schema "' + target.schema + '" in catalog "' + catName + '"');
    var schemaLi = findChildLi(schemasUl, target.schema);
    if (!schemaLi) {
      var err = new Error('Schema "' + target.schema + '" does not exist in catalog "' + catName + '".');
      console.warn('[Snipe] ' + err.message);
      throw err;
    }

    console.log('[Snipe] Found schema "' + target.schema + '", expanding schema to find table "' + target.table + '"');
    return schemaLi.expandNode().then(function (tablesUl) {
      var tableLi = findChildLi(tablesUl, target.table);
      if (!tableLi) {
        var schName = schemaLi.dataset.name || target.schema;
        var err = new Error('Table "' + target.table + '" does not exist in schema "' + catName + '.' + schName + '".');
        console.warn('[Snipe] ' + err.message);
        throw err;
      }
      console.log('[Snipe] Found table "' + target.table + '" in schema "' + catName + '.' + (schemaLi.dataset.name || target.schema) + '"');
      return tableLi;
    });
  });
}

export function searchCatalogsForTarget(catalogNodes, target) {
  var index = 0;

  function nextCatalog() {
    if (index >= catalogNodes.length) {
      var err = new Error('Table "' + (target.schema ? target.schema + '.' : '') + target.table + '" was not found in any catalog.');
      console.warn('[Snipe] ' + err.message);
      throw err;
    }
    var catalogLi = catalogNodes[index++];
    var catName = catalogLi.dataset.name || ('catalog-' + index);
    console.log('[Snipe] Searching catalog [' + index + '/' + catalogNodes.length + ']:', catName);
    return catalogLi.expandNode().then(function (schemasUl) {
      if (target.schema) {
        var schemaLi = findChildLi(schemasUl, target.schema);
        if (schemaLi) {
          console.log('[Snipe] Found schema "' + target.schema + '" in catalog "' + catName + '", looking for table "' + target.table + '"');
          return schemaLi.expandNode().then(function (tablesUl) {
            var tableLi = findChildLi(tablesUl, target.table);
            if (tableLi) {
              console.log('[Snipe] Found table "' + target.table + '" in catalog "' + catName + '", schema "' + target.schema + '"');
              return tableLi;
            }
            console.log('[Snipe] Table "' + target.table + '" not in schema "' + target.schema + '", trying next catalog...');
            return nextCatalog();
          });
        } else {
          console.log('[Snipe] Schema "' + target.schema + '" not present in catalog "' + catName + '", trying next catalog...');
          return nextCatalog();
        }
      } else {
        return searchSchemasInCatalog(catalogLi, target.table).then(function (tableLi) {
          if (tableLi) return tableLi;
          return nextCatalog();
        }).catch(function (err) {
          console.warn('[Snipe] Error searching schemas in catalog "' + catName + '":', err);
          return nextCatalog();
        });
      }
    }).catch(function (err) {
      console.warn('[Snipe] Error expanding catalog "' + catName + '":', err);
      return nextCatalog();
    });
  }

  return nextCatalog();
}

export function searchSchemasInCatalog(catalogLi, tableName) {
  var catName = catalogLi.dataset.name || 'catalog';
  return catalogLi.expandNode().then(function (schemasUl) {
    var schemaNodes = Array.prototype.slice.call(schemasUl.querySelectorAll(':scope > li'));
    var sIdx = 0;

    function nextSchema() {
      if (sIdx >= schemaNodes.length) {
        return Promise.resolve(null);
      }
      var schemaLi = schemaNodes[sIdx++];
      var schName = schemaLi.dataset.name || (schemaLi.querySelector('.nm') && schemaLi.querySelector('.nm').textContent) || ('schema-' + sIdx);
      console.log('[Snipe] Checking schema [' + sIdx + '/' + schemaNodes.length + '] (' + catName + '.' + schName + ') for table "' + tableName + '"');
      return schemaLi.expandNode().then(function (tablesUl) {
        var tableLi = findChildLi(tablesUl, tableName);
        if (tableLi) {
          console.log('[Snipe] Found table "' + tableName + '" in ' + catName + '.' + schName);
          return tableLi;
        }
        return nextSchema();
      }).catch(function (err) {
        console.warn('[Snipe] Error expanding schema ' + catName + '.' + schName + ':', err);
        return nextSchema();
      });
    }

    return nextSchema();
  });
}

export function snipeTableTarget(target, context) {
  context = context || {};
  console.log('[Snipe] snipeTableTarget called with target:', target);
  var snipeBtn = context.snipeBtn || document.getElementById('snipeTable');
  if (snipeBtn) snipeBtn.disabled = true;

  // 1. Switch to Explore pane
  var exploreTab = document.querySelector('.tabs button[data-pane="explore"]');
  if (exploreTab && !exploreTab.classList.contains('on')) {
    exploreTab.click();
  }

  // 2. Open sidebar if hidden
  var side = context.side || document.getElementById('side');
  if (side && side.classList.contains('hidden')) {
    side.classList.remove('hidden');
  }

  // 3. Clear filter input so nothing is hidden
  var filterInput = context.filterInput || document.getElementById('treeFilter');
  if (filterInput && filterInput.value.trim()) {
    filterInput.value = '';
    filterInput.dispatchEvent(new Event('input'));
  }

  var tree = context.tree || document.getElementById('tree');
  var ensureLoaded = typeof context.ensureCatalogsLoaded === 'function'
    ? context.ensureCatalogsLoaded
    : function () { return Promise.resolve(); };

  return ensureLoaded().then(function () {
    var catalogNodes = Array.prototype.slice.call(tree.querySelectorAll(':scope > li'));
    var catNames = catalogNodes.map(function (n) { return n.dataset.name; });
    console.log('[Snipe] Explore tree catalogs loaded (' + catalogNodes.length + '):', catNames);
    if (!catalogNodes.length) {
      throw new Error('No catalogs available to explore.');
    }

    if (target.catalog) {
      console.log('[Snipe] Target specifies catalog "' + target.catalog + '", finding node...');
      var catalogLi = findChildLi(tree, target.catalog);
      if (!catalogLi) {
        var err = new Error('Catalog "' + target.catalog + '" does not exist.');
        throw err;
      }
      return locateSchemaAndTable(catalogLi, target);
    } else {
      console.log('[Snipe] Target does not specify catalog, searching across all catalogs for table "' + target.table + '"...');
      return searchCatalogsForTarget(catalogNodes, target);
    }
  }).then(function (tableLi) {
    if (!tableLi) {
      console.warn('[Snipe] Search completed without finding table node.');
      return;
    }

    console.log('[Snipe] Table node resolved, expanding and highlighting...');
    return tableLi.expandNode().then(function () {
      var nodeEl = tableLi.querySelector('.node');
      if (nodeEl) {
        document.querySelectorAll('.node.sniped').forEach(function (n) {
          n.classList.remove('sniped');
        });

        nodeEl.classList.add('sniped');
        nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(function () {
          nodeEl.classList.remove('sniped');
        }, 3500);
      }

      var fullPath = [
        tableLi.dataset.catalog || target.catalog,
        tableLi.dataset.schema || target.schema,
        tableLi.dataset.table || target.table
      ].filter(Boolean).join('.');

      console.log('[Snipe] Successfully sniped table:', fullPath);
      if (Notifier) {
        Notifier.snipe('Located table in Explore tree', fullPath);
      }
      return tableLi;
    });
  }).catch(function (error) {
    var msg = error.message || String(error);
    console.error('[Snipe] Snipe error:', error);
    if (Notifier) {
      Notifier.error(msg, 'Snipe Failed');
    } else if (typeof context.showError === 'function') {
      context.showError(msg);
    }
  }).finally(function () {
    if (snipeBtn) snipeBtn.disabled = false;
    console.log('[Snipe] Snipe process finished.');
  });
}

export function snipeCurrent(context) {
  context = context || {};
  var sqlEl = context.sqlEl || document.getElementById('sql');
  var sql = (sqlEl ? sqlEl.value : '').trim();
  console.log('[Snipe] snipeCurrent triggered. Query:', sql);

  if (!sql) {
    console.warn('[Snipe] Aborted: No SQL query found in editor.');
    if (Notifier) {
      Notifier.warn('Please enter or select a SQL query first.', 'Snipe Table');
    } else if (typeof context.showError === 'function') {
      context.showError('No SQL query provided to snipe.');
    }
    return;
  }

  var target = extractTableReference(sql);
  console.log('[Snipe] Extracted table reference:', target);
  if (!target || !target.table) {
    console.warn('[Snipe] Aborted: Could not detect a valid table name in SQL.');
    if (Notifier) {
      Notifier.warn('Could not detect a valid table name in current query.', 'Snipe Table');
    } else if (typeof context.showError === 'function') {
      context.showError('Could not detect a valid table name in current query.');
    }
    return;
  }

  return snipeTableTarget(target, context);
}

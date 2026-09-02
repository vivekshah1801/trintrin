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
  return catalogLi.expandNode().then(function (schemasUl) {
    if (!target.schema) {
      return searchSchemasInCatalog(catalogLi, target.table);
    }

    var schemaLi = findChildLi(schemasUl, target.schema);
    if (!schemaLi) {
      var catName = catalogLi.dataset.name || target.catalog;
      var err = new Error('Schema "' + target.schema + '" does not exist in catalog "' + catName + '".');
      throw err;
    }

    return schemaLi.expandNode().then(function (tablesUl) {
      var tableLi = findChildLi(tablesUl, target.table);
      if (!tableLi) {
        var catName = catalogLi.dataset.name || target.catalog;
        var schName = schemaLi.dataset.name || target.schema;
        var err = new Error('Table "' + target.table + '" does not exist in schema "' + catName + '.' + schName + '".');
        throw err;
      }
      return tableLi;
    });
  });
}

export function searchCatalogsForTarget(catalogNodes, target) {
  var index = 0;

  function nextCatalog() {
    if (index >= catalogNodes.length) {
      var err = new Error('Table "' + (target.schema ? target.schema + '.' : '') + target.table + '" was not found in any catalog.');
      throw err;
    }
    var catalogLi = catalogNodes[index++];
    return catalogLi.expandNode().then(function (schemasUl) {
      if (target.schema) {
        var schemaLi = findChildLi(schemasUl, target.schema);
        if (schemaLi) {
          return schemaLi.expandNode().then(function (tablesUl) {
            var tableLi = findChildLi(tablesUl, target.table);
            if (tableLi) {
              return tableLi;
            }
            return nextCatalog();
          });
        } else {
          return nextCatalog();
        }
      } else {
        return searchSchemasInCatalog(catalogLi, target.table).then(function (tableLi) {
          if (tableLi) return tableLi;
          return nextCatalog();
        }).catch(function () {
          return nextCatalog();
        });
      }
    }).catch(function () {
      return nextCatalog();
    });
  }

  return nextCatalog();
}

export function searchSchemasInCatalog(catalogLi, tableName) {
  return catalogLi.expandNode().then(function (schemasUl) {
    var schemaNodes = Array.prototype.slice.call(schemasUl.querySelectorAll(':scope > li'));
    var sIdx = 0;

    function nextSchema() {
      if (sIdx >= schemaNodes.length) {
        return Promise.resolve(null);
      }
      var schemaLi = schemaNodes[sIdx++];
      return schemaLi.expandNode().then(function (tablesUl) {
        var tableLi = findChildLi(tablesUl, tableName);
        if (tableLi) return tableLi;
        return nextSchema();
      }).catch(function () {
        return nextSchema();
      });
    }

    return nextSchema();
  });
}

export function snipeTableTarget(target, context) {
  context = context || {};
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
    if (!catalogNodes.length) {
      throw new Error('No catalogs available to explore.');
    }

    if (target.catalog) {
      var catalogLi = findChildLi(tree, target.catalog);
      if (!catalogLi) {
        var err = new Error('Catalog "' + target.catalog + '" does not exist.');
        throw err;
      }
      return locateSchemaAndTable(catalogLi, target);
    } else {
      return searchCatalogsForTarget(catalogNodes, target);
    }
  }).then(function (tableLi) {
    if (!tableLi) return;

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

      if (Notifier) {
        Notifier.snipe('Located table in Explore tree', fullPath);
      }
      return tableLi;
    });
  }).catch(function (error) {
    var msg = error.message || String(error);
    if (Notifier) {
      Notifier.error(msg, 'Snipe Failed');
    } else if (typeof context.showError === 'function') {
      context.showError(msg);
    }
  }).finally(function () {
    if (snipeBtn) snipeBtn.disabled = false;
  });
}

export function snipeCurrent(context) {
  context = context || {};
  var sqlEl = context.sqlEl || document.getElementById('sql');
  var sql = (sqlEl ? sqlEl.value : '').trim();

  if (!sql) {
    if (Notifier) {
      Notifier.warn('Please enter or select a SQL query first.', 'Snipe Table');
    } else if (typeof context.showError === 'function') {
      context.showError('No SQL query provided to snipe.');
    }
    return;
  }

  var target = extractTableReference(sql);
  if (!target || !target.table) {
    if (Notifier) {
      Notifier.warn('Could not detect a valid table name in current query.', 'Snipe Table');
    } else if (typeof context.showError === 'function') {
      context.showError('Could not detect a valid table name in current query.');
    }
    return;
  }

  return snipeTableTarget(target, context);
}

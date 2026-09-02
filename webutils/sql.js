export function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function quote(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

export function extractTableReference(sql) {
  if (!sql || typeof sql !== 'string') return null;

  // 1. Remove comments (-- and /* */) and normalize string literals safely
  var cleanSql = '';
  var i = 0;
  var len = sql.length;

  while (i < len) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
      cleanSql += ' ';
      continue;
    }
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) { i++; }
      i += 2;
      cleanSql += ' ';
      continue;
    }
    if (sql[i] === "'") {
      i++;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
          } else {
            i++;
            break;
          }
        } else if (sql[i] === '\\') {
          i += 2;
        } else {
          i++;
        }
      }
      cleanSql += " '' ";
      continue;
    }
    cleanSql += sql[i];
    i++;
  }

  // 2. Search for table-referencing SQL clauses
  var targetKeywords = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE|DESCRIBE|SHOW\s+COLUMNS\s+FROM)\s+/gi;
  var match;
  while ((match = targetKeywords.exec(cleanSql)) !== null) {
    var startIndex = match.index + match[0].length;
    var rest = cleanSql.slice(startIndex).trim();
    if (!rest) continue;

    // Subquery, continue search
    if (rest[0] === '(') continue;

    var parts = [];
    var pos = 0;

    while (pos < rest.length) {
      while (pos < rest.length && /\s/.test(rest[pos])) pos++;
      if (pos >= rest.length) break;

      var ch = rest[pos];
      var part = '';

      if (ch === '"' || ch === '`') {
        var quoteChar = ch;
        pos++;
        while (pos < rest.length) {
          if (rest[pos] === quoteChar) {
            if (rest[pos + 1] === quoteChar) {
              part += quoteChar;
              pos += 2;
            } else {
              pos++;
              break;
            }
          } else {
            part += rest[pos];
            pos++;
          }
        }
        parts.push(part);
      } else if (ch === '[') {
        pos++;
        var closeBracket = rest.indexOf(']', pos);
        if (closeBracket !== -1) {
          parts.push(rest.slice(pos, closeBracket));
          pos = closeBracket + 1;
        } else {
          break;
        }
      } else if (/[a-zA-Z0-9_@$#-]/.test(ch)) {
        var startIdent = pos;
        while (pos < rest.length && /[a-zA-Z0-9_@$#-]/.test(rest[pos])) {
          pos++;
        }
        var ident = rest.slice(startIdent, pos);
        var upper = ident.toUpperCase();
        var reserved = ['WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'NATURAL', 'ON', 'USING', 'UNION', 'EXCEPT', 'INTERSECT', 'AS', 'SET', 'VALUES', 'WINDOW', 'QUALIFY', 'WITH'];
        if (reserved.indexOf(upper) !== -1) {
          break;
        }
        parts.push(ident);
      } else {
        break;
      }

      while (pos < rest.length && /\s/.test(rest[pos])) pos++;
      if (pos < rest.length && rest[pos] === '.') {
        pos++;
      } else {
        break;
      }
    }

    if (parts.length > 0) {
      if (parts.length === 3) {
        return { catalog: parts[0], schema: parts[1], table: parts[2], raw: parts.join('.') };
      } else if (parts.length === 2) {
        return { catalog: null, schema: parts[0], table: parts[1], raw: parts.join('.') };
      } else if (parts.length === 1) {
        return { catalog: null, schema: null, table: parts[0], raw: parts[0] };
      } else if (parts.length > 3) {
        return { catalog: parts[0], schema: parts[1], table: parts[2], raw: parts.slice(0, 3).join('.') };
      }
    }
  }

  return null;
}

if (typeof window !== 'undefined') {
  window.TrintrinSQL = { text: text, quote: quote, extractTableReference: extractTableReference };
}

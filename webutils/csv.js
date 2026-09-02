export function csvCell(value) {
  var cell = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
}

export function downloadCsv(columns, rows, visibleIndices, rowIndices, filename) {
  if (!columns || !columns.length || !visibleIndices || !visibleIndices.length) {
    return false;
  }
  filename = filename || 'trintrin_results.csv';
  var lines = [visibleIndices.map(function (i) { return csvCell(columns[i]); }).join(',')];

  var indices = rowIndices && rowIndices.length ? rowIndices : [];
  for (var r = 0; r < indices.length; r++) {
    var row = rows[indices[r]];
    lines.push(visibleIndices.map(function (c) { return csvCell(row[c]); }).join(','));
  }

  var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  return true;
}

if (typeof window !== 'undefined') {
  window.TrintrinCSV = { csvCell: csvCell, downloadCsv: downloadCsv };
}

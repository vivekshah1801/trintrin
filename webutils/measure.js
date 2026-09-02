var measureCanvas = null;

export function measure(textValue, font) {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  var ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(textValue).width;
}

export function autoWidth(columns, rows, widths, index, options) {
  options = options || {};
  var headFont = options.headFont || '620 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var cellFont = options.cellFont || '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var minCol = typeof options.minCol === 'number' ? options.minCol : 56;
  var maxCol = typeof options.maxCol === 'number' ? options.maxCol : 460;
  var widthSample = typeof options.widthSample === 'number' ? options.widthSample : 300;

  if (widths && widths[index]) {
    return widths[index];
  }
  var colName = columns[index] || '';
  var max = measure(colName, headFont) + 24;
  var sample = Math.min(rows ? rows.length : 0, widthSample);

  for (var i = 0; i < sample; i++) {
    var val = rows[i][index];
    if (val === null || val === undefined) { continue; }
    var w = measure(String(val), cellFont) + 18;
    if (w > max) { max = w; }
  }
  return Math.max(minCol, Math.min(maxCol, Math.ceil(max)));
}

if (typeof window !== 'undefined') {
  window.TrintrinMeasure = { measure: measure, autoWidth: autoWidth };
}

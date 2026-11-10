/* Batch usage import. Pure staging: no current app data changes until every file passes. */
(function (root) {
  'use strict';
  function merge(files, core, winlog) {
    var seen = new Set(), rows = [], duplicates = 0, sources = [], warnings = [];
    files.forEach(function (file) {
      var text = file.text, parsed = core.parseCSV(text);
      if (winlog && winlog.isWinLog(parsed.head)) {
        var converted = winlog.toSessions(text, { computer: file.name.replace(/\.[^.]+$/, '') });
        text = converted.csv; parsed = core.parseCSV(text);
        converted.warnings.forEach(function (w) { warnings.push(file.name + ': ' + w); });
      }
      var map = core.guessMap('use', parsed.head);
      var missing = core.SRC.use.fields.filter(function (f) { return f[3] && map[f[0]] < 0; });
      if (missing.length) throw new Error(file.name + ': missing ' + missing.map(function (f) { return f[1]; }).join(', ') + '. Use the usage-log template or import this file alone to map its columns.');
      if (!parsed.rows.length) throw new Error(file.name + ': no usage rows. Current data was kept.');
      var count = 0;
      parsed.rows.forEach(function (r, i) {
        var values = ['instrument', 'user', 'start', 'end'].map(function (k) { return String(r[map[k]] || '').trim(); });
        if (values.some(function (v) { return !v; })) throw new Error(file.name + ': row ' + (i + 2) + ' has an empty required value. Current data was kept.');
        var start = core.parseDT(values[2]), end = core.parseDT(values[3]);
        if (typeof start !== 'number' || typeof end !== 'number' || !isFinite(start) || !isFinite(end) || end <= start)
          throw new Error(file.name + ': row ' + (i + 2) + ' needs valid start and end times, with end after start. Current data was kept.');
        var key = JSON.stringify([values[0].toLowerCase(), values[1].toLowerCase(), start, end]);
        if (seen.has(key)) { duplicates++; return; }
        seen.add(key); rows.push(values.concat(file.name)); count++;
      });
      sources.push({ name: file.name, rows: parsed.rows.length, added: count });
    });
    function cell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
    return { csv: [['Workstation', 'Username', 'Logon Time', 'Logoff Time', 'Import source']].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\n'),
      rows: rows.length, duplicates: duplicates, sources: sources, warnings: warnings };
  }
  var api = { merge: merge }; root.LBImports = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

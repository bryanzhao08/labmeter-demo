/* Windows Security log conversion. sample_security_log.csv is synthetic. */
(function (root) {
  function parseCSV(text) {
    var delimiters = [',', '\t', ';'], best = ',', bestCount = -1, i, j, quoted, count, c;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (i = 0; i < delimiters.length; i++) {
      quoted = false; count = 0;
      for (j = 0; j < text.length; j++) {
        c = text.charAt(j);
        if (c === '"') {
          if (quoted && text.charAt(j + 1) === '"') j++;
          else quoted = !quoted;
        } else if (!quoted && (c === '\n' || c === '\r')) break;
        else if (!quoted && c === delimiters[i]) count++;
      }
      if (count > bestCount) { bestCount = count; best = delimiters[i]; }
    }
    var rows = [], row = [], field = '', inQuotes = false;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (inQuotes) {
        if (c === '"' && text.charAt(i + 1) === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"' && field === '') inQuotes = true;
      else if (c === best) { row.push(field); field = ''; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function key(s) { return String(s || '').replace(/^\uFEFF/, '').replace(/\s+/g, '').toLowerCase(); }
  function index(headers, names) {
    var i, j;
    for (i = 0; i < headers.length; i++) for (j = 0; j < names.length; j++) if (key(headers[i]) === key(names[j])) return i;
    return -1;
  }
  function isWinLog(headers) {
    return !!headers && index(headers, ['Event ID', 'Id']) >= 0 && index(headers, ['Date and Time', 'TimeCreated']) >= 0;
  }
  function dateValue(s) {
    var m, d;
    s = String(s || '').trim();
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(s);
    if (m) {
      var h = +m[4];
      if (m[7]) { h %= 12; if (m[7].toUpperCase() === 'PM') h += 12; }
      d = new Date(+m[3], +m[1] - 1, +m[2], h, +m[5], +m[6]);
      if (d.getFullYear() !== +m[3] || d.getMonth() !== +m[1] - 1 || d.getDate() !== +m[2] || d.getHours() !== h || d.getMinutes() !== +m[5] || d.getSeconds() !== +m[6]) return null;
      return d;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
    if (!m) return null;
    d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || d.getHours() !== +m[4] || d.getMinutes() !== +m[5] || d.getSeconds() !== +m[6]) return null;
    return d;
  }
  function formatDate(d) {
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function messageField(message, name) {
    var match = new RegExp('(?:^|[\\r\\n])\\s*' + name + '\\s*:\\s*([^\\r\\n]*)', 'i').exec(message);
    return match ? match[1].trim() : '';
  }
  function csvCell(s) { s = String(s == null ? '' : s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toSessions(text, opts) {
    opts = opts || {};
    var rows = parseCSV(text), headers = rows.shift() || [], warnings = [], events = [], sessions = [], unmatched = 0;
    if (!isWinLog(headers)) return { sessions: [], warnings: ['CSV is missing an event ID or time column.'], csv: 'Workstation,Username,Logon Time,Logoff Time' };
    var cols = {
      id: index(headers, ['Event ID', 'Id']), time: index(headers, ['Date and Time', 'TimeCreated']),
      computer: index(headers, ['MachineName', 'Computer', 'Workstation Name', 'WorkstationName']),
      user: index(headers, ['TargetUserName', 'Username', 'Account Name']),
      logonId: index(headers, ['TargetLogonId', 'Logon ID', 'LogonId']),
      type: index(headers, ['LogonType', 'Logon Type']), message: index(headers, ['Description', 'Message'])
    };
    function get(row, col) { return col >= 0 ? String(row[col] || '').trim() : ''; }
    var i, row, id, message, section, user, logonId, workstation, type, time, ev, j, end, reason, maxHours = Number(opts.maxHours);
    if (!(maxHours > 0)) maxHours = 12;
    for (i = 0; i < rows.length; i++) {
      row = rows[i]; id = parseInt(get(row, cols.id), 10);
      // 4800/4801 lock and unlock events are intentionally ignored for now.
      if (id !== 4624 && id !== 4634 && id !== 4647) continue;
      message = get(row, cols.message >= 0 ? cols.message : (headers.length > 5 && !headers[5] ? 5 : -1));
      section = message;
      if (id === 4624 && /New Logon\s*:/i.test(message)) section = message.split(/New Logon\s*:/i)[1];
      else if (id !== 4624 && /Subject\s*:/i.test(message)) section = message.split(/Subject\s*:/i)[1];
      user = get(row, cols.user) || messageField(section, 'Account Name');
      logonId = get(row, cols.logonId) || messageField(section, 'Logon ID');
      workstation = get(row, cols.computer) || messageField(message, 'Workstation Name') || opts.computer || '';
      if (workstation === '-') workstation = opts.computer || '';
      type = get(row, cols.type) || messageField(message, 'Logon Type');
      time = dateValue(get(row, cols.time));
      if (!time) { warnings.push('Invalid event time on CSV row ' + (i + 2) + '.'); continue; }
      if (id === 4624 && (!/^(2|10|11)$/.test(type) || !user || /\$$/.test(user) || /^(SYSTEM|LOCAL SERVICE|NETWORK SERVICE|DWM-.*|UMFD-.*)$/i.test(user))) continue;
      events.push({ id: id, time: time, user: user, logonId: logonId.toLowerCase(), workstation: String(workstation), order: i });
    }
    events.sort(function (a, b) { return a.time - b.time || a.order - b.order; });
    var active = [];
    for (i = 0; i < events.length; i++) {
      ev = events[i];
      if (ev.id === 4624) { active.push(ev); continue; }
      if (!ev.logonId || ev.logonId === '-') continue;
      for (j = 0; j < active.length; j++) {
        if (!active[j].end && active[j].logonId === ev.logonId && (!ev.workstation || !active[j].workstation || ev.workstation.toLowerCase() === active[j].workstation.toLowerCase())) {
          active[j].end = ev.time; active[j].reason = String(ev.id); break;
        }
      }
    }
    for (i = 0; i < active.length; i++) {
      ev = active[i]; end = ev.end; reason = ev.reason;
      if (!end) {
        unmatched++;
        for (j = i + 1; j < active.length; j++) if (active[j].workstation.toLowerCase() === ev.workstation.toLowerCase()) { end = active[j].time; reason = 'next-logon'; break; }
        if (!end) { end = new Date(ev.time.getTime() + maxHours * 3600000); reason = 'capped'; }
      }
      sessions.push({ workstation: ev.workstation, user: ev.user, start: formatDate(ev.time), end: formatDate(end), endReason: reason });
    }
    if (unmatched) warnings.push(unmatched + ' unmatched logon' + (unmatched === 1 ? '' : 's') + '.');
    var lines = ['Workstation,Username,Logon Time,Logoff Time'];
    for (i = 0; i < sessions.length; i++) lines.push([sessions[i].workstation, sessions[i].user, sessions[i].start, sessions[i].end].map(csvCell).join(','));
    return { sessions: sessions, warnings: warnings, csv: lines.join('\n') };
  }
  var API = { isWinLog: isWinLog, toSessions: toSessions };
  root.LBWinLog = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

'use strict';
const http = require('node:http');

const SYSTEMS = ['fbs', 'ilab'];

function validMonth(m) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m)) throw Error('Choose a month in YYYY-MM format.');
  return m;
}

const resources = [
  { id: 'scope-1', name: 'Confocal microscope' },
  { id: 'flow-1', name: 'Flow cytometer' },
  { id: 'spec-1', name: 'Mass spectrometer' }
];

const headers = {
  fbs: ['Reservation ID', 'Resource name', 'Reserved by', 'Lab name', 'Billing account', 'Start date time', 'End date time', 'Service type', 'User type', 'Reservation status'],
  ilab: ['Booking ID', 'Equipment name', 'User full name', 'Research lab', 'Account code', 'Start timestamp', 'End timestamp', 'Service type', 'Rate tier', 'Event status']
};

function pitchRecords(system, month) {
  const rows = [
    // 0: John books 9-11 on day 02, runs to 12:30 + idle file copy to 13:00
    [`${system}-1`, 'Confocal microscope', 'John', 'Imaging Lab', 'NIH-GM104', `${month}-02 09:00:00`, `${month}-02 11:00:00`, 'Self-service', 'Internal', 'Confirmed'],
    // 1: John books 9-11 on day 03, does not show up
    [`${system}-2`, 'Confocal microscope', 'John', 'Imaging Lab', 'NIH-GM104', `${month}-03 09:00:00`, `${month}-03 11:00:00`, 'Self-service', 'Internal', 'Confirmed'],
    // 2: Billy books 13-16 on day 03, uses 20 minutes
    [`${system}-3`, 'Confocal microscope', 'Billy', 'Stem Cell Lab', 'NSF-220', `${month}-03 13:00:00`, `${month}-03 16:00:00`, 'Self-service', 'Internal', 'Confirmed']
  ];
  const labs = ['Imaging Lab', 'Neuro Lab', 'Stem Cell Lab', 'Proteomics Core'];
  const accounts = ['NIH-GM104', 'NSF-220', 'HHMI-881', 'BIO-412'];
  const tiers = ['Internal', 'Internal', 'External', 'Commercial'];
  for (let i = 3; i < 24; i++) {
    const dayNum = 4 + Math.floor((i - 3) / 3);
    const day = String(dayNum).padStart(2, '0');
    const slot = (i - 3) % 3;
    const inst = resources[slot].name;
    const isAfterHours = i === 10;
    const isOutlier = i === 18;
    const startH = isAfterHours ? 18 : 9 + slot * 2;
    const startM = isAfterHours ? '30' : '00';
    const endH = isAfterHours ? 21 : isOutlier ? 12 : startH + 2;
    const service = i % 6 === 0 ? 'Assisted' : i % 9 === 0 ? 'Training' : 'Self-service';
    const tier = tiers[i % tiers.length];
    const status = i === 7 ? 'Cancelled' : 'Confirmed';
    const researcher = i === 10 ? 'Maya' : i === 18 ? 'Dr. Patel' : 'Researcher ' + String(i + 1).padStart(2, '0');
    rows.push([
      `${system}-${i + 1}`,
      inst,
      researcher,
      labs[i % labs.length],
      accounts[i % accounts.length],
      `${month}-${day} ${String(startH).padStart(2, '0')}:${startM}:00`,
      `${month}-${day} ${String(endH).padStart(2, '0')}:00:00`,
      service,
      tier,
      status
    ]);
  }
  rows.push([...rows[0]]); // Duplicate across pages exercises idempotency.
  return rows;
}

function records(system, month, scenario = 'normal') {
  validMonth(month);
  if (scenario === 'pitch') return pitchRecords(system, month);
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const day = String(2 + Math.floor(i / 3)).padStart(2, '0'), hour = 9 + (i % 3) * 2;
    rows.push([
      `${system}-${i + 1}`,
      resources[i % 3].name,
      i === 0 ? 'John' : 'Researcher ' + String(i + 1).padStart(2, '0'),
      i === 0 ? 'Imaging Lab' : 'Sample Lab ' + (i % 4 + 1),
      'DEMO-' + (100 + i % 4),
      `${month}-${day} ${String(hour).padStart(2, '0')}:00:00`,
      `${month}-${day} ${hour + 2}:00:00`,
      'Self-service',
      'Internal',
      i === 7 ? 'Cancelled' : 'Confirmed'
    ]);
  }
  rows.push([...rows[0]]); // Duplicate across pages exercises idempotency.
  if (scenario === 'invalid') {
    rows.push([
      `${system}-bad`,
      'Confocal microscope',
      'Researcher 25',
      'Sample Lab',
      'DEMO-100',
      `${month}-03 14:00:00`,
      `${month}-03 12:00:00`,
      'Self-service',
      'Internal',
      'Confirmed'
    ]);
  }
  return rows;
}

function usage(month, scenario = 'normal') {
  validMonth(month);
  if (scenario === 'pitch') {
    const base = pitchRecords('fbs', month).slice(0, 24);
    const rows = [
      // John booked 9-11 on day 02, PC stays logged in until 13:00 (laser ran to 12:30, then file copying 12:30-13:00)
      ['Confocal microscope', 'John', `${month}-02 09:01:00`, `${month}-02 13:00:00`],
      // Adam uses Confocal on day 02 14:14-15:46 with NO booking at all
      ['Confocal microscope', 'Adam', `${month}-02 14:14:00`, `${month}-02 15:46:00`],
      // John booked day 03 9-11 -> NO SHOW (no login row!)
      // Billy booked day 03 13-16, used only 20 min
      ['Confocal microscope', 'Billy', `${month}-03 13:01:00`, `${month}-03 13:23:00`]
    ];
    for (let i = 3; i < 24; i++) {
      if (i === 7) continue; // Cancelled
      const r = base[i];
      if (i === 18) {
        // Duration outlier: booked 11-12/13-15, actually ran 8.5 hours on Mass spec
        const day = r[5].slice(0, 10);
        rows.push([r[1], r[2], `${day} 09:00:00`, `${day} 17:30:00`]);
      } else {
        rows.push([r[1], r[2], r[5], r[6]]);
      }
    }
    return { head: ['Workstation', 'Username', 'Logon Time', 'Logoff Time'], rows };
  }

  return {
    head: ['Workstation', 'Username', 'Logon Time', 'Logoff Time'],
    rows: records('fbs', month).slice(0, 24)
      .filter((r, i) => i !== 7)
      .map((r, i) => [r[1], r[2], r[5], i === 0 ? `${month}-02 13:00:00` : r[6]])
  };
}

function power(month, scenario = 'normal') {
  validMonth(month);
  const head = ['Instrument', 'Operator', 'Start', 'End', 'Mean Watts', 'Peak Watts', 'Std Watts', 'Duty Cycle', 'PC Active Ratio'];
  if (scenario === 'pitch') {
    const base = pitchRecords('fbs', month).slice(0, 24);
    const rows = [
      // John active acquisition 09:02-12:30 (248W), then standby file-copy tail 12:30-13:00 (38W)
      ['Confocal microscope', 'John', `${month}-02 09:02:00`, `${month}-02 12:30:00`, '248.4', '312.0', '18.4', '0.94', '0.96'],
      ['Confocal microscope', 'John', `${month}-02 12:30:00`, `${month}-02 13:00:00`, '38.2', '52.0', '4.1', '0.16', '0.62'],
      // Adam unbooked walk-up 14:15-15:45 (244W)
      ['Confocal microscope', 'Adam', `${month}-02 14:15:00`, `${month}-02 15:45:00`, '244.0', '298.5', '16.2', '0.92', '0.91'],
      // John no-show window on day 03 09:00-11:00 (plug stays off at 3.6W)
      ['Confocal microscope', '', `${month}-03 09:00:00`, `${month}-03 11:00:00`, '3.6', '5.1', '0.4', '0.01', '0.00'],
      // Billy 20-minute sprint 13:02-13:22 (236W)
      ['Confocal microscope', 'Billy', `${month}-03 13:02:00`, `${month}-03 13:22:00`, '236.5', '286.0', '15.0', '0.91', '0.89']
    ];
    for (let i = 3; i < 24; i++) {
      if (i === 7) continue;
      const r = base[i];
      if (i === 18) {
        const day = r[5].slice(0, 10);
        rows.push([r[1], r[2], `${day} 09:00:00`, `${day} 17:30:00`, '318.0', '395.0', '24.5', '0.96', '0.94']);
      } else {
        const w = r[1] === 'Mass spectrometer' ? '310.0' : r[1] === 'Flow cytometer' ? '195.0' : '242.0';
        const p = r[1] === 'Mass spectrometer' ? '380.0' : r[1] === 'Flow cytometer' ? '248.0' : '305.0';
        rows.push([r[1], r[2], r[5], r[6], w, p, '15.2', '0.89', '0.90']);
      }
    }
    return { head, rows };
  }

  const base = records('fbs', month).slice(0, 24).filter((_, i) => i !== 7);
  const rows = [];
  for (let i = 0; i < base.length; i++) {
    const r = base[i];
    if (i === 0) {
      rows.push([r[1], r[2], r[5], `${month}-02 12:30:00`, '246.0', '308.0', '17.8', '0.93', '0.95']);
      rows.push([r[1], r[2], `${month}-02 12:30:00`, `${month}-02 13:00:00`, '36.5', '49.0', '3.8', '0.15', '0.58']);
    } else {
      rows.push([r[1], r[2], r[5], r[6], '215.0', '274.0', '14.6', '0.88', '0.89']);
    }
  }
  return { head, rows };
}

function prices() {
  return {
    head: ['Instrument', 'Service', 'Unit', 'Internal rate', 'External academic rate', 'Commercial rate', 'After hours'],
    rows: [
      ['Confocal microscope', 'Self-service', 'per hour', '$40', '$64', '$100', '$32'],
      ['Confocal microscope', 'Assisted', 'per hour', '$80', '$128', '$200', '$64'],
      ['Confocal microscope', 'Training', 'per hour', '$80', '$128', '$200', '$64'],
      ['Flow cytometer', 'Self-service', 'per hour', '$60', '$96', '$150', '$45'],
      ['Flow cytometer', 'Assisted', 'per hour', '$125', '$200', '$300', '$95'],
      ['Flow cytometer', 'Training', 'per hour', '$100', '$160', '$240', '$80'],
      ['Mass spectrometer', 'Self-service', 'per hour', '$90', '$144', '$225', '$70'],
      ['Mass spectrometer', 'Assisted', 'per hour', '$160', '$256', '$400', '$125'],
      ['Mass spectrometer', 'Training', 'per hour', '$140', '$224', '$350', '$110']
    ],
    notes: [
      'Billed in 30-minute increments. Booked time plus overruns (union) are billed.',
      'After hours are weekdays after 6 PM and before 9 AM, and weekends.'
    ]
  };
}

const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(system, month, scenario = 'pitch') {
  const head = headers[system], rows = records(system, month, scenario);
  const pwr = power(month, scenario);
  const pr = prices();
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Parity ${system === 'fbs' ? 'FBS' : 'iLab'} practice scheduler</title><style>body{font:15px/1.5 system-ui;color:#172033;background:#f3f5f9;margin:0}header{background:#172d57;color:white;padding:24px 40px}main{padding:28px 40px}h1{margin:0;font-size:26px}h2{margin:28px 0 10px;font-size:19px}p{max-width:75ch}a{color:#2556d9}table{border-collapse:collapse;background:white;min-width:950px;margin-bottom:14px}td,th{padding:10px 12px;text-align:left;border-bottom:1px solid #dce2ed}th{background:#e9effd}section{overflow:auto}label{display:inline-block;margin:12px 16px 12px 0}input,select,button{font:inherit;padding:8px}</style><header><h1>${system === 'fbs' ? 'FBS' : 'iLab'} practice scheduler</h1><div>Independent Parity simulator · Synthetic data · Not a vendor product</div></header><main><p>This is the synthetic scheduling, smart-plug watt telemetry, and rate-sheet source Parity's 6-agent crew reads.</p><form><label>Report month <input type="month" name="month" value="${month}"></label><label>Scenario <select name="scenario"><option value="pitch" ${scenario === 'pitch' ? 'selected' : ''}>Pitch story (John, Adam &amp; Billy)</option><option value="normal" ${scenario === 'normal' ? 'selected' : ''}>Normal report</option></select></label> <button>View report</button></form><p>24 reservations · 3 instruments · 1 duplicate export row · 1 cancellation · smart-plug watt streams · core rate card. <a href="/api/${system}/manifest">Inspect capabilities</a></p><h2>Reservations</h2><section><table><thead><tr>${head.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section><h2>Smart-plug power telemetry</h2><section><table><thead><tr>${pwr.head.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${pwr.rows.slice(0, 10).map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section><h2>Core rate sheet</h2><section><table><thead><tr>${pr.head.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${pr.rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section></main></html>`;
}

async function startSimulator() {
  const retries = new Set();
  const server = http.createServer((req, res) => {
    const send = (status, value, type = 'application/json') => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
      });
      res.end(type === 'application/json' ? JSON.stringify(value) : value);
    };
    try {
      if (req.method !== 'GET') return send(405, { error: 'Practice systems are read-only.' });
      const u = new URL(req.url, 'http://127.0.0.1'), parts = u.pathname.split('/').filter(Boolean);
      if (parts.length === 1 && SYSTEMS.includes(parts[0])) {
        const sc = u.searchParams.get('scenario') || 'pitch';
        return send(200, page(parts[0], validMonth(u.searchParams.get('month') || '2026-10'), sc === 'normal' ? 'normal' : 'pitch'), 'text/html; charset=utf-8');
      }
      const [, system, action] = parts;
      if (parts[0] !== 'api' || !SYSTEMS.includes(system) || parts.length !== 3) return send(404, { error: 'Unknown practice endpoint' });
      if (action === 'manifest') {
        return send(200, {
          system,
          mode: 'synthetic',
          readOnly: true,
          format: system === 'fbs' ? 'report-table' : 'nested-report',
          resources: `/api/${system}/resources`,
          reservations: `/api/${system}/reservations`,
          usage: `/api/${system}/usage`,
          power: `/api/${system}/power`,
          prices: `/api/${system}/prices`,
          pageSize: 8
        });
      }
      if (action === 'resources') return send(200, { resources });
      if (action === 'prices') return send(200, prices());
      const month = validMonth(u.searchParams.get('month') || ''), scenario = u.searchParams.get('scenario') || 'normal';
      if (action === 'usage') return send(200, usage(month, scenario));
      if (action === 'power') return send(200, power(month, scenario));
      if (action !== 'reservations') return send(404, { error: 'Unknown report' });
      const p = Number(u.searchParams.get('page') || 1);
      if (!Number.isInteger(p) || p < 1 || p > 10) throw Error('Invalid report page.');
      const retryKey = u.searchParams.get('run');
      if (scenario === 'retry' && p === 2 && !retries.has(retryKey)) {
        retries.add(retryKey);
        if (retries.size > 1000) retries.delete(retries.values().next().value);
        return send(429, { error: 'Practice rate limit; retry this page.' });
      }
      const all = records(system, month, scenario), rows = all.slice((p - 1) * 8, p * 8), nextPage = p * 8 < all.length ? p + 1 : null;
      const report = { headers: headers[system], rows, nextPage, total: all.length };
      return send(200, system === 'fbs' ? report : { ilab_response: { reservation_report: report } });
    } catch (e) {
      send(400, { error: e.message });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

module.exports = { startSimulator, records, usage, power, prices, headers, resources, validMonth };

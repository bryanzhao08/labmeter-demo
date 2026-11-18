/* Parity Multi-Agent Crew workspace. The Electron main process owns fetching, ML training, Ollama bridging, and run history. */
(function (root) {
  'use strict';

  const A = root.parityAgent;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DEFAULT_ROSTER = [
    { id: 'scout', name: 'Sherlock Ohms', role: 'Source Scout', badge: '01 · FIND', modelKey: 'source_classifier', modelLabel: 'Source & Schema Classifier', tagline: 'Sniffs out FBS, iLab, PPMS & mystery spreadsheets before anyone blames IT.', color: '#3B6EA5' },
    { id: 'scheduler', name: 'Sir Slots-a-Lot', role: 'Schedule Puller', badge: '02 · PULL', modelKey: 'column_mapper', modelLabel: 'Column Header Mapper', tagline: 'Politely retries rate limits until every last reservation page surrenders.', color: '#3F7F6E' },
    { id: 'telemetry', name: 'Count Wattula', role: 'Plug & Log Collector', badge: '03 · SENSE', modelKey: 'power_state', modelLabel: 'Smart-Plug Power Classifier', tagline: 'Counts every watt after midnight; knows file-copying from real laser runs.', color: '#7A5C99' },
    { id: 'matcher', name: 'Dr. Venn', role: 'Session Matcher', badge: '04 · MATCH', modelKey: 'session_matcher', modelLabel: 'Booking-to-Usage Matcher', tagline: 'Overlaps calendars, logins, and wall plugs; refuses to invent fake logoffs.', color: '#B0702A' },
    { id: 'pricer', name: 'Baron Von Markup', role: 'Rate & Rule Pricer', badge: '05 · PRICE', modelKey: 'policy_pricer', modelLabel: 'Rate & Clause Classifier', tagline: 'Fluent in Internal, External, Commercial, and 2 AM emergency confocal tariffs.', color: '#A8455E' },
    { id: 'auditor', name: 'Captain Nitpick', role: 'Discrepancy Auditor', badge: '06 · FLAG', modelKey: 'anomaly_auditor', modelLabel: 'Discrepancy & Anomaly Classifier', tagline: 'Spots John’s overrun, Adam’s sneaky walk-up, and Billy’s 20-minute sprint in seconds.', color: '#B23A1C' }
  ];

  const DEFAULT_PRESETS = [
    { id: 'full', label: 'Full Crew (All 6)', agents: DEFAULT_ROSTER.map(a => a.id) },
    { id: 'pull_only', label: 'Schedule Pull Only', agents: ['scout', 'scheduler'] },
    { id: 'sense_match', label: 'Sensors & Match', agents: ['scout', 'scheduler', 'telemetry', 'matcher'] },
    { id: 'booked_bill', label: 'Booked-Time Billing', agents: ['scout', 'scheduler', 'pricer', 'auditor'] }
  ];

  const MISSIONS = [
    'Close October pitch month and open Results',
    'Have Sir Slots-a-Lot pull iLab bookings',
    'Have Count Wattula inspect smart-plug watts',
    'Audit my workspace files'
  ];

  const ICONS = {
    scout: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5M10.5 8v2.5h2l-2 3"/></svg>',
    scheduler: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h3M13 14h3M8 17h3"/></svg>',
    telemetry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13h6l-1 9 9-11h-6z"/></svg>',
    matcher: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9.5" cy="12" r="5.5"/><circle cx="14.5" cy="12" r="5.5"/></svg>',
    pricer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M16 7.5c0-1.7-1.8-2.8-4-2.8s-4 1.1-4 2.8c0 2 2 2.7 4 3.3 2 .6 4 1.3 4 3.4 0 1.8-1.8 3-4 3s-4-1.2-4-3"/></svg>',
    auditor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6.5v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6.5z"/><path d="M12 8.5v4.5M12 16h.01"/></svg>'
  };

  const LABEL_NICE = {
    clean_match: ['Clean match', 'ok'],
    overrun: ['Overrun', 'warn'],
    idle_login_mismatch: ['Overrun + idle copy tail', 'warn'],
    walk_up_unbooked: ['Unbooked walk-up', 'bad'],
    no_show: ['No-show', 'warn'],
    short_underrun: ['Short underrun', 'warn'],
    duration_outlier: ['Duration outlier', 'bad']
  };

  const POWER_NICE = {
    active_acquisition: ['Active laser / run', 'ok'],
    standby_idle: ['Standby / file copy', 'warn'],
    off: ['Powered off', ''],
    sensor_dropout: ['Sensor dropout', 'bad']
  };

  let savedCrew = null;
  try {
    const raw = JSON.parse(localStorage.getItem('parity-agent-crew'));
    if (Array.isArray(raw) && raw.length) savedCrew = raw;
  } catch {}

  let state = {
    system: 'fbs',
    month: '2026-10',
    scenario: 'pitch',
    engine: 'builtin',
    llmModel: '',
    ollama: { available: false, models: [] },
    promptText: '',
    autopilot: false,
    autopilotPending: false,
    planNote: '',
    agents: new Set(savedCrew || DEFAULT_ROSTER.map(a => a.id)),
    tab: 'discrepancies',
    info: null,
    run: null,
    error: '',
    trainMessage: '',
    busy: false,
    training: false,
    loaded: false,
    subscribed: false
  };
  let hooks = null, polling = null;
  const $ = id => document.getElementById(id);

  function saveCrewPref() {
    try { localStorage.setItem('parity-agent-crew', JSON.stringify([...state.agents])); } catch {}
  }

  function rosterList() {
    return (state.info && Array.isArray(state.info.roster) && state.info.roster.length) ? state.info.roster : DEFAULT_ROSTER;
  }

  function presetList() {
    return (state.info && Array.isArray(state.info.presets) && state.info.presets.length) ? state.info.presets : DEFAULT_PRESETS;
  }

  function selectedAgentsOrdered() {
    return rosterList().map(a => a.id).filter(id => state.agents.has(id));
  }

  async function load() {
    state.loaded = true;
    if (!A) return;
    try {
      const [info, ollama] = await Promise.all([
        A.info(),
        A.llm ? A.llm() : Promise.resolve(info?.ollama || { available: false, models: [] })
      ]);
      state.info = info;
      state.ollama = ollama || info?.ollama || { available: false, models: [] };
      if (!state.llmModel && state.ollama.models?.length) state.llmModel = state.ollama.models[0].name;
      if (!state.run && state.info.runs[0]) state.run = await A.get(state.info.runs[0].id);
    } catch (e) {
      state.error = e.message;
    }
  }

  function renderCommanderCard(working) {
    const models = state.ollama?.models || [];
    const hasOllama = !!state.ollama?.available && models.length > 0;

    return `<section class="card crew-commander">
      <div class="page-head" style="margin-bottom:8px">
        <div>
          <h2>Ask the crew (Autopilot)</h2>
          <p class="hint">Give a plain-English task. Parity routes it with the trained intent model (or local Ollama), dispatches the right specialists, and can auto-load clean results straight into your schedule.</p>
        </div>
        <span class="pill ${state.engine === 'local_llm' && hasOllama ? 'ok' : ''}">${state.engine === 'local_llm' ? (hasOllama ? 'Local LLM: ' + esc(state.llmModel || models[0]?.name) : 'Local LLM (offline fallback)') : 'Built-in ML (7 models)'}</span>
      </div>
      <div class="crew-ask-row">
        <input id="agent-prompt" placeholder="e.g. Have Count Wattula inspect smart-plug watts, or Close October pitch month" value="${esc(state.promptText)}" ${working ? 'disabled' : ''} aria-label="Ask the agent crew">
        <button type="button" class="primary" id="agent-ask" ${!A || working ? 'disabled' : ''}>${working ? 'Working…' : 'Send crew'}</button>
      </div>
      <div class="chips" role="group" aria-label="Quick missions">
        ${MISSIONS.map(m => `<button type="button" class="chip" data-crew-mission="${esc(m)}" ${!A || working ? 'disabled' : ''}>${esc(m)}</button>`).join('')}
      </div>
      <div class="crew-engine-row">
        <label>Agent brain
          <select id="agent-engine" ${working ? 'disabled' : ''}>
            <option value="builtin" ${state.engine === 'builtin' ? 'selected' : ''}>Built-in Trained ML (7 models · instant offline)</option>
            <option value="local_llm" ${state.engine === 'local_llm' ? 'selected' : ''}>Built-in ML + Local Ollama LLM${hasOllama ? ` (${models.length} installed)` : ' (start Ollama)'}</option>
          </select>
        </label>
        ${state.engine === 'local_llm' ? `<label>Local Ollama model
          <div class="add-machine" style="margin-top:6px;max-width:none">
            <select id="agent-llm-model" style="margin-top:0" ${working || !hasOllama ? 'disabled' : ''}>
              ${hasOllama ? models.map(m => `<option value="${esc(m.name)}" ${(state.llmModel || models[0].name) === m.name ? 'selected' : ''}>${esc(m.name)}${m.parameterSize ? ` (${m.parameterSize})` : ''}</option>`).join('') : '<option value="">No Ollama models detected</option>'}
            </select>
            <button type="button" class="secondary" id="agent-llm-refresh" ${!A || working ? 'disabled' : ''}>Refresh</button>
          </div>
        </label>` : ''}
        <label class="checkline crew-auto-check">
          <input type="checkbox" id="agent-autopilot" ${state.autopilot ? 'checked' : ''} ${working ? 'disabled' : ''}>
          <span>Auto-apply clean runs into Parity (Schedule / Results)</span>
        </label>
      </div>
      ${state.planNote ? `<div class="banner" style="margin:12px 0 0"><div>${esc(state.planNote)}</div></div>` : ''}
    </section>`;
  }

  function renderCrewGrid(working) {
    const roster = rosterList();
    const presets = presetList();
    const models = state.info?.models || {};
    const runCrew = new Map((state.run?.crew || []).map(c => [c.id, c]));
    const currentSet = [...state.agents].sort().join(',');

    return `<section class="card crew-section">
      <div class="page-head" style="margin-bottom:10px">
        <div>
          <h2>Assemble your specialist crew</h2>
          <p class="hint">Toggle agents on or off, pick a preset, or run a single specialist solo. Disabled agents sit out on coffee break.</p>
        </div>
        <span class="pill ok">${state.agents.size} of ${roster.length} active</span>
      </div>
      <div class="chips" role="group" aria-label="Crew presets">
        ${presets.map(p => {
          const active = p.agents.slice().sort().join(',') === currentSet;
          return `<button type="button" class="chip" data-agent-preset="${esc(p.id)}" aria-pressed="${active}" ${working ? 'disabled' : ''}>${esc(p.label)}</button>`;
        }).join('')}
      </div>
      <div class="crew-grid">
        ${roster.map(a => {
          const on = state.agents.has(a.id);
          const m = models[a.modelKey];
          const rc = runCrew.get(a.id);
          const statusLabel = !on ? 'Coffee break' : rc ? ({ queued: 'Queued', running: 'Working…', done: 'Done', skipped: 'Skipped', cancelled: 'Cancelled', failed: 'Failed' }[rc.status] || rc.status) : 'Ready';
          const statusCls = !on ? '' : rc?.status === 'done' ? 'ok' : rc?.status === 'failed' ? 'bad' : rc?.status === 'running' ? 'warn' : '';
          return `<article class="crew-card ${on ? 'is-on' : 'is-off'}" style="--ac:${esc(a.color)}">
            <div class="crew-card-top">
              <div class="crew-avatar">${ICONS[a.id] || ''}</div>
              <div class="crew-title">
                <span class="crew-badge">${esc(a.badge)} · ${esc(a.role)}</span>
                <h3>${esc(a.name)}</h3>
              </div>
              <label class="crew-toggle" title="Enable or disable ${esc(a.name)}">
                <input type="checkbox" data-agent-toggle="${esc(a.id)}" ${on ? 'checked' : ''} ${working ? 'disabled' : ''}>
                <span>${on ? 'On' : 'Off'}</span>
              </label>
            </div>
            <p class="crew-tagline">${esc(a.tagline)}</p>
            <div class="crew-meta">
              <span class="pill">${esc(a.modelLabel)}${m ? ` · ${Math.round(m.accuracy * 100)}% acc` : ''}</span>
              <span class="pill ${statusCls}">${esc(statusLabel)}</span>
            </div>
            ${rc && rc.summary && on ? `<p class="hint crew-last">${esc(rc.summary)}</p>` : ''}
            <div class="crew-card-foot">
              <button type="button" class="link" data-agent-solo="${esc(a.id)}" ${!A || working ? 'disabled' : ''}>Solo run</button>
            </div>
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }

  function renderTrainingCard(working) {
    const info = state.info;
    const models = info?.models ? Object.values(info.models) : [];
    const avgAcc = info?.averageAccuracy != null ? (info.averageAccuracy * 100).toFixed(1) + '%' : '—';
    const avgF1 = info?.averageMacroF1 != null ? info.averageMacroF1.toFixed(3) : '—';
    return `<section class="card agent-training">
      <div class="page-head" style="margin-bottom:8px">
        <div>
          <h2>Local ML model lab</h2>
          <p class="hint">All 7 specialist and intent-routing models train locally on this computer with zero external API calls. Retrain the baseline splits or fine-tune on your approved sessions.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="primary" id="agent-train" ${!A || working || state.training ? 'disabled' : ''}>${state.training ? 'Training 7 models…' : 'Train all 7 models'}</button>
          <button type="button" class="secondary" id="agent-feedback-train" ${!A || working || state.training ? 'disabled' : ''}>Fine-tune on my sessions</button>
        </div>
      </div>
      ${state.trainMessage ? `<div class="banner" style="margin:10px 0;border-left-color:var(--ok)"><div>${esc(state.trainMessage)}</div></div>` : ''}
      ${info ? `<div class="stats" style="margin-top:12px">
        <div class="stat"><span>Models trained</span><strong>${models.length || 7}</strong><small>Hybrid NB + Softmax / GNB</small></div>
        <div class="stat"><span>Training examples</span><strong>${esc(info.totalTrainingSamples ?? info.model?.trainingSamples ?? 0)}</strong><small>${esc(info.totalHeldoutSamples ?? info.model?.heldoutSamples ?? 0)} held-out</small></div>
        <div class="stat"><span>Mean held-out acc</span><strong>${esc(avgAcc)}</strong><small>Macro F1 ${esc(avgF1)}</small></div>
        <div class="stat"><span>Last trained</span><strong>${info.trainedAt ? esc(new Date(info.trainedAt).toLocaleTimeString()) : 'Bundled'}</strong><small>${info.models ? 'Saved locally' : ''}</small></div>
      </div>` : ''}
      ${models.length ? `<details ${state.trainMessage ? 'open' : ''}><summary>Model benchmarks by specialist</summary>
        <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Specialist</th><th>Model</th><th>Type</th><th class="num">Train</th><th class="num">Held-out</th><th class="num">Accuracy</th><th class="num">Macro F1</th></tr></thead><tbody>
        ${models.map(m => `<tr><td><strong>${esc(m.agent)}</strong></td><td>${esc(m.name)}</td><td>${esc(m.type)}</td><td class="num">${m.trainingSamples}${m.customAdded ? ` (+${m.customAdded})` : ''}</td><td class="num">${m.heldoutSamples}</td><td class="num">${(m.accuracy * 100).toFixed(1)}%</td><td class="num">${m.macroF1.toFixed(3)}</td></tr>`).join('')}
        </tbody></table></div>
      </details>` : ''}
    </section>`;
  }

  function renderRunOutput(r, working) {
    if (!r) return '';
    const res = r.result;
    const isPitch = r.scenario === 'pitch';
    const tabs = [
      ['discrepancies', 'Discrepancies & Bill', res?.discrepancies?.length || 0],
      ['telemetry', 'Smart Plugs & PC Logs', res?.powerClassified?.length || res?.usage?.rows?.length || 0],
      ['reservations', 'Reservations', r.counts?.reservations || 0],
      ['models', 'Models & Provenance', res?.mapping?.length || 0]
    ];

    let tabBody = '<p class="hint" style="margin-top:10px">Validated crew findings appear here after the run finishes. Your current schedule is kept until you import.</p>';
    if (res) {
      if (state.tab === 'discrepancies') {
        const list = res.discrepancies || [];
        if (!list.length) {
          tabBody = '<p class="hint" style="margin-top:10px">No discrepancy audit items in this run. Enable <strong>Dr. Venn</strong> + <strong>Captain Nitpick</strong> to inspect session-level flags.</p>';
        } else {
          const sorted = list.slice().sort((a, b) => (a.label === 'clean_match') - (b.label === 'clean_match'));
          tabBody = `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Who &amp; Instrument</th><th class="num">Booked</th><th class="num">PC Log</th><th class="num">Active Plug</th><th class="num">Bill</th><th>Captain Nitpick</th></tr></thead><tbody>
            ${sorted.slice(0, 24).map(d => {
              const [lbl, cls] = LABEL_NICE[d.label] || [d.label, ''];
              return `<tr><td><strong>${esc(d.user)}</strong><small>${esc(d.instrument)} · ${esc(d.date)}</small></td><td class="num">${(d.bookedMin / 60).toFixed(2)}h</td><td class="num">${(d.pcUsedMin / 60).toFixed(2)}h</td><td class="num">${(d.plugActiveMin / 60).toFixed(2)}h</td><td class="num">${d.amount != null ? '$' + Number(d.amount).toFixed(2) : '—'}</td><td><span class="pill ${cls}">${esc(lbl)} (${Math.round(d.confidence * 100)}%)</span><small>${esc(d.summary)}</small></td></tr>`;
            }).join('')}
          </tbody></table></div>`;
        }
      } else if (state.tab === 'telemetry') {
        const pwr = res.powerClassified || [];
        const logs = res.usage?.rows || [];
        if (!pwr.length && !logs.length) {
          tabBody = '<p class="hint" style="margin-top:10px">No telemetry collected. Enable <strong>Count Wattula</strong> to read PC logs and smart-plug watt streams.</p>';
        } else {
          tabBody = `${pwr.length ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Instrument</th><th>Operator</th><th>Window</th><th class="num">Mean W</th><th class="num">Peak W</th><th>Count Wattula State</th></tr></thead><tbody>
            ${pwr.slice(0, 18).map(p => {
              const [lbl, cls] = POWER_NICE[p.state] || [p.state, ''];
              return `<tr><td>${esc(p.instrument)}</td><td>${esc(p.operator || '—')}</td><td>${esc(p.start.slice(5, 16))}–${esc(p.end.slice(11, 16))}</td><td class="num">${p.meanWatts.toFixed(1)}W</td><td class="num">${p.peakWatts.toFixed(1)}W</td><td><span class="pill ${cls}">${esc(lbl)} (${Math.round(p.confidence * 100)}%)</span></td></tr>`;
            }).join('')}
          </tbody></table></div>` : `<p class="hint" style="margin-top:10px">${logs.length} PC logon/logoff sessions collected.</p>`}`;
        }
      } else if (state.tab === 'reservations') {
        tabBody = res.table.rows.length
          ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Person</th><th>Instrument</th><th>Booking</th><th>Service / Tier</th></tr></thead><tbody>${res.table.rows.slice(0, 12).map(row => `<tr><td>${esc(row[2])}</td><td>${esc(row[1])}</td><td>${esc(row[5].slice(5, 16))}–${esc(row[6].slice(11, 16))}</td><td>${esc(row[7])} · ${esc(row[8])}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="hint" style="margin-top:10px">No reservations pulled. Enable <strong>Sir Slots-a-Lot</strong> to pull bookings.</p>';
      } else {
        tabBody = `<div style="margin-top:10px">
          ${res.sourceClassifications?.length ? `<p class="hint" style="margin-bottom:6px"><strong>Sherlock Ohms source classification:</strong> ${res.sourceClassifications.map(s => `${esc(s.name)} → ${esc(s.kind)} (${Math.round(s.confidence * 100)}%)`).join(' · ')}</p>` : ''}
          ${res.mapping?.length ? `<div class="table-wrap"><table><thead><tr><th>Source column</th><th>Sir Slots-a-Lot mapped to</th><th>Score</th></tr></thead><tbody>${res.mapping.map(m => `<tr><td>${esc(m.header)}</td><td>${esc(m.label)}</td><td>${Math.round(m.confidence * 100)}%</td></tr>`).join('')}</tbody></table></div>` : ''}
          <p class="hint pathline" style="margin-top:10px">Source SHA-256: ${esc(res.source.sha256)}</p>
        </div>`;
      }
    }

    // Crucial: keep import/export disabled while ANY crew run is working!
    const canImport = !working && r.status === 'ready' && !!res?.table?.rows?.length;

    return `<section class="card agent-run">
      <div class="page-head">
        <div>
          <h2>${r.system === 'fbs' ? 'FBS' : r.system === 'ilab' ? 'iLab' : 'Workspace'} · ${esc(r.month)}${isPitch ? ' · Pitch Story' : ''}</h2>
          <p class="hint">${esc(r.id)} · ${new Date(r.started).toLocaleString()}</p>
        </div>
        <div class="head-actions">
          ${r.triggeredBy === 'mcp' ? '<span class="pill ok">Synced from MCP</span>' : ''}
          <span class="pill ${r.status === 'ready' ? 'ok' : r.status === 'running' ? '' : 'warn'}" role="status">${esc({ ready: 'Ready for review', running: 'Crew working', needs_review: 'Rejected rows need review', cancelled: 'Cancelled', interrupted: 'Interrupted', failed: 'Could not finish' }[r.status] || r.status)}</span>
        </div>
      </div>
      ${r.crew?.length ? `<div class="crew-strip">${r.crew.map(c => `<div class="crew-step st-${esc(c.status)}"><strong>${esc(c.name)}</strong><span>${esc(c.summary || c.status)}</span></div>`).join('')}</div>` : ''}
      ${res?.llmBriefing ? `<div class="banner" style="margin-bottom:14px;border-left-color:var(--ink)"><div><strong>Local LLM briefing (${esc(res.llmBriefing.model)}): ${esc(res.llmBriefing.headline)}</strong><p style="margin-top:4px">${esc(res.llmBriefing.briefing)}</p><small class="hint" style="display:block;margin-top:4px">Top priority: ${esc(res.llmBriefing.topPriority)}</small></div></div>` : ''}
      <div class="agent-workspace">
        <div>
          <h3>Crew activity</h3>
          <ol class="agent-events" aria-label="Agent activity">${r.events.map(e => `<li><span class="agent-tool">${e.agentName ? esc(e.agentName) + ' · ' : ''}${esc(e.tool.replace(/_/g, ' '))}</span><span>${esc(e.message)}</span></li>`).join('')}</ol>
          ${r.error ? `<p class="error" role="alert">${esc(r.error)}</p>` : ''}
        </div>
        <div class="agent-preview">
          <h3>Staged findings</h3>
          ${res ? `<p class="hint" style="margin:8px 0 10px">${r.counts.reservations} unique bookings · ${r.counts.cancelled} cancellation · ${r.counts.duplicates} duplicate removed · ${r.counts.pages} pages read${r.crewCounts?.draftTotal != null ? ` · Draft total $${Number(r.crewCounts.draftTotal).toFixed(2)}` : ''}${r.crewCounts?.flaggedDiscrepancies ? ` · ${r.crewCounts.flaggedDiscrepancies} discrepancy flags` : ''}</p>
          <div class="tabs" role="group" aria-label="Crew output view">
            ${tabs.map(([id, label, count]) => `<button type="button" data-agent-tab="${id}" aria-pressed="${state.tab === id}">${esc(label)} <span class="hint">${count}</span></button>`).join('')}
          </div>
          ${tabBody}
          ${res.issues.length ? `<div class="banner warn" style="margin-top:14px"><div><strong>Import blocked.</strong> ${res.issues.length} source row failed validation. Fix the practice scenario or source report and run again.<ul>${res.issues.map(i => `<li>Page ${i.page}, row ${i.row}: ${esc(i.reason)}</li>`).join('')}</ul></div></div>` : '<p class="hint" style="margin-top:12px">Nothing is billed until you review and approve. Use in Parity loads bookings, telemetry logs, and rate rules into your schedule.</p>'}
          <div class="actions">
            <button class="primary" id="agent-import" ${!canImport ? 'disabled' : ''}>Use in Parity</button>
            <button class="secondary" id="agent-open-results" ${!canImport ? 'disabled' : ''}>Use &amp; open Results</button>
            <button class="secondary" id="agent-download" ${!canImport ? 'disabled' : ''}>Download reservations</button>
          </div>` : tabBody}
        </div>
      </div>
    </section>`;
  }

  function render() {
    const r = state.run;
    const working = state.busy || r?.status === 'running';
    const activeCount = state.agents.size;
    const ws = hooks?.getWorkspace?.();
    const hasWsFiles = !!(ws && ws.reservations);

    return `<div class="page-head">
      <div>
        <h1>Agent crew</h1>
        <p class="sub">Pick which specialist agents to run, choose built-in trained ML or local Ollama, train all 7 models locally, and let the crew drive your Parity review.</p>
      </div>
      <span class="pill warn">${state.system === 'workspace' ? 'Local workspace data' : 'Practice systems · synthetic data'}</span>
    </div>
    ${!A ? '<div class="banner"><div>Open the desktop app to run the agent crew and train models locally on your computer.</div></div>' : ''}
    ${renderCommanderCard(working)}
    ${renderCrewGrid(working)}
    <section class="card agent-command">
      <h2>Manual dispatch</h2>
      <p class="hint">Or pick a data source, month, and scenario directly for your selected specialists.</p>
      <div class="agent-fields">
        <label>Data source
          <select id="agent-system" ${working ? 'disabled' : ''}>
            <option value="fbs" ${state.system === 'fbs' ? 'selected' : ''}>FBS practice</option>
            <option value="ilab" ${state.system === 'ilab' ? 'selected' : ''}>iLab practice</option>
            <option value="workspace" ${state.system === 'workspace' ? 'selected' : ''}>My workspace${hasWsFiles ? ' (loaded)' : ' (upload files first)'}</option>
          </select>
        </label>
        <label>Report month
          <input id="agent-month" type="month" value="${esc(state.month)}" ${working ? 'disabled' : ''}>
        </label>
        <label>Practice scenario
          <select id="agent-scenario" ${working || state.system === 'workspace' ? 'disabled' : ''}>
            <option value="pitch" ${state.scenario === 'pitch' ? 'selected' : ''}>Pitch story: John, Adam &amp; Billy</option>
            <option value="normal" ${state.scenario === 'normal' ? 'selected' : ''}>Normal report</option>
            <option value="retry" ${state.scenario === 'retry' ? 'selected' : ''}>Temporary rate limit</option>
            <option value="invalid" ${state.scenario === 'invalid' ? 'selected' : ''}>Invalid booking to review</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="primary" id="agent-run" ${!A || working || !activeCount ? 'disabled' : ''}>${working ? 'Crew working…' : `Run selected crew (${activeCount}/6)`}</button>
        ${working ? '<button class="secondary" id="agent-cancel">Cancel run</button>' : ''}
        <button class="secondary" id="agent-practice" ${!A || state.system === 'workspace' ? 'disabled' : ''}>Open practice scheduler</button>
      </div>
      <p class="error" role="alert">${esc(state.error)}</p>
    </section>
    ${renderRunOutput(r, working)}
    ${renderTrainingCard(working)}
    ${state.info?.runs.length ? `<section class="card"><h2>Recent crew runs</h2><div class="agent-history">${state.info.runs.slice(0, 8).map(x => `<button class="secondary" data-agent-history="${esc(x.id)}" ${working ? 'disabled' : ''}>${x.triggeredBy === 'mcp' ? 'MCP · ' : ''}${x.system === 'fbs' ? 'FBS' : x.system === 'ilab' ? 'iLab' : 'Workspace'} ${esc(x.month)}${x.agents ? ` (${x.agents.length}/6)` : ''} · ${esc(x.status.replace(/_/g, ' '))}</button>`).join('')}</div></section>` : ''}`;
  }

  function refresh() {
    if (location.hash === '#agent') hooks.render(true);
  }

  function stopPolling() {
    clearInterval(polling);
    polling = null;
  }

  function maybeAutopilotFinish() {
    if (!state.autopilotPending || !state.run) return;
    if (state.run.status === 'running') return;
    state.autopilotPending = false;
    if (state.run.status === 'ready' && !state.run.result?.issues?.length && state.run.result?.table?.rows?.length) {
      hooks.importRun(state.run, state.run.targetView === 'results');
      hooks.toast('Crew updated your Parity workspace. Review flagged sessions before approving.');
    }
  }

  function watch() {
    stopPolling();
    polling = setInterval(async () => {
      try {
        if (!state.run || state.run.status !== 'running') {
          stopPolling();
          maybeAutopilotFinish();
          return;
        }
        state.run = await A.get(state.run.id);
        if (state.run.status !== 'running') {
          state.info = await A.info();
          stopPolling();
          maybeAutopilotFinish();
          if (location.hash !== '#agent') return;
        }
        refresh();
      } catch (e) {
        stopPolling();
        state.autopilotPending = false;
        state.error = e.message;
        refresh();
      }
    }, 220);
  }

  async function startRun(overrideAgents = null) {
    state.busy = true;
    state.error = '';
    state.planNote = '';
    state.autopilotPending = state.autopilot;
    refresh();
    try {
      const agents = overrideAgents || selectedAgentsOrdered();
      if (!agents.length) throw Error('Enable at least one agent in the crew.');
      const payload = {
        system: state.system,
        month: state.month,
        scenario: state.scenario,
        engine: state.engine,
        llmModel: state.llmModel,
        agents
      };
      if (state.system === 'workspace') {
        const ws = hooks?.getWorkspace?.();
        if (!ws || !ws.reservations) throw Error('Add or connect a reservation spreadsheet first on Home or Upload a month.');
        payload.workspace = ws;
      }
      const r = await A.start(payload);
      state.run = await A.get(r.id);
      state.info = await A.info();
      if (state.run.status === 'running') watch();
      else maybeAutopilotFinish();
    } catch (e) {
      state.autopilotPending = false;
      state.error = e.message;
    } finally {
      state.busy = false;
      refresh();
    }
  }

  async function askCrew(promptText) {
    const clean = String(promptText || '').trim();
    if (!clean) {
      state.error = 'Type a goal or pick a quick mission above.';
      refresh();
      return;
    }
    state.promptText = clean;
    state.busy = true;
    state.error = '';
    state.planNote = '';
    state.autopilotPending = state.autopilot;
    refresh();
    try {
      const ws = hooks?.getWorkspace?.();
      const res = await A.ask({
        prompt: clean,
        system: state.system,
        month: state.month,
        scenario: state.scenario,
        engine: state.engine,
        llmModel: state.llmModel,
        workspace: ws && ws.reservations ? ws : null
      });
      state.planNote = res.plan?.explanation || '';
      if (res.kind === 'train') {
        state.autopilotPending = false;
        state.info = await A.info();
        const tr = res.trainResult;
        state.trainMessage = `Trained all 7 local models in ${tr.durationMs} ms · ${(tr.averageAccuracy * 100).toFixed(1)}% mean held-out accuracy (F1 ${tr.averageMacroF1.toFixed(3)}).`;
        hooks.toast('All 7 agent models retrained locally.');
      } else {
        state.agents = new Set(res.plan.agents);
        saveCrewPref();
        state.system = res.plan.system;
        state.month = res.plan.month;
        state.scenario = res.plan.scenario;
        state.run = await A.get(res.run.id);
        state.info = await A.info();
        if (state.run.status === 'running') watch();
        else maybeAutopilotFinish();
      }
    } catch (e) {
      state.autopilotPending = false;
      state.error = e.message;
    } finally {
      state.busy = false;
      refresh();
    }
  }

  function bind(h) {
    hooks = h;
    if (!state.loaded && A) load().then(() => { refresh(); if (state.run?.status === 'running') watch(); });
    if (!state.subscribed && A?.onUpdate) {
      state.subscribed = true;
      A.onUpdate(async () => {
        try {
          const info = await A.info();
          state.info = info;
          const newest = info.runs[0];
          if (newest && (!state.run || newest.id !== state.run.id || newest.status !== state.run.status)) {
            state.run = await A.get(newest.id);
            if (newest.triggeredBy === 'mcp') hooks?.toast?.('Synced new crew run from MCP.');
          }
          refresh();
        } catch {}
      });
    }

    const read = () => {
      if ($('agent-system')) state.system = $('agent-system').value;
      if ($('agent-month')) state.month = $('agent-month').value;
      if ($('agent-scenario')) state.scenario = $('agent-scenario').value;
      if ($('agent-engine')) state.engine = $('agent-engine').value;
      if ($('agent-llm-model')) state.llmModel = $('agent-llm-model').value;
      if ($('agent-prompt')) state.promptText = $('agent-prompt').value;
      if ($('agent-autopilot')) state.autopilot = $('agent-autopilot').checked;
    };

    for (const id of ['agent-system', 'agent-month', 'agent-scenario', 'agent-engine', 'agent-llm-model']) {
      if ($(id)) $(id).onchange = () => { read(); refresh(); };
    }
    if ($('agent-autopilot')) $('agent-autopilot').onchange = read;
    if ($('agent-prompt')) {
      $('agent-prompt').oninput = () => { state.promptText = $('agent-prompt').value; };
      $('agent-prompt').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); askCrew($('agent-prompt').value); } };
    }
    if ($('agent-ask')) $('agent-ask').onclick = () => { read(); askCrew(state.promptText); };

    if ($('agent-llm-refresh')) $('agent-llm-refresh').onclick = async () => {
      try {
        state.ollama = await A.llm();
        if (!state.llmModel && state.ollama.models?.length) state.llmModel = state.ollama.models[0].name;
        hooks.toast(state.ollama.available ? `Found ${state.ollama.models.length} local Ollama model(s).` : 'Ollama not reachable on 127.0.0.1:11434.');
        refresh();
      } catch (e) {
        state.error = e.message; refresh();
      }
    };

    document.querySelectorAll('[data-crew-mission]').forEach(btn => {
      btn.onclick = () => { read(); askCrew(btn.dataset.crewMission); };
    });

    document.querySelectorAll('[data-agent-toggle]').forEach(el => {
      el.onchange = () => {
        const id = el.dataset.agentToggle;
        if (el.checked) state.agents.add(id);
        else state.agents.delete(id);
        saveCrewPref();
        refresh();
      };
    });

    document.querySelectorAll('[data-agent-preset]').forEach(btn => {
      btn.onclick = () => {
        const p = presetList().find(x => x.id === btn.dataset.agentPreset);
        if (!p) return;
        state.agents = new Set(p.agents);
        saveCrewPref();
        refresh();
      };
    });

    document.querySelectorAll('[data-agent-solo]').forEach(btn => {
      btn.onclick = () => {
        read();
        const id = btn.dataset.agentSolo;
        state.agents = new Set([id]);
        saveCrewPref();
        startRun([id]);
      };
    });

    document.querySelectorAll('[data-agent-tab]').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.agentTab; refresh(); };
    });

    if ($('agent-run')) $('agent-run').onclick = () => { read(); startRun(); };
    if ($('agent-cancel')) $('agent-cancel').onclick = () => { state.autopilotPending = false; A.cancel(state.run.id); };
    if ($('agent-practice')) $('agent-practice').onclick = async () => {
      read();
      try { await A.openPractice(state.system === 'workspace' ? 'fbs' : state.system); }
      catch (e) { state.error = e.message; refresh(); }
    };

    const doImport = async openResults => {
      try {
        const r = await A.get(state.run.id);
        if (r.status !== 'ready' || r.result.issues.length) throw Error('This run is not ready to import.');
        hooks.importRun(r, openResults);
        hooks.toast('Crew schedule, usage logs, and pricing rules loaded. Review before exporting.');
      } catch (e) {
        state.error = e.message;
        refresh();
      }
    };
    if ($('agent-import')) $('agent-import').onclick = () => doImport(false);
    if ($('agent-open-results')) $('agent-open-results').onclick = () => doImport(true);

    if ($('agent-download')) $('agent-download').onclick = () => {
      const b = new Blob([state.run.result.csv], { type: 'text/csv' });
      const u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u;
      a.download = `parity-${state.run.system}-${state.run.month}-crew.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    };

    if ($('agent-train')) $('agent-train').onclick = async () => {
      state.training = true; state.error = ''; state.trainMessage = ''; refresh();
      try {
        const res = await A.train({});
        state.info = await A.info();
        state.trainMessage = `Trained all 7 local models in ${res.durationMs} ms · ${(res.averageAccuracy * 100).toFixed(1)}% mean held-out accuracy (F1 ${res.averageMacroF1.toFixed(3)}).`;
        hooks.toast('All 7 agent models retrained locally.');
      } catch (e) {
        state.error = e.message;
      } finally {
        state.training = false;
        refresh();
      }
    };

    if ($('agent-feedback-train')) $('agent-feedback-train').onclick = async () => {
      state.training = true; state.error = ''; state.trainMessage = ''; refresh();
      try {
        const customSamples = hooks?.getFeedbackSamples?.() || {};
        const count = Object.values(customSamples).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
        const res = await A.train({ customSamples });
        state.info = await A.info();
        state.trainMessage = count
          ? `Fine-tuned on ${count} workspace session/column feedback sample(s) in ${res.durationMs} ms · ${(res.averageAccuracy * 100).toFixed(1)}% held-out accuracy.`
          : `No extra workspace feedback samples yet — retrained all 7 models cleanly in ${res.durationMs} ms (${(res.averageAccuracy * 100).toFixed(1)}% accuracy).`;
        hooks.toast(count ? `Fine-tuned models with ${count} feedback samples.` : 'Baseline models retrained.');
      } catch (e) {
        state.error = e.message;
      } finally {
        state.training = false;
        refresh();
      }
    };

    document.querySelectorAll('[data-agent-history]').forEach(b => {
      b.onclick = async () => {
        try { state.run = await A.get(b.dataset.agentHistory); state.error = ''; refresh(); }
        catch (e) { state.error = e.message; refresh(); }
      };
    });
  }

  root.LBAgentUI = {
    render,
    bind,
    preferSystem(sys) { if (['fbs', 'ilab', 'workspace'].includes(sys)) state.system = sys; }
  };
})(window);

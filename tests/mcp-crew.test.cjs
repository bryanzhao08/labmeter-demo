'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { createRuntime } = require('../agent/runtime.cjs');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-mcp-crew-'));
  const runsDir = path.join(tmp, 'runs');
  const folder = path.join(tmp, 'exports');
  fs.mkdirSync(runsDir, { recursive: true });
  fs.mkdirSync(folder, { recursive: true });

  const mock = path.join(__dirname, '../data/mock');
  for (const name of ['fbs-reservations.csv', 'usage-log.csv', 'price-sheet.csv']) {
    fs.copyFileSync(path.join(mock, name), path.join(folder, name));
  }

  const child = spawn(
    process.execPath,
    [path.join(__dirname, '../agent/mcp.cjs'), '--full-crew', '--runs-dir', runsDir, '--folder', folder],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  );

  const pending = new Map();
  let id = 0, stderr = '';
  child.stderr.on('data', b => { stderr += b; });
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const m = JSON.parse(line);
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    const t = setTimeout(() => reject(Error(stderr || 'MCP crew timeout')), 15000);
    pending.set(n, m => { clearTimeout(t); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
  });

  try {
    const init = await call('initialize', { protocolVersion: '2025-06-18' });
    assert.equal(init.result.serverInfo.name, 'parity-crew');

    const tools = (await call('tools/list', {})).result.tools;
    assert.equal(tools.length, 6);
    assert.ok(tools.every(t => t.annotations.readOnlyHint));

    const listed = (await call('tools/call', { name: 'parity_list_agents', arguments: {} })).result.structuredContent;
    assert.equal(listed.roster.length, 6);
    assert.equal(Object.keys(listed.models).length, 7);
    assert.equal(listed.folder_connected, true);
    assert.equal(listed.synced_to_app, true);

    // Run single funny-named agent synchronously
    const wattOnly = (await call('tools/call', {
      name: 'parity_run_agent',
      arguments: { agent: 'Count Wattula', system: 'fbs', month: '2026-10', scenario: 'pitch' }
    })).result.structuredContent;
    assert.equal(wattOnly.status, 'ready');
    assert.deepEqual(wattOnly.agents_used, ['telemetry']);
    assert.equal(wattOnly.synced_to_app, true);

    // Run full crew on pitch
    const fullPitch = (await call('tools/call', {
      name: 'parity_run_agent',
      arguments: { preset: 'full', system: 'fbs', month: '2026-10', scenario: 'pitch' }
    })).result.structuredContent;
    assert.equal(fullPitch.status, 'ready');
    assert.equal(fullPitch.agents_used.length, 6);
    assert.ok(fullPitch.discrepancies.some(d => d.user === 'Adam' && d.label === 'walk_up_unbooked'));
    assert.ok(fullPitch.pricing_summary.totalAmount > 0);

    // Run on connected local folder via workspace
    const wsRun = (await call('tools/call', {
      name: 'parity_run_agent',
      arguments: { preset: 'full', system: 'workspace', month: '2026-10' }
    })).result.structuredContent;
    assert.equal(wsRun.mode, 'workspace');
    assert.equal(wsRun.status, 'ready');
    assert.ok(wsRun.counts.reservations > 100);

    // Natural-language ask crew
    const asked = (await call('tools/call', {
      name: 'parity_ask_crew',
      arguments: { goal: 'Have Sir Slots-a-Lot pull iLab bookings for October' }
    })).result.structuredContent;
    assert.equal(asked.kind, 'run');
    assert.equal(asked.status, 'ready');
    assert.deepEqual(asked.agents_used, ['scheduler']);

    // Retrain all 7 models via MCP
    const trained = (await call('tools/call', {
      name: 'parity_train_models',
      arguments: {}
    })).result.structuredContent;
    assert.equal(Object.keys(trained.models).length, 7);
    assert.ok(trained.averageAccuracy >= 0.94);

    // Verify a separate runtime pointed at runsDir sees all MCP runs live!
    const appRuntime = await createRuntime({ directory: runsDir });
    try {
      const appInfo = appRuntime.info();
      assert.ok(appInfo.runs.some(r => r.id === fullPitch.run_id && r.triggeredBy === 'mcp'));
      const fetched = appRuntime.get(fullPitch.run_id);
      assert.equal(fetched.triggeredBy, 'mcp');
    } finally {
      await appRuntime.close();
    }

    console.log('PASS mcp-crew: 6 tools, single/preset/workspace/ask runs, model training, live runsDir sync');
  } finally {
    child.stdin.end();
    await new Promise(resolve => child.on('exit', resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

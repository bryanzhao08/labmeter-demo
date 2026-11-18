'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { trainAllModels } = require('../agent/train.cjs');
const { AGENTS, AGENT_IDS, PRESETS, normalizeAgentSelection } = require('../agent/roster.cjs');
const { createRuntime } = require('../agent/runtime.cjs');
const M = require('../month.js');

async function finished(rt, id) {
  for (let i = 0; i < 400; i++) {
    const r = rt.get(id);
    if (r.status !== 'running') return r;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Crew run timed out');
}

(async () => {
  // 1. All 7 specialist & intent models train deterministically with >= 90% held-out accuracy
  const bundle1 = trainAllModels();
  const bundle2 = trainAllModels();
  assert.equal(Object.keys(bundle1.models).length, 7);
  assert.ok(bundle1.models.intent_router);
  assert.equal(AGENTS.length, 6);
  assert.ok(PRESETS.length >= 4);
  for (const [name, m] of Object.entries(bundle1.evaluation.models)) {
    assert.ok(m.accuracy >= 0.9, `${name} held-out accuracy ${m.accuracy} < 0.9`);
    assert.ok(m.macroF1 >= 0.9, `${name} macroF1 ${m.macroF1} < 0.9`);
    assert.equal(m.accuracy, bundle2.evaluation.models[name].accuracy, `${name} training not deterministic`);
  }
  assert.ok(bundle1.evaluation.averageAccuracy >= 0.94);

  // 2. Roster normalization & empty rejection
  assert.deepEqual(normalizeAgentSelection(null), AGENT_IDS);
  assert.deepEqual(normalizeAgentSelection(['auditor', 'scout']), ['scout', 'auditor']);
  assert.throws(() => normalizeAgentSelection([]), /Enable at least one agent/);
  assert.throws(() => normalizeAgentSelection(['bogus']), /Unknown agent/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-crew-'));
  let rt;
  try {
    rt = await createRuntime({ directory: dir });
    const info = rt.info();
    assert.equal(info.roster.length, 6);
    assert.ok(info.roster.every(a => ['Sherlock Ohms', 'Sir Slots-a-Lot', 'Count Wattula', 'Dr. Venn', 'Baron Von Markup', 'Captain Nitpick'].includes(a.name)));

    // 3. Pitch story scenario: John overrun+idle copy tail, Adam walk-up, John no-show, Billy 20m underrun
    const pitchRun = await finished(rt, rt.start({ system: 'fbs', month: '2026-10', scenario: 'pitch' }).id);
    assert.equal(pitchRun.status, 'ready', pitchRun.error);
    assert.deepEqual(pitchRun.counts, { reservations: 24, cancelled: 1, duplicates: 1, rejected: 0, pages: 4 });
    assert.equal(pitchRun.crew.filter(c => c.status === 'done').length, 6);
    assert.ok(pitchRun.result.powerClassified.some(p => p.state === 'active_acquisition'));
    assert.ok(pitchRun.result.powerClassified.some(p => p.state === 'standby_idle' && p.operator === 'John'));
    assert.ok(pitchRun.result.powerClassified.some(p => p.state === 'off'));
    assert.ok(pitchRun.result.pricingSummary.totalAmount > 0);

    const disc = pitchRun.result.discrepancies;
    const johnDay2 = disc.find(d => d.user === 'John' && d.date === '2026-10-02');
    const adam = disc.find(d => d.user === 'Adam');
    const johnDay3 = disc.find(d => d.user === 'John' && d.date === '2026-10-03');
    const billy = disc.find(d => d.user === 'Billy');
    assert.ok(johnDay2 && (johnDay2.label === 'idle_login_mismatch' || johnDay2.label === 'overrun'), 'John overrun/idle tail missing');
    assert.equal(adam?.label, 'walk_up_unbooked', 'Adam unbooked walk-up missing');
    assert.equal(johnDay3?.label, 'no_show', 'John no-show missing');
    assert.equal(billy?.label, 'short_underrun', 'Billy short underrun missing');

    // 4. Selective agent toggling: pull-only & solo runs
    const pullOnly = await finished(rt, rt.start({ system: 'ilab', month: '2026-10', scenario: 'normal', agents: ['scout', 'scheduler'] }).id);
    assert.equal(pullOnly.status, 'ready');
    assert.equal(pullOnly.crew.find(c => c.id === 'scout').status, 'done');
    assert.equal(pullOnly.crew.find(c => c.id === 'scheduler').status, 'done');
    assert.equal(pullOnly.crew.find(c => c.id === 'telemetry').status, 'skipped');
    assert.equal(pullOnly.crew.find(c => c.id === 'auditor').status, 'skipped');
    assert.equal(pullOnly.result.discrepancies.length, 0);

    const soloPricer = await finished(rt, rt.start({ system: 'fbs', month: '2026-10', scenario: 'pitch', agents: ['pricer'] }).id);
    assert.equal(soloPricer.status, 'ready');
    assert.equal(soloPricer.crew.find(c => c.id === 'pricer').status, 'done');
    assert.equal(soloPricer.crew.find(c => c.id === 'scheduler').status, 'skipped');
    assert.ok(soloPricer.result.rateCard.length > 0);

    // 5. Workspace mode directly on local CSV tables
    const mockDir = path.join(__dirname, '../data/mock');
    const resTable = M.parseCSV(fs.readFileSync(path.join(mockDir, 'fbs-reservations.csv'), 'utf8'));
    const useTable = M.parseCSV(fs.readFileSync(path.join(mockDir, 'usage-log.csv'), 'utf8'));
    const priceTable = M.parseCSV(fs.readFileSync(path.join(mockDir, 'price-sheet.csv'), 'utf8'));
    const wsRun = await finished(rt, rt.start({
      system: 'workspace',
      month: '2026-10',
      workspace: {
        reservations: { name: 'fbs-reservations.csv', table: resTable },
        logs: [{ name: 'usage-log.csv', table: useTable }],
        prices: { name: 'price-sheet.csv', rows: [priceTable.head, ...priceTable.rows] }
      }
    }).id);
    assert.equal(wsRun.status, 'ready', wsRun.error);
    assert.ok(wsRun.counts.reservations > 100);
    assert.ok(wsRun.result.discrepancies.length > 50);
    assert.ok(wsRun.result.pricingSummary.totalAmount > 1000);

    // 6. Ask Commander (natural-language intent routing + selective execution + train)
    const askedWatt = await rt.ask({ prompt: 'Have Count Wattula inspect smart-plug power draw in FBS' });
    assert.equal(askedWatt.kind, 'run');
    assert.deepEqual(askedWatt.plan.agents, ['telemetry']);
    const wattRun = await finished(rt, askedWatt.run.id);
    assert.equal(wattRun.status, 'ready');
    assert.equal(wattRun.crew.find(c => c.id === 'telemetry').status, 'done');
    assert.equal(wattRun.crew.find(c => c.id === 'scheduler').status, 'skipped');

    const askedTrain = await rt.ask({ prompt: 'Retrain all local ML models now' });
    assert.equal(askedTrain.kind, 'train');
    assert.equal(Object.keys(askedTrain.trainResult.models).length, 7);

    // 7. In-app training writes trained-models.json to userData dir & hot-reloads
    const retrained = rt.train({
      customSamples: {
        column_mapper: [{ text: 'pi sponsor lab code', label: 'lab' }],
        anomaly_auditor: [{ features: [120, 120, 120, 0, 1, 1, 1, 0, 0.2], label: 'clean_match' }]
      }
    });
    assert.equal(retrained.models.column_mapper.customAdded, 1);
    assert.equal(retrained.models.anomaly_auditor.customAdded, 1);
    assert.ok(fs.existsSync(path.join(dir, 'trained-models.json')));

    await rt.close();
    rt = await createRuntime({ directory: dir });
    assert.equal(rt.info().models.column_mapper.customAdded, 1);

    console.log('PASS crew-models: 7 trained models, funny-named crew, commander ask, pitch story, solo/selective runs, workspace mode, in-app retraining');
  } finally {
    if (rt) await rt.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

(function (root) {
  'use strict';

  function costPool(items) {
    var result = { allowable: 0, unallowable: 0, excluded: [] };
    var reasons = {
      equipment_purchase: 'Equipment purchases must be depreciated instead of charged directly.',
      entertainment: 'Entertainment costs are unallowable.',
      bad_debt: 'Bad debt is unallowable.'
    };
    (items || []).forEach(function (item) {
      if (Object.prototype.hasOwnProperty.call(reasons, item.kind)) {
        result.unallowable += item.amount;
        result.excluded.push({ label: item.label, amount: item.amount, reason: reasons[item.kind] });
      } else {
        result.allowable += item.amount;
      }
    });
    return result;
  }

  function rate(pool, hours, carry) {
    if (hours <= 0) { return null; }
    return Math.round(((pool - (carry || 0)) / hours) * 100) / 100;
  }

  function compare(instrument) {
    var recovery = instrument.billedRate * instrument.measuredHours - (instrument.pool - (instrument.carry || 0));
    var surplusPct = recovery / instrument.pool;
    var bookedRate = rate(instrument.pool, instrument.bookedHours, instrument.carry);
    var loginRate = rate(instrument.pool, instrument.loginHours, instrument.carry);
    var measuredRate = rate(instrument.pool, instrument.measuredHours, instrument.carry);
    var flags = [];
    if (surplusPct > 0.05) { flags.push('over_recovery'); }
    if (surplusPct < -0.05) { flags.push('under_recovery'); }
    if (bookedRate !== null && bookedRate !== 0 && measuredRate !== null &&
        Math.abs(instrument.billedRate - bookedRate) / Math.abs(bookedRate) <= 0.02 &&
        Math.abs(measuredRate - bookedRate) / Math.abs(bookedRate) > 0.10) {
      flags.push('rate_from_bookings');
    }
    return {
      booked: { rate: bookedRate, recovery: recovery },
      login: { rate: loginRate, recovery: recovery },
      measured: { rate: measuredRate, recovery: recovery },
      surplusPct: surplusPct,
      flags: flags
    };
  }

  function annualize(monthHours, months) {
    return monthHours * 12 / months;
  }

  function checks(core) {
    var findings = [];
    var schedule = core.rateSchedule || [];
    (core.instruments || []).forEach(function (instrument) {
      var result = compare(instrument);
      var federal = schedule.filter(function (entry) { return entry.instrument === instrument.name && entry.userType === 'federal'; });
      var internal = schedule.filter(function (entry) { return entry.instrument === instrument.name && entry.userType === 'internal'; });
      var discriminatory = federal.some(function (f) {
        return internal.some(function (i) { return f.rate > i.rate; });
      });
      if (discriminatory) {
        findings.push({ severity: 'high', instrument: instrument.name, finding: 'Federal users charged more than internal users', cite: '2 CFR 200.468(b)' });
      }
      if (result.flags.indexOf('over_recovery') !== -1) {
        findings.push({ severity: 'medium', instrument: instrument.name, finding: "Projected surplus over 5% of costs: adjust next year's rate", cite: '2 CFR 200.468(b)' });
      }
      if (instrument.measuredHours < instrument.bookedHours * 0.5) {
        findings.push({ severity: 'low', instrument: instrument.name, finding: 'Rate built on bookings overstates usage', cite: '2 CFR 200.468(b)' });
      }
      if (instrument.items && costPool(instrument.items).excluded.length) {
        findings.push({ severity: 'high', instrument: instrument.name, finding: 'Pool contains unallowable costs', cite: '2 CFR 200.468(b)' });
      }
    });
    return findings;
  }

  function sampleCore() {
    // SYNTHETIC: illustrative costs, utilization, and rates, not institutional data.
    var specs = [
      ['Zeiss LSM 880 Confocal', 500000, 60000, 40000, 100000, 2400, 2100, 1900, 45],
      ['BD LSRFortessa Analyzer', 350000, 42000, 30000, 70000, 2500, 2200, 1950, 60],
      ['Leica SP8 Lightning', 450000, 54000, 35000, 90000, 2400, 2050, 1800, 50],
      ['Nikon Ti2 Widefield', 100000, 12000, 12000, 20000, 2200, 1950, 1700, 30],
      ['Beckman Optima XPN Ultracentrifuge', 150000, 18000, 12000, 30000, 2000, 0, 1550, 25]
    ];
    var instruments = [];
    var rateSchedule = [];
    specs.forEach(function (s, index) {
      var items = [
        { label: 'Service contract', amount: s[2], kind: 'service' },
        { label: 'Partial staff salary', amount: s[3], kind: 'labor' },
        { label: 'Annual depreciation', amount: s[4], kind: 'depreciation' }
      ];
      if (index === 4) { items.push({ label: 'Equipment purchase', amount: s[1], kind: 'equipment_purchase' }); }
      instruments.push({ name: s[0], items: items, pool: costPool(items).allowable, carry: 0, bookedHours: s[5], loginHours: s[6], measuredHours: s[7], billedRate: s[8] });
      rateSchedule.push({ userType: 'internal', rate: s[8], instrument: s[0] });
      rateSchedule.push({ userType: 'federal', rate: s[8] + (index === 0 ? 5 : 0), instrument: s[0] });
    });
    return { instruments: instruments, rateSchedule: rateSchedule };
  }

  var API = { costPool: costPool, rate: rate, compare: compare, annualize: annualize, checks: checks, sampleCore: sampleCore };
  root.LBRates = API;
  if (typeof module !== 'undefined') { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);

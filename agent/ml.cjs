'use strict';

// Deterministic seeded PRNG (Mulberry32) for reproducible training & shuffling.
function mulberry32(seed = 20261117) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function extractTextFeatures(text) {
  const clean = String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_/\\|.,:;()\[\]{}-]+/g, ' ')
    .toLowerCase();
  const words = clean.match(/[a-z0-9]+/g) || [];
  const counts = Object.create(null);
  const bump = k => { counts[k] = (counts[k] || 0) + 1; };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    bump('w:' + w);
    if (i + 1 < words.length) bump('b:' + w + '_' + words[i + 1]);
    const padded = '#' + w + '#';
    if (padded.length >= 3) {
      for (let j = 0; j <= padded.length - 3; j++) {
        bump('c:' + padded.slice(j, j + 3));
      }
    }
  }
  return counts;
}

function softmax(logits) {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const exps = new Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const v = Math.exp(Math.max(-60, Math.min(60, logits[i] - max)));
    exps[i] = v;
    sum += v;
  }
  const out = new Array(logits.length);
  for (let i = 0; i < logits.length; i++) out[i] = sum > 0 ? exps[i] / sum : 1 / logits.length;
  return out;
}

function normalizeSparse(counts, vocabIndex) {
  const entries = [];
  let sq = 0;
  for (const [tok, tf] of Object.entries(counts)) {
    const idx = vocabIndex.get(tok);
    if (idx === undefined) continue;
    const val = 1 + Math.log(tf);
    entries.push([idx, val]);
    sq += val * val;
  }
  const norm = Math.sqrt(sq) || 1;
  for (let i = 0; i < entries.length; i++) entries[i][1] /= norm;
  return entries;
}

function trainTextClassifier(samples, opts = {}) {
  const epochs = opts.epochs ?? 160;
  const lr0 = opts.lr ?? 1.1;
  const l2 = opts.l2 ?? 2e-4;
  const alpha = opts.alpha ?? 0.35;
  const seed = opts.seed ?? 20261117;

  const classSet = new Set();
  const vocabSet = new Set();
  const parsed = samples.map(s => {
    classSet.add(s.label);
    const feats = extractTextFeatures(s.text);
    for (const k of Object.keys(feats)) vocabSet.add(k);
    return { label: s.label, feats };
  });

  const labels = [...classSet].sort();
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const vocab = [...vocabSet].sort();
  const vocabIndex = new Map(vocab.map((v, i) => [v, i]));
  const V = vocab.length;
  const C = labels.length;

  // 1. Multinomial Naive Bayes statistics
  const nb = labels.map(() => ({ docs: 0, total: 0, counts: new Float64Array(V) }));
  const vecs = parsed.map(({ label, feats }) => {
    const ci = labelIndex.get(label);
    const cObj = nb[ci];
    cObj.docs++;
    for (const [tok, tf] of Object.entries(feats)) {
      const vi = vocabIndex.get(tok);
      const w = 1 + Math.log(tf);
      cObj.counts[vi] += w;
      cObj.total += w;
    }
    return { ci, entries: normalizeSparse(feats, vocabIndex) };
  });

  // 2. Multinomial Softmax Logistic Regression with cosine LR decay
  const W = Array.from({ length: C }, () => new Float64Array(V));
  const B = new Float64Array(C);
  const rand = mulberry32(seed);
  const order = vecs.map((_, i) => i);
  const n = vecs.length || 1;

  for (let ep = 0; ep < epochs; ep++) {
    // Deterministic Fisher-Yates shuffle
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const lr = lr0 * 0.5 * (1 + Math.cos(Math.PI * ep / Math.max(1, epochs)));
    const gradW = Array.from({ length: C }, () => new Float64Array(V));
    const gradB = new Float64Array(C);

    for (let k = 0; k < order.length; k++) {
      const { ci, entries } = vecs[order[k]];
      const logits = new Array(C);
      for (let c = 0; c < C; c++) {
        let z = B[c];
        const row = W[c];
        for (let m = 0; m < entries.length; m++) z += row[entries[m][0]] * entries[m][1];
        logits[c] = z;
      }
      const probs = softmax(logits);
      for (let c = 0; c < C; c++) {
        const err = probs[c] - (c === ci ? 1 : 0);
        gradB[c] += err / n;
        const gRow = gradW[c];
        for (let m = 0; m < entries.length; m++) gRow[entries[m][0]] += (err * entries[m][1]) / n;
      }
    }

    for (let c = 0; c < C; c++) {
      B[c] -= lr * gradB[c];
      const row = W[c], gRow = gradW[c];
      for (let v = 0; v < V; v++) {
        row[v] -= lr * (gRow[v] + l2 * row[v]);
      }
    }
  }

  // Serialize compactly
  const nbClasses = {};
  for (let c = 0; c < C; c++) {
    const words = {};
    for (let v = 0; v < V; v++) {
      if (nb[c].counts[v] > 0) words[vocab[v]] = Math.round(nb[c].counts[v] * 1e4) / 1e4;
    }
    nbClasses[labels[c]] = { docs: nb[c].docs, total: Math.round(nb[c].total * 1e4) / 1e4, words };
  }

  const weights = W.map(row => Array.from(row, x => Math.round(x * 1e5) / 1e5));
  const bias = Array.from(B, x => Math.round(x * 1e5) / 1e5);

  return {
    type: 'hybrid-nb-softmax-text',
    version: 2,
    samples: samples.length,
    alpha,
    labels,
    vocab,
    nbClasses,
    weights,
    bias
  };
}

const vocabIndexCache = new WeakMap();
function getVocabIndex(model) {
  let idx = vocabIndexCache.get(model);
  if (!idx) {
    idx = new Map(model.vocab.map((v, i) => [v, i]));
    vocabIndexCache.set(model, idx);
  }
  return idx;
}

function predictText(model, text) {
  if (!model || !model.labels || !model.labels.length) {
    return { label: null, confidence: 0, probabilities: {} };
  }
  const feats = extractTextFeatures(text);
  const vocabIndex = getVocabIndex(model);
  const entries = normalizeSparse(feats, vocabIndex);
  if (!entries.length) return { label: null, confidence: 0, probabilities: {} };

  const C = model.labels.length;
  const V = Math.max(1, model.vocab.length);
  const alpha = model.alpha ?? 0.35;

  const lrLogits = new Array(C);
  const nbLogits = new Array(C);
  for (let c = 0; c < C; c++) {
    const label = model.labels[c];
    // LR logit
    let z = model.bias[c] || 0;
    const row = model.weights[c];
    for (let m = 0; m < entries.length; m++) z += row[entries[m][0]] * entries[m][1];
    lrLogits[c] = z;

    // NB log posterior
    const nc = model.nbClasses[label];
    let nbScore = Math.log((nc.docs + 0.5) / (model.samples + 0.5 * C));
    const denom = nc.total + alpha * V;
    for (const [tok, tf] of Object.entries(feats)) {
      if (!vocabIndex.has(tok)) continue;
      nbScore += (1 + Math.log(tf)) * Math.log(((nc.words[tok] || 0) + alpha) / denom);
    }
    nbLogits[c] = nbScore;
  }

  const pLR = softmax(lrLogits);
  const pNB = softmax(nbLogits);
  const probabilities = {};
  let bestLabel = model.labels[0];
  let bestProb = -1;
  for (let c = 0; c < C; c++) {
    const p = 0.65 * pLR[c] + 0.35 * pNB[c];
    probabilities[model.labels[c]] = Math.round(p * 10000) / 10000;
    if (p > bestProb) { bestProb = p; bestLabel = model.labels[c]; }
  }
  return {
    label: bestLabel,
    confidence: Math.round(bestProb * 10000) / 10000,
    probabilities
  };
}

function toVector(input, featureNames) {
  if (Array.isArray(input)) {
    return featureNames.map((_, i) => {
      const v = Number(input[i]);
      return Number.isFinite(v) ? v : 0;
    });
  }
  return featureNames.map(name => {
    const v = Number(input && input[name]);
    return Number.isFinite(v) ? v : 0;
  });
}

function trainTabularClassifier(samples, featureNames, opts = {}) {
  const epochs = opts.epochs ?? 240;
  const lr0 = opts.lr ?? 0.6;
  const l2 = opts.l2 ?? 5e-4;
  const seed = opts.seed ?? 20261117;
  const D = featureNames.length;

  const classSet = new Set(samples.map(s => s.label));
  const labels = [...classSet].sort();
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const C = labels.length;
  const n = samples.length || 1;

  const raw = samples.map(s => ({ ci: labelIndex.get(s.label), x: toVector(s.features, featureNames) }));

  // Z-score standardization
  const mean = new Array(D).fill(0);
  const std = new Array(D).fill(0);
  for (const r of raw) for (let d = 0; d < D; d++) mean[d] += r.x[d] / n;
  for (const r of raw) for (let d = 0; d < D; d++) { const diff = r.x[d] - mean[d]; std[d] += (diff * diff) / n; }
  for (let d = 0; d < D; d++) std[d] = Math.max(1e-6, Math.sqrt(std[d]));

  const normX = raw.map(r => ({
    ci: r.ci,
    x: r.x.map((v, d) => (v - mean[d]) / std[d])
  }));

  // 1. Gaussian NB parameters on standardized features
  const gnb = labels.map(() => ({ docs: 0, mean: new Array(D).fill(0), var: new Array(D).fill(0) }));
  for (const r of normX) {
    const g = gnb[r.ci];
    g.docs++;
    for (let d = 0; d < D; d++) g.mean[d] += r.x[d];
  }
  for (let c = 0; c < C; c++) {
    const cnt = Math.max(1, gnb[c].docs);
    for (let d = 0; d < D; d++) gnb[c].mean[d] /= cnt;
  }
  for (const r of normX) {
    const g = gnb[r.ci];
    for (let d = 0; d < D; d++) {
      const diff = r.x[d] - g.mean[d];
      g.var[d] += diff * diff;
    }
  }
  for (let c = 0; c < C; c++) {
    const cnt = Math.max(1, gnb[c].docs);
    for (let d = 0; d < D; d++) gnb[c].var[d] = Math.max(0.05, gnb[c].var[d] / cnt + 0.05);
  }

  // 2. Softmax Logistic Regression on standardized features
  const W = Array.from({ length: C }, () => new Float64Array(D));
  const B = new Float64Array(C);
  const rand = mulberry32(seed);
  const order = normX.map((_, i) => i);

  for (let ep = 0; ep < epochs; ep++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const lr = lr0 * 0.5 * (1 + Math.cos(Math.PI * ep / Math.max(1, epochs)));
    const gradW = Array.from({ length: C }, () => new Float64Array(D));
    const gradB = new Float64Array(C);

    for (let k = 0; k < order.length; k++) {
      const { ci, x } = normX[order[k]];
      const logits = new Array(C);
      for (let c = 0; c < C; c++) {
        let z = B[c];
        const row = W[c];
        for (let d = 0; d < D; d++) z += row[d] * x[d];
        logits[c] = z;
      }
      const probs = softmax(logits);
      for (let c = 0; c < C; c++) {
        const err = probs[c] - (c === ci ? 1 : 0);
        gradB[c] += err / n;
        const gRow = gradW[c];
        for (let d = 0; d < D; d++) gRow[d] += (err * x[d]) / n;
      }
    }

    for (let c = 0; c < C; c++) {
      B[c] -= lr * gradB[c];
      const row = W[c], gRow = gradW[c];
      for (let d = 0; d < D; d++) row[d] -= lr * (gRow[d] + l2 * row[d]);
    }
  }

  return {
    type: 'hybrid-softmax-gnb-tabular',
    version: 1,
    samples: samples.length,
    featureNames: [...featureNames],
    labels,
    scaler: {
      mean: mean.map(v => Math.round(v * 1e5) / 1e5),
      std: std.map(v => Math.round(v * 1e5) / 1e5)
    },
    weights: W.map(row => Array.from(row, v => Math.round(v * 1e5) / 1e5)),
    bias: Array.from(B, v => Math.round(v * 1e5) / 1e5),
    gnb: gnb.map((g, i) => ({
      label: labels[i],
      prior: Math.round((g.docs / n) * 1e5) / 1e5,
      mean: g.mean.map(v => Math.round(v * 1e5) / 1e5),
      var: g.var.map(v => Math.round(v * 1e5) / 1e5)
    }))
  };
}

function predictTabular(model, input) {
  if (!model || !model.labels || !model.labels.length) {
    return { label: null, confidence: 0, probabilities: {} };
  }
  const D = model.featureNames.length;
  const C = model.labels.length;
  const raw = toVector(input, model.featureNames);
  const x = raw.map((v, d) => (v - model.scaler.mean[d]) / model.scaler.std[d]);

  const combinedLogits = new Array(C);
  const invTemp = 1 / Math.max(1, D * 0.65);

  for (let c = 0; c < C; c++) {
    let lrZ = model.bias[c] || 0;
    const row = model.weights[c];
    for (let d = 0; d < D; d++) lrZ += row[d] * x[d];

    const g = model.gnb[c];
    let gnbLL = Math.log(Math.max(1e-6, g.prior));
    for (let d = 0; d < D; d++) {
      const v = g.var[d];
      const diff = x[d] - g.mean[d];
      gnbLL += -0.5 * (Math.log(2 * Math.PI * v) + (diff * diff) / v);
    }
    combinedLogits[c] = 0.7 * lrZ + 0.3 * (gnbLL * invTemp);
  }

  const probs = softmax(combinedLogits);
  const probabilities = {};
  let bestLabel = model.labels[0];
  let bestProb = -1;
  for (let c = 0; c < C; c++) {
    const p = probs[c];
    probabilities[model.labels[c]] = Math.round(p * 10000) / 10000;
    if (p > bestProb) { bestProb = p; bestLabel = model.labels[c]; }
  }

  return {
    label: bestLabel,
    confidence: Math.round(bestProb * 10000) / 10000,
    probabilities
  };
}

function evaluateClassifier(predictFn, heldout) {
  const labels = [...new Set(heldout.map(h => h.label))].sort();
  const matrix = {};
  for (const actual of labels) {
    matrix[actual] = {};
    for (const pred of labels) matrix[actual][pred] = 0;
  }

  let correct = 0;
  const failures = [];
  for (const item of heldout) {
    const pred = predictFn(item);
    const got = pred && pred.label ? pred.label : 'unknown';
    if (!matrix[item.label]) matrix[item.label] = {};
    matrix[item.label][got] = (matrix[item.label][got] || 0) + 1;
    if (got === item.label) correct++;
    else if (failures.length < 20) {
      failures.push({
        expected: item.label,
        predicted: got,
        confidence: pred ? pred.confidence : 0,
        input: item.text ?? item.features
      });
    }
  }

  const perClass = {};
  let f1Sum = 0;
  for (const l of labels) {
    const tp = (matrix[l] && matrix[l][l]) || 0;
    let fp = 0, fn = 0, support = 0;
    for (const actual of labels) {
      for (const pred of Object.keys(matrix[actual] || {})) {
        const cnt = matrix[actual][pred] || 0;
        if (actual === l) support += cnt;
        if (actual === l && pred !== l) fn += cnt;
        if (actual !== l && pred === l) fp += cnt;
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[l] = {
      precision: Math.round(precision * 10000) / 10000,
      recall: Math.round(recall * 10000) / 10000,
      f1: Math.round(f1 * 10000) / 10000,
      support
    };
    f1Sum += f1;
  }

  const total = heldout.length || 1;
  return {
    total: heldout.length,
    correct,
    accuracy: Math.round((correct / total) * 10000) / 10000,
    macroF1: Math.round((f1Sum / Math.max(1, labels.length)) * 10000) / 10000,
    perClass,
    confusionMatrix: matrix,
    failures
  };
}

module.exports = {
  mulberry32,
  extractTextFeatures,
  trainTextClassifier,
  predictText,
  trainTabularClassifier,
  predictTabular,
  evaluateClassifier
};

'use strict';
// Supervised column-header classifier (hybrid Naive Bayes + Softmax Logistic Regression on tokens & char n-grams).
const { trainTextClassifier, predictText } = require('./ml.cjs');

const tokenizeV1 = s => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]+/g) || [];

function train(samples, opts = {}) {
  return trainTextClassifier(samples, opts);
}

function predictV1(model, text) {
  const tokens = tokenizeV1(text), known = tokens.filter(t => model.vocabulary.includes(t));
  if (!known.length) return { label: null, confidence: 0 };
  const scores = Object.entries(model.classes)
    .map(([label, c]) => ({
      label,
      score: Math.log(c.docs / model.samples) +
        known.reduce((s, t) => s + Math.log(((c.words[t] || 0) + 1) / (c.total + model.vocabulary.length)), 0)
    }))
    .sort((a, b) => b.score - a.score);
  const sum = scores.reduce((n, s) => n + Math.exp(s.score - scores[0].score), 0);
  return { label: scores[0].label, confidence: Math.round(10000 / sum) / 10000 };
}

function predict(model, text) {
  if (model && model.type === 'hybrid-nb-softmax-text') {
    const res = predictText(model, text);
    return { label: res.label, confidence: res.confidence, probabilities: res.probabilities };
  }
  return predictV1(model, text);
}

function mapColumns(model, headers) {
  const mapping = {}, evidence = [];
  for (const [index, header] of headers.entries()) {
    const p = predict(model, header);
    evidence.push({ header, index, label: p.label, confidence: p.confidence });
    if (!p.label || p.confidence < 0.45) continue;
    if (mapping[p.label] !== undefined) throw Error('Ambiguous columns for ' + p.label + '. Review the source export.');
    mapping[p.label] = index;
  }
  const missing = ['id', 'resource', 'user', 'start', 'end', 'status'].filter(k => mapping[k] === undefined);
  if (missing.length) throw Error('Column mapper needs review: ' + missing.join(', ') + '. No records imported.');
  return { mapping, evidence };
}

module.exports = { train, predict, mapColumns };

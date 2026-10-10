// Shared (browser + Node) progress merge: combine two progress states without losing data.
(function (root) {
  function blank() {
    return { version: 1, words: {}, quizLog: [], days: {}, units: {}, updatedAt: 0 };
  }
  function mergeObj(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b || {})) {
      const x = out[k], y = b[k];
      if (x === undefined) out[k] = y;
      else if (typeof x === 'number' && typeof y === 'number') out[k] = Math.max(x, y);
      else if (typeof x === 'boolean' || typeof y === 'boolean') out[k] = !!x || !!y;
      else if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) out[k] = mergeObj(x, y);
      else out[k] = y;
    }
    return out;
  }
  function merge(a, b) {
    a = Object.assign(blank(), a || {}); b = Object.assign(blank(), b || {});
    const out = blank();
    // words: newest review wins
    const ids = new Set([...Object.keys(a.words), ...Object.keys(b.words)]);
    for (const id of ids) {
      const x = a.words[id], y = b.words[id];
      if (!x) out.words[id] = y; else if (!y) out.words[id] = x;
      else out.words[id] = (y.lastReview || 0) > (x.lastReview || 0) ? y : x;
    }
    // quiz log: union by id
    const seen = new Map();
    for (const e of [...a.quizLog, ...b.quizLog]) if (e && e.id && !seen.has(e.id)) seen.set(e.id, e);
    out.quizLog = [...seen.values()].sort((p, q) => p.ts - q.ts).slice(-5000);
    out.days = mergeObj(a.days, b.days);
    out.units = mergeObj(a.units, b.units);
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    return out;
  }
  const api = { merge, blank };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ProgressMerge = api;
})(typeof self !== 'undefined' ? self : this);

'use strict';
/* 小步英语 — core: helpers, audio, progress, router. Views live in views.js, quiz.js, practice.js, drama.js */
const KEY = 'english-app-progress-v1';
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days until next review for box 1..5
const S = { c: null, m: {}, t: {}, p: null, slow: false, words: {}, theory: {}, cleanup: [] };
const app = document.getElementById('app');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function today(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); return today(new Date(y, m - 1, d + n)); }
function daysUntil(s) { const [y, m, d] = s.split('-').map(Number); const [a, b, c] = today().split('-').map(Number); return Math.round((new Date(y, m - 1, d) - new Date(a, b - 1, c)) / 864e5); }
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms); }

/* ---------------- audio ---------------- */
const player = new Audio(); player.preload = 'auto';
let playToken = 0, pendingResolve = null, rafId = 0;
const cleanText = t => String(t).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
function audioFile(text, voice) { const t = cleanText(text); return (voice && S.m[voice + '|' + t]) || S.m[t] || S.m[t.toLowerCase()] || null; }
function stopAudio() { playToken++; cancelAnimationFrame(rafId); if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r(); } try { player.pause(); } catch (e) {} if ('speechSynthesis' in window) speechSynthesis.cancel(); }
function tts(text, slow) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(cleanText(text)); u.lang = 'en-US'; u.rate = slow ? 0.6 : 0.9;
    const v = speechSynthesis.getVoices().find(v => /^en[-_]US/i.test(v.lang)); if (v) u.voice = v;
    const t = setTimeout(res, 9000); u.onend = u.onerror = () => { clearTimeout(t); res(); };
    speechSynthesis.speak(u);
  });
}
// speak(text, slow, {voice, onTick(seconds, marks)}) -> Promise resolved when finished/stopped
function speak(text, slow = S.slow, o = {}) {
  stopAudio(); const my = playToken;
  return new Promise(resolve => {
    pendingResolve = resolve;
    const done = () => { cancelAnimationFrame(rafId); if (pendingResolve === resolve) pendingResolve = null; resolve(); };
    const fallback = () => { if (my !== playToken) return done(); tts(text, slow).then(done); };
    const f = audioFile(text, o.voice);
    if (!f) return fallback();
    const name = f + (slow ? '-slow' : ''); const marks = S.t[name] || null;
    player.onended = done;
    player.onerror = () => { if (my === playToken) fallback(); };
    player.src = `audio/${name}.mp3`;
    const pr = player.play();
    if (o.onTick) { const loop = () => { if (my !== playToken) return; o.onTick(player.currentTime, marks); rafId = requestAnimationFrame(loop); }; rafId = requestAnimationFrame(loop); }
    if (pr && pr.catch) pr.catch(err => { if (my !== playToken) return; if (err && err.name === 'NotAllowedError') { toast('请再点一下 🔊 播放'); done(); } else fallback(); });
  });
}
// play a line with karaoke word highlighting inside element el (which contains .w spans)
function sing(el, text, slow, voice) {
  const spans = $$('.w', el); spans.forEach(s => s.classList.remove('sung'));
  const r = speak(text, slow, { voice, onTick(t, marks) {
    if (!marks || !marks.length) return;
    let k = -1; for (let i = 0; i < marks.length; i++) if (marks[i][0] <= t + 0.05) k = i;
    const lim = spans.length === marks.length ? k : Math.floor((k + 1) * spans.length / marks.length) - 1;
    spans.forEach((s, i) => s.classList.toggle('sung', i <= lim));
  } });
  return r.then(() => { spans.forEach(s => s.classList.add('sung')); });
}
const sayBtns = (text, opts = {}) => `<button class="say" data-say="${esc(text)}"${opts.voice ? ` data-voice="${esc(opts.voice)}"` : ''} aria-label="播放">🔊${opts.label ? ' ' + opts.label : ''}</button><button class="say slow" data-say="${esc(text)}" data-slow="1"${opts.voice ? ` data-voice="${esc(opts.voice)}"` : ''} aria-label="慢速播放">🐢</button>`;

/* ---------------- text helpers ---------------- */
function lookup(tok) {
  const t = tok.toLowerCase().replace(/[’]/g, "'");
  for (const id in S.words) { const w = S.words[id].w; if (w.en === t || (w.example.form || '').toLowerCase() === t) return { ...w, word: w.en === t ? w.en : tok, base: w.en !== t ? w.en : null }; }
  const g = S.c.glossary[t]; if (g) return { word: tok, zh: g.zh, ipa: g.ipa };
  for (const id in S.words) for (const r of (S.words[id].w.ety || {}).related || []) if (r.en.toLowerCase() === t) return { word: tok, zh: r.zh };
  return { word: tok, zh: '' };
}
function tokens(sentence, hl) {
  const H = (hl || '').toLowerCase();
  return esc(sentence).replace(/[A-Za-z][A-Za-z'’]*(?:&#39;[A-Za-z]+)?/g, m => { const raw = m.replace(/&#39;/g, "'"); return `<span class="w${H && raw.toLowerCase() === H ? ' hl' : ''}" data-w="${esc(raw)}">${m}</span>`; });
}
const CONTR = { "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "what's": 'what is', "isn't": 'is not', "aren't": 'are not', "don't": 'do not', "doesn't": 'does not' };
function words(s) { return String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean).flatMap(w => (CONTR[w] || w.replace(/^'+|'+$/g, '')).split(' ')).filter(Boolean); }
function lcsOps(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { ops.push(['eq', b[j]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['del', a[i++]]); else ops.push(['ins', b[j++]]); }
  while (i < n) ops.push(['del', a[i++]]); while (j < m) ops.push(['ins', b[j++]]);
  const out = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k], nx = ops[k + 1];
    if (nx && ((o[0] === 'del' && nx[0] === 'ins') || (o[0] === 'ins' && nx[0] === 'del'))) { out.push(['sub', o[0] === 'del' ? o[1] : nx[1], o[0] === 'ins' ? o[1] : nx[1]]); k++; }
    else out.push(o);
  }
  return { ops: out, match: L[0][0], total: m };
}
function diffHtml(user, target) {
  const r = lcsOps(words(user), words(target));
  const html = r.ops.map(o => o[0] === 'eq' ? `<span class="d-ok">${esc(o[1])}</span>` : o[0] === 'ins' ? `<span class="d-miss" title="漏了">${esc(o[1])}</span>` : o[0] === 'del' ? `<span class="d-extra" title="多写了">${esc(o[1])}</span>` : `<span class="d-bad">${esc(o[1])}</span>→<span class="d-fix">${esc(o[2])}</span>`).join(' ');
  return { html: `<div class="sent en">${html || '（空）'}</div><div class="legend"><span class="d-ok">绿色</span>=对 · <span class="d-miss">黄底</span>=漏了 · <span class="d-extra">划线</span>=写错/多写 · <span class="d-fix">→绿色</span>=正确写法</div>`, ...r };
}
const sameAnswer = (a, b) => words(a).join(' ') === words(b).join(' ');

/* ---------------- progress ---------------- */
function loadLocal() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
function save() { S.p.updatedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S.p)); } catch (e) {} clearTimeout(save.t); save.t = setTimeout(push, 700); }
/* API base: same origin on the box; on GitHub Pages, discover the box's current tunnel from tunnel.json */
const ON_PAGES = /\.github\.io$/.test(location.hostname);
let API_BASE = ON_PAGES ? null : '';
function syncLink() { return API_BASE ? API_BASE + '#import=' + encodeURIComponent(JSON.stringify(S.p)) : ''; }
async function apiBase() {
  if (API_BASE !== null) return API_BASE;
  try { const j = await fetch('tunnel.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()); API_BASE = j.url ? j.url.replace(/\/$/, '') + '/' : ''; } catch (e) { API_BASE = ''; }
  return API_BASE;
}
async function api(path, opts = {}) {
  const b = await apiBase();
  if (ON_PAGES && !b) throw new Error('no tunnel');
  return fetch(b + path, { ...opts, headers: { ...(opts.headers || {}), ...(b ? { 'X-Pinggy-No-Screen': '1' } : {}) } });
}
async function push() {
  try {
    const r = await api('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S.p), keepalive: true });
    if (!r.ok) throw new Error(r.status);
    S.p = ProgressMerge.merge(S.p, await r.json()); localStorage.setItem(KEY, JSON.stringify(S.p)); S.synced = true;
  } catch (e) { S.synced = false; }
}
function bump(field, n = 1) { const d = S.p.days[today()] = S.p.days[today()] || {}; d[field] = (d[field] || 0) + n; }
function unitP(id) { return S.p.units[id] = S.p.units[id] || {}; }
function learnWord(id) { if (!S.p.words[id]) { S.p.words[id] = { box: 1, due: addDays(today(), 1), learnedAt: Date.now(), lastReview: Date.now(), right: 0, wrong: 0 }; bump('learned'); return true; } return false; }
function reviewWord(id, ok) {
  learnWord(id); const w = S.p.words[id];
  w.box = ok ? Math.min((w.box || 1) + 1, 5) : 1; w.due = addDays(today(), INTERVALS[w.box]);
  w.lastReview = Date.now(); if (ok) w.right = (w.right || 0) + 1; else w.wrong = (w.wrong || 0) + 1;
  bump('reviews'); return INTERVALS[w.box];
}
function logQ(e) { S.p.quizLog.push({ id: uid(), ts: Date.now(), date: today(), ...e }); bump('answers'); if (e.ok) bump('correct'); }
function dueList() { const t = today(); return Object.keys(S.p.words).filter(id => S.words[id] && S.p.words[id].due <= t); }
function streak() {
  const days = new Set(Object.keys(S.p.days).filter(d => Object.values(S.p.days[d]).some(v => v > 0)));
  let d = days.has(today()) ? today() : addDays(today(), -1), n = 0; while (days.has(d)) { n++; d = addDays(d, -1); }
  return { n, total: days.size };
}
const MODE_ORDER = ['words', 'grammar', 'story', 'skit', 'quiz', 'shadow', 'dictation'];
function modeDone(u, m) {
  const p = unitP(u.id);
  if (m === 'shadow') return Object.keys(p.shadow || {}).length >= Math.min(3, u.shadow.length);
  if (m === 'dictation') return Object.keys(p.dictation || {}).length >= Math.min(3, u.dictation.length);
  if (m === 'quiz') return (p.quizBest || 0) > 0;
  return !!p[m];
}
function voiceOf(speaker) { return S.c.voices[speaker] || S.c.voices.default; }

/* ---------------- theory notes ---------------- */
function whyNote(mode) {
  const md = S.c.modes[mode], th = S.theory[md.theory];
  const src = th.sources.map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.label)}">X 原帖${th.sources.length > 1 ? i + 1 : ''} ↗</a>`).join(' · ');
  return `<div class="why"><b>为什么这样学</b>（<a href="#/theories/${th.id}">理论 ${th.n}：${esc(th.name)}</a>）：${esc(md.why)} ${src}</div>`;
}

/* ---------------- router ---------------- */
function setHeader(title, back) {
  $('#title').textContent = title;
  const b = $('#back'); if (back) { b.href = back; b.classList.remove('hide'); } else b.classList.add('hide');
}
function route() {
  stopAudio(); S.cleanup.forEach(f => { try { f(); } catch (e) {} }); S.cleanup = []; closeSheet();
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (!parts.length) return viewHome();
  if (parts[0] === 'theories') return viewTheories(parts[1]);
  if (parts[0] === 'review') return viewReview(parts[1] === 'free');
  if (parts[0] === 'roots') return viewRoots();
  if (parts[0] === 'u') {
    const u = S.c.units.find(x => x.id === parts[1]); if (!u) return viewHome();
    const v = { words: viewWords, grammar: viewGrammar, story: viewStory, skit: viewSkit, quiz: viewQuiz, shadow: viewShadow, dictation: viewDictation }[parts[2]];
    return v ? v(u, parts[3]) : viewUnit(u);
  }
  viewHome();
}

/* ---------------- word sheet & global clicks ---------------- */
function openWordSheet(tok) {
  const info = lookup(tok); const sh = $('#sheet');
  sh.innerHTML = `<button class="x" aria-label="关闭">✕</button>
    <div class="row">${info.emoji ? `<span class="emoji" style="font-size:54px">${info.emoji}</span>` : ''}<div><div class="sw en">${esc(info.word)}</div><div class="ipa">${esc(info.ipa || '')}${info.sound ? ' · 读音像「' + esc(info.sound) + '」' : ''}</div></div></div>
    <div class="zh-big" style="margin:6px 0">${esc(info.zh || '（这个词暂时没有中文释义）')}${info.base ? `<span class="mute small">（原形 ${esc(info.base)}）</span>` : ''}</div>
    ${info.example ? `<div class="zh small">例：<span class="en">${esc(info.example.en)}</span> ${esc(info.example.zh)}</div>` : ''}
    <div class="row" style="margin-top:8px">${sayBtns(info.word)}</div>`;
  sh.classList.remove('hidden'); speak(info.word);
}
function closeSheet() { $('#sheet').classList.add('hidden'); $$('.w.active').forEach(x => x.classList.remove('active')); }
document.addEventListener('click', e => {
  const s = e.target.closest('[data-say]');
  if (s) { e.preventDefault(); speak(s.dataset.say, !!s.dataset.slow, { voice: s.dataset.voice }); return; }
  const w = e.target.closest('.w');
  if (w && !w.closest('.nowordtap')) { $$('.w.active').forEach(x => x.classList.remove('active')); w.classList.add('active'); openWordSheet(w.dataset.w); return; }
  if (e.target.closest('.sheet .x') || (!e.target.closest('.sheet') && !$('#sheet').classList.contains('hidden'))) closeSheet();
});
window.addEventListener('hashchange', route);
window.addEventListener('pageshow', e => { if (e.persisted) route(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.p) push(); });

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const [c, m, t] = await Promise.all([fetch('content.json').then(r => r.json()), fetch('audio/manifest.json').then(r => r.json()).catch(() => ({})), fetch('audio/timings.json').then(r => r.json()).catch(() => ({}))]);
    S.c = c; S.m = m; S.t = t;
    c.units.forEach(u => u.words.forEach(w => { S.words[w.id] = { w, unit: u }; }));
    c.theories.forEach(th => { S.theory[th.id] = th; });
  } catch (e) { app.innerHTML = '<div class="loading">内容加载失败，请刷新页面重试。</div>'; return; }
  S.p = ProgressMerge.merge(ProgressMerge.blank(), loadLocal());
  // Pages -> box bridge: the Pages site opens <tunnel>/#import=<state>; merge it here (same origin as the API) and push.
  if (location.hash.startsWith('#import=')) {
    try { S.p = ProgressMerge.merge(S.p, JSON.parse(decodeURIComponent(location.hash.slice(8)))); S.imported = true; } catch (e) {}
    history.replaceState(null, '', location.pathname + '#/');
  }
  try { const r = await api('api/state', { cache: 'no-store' }); if (r.ok) { S.p = ProgressMerge.merge(S.p, await r.json()); S.synced = true; } } catch (e) { S.synced = false; }
  try { localStorage.setItem(KEY, JSON.stringify(S.p)); } catch (e) {}
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  route(); push();
}

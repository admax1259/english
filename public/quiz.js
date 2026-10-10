'use strict';
/* question engine used by 练习 (quiz) and 今日复习 (review) */
const WORD_TYPES = ['pic2word', 'listen2pic', 'pic2type', 'cloze'];
function distractors(id, n) {
  const u = S.words[id].unit, same = u.words.map(w => w.id).filter(x => x !== id), other = Object.keys(S.words).filter(x => x !== id && !same.includes(x));
  return [...shuffle(same), ...shuffle(other)].slice(0, n);
}
function capLike(ref, s) { return /^[A-Z]/.test(ref) ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function makeWordQ(id, type) {
  const { w, unit } = S.words[id];
  const q = { type, wordId: id, unit: unit.id, w };
  if (type === 'pic2word') { q.answer = w.en; q.options = shuffle([w.en, ...distractors(id, 3).map(x => S.words[x].w.en)]); q.prompt = `看图选单词：${w.emoji}`; }
  if (type === 'listen2pic') { q.answer = id; q.options = shuffle([id, ...distractors(id, 3)]); q.prompt = `听音选图：${w.en}`; }
  if (type === 'pic2type') { q.answer = w.en; q.prompt = `看图写单词：${w.emoji} ${w.zh}`; }
  if (type === 'cloze') {
    const form = w.example.form || w.en;
    q.answer = form; q.sentence = w.example.en.replace(new RegExp('\\b' + form + '\\b'), '___');
    q.options = shuffle([form, ...distractors(id, 3).map(x => capLike(form, S.words[x].w.example.form || S.words[x].w.en))]);
    q.prompt = `句子填空：${q.sentence}`;
  }
  return q;
}
// root questions: "student 里的 stud- 是什么意思？"
function rootParts() { const out = []; for (const id in S.words) { const w = S.words[id].w; (w.ety && w.ety.parts || []).forEach(p => out.push({ id, w, p })); } return out; }
function makeRootQ(id) {
  const { w, unit } = S.words[id]; const parts = (w.ety && w.ety.parts) || []; if (!parts.length) return null;
  const p = parts[0]; const others = shuffle([...new Set(rootParts().filter(x => x.p.meaning !== p.meaning && x.w.ety.family !== w.ety.family).map(x => x.p.meaning))]).slice(0, 3);
  return { type: 'root', wordId: id, unit: unit.id, w, part: p, answer: p.meaning, options: shuffle([p.meaning, ...others]), prompt: `${w.en} 里的 ${p.part} 是什么意思？` };
}
function unitQuestions(u) {
  const types = shuffle(WORD_TYPES);
  const wq = u.words.map((w, k) => makeWordQ(w.id, types[k % types.length]));
  const rq = shuffle(u.words.map(w => makeRootQ(w.id)).filter(Boolean)).slice(0, 2);
  const fq = u.fill.map(f => ({ type: 'fill', unit: u.id, ...f, prompt: f.q }));
  const tq = u.translate.map(t => ({ type: 'translate', unit: u.id, ...t, answer: t.answers[0], prompt: t.zh }));
  return [...shuffle(wq), ...rq, ...shuffle(fq), ...shuffle(tq)];
}
function charDiff(user, right) {
  const r = lcsOps(user.toLowerCase().split(''), right.toLowerCase().split(''));
  return r.ops.map(o => o[0] === 'eq' ? `<span class="d-ok">${esc(o[1])}</span>` : o[0] === 'ins' ? `<span class="d-miss">${esc(o[1])}</span>` : o[0] === 'del' ? `<span class="d-extra">${esc(o[1])}</span>` : `<span class="d-bad">${esc(o[1])}</span><span class="d-fix">${esc(o[2])}</span>`).join('');
}
const optBtns = (opts, cls = 'opt en', label = o => esc(o)) => opts.map(o => `<button class="${cls}" data-a="${esc(o)}">${label(o)}</button>`).join('');

function runSession(opts) {
  const queue = opts.questions.slice(); const total = queue.length;
  let idx = 0, firstRight = 0, answered = 0; const mistakes = [];
  const render = () => {
    if (idx >= queue.length) return finish();
    const q = queue[idx], w = q.w;
    let body = '';
    if (q.type === 'pic2word') body = `<div class="qpic">${w.emoji}</div><div class="qtext">这个图是哪个英语单词？</div><div class="opts">${optBtns(q.options)}</div>`;
    if (q.type === 'listen2pic') body = `<div class="center"><button class="btn big" id="replay" style="max-width:300px">🔊 再听一次</button> <button class="say slow" data-say="${esc(w.en)}" data-slow="1">🐢</button></div><div class="qtext">听一听，选出对应的图</div><div class="opts">${optBtns(q.options, 'opt pic-opt', o => S.words[o].w.emoji)}</div>`;
    if (q.type === 'pic2type') body = `<div class="qpic">${w.emoji}</div><div class="qtext">「${esc(w.zh)}」用英语怎么写？</div><input class="txt en" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(w.en[0])}…（${w.en.length} 个字母）"><div class="navrow"><button class="btn gray" id="hearIt">🔊 听发音提示</button><button class="btn" id="check">检查</button></div>`;
    if (q.type === 'cloze') body = `<div class="qtext">选词填空（看中文意思）</div><div class="example"><div class="sent en">${esc(q.sentence).replace('___', '<span class="blank">?</span>')}</div><div class="zh">${esc(w.example.zh)}</div></div><div class="opts" style="margin-top:12px">${optBtns(q.options)}</div>`;
    if (q.type === 'root') body = `<div class="qpic" style="font-size:80px">${w.emoji}</div><div class="qtext">🌱 词根回忆：<span class="en">${esc(w.en)}</span> 里的 <b class="en">${esc(q.part.part)}</b> 是什么意思？</div><div class="opts">${optBtns(q.options, 'opt')}</div>`;
    if (q.type === 'fill') body = `<div class="qtext">选择正确的词填空</div><div class="example"><div class="sent en">${esc(q.q).replace('___', '<span class="blank">?</span>')}</div><div class="zh">${esc(q.zh)}</div></div><div class="opts" style="margin-top:12px;grid-template-columns:repeat(${q.options.length},1fr)">${optBtns(q.options)}</div>`;
    if (q.type === 'translate') body = `<div class="qtext">把这句中文翻译成英语</div><div class="center zh-big" style="margin-bottom:10px">${esc(q.zh)}</div><textarea class="txt en" id="ans" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="在这里输入英文…"></textarea><div id="hintBox"></div><div class="navrow"><button class="btn gray" id="hint">💡 提示</button><button class="btn" id="check">检查</button></div>`;
    app.innerHTML = `${whyNote(opts.mode)}
      <div class="row" style="justify-content:space-between"><span class="mute">${esc(opts.title)} · 第 ${idx + 1} / ${queue.length} 题${q.retry ? ' · 错题再练' : ''}</span><span class="mute">✅ ${firstRight}</span></div>
      <div class="progress"><i style="width:${Math.min(answered, total) / total * 100}%"></i></div>
      <div class="card" id="qcard" data-type="${q.type}">${body}<div id="fb"></div></div>`;
    if (q.type === 'listen2pic') { $('#replay').onclick = () => speak(w.en); speak(w.en); }
    if (q.type === 'pic2type') $('#hearIt').onclick = () => speak(w.en);
    if (q.type === 'translate') $('#hint').onclick = () => { $('#hintBox').innerHTML = `<div class="hint">💡 ${esc(q.hint)}</div>`; };
    $$('.opt', app).forEach(b => b.onclick = () => answer(q, b.dataset.a, b));
    const inp = $('#ans');
    if (inp) {
      $('#check').onclick = () => { if (!inp.value.trim()) { toast('先写下你的答案再检查（主动回忆）'); return; } answer(q, inp.value); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const c = $('#check'); if (c) c.click(); } });
      if (window.matchMedia('(pointer:fine)').matches) inp.focus();
    }
  };
  const answer = (q, ans, btn) => {
    if (q.done) return; q.done = true;
    let ok;
    if (q.type === 'pic2type') ok = ans.trim().toLowerCase() === q.answer.toLowerCase();
    else if (q.type === 'translate') ok = q.answers.some(a => sameAnswer(ans, a));
    else ok = ans === q.answer;
    const first = !q.retry; if (first) answered++;
    if (first && ok) firstRight++;
    if (!ok && first) mistakes.push(q);
    $$('.opt', app).forEach(b => { b.disabled = true; if (b.dataset.a === q.answer) b.classList.add('right'); });
    if (btn && !ok) btn.classList.add('wrong');
    ['check', 'hint', 'hearIt'].forEach(id => { const el = $('#' + id); if (el) el.remove(); });
    const inp = $('#ans'); if (inp) inp.readOnly = true;
    const w = q.w; let msg = '', sayText = '';
    if (q.type === 'root') {
      msg = `${ok ? '' : `正确答案是「${esc(q.answer)}」。`}<b class="en">${esc(q.part.part)}</b> = ${esc(q.part.meaning)}。${esc(w.ety.origin)}${w.ety.related.length ? `<div class="related" style="margin-top:8px">${w.ety.related.map(r => `<button class="say rel" data-say="${esc(r.en)}">🔊 <b class="en">${esc(r.en)}</b> <span class="zh">${esc(r.zh)}</span></button>`).join('')}</div>` : ''}`;
      sayText = w.en;
    } else if (w) {
      const ex = `<div class="example"><div class="sent en">${tokens(w.example.en, w.example.form)}</div><div class="zh">${esc(w.example.zh)}</div><div class="row" style="margin-top:4px">${sayBtns(w.example.en)}</div></div>`;
      let yours = '';
      if (!ok) {
        if (q.type === 'listen2pic') yours = `你选的是 ${S.words[ans].w.emoji}（${esc(S.words[ans].w.en)} = ${esc(S.words[ans].w.zh)}）。`;
        else if (q.type === 'pic2type') yours = `你写的：<span class="en">${charDiff(ans.trim(), w.en)}</span>（<span class="d-miss">黄底</span>是漏掉的字母，<span class="d-extra">划线</span>是写错的）。`;
        else { const o = Object.values(S.words).find(x => x.w.en === ans.toLowerCase() || (x.w.example.form || '').toLowerCase() === ans.toLowerCase()); if (o) yours = `你选的 ${esc(ans)} 意思是「${esc(o.w.zh)}」。`; }
      }
      const core = `<b class="en">${esc(q.type === 'cloze' ? q.answer : w.en)}</b> = ${esc(w.zh)}`;
      msg = ok ? `${core}${q.type === 'cloze' ? `。这句的意思是「${esc(w.example.zh)}」。` : ''}` : `正确答案是 ${core}。${yours}${q.type === 'cloze' ? `这句的意思是「${esc(w.example.zh)}」，所以要填 ${esc(q.answer)}。` : ''}`;
      msg += ex; sayText = q.type === 'cloze' ? w.example.en : w.en;
    } else if (q.type === 'fill') {
      const full = cleanText(q.q.replace('___', q.answer));
      msg = `${ok ? '' : `正确答案是 <b class="en">${esc(q.answer)}</b>。`}${esc(q.why)}<div class="example"><div class="sent en">${tokens(full)}</div><div class="zh">${esc(q.zh)}</div><div class="row" style="margin-top:4px">${sayBtns(full)}</div></div>`;
      sayText = full;
    } else if (q.type === 'translate') {
      const best = q.answers.slice().sort((a, b) => lcsOps(words(ans), words(b)).match - lcsOps(words(ans), words(a)).match)[0];
      msg = ok ? `${esc(q.why)}<div class="example"><div class="sent en">${tokens(q.answers[0])}</div><div class="row" style="margin-top:4px">${sayBtns(q.answers[0])}</div></div>`
        : `参考答案：<b class="en">${esc(best)}</b><div class="example"><div class="mute small">和你的答案对比：</div>${diffHtml(ans, best).html}</div><p style="margin:8px 0 0">📌 ${esc(q.why)}</p><div class="row" style="margin-top:6px">${sayBtns(best)}</div>`;
      sayText = ok ? q.answers[0] : best;
    }
    const extra = opts.onAnswer ? (opts.onAnswer(q, ok, ans, first) || '') : '';
    const willRequeue = !ok && first && opts.requeue !== false;
    $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><div class="t">${ok ? '✅ 答对了！' : '❌ 不对，没关系，看看为什么'}</div><div>${msg}</div>${extra ? `<p class="mute" style="margin:8px 0 0">${extra}</p>` : ''}${willRequeue ? '<p class="mute" style="margin:6px 0 0">这题最后会换个方式再考你一次。</p>' : ''}</div>
      <div class="navrow"><button class="btn big" id="nextQ">${idx + 1 < queue.length || willRequeue ? '下一题 →' : '看结果 →'}</button></div>`;
    if (willRequeue) {
      const again = q.wordId && q.type !== 'root' ? makeWordQ(q.wordId, WORD_TYPES.filter(t => t !== q.type)[Math.random() * 3 | 0]) : { ...q };
      delete again.done; again.retry = true; queue.push(again);
    }
    save();
    if (sayText) speak(sayText);
    $('#nextQ').onclick = () => { idx++; render(); };
    $('#nextQ').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const finish = () => {
    const pct = Math.round(firstRight / total * 100);
    const extra = opts.onFinish ? opts.onFinish({ pct, firstRight, total, mistakes }) || '' : '';
    app.innerHTML = `${whyNote(opts.mode)}<div class="card center" id="result"><div class="emoji" style="font-size:70px">${pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}</div>
      <h2>${esc(opts.title)}完成！</h2><p style="font-size:22px"><b>${firstRight} / ${total}</b> 第一次就答对（${pct}%）</p>
      ${mistakes.length ? `<div style="text-align:left"><h3>这次的错题（已经再练过一次）：</h3><ul>${mistakes.map(q => `<li>${esc(q.prompt)} → <b class="en">${esc(q.type === 'listen2pic' ? q.w.en : q.answer)}</b></li>`).join('')}</ul></div>` : '<p>全部答对，太厉害了！</p>'}
      ${extra}
      <div class="navrow"><button class="btn ghost" id="again">再练一次</button><a class="btn" href="${opts.back}">返回</a></div></div>`;
    $('#again').onclick = () => route();
  };
  render();
}

function viewQuiz(u) {
  setHeader('练习', '#/u/' + u.id);
  runSession({
    mode: 'quiz', title: '本课练习', back: '#/u/' + u.id, questions: unitQuestions(u),
    onAnswer(q, ok, ans, first) {
      if (!first) return '';
      logQ({ unit: u.id, mode: 'quiz', type: q.type, item: q.wordId || q.prompt, prompt: q.prompt, answer: ans, expected: q.type === 'listen2pic' ? q.w.en : q.answer, ok });
      if (q.wordId && q.type !== 'root') {
        if (!S.p.words[q.wordId]) { learnWord(q.wordId); if (!ok) S.p.words[q.wordId].wrong = 1; return '这个词已加入复习队列，明天会再考你。'; }
        if (!ok) { reviewWord(q.wordId, false); return '这个词的复习已重置：明天再复习一次。'; }
      }
      return '';
    },
    onFinish({ pct }) { const p = unitP(u.id); p.quizBest = Math.max(p.quizBest || 0, pct || 1); bump('quizzes'); save(); return `<p class="mute">下一步：<a href="#/u/${u.id}/shadow">跟读练习 →</a></p>`; },
  });
}

function viewReview(free) {
  setHeader(free ? '自由练习' : '今日复习', '#/');
  const learnedIds = Object.keys(S.p.words).filter(id => S.words[id]);
  const due = free ? shuffle(learnedIds).slice(0, 12) : shuffle(dueList());
  if (!due.length) {
    const upcoming = {};
    learnedIds.forEach(id => { const d = S.p.words[id].due; upcoming[d] = (upcoming[d] || 0) + 1; });
    const list = Object.keys(upcoming).sort().slice(0, 6);
    app.innerHTML = `${whyNote('review')}<div class="card center"><div class="emoji" style="font-size:64px">${learnedIds.length ? '🎉' : '🌱'}</div>
      <h2>${learnedIds.length ? '今天没有要复习的了！' : '还没有学过的单词'}</h2>
      ${list.length ? `<p>接下来的复习安排：</p><p>${list.map(d => `<span class="pill">${daysUntil(d) <= 1 ? '明天' : daysUntil(d) + ' 天后'}：${upcoming[d]} 个</span>`).join('')}</p>` : '<p>先去第 1 课学单词吧。</p>'}
      <div class="navrow">${learnedIds.length ? '<a class="btn ghost" href="#/review/free">自由练习已学单词</a>' : ''}<a class="btn" href="#/">回首页</a></div></div>`;
    return;
  }
  runSession({
    mode: 'review', title: free ? '自由练习' : '今日复习', back: '#/', questions: due.map(id => makeWordQ(id, WORD_TYPES[Math.random() * 4 | 0])),
    onAnswer(q, ok, ans, first) {
      if (!first) return '';
      logQ({ unit: q.unit, mode: free ? 'practice' : 'review', type: q.type, item: q.wordId, prompt: q.prompt, answer: ans, expected: q.type === 'listen2pic' ? q.w.en : q.answer, ok });
      if (free) return '';
      const d = reviewWord(q.wordId, ok);
      return ok ? `🗓️ 记住了！下次复习：${d} 天后（${addDays(today(), d)}）。` : '🗓️ 重置：明天再复习；这一轮结束前还会再问你一次。';
    },
    onFinish() { if (!free) bump('reviewSessions'); save(); return ''; },
  });
}

'use strict';
/* views: home, theories, unit, words (+词根词源), grammar, story, roots */
function viewHome() {
  setHeader('小步英语', null);
  const due = dueList().length, st = streak(), learned = Object.keys(S.p.words).length;
  const tomorrow = Object.values(S.p.words).filter(w => w.due === addDays(today(), 1)).length;
  const next = S.c.units.find(u => MODE_ORDER.some(m => !modeDone(u, m))) || S.c.units[0];
  app.innerHTML = `
  <div class="stats">
    <div class="stat"><b>🔥 ${st.n}</b><span>连续学习天数</span></div>
    <div class="stat"><b>📚 ${learned}</b><span>已学单词</span></div>
    <div class="stat"><b>📅 ${st.total}</b><span>累计学习天数</span></div>
  </div>
  <div class="card review-card">
    <div class="mute">🔁 遗忘曲线 + 间隔重复</div>
    <div class="big-n" id="dueN">今天要复习 ${due} 个</div>
    <p class="mute" style="margin:4px 0 12px">${due ? '趁快要忘记的时候复习，记得最牢。' : learned ? `今天的复习完成了！明天要复习 ${tomorrow} 个。` : '先去学几个新单词，明天这里就会提醒你复习。'}</p>
    ${due ? `<a class="btn big" href="#/review" id="startReview">开始复习 →</a>` : `<a class="btn big" href="#/u/${next.id}">${learned ? '继续学新内容' : '开始第 1 课'} →</a>`}
  </div>
  <div class="card">
    <h2>课程骨架：5 条学习理论</h2>
    <p class="mute" style="margin-top:-4px">每一个练习都对应下面的一条方法（来自 X 上的讨论），点开看解释和原帖。</p>
    <div class="theory-strip">${S.c.theories.map(t => `<a class="tcard" href="#/theories/${t.id}"><div class="ti emoji">${t.icon}</div><div><b>${t.n}. ${esc(t.name)}</b><span>${esc(t.short)}</span></div></a>`).join('')}</div>
  </div>
  <h2>课程</h2>
  ${S.c.units.map((u, i) => {
    const done = MODE_ORDER.filter(m => modeDone(u, m)).length;
    return `<a class="card unit" href="#/u/${u.id}"><div class="ue emoji">${u.emoji}</div><div class="ut"><b>第 ${i + 1} 课 · ${esc(u.title)}</b><span class="mute">${esc(u.subtitle)} · ${u.words.length} 个单词</span><div class="dots">${MODE_ORDER.map(m => `<i class="dot${modeDone(u, m) ? ' on' : ''}"></i>`).join('')}</div></div><div class="mute">${done}/${MODE_ORDER.length} ›</div></a>`;
  }).join('')}
  <a class="card unit" href="#/roots"><div class="ue emoji">🌳</div><div class="ut"><b>词根家族</b><span class="mute">把学过的单词按词根、词源串起来</span></div><div class="mute">›</div></a>
  <div class="footer">进度会自动保存在这台设备和服务器上，换手机 / 电脑也能接着学。${S.synced === false ? '（暂时没连上服务器，已存在本机）' : ''}${ON_PAGES && S.synced === false && API_BASE ? `<br><a href="${syncLink()}" target="_blank" rel="noopener">同步进度到服务器</a>（会先出现 Pinggy 提示页，点 Enter site）` : ''}${S.imported ? '<br>已从网页版导入进度 ✅' : ''}<br><a href="${(typeof API_BASE === 'string' ? API_BASE : '')}api/progress" target="_blank">学习记录（JSON）</a></div>`;
}

function viewTheories(focus) {
  setHeader('学习理论', '#/');
  const modeName = m => S.c.modes[m].icon + ' ' + S.c.modes[m].name;
  app.innerHTML = `
  <div class="card"><h2>这门课为什么这样设计？</h2>
  <p>这 5 条方法是 X（推特）上中英文讨论里被提到最多的英语学习理论，是这门课的骨架。网站里每个练习都至少用到其中一条；每个页面顶上的「为什么这样学」会告诉你用的是哪一条，并附上 X 原帖链接。</p></div>
  ${S.c.theories.map(t => `
  <div class="card theory" id="t-${t.id}">
    <h3><span class="emoji">${t.icon}</span> 理论 ${t.n}：${esc(t.name)} <span class="mute">${esc(t.en)}</span></h3>
    <p><b>一句话：</b>${esc(t.short)}</p>
    <ul>${t.detail.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
    <p><b>在本网站里：</b>${esc(t.inApp)}</p>
    <div>${Object.keys(S.c.modes).filter(m => S.c.modes[m].theory === t.id || t.modes.includes(m)).map(m => `<span class="pill">${modeName(m)}</span>`).join('')}</div>
    <p style="margin-bottom:0"><b>来源（X 帖子）：</b>${t.sources.map(s => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">↗ ${esc(s.label)}</a>`).join('')}</p>
  </div>`).join('')}`;
  if (focus) { const el = $('#t-' + focus); if (el) setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.style.boxShadow = '0 0 0 3px var(--blue)'; }, 50); }
}

function viewUnit(u) {
  const i = S.c.units.indexOf(u);
  setHeader(`第 ${i + 1} 课`, '#/');
  app.innerHTML = `
  <div class="card"><div class="row"><span class="emoji" style="font-size:46px">${u.emoji}</span><div><h2 style="margin:0">${esc(u.title)}</h2><div class="mute">${esc(u.subtitle)}</div></div></div>
  <p class="mnemonic" style="margin-bottom:0">📝 口诀：${esc(u.mnemonic)}</p></div>
  <p class="mute">建议按顺序学：单词 → 语法 → 小故事 → 发音小短剧 → 练习 → 跟读 → 听写。</p>
  <div class="modes">${MODE_ORDER.map((m, k) => { const md = S.c.modes[m], th = S.theory[md.theory]; return `<a class="mode" href="#/u/${u.id}/${m}">${modeDone(u, m) ? '<span class="done">✓</span>' : ''}<div class="mi emoji">${md.icon}</div><b>${k + 1}. ${md.name}</b><span class="tag">${th.icon} ${esc(th.name)}</span></a>`; }).join('')}
  <a class="mode" href="#/roots"><div class="mi emoji">🌳</div><b>词根家族</b><span class="tag">🧩 在语境里记单词</span></a></div>
  <div class="card" style="margin-top:14px"><h3>本课单词</h3><div class="row">${u.words.map(w => `<button class="say" data-say="${esc(w.en)}"><span class="emoji">${w.emoji}</span> ${esc(w.en)}</button>`).join('')}</div></div>`;
}

function etyHtml(w) {
  const e = w.ety; if (!e) return '';
  return `<div class="ety"><div class="ety-h">🌱 词根词源</div>
    <p>${esc(e.origin)}</p>
    ${e.parts.length ? `<div class="parts">${e.parts.map(p => `<span class="part"><b class="en">${esc(p.part)}</b> = ${esc(p.meaning)}</span>`).join('')}</div>` : ''}
    ${e.story ? `<p class="story">💡 ${esc(e.story)}</p>` : ''}
    ${e.related.length ? `<div class="mute small">${e.parts.length ? '同一家族的词' : '相关的词'}：</div><div class="related">${e.related.map(r => `<button class="say rel" data-say="${esc(r.en)}">🔊 <b class="en">${esc(r.en)}</b> <span class="zh">${esc(r.zh)}</span></button>`).join('')}</div>` : ''}
  </div>`;
}

function viewWords(u) {
  setHeader('学单词', '#/u/' + u.id);
  let i = 0;
  const render = (auto) => {
    const w = u.words[i];
    app.innerHTML = `${whyNote('words')}
    <div class="progress"><i style="width:${i / u.words.length * 100}%"></i></div>
    <div class="card wordcard">
      <div class="mute">${i + 1} / ${u.words.length}</div>
      <div class="emoji">${w.emoji}</div>
      <div class="word en">${esc(w.en)}</div>
      <div class="ipa">${esc(w.ipa)} · 读音像「${esc(w.sound)}」</div>
      <div class="zh-big">${esc(w.zh)}</div>
      <div class="row" style="justify-content:center;margin-top:8px">${sayBtns(w.en)}</div>
      <div class="example">
        <div class="mute small">例句（点单词看意思）</div>
        <div class="sent en">${tokens(w.example.en, w.example.form)}</div>
        <div class="zh">${esc(w.example.zh)}</div>
        <div class="row" style="margin-top:6px">${sayBtns(w.example.en)}</div>
      </div>
      ${etyHtml(w)}
      <div class="navrow"><button class="btn gray" id="prev" ${i === 0 ? 'disabled' : ''}>← 上一个</button><button class="btn green" id="next">记住了 →</button></div>
    </div>`;
    $('#prev').onclick = () => { i--; render(true); };
    $('#next').onclick = () => { learnWord(w.id); save(); if (++i < u.words.length) render(true); else finish(); };
    if (auto) speak(w.en);
  };
  const finish = () => {
    unitP(u.id).words = true; bump('studied'); save();
    app.innerHTML = `${whyNote('words')}<div class="card center"><div style="font-size:70px" class="emoji">🎉</div><h2>太棒了！${u.words.length} 个单词学完了</h2>
    <p>它们已经进入<b>复习队列</b>：明天首页会提醒你复习，之后在第 3、7、14 天再复习。</p>
    <div class="navrow"><button class="btn ghost" id="again">再看一遍</button><a class="btn" href="#/u/${u.id}/grammar">下一步：语法 →</a></div></div>`;
    $('#again').onclick = () => { i = 0; render(false); };
  };
  render(false);
}

function viewGrammar(u) {
  setHeader('语法', '#/u/' + u.id);
  const g = u.grammar;
  app.innerHTML = `${whyNote('grammar')}
  <div class="card"><h2>${esc(g.title)}</h2><p>${esc(g.intro)}</p><p class="mnemonic">📝 口诀：${esc(u.mnemonic)}</p></div>
  ${g.points.map((p, k) => `<div class="card"><h3>${k + 1}. ${esc(p.rule)}</h3>${p.examples.map(e => `<div class="example" style="margin-top:8px"><div class="sent en">${tokens(e.en)}</div><div class="zh">${esc(e.zh)}</div><div class="row" style="margin-top:4px">${sayBtns(e.en)}</div></div>`).join('')}</div>`).join('')}
  <div class="navrow"><a class="btn ghost" href="#/u/${u.id}/words">← 单词</a><a class="btn" href="#/u/${u.id}/story">下一步：小故事 →</a></div>`;
  unitP(u.id).grammar = true; bump('studied'); save();
}

function lineHtml(l, k, extra = '') {
  const sp = S.c.speakers[l.speaker] || { name: l.speaker, avatar: '🙂' };
  return `<div class="line" data-k="${k}"><div class="avatar">${sp.avatar}<small>${esc(sp.name)}</small></div>
    <div class="bubble" data-k="${k}"><div class="sent en">${tokens(l.en)}</div><div class="zh">${esc(l.zh)}</div>
    <div class="tools"><button class="say" data-line="${k}" aria-label="播放">🔊</button><button class="say slow" data-line="${k}" data-lslow="1" aria-label="慢速">🐢</button><button class="ztoggle" data-zh="${k}">中文</button>${extra}</div></div></div>`;
}
// wires up a list of dialogue lines: tap bubble => Chinese, 🔊 => karaoke play, play-all
function wireLines(lines, opts = {}) {
  const bubbles = $$('.bubble');
  bubbles.forEach(b => b.addEventListener('click', e => {
    const lb = e.target.closest('[data-line]');
    if (lb) { e.stopPropagation(); const k = +lb.dataset.line; playLine(k, !!lb.dataset.lslow); return; }
    if (e.target.closest('.w,.say,button:not(.ztoggle)')) return;
    b.classList.toggle('showzh');
  }));
  const playLine = async (k, slow) => {
    bubbles.forEach(b => b.classList.remove('playing')); bubbles[k].classList.add('playing');
    await sing(bubbles[k], lines[k].en, slow, voiceOf(lines[k].speaker));
    bubbles[k].classList.remove('playing');
  };
  return { bubbles, playLine };
}
function playAllButton(btn, lines, bubbles, onEnd) {
  let playing = false;
  btn.onclick = async () => {
    if (playing) { playing = false; stopAudio(); return; }
    playing = true; btn.textContent = '⏹ 停止';
    $$('.w.sung').forEach(s => s.classList.remove('sung'));
    for (let k = 0; k < lines.length && playing; k++) {
      bubbles.forEach(b => b.classList.remove('playing')); bubbles[k].classList.add('playing');
      bubbles[k].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await sing(bubbles[k], lines[k].en, S.slow, voiceOf(lines[k].speaker));
      if (playing) await sleep(450);
    }
    bubbles.forEach(b => b.classList.remove('playing'));
    if (playing && onEnd) onEnd();
    playing = false; btn.textContent = '▶ 全部播放';
  };
  S.cleanup.push(() => { playing = false; });
}
function slowToggle(btn) { btn.textContent = `🐢 慢速：${S.slow ? '开' : '关'}`; btn.onclick = () => { S.slow = !S.slow; btn.textContent = `🐢 慢速：${S.slow ? '开' : '关'}`; }; }
function zhToggle(btn, bubbles) { btn.onclick = () => { const on = !bubbles.every(b => b.classList.contains('showzh')); bubbles.forEach(b => b.classList.toggle('showzh', on)); btn.textContent = on ? '隐藏全部中文' : '显示全部中文'; }; }

function viewStory(u) {
  setHeader('小故事', '#/u/' + u.id);
  const st = u.story;
  app.innerHTML = `${whyNote('story')}
  <div class="card">
    <div class="scene">${st.scene}</div>
    <h2 class="center">${esc(st.title)}</h2>
    <p class="mute center" style="margin-top:-6px">点<b>单词</b>看意思和读音，点<b>句子</b>或「中文」看翻译。先只听不看中文，试试能懂多少！</p>
    <div class="row" style="justify-content:center">
      <button class="btn" id="playAll">▶ 全部播放</button><button class="btn ghost" id="slowT"></button><button class="btn gray" id="zhAll">显示全部中文</button>
    </div>
    <div id="lines">${st.lines.map((l, k) => lineHtml(l, k)).join('')}</div>
  </div>
  <div class="navrow"><a class="btn ghost" href="#/u/${u.id}/grammar">← 语法</a><a class="btn" href="#/u/${u.id}/skit">下一步：发音小短剧 →</a></div>`;
  const { bubbles } = wireLines(st.lines);
  playAllButton($('#playAll'), st.lines, bubbles, () => { unitP(u.id).storyPlayed = true; save(); });
  slowToggle($('#slowT')); zhToggle($('#zhAll'), bubbles);
  unitP(u.id).story = true; bump('studied'); save();
}

function viewRoots() {
  setHeader('词根家族', '#/');
  const fam = {};
  for (const id in S.words) { const { w, unit } = S.words[id]; const f = w.ety && w.ety.family; if (f) (fam[f] = fam[f] || []).push({ w, unit }); }
  const learned = id => !!S.p.words[id];
  const keys = Object.keys(fam).sort((a, b) => fam[b].filter(x => learned(x.w.id)).length - fam[a].filter(x => learned(x.w.id)).length || fam[b].length - fam[a].length);
  const nLearned = keys.filter(k => fam[k].some(x => learned(x.w.id))).length;
  app.innerHTML = `${whyNote('roots')}
  <div class="card"><h2>🌳 词根家族</h2><p class="small">把单词按共同的词根、词缀或来源分组。你学过的词会亮起来 ✅，没学过的显示为灰色。点 🔊 听发音。</p>
  <p class="mute">已点亮 ${nLearned} / ${keys.length} 个家族</p></div>
  ${keys.map(k => { const list = fam[k]; const any = list.some(x => learned(x.w.id)); const rel = []; const seen = new Set(list.map(x => x.w.en));
    list.forEach(x => x.w.ety.related.forEach(r => { if (!seen.has(r.en)) { seen.add(r.en); rel.push(r); } }));
    return `<div class="card fam${any ? '' : ' dim'}"><h3>${esc(S.c.rootFamilies[k] || k)}</h3>
      <div class="row">${list.map(x => `<button class="say famw${learned(x.w.id) ? ' on' : ''}" data-say="${esc(x.w.en)}"><span class="emoji">${x.w.emoji}</span> <b class="en">${esc(x.w.en)}</b> ${esc(x.w.zh)} ${learned(x.w.id) ? '✅' : ''}</button>`).join('')}</div>
      ${list[0].w.ety.parts.length ? `<div class="parts" style="margin-top:8px">${list[0].w.ety.parts.map(p => `<span class="part"><b class="en">${esc(p.part)}</b> = ${esc(p.meaning)}</span>`).join('')}</div>` : ''}
      ${rel.length ? `<div class="related" style="margin-top:8px">${rel.map(r => `<button class="say rel" data-say="${esc(r.en)}">🔊 <b class="en">${esc(r.en)}</b> <span class="zh">${esc(r.zh)}</span></button>`).join('')}</div>` : ''}
    </div>`; }).join('')}
  <div class="card"><h3>没有明显词根的基础词</h3><p class="small">这些词太古老或来源有趣，看看它们的小故事：</p>${Object.values(S.words).filter(x => !x.w.ety.family).map(x => `<p class="small"><b class="en">${x.w.emoji} ${esc(x.w.en)}</b>：${esc(x.w.ety.story || x.w.ety.origin)}</p>`).join('')}</div>`;
}

'use strict';
/* 发音小短剧 (karaoke skits) + 我来演 (role-play recording) */
const VOICE_DESC = { 'en-US-AnaNeural': '童声', 'en-US-BrianNeural': '男声', 'en-US-GuyNeural': '男声（成熟）', 'en-US-JennyNeural': '女声', 'en-US-AriaNeural': '女声（成熟）', 'en-US-AvaNeural': '女声' };
function drillHtml(pt) {
  return `<div class="drill">${pt.drill.map(d => pt.kind === 'pair'
    ? `<span class="pair">${d.split(' / ').map(x => `<button class="say" data-say="${esc(x)}">🔊 <b class="en">${esc(x)}</b></button>`).join('<span class="vs">vs</span>')}</span>`
    : `<span class="pair"><button class="say" data-say="${esc(d)}">🔊 <b class="en">${esc(d)}</b></button><button class="say slow" data-say="${esc(d)}" data-slow="1">🐢</button></span>`).join('')}</div>`;
}
function viewSkit(u, sub) {
  setHeader('发音小短剧', '#/u/' + u.id);
  const skits = u.skits || []; const si = Math.max(0, skits.findIndex(s => s.id === sub)); const sk = skits[si];
  if (!sk) { app.innerHTML = '<div class="card">这一课还没有小短剧。</div>'; return; }
  const sp = n => S.c.speakers[n] || { name: n, avatar: '🙂' };
  app.innerHTML = `${whyNote('skit')}
  ${skits.length > 1 ? `<div class="row" style="margin-bottom:10px">${skits.map((s, k) => `<a class="pill" href="#/u/${u.id}/skit/${s.id}">${k === si ? '▶ ' : ''}${esc(s.title)}</a>`).join('')}</div>` : ''}
  <div class="card">
    <div class="scene">${sk.scene}</div>
    <h2 class="center">🎭 ${esc(sk.title)}</h2>
    <div class="cast">${sk.cast.map(n => `<div class="castm"><div class="avatar-big">${sp(n).avatar}</div><b>${esc(sp(n).name)}</b><span class="mute small">${VOICE_DESC[voiceOf(n)] || ''}</span></div>`).join('')}</div>
  </div>
  <div class="card"><h3>🎯 本剧发音重点</h3>
    ${sk.points.map((pt, k) => `<div class="ppoint"><b>${k + 1}. ${esc(pt.name)}</b><p class="small" style="margin:4px 0">${esc(pt.note)}</p><div class="mute small">${pt.kind === 'pair' ? '对比练习（最小对立词）：' : '跟读练习：'}</div>${drillHtml(pt)}</div>`).join('')}
  </div>
  <div class="card" id="stage">
    <div class="row" style="justify-content:center">
      <button class="btn" id="playAll">▶ 全部播放</button><button class="btn ghost" id="slowT"></button><button class="btn gray" id="zhAll">隐藏全部中文</button>
    </div>
    <p class="mute center small">播放时字幕会像卡拉 OK 一样逐词变色。点单词看意思。</p>
    <div id="lines">${sk.lines.map((l, k) => lineHtml(l, k)).join('')}</div>
  </div>
  <div class="card" id="act"><h3>🎬 我来演</h3>
    <p class="small">选一个角色：其他角色的台词由电脑来说，轮到你时会停下来录下你的声音。演完可以播放整场——里面有你的声音！</p>
    ${!Rec.supported() ? '<div class="hint">⚠️ 这个浏览器不能录音，你仍然可以演：轮到你时会停下来等你说完。</div>' : ''}
    <label class="small row" style="gap:6px;margin-bottom:8px"><input type="checkbox" id="preHear"> 轮到我时，先播放一遍原声（跟读模式，适合刚开始）</label>
    <div class="row">${sk.cast.map(n => `<button class="btn ghost" data-role="${esc(n)}">${sp(n).avatar} 我演 ${esc(sp(n).name)}</button>`).join('')}</div>
    <div id="actStatus"></div>
  </div>
  <div class="navrow"><a class="btn ghost" href="#/u/${u.id}/story">← 小故事</a><a class="btn" href="#/u/${u.id}/quiz">下一步：练习 →</a></div>`;
  let { bubbles } = wireLines(sk.lines);
  bubbles.forEach(b => b.classList.add('showzh'));
  playAllButton($('#playAll'), sk.lines, bubbles, () => { unitP(u.id).skit = true; bump('skit'); save(); });
  slowToggle($('#slowT')); zhToggle($('#zhAll'), bubbles);
  if (!(unitP(u.id).skitSeen)) { unitP(u.id).skitSeen = true; save(); }

  /* ---- role play ---- */
  let acting = null; // {role, recs:{}, stream, stop:false}
  const status = html => { $('#actStatus').innerHTML = html; };
  S.cleanup.push(() => { if (acting) { acting.stop = true; if (acting.cur) acting.cur.stop(); if (acting.stream) acting.stream.getTracks().forEach(t => t.stop()); } });
  const lineDur = (l, slow) => { const f = audioFile(l.en, voiceOf(l.speaker)); const m = f && S.t[f + (slow ? '-slow' : '')]; return m && m.length ? m[m.length - 1][1] : 2.5; };
  const markTurn = (k, on) => { bubbles.forEach(b => b.classList.remove('playing', 'myturn')); if (on) { bubbles[k].classList.add(on); bubbles[k].scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
  const waitDone = (ms) => new Promise(res => {
    const btnId = 'doneBtn';
    const t = setTimeout(() => res('timeout'), ms);
    const b = document.getElementById(btnId); if (b) b.onclick = () => { clearTimeout(t); res('done'); };
  });
  async function perform(role) {
    stopAudio();
    acting = { role, recs: {}, stop: false };
    $$('[data-role]').forEach(b => b.disabled = true);
    // ask for the mic once up front, then release it: on iPhone an open mic makes other audio quiet, so we only open it during your turns
    let canMic = false;
    if (Rec.supported()) { try { const s0 = await Rec.open(); s0.getTracks().forEach(t => t.stop()); canMic = true; } catch (err) { status(`<div class="hint">${Rec.micError(err)} 这次先不录音，轮到你时会等你说。</div>`); } }
    const pre = $('#preHear').checked;
    for (let k = 0; k < sk.lines.length && !acting.stop; k++) {
      const l = sk.lines[k];
      if (l.speaker !== role) {
        markTurn(k, 'playing'); status(`<p class="mute">${sp(l.speaker).avatar} ${esc(sp(l.speaker).name)} 在说…</p>`);
        await sing(bubbles[k], l.en, S.slow, voiceOf(l.speaker)); await sleep(350);
      } else {
        markTurn(k, 'myturn');
        if (pre) { status('<p class="mute">👂 先听一遍原声…</p>'); await sing(bubbles[k], l.en, S.slow, voiceOf(l.speaker)); await sleep(250); }
        if (acting.stop) break;
        const ms = Math.round(lineDur(l, S.slow) * 2500 + 2500);
        if (canMic) { try { acting.stream = await Rec.open(); } catch (e) { acting.stream = null; } }
        status(`<div class="turn"><b>${sp(role).avatar} 轮到你了！${acting.stream ? '🔴 正在录音…' : ''}</b><div class="sent en">${esc(l.en)}</div><div class="zh">${esc(l.zh)}</div><button class="btn green big" id="doneBtn">说完了 ✓</button></div>`);
        if (acting.stream) acting.cur = Rec.start(acting.stream);
        await waitDone(ms);
        if (acting.cur) { const url = await acting.cur.stop(); acting.cur = null; if (url) acting.recs[k] = url; }
        if (acting.stream) { acting.stream.getTracks().forEach(t => t.stop()); acting.stream = null; }
        await sleep(200);
      }
    }
    markTurn(0, null);
    if (acting.stream) acting.stream.getTracks().forEach(t => t.stop());
    $$('[data-role]').forEach(b => b.disabled = false);
    if (acting.stop) return;
    const n = Object.keys(acting.recs).length;
    unitP(u.id).skit = true; const p = unitP(u.id); p.acted = p.acted || {}; p.acted[sk.id] = true; bump('skit');
    logQ({ unit: u.id, mode: 'skit', type: 'act', item: sk.id, prompt: sk.title, answer: role, expected: '', ok: true, recorded: n }); save();
    status(`<div class="fb ok"><div class="t">🎉 演完了！</div>${n ? `录下了你的 ${n} 句台词。` : ''}</div>
      <div class="row" style="margin-top:10px">${n ? '<button class="btn" id="replayAll">🎬 播放整场（有你的声音）</button>' : ''}<button class="btn ghost" id="actAgain">再演一次</button></div>`);
    if (n) $('#replayAll').onclick = () => replayScene(acting);
    $('#actAgain').onclick = () => perform(role);
  }
  async function replayScene(a) {
    const btn = $('#replayAll'); if (btn) btn.disabled = true; a.stop = false;
    for (let k = 0; k < sk.lines.length && !a.stop; k++) {
      const l = sk.lines[k];
      if (a.recs[k]) { markTurn(k, 'myturn'); stopAudio(); $$('.w', bubbles[k]).forEach(s => s.classList.add('sung')); await playUrl(a.recs[k]); }
      else { markTurn(k, 'playing'); await sing(bubbles[k], l.en, S.slow, voiceOf(l.speaker)); }
      await sleep(300);
    }
    markTurn(0, null); if (btn) btn.disabled = false;
  }
  $$('[data-role]').forEach(b => b.onclick = () => perform(b.dataset.role));
}

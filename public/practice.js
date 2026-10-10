'use strict';
/* 跟读 (shadowing) + 听写 (dictation) + shared recorder helpers */
const Rec = {
  supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
  SR: () => window.SpeechRecognition || window.webkitSpeechRecognition || null,
  mime: () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)),
  open: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
  start(stream) { // returns {stop(): Promise<blobUrl|null>}
    const mime = Rec.mime(); const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); const chunks = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { mr.onstop = () => res(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' })) : null); });
    mr.start();
    return { stop() { try { if (mr.state !== 'inactive') mr.stop(); } catch (e) {} return stopped; }, mr };
  },
  micError: err => `🎙️ 没拿到麦克风权限（${esc(err && err.name || err)}）。请在浏览器设置里允许本网站使用麦克风，再试一次。（iPhone：设置 → Safari → 麦克风）`,
};
function playUrl(url) { return new Promise(res => { const a = new Audio(url); a.onended = a.onerror = () => res(); a.play().catch(() => res()); }); }

function viewShadow(u) {
  setHeader('跟读', '#/u/' + u.id);
  const SR = Rec.SR(), canRec = Rec.supported();
  const zhOf = en => { for (const w of u.words) if (w.example.en === en) return w.example.zh; for (const p of u.grammar.points) for (const e of p.examples) if (e.en === en) return e.zh; const l = u.story.lines.find(l => l.en === en); return l ? l.zh : ''; };
  app.innerHTML = `${whyNote('shadow')}
  <div class="card small"><b>怎么练：</b>① 点 🔊 听原声（可以用 🐢 慢速）→ ② 点 🎙️ 录音，模仿着说一遍 → ③ 点 ▶ 听自己的录音，或点「对比」先播原声再播你的。
  ${!canRec ? '<div class="hint">⚠️ 这个浏览器不能录音（需要较新的 Safari / Chrome，并且用 https 打开）。你仍然可以听原声跟着读。</div>' : ''}
  ${canRec && !SR ? '<div class="hint">ℹ️ 这个浏览器不支持自动打分，录音和回放都能用：请自己听一听，和原声比一比。</div>' : ''}
  ${canRec && SR ? '<div class="mute">✨ 这个浏览器支持自动打分：录音时会同时识别你说的话（第一次会请求麦克风权限）。</div>' : ''}</div>
  ${u.shadow.map((s, k) => `<div class="card reccard" data-k="${k}"><div class="sent en">${tokens(s)}</div><div class="zh">${esc(zhOf(s))}</div>
    <div class="actions">${sayBtns(s, { label: '原声' })}${canRec ? `<button class="btn rec" data-rec="${k}">🎙️ 录音</button><button class="btn ghost" data-mine="${k}" disabled>▶ 我的录音</button><button class="btn gray" data-cmp="${k}" disabled>🔁 对比</button>` : ''}</div>
    <div class="result" id="res${k}"></div></div>`).join('')}
  <div class="navrow"><a class="btn ghost" href="#/u/${u.id}/quiz">← 练习</a><a class="btn" href="#/u/${u.id}/dictation">下一步：听写 →</a></div>`;
  const recs = {}; let cur = null;
  const stopCur = () => { if (!cur) return; const c = cur; cur = null; clearTimeout(c.timer); c.rec.stop(); try { c.sr && c.sr.stop(); } catch (e) {} };
  S.cleanup.push(() => { stopCur(); Object.values(recs).forEach(x => URL.revokeObjectURL(x)); });
  const showScore = (k, transcript) => {
    const target = u.shadow[k]; const r = lcsOps(words(transcript), words(target)); const pct = Math.round(r.match / r.total * 100);
    const heard = new Set(words(transcript));
    $('#res' + k).innerHTML = `<div class="fb ${pct >= 80 ? 'ok' : 'no'}"><span class="score">自动打分：${pct} 分 ${pct >= 80 ? '👍' : '💪 再试一次'}</span><br><span class="small">识别到：「${esc(transcript)}」</span><br>${words(target).map(w => `<span class="${heard.has(w) ? 'd-ok' : 'd-miss'}">${esc(w)}</span>`).join(' ')}<div class="legend">绿色 = 读得清楚，黄底 = 没识别到，可以多听几遍原声再读。</div></div>`;
    logQ({ unit: u.id, mode: 'shadow', type: 'shadow', item: target, prompt: target, answer: transcript, expected: target, ok: pct >= 80, score: pct }); save();
  };
  const onClick = async e => {
    const rb = e.target.closest('[data-rec]'), mb = e.target.closest('[data-mine]'), cb = e.target.closest('[data-cmp]');
    if (rb) {
      const k = +rb.dataset.rec;
      if (cur && cur.k === k) return stopCur();
      stopCur(); stopAudio();
      let stream; try { stream = await Rec.open(); } catch (err) { $('#res' + k).innerHTML = `<div class="hint">${Rec.micError(err)}</div>`; return; }
      const rec = Rec.start(stream);
      cur = { k, rec, timer: setTimeout(stopCur, 12000) };
      rb.classList.add('on'); rb.textContent = '⏹ 停止';
      $('#res' + k).innerHTML = '<div class="mute small">🔴 正在录音…读完点「停止」（最长 12 秒）</div>';
      const stoppedP = new Promise(res => rec.mr.addEventListener('stop', res));
      stoppedP.then(async () => {
        stream.getTracks().forEach(t => t.stop());
        rb.classList.remove('on'); rb.textContent = '🎙️ 重新录';
        const url = await rec.stop(); if (!url) return;
        if (recs[k]) URL.revokeObjectURL(recs[k]); recs[k] = url;
        $(`[data-mine="${k}"]`).disabled = false; $(`[data-cmp="${k}"]`).disabled = false;
        const p = unitP(u.id); p.shadow = p.shadow || {}; p.shadow[k] = true; bump('shadow'); save();
        if (!$('#res' + k).querySelector('.fb')) $('#res' + k).innerHTML = `<div class="mute small">录好了！点「对比」听听原声和你的录音有什么不同。</div>`;
      });
      if (SR) {
        try {
          const sr = new SR(); sr.lang = 'en-US'; sr.interimResults = false; sr.maxAlternatives = 3; cur.sr = sr;
          sr.onresult = ev => { const alts = [...ev.results[0]].map(a => a.transcript); const best = alts.sort((a, b) => lcsOps(words(b), words(u.shadow[k])).match - lcsOps(words(a), words(u.shadow[k])).match)[0]; showScore(k, best); };
          sr.onerror = ev => { const box = $('#res' + k); if (!box) return; if (ev.error === 'no-speech') box.innerHTML = '<div class="mute small">没听到声音，靠近麦克风再试一次。</div>'; else if (ev.error !== 'aborted') box.innerHTML = `<div class="mute small">自动打分暂时不可用（${esc(ev.error)}），录音照样可以回放对比。</div>`; };
          sr.onend = () => { if (cur && cur.k === k && cur.sr === sr) setTimeout(() => { if (cur && cur.k === k) stopCur(); }, 400); };
          sr.start();
        } catch (err) { /* recognition unavailable: recording still works */ }
      }
    }
    if (mb) { stopAudio(); playUrl(recs[+mb.dataset.mine]); }
    if (cb) { const k = +cb.dataset.cmp; await speak(u.shadow[k]); await sleep(300); await playUrl(recs[k]); }
  };
  app.addEventListener('click', onClick); S.cleanup.push(() => app.removeEventListener('click', onClick));
}

function viewDictation(u) {
  setHeader('听写', '#/u/' + u.id);
  let i = 0, right = 0;
  const render = () => {
    if (i >= u.dictation.length) {
      app.innerHTML = `${whyNote('dictation')}<div class="card center"><div class="emoji" style="font-size:64px">📝</div><h2>听写完成！</h2><p style="font-size:20px">全对 ${right} / ${u.dictation.length} 句</p><div class="navrow"><button class="btn ghost" id="again">再来一遍</button><a class="btn" href="#/u/${u.id}">回到本课</a></div></div>`;
      $('#again').onclick = () => { i = 0; right = 0; render(); };
      bump('dictationSessions'); save(); return;
    }
    const d = u.dictation[i]; let plays = 0;
    app.innerHTML = `${whyNote('dictation')}
      <div class="row" style="justify-content:space-between"><span class="mute">第 ${i + 1} / ${u.dictation.length} 句</span><span class="mute">全对 ${right}</span></div>
      <div class="progress"><i style="width:${i / u.dictation.length * 100}%"></i></div>
      <div class="card">
        <div class="center"><button class="btn big" id="play" style="max-width:320px">🔊 播放句子</button></div>
        <div class="row" style="justify-content:center;margin:10px 0"><button class="btn ghost" id="slow">🐢 慢速播放</button><button class="btn gray" id="zh">看中文提示</button></div>
        <div id="zhBox"></div>
        <textarea class="txt en" id="ans" autocomplete="off" autocapitalize="sentences" autocorrect="off" spellcheck="false" placeholder="听到什么就写什么…"></textarea>
        <div class="navrow"><button class="btn" id="check">检查</button></div>
        <div id="fb"></div>
      </div>`;
    $('#play').onclick = () => { plays++; speak(d.en, false); };
    $('#slow').onclick = () => { plays++; speak(d.en, true); };
    $('#zh').onclick = () => { $('#zhBox').innerHTML = `<div class="hint">${esc(d.zh)}</div>`; };
    $('#check').onclick = () => {
      const ans = $('#ans').value; if (!ans.trim()) { toast('先写下你听到的内容'); return; }
      const r = diffHtml(ans, d.en); const ok = r.match === r.total && words(ans).length === r.total; if (ok) right++;
      $('#check').remove(); $('#ans').readOnly = true;
      $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><div class="t">${ok ? '✅ 全对！' : `写对了 ${r.match} / ${r.total} 个词`}</div>${r.html}
        <p style="margin:8px 0 0">正确句子：<b class="en">${esc(d.en)}</b><br><span class="zh">${esc(d.zh)}</span></p><div class="row" style="margin-top:6px">${sayBtns(d.en)}</div></div>
        <div class="navrow"><button class="btn big" id="next">下一句 →</button></div>`;
      const p = unitP(u.id); p.dictation = p.dictation || {}; p.dictation[i] = true; bump('dictation');
      logQ({ unit: u.id, mode: 'dictation', type: 'dictation', item: d.en, prompt: d.en, answer: ans, expected: d.en, ok, plays }); save();
      $('#next').onclick = () => { i++; render(); };
    };
    $('#ans').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const c = $('#check'); if (c) c.click(); } });
  };
  render();
}

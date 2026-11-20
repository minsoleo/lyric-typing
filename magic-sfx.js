/* 숲속의 한바탕 — 🔊 소리 엔진
   MAGIC_SOUNDS(magic-sounds.js) 표의 소리를 미리 불러 두고, 이름으로 바로 냄.
   파일을 못 불러오면 그 소리만 조용히 건너뜀 (게임은 그대로). */
(() => {
  const KEY = 'magic.sfx';
  let ctx = null, master = null, table = {};
  const bufs = {}, state = {};
  let vol = 0.6, muted = false;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s){ if (typeof s.v === 'number') vol = Math.max(0, Math.min(1, s.v)); muted = !!s.m; }
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({v: vol, m: muted})); } catch (e) {} };

  // 지금 이 소리를 내도 되나: 간격(gap초) 안이거나, 이미 max개가 울리는 중이면 안 됨
  function allow(st, name, e, now){
    const s = st[name];
    if (!s) return true;
    if (now - s.last < (e.gap || 0)) return false;
    return s.playing < (e.max || 3);
  }
  function ensure(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(ctx.destination);
    return ctx;
  }
  // 브라우저는 처음 클릭·키 누르기 전에는 소리를 막음 → 그때 부름
  function unlock(){ const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }

  // 표의 파일을 모두 불러 둠 (file이 배열이면 겹쳐 낼 소리 여러 개)
  function load(t, base, v){
    table = t || {};
    const c = ensure(); if (!c) return Promise.resolve(0);
    const one = f => fetch(`${base}${f}${v ? '?v=' + v : ''}`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(a => new Promise((ok, bad) => c.decodeAudioData(a, ok, bad)))
      .catch(err => { console.warn('🔇 소리 못 불러옴:', f, err && err.message || err); return null; });
    return Promise.all(Object.keys(table).map(name => Promise.all([].concat(table[name].file).map(one))
      .then(list => { bufs[name] = list; }))).then(() => Object.keys(bufs).filter(n => bufs[n].some(Boolean)).length);
  }

  // name 소리를 냄 (gain: 0~1, 멀리서 난 소리는 작게). 낸 경우만 true
  function play(name, gain){
    gain = gain === undefined ? 1 : gain;
    const e = table[name], b = bufs[name];
    if (!ctx || !e || !b || muted || gain <= 0 || ctx.state !== 'running') return false;
    const layers = b.map((buf, i) => ({buf, i})).filter(l => l.buf);
    if (!layers.length) return false;
    const now = ctx.currentTime;
    if (!allow(state, name, e, now)) return false;
    const s = state[name] || (state[name] = {last: -9, playing: 0});
    s.last = now; s.playing++;
    const rate = (e.rate || 1) * (1 + (Math.random() * 2 - 1) * (e.vary === undefined ? 0.06 : e.vary));
    const g = ctx.createGain(), level = (e.vol === undefined ? 1 : e.vol) * gain;
    g.gain.value = level; g.connect(master);
    if (e.len){ g.gain.setValueAtTime(level, now + Math.max(0, e.len - 0.2)); g.gain.linearRampToValueAtTime(0.0001, now + e.len); }   // 긴 파일은 잘라서 살짝 줄이며 끝냄
    let ended = 0;
    for (const {buf, i} of layers){
      const src = ctx.createBufferSource(), lg = ctx.createGain();
      src.buffer = buf; src.playbackRate.value = rate * ((e.rates && e.rates[i]) || 1);
      lg.gain.value = e.mix && e.mix[i] !== undefined ? e.mix[i] : 1;
      src.connect(lg); lg.connect(g);
      src.onended = () => { if (++ended === layers.length){ s.playing = Math.max(0, s.playing - 1); g.disconnect(); } };
      const at = now + ((e.at && e.at[i]) || 0);
      src.start(at); if (e.len) src.stop(now + e.len);
    }
    return true;
  }
  function apply(){ if (master) master.gain.value = muted ? 0 : vol; save(); }

  window.MagicSfx = {
    allow, load, unlock, play,
    setVolume(v){ vol = Math.max(0, Math.min(1, +v || 0)); apply(); },
    setMuted(m){ muted = !!m; apply(); },
    get volume(){ return vol; }, get muted(){ return muted; },
    get loaded(){ return Object.keys(bufs).filter(n => bufs[n].some(Boolean)); }
  };
})();

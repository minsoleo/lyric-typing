/* 주문 대결 1단계: 혼자 연습판 (허수아비 상대)
   - 게임 상태(S)를 바꾸는 부분과 그리는 부분(draw)을 나눠 둠 → 2단계 온라인에서 상태만 주고받기 쉽게 */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const L = window.MagicLogic, SPELLS = window.MAGIC_SPELLS, BASIC = window.MAGIC_BASIC;
const W = 1600, H = 900;                 // 세계(맵) 크기
const PLAYER_SPEED = 260, DUMMY_SPEED = 140, FAIL_LOCK = 0.8, RESPAWN = 3;

/* ---------- 밝은/어두운 버전 ---------- */
let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function applyTheme(){
  document.documentElement.dataset.theme = theme;
  const b = $('#themeBtn'), label = theme === 'light' ? '어두운 버전으로 바꾸기' : '밝은 버전으로 바꾸기';
  b.textContent = theme === 'light' ? '🌙' : '☀️'; b.title = label; b.setAttribute('aria-label', label);
}
$('#themeBtn').onclick = () => { theme = theme === 'light' ? 'dark' : 'light'; applyTheme(); try { localStorage.setItem('lyricTyping.theme', theme); } catch (e) {} focusSpell(); };
applyTheme();

/* ---------- 맵: 바위와 나무 (이동과 마법을 막음) ---------- */
const OBSTACLES = [
  {x: 610, y: 170, w: 100, h: 70, kind: 'rock'},
  {x: 1240, y: 130, w: 110, h: 64, kind: 'rock'},
  {x: 760, y: 610, w: 130, h: 80, kind: 'rock'},
  {x: 470, y: 560, w: 76, h: 76, kind: 'tree'},
  {x: 920, y: 240, w: 76, h: 76, kind: 'tree'},
  {x: 1350, y: 650, w: 84, h: 84, kind: 'tree'},
  {x: 170, y: 150, w: 76, h: 76, kind: 'tree'}
];

/* ---------- 게임 상태 ---------- */
const now = () => performance.now() / 1000;
const S = {
  player: {x: 300, y: 450, r: 22, hp: 100, max: 100, shield: 0, shieldUntil: 0, frozenUntil: 0, target: null, face: {x: 1, y: 0}},
  dummy: {x: 1120, y: 450, r: 26, hp: 100, max: 100, shield: 0, shieldUntil: 0, frozenUntil: 0, mode: 'still', dir: 1, deadUntil: 0},
  shots: [], zaps: [], fx: [], floats: [],
  cds: {}, lastBasic: undefined, lockUntil: 0,
  stats: {dmg: 0, kills: 0, ok: 0, fail: 0}
};
const mouse = {x: 800, y: 450, left: false};

/* ---------- 캔버스를 화면에 맞추기 (16:9 유지) ---------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let scale = 1;
function fit(){
  const st = $('#stage'), dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, Math.min(st.clientWidth, st.clientHeight * W / H));
  const h = w * H / W;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  scale = w / W;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', fit);

/* ---------- 마우스: 왼쪽 = 이동, 오른쪽 = 평타 ---------- */
function toWorld(e){
  const r = cv.getBoundingClientRect();
  return {x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H};
}
cv.addEventListener('mousedown', e => {
  e.preventDefault();                     // 클릭해도 주문 입력 칸이 포커스를 잃지 않게
  Object.assign(mouse, toWorld(e));
  if (e.button === 0){ mouse.left = true; setMoveTarget(); }
  else if (e.button === 2) basicAttack();
  focusSpell();
});
cv.addEventListener('mousemove', e => { Object.assign(mouse, toWorld(e)); if (mouse.left) S.player.target = {x: mouse.x, y: mouse.y}; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; });
document.addEventListener('contextmenu', e => e.preventDefault());   // 오른쪽 클릭 메뉴 막기
function setMoveTarget(){
  S.player.target = {x: mouse.x, y: mouse.y};
  S.fx.push({type: 'mark', x: mouse.x, y: mouse.y, t0: now(), life: 0.5});
}

/* ---------- 키보드: 주문 입력 ---------- */
const inp = $('#spellInput');
let pending = false;
function focusSpell(){ if (document.activeElement !== inp) inp.focus({preventScroll: true}); }
inp.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ e.preventDefault(); inp.value = ''; castMsg(''); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (e.isComposing){ pending = true; return; }     // 한글 조립이 끝난 뒤에 판정
  submitSpell();
});
inp.addEventListener('compositionend', () => { if (pending){ pending = false; setTimeout(submitSpell, 0); } });
window.addEventListener('focus', focusSpell);
document.addEventListener('keydown', e => { if (document.activeElement !== inp && e.key.length === 1 && !e.ctrlKey && !e.metaKey) focusSpell(); });

let msgTimer = 0;
function castMsg(m, kind){
  const el = $('#castMsg');
  el.textContent = m; el.className = kind || '';
  clearTimeout(msgTimer);
  if (m) msgTimer = setTimeout(() => { el.textContent = ''; }, 1400);
}
function shakeCast(){ const b = $('#castBox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }

function submitSpell(){
  const text = inp.value;
  if (!L.norm(text)) return;
  const t = now();
  if (t < S.lockUntil){ castMsg('잠깐! 주문을 다시 외우는 중…', 'wait'); return; }
  const sp = L.findSpell(SPELLS, text);
  inp.value = '';
  if (!sp){
    S.lockUntil = t + FAIL_LOCK; S.stats.fail++;
    castMsg('주문 실패!', 'bad'); shakeCast();
    S.fx.push({type: 'fizzle', x: S.player.x, y: S.player.y - 40, t0: t, life: 0.6});
    return;
  }
  const left = L.cooldownLeft(S.cds[sp.id], sp.cd, t);
  if (left > 0){ castMsg(`${sp.name}: ${left.toFixed(1)}초 뒤에 다시`, 'wait'); return; }
  S.cds[sp.id] = t; S.stats.ok++;
  castSpell(sp, t);
  castMsg(sp.name + '!', 'good');
  const li = document.querySelector(`#book li[data-id="${sp.id}"]`);
  if (li){ li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); }
}

/* ---------- 주문 효과 ---------- */
function aimDir(){
  const p = S.player, dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy) || 1;
  return {x: dx / d, y: dy / d};
}
function shoot(kind, o){
  const p = S.player, d = aimDir();
  p.face = d;
  S.shots.push({kind, x: p.x + d.x * (p.r + 6), y: p.y + d.y * (p.r + 6), vx: d.x * o.speed, vy: d.y * o.speed,
    r: o.radius, dmg: o.dmg, range: o.range, trav: 0, pierce: !!o.pierce, freeze: o.freeze || 0, hit: new Set()});
}
function castSpell(sp, t){
  const p = S.player;
  switch (sp.id){
    case 'fire': case 'ice': case 'wind': shoot(sp.id, sp); break;
    case 'blink': {
      const from = {x: p.x, y: p.y};
      let to = L.clampReach(from, mouse, sp.reach);
      to = L.pushOut(L.clampToWorld(to, p.r, W, H), p.r, OBSTACLES);
      p.x = to.x; p.y = to.y; p.target = null;
      S.fx.push({type: 'blink', x: from.x, y: from.y, t0: t, life: 0.5}, {type: 'blink', x: p.x, y: p.y, t0: t, life: 0.5});
      break;
    }
    case 'shield': p.shield = sp.amount; p.shieldUntil = t + sp.time; break;
    case 'heal': {
      const before = p.hp; p.hp = Math.min(p.max, p.hp + sp.heal);
      S.floats.push({x: p.x, y: p.y - 40, text: '+' + (p.hp - before), color: '#5ce08a', t0: t});
      S.fx.push({type: 'heal', x: p.x, y: p.y, t0: t, life: 0.8});
      break;
    }
    case 'thunder': {
      const at = L.clampToWorld(mouse, 0, W, H);
      S.zaps.push({x: at.x, y: at.y, r: sp.area, dmg: sp.dmg, t0: t, at: t + sp.delay});
      break;
    }
  }
}
function basicAttack(){
  const t = now();
  if (L.cooldownLeft(S.lastBasic, BASIC.cd, t) > 0) return;
  S.lastBasic = t;
  shoot('basic', BASIC);
}

/* ---------- 피해 ---------- */
function hurt(target, dmg, t, color){
  if (target === S.dummy && t < S.dummy.deadUntil) return;
  const r = L.applyDamage(target, dmg, t);
  target.hp = r.hp; target.shield = r.shield;
  S.stats.dmg += dmg - r.absorbed;
  S.floats.push({x: target.x + (Math.random() * 20 - 10), y: target.y - target.r - 14, text: r.absorbed ? `${dmg - r.absorbed} (막음 ${r.absorbed})` : String(dmg), color: color || '#ffd166', t0: t});
  if (target === S.dummy && target.hp <= 0){
    target.deadUntil = t + RESPAWN; S.stats.kills++;
    S.fx.push({type: 'poof', x: target.x, y: target.y, t0: t, life: 0.7});
  }
}

/* ---------- 한 프레임 진행 ---------- */
let last = now();
function update(){
  const t = now(), dt = Math.min(0.05, t - last); last = t;
  const p = S.player, d = S.dummy;

  // 내 캐릭터 이동 (얼어 있으면 못 움직임)
  if (p.target && t >= p.frozenUntil){
    const m = L.moveToward(p, p.target, PLAYER_SPEED * dt);
    const dx = m.x - p.x, dy = m.y - p.y, len = Math.hypot(dx, dy);
    if (len > 0.01) p.face = {x: dx / len, y: dy / len};
    const pos = L.pushOut(L.clampToWorld(m, p.r, W, H), p.r, OBSTACLES);
    // 장애물에 막혀 거의 못 움직이면 목표 취소 (벽에 비비기 방지)
    if (Math.hypot(pos.x - p.x, pos.y - p.y) < PLAYER_SPEED * dt * 0.1 && !m.arrived) p.target = null;
    p.x = pos.x; p.y = pos.y;
    if (m.arrived) p.target = null;
  }

  // 허수아비: 쓰러졌으면 부활 대기, 아니면 (모드에 따라) 좌우 이동
  if (d.deadUntil && t >= d.deadUntil){ d.deadUntil = 0; d.hp = d.max; d.frozenUntil = 0; }
  if (!d.deadUntil && d.mode === 'move' && t >= d.frozenUntil){
    d.x += d.dir * DUMMY_SPEED * dt;
    if (d.x > 1430){ d.x = 1430; d.dir = -1; }
    if (d.x < 980){ d.x = 980; d.dir = 1; }
  }

  // 마법 날아가기
  for (const s of S.shots){
    const step = Math.hypot(s.vx, s.vy) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.trav += step;
    if (s.trav > s.range || s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40){ s.dead = true; continue; }
    if (!s.pierce && L.pointInRects(s.x, s.y, s.r * 0.4, OBSTACLES)){
      s.dead = true; S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, kind: s.kind}); continue;
    }
    if (!d.deadUntil && !s.hit.has('dummy') && Math.hypot(s.x - d.x, s.y - d.y) < s.r + d.r){
      s.hit.add('dummy');
      hurt(d, s.dmg, t, s.kind === 'ice' ? '#9fe3ff' : s.kind === 'wind' ? '#e8fff6' : '#ffd166');
      if (s.freeze) d.frozenUntil = t + s.freeze;
      S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, kind: s.kind});
      if (!s.pierce) s.dead = true;
    }
  }
  S.shots = S.shots.filter(s => !s.dead);

  // 천둥 번개: 시간이 되면 떨어짐
  for (const z of S.zaps){
    if (t < z.at) continue;
    z.dead = true;
    S.fx.push({type: 'bolt', x: z.x, y: z.y, r: z.r, t0: t, life: 0.5});
    if (!d.deadUntil && Math.hypot(z.x - d.x, z.y - d.y) < z.r + d.r) hurt(d, z.dmg, t, '#fff07a');
  }
  S.zaps = S.zaps.filter(z => !z.dead);

  S.fx = S.fx.filter(f => t - f.t0 < f.life);
  S.floats = S.floats.filter(f => t - f.t0 < 1);
}

/* ---------- 그리기 ---------- */
function roundRect(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function drawGround(){
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f6b45'); g.addColorStop(1, '#1f4d33');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 잔디 격자 무늬
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let x = 0; x < W; x += 80) for (let y = (x / 80) % 2 ? 0 : 80; y < H; y += 160) ctx.fillRect(x, y, 80, 80);
  // 가운데 마법진
  ctx.strokeStyle = 'rgba(179,139,255,.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 80, 0, Math.PI * 2); ctx.stroke();
}
function drawObstacles(){
  for (const o of OBSTACLES){
    if (o.kind === 'rock'){
      ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(o.x + 4, o.y + 8, o.w, o.h, 18); ctx.fill();
      ctx.fillStyle = '#8a8fa3'; roundRect(o.x, o.y, o.w, o.h, 18); ctx.fill();
      ctx.fillStyle = '#a9aec0'; roundRect(o.x + 8, o.y + 6, o.w * 0.55, o.h * 0.35, 12); ctx.fill();
    } else {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx + 5, cy + 12, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(cx - 7, cy, 14, o.h * 0.55);
      ctx.fillStyle = '#2f8f4e'; ctx.beginPath(); ctx.arc(cx, cy - 4, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#45ad66'; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function bar(x, y, w, ratio, color, shieldRatio){
  ctx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(x - w / 2, y, w, 8, 4); ctx.fill();
  ctx.fillStyle = color; roundRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, ratio), 6, 3); ctx.fill();
  if (shieldRatio > 0){ ctx.fillStyle = 'rgba(95,225,255,.85)'; roundRect(x - w / 2 + 1, y + 1, (w - 2) * Math.min(1, shieldRatio), 6, 3); ctx.fill(); }
}
function drawDummy(t){
  const d = S.dummy;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + d.r + 4, d.r, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (d.deadUntil){
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(d.x - 34, d.y + 10, 68, 12);
    ctx.fillStyle = '#fff'; ctx.font = '700 26px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(d.deadUntil - t) + '', d.x, d.y - 10);
    return;
  }
  ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(d.x, d.y - 10); ctx.lineTo(d.x, d.y + d.r + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(d.x - 38, d.y - 2); ctx.lineTo(d.x + 38, d.y - 2); ctx.stroke();
  ctx.fillStyle = '#e8cf8f'; ctx.beginPath(); ctx.arc(d.x, d.y - 18, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(d.x, d.y - 18, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d.x, d.y - 18, 4, 0, Math.PI * 2); ctx.fill();
  if (t < d.frozenUntil){ ctx.fillStyle = 'rgba(150,220,255,.45)'; roundRect(d.x - 40, d.y - 44, 80, 80, 12); ctx.fill(); }
  bar(d.x, d.y - 54, 70, d.hp / d.max, '#ff5d73');
}
function drawPlayer(t){
  const p = S.player;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r + 2, p.r, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (p.shieldUntil > t && p.shield > 0){
    ctx.strokeStyle = 'rgba(95,225,255,.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  // 몸(로브)
  ctx.fillStyle = '#7d4dff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(p.x + p.face.x * 6, p.y + p.face.y * 6 - 2, 11, 0, Math.PI * 2); ctx.fill();
  // 마법사 모자
  ctx.fillStyle = '#4b2bb3';
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 12, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(p.x - 14, p.y - 13); ctx.lineTo(p.x + 4, p.y - 50); ctx.lineTo(p.x + 14, p.y - 13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffc928'; ctx.beginPath(); ctx.arc(p.x + 4, p.y - 50, 4, 0, Math.PI * 2); ctx.fill();
  // 지팡이 끝(바라보는 쪽)
  ctx.fillStyle = '#5fe1ff'; ctx.beginPath(); ctx.arc(p.x + p.face.x * (p.r + 8), p.y + p.face.y * (p.r + 8), 5, 0, Math.PI * 2); ctx.fill();
  bar(p.x, p.y - 66, 64, p.hp / p.max, '#ff5d73', p.shieldUntil > t ? p.shield / 30 : 0);
  // 지금 외우는 주문 (머리 위 말풍선)
  const typing = inp.value;
  if (typing){
    ctx.font = '800 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(typing).width + 24;
    ctx.fillStyle = 'rgba(20,12,50,.88)'; roundRect(p.x - w / 2, p.y - 108, w, 32, 10); ctx.fill();
    ctx.fillStyle = '#e6dbff'; ctx.fillText(typing, p.x, p.y - 85);
  }
}
function drawShots(t){
  for (const s of S.shots){
    const a = Math.atan2(s.vy, s.vx);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
    if (s.kind === 'fire'){
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, s.r * 2);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(0.4, '#ff9a3d'); g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s.r * 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,50,.5)'; ctx.beginPath(); ctx.ellipse(-s.r * 2, 0, s.r * 1.6, s.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    } else if (s.kind === 'ice'){
      ctx.fillStyle = '#bff0ff'; ctx.strokeStyle = '#5fc8ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.r * 1.6, 0); ctx.lineTo(0, s.r * 0.8); ctx.lineTo(-s.r * 1.2, 0); ctx.lineTo(0, -s.r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (s.kind === 'wind'){
      ctx.strokeStyle = 'rgba(230,255,245,.95)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(-6, 0, s.r * 1.4, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,255,220,.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-16, 0, s.r * 1.2, -1, 1); ctx.stroke();
    } else {
      ctx.fillStyle = '#d6c2ff'; ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(179,139,255,.45)'; ctx.beginPath(); ctx.arc(-s.r * 1.5, 0, s.r * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // 천둥 번개 예고 (점점 차오르는 원)
  for (const z of S.zaps){
    const k = Math.min(1, (t - z.t0) / (z.at - z.t0));
    ctx.strokeStyle = 'rgba(255,240,120,.9)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,240,120,.18)'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * k, 0, Math.PI * 2); ctx.fill();
  }
}
function drawFx(t){
  for (const f of S.fx){
    const k = (t - f.t0) / f.life;
    ctx.globalAlpha = 1 - k;
    if (f.type === 'mark'){
      ctx.strokeStyle = '#5fe1ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + k * 14, 0, Math.PI * 2); ctx.stroke();
    } else if (f.type === 'puff' || f.type === 'poof'){
      ctx.fillStyle = f.kind === 'ice' ? '#bff0ff' : f.kind === 'fire' ? '#ffb15c' : '#ffffff';
      for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * k * 26, f.y + Math.sin(a) * k * 26, 5 * (1 - k) + 2, 0, Math.PI * 2); ctx.fill(); }
    } else if (f.type === 'blink'){
      ctx.strokeStyle = '#d6c2ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 40, 0, Math.PI * 2); ctx.stroke();
    } else if (f.type === 'heal'){
      ctx.fillStyle = '#7dffa8';
      for (let i = 0; i < 8; i++){ ctx.fillRect(f.x - 30 + i * 8, f.y + 10 - k * 50 - (i % 3) * 8, 4, 10); }
    } else if (f.type === 'bolt'){
      ctx.fillStyle = 'rgba(255,250,200,.55)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff7a8'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(f.x - 20, 0);
      ctx.lineTo(f.x + 15, f.y * 0.4); ctx.lineTo(f.x - 12, f.y * 0.7); ctx.lineTo(f.x, f.y); ctx.stroke();
    } else if (f.type === 'fizzle'){
      ctx.fillStyle = '#ff7b7b'; ctx.font = '800 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('퓨슉…', f.x, f.y - 50 - k * 20);
    }
    ctx.globalAlpha = 1;
  }
  for (const f of S.floats){
    const k = t - f.t0;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
    ctx.font = '800 24px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    ctx.strokeText(f.text, f.x, f.y - k * 40); ctx.fillText(f.text, f.x, f.y - k * 40);
    ctx.globalAlpha = 1;
  }
}
function draw(){
  const t = now();
  drawGround(); drawObstacles();
  drawFx(t);   // 바닥 효과(이동 표시 등)가 캐릭터 아래에 깔리도록 먼저
  drawDummy(t); drawPlayer(t); drawShots(t);
  // 이동 목표 점선
  const p = S.player;
  if (p.target){ ctx.strokeStyle = 'rgba(95,225,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.target.x, p.target.y); ctx.stroke(); ctx.setLineDash([]); }
}

/* ---------- 주문책·체력·기록 (HTML) ---------- */
function buildBook(){
  const ul = $('#book');
  ul.textContent = '';
  for (const sp of SPELLS){
    const li = document.createElement('li'); li.dataset.id = sp.id;
    const b = document.createElement('b'); b.textContent = sp.name;
    const s = document.createElement('span'); s.textContent = `${sp.desc} · 대기 ${sp.cd}초`;
    const em = document.createElement('em'), bar = document.createElement('i');
    li.append(b, s, em, bar); ul.appendChild(li);
  }
}
let hudAt = 0;
function updateHud(){
  const t = now();
  if (t - hudAt < 0.1) return;
  hudAt = t;
  for (const sp of SPELLS){
    const li = document.querySelector(`#book li[data-id="${sp.id}"]`); if (!li) continue;
    const left = L.cooldownLeft(S.cds[sp.id], sp.cd, t);
    li.classList.toggle('cool', left > 0);
    li.querySelector('em').textContent = left > 0 ? left.toFixed(1) + '초' : '✔';
    li.querySelector('i').style.width = (left > 0 ? left / sp.cd * 100 : 0) + '%';
  }
  const p = S.player;
  $('#hpText').textContent = `${Math.round(p.hp)} / ${p.max}`;
  $('#hpFill').style.width = (p.hp / p.max * 100) + '%';
  $('#shieldFill').style.width = (p.shieldUntil > t ? Math.min(1, p.shield / 30) * 100 : 0) + '%';
  const st = S.stats, total = st.ok + st.fail;
  $('#stats').innerHTML = `준 피해 <b>${st.dmg}</b> · 쓰러뜨림 <b>${st.kills}</b><br>주문 성공 <b>${st.ok}</b> · 실패 <b>${st.fail}</b> · 정확도 <b>${total ? Math.round(st.ok / total * 100) + '%' : '-'}</b>`;
}

/* ---------- 허수아비 모드 ---------- */
function setDummyMode(m){
  S.dummy.mode = m;
  $('#dStill').classList.toggle('on', m === 'still');
  $('#dMove').classList.toggle('on', m === 'move');
  focusSpell();
}
$('#dStill').onclick = () => setDummyMode('still');
$('#dMove').onclick = () => setDummyMode('move');

/* ---------- 시작 ---------- */
function loop(){ update(); draw(); updateHud(); requestAnimationFrame(loop); }
buildBook(); fit(); focusSpell();
requestAnimationFrame(loop);

// 테스트·나중 단계(온라인)를 위해 상태를 밖에서 볼 수 있게
window.__magic = {S, mouse, submitSpell, basicAttack, OBSTACLES};
})();

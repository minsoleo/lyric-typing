/* 주문 대결 1단계: 혼자 연습판 (허수아비 상대)
   - 맵은 화면보다 크고, 화면(카메라)이 내 캐릭터를 따라감 + 오른쪽 아래 작은 지도
   - 주문을 치고 Enter → "장전"(5초 안에) → 오른쪽 클릭으로 발사. 장전은 한 번에 하나만.
   - 게임 상태(S)를 바꾸는 부분과 그리는 부분(draw)을 나눠 둠 → 2단계 온라인에서 상태만 주고받기 쉽게 */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const L = window.MagicLogic, SPELLS = window.MAGIC_SPELLS, BASIC = window.MAGIC_BASIC, CHARGE = window.MAGIC_CHARGE_TIME || 5;
const WW = 3200, WH = 1800;              // 맵 전체 크기
const VW = 1600, VH = 900;               // 한 화면에 보이는 크기
const PLAYER_SPEED = 185, DUMMY_SPEED = 100, FAIL_LOCK = 0.8, RESPAWN = 3;

/* ---------- 밝은/어두운 버전 ---------- */
let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function applyTheme(){
  document.documentElement.dataset.theme = theme;
  const b = $('#themeBtn'), label = theme === 'light' ? '어두운 버전으로 바꾸기' : '밝은 버전으로 바꾸기';
  b.textContent = theme === 'light' ? '🌙' : '☀️'; b.title = label; b.setAttribute('aria-label', label);
}
$('#themeBtn').onclick = () => { theme = theme === 'light' ? 'dark' : 'light'; applyTheme(); try { localStorage.setItem('lyricTyping.theme', theme); } catch (e) {} focusSpell(); };
applyTheme();

/* ---------- 맵: 바위·나무(이동과 마법을 막음) + 연못 ---------- */
const OBSTACLES = [
  // 왼쪽 숲
  {x: 180, y: 160, w: 80, h: 80, kind: 'tree'}, {x: 330, y: 300, w: 80, h: 80, kind: 'tree'}, {x: 140, y: 1450, w: 90, h: 90, kind: 'tree'},
  {x: 360, y: 1580, w: 80, h: 80, kind: 'tree'}, {x: 760, y: 420, w: 110, h: 70, kind: 'rock'}, {x: 780, y: 1300, w: 130, h: 80, kind: 'rock'},
  // 가운데
  {x: 1250, y: 650, w: 80, h: 80, kind: 'tree'}, {x: 1900, y: 1060, w: 80, h: 80, kind: 'tree'}, {x: 1500, y: 260, w: 140, h: 70, kind: 'rock'},
  {x: 1450, y: 1450, w: 150, h: 80, kind: 'rock'}, {x: 1080, y: 1000, w: 90, h: 64, kind: 'rock'},
  // 연못 (지나갈 수 없음, 마법은 넘어감)
  {x: 2150, y: 700, w: 300, h: 190, kind: 'pond'},
  // 오른쪽
  {x: 2650, y: 260, w: 80, h: 80, kind: 'tree'}, {x: 2900, y: 520, w: 80, h: 80, kind: 'tree'}, {x: 2700, y: 1500, w: 90, h: 90, kind: 'tree'},
  {x: 2350, y: 1250, w: 120, h: 76, kind: 'rock'}, {x: 2950, y: 1100, w: 110, h: 70, kind: 'rock'}, {x: 2050, y: 300, w: 80, h: 80, kind: 'tree'}
];
const WALLS = OBSTACLES;                                        // 캐릭터를 막는 것 (전부)
const BLOCKERS = OBSTACLES.filter(o => o.kind !== 'pond');      // 마법을 막는 것 (연못 빼고)

/* ---------- 게임 상태 ---------- */
const now = () => performance.now() / 1000;
const makeDummy = (x, y) => ({x, y, baseX: x, r: 26, hp: 100, max: 100, shield: 0, shieldUntil: 0, frozenUntil: 0, dir: 1, deadUntil: 0});
const S = {
  player: {x: 520, y: 900, r: 22, hp: 100, max: 100, shield: 0, shieldUntil: 0, frozenUntil: 0, target: null, face: {x: 1, y: 0}},
  dummies: [makeDummy(1000, 880), makeDummy(2250, 1080), makeDummy(2550, 500)],
  dummyMode: 'still',
  shots: [], zaps: [], fx: [], floats: [],
  cds: {}, lastBasic: undefined, lockUntil: 0,
  charged: null,                                               // {spell, at, until}
  stats: {dmg: 0, kills: 0, ok: 0, fail: 0}
};
let cam = L.camFollow(S.player, VW, VH, WW, WH);
// 마우스는 "화면 안 위치"로 저장 → 카메라가 움직여도 맵 위 위치를 다시 계산
const mouse = {sx: VW / 2, sy: VH / 2, left: false, get x(){ return this.sx + cam.x; }, get y(){ return this.sy + cam.y; }};

/* ---------- 캔버스를 화면에 맞추기 (16:9 유지) ---------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let dpr = 1, scale = 1;
function fit(){
  const st = $('#stage'); dpr = window.devicePixelRatio || 1;
  const aw = st.clientWidth - 28, ah = st.clientHeight - 8;
  const w = Math.max(320, Math.min(aw, ah * VW / VH)), h = w * VH / VW;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  scale = w / VW;
}
window.addEventListener('resize', fit);

/* ---------- 마우스: 왼쪽 = 이동, 오른쪽 = 장전한 주문 발사(없으면 평타) ---------- */
function setMouse(e){
  const r = cv.getBoundingClientRect();
  mouse.sx = (e.clientX - r.left) / r.width * VW; mouse.sy = (e.clientY - r.top) / r.height * VH;
}
cv.addEventListener('mousedown', e => {
  e.preventDefault();                     // 클릭해도 주문 입력 칸이 포커스를 잃지 않게
  setMouse(e);
  if (e.button === 0){ mouse.left = true; setMoveTarget(); }
  else if (e.button === 2) rightClick();
  focusSpell();
});
cv.addEventListener('mousemove', e => { setMouse(e); if (mouse.left) S.player.target = {x: mouse.x, y: mouse.y}; });
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
function castMsg(m, kind, keep){
  const el = $('#castMsg');
  el.textContent = m; el.className = kind || '';
  clearTimeout(msgTimer);
  if (m && !keep) msgTimer = setTimeout(() => { el.textContent = ''; }, 1500);
}
function shakeCast(){ const b = $('#castBox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
function flashSlot(id){ const li = document.querySelector(`#book li[data-id="${id}"]`); if (li){ li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); } }

/* Enter: 주문 장전 */
function submitSpell(){
  const text = inp.value;
  if (!L.norm(text)) return;
  const t = now();
  // 이미 장전한 주문이 있으면 먼저 써야 함 (친 글자는 남겨 둠)
  if (S.charged){ castMsg(`⚡ ${S.charged.spell.name}부터 써요 (오른쪽 클릭)`, 'charge'); shakeCast(); return; }
  if (t < S.lockUntil){ castMsg('잠깐! 주문을 다시 외우는 중…', 'wait'); return; }
  const sp = L.findSpell(SPELLS, text);
  if (!sp){
    inp.value = '';
    S.lockUntil = t + FAIL_LOCK; S.stats.fail++;
    castMsg('주문 실패!', 'bad'); shakeCast();
    S.fx.push({type: 'fizzle', x: S.player.x, y: S.player.y - 40, t0: t, life: 0.6});
    return;
  }
  const left = L.cooldownLeft(S.cds[sp.id], sp.cd, t);
  if (left > 0){ castMsg(`${sp.name}: ${left.toFixed(1)}초 뒤에 다시`, 'wait'); return; }
  inp.value = '';
  S.charged = {spell: sp, at: t, until: t + CHARGE};
  S.stats.ok++;
  castMsg(`⚡ ${sp.name} 장전! 오른쪽 클릭`, 'charge', true);
  $('#castBox').classList.add('charged');
  flashSlot(sp.id);
}

/* 오른쪽 클릭: 장전한 주문 발사, 없으면 평타 */
function rightClick(){
  const t = now();
  if (S.charged){
    const sp = S.charged.spell;
    S.charged = null; $('#castBox').classList.remove('charged');
    S.cds[sp.id] = t;
    castSpell(sp, t);
    castMsg(sp.name + '!', 'good');
  } else basicAttack(t);
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
      to = L.pushOut(L.clampToWorld(to, p.r, WW, WH), p.r, WALLS);
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
      const at = L.clampToWorld(mouse, 0, WW, WH);
      S.zaps.push({x: at.x, y: at.y, r: sp.area, dmg: sp.dmg, t0: t, at: t + sp.delay});
      break;
    }
  }
}
function basicAttack(t){
  if (L.cooldownLeft(S.lastBasic, BASIC.cd, t) > 0) return;
  S.lastBasic = t;
  shoot('basic', BASIC);
}

/* ---------- 피해 ---------- */
function hurt(target, dmg, t, color){
  if (target.deadUntil) return;
  const r = L.applyDamage(target, dmg, t);
  target.hp = r.hp; target.shield = r.shield;
  S.stats.dmg += dmg - r.absorbed;
  S.floats.push({x: target.x + (Math.random() * 20 - 10), y: target.y - target.r - 14, text: r.absorbed ? `${dmg - r.absorbed} (막음 ${r.absorbed})` : String(dmg), color: color || '#ffd166', t0: t});
  if (S.dummies.includes(target) && target.hp <= 0){
    target.deadUntil = t + RESPAWN; S.stats.kills++;
    S.fx.push({type: 'poof', x: target.x, y: target.y, t0: t, life: 0.7});
  }
}

/* ---------- 한 프레임 진행 ---------- */
let last = now();
function update(){
  const t = now(), dt = Math.min(0.1, t - last); last = t;   // 느린 컴퓨터(초당 10장)까지는 느려지지 않게
  const p = S.player;

  // 내 캐릭터 이동 (얼어 있으면 못 움직임)
  if (p.target && t >= p.frozenUntil){
    const m = L.moveToward(p, p.target, PLAYER_SPEED * dt);
    const dx = m.x - p.x, dy = m.y - p.y, len = Math.hypot(dx, dy);
    if (len > 0.01) p.face = {x: dx / len, y: dy / len};
    const pos = L.pushOut(L.clampToWorld(m, p.r, WW, WH), p.r, WALLS);
    if (Math.hypot(pos.x - p.x, pos.y - p.y) < PLAYER_SPEED * dt * 0.1 && !m.arrived) p.target = null;   // 벽에 막히면 멈춤
    p.x = pos.x; p.y = pos.y;
    if (m.arrived) p.target = null;
  }

  // 장전 시간이 지나면 흩어짐
  if (S.charged && t >= S.charged.until){
    S.fx.push({type: 'fizzle', x: p.x, y: p.y - 40, t0: t, life: 0.6});
    castMsg(`${S.charged.spell.name}: 마력이 흩어졌어요`, 'bad');
    S.charged = null; $('#castBox').classList.remove('charged');
  }

  // 허수아비들
  for (const d of S.dummies){
    if (d.deadUntil && t >= d.deadUntil){ d.deadUntil = 0; d.hp = d.max; d.frozenUntil = 0; }
    if (!d.deadUntil && S.dummyMode === 'move' && t >= d.frozenUntil){
      d.x += d.dir * DUMMY_SPEED * dt;
      if (d.x > d.baseX + 220){ d.x = d.baseX + 220; d.dir = -1; }
      if (d.x < d.baseX - 220){ d.x = d.baseX - 220; d.dir = 1; }
    }
    if (S.dummyMode === 'still' && !d.deadUntil) d.x += (d.baseX - d.x) * Math.min(1, dt * 3);   // 제자리로
  }

  // 마법 날아가기
  for (const s of S.shots){
    const step = Math.hypot(s.vx, s.vy) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.trav += step;
    if (s.trav > s.range || s.x < -40 || s.x > WW + 40 || s.y < -40 || s.y > WH + 40){ s.dead = true; continue; }
    if (!s.pierce && L.pointInRects(s.x, s.y, s.r * 0.4, BLOCKERS)){
      s.dead = true; S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, kind: s.kind}); continue;
    }
    for (let i = 0; i < S.dummies.length && !s.dead; i++){
      const d = S.dummies[i];
      if (d.deadUntil || s.hit.has(i) || Math.hypot(s.x - d.x, s.y - d.y) >= s.r + d.r) continue;
      s.hit.add(i);
      hurt(d, s.dmg, t, s.kind === 'ice' ? '#9fe3ff' : s.kind === 'wind' ? '#e8fff6' : '#ffd166');
      if (s.freeze) d.frozenUntil = t + s.freeze;
      S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, kind: s.kind});
      if (!s.pierce) s.dead = true;
    }
  }
  S.shots = S.shots.filter(s => !s.dead);

  // 천둥 번개
  for (const z of S.zaps){
    if (t < z.at) continue;
    z.dead = true;
    S.fx.push({type: 'bolt', x: z.x, y: z.y, r: z.r, t0: t, life: 0.5});
    for (const d of S.dummies) if (!d.deadUntil && Math.hypot(z.x - d.x, z.y - d.y) < z.r + d.r) hurt(d, z.dmg, t, '#fff07a');
  }
  S.zaps = S.zaps.filter(z => !z.dead);

  S.fx = S.fx.filter(f => t - f.t0 < f.life);
  S.floats = S.floats.filter(f => t - f.t0 < 1);

  // 카메라가 캐릭터를 부드럽게 따라감
  const want = L.camFollow(p, VW, VH, WW, WH);
  cam = {x: cam.x + (want.x - cam.x) * Math.min(1, dt * 8), y: cam.y + (want.y - cam.y) * Math.min(1, dt * 8)};
}

/* ---------- 그리기 ---------- */
function roundRect(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function drawGround(){
  const g = ctx.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, '#2f6b45'); g.addColorStop(1, '#1f4d33');
  ctx.fillStyle = g; ctx.fillRect(0, 0, WW, WH);
  ctx.fillStyle = 'rgba(255,255,255,.035)';   // 잔디 격자 (보이는 곳만)
  const x0 = Math.floor(cam.x / 80) * 80, y0 = Math.floor(cam.y / 80) * 80;
  for (let x = x0; x < cam.x + VW + 80; x += 80) for (let y = y0; y < cam.y + VH + 80; y += 80) if (((x + y) / 80) % 2 === 0) ctx.fillRect(x, y, 80, 80);
  // 길
  ctx.strokeStyle = 'rgba(214,190,140,.28)'; ctx.lineWidth = 70; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(250, 900); ctx.bezierCurveTo(1100, 700, 1700, 1250, 3000, 850); ctx.stroke();
  // 가운데 마법진
  ctx.strokeStyle = 'rgba(179,139,255,.28)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(WW / 2, WH / 2, 150, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(WW / 2, WH / 2, 100, 0, Math.PI * 2); ctx.stroke();
  // 맵 테두리
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 16; ctx.strokeRect(0, 0, WW, WH);
}
function drawObstacles(){
  for (const o of OBSTACLES){
    if (o.kind === 'pond'){
      ctx.fillStyle = '#2b78a8'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 + 10, o.h / 2 + 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d94c9'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 - 6, o.h / 2 - 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x + o.w * 0.35, o.y + o.h * 0.45, 22, 0.2, 2.2); ctx.stroke();
    } else if (o.kind === 'rock'){
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
function drawDummy(d, t){
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
  // 장전 중: 발밑에 남은 시간 고리 + 지팡이 끝이 주문 색으로 빛남
  const ch = S.charged;
  if (ch){
    const k = Math.max(0, (ch.until - t) / CHARGE);
    ctx.strokeStyle = ch.spell.color; ctx.lineWidth = 5; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#7d4dff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(p.x + p.face.x * 6, p.y + p.face.y * 6 - 2, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4b2bb3';
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 12, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(p.x - 14, p.y - 13); ctx.lineTo(p.x + 4, p.y - 50); ctx.lineTo(p.x + 14, p.y - 13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffc928'; ctx.beginPath(); ctx.arc(p.x + 4, p.y - 50, 4, 0, Math.PI * 2); ctx.fill();
  const tipX = p.x + p.face.x * (p.r + 8), tipY = p.y + p.face.y * (p.r + 8);
  if (ch){
    const g = ctx.createRadialGradient(tipX, tipY, 1, tipX, tipY, 18 + Math.sin(t * 10) * 3);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, ch.spell.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tipX, tipY, 22, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = '#5fe1ff'; ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, Math.PI * 2); ctx.fill(); }
  bar(p.x, p.y - 66, 64, p.hp / p.max, '#ff5d73', p.shieldUntil > t ? p.shield / 30 : 0);
  // 머리 위 말풍선: 장전한 주문(금색) / 지금 치고 있는 글자
  const label = ch ? '⚡ ' + ch.spell.name : inp.value;
  if (label){
    ctx.font = '800 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 24;
    ctx.fillStyle = ch ? 'rgba(60,40,0,.9)' : 'rgba(20,12,50,.88)'; roundRect(p.x - w / 2, p.y - 108, w, 32, 10); ctx.fill();
    ctx.fillStyle = ch ? '#ffd84a' : '#e6dbff'; ctx.fillText(label, p.x, p.y - 85);
  }
}
function drawShots(t){
  for (const s of S.shots){
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
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
      for (let i = 0; i < 8; i++) ctx.fillRect(f.x - 30 + i * 8, f.y + 10 - k * 50 - (i % 3) * 8, 4, 10);
    } else if (f.type === 'bolt'){
      ctx.fillStyle = 'rgba(255,250,200,.55)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff7a8'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(f.x - 20, f.y - 420);
      ctx.lineTo(f.x + 15, f.y - 260); ctx.lineTo(f.x - 12, f.y - 120); ctx.lineTo(f.x, f.y); ctx.stroke();
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
// 오른쪽 아래 작은 지도
function drawMinimap(){
  const mw = 220, mh = mw * WH / WW, mx = VW - mw - 16, my = VH - mh - 16, k = mw / WW;
  ctx.fillStyle = 'rgba(10,8,30,.72)'; roundRect(mx - 4, my - 4, mw + 8, mh + 8, 10); ctx.fill();
  ctx.fillStyle = 'rgba(47,107,69,.9)'; ctx.fillRect(mx, my, mw, mh);
  for (const o of OBSTACLES){ ctx.fillStyle = o.kind === 'pond' ? '#3d94c9' : o.kind === 'rock' ? '#a9aec0' : '#1f6b3a'; ctx.fillRect(mx + o.x * k, my + o.y * k, Math.max(3, o.w * k), Math.max(3, o.h * k)); }
  for (const d of S.dummies){ ctx.fillStyle = d.deadUntil ? 'rgba(255,255,255,.35)' : '#ff8a5c'; ctx.beginPath(); ctx.arc(mx + d.x * k, my + d.y * k, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#d6c2ff'; ctx.beginPath(); ctx.arc(mx + S.player.x * k, my + S.player.y * k, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(mx + cam.x * k, my + cam.y * k, VW * k, VH * k);
}
function draw(){
  const t = now(), base = scale * dpr;
  ctx.setTransform(base, 0, 0, base, -cam.x * base, -cam.y * base);   // 맵 좌표로 그리기
  drawGround(); drawObstacles(); drawFx(t);
  const p = S.player;
  if (p.target){ ctx.strokeStyle = 'rgba(95,225,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.target.x, p.target.y); ctx.stroke(); ctx.setLineDash([]); }
  for (const d of S.dummies) drawDummy(d, t);
  drawPlayer(t); drawShots(t);
  ctx.setTransform(base, 0, 0, base, 0, 0);                            // 화면 좌표로 그리기
  drawMinimap();
}

/* ---------- 아래 주문 막대 · 체력 · 기록 ---------- */
function buildBook(){
  const ul = $('#book');
  ul.textContent = '';
  for (const sp of SPELLS){
    const li = document.createElement('li'); li.dataset.id = sp.id; li.title = `${sp.name}\n${sp.desc}\n다시 쓰기까지 ${sp.cd}초`;
    const b = document.createElement('b'); b.textContent = sp.name;
    const s = document.createElement('span'); s.textContent = sp.desc;
    const em = document.createElement('em'), bar = document.createElement('i');
    li.append(b, s, em, bar); ul.appendChild(li);
  }
}
let hudAt = 0;
function updateHud(){
  const t = now();
  if (t - hudAt < 0.1) return;
  hudAt = t;
  const ch = S.charged;
  for (const sp of SPELLS){
    const li = document.querySelector(`#book li[data-id="${sp.id}"]`); if (!li) continue;
    const left = L.cooldownLeft(S.cds[sp.id], sp.cd, t), isCh = !!ch && ch.spell.id === sp.id;
    li.classList.toggle('cool', left > 0);
    li.classList.toggle('charged', isCh);
    li.querySelector('em').textContent = isCh ? '⚡ ' + Math.max(0, ch.until - t).toFixed(1) + '초' : left > 0 ? left.toFixed(1) + '초' : '✔';
    li.querySelector('i').style.width = (isCh ? (ch.until - t) / CHARGE * 100 : left > 0 ? left / sp.cd * 100 : 0) + '%';
  }
  const p = S.player;
  $('#hpText').textContent = `${Math.round(p.hp)} / ${p.max}`;
  $('#hpFill').style.width = (p.hp / p.max * 100) + '%';
  $('#shieldFill').style.width = (p.shieldUntil > t ? Math.min(1, p.shield / 30) * 100 : 0) + '%';
  const st = S.stats, total = st.ok + st.fail;
  $('#stats').innerHTML = `준 피해 <b>${st.dmg}</b> · 쓰러뜨림 <b>${st.kills}</b> · 주문 정확도 <b>${total ? Math.round(st.ok / total * 100) + '%' : '-'}</b>`;
}

/* ---------- 허수아비 모드 ---------- */
function setDummyMode(m){
  S.dummyMode = m;
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
window.__magic = {S, mouse, submitSpell, rightClick, OBSTACLES, get cam(){ return cam; }, WW, WH};
})();

/* 숲속의 한바탕 1단계: 혼자 연습판 (허수아비 상대)
   - 캐릭터 3명(가데온·레이브·세라). 스킬 표는 magic-spells.js, 정리본은 docs/캐릭터-스킬표.md
   - 맵은 화면보다 크고 화면(카메라)이 캐릭터를 따라감 + 작은 지도
   - 스킬 + Enter → 장전(5초) → 오른쪽 클릭으로 발사. 장전은 한 번에 하나 (그림자 은신만 Enter로 바로)
   - 궁극기: 싸우면 게이지가 차오르고, 가득 차면 긴 이름을 쳐서 장전
   - 게임 상태(S)와 그리기(draw)를 나눠 둠 → 2단계 온라인에서 상태만 주고받기 쉽게 */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const L = window.MagicLogic, CLASSES = window.MAGIC_CLASSES, CHARGE = window.MAGIC_CHARGE_TIME || 5, U = window.MAGIC_ULT;
const WW = 3200, WH = 1800, VW = 1600, VH = 900;
const DUMMY_SPEED = 100, FAIL_LOCK = 0.8, RESPAWN = 3, SPAWN = {x: 520, y: 900}, DASH_SPEED = 900;
const DUMMY_SHOT = {dmg: 7, speed: 300, radius: 9, range: 700, look: 'enemy'}, DUMMY_RATE = 2.2, DUMMY_SIGHT = 650;
const AIM_RADIUS = 110;   // 목 긋기·숲속의 섬광: 마우스에서 이만큼 안에 있는 적을 "가리킨 적"으로 봄
const allSpells = c => c.spells.concat([c.ult]);

/* ---------- 밝은/어두운 버전 ---------- */
let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function applyTheme(){
  document.documentElement.dataset.theme = theme;
  const b = $('#themeBtn'), label = theme === 'light' ? '어두운 버전으로 바꾸기' : '밝은 버전으로 바꾸기';
  b.textContent = theme === 'light' ? '🌙' : '☀️'; b.title = label; b.setAttribute('aria-label', label);
}
$('#themeBtn').onclick = () => { theme = theme === 'light' ? 'dark' : 'light'; applyTheme(); try { localStorage.setItem('lyricTyping.theme', theme); } catch (e) {} focusSpell(); };
applyTheme();

/* ---------- 숲 맵 ---------- */
const tree = (x, y, s = 80) => ({x, y, w: s, h: s, kind: 'tree'});
const OBSTACLES = [
  tree(180, 160), tree(330, 300), tree(140, 1450, 90), tree(360, 1580), tree(1250, 650), tree(1900, 1060), tree(2650, 260), tree(2900, 520),
  tree(2700, 1500, 90), tree(2050, 300), tree(620, 120, 96), tree(1020, 210), tree(1320, 110, 100), tree(1760, 170, 90), tree(2380, 140),
  tree(3020, 150, 96), tree(3060, 820), tree(2620, 900), tree(1720, 1610, 100), tree(1100, 1650, 90), tree(600, 1690), tree(2230, 1620, 96),
  tree(3040, 1640), tree(110, 700), tree(100, 1060, 90), tree(1700, 760), tree(820, 1560), tree(2920, 1230),
  {x: 760, y: 420, w: 110, h: 70, kind: 'rock'}, {x: 780, y: 1300, w: 130, h: 80, kind: 'rock'}, {x: 1500, y: 260, w: 140, h: 70, kind: 'rock'},
  {x: 1450, y: 1450, w: 150, h: 80, kind: 'rock'}, {x: 1080, y: 1000, w: 90, h: 64, kind: 'rock'}, {x: 2350, y: 1250, w: 120, h: 76, kind: 'rock'},
  {x: 2950, y: 1100, w: 110, h: 70, kind: 'rock'},
  {x: 2150, y: 700, w: 300, h: 190, kind: 'pond'}
];
const WALLS = OBSTACLES, BLOCKERS = OBSTACLES.filter(o => o.kind !== 'pond');
// 꾸미기(풀·꽃·버섯·덤불): 부딪히지 않음. 매번 같은 자리에 나오게 정해진 난수 사용
const DECOR = (() => {
  let s = 20261118; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [], kinds = ['grass', 'grass', 'grass', 'flower', 'flower', 'mush', 'bush'];
  for (let i = 0; i < 420; i++){
    const x = rnd() * WW, y = rnd() * WH, kind = kinds[Math.floor(rnd() * kinds.length)];
    if (L.pointInRects(x, y, 30, OBSTACLES)) continue;
    out.push({x, y, kind, hue: rnd()});
  }
  return out;
})();

/* ---------- 게임 상태 ---------- */
const now = () => performance.now() / 1000;
const makeDummy = (x, y) => ({x, y, baseX: x, baseY: y, r: 26, hp: 100, max: 100, shield: 0, shieldUntil: 0, frozenUntil: 0, frozenKind: 'ice',
  dir: 1, deadUntil: 0, nextShot: 0, fx: [], pull: null, homeAt: 0});
let cls = CLASSES.find(c => c.id === loadClass()) || CLASSES[1];
const S = {
  player: null,
  dummies: [makeDummy(1000, 880), makeDummy(2250, 1080), makeDummy(2550, 500)],
  dummyMode: 'still',
  shots: [], zones: [], walls: [], sanctums: [], fx: [], floats: [], tint: null,
  cds: {}, lastBasic: undefined, lockUntil: 0, charged: null, ult: 0,
  stats: {dmg: 0, kills: 0, ok: 0, fail: 0, healed: 0, taken: 0}
};
function makePlayer(c){
  return {x: SPAWN.x, y: SPAWN.y, r: c.r, hp: c.hp, max: c.hp, speed: c.speed, shield: 0, shieldUntil: 0,
    frozenUntil: 0, deadUntil: 0, target: null, dash: null, flurry: null, stealthUntil: 0, stealthTag: null, fx: [], face: {x: 1, y: 0}};
}
S.player = makePlayer(cls);
let cam = L.camFollow(S.player, VW, VH, WW, WH);
const mouse = {sx: VW / 2, sy: VH / 2, left: false, get x(){ return this.sx + cam.x; }, get y(){ return this.sy + cam.y; }};
function loadClass(){ try { return localStorage.getItem('magic.class'); } catch (e) { return null; } }

/* ---------- 캔버스 맞추기 ---------- */
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

/* ---------- 마우스 ---------- */
function setMouse(e){ const r = cv.getBoundingClientRect(); mouse.sx = (e.clientX - r.left) / r.width * VW; mouse.sy = (e.clientY - r.top) / r.height * VH; }
cv.addEventListener('mousedown', e => {
  e.preventDefault(); setMouse(e);
  if (e.button === 0){ mouse.left = true; setMoveTarget(); }
  else if (e.button === 2) rightClick();
  focusSpell();
});
cv.addEventListener('mousemove', e => { setMouse(e); if (mouse.left && !S.player.dash) S.player.target = {x: mouse.x, y: mouse.y}; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
function setMoveTarget(){
  if (S.player.dash || S.player.deadUntil) return;
  S.player.target = {x: mouse.x, y: mouse.y};
  S.fx.push({type: 'mark', x: mouse.x, y: mouse.y, t0: now(), life: 0.5});
}

/* ---------- 키보드: 스킬 입력 ---------- */
const inp = $('#spellInput');
let pending = false;
function focusSpell(){ if ($('#pick').hidden && document.activeElement !== inp) inp.focus({preventScroll: true}); }
inp.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ e.preventDefault(); inp.value = ''; castMsg(''); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (e.isComposing){ pending = true; return; }
  submitSpell();
});
inp.addEventListener('compositionend', () => { if (pending){ pending = false; setTimeout(submitSpell, 0); } });
window.addEventListener('focus', focusSpell);
document.addEventListener('keydown', e => { if ($('#pick').hidden && document.activeElement !== inp && e.key.length === 1 && !e.ctrlKey && !e.metaKey) focusSpell(); });

let msgTimer = 0;
function castMsg(m, kind, keep){
  const el = $('#castMsg'); el.textContent = m; el.className = kind || '';
  clearTimeout(msgTimer); if (m && !keep) msgTimer = setTimeout(() => { el.textContent = ''; }, 1600);
}
function shakeCast(){ const b = $('#castBox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
function flashSlot(id){ const li = document.querySelector(`#book li[data-id="${id}"]`); if (li){ li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); } }
function clearCharge(){ S.charged = null; $('#castBox').classList.remove('charged'); }

/* Enter: 스킬 장전 */
function submitSpell(){
  const text = inp.value;
  if (!L.norm(text)) return;
  const t = now(), p = S.player;
  if (p.deadUntil){ castMsg('쓰러져 있어요…', 'wait'); return; }
  const sp = L.findSpell(allSpells(cls), text);
  const isUlt = sp === cls.ult;
  const cdLeft = sp && !isUlt ? L.cooldownLeft(S.cds[sp.id], sp.cd, t) : 0;
  // 그림자 은신: 장전 없이, 다른 스킬을 장전한 채로도 바로 씀
  if (sp && sp.instant && t >= S.lockUntil){
    if (cdLeft > 0){ castMsg(`${sp.name}: ${cdLeft.toFixed(1)}초 뒤에 다시`, 'wait'); return; }
    inp.value = ''; S.cds[sp.id] = t; S.stats.ok++; gainUlt(U.typed, t);
    castSpell(sp, t); castMsg(sp.name + '!', 'good'); flashSlot(sp.id);
    return;
  }
  if (S.charged){ castMsg(`⚡ ${S.charged.spell.name}부터 써요 (오른쪽 클릭)`, 'charge'); shakeCast(); return; }
  if (t < S.lockUntil){ castMsg('잠깐! 다시 집중하는 중…', 'wait'); return; }
  if (!sp){
    inp.value = ''; S.lockUntil = t + FAIL_LOCK; S.stats.fail++;
    const other = CLASSES.find(c => c !== cls && L.findSpell(allSpells(c), text));
    castMsg(other ? `그건 ${other.name}(${other.role}) 스킬이에요!` : '스킬 실패!', 'bad'); shakeCast();
    S.fx.push({type: 'fizzle', x: p.x, y: p.y - 40, t0: t, life: 0.6});
    return;
  }
  if (isUlt && S.ult < U.need){ castMsg(`궁극기 게이지 ${Math.floor(S.ult / U.need * 100)}% — 싸우면 차올라요`, 'wait'); return; }
  if (cdLeft > 0){ castMsg(`${sp.name}: ${cdLeft.toFixed(1)}초 뒤에 다시`, 'wait'); return; }
  inp.value = '';
  S.charged = {spell: sp, at: t, until: t + CHARGE};
  S.stats.ok++; if (!isUlt) gainUlt(U.typed, t);
  castMsg(`⚡ ${isUlt ? '궁극기 ' : ''}${sp.name} 장전! 오른쪽 클릭`, 'charge', true);
  $('#castBox').classList.add('charged');
  flashSlot(sp.id);
}

/* 오른쪽 클릭: 장전한 스킬 발사, 없으면 평타 */
function rightClick(){
  const t = now(), p = S.player;
  if (p.deadUntil) return;
  if (S.charged){
    const sp = S.charged.spell;
    let target = null;
    if (sp.type === 'leap' || sp.type === 'stun'){
      target = L.pickTarget(S.dummies.filter(d => !d.deadUntil), mouse, AIM_RADIUS, p, sp.reach);
      if (!target){ castMsg('가까이 있는 적을 마우스로 가리키고 오른쪽 클릭!', 'wait'); return; }
    }
    breakStealth(t);
    clearCharge();
    if (sp === cls.ult) S.ult = 0; else S.cds[sp.id] = t;
    castSpell(sp, t, target); castMsg(sp.name + '!', 'good');
  } else basicAttack(t);
}

/* ---------- 스킬 효과 (type별) ---------- */
function aimDir(from){
  const dx = mouse.x - from.x, dy = mouse.y - from.y, d = Math.hypot(dx, dy) || 1;
  return {x: dx / d, y: dy / d};
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = () => S.dummies.filter(d => !d.deadUntil);
function shoot(owner, from, dir, o, src){
  S.shots.push({owner, src, look: o.look || 'basic', x: from.x + dir.x * (from.r + 6), y: from.y + dir.y * (from.r + 6), vx: dir.x * o.speed, vy: dir.y * o.speed,
    r: o.radius, dmg: o.dmg, range: o.range, trav: 0, pierce: !!o.pierce, freeze: o.freeze || 0, pull: !!o.pull, basic: !!o.basic, color: o.color, hit: new Set()});
}
function melee(t, o, isBasic, color){
  const p = S.player, dir = aimDir(p); p.face = dir;
  const reach = p.r + o.reach;
  for (const d of alive()) if (L.inArc(p, dir, d, reach + d.r, o.arc)) playerHit(d, o.dmg, t, {basic: isBasic, color});
  S.fx.push({type: 'swing', x: p.x, y: p.y, a: Math.atan2(dir.y, dir.x), r: reach, arc: o.arc * Math.PI / 180, t0: t, life: 0.2, color: color || '#ffffff'});
}
function applyBuff(sp, t){
  const p = S.player;
  for (const f of sp.fx || []) L.addEffect(p.fx, f.kind, f.value, t + sp.time, sp.id);
  if (sp.heal) healPlayer(sp.heal, t);
  S.fx.push({type: 'buff', x: p.x, y: p.y, t0: t, life: 0.8, color: sp.color});
}
function explode(at, o, t, color){
  S.fx.push({type: 'ring', x: at.x, y: at.y, r: o.area, t0: t, life: 0.5, color});
  for (const d of alive()) if (dist(d, at) < o.area + d.r) playerHit(d, o.dmg, t, {color});
}
function breakStealth(t){
  const p = S.player;
  if (p.stealthUntil > t){ p.fx = L.removeTag(p.fx, p.stealthTag); S.fx.push({type: 'smoke', x: p.x, y: p.y, t0: t, life: 0.5}); }
  p.stealthUntil = 0;
}
function castSpell(sp, t, target){
  const p = S.player;
  switch (sp.type){
    case 'shot': { const d = aimDir(p); p.face = d; shoot('me', p, d, sp); break; }
    case 'dash': {
      const to = L.clampToWorld(L.clampReach(p, mouse, sp.reach), p.r, WW, WH);
      p.dash = {to, dmg: sp.dmg || 0, boom: sp.boom || null, color: sp.color, speed: DASH_SPEED, hit: new Set()}; p.target = null; p.face = aimDir(p);
      if (sp.healAll){ healPlayer(sp.healAll, t); S.fx.push({type: 'heal', x: p.x, y: p.y, t0: t, life: 0.8}); }
      break;
    }
    case 'slash': {
      melee(t, sp, false, sp.color);
      const back = L.clampToWorld({x: p.x - p.face.x * sp.back, y: p.y - p.face.y * sp.back}, p.r, WW, WH);
      p.dash = {to: back, dmg: 0, speed: 1100, hit: new Set()}; p.target = null;
      break;
    }
    case 'wall': {
      const d = aimDir(p); p.face = d;
      S.walls.push({pts: L.wallPoints({x: p.x + d.x * sp.dist, y: p.y + d.y * sp.dist}, d, sp.length, 30), r: 22, t0: t, until: t + sp.time});
      break;
    }
    case 'flurry': p.flurry = {until: t + sp.time, next: t, sp}; break;
    case 'buff': applyBuff(sp, t); break;
    case 'stealth':
      p.stealthUntil = t + sp.time; p.stealthTag = sp.id; applyBuff(sp, t);
      S.fx.push({type: 'smoke', x: p.x, y: p.y, t0: t, life: 0.6});
      break;
    case 'leap': {
      const ux = (target.x - p.x) / (dist(target, p) || 1), uy = (target.y - p.y) / (dist(target, p) || 1), from = {x: p.x, y: p.y}, gap = target.r + p.r + 6;
      const to = L.pushOut(L.clampToWorld({x: target.x + ux * gap, y: target.y + uy * gap}, p.r, WW, WH), p.r, WALLS);
      p.x = to.x; p.y = to.y; p.target = null; p.face = {x: -ux, y: -uy};
      S.fx.push({type: 'blink', x: from.x, y: from.y, t0: t, life: 0.45, color: sp.color}, {type: 'cut', x: target.x, y: target.y, t0: t, life: 0.45, color: sp.color});
      playerHit(target, sp.dmg, t, {color: sp.color});
      break;
    }
    case 'stun':
      target.frozenUntil = Math.max(target.frozenUntil, t + sp.time); target.frozenKind = 'stun';
      S.fx.push({type: 'flash', x: target.x, y: target.y, t0: t, life: 0.5});
      break;
    case 'zone': {
      const at = L.clampToWorld(L.clampReach(p, mouse, sp.reach), 0, WW, WH);
      S.zones.push({x: at.x, y: at.y, r: sp.area, rate: sp.heal / sp.time, until: t + sp.time, t0: t, color: sp.color, acc: 0});
      break;
    }
    case 'slowfield':
      for (const d of alive()) if (dist(d, p) < sp.area + d.r) L.addEffect(d.fx, 'speed', -sp.slow, t + sp.time, sp.id);
      applyBuff(sp, t);
      S.fx.push({type: 'ring', x: p.x, y: p.y, r: sp.area, t0: t, life: 0.8, color: sp.color});
      S.tint = {until: t + sp.time, t0: t, color: '90,60,190'};
      break;
    case 'sanctum': {
      const at = L.clampToWorld(L.clampReach(p, mouse, sp.reach), 0, WW, WH);
      S.sanctums.push({x: at.x, y: at.y, r: sp.area, t0: t, until: t + sp.time, healRate: sp.heal / sp.time, dmgPer: sp.dmg / sp.time, weak: sp.weak, nextTick: t + 1, acc: 0, id: sp.id});
      break;
    }
  }
}
function basicAttack(t){
  const b = cls.basic;
  if (L.cooldownLeft(S.lastBasic, b.cd, t) > 0) return;
  S.lastBasic = t; breakStealth(t);
  if (b.melee) melee(t, b, true, '#ffffff');
  else { const d = aimDir(S.player); S.player.face = d; shoot('me', S.player, d, Object.assign({basic: true}, b)); }
}

/* ---------- 피해 · 회복 · 궁극기 게이지 ---------- */
function gainUlt(x, t){
  const was = S.ult; S.ult = L.gainUlt(S.ult, x, U.need);
  if (was < U.need && S.ult >= U.need){
    if (!S.charged) castMsg('🌟 궁극기 준비 완료! 긴 이름을 쳐 봐요', 'charge');
    S.floats.push({x: S.player.x, y: S.player.y - 70, text: '🌟 궁극기 준비!', color: '#ffd84a', t0: t});
    flashSlot(cls.ult.id);
  }
}
function healPlayer(amount, t, silent){
  const p = S.player, before = p.hp;
  p.hp = Math.min(p.max, p.hp + amount);
  const got = p.hp - before; S.stats.healed += got; gainUlt(got * U.heal, t);
  if (!silent && got > 0) S.floats.push({x: p.x, y: p.y - 40, text: '+' + Math.round(got), color: '#5ce08a', t0: t});
  return got;
}
// 내가 적에게: 공격력 증가·평타 강화·상대 상태를 계산해서 피해
function playerHit(d, base, t, o){
  const p = S.player, mult = o.basic ? 1 + L.effectSum(p.fx, 'basic', t) : 1;
  const dealt = hurt(d, L.calcDamage(base * mult, p.fx, d.fx, t), t, o.color);
  if (!o.noUlt) gainUlt(dealt * (o.basic ? U.basicDmg : U.spellDmg), t);
}
function hurt(target, dmg, t, color){
  if (target.deadUntil) return 0;
  const r = L.applyDamage(target, dmg, t);
  target.hp = r.hp; target.shield = r.shield;
  const isMe = target === S.player, got = dmg - r.absorbed;
  if (isMe){ S.stats.taken += got; gainUlt(got * U.taken, t); } else S.stats.dmg += got;
  S.floats.push({x: target.x + (Math.random() * 20 - 10), y: target.y - target.r - 14, text: (isMe ? '-' : '') + got, color: isMe ? '#ff7b7b' : color || '#ffd166', t0: t});
  if (target.hp > 0) return got;
  target.deadUntil = t + RESPAWN;
  S.fx.push({type: 'poof', x: target.x, y: target.y, t0: t, life: 0.7});
  if (isMe){ Object.assign(target, {target: null, dash: null, flurry: null, stealthUntil: 0, fx: []}); clearCharge(); castMsg('쓰러졌어요! 3초 뒤 다시 일어나요', 'bad'); }
  else { S.stats.kills++; target.fx = []; target.pull = null; }
  return got;
}

/* ---------- 한 프레임 진행 ---------- */
let last = now();
function update(){
  const t = now(), dt = Math.min(0.1, t - last); last = t;
  const p = S.player;
  p.fx = L.pruneEffects(p.fx, t);

  // 내가 쓰러졌다가 다시 일어남
  if (p.deadUntil && t >= p.deadUntil){ Object.assign(p, {deadUntil: 0, hp: p.max, x: SPAWN.x, y: SPAWN.y, frozenUntil: 0}); }
  if (p.stealthUntil && t >= p.stealthUntil) p.stealthUntil = 0;

  if (!p.deadUntil){
    const spd = p.speed * Math.max(0.2, 1 + L.effectSum(p.fx, 'speed', t));
    if (p.dash){                                         // 돌진: 빠르게 미끄러지며 부딪힌 허수아비에 피해
      const m = L.moveToward(p, p.dash.to, p.dash.speed * dt);
      const pos = L.pushOut(m, p.r, WALLS);
      const blocked = Math.hypot(pos.x - m.x, pos.y - m.y) > 1;
      p.x = pos.x; p.y = pos.y;
      if (p.dash.dmg) for (const d of alive()) if (!p.dash.hit.has(d) && dist(d, p) < d.r + p.r + 8){ p.dash.hit.add(d); playerHit(d, p.dash.dmg, t, {color: p.dash.color}); }
      if (Math.random() < 0.6) S.fx.push({type: 'dust', x: p.x, y: p.y + p.r, t0: t, life: 0.4});
      if (m.arrived || blocked){ if (p.dash.boom) explode(p, p.dash.boom, t, p.dash.color); p.dash = null; }
    } else if (p.target && t >= p.frozenUntil){
      const m = L.moveToward(p, p.target, spd * dt);
      const dx = m.x - p.x, dy = m.y - p.y, len = Math.hypot(dx, dy);
      if (len > 0.01 && !p.flurry) p.face = {x: dx / len, y: dy / len};
      const pos = L.pushOut(L.clampToWorld(m, p.r, WW, WH), p.r, WALLS);
      if (Math.hypot(pos.x - p.x, pos.y - p.y) < spd * dt * 0.1 && !m.arrived) p.target = null;
      p.x = pos.x; p.y = pos.y;
      if (m.arrived) p.target = null;
    }
    // 주먹 폭풍: 정해진 시간 동안 마우스 쪽으로 계속 주먹
    if (p.flurry){
      while (p.flurry && t >= p.flurry.next && p.flurry.next < p.flurry.until){ melee(t, p.flurry.sp, false, p.flurry.sp.color); p.flurry.next += p.flurry.sp.every; }
      if (p.flurry && t >= p.flurry.until) p.flurry = null;
    }
  }

  if (S.charged && t >= S.charged.until){
    S.fx.push({type: 'fizzle', x: p.x, y: p.y - 40, t0: t, life: 0.6});
    castMsg(`${S.charged.spell.name}: 힘이 흩어졌어요`, 'bad'); clearCharge();
  }

  // 회복 샘
  for (const z of S.zones){
    if (!p.deadUntil && dist(p, z) < z.r){
      z.acc += healPlayer(z.rate * dt, t, true);
      if (z.acc >= 5){ S.floats.push({x: p.x, y: p.y - 40, text: '+' + Math.round(z.acc), color: '#5ce08a', t0: t}); z.acc = 0; }
    }
  }
  S.zones = S.zones.filter(z => t < z.until);

  // 새벽의 성역: 안의 아군 회복, 안의 적은 1초마다 피해 + 나약함
  for (const s of S.sanctums){
    if (!p.deadUntil && dist(p, s) < s.r){
      s.acc += healPlayer(s.healRate * dt, t, true);
      if (s.acc >= 5){ S.floats.push({x: p.x, y: p.y - 40, text: '+' + Math.round(s.acc), color: '#5ce08a', t0: t}); s.acc = 0; }
    }
    const tick = t >= s.nextTick; if (tick) s.nextTick += 1;
    for (const d of alive()) if (dist(d, s) < s.r + d.r){
      L.addEffect(d.fx, 'atk', -s.weak, t + 0.5, s.id);
      if (tick) playerHit(d, s.dmgPer, t, {color: '#fff0a0', noUlt: true});
    }
  }
  S.sanctums = S.sanctums.filter(s => t < s.until);
  S.walls = S.walls.filter(w => t < w.until);
  if (S.tint && t >= S.tint.until) S.tint = null;

  // 허수아비들
  for (const d of S.dummies){
    if (d.deadUntil && t >= d.deadUntil){ Object.assign(d, {deadUntil: 0, hp: d.max, frozenUntil: 0, x: d.baseX, y: d.baseY, fx: []}); }
    if (d.deadUntil) continue;
    d.fx = L.pruneEffects(d.fx, t);
    if (d.pull){                                         // 강철 사슬에 끌려옴
      const m = L.moveToward(d, d.pull, 1300 * dt);
      d.x = m.x; d.y = m.y;
      if (m.arrived){ d.pull = null; d.homeAt = t + 1.5; }
      continue;
    }
    const free = t >= d.frozenUntil, home = t >= d.homeAt, mult = Math.max(0.2, 1 + L.effectSum(d.fx, 'speed', t));
    if (free && home){
      d.y += (d.baseY - d.y) * Math.min(1, dt * 3);
      if (S.dummyMode === 'move'){
        d.x += d.dir * DUMMY_SPEED * mult * dt;
        if (d.x > d.baseX + 220) d.dir = -1;
        if (d.x < d.baseX - 220) d.dir = 1;
      } else d.x += (d.baseX - d.x) * Math.min(1, dt * 3);
    }
    // 반격 모드: 가까이 오면 나에게 마법을 쏨 (투명하면 못 봄)
    if (S.dummyMode === 'attack' && free && !p.deadUntil && p.stealthUntil <= t && t >= d.nextShot && dist(p, d) < DUMMY_SIGHT){
      const dx = p.x - d.x, dy = p.y - d.y, len = Math.hypot(dx, dy) || 1;
      shoot('dummy', d, {x: dx / len, y: dy / len}, DUMMY_SHOT, d);
      d.nextShot = t + (DUMMY_RATE + Math.random() * 0.6) / mult;
    }
  }

  // 날아가는 공격
  for (const s of S.shots){
    const step = Math.hypot(s.vx, s.vy) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.trav += step;
    if (s.trav > s.range || s.x < -40 || s.x > WW + 40 || s.y < -40 || s.y > WH + 40){ s.dead = true; continue; }
    if (!s.pierce && L.pointInRects(s.x, s.y, s.r * 0.4, BLOCKERS)){ s.dead = true; S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, look: s.look}); continue; }
    if (s.owner === 'dummy'){
      if (S.walls.some(w => w.pts.some(q => Math.hypot(s.x - q.x, s.y - q.y) < s.r + w.r))){ s.dead = true; S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, look: 'rock'}); continue; }
      if (!p.deadUntil && dist(s, p) < s.r + p.r){
        hurt(p, L.calcDamage(s.dmg, s.src ? s.src.fx : [], p.fx, t), t);
        s.dead = true; S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, look: s.look});
      }
      continue;
    }
    for (const d of S.dummies){
      if (s.dead) break;
      if (d.deadUntil || s.hit.has(d) || dist(s, d) >= s.r + d.r) continue;
      s.hit.add(d);
      playerHit(d, s.dmg, t, {basic: s.basic, color: s.color || '#ffd166'});
      if (s.freeze && !d.deadUntil){ d.frozenUntil = t + s.freeze; d.frozenKind = 'ice'; }
      if (s.pull && !d.deadUntil){
        const ux = (d.x - p.x) / (dist(d, p) || 1), uy = (d.y - p.y) / (dist(d, p) || 1), gap = p.r + d.r + 16;
        d.pull = L.pushOut({x: p.x + ux * gap, y: p.y + uy * gap}, d.r, WALLS);
      }
      S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, look: s.look});
      if (!s.pierce) s.dead = true;
    }
  }
  S.shots = S.shots.filter(s => !s.dead);

  S.fx = S.fx.filter(f => t - f.t0 < f.life);
  S.floats = S.floats.filter(f => t - f.t0 < 1);

  const want = L.camFollow(p, VW, VH, WW, WH);
  cam = {x: cam.x + (want.x - cam.x) * Math.min(1, dt * 8), y: cam.y + (want.y - cam.y) * Math.min(1, dt * 8)};
}

/* ---------- 그리기 ---------- */
function roundRect(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function circle(x, y, r){ ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
const inView = (x, y, pad) => x > cam.x - pad && x < cam.x + VW + pad && y > cam.y - pad && y < cam.y + VH + pad;
function drawGround(t){
  const g = ctx.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, '#2c6440'); g.addColorStop(1, '#1d4a2c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, WW, WH);
  ctx.fillStyle = 'rgba(255,255,255,.025)';
  const x0 = Math.floor(cam.x / 80) * 80, y0 = Math.floor(cam.y / 80) * 80;
  for (let x = x0; x < cam.x + VW + 80; x += 80) for (let y = y0; y < cam.y + VH + 80; y += 80) if (((x + y) / 80) % 2 === 0) ctx.fillRect(x, y, 80, 80);
  // 흙길
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(140,105,60,.45)'; ctx.lineWidth = 76;
  ctx.beginPath(); ctx.moveTo(250, 900); ctx.bezierCurveTo(1100, 700, 1700, 1250, 3000, 850); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,150,95,.35)'; ctx.lineWidth = 50; ctx.stroke();
  // 가운데 공터: 이끼 낀 돌 둘레
  ctx.fillStyle = 'rgba(120,170,90,.22)'; circle(WW / 2, WH / 2, 170);
  for (let i = 0; i < 14; i++){
    const a = i / 14 * Math.PI * 2, x = WW / 2 + Math.cos(a) * 170, y = WH / 2 + Math.sin(a) * 170;
    ctx.fillStyle = '#7f8a7a'; circle(x, y, 13); ctx.fillStyle = '#7fb069'; circle(x - 3, y - 4, 6);
  }
  // 풀·꽃·버섯·덤불
  for (const d of DECOR){
    if (!inView(d.x, d.y, 40)) continue;
    if (d.kind === 'grass'){
      ctx.strokeStyle = d.hue > 0.5 ? '#4f9a5c' : '#3f8a4f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(d.x - 6, d.y); ctx.lineTo(d.x - 9, d.y - 12); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 15); ctx.moveTo(d.x + 6, d.y); ctx.lineTo(d.x + 10, d.y - 11); ctx.stroke();
    } else if (d.kind === 'flower'){
      ctx.fillStyle = d.hue < 0.33 ? '#ffd9f0' : d.hue < 0.66 ? '#fff3a0' : '#c9d8ff';
      for (let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; circle(d.x + Math.cos(a) * 5, d.y + Math.sin(a) * 5, 3.5); }
      ctx.fillStyle = '#ffb02e'; circle(d.x, d.y, 2.6);
    } else if (d.kind === 'mush'){
      ctx.fillStyle = '#efe4cf'; ctx.fillRect(d.x - 3, d.y - 4, 6, 9);
      ctx.fillStyle = d.hue > 0.5 ? '#d9534f' : '#c98a3d'; ctx.beginPath(); ctx.arc(d.x, d.y - 4, 9, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fff'; circle(d.x - 3, d.y - 8, 1.6); circle(d.x + 3, d.y - 7, 1.4);
    } else {
      ctx.fillStyle = '#2f7a43'; circle(d.x - 12, d.y, 15); circle(d.x + 12, d.y, 15); ctx.fillStyle = '#3b9152'; circle(d.x, d.y - 7, 17);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 16; ctx.strokeRect(0, 0, WW, WH);
}
function drawObstacles(){
  for (const o of OBSTACLES){
    if (!inView(o.x + o.w / 2, o.y + o.h / 2, 200)) continue;
    if (o.kind === 'pond'){
      ctx.fillStyle = '#5c7f3e'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 + 18, o.h / 2 + 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b78a8'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 + 8, o.h / 2 + 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d94c9'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 - 8, o.h / 2 - 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5bbf6a'; circle(o.x + o.w * 0.72, o.y + o.h * 0.62, 16); circle(o.x + o.w * 0.25, o.y + o.h * 0.3, 12);   // 연잎
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x + o.w * 0.4, o.y + o.h * 0.5, 22, 0.2, 2.2); ctx.stroke();
    } else if (o.kind === 'rock'){
      ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(o.x + 4, o.y + 8, o.w, o.h, 18); ctx.fill();
      ctx.fillStyle = '#80867f'; roundRect(o.x, o.y, o.w, o.h, 18); ctx.fill();
      ctx.fillStyle = '#9fa69c'; roundRect(o.x + 8, o.y + 6, o.w * 0.55, o.h * 0.35, 12); ctx.fill();
      ctx.fillStyle = '#6fa35a'; roundRect(o.x + o.w * 0.5, o.y - 2, o.w * 0.4, 14, 7); ctx.fill();   // 이끼
    } else {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w * 0.68;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(cx + 8, cy + 16, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5e4128'; ctx.fillRect(cx - 8, cy, 16, o.h * 0.55);
      ctx.fillStyle = '#1f6e3b'; circle(cx, cy - 4, r);
      ctx.fillStyle = '#2a8a4a'; circle(cx - r * 0.35, cy - r * 0.2, r * 0.6); circle(cx + r * 0.35, cy - r * 0.3, r * 0.55);
      ctx.fillStyle = '#3fa85f'; circle(cx - r * 0.3, cy - r * 0.45, r * 0.32);
    }
  }
}
function bar(x, y, w, ratio, color){
  ctx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(x - w / 2, y, w, 8, 4); ctx.fill();
  ctx.fillStyle = color; roundRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, ratio), 6, 3); ctx.fill();
}
function drawGroundFx(t){
  for (const z of S.zones){
    const pulse = 0.5 + Math.sin(t * 5) * 0.15;
    ctx.fillStyle = `rgba(92,240,176,${0.18 * pulse + 0.08})`; circle(z.x, z.y, z.r);
    ctx.strokeStyle = 'rgba(160,255,210,.8)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#c8ffe4'; ctx.font = '800 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', z.x, z.y + 8 - ((t * 30) % 20));
  }
  for (const s of S.sanctums){
    const k = Math.min(1, (t - s.t0) / 0.3), fade = Math.min(1, (s.until - t) / 0.5);
    ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(s.x, s.y, 10, s.x, s.y, s.r * k);
    g.addColorStop(0, 'rgba(255,250,215,.55)'); g.addColorStop(1, 'rgba(255,230,140,.12)');
    ctx.fillStyle = g; circle(s.x, s.y, s.r * k);
    ctx.strokeStyle = 'rgba(255,240,160,.95)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * k, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,200,.5)'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2 + t * 0.6; ctx.beginPath(); ctx.moveTo(s.x + Math.cos(a) * 30, s.y + Math.sin(a) * 30); ctx.lineTo(s.x + Math.cos(a) * s.r * 0.85 * k, s.y + Math.sin(a) * s.r * 0.85 * k); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  for (const w of S.walls){
    const fade = Math.min(1, (w.until - t) / 0.4), rise = Math.min(1, (t - w.t0) / 0.15);
    ctx.globalAlpha = fade;
    for (const q of w.pts){
      ctx.fillStyle = 'rgba(0,0,0,.3)'; circle(q.x + 4, q.y + 8, w.r * rise);
      ctx.fillStyle = '#8b7a62'; circle(q.x, q.y, w.r * rise);
      ctx.fillStyle = '#b09c7c'; circle(q.x - 6, q.y - 7, w.r * 0.45 * rise);
    }
    ctx.globalAlpha = 1;
  }
}
function drawDummy(d, t){
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + d.r + 4, d.r, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (d.deadUntil){
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(d.x - 34, d.y + 10, 68, 12);
    ctx.fillStyle = '#fff'; ctx.font = '700 26px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(d.deadUntil - t) + '', d.x, d.y - 10);
    return;
  }
  if (d.pull){ ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 4; ctx.setLineDash([10, 5]); ctx.beginPath(); ctx.moveTo(S.player.x, S.player.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]); }
  const slowed = L.effectSum(d.fx, 'speed', t) < 0, weak = L.effectSum(d.fx, 'atk', t) < 0;
  if (slowed){ ctx.strokeStyle = 'rgba(199,184,255,.9)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(d.x, d.y - 4, 46, t * 0.5, t * 0.5 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(d.x, d.y - 10); ctx.lineTo(d.x, d.y + d.r + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(d.x - 38, d.y - 2); ctx.lineTo(d.x + 38, d.y - 2); ctx.stroke();
  ctx.fillStyle = S.dummyMode === 'attack' ? '#e0a06f' : '#e8cf8f'; circle(d.x, d.y - 18, 20);
  ctx.fillStyle = '#c0392b'; circle(d.x, d.y - 18, 9);
  ctx.fillStyle = '#fff'; circle(d.x, d.y - 18, 4);
  if (t < d.frozenUntil){
    if (d.frozenKind === 'stun'){
      ctx.fillStyle = '#fff6a8'; ctx.font = '800 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++){ const a = t * 5 + i * 2.1; ctx.fillText('★', d.x + Math.cos(a) * 24, d.y - 46 + Math.sin(a) * 6); }
    } else { ctx.fillStyle = 'rgba(150,220,255,.45)'; roundRect(d.x - 40, d.y - 44, 80, 80, 12); ctx.fill(); }
  }
  bar(d.x, d.y - 58, 70, d.hp / d.max, '#ff5d73');
  const tags = (slowed ? '🐢' : '') + (weak ? '💧' : '');
  if (tags){ ctx.font = '16px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tags, d.x, d.y - 64); }
}
/* 캐릭터 모습 (나중에 그림 파일로 바꿀 수 있게 따로 둠) */
function drawHero(p, t){
  const c = cls, f = p.face, ang = Math.atan2(f.y, f.x), r = p.r;
  if (c.id === 'healer'){                                // 요정 날개 (몸 뒤)
    const flap = 0.75 + Math.sin(t * 14) * 0.25;
    ctx.fillStyle = 'rgba(190,255,215,.55)'; ctx.strokeStyle = 'rgba(120,230,170,.9)'; ctx.lineWidth = 2;
    for (const s of [-1, 1]){ ctx.beginPath(); ctx.ellipse(p.x + s * r * 0.95, p.y - r * 0.35, r * 0.75 * flap, r * 0.42, s * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  if (c.id === 'dealer'){                                // 바람에 날리는 목도리 (등 뒤)
    ctx.strokeStyle = '#ff6b8b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x - f.x * r * 0.4, p.y - f.y * r * 0.4 - 4);
    ctx.quadraticCurveTo(p.x - f.x * r * 1.4 + Math.sin(t * 9) * 5, p.y - f.y * r * 1.4 + Math.cos(t * 9) * 5, p.x - f.x * r * 2, p.y - f.y * r * 2 + 6); ctx.stroke();
  }
  // 몸
  ctx.fillStyle = c.color; circle(p.x, p.y, r);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(p.x, p.y + r * 0.35, r * 0.75, 0.1, Math.PI - 0.1); ctx.fill();
  // 얼굴
  const hx = p.x + f.x * 6, hy = p.y + f.y * 6 - 3;
  ctx.fillStyle = '#ffe0bd'; circle(hx, hy, r * 0.5);
  ctx.fillStyle = '#2b2233'; circle(hx + f.x * 4 - 3, hy - 1, 1.8); circle(hx + f.x * 4 + 3, hy - 1, 1.8);
  if (c.id === 'tank'){
    // 투구
    ctx.fillStyle = '#a3abbd'; ctx.beginPath(); ctx.arc(hx, hy - 1, r * 0.58, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    ctx.fillStyle = '#7d8598'; ctx.fillRect(hx - r * 0.6, hy - 3, r * 1.2, 5);
    ctx.fillStyle = c.color; ctx.fillRect(hx - 2, hy - r * 0.62, 4, r * 0.5);
    // 방패 (바라보는 쪽)
    ctx.save(); ctx.translate(p.x + f.x * (r + 7), p.y + f.y * (r + 7)); ctx.rotate(ang);
    ctx.fillStyle = '#6f7789'; roundRect(-8, -22, 16, 44, 7); ctx.fill();
    ctx.strokeStyle = '#c4cad6'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(5, 0); ctx.lineTo(0, 10); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (c.id === 'dealer'){
    // 두건
    ctx.fillStyle = c.dark; ctx.beginPath(); ctx.arc(hx, hy, r * 0.6, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx - r * 0.55, hy - 2); ctx.lineTo(hx - f.x * r * 0.9, hy - r * 0.95); ctx.lineTo(hx + r * 0.55, hy - 2); ctx.closePath(); ctx.fill();
    // 단검
    ctx.save(); ctx.translate(p.x + f.x * (r + 4), p.y + f.y * (r + 4)); ctx.rotate(ang);
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(-6, -3, 9, 6);
    ctx.fillStyle = '#e9edf5'; ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(22, 0); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    // 나뭇잎 관
    ctx.fillStyle = '#7ddc6a';
    for (let i = -2; i <= 2; i++){ ctx.beginPath(); ctx.ellipse(hx + i * 5, hy - r * 0.62 + Math.abs(i) * 1.5, 3, 6, i * 0.35, 0, Math.PI * 2); ctx.fill(); }
    // 몸을 감은 덩굴
    ctx.strokeStyle = c.dark; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y + 4, r * 0.82, 0.2, 2.6); ctx.stroke();
    ctx.fillStyle = '#7ddc6a'; circle(p.x + r * 0.8, p.y + 8, 3); circle(p.x - r * 0.55, p.y + r * 0.7, 3);
    // 활
    ctx.save(); ctx.translate(p.x + f.x * (r + 5), p.y + f.y * (r + 5)); ctx.rotate(ang);
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-8, 0, 20, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = '#eef6e8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8 + Math.cos(-1.1) * 20, Math.sin(-1.1) * 20); ctx.lineTo(-8 + Math.cos(1.1) * 20, Math.sin(1.1) * 20); ctx.stroke();
    ctx.fillStyle = '#5bbf6a'; ctx.beginPath(); ctx.ellipse(-8 + 20, 0, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
const FX_ICON = {atk: '⚔', def: '🛡', speed: '👟', basic: '👊'};
function drawPlayer(t){
  const p = S.player;
  if (p.deadUntil){
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '800 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`쓰러짐… ${Math.ceil(p.deadUntil - t)}`, SPAWN.x, SPAWN.y - 40);
    return;
  }
  const hidden = p.stealthUntil > t;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r + 2, p.r, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (L.takenMult(p.fx, t) < 1){ ctx.strokeStyle = 'rgba(95,225,255,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.stroke(); }
  if (L.effectSum(p.fx, 'atk', t) > 0){ ctx.strokeStyle = 'rgba(255,120,150,.75)'; ctx.lineWidth = 3; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 15, -t * 2, -t * 2 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  const ch = S.charged;
  if (ch){
    const k = Math.max(0, (ch.until - t) / CHARGE);
    ctx.strokeStyle = ch.spell.color; ctx.lineWidth = 5; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = hidden ? 0.32 : 1;
  drawHero(p, t);
  ctx.globalAlpha = 1;
  if (ch){
    const tipX = p.x + p.face.x * (p.r + 14), tipY = p.y + p.face.y * (p.r + 14);
    const g = ctx.createRadialGradient(tipX, tipY, 1, tipX, tipY, 18 + Math.sin(t * 10) * 3);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, ch.spell.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; circle(tipX, tipY, 22);
  }
  bar(p.x, p.y - p.r - 30, 64, p.hp / p.max, '#ff5d73');
  // 걸려 있는 효과 아이콘
  const icons = Object.keys(FX_ICON).filter(k => k === 'def' ? L.takenMult(p.fx, t) < 1 : L.effectSum(p.fx, k, t) > 0).map(k => FX_ICON[k]).join('') + (hidden ? '👻' : '');
  if (icons){ ctx.font = '16px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(icons, p.x, p.y - p.r - 36); }
  const label = ch ? '⚡ ' + ch.spell.name : inp.value;
  if (label){
    ctx.font = '800 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 24, y = p.y - p.r - 90;
    ctx.fillStyle = ch ? 'rgba(60,40,0,.9)' : 'rgba(8,30,16,.88)'; roundRect(p.x - w / 2, y, w, 32, 10); ctx.fill();
    ctx.fillStyle = ch ? '#ffd84a' : '#e3ffe9'; ctx.fillText(label, p.x, y + 23);
  }
}
function drawShots(){
  for (const s of S.shots){
    if (s.look === 'chain'){ ctx.strokeStyle = 'rgba(207,214,230,.85)'; ctx.lineWidth = 3; ctx.setLineDash([9, 5]); ctx.beginPath(); ctx.moveTo(S.player.x, S.player.y); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.setLineDash([]); }
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
    if (s.look === 'chain'){
      ctx.fillStyle = '#dfe5f0'; ctx.strokeStyle = '#7d8598'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.r * 1.4, 0); ctx.lineTo(-s.r * 0.4, s.r); ctx.lineTo(0, 0); ctx.lineTo(-s.r * 0.4, -s.r); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (s.look === 'arrow'){
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = '#d9f5d0'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(6, -5); ctx.lineTo(6, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5bbf6a'; ctx.beginPath(); ctx.ellipse(-20, -4, 6, 2.5, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(-20, 4, 6, 2.5, 0.5, 0, Math.PI * 2); ctx.fill();
    } else if (s.look === 'spear'){
      const g = ctx.createLinearGradient(-40, 0, 20, 0); g.addColorStop(0, 'rgba(255,246,176,0)'); g.addColorStop(1, 'rgba(255,250,220,1)');
      ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(8, -8); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,176,.45)'; circle(10, 0, 14);
    } else if (s.look === 'enemy'){
      ctx.fillStyle = '#ff5d5d'; circle(0, 0, s.r);
      ctx.fillStyle = 'rgba(255,93,93,.4)'; circle(-s.r * 1.4, 0, s.r * 0.8);
    } else { ctx.fillStyle = '#ffffff'; circle(0, 0, s.r); }
    ctx.restore();
  }
}
function drawFx(t){
  for (const f of S.fx){
    const k = (t - f.t0) / f.life;
    ctx.globalAlpha = Math.max(0, 1 - k);
    if (f.type === 'mark'){ ctx.strokeStyle = '#5fe1ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + k * 14, 0, Math.PI * 2); ctx.stroke(); }
    else if (f.type === 'puff' || f.type === 'poof'){
      ctx.fillStyle = f.look === 'rock' ? '#c4ab86' : f.look === 'enemy' ? '#ff8a8a' : f.look === 'arrow' ? '#9fe08f' : f.look === 'spear' ? '#fff6b0' : '#ffffff';
      for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; circle(f.x + Math.cos(a) * k * 26, f.y + Math.sin(a) * k * 26, 5 * (1 - k) + 2); }
    } else if (f.type === 'swing'){
      ctx.fillStyle = f.color; ctx.globalAlpha = Math.max(0, 0.5 * (1 - k));
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.r * (0.7 + 0.3 * k), f.a - f.arc / 2, f.a + f.arc / 2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = f.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.7 + 0.3 * k), f.a - f.arc / 2, f.a + f.arc / 2); ctx.stroke();
    } else if (f.type === 'blink'){ ctx.strokeStyle = f.color || '#d6c2ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 40, 0, Math.PI * 2); ctx.stroke(); }
    else if (f.type === 'cut'){
      ctx.strokeStyle = f.color; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x - 34, f.y - 40); ctx.lineTo(f.x - 34 + 68 * Math.min(1, k * 3), f.y - 40 + 50 * Math.min(1, k * 3)); ctx.stroke();
    } else if (f.type === 'flash'){
      ctx.fillStyle = 'rgba(255,255,230,.8)'; circle(f.x, f.y - 10, 20 + k * 50);
      ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * 20, f.y - 10 + Math.sin(a) * 20); ctx.lineTo(f.x + Math.cos(a) * (40 + k * 50), f.y - 10 + Math.sin(a) * (40 + k * 50)); ctx.stroke(); }
    } else if (f.type === 'buff'){
      ctx.strokeStyle = f.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(f.x, f.y, 24 + k * 50, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = f.color; for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; circle(f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 30 - k * 40, 4); }
    } else if (f.type === 'smoke'){ ctx.fillStyle = 'rgba(120,110,150,.6)'; for (let i = 0; i < 7; i++){ const a = i / 7 * Math.PI * 2; circle(f.x + Math.cos(a) * (14 + k * 30), f.y + Math.sin(a) * (14 + k * 30), 14 * (1 - k) + 4); } }
    else if (f.type === 'heal'){ ctx.fillStyle = '#7dffa8'; for (let i = 0; i < 8; i++) ctx.fillRect(f.x - 30 + i * 8, f.y + 10 - k * 50 - (i % 3) * 8, 4, 10); }
    else if (f.type === 'ring'){
      ctx.strokeStyle = f.color; ctx.lineWidth = 10 * (1 - k) + 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(160,120,70,.25)'; circle(f.x, f.y, f.r * k);
    } else if (f.type === 'dust'){ ctx.fillStyle = 'rgba(210,180,140,.7)'; circle(f.x + (Math.random() - 0.5) * 20, f.y, 8 * (1 - k) + 2); }
    else if (f.type === 'fizzle'){ ctx.fillStyle = '#ff7b7b'; ctx.font = '800 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('퓨슉…', f.x, f.y - 50 - k * 20); }
    ctx.globalAlpha = 1;
  }
  for (const f of S.floats){
    const k = t - f.t0;
    ctx.globalAlpha = Math.max(0, 1 - k); ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
    ctx.font = '800 24px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    ctx.strokeText(f.text, f.x, f.y - k * 40); ctx.fillText(f.text, f.x, f.y - k * 40);
    ctx.globalAlpha = 1;
  }
}
function drawMinimap(){
  const mw = 220, mh = mw * WH / WW, mx = VW - mw - 16, my = VH - mh - 16, k = mw / WW;
  ctx.fillStyle = 'rgba(6,20,12,.75)'; roundRect(mx - 4, my - 4, mw + 8, mh + 8, 10); ctx.fill();
  ctx.fillStyle = 'rgba(44,100,64,.95)'; ctx.fillRect(mx, my, mw, mh);
  for (const o of OBSTACLES){ ctx.fillStyle = o.kind === 'pond' ? '#3d94c9' : o.kind === 'rock' ? '#9fa69c' : '#17552d'; ctx.fillRect(mx + o.x * k, my + o.y * k, Math.max(3, o.w * k), Math.max(3, o.h * k)); }
  for (const d of S.dummies){ ctx.fillStyle = d.deadUntil ? 'rgba(255,255,255,.35)' : '#ff8a5c'; ctx.beginPath(); ctx.arc(mx + d.x * k, my + d.y * k, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = cls.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(mx + S.player.x * k, my + S.player.y * k, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.strokeRect(mx + cam.x * k, my + cam.y * k, VW * k, VH * k);
}
function draw(){
  const t = now(), base = scale * dpr;
  ctx.setTransform(base, 0, 0, base, -cam.x * base, -cam.y * base);
  drawGround(t); drawGroundFx(t); drawObstacles(); drawFx(t);
  const p = S.player;
  if (p.target && !p.deadUntil){ ctx.strokeStyle = 'rgba(95,225,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.target.x, p.target.y); ctx.stroke(); ctx.setLineDash([]); }
  for (const d of S.dummies) drawDummy(d, t);
  drawPlayer(t); drawShots();
  ctx.setTransform(base, 0, 0, base, 0, 0);
  if (S.tint){   // 멈춰 버린 세계: 화면이 보랏빛으로
    const a = Math.min(1, (t - S.tint.t0) / 0.3) * Math.min(1, (S.tint.until - t) / 0.5) * 0.16;
    ctx.fillStyle = `rgba(${S.tint.color},${a})`; ctx.fillRect(0, 0, VW, VH);
  }
  drawMinimap();
}

/* ---------- 아래 스킬 막대 · 체력 · 기록 ---------- */
function buildBook(){
  const ul = $('#book'); ul.textContent = ''; ul.style.setProperty('--cols', `repeat(${cls.spells.length},minmax(0,1fr)) minmax(0,1.7fr)`);
  for (const sp of allSpells(cls)){
    const isUlt = sp === cls.ult;
    const li = document.createElement('li'); li.dataset.id = sp.id; if (isUlt) li.className = 'ult';
    li.title = `${isUlt ? '[궁극기] ' : ''}${sp.name}\n${sp.desc}\n${isUlt ? '싸우면 게이지가 차올라요' : '다시 쓰기까지 ' + sp.cd + '초'}`;
    const b = document.createElement('b'); b.textContent = sp.name;
    const s = document.createElement('span'); s.textContent = (isUlt ? '🌟 ' : '') + sp.desc;
    li.append(b, s, document.createElement('em'), document.createElement('i')); ul.appendChild(li);
  }
}
let hudAt = 0;
function updateHud(){
  const t = now(); if (t - hudAt < 0.1) return; hudAt = t;
  const ch = S.charged;
  for (const sp of allSpells(cls)){
    const li = document.querySelector(`#book li[data-id="${sp.id}"]`); if (!li) continue;
    const isCh = !!ch && ch.spell.id === sp.id, em = li.querySelector('em'), bar = li.querySelector('i');
    if (sp === cls.ult){
      const ready = S.ult >= U.need, pct = Math.floor(S.ult / U.need * 100);
      li.classList.toggle('ready', ready && !isCh); li.classList.toggle('charged', isCh);
      em.textContent = isCh ? '⚡ ' + Math.max(0, ch.until - t).toFixed(1) + '초' : ready ? '준비!' : pct + '%';
      bar.style.width = (isCh ? (ch.until - t) / CHARGE * 100 : pct) + '%';
      continue;
    }
    const left = L.cooldownLeft(S.cds[sp.id], sp.cd, t);
    li.classList.toggle('cool', left > 0); li.classList.toggle('charged', isCh);
    em.textContent = isCh ? '⚡ ' + Math.max(0, ch.until - t).toFixed(1) + '초' : left > 0 ? left.toFixed(1) + '초' : '✔';
    bar.style.width = (isCh ? (ch.until - t) / CHARGE * 100 : left > 0 ? left / sp.cd * 100 : 0) + '%';
  }
  const p = S.player;
  $('#hpText').textContent = `${Math.round(p.hp)} / ${p.max} · ${cls.name}`;
  $('#hpFill').style.width = (p.hp / p.max * 100) + '%';
  $('#ultFill').style.width = (S.ult / U.need * 100) + '%';
  $('#ultText').textContent = S.ult >= U.need ? '🌟 준비!' : Math.floor(S.ult / U.need * 100) + '%';
  const st = S.stats, total = st.ok + st.fail;
  $('#stats').innerHTML = `준 피해 <b>${st.dmg}</b> · 쓰러뜨림 <b>${st.kills}</b> · 받은 피해 <b>${Math.round(st.taken)}</b> · 회복 <b>${Math.round(st.healed)}</b> · 정확도 <b>${total ? Math.round(st.ok / total * 100) + '%' : '-'}</b>`;
}

/* ---------- 캐릭터 고르기 ---------- */
function buildPick(){
  const box = $('#cards'); box.textContent = '';
  for (const c of CLASSES){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'card' + (c === cls ? ' last' : ''); b.style.setProperty('--c', c.color);
    b.innerHTML = `<div class="face"><div class="dot"></div><div><span class="role"></span><b></b><small class="title"></small></div></div><div class="about"></div><div class="nums"><span></span><span></span><span></span></div><ul></ul>`;
    b.querySelector('.dot').textContent = c.icon;
    b.querySelector('.role').textContent = c.role; b.querySelector('b').textContent = c.name; b.querySelector('.title').textContent = c.title;
    b.querySelector('.about').textContent = c.about;
    const n = b.querySelectorAll('.nums span'); n[0].textContent = `❤ 체력 ${c.hp}`; n[1].textContent = `👟 속도 ${c.speed}`; n[2].textContent = c.basic.melee ? '👊 근접' : '🏹 원거리';
    for (const sp of allSpells(c)){ const li = document.createElement('li'); li.textContent = sp === c.ult ? '🌟 ' + sp.name : sp.name; if (sp === c.ult) li.className = 'u'; b.querySelector('ul').appendChild(li); }
    b.onclick = () => choose(c);
    box.appendChild(b);
  }
}
function openPick(){ buildPick(); $('#pick').hidden = false; const last = $('#cards .last'); if (last) last.focus(); }
function choose(c){
  cls = c; try { localStorage.setItem('magic.class', c.id); } catch (e) {}
  S.player = makePlayer(c); S.cds = {}; S.lastBasic = undefined; S.lockUntil = 0; S.ult = 0; clearCharge();
  S.zones = []; S.shots = []; S.walls = []; S.sanctums = []; S.tint = null;
  for (const d of S.dummies){ d.fx = []; d.pull = null; }
  cam = L.camFollow(S.player, VW, VH, WW, WH);
  inp.value = ''; castMsg(`${c.role} · ${c.name}!`, 'good');
  buildBook(); $('#pick').hidden = true; focusSpell();
}
$('#pickBtn').onclick = openPick;

/* ---------- 허수아비 모드 ---------- */
function setDummyMode(m){
  S.dummyMode = m;
  $('#dStill').classList.toggle('on', m === 'still'); $('#dMove').classList.toggle('on', m === 'move'); $('#dAttack').classList.toggle('on', m === 'attack');
  focusSpell();
}
$('#dStill').onclick = () => setDummyMode('still');
$('#dMove').onclick = () => setDummyMode('move');
$('#dAttack').onclick = () => setDummyMode('attack');

/* ---------- 시작 ---------- */
function loop(){ update(); draw(); updateHud(); requestAnimationFrame(loop); }
buildBook(); fit(); openPick();
requestAnimationFrame(loop);

window.__magic = {S, mouse, submitSpell, rightClick, choose, CLASSES, OBSTACLES, step(){ update(); draw(); updateHud(); }, get cls(){ return cls; }, get cam(){ return cam; }};
})();

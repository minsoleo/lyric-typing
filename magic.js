/* 숲속의 한바탕: 🎯 혼자 연습 + 👫 친구랑 연습 (온라인, 허수아비도 같이)
   - 캐릭터 3명(가데온·레이브·세라). 스킬 표는 magic-spells.js, 정리본은 docs/캐릭터-스킬표.md
   - 맵은 화면보다 크고 화면(카메라)이 캐릭터를 따라감 + 작은 지도
   - 스킬 + Enter → 장전(5초) → 오른쪽 클릭으로 발사. 장전은 한 번에 하나 (그림자 은신만 Enter로 바로)
   - 스킬을 쓰는 동안(지속 시간)은 다른 스킬을 치거나 장전할 수 없음 (그림자 은신만 예외)
   - 궁극기: 가만히 있어도 천천히, 싸우면 더 빨리 게이지가 차오르고, 가득 차면 긴 이름을 쳐서 장전
   - ♾ 무제한(연습판 기본): 대기 시간·궁극기 게이지 없이 마음껏 써 보기
   - 친구랑 연습 (연결은 magic-net.js):
     · 각자 자기 캐릭터를 계산하고 0.1초마다 위치·체력·효과를 보냄
     · 내 공격이 친구에게 맞으면 "맞았어요" 신호를 보내고, 맞은 친구가 자기 피해 감소를 계산해서 체력을 깎음
     · 허수아비는 방장 컴퓨터가 계산해서 모두에게 보내 줌 (방장이 나가면 다음 사람이 이어받음)
     · 빨강 팀 / 파랑 팀: 다른 팀은 적, 같은 팀은 아군 (안 아프고, 회복·강화를 줄 수 있음)
   - ⚔ 대결 (온라인, 방장이 시작): 3초 준비 → 정해진 시간 동안 상대 팀을 많이 쓰러뜨린 팀이 이김
     · 대결 중에는 허수아비가 사라지고 ♾ 무제한이 꺼짐 (실제 대기 시간·게이지)
     · 점수는 쓰러진 사람이 "상대 팀 +1"을 서버에 올림, 시간은 서버 시계 기준 */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const L = window.MagicLogic, CLASSES = window.MAGIC_CLASSES, CHARGE = window.MAGIC_CHARGE_TIME || 5, U = window.MAGIC_ULT;
const WW = 3200, WH = 1800, VW = 1600, VH = 900;
const DUMMY_SPEED = 100, FAIL_LOCK = 0.8, RESPAWN = 3, DASH_SPEED = 900, PULL_SPEED = 1300;
const DUMMY_SHOT = {dmg: 7, speed: 300, radius: 9, range: 700, look: 'enemy'}, DUMMY_RATE = 2.2, DUMMY_SIGHT = 650;
const AIM_RADIUS = 110;                    // 목 긋기·숲속의 섬광: 마우스에서 이만큼 안에 있는 적을 "가리킨 적"으로 봄
const ALLY_RANGE = 600, NEAR_RANGE = 350;  // "가장 가까운 아군"을 찾는 거리 · "주변 아군" 거리
const SEND_EVERY = 0.1;                    // 온라인: 내 상태를 보내는 간격(초)
const SPAWN = {solo: {x: 520, y: 900}, red: {x: 520, y: 900}, blue: {x: 2680, y: 900}};
const TEAMS = {red: {name: '빨강 팀', color: '#ff5d5d'}, blue: {name: '파랑 팀', color: '#4fa3ff'}};
const allSpells = c => c.spells.concat([c.ult]);
const classById = id => CLASSES.find(c => c.id === id) || CLASSES[1];
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

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
const makeDummy = (x, y, i) => ({kind: 'dummy', id: 'd' + i, x, y, tx: x, ty: y, baseX: x, baseY: y, r: 26, hp: 100, max: 100, shield: 0, shieldUntil: 0,
  frozenUntil: 0, frozenKind: 'ice', dir: 1, deadUntil: 0, nextShot: 0, fx: [], pull: null, homeAt: 0});
let cls = classById(loadClass());
let net = null;                                    // 친구랑 연습 중이면 MagicNet 연결
const isAuth = () => !net || net.isHost();         // 허수아비를 계산하는 컴퓨터 (혼자면 나, 온라인이면 방장)
// ⚔ 대결: match = {id, startAt, endAt, len, score} (서버 시계, ms)
let match = null, matchId = null;
const phase = () => { if (!net || !match) return null; const n = net.serverNow(); return n < match.startAt ? 'count' : n < match.endAt ? 'play' : 'end'; };
const inMatch = () => !!phase();
const locked = () => { const ph = phase(); return ph === 'count' || ph === 'end'; };   // 준비 중·끝난 뒤엔 못 움직임
const unl = () => unlimited && !inMatch();         // 대결 중에는 무제한 꺼짐
const S = {
  player: null,
  others: new Map(),                               // 친구들 (pid → 받은 상태)
  dummies: [makeDummy(1000, 880, 0), makeDummy(2250, 1080, 1), makeDummy(2550, 500, 2)],
  dummyMode: 'still',
  shots: [], zones: [], walls: [], sanctums: [], fields: [], fx: [], floats: [], feed: [], tint: null,
  cds: {}, lastBasic: undefined, lockUntil: 0, charged: null, busy: null, ult: 0,
  stats: {dmg: 0, kills: 0, deaths: 0, ok: 0, fail: 0, healed: 0, taken: 0}
};
function makePlayer(c, team){
  const sp = SPAWN[team] || SPAWN.solo;
  return {kind: 'me', team, x: sp.x, y: sp.y, r: c.r, hp: c.hp, max: c.hp, speed: c.speed, shield: 0, shieldUntil: 0,
    frozenUntil: 0, frozenKind: 'stun', deadUntil: 0, target: null, dash: null, flurry: null, backAt: null, pull: null, swingAt: -9, swings: 0,
    stealthUntil: 0, stealthTag: null, fx: [], face: {x: team === 'blue' ? -1 : 1, y: 0}};
}
S.player = makePlayer(cls, 'solo');
let cam = L.camFollow(S.player, VW, VH, WW, WH);
const mouse = {sx: VW / 2, sy: VH / 2, left: false, get x(){ return this.sx + cam.x; }, get y(){ return this.sy + cam.y; }};
function loadClass(){ try { return localStorage.getItem('magic.class'); } catch (e) { return null; } }
// ♾ 무제한: 연습판에서는 기본으로 켜짐 (끄면 실제 대결처럼 대기 시간·게이지가 있음)
let unlimited = (() => { try { return localStorage.getItem('magic.unlimited') !== 'off'; } catch (e) { return true; } })();

/* ---------- 누가 적이고 누가 아군인지 ---------- */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const others = () => [...S.others.values()];
const isDown = e => e.kind === 'player' ? !!e.dead : !!e.deadUntil;
const alive = () => inMatch() ? [] : S.dummies.filter(d => !d.deadUntil);   // 대결 중엔 허수아비 없음
// 내 적: 허수아비 + 다른 팀 친구 / 내 아군: 같은 팀 친구 (나는 빼고)
const enemies = () => alive().concat(others().filter(o => o.team !== S.player.team && !o.dead));
const allies = () => others().filter(o => o.team === S.player.team && !o.dead);
const myName = () => net ? net.name : '나';
const nameOf = pid => net && pid === net.pid ? net.name : (S.others.get(pid) || {}).name || '친구';

/* ---------- 온라인 신호 보내기 ---------- */
function send(ev){ if (net) net.send(ev); }
// 효과 그림: share면 친구 화면에도 똑같이 그려지게 신호로 보냄
function addFx(f, share){
  S.fx.push(f);
  if (share && net){ const c = Object.assign({}, f); delete c.t0; send({k: 'fx', v: c}); }
}
function addFeed(text, color){ S.feed.push({text, color: color || '#ffffff', t0: now()}); if (S.feed.length > 5) S.feed.shift(); }

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
cv.addEventListener('mousemove', e => { setMouse(e); if (mouse.left && !S.player.dash && !S.player.pull) S.player.target = {x: mouse.x, y: mouse.y}; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; });
document.addEventListener('contextmenu', e => { if (e.target === cv || $('#pick').hidden) e.preventDefault(); });
function setMoveTarget(){
  if (S.player.dash || S.player.deadUntil || S.player.pull || locked()) return;
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
  if (locked()){ castMsg(phase() === 'count' ? '곧 시작해요!' : '대결이 끝났어요', 'wait'); return; }
  if (t < p.frozenUntil){ castMsg('기절해서 스킬을 못 써요!', 'bad'); return; }
  const sp = L.findSpell(allSpells(cls), text);
  const isUlt = sp === cls.ult;
  const cdLeft = sp && !isUlt && !unl() ? L.cooldownLeft(S.cds[sp.id], sp.cd, t) : 0;
  // 그림자 은신: 장전 없이, 다른 스킬을 장전한 채로도 바로 씀
  if (sp && sp.instant && t >= S.lockUntil){
    if (cdLeft > 0){ castMsg(`${sp.name}: ${cdLeft.toFixed(1)}초 뒤에 다시`, 'wait'); return; }
    inp.value = ''; S.cds[sp.id] = t; S.stats.ok++; gainUlt(U.typed, t);
    castSpell(sp, t); castMsg(sp.name + '!', 'good'); flashSlot(sp.id);
    return;
  }
  const busy = busyLeft(t);
  if (busy > 0){ castMsg(`${S.busy.sp.name} 쓰는 중… ${busy.toFixed(1)}초 뒤에 다른 스킬`, 'wait'); shakeCast(); return; }
  if (S.charged){ castMsg(`⚡ ${S.charged.spell.name}부터 써요 (오른쪽 클릭)`, 'charge'); shakeCast(); return; }
  if (t < S.lockUntil){ castMsg('잠깐! 다시 집중하는 중…', 'wait'); return; }
  if (!sp){
    inp.value = ''; S.lockUntil = t + FAIL_LOCK; S.stats.fail++;
    const other = CLASSES.find(c => c !== cls && L.findSpell(allSpells(c), text));
    castMsg(other ? `그건 ${other.name}(${other.role}) 스킬이에요!` : '스킬 실패!', 'bad'); shakeCast();
    S.fx.push({type: 'fizzle', x: p.x, y: p.y - 40, t0: t, life: 0.6});
    return;
  }
  if (isUlt && !unl() && S.ult < U.need){ castMsg(`궁극기 게이지 ${Math.floor(S.ult / U.need * 100)}% — 싸우면 차올라요`, 'wait'); return; }
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
  if (p.deadUntil || locked()) return;
  if (t < p.frozenUntil){ castMsg('기절!', 'bad'); return; }
  if (S.charged){
    const sp = S.charged.spell;
    let target = null;
    if (sp.type === 'leap' || sp.type === 'stun'){
      // screen: 화면 안에 보이는 적이면 거리 상관없이
      const list = enemies().filter(e => !sp.screen || inView(e.x, e.y, -e.r));
      target = L.pickTarget(list, mouse, AIM_RADIUS, p, sp.screen ? Infinity : sp.reach);
      if (!target){ castMsg(sp.screen ? '화면 안의 적을 마우스로 가리키고 오른쪽 클릭!' : '가까이 있는 적을 마우스로 가리키고 오른쪽 클릭!', 'wait'); return; }
    }
    breakStealth(t);
    clearCharge();
    if (sp === cls.ult){ if (!unl()) S.ult = 0; } else S.cds[sp.id] = t;
    castSpell(sp, t, target); castMsg(sp.name + '!', 'good');
    // 이 스킬을 쓰는 동안은 다른 스킬 금지
    const dashTime = sp.type === 'dash' && p.dash ? dist(p, p.dash.to) / p.dash.speed + 0.05 : 0;
    const b = L.busyTime(sp, dashTime);
    S.busy = b > 0 ? {sp, until: t + b, len: b} : null;
  } else basicAttack(t);
}
const busyLeft = t => S.busy ? Math.max(0, S.busy.until - t) : 0;

/* ---------- 스킬 효과 (type별) ---------- */
function aimDir(from){
  const dx = mouse.x - from.x, dy = mouse.y - from.y, d = Math.hypot(dx, dy) || 1;
  return {x: dx / d, y: dy / d};
}
// owner: 'me'(내 공격) · 'dummy'(허수아비, 방장만) · 'remote'(친구 화면에서 온 그림)
function shoot(owner, from, dir, o, src){
  const s = {owner, src, team: owner === 'dummy' ? 'dummy' : S.player.team, look: o.look || 'basic',
    x: from.x + dir.x * (from.r + 6), y: from.y + dir.y * (from.r + 6), vx: dir.x * o.speed, vy: dir.y * o.speed,
    r: o.radius, dmg: o.dmg, range: o.range, trav: 0, pierce: !!o.pierce, pull: !!o.pull, basic: !!o.basic, allyHeal: o.allyHeal || 0, color: o.color, hit: new Set()};
  S.shots.push(s);
  if (net) send({k: 'shot', s: {team: s.team, look: s.look, x: r1(s.x), y: r1(s.y), vx: r1(s.vx), vy: r1(s.vy), r: s.r, range: s.range, color: s.color || 0}});
  return s;
}
function melee(t, o, isBasic, color){
  const p = S.player, dir = aimDir(p); p.face = dir; p.swingAt = t; p.swings++;
  const reach = p.r + o.reach * (1 + L.effectSum(p.fx, 'reach', t));   // 궁극기 등으로 공격 거리가 늘어남
  for (const e of enemies()) if (L.inArc(p, dir, e, reach + e.r, o.arc)) dealHit(e, o.dmg, t, {basic: isBasic, color});
  addFx({type: 'swing', x: r1(p.x), y: r1(p.y), a: r2(Math.atan2(dir.y, dir.x)), r: r1(reach), arc: r2(o.arc * Math.PI / 180), t0: t, life: 0.2, color: color || '#ffffff'}, true);
}
// 나에게 강화 걸기 (fx: [{kind, value}], time초 동안). by: 걸어 준 친구 이름
function buffMe(fx, time, tag, heal, color, t, by){
  const p = S.player;
  for (const f of fx || []) L.addEffect(p.fx, f.kind, f.value, t + time, tag);
  if (heal) healPlayer(heal, t);
  addFx({type: 'buff', x: r1(p.x), y: r1(p.y), t0: t, life: 0.8, color}, true);
  const txt = (fx || []).map(fxLabel).filter(Boolean);
  if (by) txt.unshift(`💚 ${by} 님이 걸어 줌`);
  txt.forEach((line, i) => S.floats.push({x: p.x, y: p.y - 74 - i * 22, text: i === txt.length - 1 && time ? `${line} (${time}초)` : line, color, t0: t, life: 1.8, size: 17}));
}
// 같은 팀 친구에게 강화 (신호로 보내면 친구 쪽에서 걸림)
function buffAlly(o, sp, t){
  send({k: 'buff', to: o.id, fx: (sp.fx || []).map(f => [f.kind, f.value]), tm: sp.time, tag: sp.id, h: sp.heal || 0, c: sp.color, by: myName()});
  S.floats.push({x: o.x, y: o.y - o.r - 40, text: `${sp.name} → ${o.name}`, color: sp.color, t0: t, life: 1.4, size: 17});
  if (sp.heal){ S.stats.healed += sp.heal; gainUlt(sp.heal * U.heal, t); }
}
function healAlly(o, amount, t){
  send({k: 'heal', to: o.id, a: amount});
  S.floats.push({x: o.x, y: o.y - o.r - 14, text: '+' + Math.round(amount), color: '#5ce08a', t0: t});
  S.stats.healed += amount; gainUlt(amount * U.heal, t);
}
// 강화 스킬: ally 'one' → 가장 가까운 아군 한 명 (없으면 나), 'near' → 나 + 주변 아군, 없으면 나만
function applyBuff(sp, t){
  const p = S.player;
  if (sp.ally === 'one'){
    const near = allies().filter(o => dist(o, p) < ALLY_RANGE).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (near) return buffAlly(near, sp, t);
  } else if (sp.ally === 'near') for (const o of allies()) if (dist(o, p) < NEAR_RANGE) buffAlly(o, sp, t);
  buffMe(sp.fx, sp.time, sp.id, sp.heal, sp.color, t);
}
// 걸린 효과를 글로: 🛡 받는 피해 −40% 처럼
function fxLabel(f){
  const pct = Math.round(Math.abs(f.value) * 100) + '%';
  return f.kind === 'def' ? '🛡 받는 피해 −' + pct : f.kind === 'atk' ? '⚔ 공격력 +' + pct : f.kind === 'speed' ? (f.value >= 1 ? '👟 속도 ' + (1 + f.value) + '배' : '👟 속도 +' + pct)
    : f.kind === 'reach' ? '📏 공격 거리 +' + pct : f.kind === 'basic' ? '👊 평타 ' + (1 + f.value) + '배' : '';
}
function explode(at, o, t, color){
  addFx({type: 'ring', x: r1(at.x), y: r1(at.y), r: o.area, t0: t, life: 0.5, color}, true);
  for (const e of enemies()) if (dist(e, at) < o.area + e.r) dealHit(e, o.dmg, t, {color});
}
function breakStealth(t){
  const p = S.player;
  if (p.stealthUntil > t){ p.fx = L.removeTag(p.fx, p.stealthTag); addFx({type: 'smoke', x: r1(p.x), y: r1(p.y), t0: t, life: 0.5}, true); }
  p.stealthUntil = 0;
}
function castSpell(sp, t, target){
  const p = S.player;
  switch (sp.type){
    case 'shot': { const d = aimDir(p); p.face = d; shoot('me', p, d, sp); break; }
    case 'dash': {
      const to = L.clampToWorld(L.clampReach(p, mouse, sp.reach), p.r, WW, WH);
      p.dash = {to, dmg: sp.dmg || 0, wide: sp.wide || 8, boom: sp.boom || null, color: sp.color, speed: DASH_SPEED, hit: new Set()}; p.target = null; p.face = aimDir(p);
      if (sp.healAll){
        healPlayer(sp.healAll, t);
        for (const o of allies()) healAlly(o, sp.healAll, t);
        addFx({type: 'heal', x: r1(p.x), y: r1(p.y), t0: t, life: 0.8}, true);
      }
      break;
    }
    case 'slash':
      // swing초 동안 every초마다 베고, 다 휘두르면 마지막으로 벤 방향 반대로 훌쩍 물러남
      p.flurry = {until: t + sp.swing, next: t, sp};
      p.backAt = {at: t + sp.swing, dist: sp.back};
      break;
    case 'wall': {
      const d = aimDir(p); p.face = d;
      const pts = L.wallPoints({x: p.x + d.x * sp.dist, y: p.y + d.y * sp.dist}, d, sp.length, 30).map(q => ({x: r1(q.x), y: r1(q.y)}));
      S.walls.push({pts, r: 22, t0: t, until: t + sp.time, team: p.team});
      send({k: 'wall', pts, tm: sp.time, team: p.team});
      break;
    }
    case 'flurry': p.flurry = {until: t + sp.time, next: t, sp}; break;
    case 'buff': applyBuff(sp, t); break;
    case 'stealth':
      p.stealthUntil = t + sp.time; p.stealthTag = sp.id; buffMe(sp.fx, sp.time, sp.id, 0, sp.color, t);
      addFx({type: 'smoke', x: r1(p.x), y: r1(p.y), t0: t, life: 0.6}, true);
      break;
    case 'leap': {
      const ux = (target.x - p.x) / (dist(target, p) || 1), uy = (target.y - p.y) / (dist(target, p) || 1), from = {x: p.x, y: p.y}, gap = target.r + p.r + 6;
      const to = L.pushOut(L.clampToWorld({x: target.x + ux * gap, y: target.y + uy * gap}, p.r, WW, WH), p.r, WALLS);
      p.x = to.x; p.y = to.y; p.target = null; p.face = {x: -ux, y: -uy};
      addFx({type: 'blink', x: r1(from.x), y: r1(from.y), t0: t, life: 0.45, color: sp.color}, true);
      addFx({type: 'cut', x: r1(target.x), y: r1(target.y), t0: t, life: 0.45, color: sp.color}, true);
      dealHit(target, sp.dmg, t, {color: sp.color});
      break;
    }
    case 'stun':
      dealHit(target, 0, t, {stun: sp.time, color: sp.color});
      addFx({type: 'flash', x: r1(target.x), y: r1(target.y), t0: t, life: 0.5}, true);
      break;
    case 'zone': {
      const at = L.clampToWorld(L.clampReach(p, mouse, sp.reach), 0, WW, WH), z = {x: r1(at.x), y: r1(at.y), r: sp.area, rate: r2(sp.heal / sp.time)};
      S.zones.push(Object.assign({until: t + sp.time, t0: t, color: sp.color, acc: 0, team: p.team}, z));
      send(Object.assign({k: 'zone', tm: sp.time, c: sp.color, team: p.team}, z));
      break;
    }
    case 'slowfield':
      // 범위가 time초 동안 나를 따라다니며 유지됨 → 안에 들어온 적은 계속 느려짐
      S.fields = S.fields.filter(f => !(f.owner === 'me' && f.id === sp.id));
      S.fields.push({id: sp.id, owner: 'me', r: sp.area, slow: sp.slow, t0: t, until: t + sp.time, next: t, color: sp.color});
      send({k: 'field', r: sp.area, tm: sp.time, c: sp.color});
      buffMe(sp.fx, sp.time, sp.id, 0, sp.color, t);
      addFx({type: 'ring', x: r1(p.x), y: r1(p.y), r: sp.area, t0: t, life: 0.8, color: sp.color}, true);
      S.tint = {until: t + sp.time, t0: t, color: '90,60,190'};
      break;
    case 'sanctum': {
      const at = L.clampToWorld(L.clampReach(p, mouse, sp.reach), 0, WW, WH), s = {x: r1(at.x), y: r1(at.y), r: sp.area, hr: r2(sp.heal / sp.time)};
      S.sanctums.push({x: s.x, y: s.y, r: s.r, t0: t, until: t + sp.time, healRate: s.hr, dmgPer: sp.dmg / sp.time, weak: sp.weak, nextTick: t + 1, acc: 0, id: sp.id, team: p.team, mine: true});
      send(Object.assign({k: 'sanc', tm: sp.time, team: p.team}, s));
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
  if (was < U.need && S.ult >= U.need && !unl()){
    if (!S.charged) castMsg('🌟 궁극기 준비 완료! 긴 이름을 쳐 봐요', 'charge');
    S.floats.push({x: S.player.x, y: S.player.y - 70, text: '🌟 궁극기 준비!', color: '#ffd84a', t0: t});
    flashSlot(cls.ult.id);
  }
}
function healPlayer(amount, t, silent){
  const p = S.player, before = p.hp;
  if (p.deadUntil) return 0;
  p.hp = Math.min(p.max, p.hp + amount);
  const got = p.hp - before; S.stats.healed += got; gainUlt(got * U.heal, t);
  if (!silent && got > 0) floatAt(p, '+' + Math.round(got), '#5ce08a', t);
  return got;
}
function floatAt(e, text, color, t){ S.floats.push({x: e.x + (Math.random() * 20 - 10), y: e.y - e.r - 34, text, color, t0: t}); }
// 상태 이상을 신호에 담기 / 꺼내기
const statusOf = o => ({st: o.stun || 0, sl: o.slow ? [o.slow.v, o.slow.t, o.slow.tag || 'slow'] : 0, wk: o.weak ? [o.weak.v, o.weak.t, o.weak.tag || 'weak'] : 0,
  pl: o.pull ? {x: r1(o.pull.x), y: r1(o.pull.y)} : 0});
const statusFrom = ev => ({color: ev.c || null, stun: ev.st || 0, slow: ev.sl ? {v: ev.sl[0], t: ev.sl[1], tag: ev.sl[2]} : null,
  weak: ev.wk ? {v: ev.wk[0], t: ev.wk[1], tag: ev.wk[2]} : null, pull: ev.pl || null});

/* 내 공격이 적(허수아비·다른 팀 친구)에게 맞음
   o: {basic, color, stun(초), slow{v,t,tag}, weak{v,t,tag}, pull{x,y}, noUlt}
   내 쪽(공격력·평타 강화)만 계산해서 보내고, 피해 감소는 맞은 쪽이 계산함 */
function dealHit(e, base, t, o){
  if (isDown(e)) return 0;
  const p = S.player, mult = o.basic ? 1 + L.effectSum(p.fx, 'basic', t) : 1;
  const out = base * mult * Math.max(0.1, 1 + L.effectSum(p.fx, 'atk', t));
  let got = 0;
  if (e.kind === 'dummy' && isAuth()) got = applyHit(e, out, o, t, null);
  else {
    send(Object.assign({k: 'hit', to: e.id, d: r2(out)}, statusOf(o), {c: o.color || 0}));
    if (out > 0){ got = Math.max(1, Math.round(out * L.takenMult(e.fx, t))); S.stats.dmg += got; floatAt(e, String(got), o.color || '#ffd166', t); }
  }
  if (!o.noUlt && got) gainUlt(got * (o.basic ? U.basicDmg : U.spellDmg), t);
  return got;
}
// 맞은 쪽(나, 또는 방장 컴퓨터의 허수아비): 상태 이상을 걸고, 피해 감소를 계산해서 체력을 깎음
function applyHit(e, out, o, t, by){
  if (isDown(e) || locked()) return 0;
  const me = e === S.player;
  if (o.stun){ e.frozenUntil = Math.max(e.frozenUntil, t + o.stun); e.frozenKind = 'stun'; if (me){ e.target = null; e.flurry = null; } }
  if (o.slow) L.addEffect(e.fx, 'speed', -o.slow.v, t + o.slow.t, o.slow.tag);
  if (o.weak) L.addEffect(e.fx, 'atk', -o.weak.v, t + o.weak.t, o.weak.tag);
  if (o.pull){ e.pull = L.pushOut(L.clampToWorld(o.pull, e.r, WW, WH), e.r, WALLS); if (me){ e.target = null; e.dash = null; } }
  if (!(out > 0)) return 0;
  const m = L.takenMult(e.fx, t), dmg = Math.max(1, Math.round(out * m));
  return hurt(e, dmg, t, o.color, me && m < 1 ? ' 🛡' : '', by);
}
// by: 때린 친구 pid (내가 때렸으면 null)
function hurt(target, dmg, t, color, tag, by){
  if (isDown(target)) return 0;
  const r = L.applyDamage(target, dmg, t);
  target.hp = r.hp; target.shield = r.shield;
  const isMe = target === S.player, got = dmg - r.absorbed;
  if (isMe){ S.stats.taken += got; gainUlt(got * U.taken, t); } else if (!by) S.stats.dmg += got;
  floatAt(target, (isMe ? '-' : '') + got + (tag || ''), isMe ? (tag ? '#8fd8ff' : '#ff7b7b') : color || '#ffd166', t);
  if (target.hp > 0) return got;
  target.deadUntil = t + RESPAWN;
  addFx({type: 'poof', x: r1(target.x), y: r1(target.y), t0: t, life: 0.7}, true);
  if (isMe){
    Object.assign(target, {target: null, dash: null, flurry: null, backAt: null, pull: null, stealthUntil: 0, fx: []}); clearCharge(); S.busy = null;
    castMsg('쓰러졌어요! 3초 뒤 다시 일어나요', 'bad'); S.stats.deaths++;
    if (phase() === 'play'){ const k = S.others.get(by); if (k && k.team !== target.team) net.addScore(k.team); }   // 대결: 쓰러뜨린 팀 +1
    if (net){
      send({k: 'down', by: by || 0, who: myName()});
      addFeed(by && by !== 'dummy' ? `💥 ${nameOf(by)} → ${myName()}` : `💥 ${myName()} 쓰러짐`, '#ff9a9a');
    }
  } else {
    target.fx = []; target.pull = null;
    if (!by) S.stats.kills++; else if (by !== 'dummy') send({k: 'kill', to: by});
  }
  return got;
}

/* ---------- 친구에게서 온 신호 ---------- */
function onNetEvent(ev){
  const t = now(), from = S.others.get(ev.f), p = S.player;
  switch (ev.k){
    case 'hit': {
      const o = statusFrom(ev);
      if (ev.to === net.pid){
        if (!ev.dm && from && from.team === p.team) return;       // 같은 팀 공격은 안 아픔
        applyHit(p, ev.d, o, t, ev.dm ? 'dummy' : ev.f);
      } else if (ev.to[0] === 'd' && isAuth()){
        const d = S.dummies[+ev.to.slice(1)];
        if (d) applyHit(d, ev.d, o, t, ev.f);
      }
      break;
    }
    case 'heal':
      if (ev.to === net.pid && !p.deadUntil){ const got = healPlayer(ev.a, t, true); if (got > 0) floatAt(p, '+' + Math.round(got), '#5ce08a', t); }
      break;
    case 'buff':
      if (ev.to === net.pid && !p.deadUntil) buffMe((ev.fx || []).map(([kind, value]) => ({kind, value})), ev.tm || 0, ev.tag, ev.h, ev.c, t, ev.by);
      break;
    case 'fx': if (ev.v) S.fx.push(Object.assign({}, ev.v, {t0: t})); break;
    case 'shot': if (ev.s) S.shots.push(Object.assign({owner: 'remote', pid: ev.f, trav: 0, hit: new Set()}, ev.s)); break;
    case 'wall': S.walls.push({pts: ev.pts || [], r: 22, t0: t, until: t + ev.tm, team: ev.team}); break;
    case 'zone': S.zones.push({x: ev.x, y: ev.y, r: ev.r, rate: ev.rate, until: t + ev.tm, t0: t, color: ev.c, acc: 0, team: ev.team}); break;
    case 'sanc': S.sanctums.push({x: ev.x, y: ev.y, r: ev.r, t0: t, until: t + ev.tm, healRate: ev.hr, team: ev.team, acc: 0}); break;
    case 'field': S.fields.push({owner: ev.f, r: ev.r, t0: t, until: t + ev.tm, color: ev.c}); break;
    case 'down':
      if (ev.by === net.pid) S.stats.kills++;
      addFeed(ev.by && ev.by !== 'dummy' ? `💥 ${nameOf(ev.by)} → ${ev.who}` : `💥 ${ev.who} 쓰러짐`, ev.by === net.pid ? '#ffd84a' : '#ffffff');
      break;
    case 'kill': if (ev.to === net.pid) S.stats.kills++; break;
  }
}
// 친구 상태(0.1초마다) → 화면에 그릴 친구 정보
function onNetState(pid, st){
  const t = now(), c = classById(st.c);
  let o = S.others.get(pid);
  if (!o){
    o = {kind: 'player', id: pid, x: st.x, y: st.y, sw: st.sw, swingAt: -9, shield: 0, shieldUntil: 0};
    S.others.set(pid, o);
    addFeed(`👋 ${st.n || '친구'} 님이 들어왔어요`, '#bff7c8');
  }
  if (Math.hypot(st.x - o.x, st.y - o.y) > 400){ o.x = st.x; o.y = st.y; }   // 순간 이동·부활은 바로
  Object.assign(o, {tx: st.x, ty: st.y, name: st.n || '친구', team: st.tm === 'blue' ? 'blue' : 'red', cls: c, r: c.r, hp: st.hp, max: st.mx || c.hp,
    face: {x: (st.fa || [1, 0])[0], y: (st.fa || [1, 0])[1]}, stealth: !!st.sh, dead: !!st.dd, deadLeft: st.dd || 0, charged: st.ch || '', seen: t,
    frozenUntil: st.fz ? t + st.fz : 0, frozenKind: 'stun', k: st.k || 0, de: st.de || 0, dm: st.dm || 0, fx: (st.fx || []).map(([kind, value, left]) => ({kind, value, until: t + left, tag: 'net'}))});
  if (st.sw !== o.sw){ o.sw = st.sw; o.swingAt = t; }
}
// 방장이 보낸 허수아비 상태 (방장이 아닐 때만)
function onNetDummies(arr){
  if (!arr || isAuth()) return;
  const t = now();
  arr.forEach((a, i) => {
    const d = S.dummies[i]; if (!d || !a) return;
    d.tx = a[0]; d.ty = a[1]; if (Math.hypot(a[0] - d.x, a[1] - d.y) > 400){ d.x = a[0]; d.y = a[1]; }
    d.hp = a[2]; d.deadUntil = a[3] ? t + a[3] : 0; d.frozenUntil = a[4] ? t + a[4] : 0; d.frozenKind = a[5] ? 'stun' : 'ice';
    d.fx = [];
    if (a[6]) d.fx.push({kind: 'speed', value: -0.5, until: t + 0.5, tag: 'net'});
    if (a[7]) d.fx.push({kind: 'atk', value: -0.3, until: t + 0.5, tag: 'net'});
    d.pull = null;
  });
}
let sentAt = 0;
function publish(t){
  if (!net || t - sentAt < SEND_EVERY) return;
  sentAt = t;
  const p = S.player;
  net.publish({n: net.name, tm: p.team, c: cls.id, x: Math.round(p.x), y: Math.round(p.y), hp: r1(p.hp), mx: p.max, fa: [r2(p.face.x), r2(p.face.y)],
    fx: p.fx.filter(f => f.until > t).map(f => [f.kind, f.value, r1(f.until - t)]), sh: p.stealthUntil > t ? 1 : 0,
    dd: p.deadUntil ? Math.max(0.1, r1(p.deadUntil - t)) : 0, ch: S.charged ? S.charged.spell.color : 0, sw: p.swings, fz: t < p.frozenUntil ? r1(p.frozenUntil - t) : 0,
    k: S.stats.kills, de: S.stats.deaths, dm: Math.round(S.stats.dmg)});
  if (net.isHost()) net.publishDummies(S.dummies.map(d => [Math.round(d.x), Math.round(d.y), Math.round(d.hp), d.deadUntil ? Math.max(0.1, r1(d.deadUntil - t)) : 0,
    t < d.frozenUntil ? r1(d.frozenUntil - t) : 0, d.frozenKind === 'stun' ? 1 : 0, L.effectSum(d.fx, 'speed', t) < 0 ? 1 : 0, L.effectSum(d.fx, 'atk', t) < 0 ? 1 : 0]));
}

/* ---------- 한 프레임 진행 ---------- */
let last = now();
function update(){
  const t = now(), dt = Math.min(0.1, t - last); last = t;
  const p = S.player;
  p.fx = L.pruneEffects(p.fx, t);

  // 내가 쓰러졌다가 다시 일어남 (우리 팀 출발 자리에서)
  if (p.deadUntil && t >= p.deadUntil){ const sp = SPAWN[p.team] || SPAWN.solo; Object.assign(p, {deadUntil: 0, hp: p.max, x: sp.x, y: sp.y, frozenUntil: 0}); }
  if (p.stealthUntil && t >= p.stealthUntil) p.stealthUntil = 0;
  // 궁극기 게이지: 가만히 있어도 천천히 참 (장전한 궁극기를 들고 있을 때는 빼고)
  if (!p.deadUntil && !(S.charged && S.charged.spell === cls.ult)) gainUlt(U.idle * dt, t);
  // 칼바람: 다 휘두르면 뒤로 물러남
  if (p.backAt && t >= p.backAt.at && !p.dash && !p.deadUntil){
    const b = p.backAt, dir = b.dir || p.face; p.backAt = null;
    p.dash = {to: L.clampToWorld({x: p.x - dir.x * b.dist, y: p.y - dir.y * b.dist}, p.r, WW, WH), dmg: 0, speed: 1100, hit: new Set()}; p.target = null;
    addFx({type: 'smoke', x: r1(p.x), y: r1(p.y), t0: t, life: 0.4}, true);
  }

  if (!p.deadUntil && !locked()){
    const spd = p.speed * Math.max(0.2, 1 + L.effectSum(p.fx, 'speed', t));
    if (p.pull){                                         // 강철 사슬에 끌려감
      const m = L.moveToward(p, p.pull, PULL_SPEED * dt);
      p.x = m.x; p.y = m.y;
      if (m.arrived) p.pull = null;
    } else if (p.dash){                                  // 돌진: 빠르게 미끄러지며 부딪힌 적에 피해
      const m = L.moveToward(p, p.dash.to, p.dash.speed * dt);
      const pos = L.pushOut(m, p.r, WALLS);
      const blocked = Math.hypot(pos.x - m.x, pos.y - m.y) > 1;
      p.x = pos.x; p.y = pos.y;
      if (p.dash.dmg) for (const e of enemies()) if (!p.dash.hit.has(e) && dist(e, p) < e.r + p.r + (p.dash.wide || 8)){ p.dash.hit.add(e); dealHit(e, p.dash.dmg, t, {color: p.dash.color}); }
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
    // 검의 폭풍·칼바람: 정해진 시간 동안 마우스 쪽으로 계속 연타
    if (p.flurry){
      while (p.flurry && t >= p.flurry.next && p.flurry.next < p.flurry.until - 1e-6){ melee(t, p.flurry.sp, false, p.flurry.sp.color); p.flurry.next += p.flurry.sp.every; }
      if (p.flurry && t >= p.flurry.until) p.flurry = null;
    }
  }

  if (S.charged && t >= S.charged.until){
    S.fx.push({type: 'fizzle', x: p.x, y: p.y - 40, t0: t, life: 0.6});
    castMsg(`${S.charged.spell.name}: 힘이 흩어졌어요`, 'bad'); clearCharge();
  }

  // 회복 샘 (우리 팀 샘만)
  for (const z of S.zones){
    if (!p.deadUntil && z.team === p.team && dist(p, z) < z.r){
      z.acc += healPlayer(z.rate * dt, t, true);
      if (z.acc >= 5){ floatAt(p, '+' + Math.round(z.acc), '#5ce08a', t); z.acc = 0; }
    }
  }
  S.zones = S.zones.filter(z => t < z.until);

  // 새벽의 성역: 우리 팀은 회복, 안의 적은 1초마다 피해 + 나약함 (피해는 성역을 만든 사람이 계산)
  for (const s of S.sanctums){
    if (!p.deadUntil && s.team === p.team && dist(p, s) < s.r){
      s.acc += healPlayer(s.healRate * dt, t, true);
      if (s.acc >= 5){ floatAt(p, '+' + Math.round(s.acc), '#5ce08a', t); s.acc = 0; }
    }
    if (!s.mine || t < s.nextTick) continue;
    s.nextTick += 1;
    for (const e of enemies()) if (dist(e, s) < s.r + e.r) dealHit(e, s.dmgPer, t, {color: '#fff0a0', noUlt: true, weak: {v: s.weak, t: 1.2, tag: s.id}});
  }
  S.sanctums = S.sanctums.filter(s => t < s.until);
  // 멈춰 버린 세계: 나를 따라다니는 범위 안의 적은 느려짐 (나가도 1초 동안은 느림)
  for (const f of S.fields){
    if (f.owner !== 'me' || p.deadUntil || t < f.next) continue;
    f.next = t + 0.5;
    for (const e of enemies()) if (dist(e, p) < f.r + e.r) dealHit(e, 0, t, {slow: {v: f.slow, t: 1, tag: f.id}, noUlt: true});
  }
  S.fields = S.fields.filter(f => t < f.until && (f.owner === 'me' ? !p.deadUntil : S.others.has(f.owner)));
  S.walls = S.walls.filter(w => t < w.until);
  if (S.tint && t >= S.tint.until) S.tint = null;
  if (S.busy && t >= S.busy.until) S.busy = null;

  // 친구들: 받은 위치로 부드럽게 따라감
  for (const o of others()){
    if (o.tx === undefined) continue;
    o.x += (o.tx - o.x) * Math.min(1, dt * 12); o.y += (o.ty - o.y) * Math.min(1, dt * 12);
  }

  // 허수아비들 (방장 또는 혼자일 때만 계산, 아니면 방장이 보낸 위치로 따라감)
  if (isAuth() && !inMatch()) updateDummies(t, dt);
  else for (const d of S.dummies){ d.x += (d.tx - d.x) * Math.min(1, dt * 12); d.y += (d.ty - d.y) * Math.min(1, dt * 12); }

  // 날아가는 공격
  const myWallHit = s => S.walls.some(w => w.team !== s.team && w.pts.some(q => Math.hypot(s.x - q.x, s.y - q.y) < s.r + w.r));
  for (const s of S.shots){
    const step = Math.hypot(s.vx, s.vy) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.trav += step;
    if (s.trav > s.range || s.x < -40 || s.x > WW + 40 || s.y < -40 || s.y > WH + 40){ s.dead = true; continue; }
    const puff = look => { s.dead = true; S.fx.push({type: 'puff', x: s.x, y: s.y, t0: t, life: 0.35, look: look || s.look}); };
    if (!s.pierce && L.pointInRects(s.x, s.y, s.r * 0.4, BLOCKERS)){ puff(); continue; }
    if (myWallHit(s)){ puff('rock'); continue; }                 // 다른 팀(허수아비는 모두)의 바위벽에 막힘
    if (s.owner === 'remote'){                                   // 친구 화면의 공격: 그림만 (맞았는지는 쏜 친구가 계산)
      const hitSomething = (s.team !== 'dummy' && alive().some(d => dist(s, d) < s.r + d.r))
        || (!p.deadUntil && p.team !== s.team && dist(s, p) < s.r + p.r)
        || others().some(o => o.id !== s.pid && !o.dead && o.team !== s.team && dist(s, o) < s.r + o.r);
      if (hitSomething) puff();
      continue;
    }
    if (s.owner === 'dummy'){                                    // 허수아비 공격: 나 또는 친구에게
      const out = s.dmg * Math.max(0.1, 1 + L.effectSum(s.src ? s.src.fx : [], 'atk', t));
      if (!p.deadUntil && dist(s, p) < s.r + p.r){ applyHit(p, out, {}, t, 'dummy'); puff(); continue; }
      const o = others().find(o => !o.dead && dist(s, o) < s.r + o.r);
      if (o){ send({k: 'hit', to: o.id, d: r2(out), dm: 1}); puff(); }
      continue;
    }
    // 내 공격: 적에게 피해, 덩굴 화살은 아군 회복
    for (const e of enemies()){
      if (s.dead) break;
      if (s.hit.has(e) || dist(s, e) >= s.r + e.r) continue;
      s.hit.add(e);
      const o = {basic: s.basic, color: s.color || '#ffd166'};
      if (s.pull){ const ux = (e.x - p.x) / (dist(e, p) || 1), uy = (e.y - p.y) / (dist(e, p) || 1), gap = p.r + e.r + 16; o.pull = {x: p.x + ux * gap, y: p.y + uy * gap}; }
      dealHit(e, s.dmg, t, o);
      puff();
      if (s.pierce) s.dead = false;
    }
    if (!s.dead && s.allyHeal) for (const o of allies()) if (dist(s, o) < s.r + o.r){ healAlly(o, s.allyHeal, t); puff(); break; }
  }
  S.shots = S.shots.filter(s => !s.dead);

  S.fx = S.fx.filter(f => t - f.t0 < f.life);
  S.floats = S.floats.filter(f => t - f.t0 < (f.life || 1));
  S.feed = S.feed.filter(f => t - f.t0 < 6);

  const want = L.camFollow(p, VW, VH, WW, WH);
  cam = {x: cam.x + (want.x - cam.x) * Math.min(1, dt * 8), y: cam.y + (want.y - cam.y) * Math.min(1, dt * 8)};
  publish(t);
}
function updateDummies(t, dt){
  const p = S.player;
  // 반격 모드에서 노릴 수 있는 사람 (쓰러졌거나 투명하면 못 봄)
  const people = [p].concat(others()).filter(e => e === p ? !p.deadUntil && p.stealthUntil <= t : !e.dead && !e.stealth);
  for (const d of S.dummies){
    if (d.deadUntil && t >= d.deadUntil){ Object.assign(d, {deadUntil: 0, hp: d.max, frozenUntil: 0, x: d.baseX, y: d.baseY, fx: []}); }
    if (d.deadUntil) continue;
    d.fx = L.pruneEffects(d.fx, t);
    if (d.pull){                                         // 강철 사슬에 끌려옴
      const m = L.moveToward(d, d.pull, PULL_SPEED * dt);
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
    // 반격 모드: 가장 가까운 사람에게 공격을 쏨
    if (S.dummyMode === 'attack' && free && t >= d.nextShot){
      const who = people.filter(e => dist(e, d) < DUMMY_SIGHT).sort((a, b) => dist(a, d) - dist(b, d))[0];
      if (who){
        const dx = who.x - d.x, dy = who.y - d.y, len = Math.hypot(dx, dy) || 1;
        shoot('dummy', d, {x: dx / len, y: dy / len}, DUMMY_SHOT, d);
        d.nextShot = t + (DUMMY_RATE + Math.random() * 0.6) / mult;
      }
    }
  }
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
  for (const f of S.fields){
    const p = f.owner === 'me' ? S.player : S.others.get(f.owner); if (!p) continue;   // 범위는 만든 사람을 따라다님
    const k = Math.min(1, (t - f.t0) / 0.4), fade = Math.min(1, (f.until - t) / 0.6);
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(140,110,255,.10)'; circle(p.x, p.y, f.r * k);
    ctx.strokeStyle = 'rgba(199,184,255,.85)'; ctx.lineWidth = 4; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.arc(p.x, p.y, f.r * k, t * 0.4, t * 0.4 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
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
/* 캐릭터 그림 (art/ 폴더, magic-art.js가 배경을 지워 둠). 그림은 오른쪽을 보는 모습 → 왼쪽을 보면 좌우로 뒤집음 */
const SPRITE_H = {tank: 104, dealer: 90, healer: 90};
const spriteOf = c => window.MagicArt ? MagicArt.get(c.id) : null;
// 캐릭터 머리 위 높이 (체력 막대·이름표를 그 위에)
function topOf(e, c){
  const img = spriteOf(c || cls);
  return img ? e.y + e.r * 0.95 - (SPRITE_H[(c || cls).id] || e.r * 3.8) - 4 : e.y - e.r - 20;
}
/* 그림 한 장으로 움직임 흉내 내기
   - 걷기: 발을 축으로 좌우로 뒤뚱 + 통통 뛰기 + 땅에 닿을 때 살짝 납작, 발걸음마다 먼지
     (걸음 빠르기는 실제로 움직인 거리에 맞춤 → 빨리 걸으면 빨리 뒤뚱)
   - 서 있기: 숨쉬듯 아주 살짝 커졌다 작아짐
   - 공격: 앞으로 쑥 내밀며 기울임 / 돌진: 앞으로 숙이고 길쭉하게 */
function drawSprite(p, t, img, c){
  if (Math.abs(p.face.x) > 0.15) p.look = p.face.x < 0 ? -1 : 1;   // 위·아래로 갈 땐 보던 쪽 그대로
  const dir = p.look || 1, h = SPRITE_H[c.id] || p.r * 3.8, w = h * img.width / img.height;
  // 이번 장면에서 움직인 거리 → 걸음
  const moved = p.lastX === undefined ? 0 : Math.hypot(p.x - p.lastX, p.y - p.lastY);
  p.lastX = p.x; p.lastY = p.y;
  const dashing = !!p.dash || (p.kind === 'player' && moved > 9);
  const walking = !dashing && moved > 0.25 && moved < 40;
  p.walkK = Math.max(0, Math.min(1, (p.walkK || 0) + (walking ? 0.2 : -0.12)));     // 걷기 ↔ 서 있기 부드럽게 바뀜
  if (walking){
    const before = Math.floor((p.walkT || 0) / Math.PI);
    p.walkT = (p.walkT || 0) + Math.min(moved, 12) / 13;
    if (Math.floor(p.walkT / Math.PI) !== before && inView(p.x, p.y, 0)) S.fx.push({type: 'dust', x: p.x - dir * 6, y: p.y + p.r * 0.95, t0: t, life: 0.35});   // 발걸음 먼지
  }
  const k = p.walkK, ph = p.walkT || 0;
  let rot = Math.sin(ph) * 0.11 * k;                          // 뒤뚱
  let lift = Math.abs(Math.sin(ph)) * 7 * k;                  // 통통
  const land = (1 - Math.abs(Math.sin(ph))) * k;              // 땅에 닿는 순간
  let sx = 1 + land * 0.05, sy = 1 - land * 0.06;             // 닿을 때 납작
  if (k < 1){ const br = Math.sin(t * 2.6) * 0.018 * (1 - k); sy += br; sx -= br * 0.5; }   // 숨쉬기
  let fwd = 0;
  const sw = Math.min(1, Math.max(0, (t - p.swingAt) / 0.22));
  if (sw < 1){ const a = Math.sin(sw * Math.PI); rot += a * 0.24; fwd += a * 9; sx += a * 0.04; }   // 공격: 앞으로 쑥
  if (dashing){ rot += 0.2; sx *= 1.1; sy *= 0.94; lift = 0; }                                  // 돌진: 앞으로 숙임
  ctx.save(); ctx.translate(p.x + fwd * dir, p.y + p.r * 0.95 - lift); ctx.scale(dir * sx, sy); ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}
/* 그림이 없을 때 코드로 그리는 간단한 모습 */
function drawHero(p, t, hc){
  const art = spriteOf(hc || cls);
  if (art) return drawSprite(p, t, art, hc || cls);
  const c = hc || cls, f = p.face, ang = Math.atan2(f.y, f.x), r = p.r;
  const L90 = {x: f.y, y: -f.x}, R90 = {x: -f.y, y: f.x};                    // 캐릭터 기준 왼손·오른손 쪽
  const sw = Math.min(1, Math.max(0, (t - p.swingAt) / 0.22)), swing = sw < 1 ? -1.2 + 2.4 * sw : 0;   // 휘두르는 중이면 무기가 돌아감
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
    // 오른손: 검
    ctx.save(); ctx.translate(p.x + R90.x * (r - 2) + f.x * 4, p.y + R90.y * (r - 2) + f.y * 4); ctx.rotate(ang + swing);
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(-12, -2.5, 11, 5);                 // 손잡이
    ctx.fillStyle = '#c9a23a'; ctx.fillRect(-2, -9, 5, 18); circle(-13, 0, 3.5); // 가드·끝 장식
    ctx.fillStyle = '#e6ebf3'; ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(40, -3); ctx.lineTo(47, 0); ctx.lineTo(40, 3); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(40, 0); ctx.stroke();
    ctx.restore();
    // 왼손: 큰 방패
    ctx.save(); ctx.translate(p.x + L90.x * (r + 2) + f.x * 8, p.y + L90.y * (r + 2) + f.y * 8); ctx.rotate(ang);
    ctx.fillStyle = '#6f7789'; ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(8, -20); ctx.quadraticCurveTo(12, 0, 8, 20); ctx.lineTo(-6, 20); ctx.quadraticCurveTo(-10, 0, -6, -20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c4cad6'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.moveTo(2, -11); ctx.lineTo(7, 0); ctx.lineTo(2, 11); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (c.id === 'dealer'){
    // 두건
    ctx.fillStyle = c.dark; ctx.beginPath(); ctx.arc(hx, hy, r * 0.6, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx - r * 0.55, hy - 2); ctx.lineTo(hx - f.x * r * 0.9, hy - r * 0.95); ctx.lineTo(hx + r * 0.55, hy - 2); ctx.closePath(); ctx.fill();
    // 양손 단검 (휘두를 때 엇갈려 벰)
    for (const [side, k] of [[L90, -1], [R90, 1]]){
      ctx.save(); ctx.translate(p.x + side.x * (r - 1) + f.x * 6, p.y + side.y * (r - 1) + f.y * 6); ctx.rotate(ang + swing * k * 0.8 + k * 0.25);
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(-7, -2.5, 9, 5);
      ctx.fillStyle = '#c9a23a'; ctx.fillRect(1, -5, 3, 10);
      ctx.fillStyle = '#e9edf5'; ctx.beginPath(); ctx.moveTo(4, -3.5); ctx.lineTo(24, 0); ctx.lineTo(4, 3.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  } else {
    // 나뭇잎 관
    ctx.fillStyle = '#7ddc6a';
    for (let i = -2; i <= 2; i++){ ctx.beginPath(); ctx.ellipse(hx + i * 5, hy - r * 0.62 + Math.abs(i) * 1.5, 3, 6, i * 0.35, 0, Math.PI * 2); ctx.fill(); }
    // 몸을 감은 덩굴
    ctx.strokeStyle = c.dark; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y + 4, r * 0.82, 0.2, 2.6); ctx.stroke();
    ctx.fillStyle = '#7ddc6a'; circle(p.x + r * 0.8, p.y + 8, 3); circle(p.x - r * 0.55, p.y + r * 0.7, 3);
    // 덩굴 활: 덩굴이 감긴 활대 + 잎사귀 + 가운데 꽃
    ctx.save(); ctx.translate(p.x + f.x * (r + 5), p.y + f.y * (r + 5)); ctx.rotate(ang);
    const bx = -10, br = 23, a0 = -1.15, a1 = 1.15, at = a => ({x: bx + Math.cos(a) * br, y: Math.sin(a) * br});
    ctx.strokeStyle = '#eef6e8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(at(a0).x, at(a0).y); ctx.lineTo(at(a1).x, at(a1).y); ctx.stroke();   // 시위
    ctx.strokeStyle = '#4a6b25'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(bx, 0, br, a0, a1); ctx.stroke();                  // 활대 (덩굴 줄기)
    ctx.strokeStyle = '#8fdc5e'; ctx.lineWidth = 1.8; ctx.beginPath();                                                                                  // 감긴 덩굴
    for (let i = 0; i <= 24; i++){ const a = a0 + (a1 - a0) * i / 24, q = at(a), w = Math.sin(i * 1.6) * 3.2; const px = q.x + Math.cos(a) * w, py = q.y + Math.sin(a) * w; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = '#6fd65a';
    for (const a of [-0.95, -0.45, 0.45, 0.95]){ const q = at(a); ctx.beginPath(); ctx.ellipse(q.x + Math.cos(a) * 5, q.y + Math.sin(a) * 5, 5, 2.6, a + 0.6, 0, Math.PI * 2); ctx.fill(); }
    for (const a of [a0, a1]){ const q = at(a); ctx.strokeStyle = '#8fdc5e'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q.x - 3, q.y + (a < 0 ? -3 : 3), 3.5, 0, Math.PI * 1.5); ctx.stroke(); }   // 끝에 말린 덩굴손
    const m = at(0); ctx.fillStyle = '#ffb3d9'; for (let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; circle(m.x + Math.cos(a) * 3.2, m.y + Math.sin(a) * 3.2, 2.4); }
    ctx.fillStyle = '#ffe16b'; circle(m.x, m.y, 1.8);
    ctx.restore();
  }
}
const FX_ICON = {atk: '⚔', def: '🛡', speed: '👟', basic: '👊', reach: '📏'};
function drawPlayer(t){
  const p = S.player;
  if (p.deadUntil){
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '800 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`쓰러짐… ${Math.ceil(p.deadUntil - t)}`, p.x, p.y - 40);
    return;
  }
  const hidden = p.stealthUntil > t;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r + 2, p.r, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (net) teamRing(p);
  if (L.takenMult(p.fx, t) < 1){ ctx.strokeStyle = 'rgba(95,225,255,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.stroke(); }
  if (L.effectSum(p.fx, 'atk', t) > 0){ ctx.strokeStyle = 'rgba(255,120,150,.75)'; ctx.lineWidth = 3; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 15, -t * 2, -t * 2 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  const ch = S.charged;
  if (S.busy && S.busy.until > t){   // 스킬 쓰는 중: 남은 시간만큼 흰 고리
    const k = (S.busy.until - t) / S.busy.len;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
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
  const top = topOf(p);
  bar(p.x, top - 10, 64, p.hp / p.max, '#ff5d73');
  if (net) nameTag(p, `${cls.icon} ${net.name} (나)`);
  // 걸려 있는 효과 아이콘
  const icons = Object.keys(FX_ICON).filter(k => k === 'def' ? L.takenMult(p.fx, t) < 1 : L.effectSum(p.fx, k, t) > 0).map(k => FX_ICON[k]).join('') + (hidden ? '👻' : '');
  if (icons){ ctx.font = '16px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(icons, p.x, top - 16); }
  const label = ch ? '⚡ ' + ch.spell.name : inp.value;
  if (label){
    ctx.font = '800 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 24, y = top - 70;
    ctx.fillStyle = ch ? 'rgba(60,40,0,.9)' : 'rgba(8,30,16,.88)'; roundRect(p.x - w / 2, y, w, 32, 10); ctx.fill();
    ctx.fillStyle = ch ? '#ffd84a' : '#e3ffe9'; ctx.fillText(label, p.x, y + 23);
  }
}
function drawShots(){
  for (const s of S.shots){
    const by = s.owner === 'me' ? S.player : S.others.get(s.pid);   // 사슬은 던진 사람과 이어져 있음
    if (s.look === 'chain' && by){ ctx.strokeStyle = 'rgba(207,214,230,.85)'; ctx.lineWidth = 3; ctx.setLineDash([9, 5]); ctx.beginPath(); ctx.moveTo(by.x, by.y); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.setLineDash([]); }
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
}
// 떠오르는 숫자·글자는 캐릭터 그림보다 위에
function drawFloats(t){
  for (const f of S.floats){
    const life = f.life || 1, k = (t - f.t0) / life;
    ctx.globalAlpha = Math.max(0, Math.min(1, (1 - k) * 2)); ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
    ctx.font = `800 ${f.size || 24}px "Malgun Gothic","Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center';
    ctx.strokeText(f.text, f.x, f.y - k * 40); ctx.fillText(f.text, f.x, f.y - k * 40);
    ctx.globalAlpha = 1;
  }
}
function drawMinimap(){
  const mw = 220, mh = mw * WH / WW, mx = VW - mw - 16, my = VH - mh - 16, k = mw / WW;
  ctx.fillStyle = 'rgba(6,20,12,.75)'; roundRect(mx - 4, my - 4, mw + 8, mh + 8, 10); ctx.fill();
  ctx.fillStyle = 'rgba(44,100,64,.95)'; ctx.fillRect(mx, my, mw, mh);
  for (const o of OBSTACLES){ ctx.fillStyle = o.kind === 'pond' ? '#3d94c9' : o.kind === 'rock' ? '#9fa69c' : '#17552d'; ctx.fillRect(mx + o.x * k, my + o.y * k, Math.max(3, o.w * k), Math.max(3, o.h * k)); }
  if (!inMatch()) for (const d of S.dummies){ ctx.fillStyle = d.deadUntil ? 'rgba(255,255,255,.35)' : '#ff8a5c'; ctx.beginPath(); ctx.arc(mx + d.x * k, my + d.y * k, 3.5, 0, Math.PI * 2); ctx.fill(); }
  for (const o of S.others.values()){                 // 친구: 우리 팀은 초록, 다른 팀은 팀 색 (숨으면 안 보임)
    if (o.dead || (o.stealth && o.team !== S.player.team)) continue;
    ctx.fillStyle = o.team === S.player.team ? '#5ce08a' : (TEAMS[o.team] || {}).color || '#fff';
    ctx.beginPath(); ctx.arc(mx + o.x * k, my + o.y * k, 4.5, 0, Math.PI * 2); ctx.fill();
  }
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
  if (!inMatch()) for (const d of S.dummies) drawDummy(d, t);
  for (const o of S.others.values()) drawRemote(o, t);
  drawPlayer(t); drawShots(); drawFloats(t);
  ctx.setTransform(base, 0, 0, base, 0, 0);
  if (S.tint){   // 멈춰 버린 세계: 화면이 보랏빛으로
    const a = Math.min(1, (t - S.tint.t0) / 0.3) * Math.min(1, (S.tint.until - t) / 0.5) * 0.16;
    ctx.fillStyle = `rgba(${S.tint.color},${a})`; ctx.fillRect(0, 0, VW, VH);
  }
  drawMinimap(); drawFeed(t); drawMatchHud();
}

/* ---------- 친구 그리기 (온라인) ---------- */
function teamRing(e){
  const c = (TEAMS[e.team] || {}).color; if (!c) return;
  ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.6, e.r + 8, e.r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
}
function nameTag(e, text){
  ctx.font = '800 15px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
  const y = e.y + e.r + 26;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, e.x, y);
  ctx.fillStyle = (TEAMS[e.team] || {}).color || '#ffffff'; ctx.fillText(text, e.x, y);
}
function drawRemote(o, t){
  if (!o.cls || !inView(o.x, o.y, 120)) return;
  const enemy = o.team !== S.player.team;
  if (o.dead){
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '800 18px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${o.name} 쓰러짐…`, o.x, o.y);
    return;
  }
  const hidden = o.stealth;
  if (hidden && enemy){ ctx.globalAlpha = 0.07; drawHero(o, t, o.cls); ctx.globalAlpha = 1; return; }   // 다른 팀이 숨으면 거의 안 보임
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(o.x, o.y + o.r + 2, o.r, 7, 0, 0, Math.PI * 2); ctx.fill();
  teamRing(o);
  if (L.takenMult(o.fx, t) < 1){ ctx.strokeStyle = 'rgba(95,225,255,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = hidden ? 0.32 : 1;
  drawHero(o, t, o.cls);
  ctx.globalAlpha = 1;
  if (o.charged){
    const tipX = o.x + o.face.x * (o.r + 14), tipY = o.y + o.face.y * (o.r + 14);
    const g = ctx.createRadialGradient(tipX, tipY, 1, tipX, tipY, 18 + Math.sin(t * 10) * 3);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, o.charged); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; circle(tipX, tipY, 22);
  }
  if (t < o.frozenUntil){
    ctx.fillStyle = '#fff6a8'; ctx.font = '800 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++){ const a = t * 5 + i * 2.1; ctx.fillText('★', o.x + Math.cos(a) * 24, topOf(o, o.cls) - 30 + Math.sin(a) * 6); }
  }
  const top = topOf(o, o.cls);
  bar(o.x, top - 10, 64, o.hp / o.max, enemy ? '#ff5d73' : '#5ce08a');
  const icons = Object.keys(FX_ICON).filter(k => k === 'def' ? L.takenMult(o.fx, t) < 1 : L.effectSum(o.fx, k, t) > 0).map(k => FX_ICON[k]).join('')
    + (L.effectSum(o.fx, 'speed', t) < 0 ? '🐢' : '') + (L.effectSum(o.fx, 'atk', t) < 0 ? '💧' : '') + (hidden ? '👻' : '');
  if (icons){ ctx.font = '16px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(icons, o.x, top - 16); }
  nameTag(o, `${o.cls.icon} ${o.name}`);
}
function drawFeed(t){
  let y = 22;
  ctx.textAlign = 'right'; ctx.font = '800 17px "Malgun Gothic","Segoe UI Emoji",sans-serif';
  for (const f of S.feed){
    ctx.globalAlpha = Math.min(1, (6 - (t - f.t0)) / 0.8);
    const w = ctx.measureText(f.text).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(VW - 16 - w, y - 4, w, 28, 9); ctx.fill();
    ctx.fillStyle = f.color; ctx.fillText(f.text, VW - 26, y + 16);
    y += 34;
  }
  ctx.globalAlpha = 1;
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
  const ch = S.charged, bz = busyLeft(t);
  for (const sp of allSpells(cls)){
    const li = document.querySelector(`#book li[data-id="${sp.id}"]`); if (!li) continue;
    const isCh = !!ch && ch.spell.id === sp.id, em = li.querySelector('em'), bar = li.querySelector('i');
    // 스킬을 쓰는 중: 그 칸은 남은 시간, 다른 칸은 🔒 (그림자 은신은 그대로)
    const using = bz > 0 && S.busy.sp.id === sp.id, locked = bz > 0 && !using && !sp.instant;
    li.classList.toggle('using', using); li.classList.toggle('locked', locked);
    if (using || locked){
      li.classList.remove('charged', 'ready'); li.classList.toggle('cool', locked);
      em.textContent = using ? '⏳ ' + bz.toFixed(1) + '초' : '🔒';
      bar.style.width = (using ? bz / S.busy.len * 100 : 0) + '%';
      continue;
    }
    if (sp === cls.ult){
      li.classList.remove('cool');
      const ready = unl() || S.ult >= U.need, pct = unl() ? 100 : Math.floor(S.ult / U.need * 100);
      li.classList.toggle('ready', ready && !isCh); li.classList.toggle('charged', isCh);
      em.textContent = isCh ? '⚡ ' + Math.max(0, ch.until - t).toFixed(1) + '초' : unl() ? '♾' : ready ? '준비!' : pct + '%';
      bar.style.width = (isCh ? (ch.until - t) / CHARGE * 100 : pct) + '%';
      continue;
    }
    const left = unl() ? 0 : L.cooldownLeft(S.cds[sp.id], sp.cd, t);
    li.classList.toggle('cool', left > 0); li.classList.toggle('charged', isCh);
    em.textContent = isCh ? '⚡ ' + Math.max(0, ch.until - t).toFixed(1) + '초' : left > 0 ? left.toFixed(1) + '초' : '✔';
    bar.style.width = (isCh ? (ch.until - t) / CHARGE * 100 : left > 0 ? left / sp.cd * 100 : 0) + '%';
  }
  const p = S.player;
  $('#hpText').textContent = `${Math.round(p.hp)} / ${p.max} · ${cls.name}`;
  $('#hpFill').style.width = (p.hp / p.max * 100) + '%';
  $('#ultFill').style.width = (unl() ? 100 : S.ult / U.need * 100) + '%';
  $('#ultText').textContent = unl() ? '♾ 무제한' : S.ult >= U.need ? '🌟 준비!' : Math.floor(S.ult / U.need * 100) + '%';
  const st = S.stats, total = st.ok + st.fail;
  $('#stats').innerHTML = `준 피해 <b>${Math.round(st.dmg)}</b> · 쓰러뜨림 <b>${st.kills}</b> · 받은 피해 <b>${Math.round(st.taken)}</b> · 회복 <b>${Math.round(st.healed)}</b> · 정확도 <b>${total ? Math.round(st.ok / total * 100) + '%' : '-'}</b>`;
  if (net && t - listAt > 0.5){ listAt = t; renderRoomList(); }
  const ph = phase();
  if (ph !== lastPhase){ lastPhase = ph; onPhase(ph); }
}
let lastPhase = null;
let listAt = 0;

/* ---------- 캐릭터 고르기 ---------- */
function buildPick(){
  const box = $('#cards'); box.textContent = '';
  for (const c of CLASSES){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'card' + (c === cls ? ' last' : ''); b.style.setProperty('--c', c.color);
    b.innerHTML = `<div class="face"><div class="dot"></div><div><span class="role"></span><b></b><small class="title"></small></div></div><div class="about"></div><div class="nums"><span></span><span></span><span></span></div><ul></ul>`;
    const dot = b.querySelector('.dot'), pic = window.MagicArt && MagicArt.url(c.id);
    if (pic){ dot.classList.add('img'); dot.style.backgroundImage = `url(${pic})`; } else dot.textContent = c.icon;
    b.querySelector('.role').textContent = c.role; b.querySelector('b').textContent = c.name; b.querySelector('.title').textContent = c.title;
    b.querySelector('.about').textContent = c.about;
    const n = b.querySelectorAll('.nums span'); n[0].textContent = `❤ 체력 ${c.hp}`; n[1].textContent = `👟 속도 ${c.speed}`; n[2].textContent = c.basic.melee ? '👊 근접' : '🏹 원거리';
    for (const sp of allSpells(c)){ const li = document.createElement('li'); li.textContent = sp === c.ult ? '🌟 ' + sp.name : sp.name; if (sp === c.ult) li.className = 'u'; b.querySelector('ul').appendChild(li); }
    b.onclick = () => choose(c);
    box.appendChild(b);
  }
}
let pickMode = 'solo';
function openPick(){ buildPick(); $('#pick').hidden = false; refreshPick(); const last = $('#cards .last'); if (last && !$('#cardsBox').hidden) last.focus(); }
function refreshPick(){
  const inRoom = !!net, friend = pickMode === 'friend' || inRoom;
  $('#modeSolo').classList.toggle('on', !friend); $('#modeFriend').classList.toggle('on', friend);
  $('#modes').hidden = inRoom;
  $('#friendBox').hidden = !friend;
  $('#fEntry').hidden = inRoom; $('#fRoom').hidden = !inRoom;
  $('#cardsBox').hidden = friend && !inRoom;
  if (inRoom){ $('#roomCode').textContent = net.code; renderTeamBtns(); renderRoomList(); }
}
function choose(c){
  cls = c; try { localStorage.setItem('magic.class', c.id); } catch (e) {}
  resetMe();
  S.cds = {}; S.lastBasic = undefined; S.lockUntil = 0; S.ult = 0; S.busy = null; clearCharge();
  S.shots = S.shots.filter(s => s.owner !== 'me'); S.fields = S.fields.filter(f => f.owner !== 'me'); S.sanctums = S.sanctums.filter(s => !s.mine); S.tint = null;
  if (!net){ S.shots = []; S.zones = []; S.walls = []; S.sanctums = []; S.fields = []; for (const d of S.dummies){ d.fx = []; d.pull = null; } }
  inp.value = ''; castMsg(`${c.role} · ${c.name}!`, 'good');
  buildBook(); $('#pick').hidden = true; focusSpell();
}
// 내 캐릭터를 우리 팀 출발 자리에 새로
function resetMe(){
  const team = net ? (S.player.team === 'blue' ? 'blue' : 'red') : 'solo';
  S.player = makePlayer(cls, team);
  cam = L.camFollow(S.player, VW, VH, WW, WH);
}
$('#pickBtn').onclick = openPick;
$('#modeSolo').onclick = () => { pickMode = 'solo'; refreshPick(); };
$('#modeFriend').onclick = () => { pickMode = 'friend'; refreshPick(); const n = $('#nameInput'); (n.value ? $('#codeInput') : n).focus(); };

/* ---------- 👫 친구랑 연습: 방 만들기 · 들어가기 · 나가기 ---------- */
try { $('#nameInput').value = localStorage.getItem('magic.name') || ''; } catch (e) {}
const fMsg = m => { $('#fMsg').textContent = m; };
function getName(){
  const n = $('#nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 10);
  if (!n){ fMsg('닉네임을 먼저 적어 주세요.'); $('#nameInput').focus(); return null; }
  try { localStorage.setItem('magic.name', n); } catch (e) {}
  return n;
}
function setNetBusy(b){ $('#createBtn').disabled = b; $('#joinBtn').disabled = b; }
async function goOnline(make){
  const name = getName(); if (!name) return;
  if (!window.MagicNet){ fMsg('온라인 연결 파일을 못 불러왔어요. 새로고침해 주세요.'); return; }
  setNetBusy(true); fMsg(make ? '방을 만드는 중…' : '들어가는 중…');
  try {
    const conn = make ? await MagicNet.create(name) : await MagicNet.join($('#codeInput').value.trim(), name);
    startNet(conn);
    fMsg('');
  } catch (e) { console.error(e); fMsg(e && e.message ? e.message : '서버에 연결하지 못했어요.'); }
  finally { setNetBusy(false); }
}
$('#createBtn').onclick = () => goOnline(true);
$('#joinBtn').onclick = () => goOnline(false);
$('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') goOnline(false); });
$('#codeInput').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
$('#nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#codeInput').focus(); });

function startNet(conn){
  net = conn;
  net.on.event = onNetEvent;
  net.on.state = onNetState;
  net.on.leave = pid => { const o = S.others.get(pid); if (o) addFeed(`👋 ${o.name} 님이 나갔어요`, '#cfd6e6'); S.others.delete(pid); };
  net.on.dummies = onNetDummies;
  net.on.mode = m => showDummyMode(m);
  net.on.match = onMatch;
  net.on.host = () => { renderRoomBar(); if (net && net.isHost()) for (const d of S.dummies){ d.nextShot = 0; } };
  S.others.clear(); S.shots = []; S.zones = []; S.walls = []; S.sanctums = []; S.fields = []; S.feed = []; S.tint = null;
  S.player.team = net.created ? 'red' : 'blue';           // 처음엔 방장 빨강, 들어온 친구 파랑 (언제든 바꿀 수 있음)
  resetMe(); clearCharge(); S.busy = null;
  for (const d of S.dummies) Object.assign(d, {hp: d.max, deadUntil: 0, fx: [], pull: null, x: d.baseX, y: d.baseY, tx: d.baseX, ty: d.baseY});
  try { sessionStorage.setItem('magic.code', net.code); } catch (e) {}
  document.body.classList.add('online');
  $('#subTitle').textContent = '친구랑 연습';
  addFeed(net.created ? `🏠 방을 만들었어요! 코드 ${net.code}` : `🏠 ${net.code} 방에 들어왔어요`, '#ffd84a');
  renderRoomBar(); refreshPick();
}
async function leaveNet(){
  if (!net) return;
  const n = net; net = null; match = null; matchId = null; $('#result').hidden = true;
  S.others.clear(); S.shots = []; S.zones = []; S.walls = []; S.sanctums = []; S.fields = []; S.feed = []; S.tint = null;
  S.player.team = 'solo'; resetMe(); clearCharge(); S.busy = null;
  try { sessionStorage.removeItem('magic.code'); } catch (e) {}
  document.body.classList.remove('online');
  $('#subTitle').textContent = '연습판';
  renderRoomBar(); refreshPick(); castMsg('방에서 나왔어요. 혼자 연습 중', 'good');
  await n.leave();
}
$('#leaveBtn').onclick = $('#leaveBtn2').onclick = () => { if (confirm('방에서 나갈까요?')) leaveNet(); };
window.addEventListener('pagehide', () => { if (net) net.leave(); });

function setTeam(team){
  if (!net || S.player.team === team) return;
  if (inMatch()){ castMsg('대결 중에는 팀을 못 바꿔요', 'wait'); return; }
  S.player.team = team; resetMe(); clearCharge(); S.busy = null;
  castMsg(`${TEAMS[team].name}이 됐어요!`, 'good'); renderTeamBtns(); renderRoomBar(); focusSpell();
}
$('#teamRed').onclick = () => setTeam('red');
$('#teamBlue').onclick = () => setTeam('blue');
$('#teamBtn').onclick = () => setTeam(S.player.team === 'red' ? 'blue' : 'red');
function renderTeamBtns(){ $('#teamRed').classList.toggle('on', S.player.team === 'red'); $('#teamBlue').classList.toggle('on', S.player.team === 'blue'); }
function renderRoomBar(){
  $('#roomBar').hidden = !net;
  if (!net) return;
  $('#barCode').textContent = net.code;
  const tb = $('#teamBtn'), tm = TEAMS[S.player.team];
  tb.textContent = `${tm.name} ⇄`; tb.style.color = tm.color;
  const host = net.isHost(), m = inMatch();
  $('#matchBox').hidden = !host || m;
  tb.disabled = m; $('#teamRed').disabled = m; $('#teamBlue').disabled = m;
  for (const id of ['#dStill', '#dMove', '#dAttack']) $(id).disabled = m;
  $('#againBtn').hidden = $('#practiceBtn').hidden = !host; $('#resWait').hidden = host;
  renderRoomList();
}
// 방 사람들: 이름 · 캐릭터 · 팀 색 (👑 방장)
function renderRoomList(){
  if (!net) return;
  const people = [{id: net.pid, name: net.name, team: S.player.team, cls}].concat(others());
  const html = people.map(o => {
    const crown = o.id === net.hostId() ? '👑' : '', me = o.id === net.pid ? ' (나)' : '';
    return `<span class="chip" style="--tc:${(TEAMS[o.team] || {}).color || '#fff'}">${crown}${o.cls ? o.cls.icon : ''} ${esc(o.name)}${me}</span>`;
  }).join('');
  for (const id of ['#barList', '#roomList']){ const el = $(id); if (el && el.dataset.html !== html){ el.innerHTML = html; el.dataset.html = html; } }
}
const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

/* ---------- 허수아비 모드 (온라인이면 방 전체가 같이 바뀜) ---------- */
function showDummyMode(m){
  S.dummyMode = m;
  $('#dStill').classList.toggle('on', m === 'still'); $('#dMove').classList.toggle('on', m === 'move'); $('#dAttack').classList.toggle('on', m === 'attack');
}
function setDummyMode(m){ showDummyMode(m); if (net) net.setMode(m); focusSpell(); }
$('#dStill').onclick = () => setDummyMode('still');
$('#dMove').onclick = () => setDummyMode('move');
$('#dAttack').onclick = () => setDummyMode('attack');

/* ---------- ♾ 무제한 켜고 끄기 ---------- */
function applyUnlimited(){
  const b = $('#infBtn'); b.classList.toggle('on', unl()); b.disabled = inMatch();
  b.textContent = inMatch() ? '⚔ 대결 중' : unlimited ? '♾ 무제한' : '⏳ 실전처럼';
  b.title = unlimited ? '대기 시간·궁극기 게이지 없이 마음껏 쓰는 중 (누르면 실제 대결처럼)' : '실제 대결처럼 대기 시간·게이지가 있어요 (누르면 무제한)';
}
$('#infBtn').onclick = () => {
  unlimited = !unlimited; try { localStorage.setItem('magic.unlimited', unlimited ? 'on' : 'off'); } catch (e) {}
  applyUnlimited(); castMsg(unlimited ? '♾ 무제한: 대기 시간 없이 마음껏!' : '⏳ 실전처럼: 대기 시간·게이지가 있어요', 'good'); focusSpell();
};
applyUnlimited();

/* ---------- ⚔ 대결 ---------- */
function onMatch(m){
  const had = !!match;
  match = m && m.startAt && m.endAt ? m : null;
  if (match && match.id !== matchId){ matchId = match.id; startMatchLocal(); }
  if (!match && had){ matchId = null; $('#result').hidden = true; castMsg('🎯 연습으로 돌아왔어요', 'good'); addFeed('🎯 연습으로 돌아왔어요', '#bff7c8'); resetMe(); }
  lastPhase = undefined;   // 다음 화면 갱신 때 버튼들 다시 정리
}
// 새 판: 모두 출발 자리에서 체력 가득, 대기 시간·게이지·기록 처음부터
function startMatchLocal(){
  S.stats = {dmg: 0, kills: 0, deaths: 0, ok: 0, fail: 0, healed: 0, taken: 0};
  S.cds = {}; S.ult = 0; S.busy = null; S.lockUntil = 0; clearCharge(); inp.value = '';
  S.shots = []; S.zones = []; S.walls = []; S.sanctums = []; S.fields = []; S.tint = null;
  resetMe(); $('#result').hidden = true; focusSpell();
  addFeed(`⚔ ${Math.round(match.len / 60)}분 대결! 상대 팀을 많이 쓰러뜨리면 이겨요`, '#ffd84a');
}
function onPhase(ph){
  renderRoomBar(); applyUnlimited(); document.body.classList.toggle('matching', !!ph);
  if (ph === 'play'){ castMsg('⚔ 시작!', 'good'); S.cds = {}; S.ult = 0; }
  if (ph === 'end') showResult();
  if (ph !== 'end') $('#result').hidden = true;
}
function startMatch(){
  if (!net || !net.isHost()) return;
  const teams = [S.player.team].concat(others().map(o => o.team));
  if (!teams.includes('red') || !teams.includes('blue')){ castMsg('빨강·파랑 팀에 한 명 이상씩 있어야 대결할 수 있어요', 'bad'); return; }
  const len = +$('#matchLen').value || 180, start = net.serverNow() + 3500;
  net.setMatch({id: 'm' + Math.random().toString(36).slice(2, 8), startAt: start, endAt: start + len * 1000, len, score: {red: 0, blue: 0}});
}
$('#matchBtn').onclick = startMatch;
$('#againBtn').onclick = startMatch;
$('#practiceBtn').onclick = () => { if (net && net.isHost()) net.setMatch(null); };
const score = tm => ((match && match.score) || {})[tm] || 0;
function showResult(){
  const red = score('red'), blue = score('blue');
  const win = red > blue ? 'red' : blue > red ? 'blue' : null;
  $('#resTitle').textContent = win ? `${TEAMS[win].name} 승리!` : '무승부!';
  $('#resTitle').style.color = win ? TEAMS[win].color : '#ffd84a';
  $('#resScore').innerHTML = `<span style="color:${TEAMS.red.color}">빨강 ${red}</span> : <span style="color:${TEAMS.blue.color}">${blue} 파랑</span>`;
  const rows = [{id: net.pid, name: net.name, team: S.player.team, cls, k: S.stats.kills, de: S.stats.deaths, dm: Math.round(S.stats.dmg)}].concat(others());
  rows.sort((a, b) => (a.team === b.team ? 0 : a.team === 'red' ? -1 : 1) || b.k - a.k || b.dm - a.dm);
  const mvp = rows.slice().sort((a, b) => b.k - a.k || b.dm - a.dm)[0];
  $('#resRows').innerHTML = rows.map(o => `<tr style="--tc:${TEAMS[o.team] ? TEAMS[o.team].color : '#fff'}"><td><i></i>${o === mvp ? '👑 ' : ''}${esc(o.name)}${o.id === net.pid ? ' (나)' : ''}</td>`
    + `<td>${o.cls ? o.cls.icon + ' ' + o.cls.name : ''}</td><td>${o.k || 0}</td><td>${o.de || 0}</td><td>${o.dm || 0}</td></tr>`).join('');
  $('#resMvp').textContent = mvp ? `🏅 MVP: ${mvp.name} (쓰러뜨림 ${mvp.k || 0}, 준 피해 ${mvp.dm || 0})` : '';
  renderRoomBar();
  $('#result').hidden = false;
}
// 맵 위: 준비 숫자 3·2·1 / 남은 시간 + 점수
function drawMatchHud(){
  const ph = phase(); if (!ph) return;
  const n = net.serverNow();
  ctx.textAlign = 'center';
  if (ph === 'count'){
    const left = Math.ceil((match.startAt - n) / 1000);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, VW, VH);
    ctx.font = '400 150px "Black Han Sans","Malgun Gothic",sans-serif'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    const txt = left > 0 ? String(left) : '시작!';
    ctx.strokeText(txt, VW / 2, VH / 2 + 50); ctx.fillStyle = '#ffd84a'; ctx.fillText(txt, VW / 2, VH / 2 + 50);
    ctx.font = '800 26px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(`나는 ${TEAMS[S.player.team].name}! 상대 팀을 많이 쓰러뜨리면 이겨요`, VW / 2, VH / 2 + 110);
  }
  const left = Math.max(0, Math.ceil((match.endAt - Math.max(n, match.startAt)) / 1000));
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const w = 360, x = VW / 2 - w / 2, y = 14;
  ctx.fillStyle = 'rgba(6,20,12,.85)'; roundRect(x, y, w, 64, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,216,74,.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = '800 13px "Malgun Gothic",sans-serif';
  ctx.fillStyle = TEAMS.red.color; ctx.fillText('빨강 팀', x + 52, y + 20);
  ctx.fillStyle = TEAMS.blue.color; ctx.fillText('파랑 팀', x + w - 52, y + 20);
  ctx.font = '400 32px "Black Han Sans","Malgun Gothic",sans-serif';
  ctx.fillStyle = TEAMS.red.color; ctx.fillText(String(score('red')), x + 52, y + 54);
  ctx.fillStyle = TEAMS.blue.color; ctx.fillText(String(score('blue')), x + w - 52, y + 54);
  ctx.fillStyle = ph === 'end' ? '#ffd84a' : left <= 10 ? '#ff7b7b' : '#ffffff';
  ctx.font = '400 34px "Black Han Sans","Malgun Gothic",sans-serif';
  ctx.fillText(ph === 'end' ? '끝!' : time, VW / 2, y + 46);
}

/* ---------- 시작 ---------- */
function loop(){ update(); draw(); updateHud(); requestAnimationFrame(loop); }
buildBook(); fit(); openPick();
if (window.MagicArt) MagicArt.ready.then(() => { if (!$('#pick').hidden) buildPick(); });   // 그림이 다 오면 고르기 카드에도
try { const c = sessionStorage.getItem('magic.code'); if (c){ $('#codeInput').value = c; pickMode = 'friend'; refreshPick(); } } catch (e) {}
requestAnimationFrame(loop);

window.__magic = {S, mouse, submitSpell, rightClick, choose, CLASSES, OBSTACLES, step(){ update(); draw(); updateHud(); }, get cls(){ return cls; }, get cam(){ return cam; },
  get unlimited(){ return unlimited; }, setUnlimited(v){ unlimited = !!v; applyUnlimited(); }, get net(){ return net; }, setTeam, leaveNet, startMatch, get match(){ return match; }, phase};
})();

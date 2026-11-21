/* 숲속의 한바탕: 캐릭터 그림 불러오기 (art/ 폴더)
   - 그림은 흰 배경이라, 불러올 때 바깥쪽 흰색을 투명하게 지움 (가장자리부터 번져 나가며, 외곽선 안은 그대로)
   - 서 있는 그림: art/<이름>.webp 한 장
   - 걷는 그림:   art/<이름>-walk.webp (가로로 4칸: 왼발 앞 → 모음 → 오른발 앞 → 모음)
                  빈 세로줄을 찾아 칸을 자동으로 나누고, 4칸 모두 발 높이·머리 위치를 맞춤
   - 그림이 아직 안 왔거나 못 불러오면 null → 게임은 코드로 그린 모습으로 대신 그림
   - 바닥 무늬: art/grass.webp(풀밭), art/dirt.webp(흙길) — 이어 붙이는 타일
   - 그림은 모두 "오른쪽을 보는" 모습. 왼쪽을 볼 땐 게임에서 좌우로 뒤집어 그림 */
(function(){
'use strict';
const FILES = {
  tank: {stand: 'art/gadeon.webp', walk: 'art/gadeon-walk.webp'},
  dealer: {stand: 'art/rave.webp', walk: 'art/rave-walk.webp'},
  // 걷기 1번 칸 다리에 묻은 붉은 얼룩을 피부색으로 덮음 (지피티 그림 실수)
  healer: {stand: 'art/sera.webp', walk: 'art/sera-walk.webp', fix: [{x0: 130, y0: 615, x1: 205, y1: 692, color: [250, 236, 220]}]}
};
const MAX = 360;                 // 줄여 둘 최대 크기(픽셀)
// 바닥 무늬 (이어 붙이는 타일): 맵에서 한 장이 차지할 크기(픽셀)
const TILES = {grass: {src: 'art/grass.webp', size: 420}, dirt: {src: 'art/dirt.webp', size: 260},
               // 🏯 동양풍 맵 (지피티 그림이 오면 이 이름으로 art/에 넣기만 하면 됨)
               'east-ground': {src: 'art/east-ground.jpg', size: 420}, 'east-path': {src: 'art/east-path.webp', size: 260}};
// 여러 개가 든 그림 (줄마다 왼쪽→오른쪽 순서로 자동으로 잘라 씀)
const SHEETS = {props: {src: 'art/trees-rocks.webp'},   // 나무 3 (위) · 바위 3 (아래)
                pond: {src: 'art/pond.webp', max: 900},  // 연못 1 (크게 그려서 선명하게)
                decor: {src: 'art/decor.webp', max: 160},  // 풀2·낮은 덤불 / 꽃 분홍·노랑·하늘 / 버섯 빨강·갈색·둥근 덤불
                dummy: {src: 'art/dummy.webp', max: 300},  // 허수아비 1
                // 스킬 아이콘: 캐릭터마다 6개 (스킬 1~5 + 궁극기), 위 3개 · 아래 3개
                'icons-tank': {src: 'art/icons-tank.webp', max: 128},
                'icons-dealer': {src: 'art/icons-dealer.webp', max: 128},
                'icons-healer': {src: 'art/icons-healer.webp', max: 128},
                things: {src: 'art/things.webp', max: 200},     // 덩굴 화살 · 사슬 갈고리 · 바위 기둥
                // 🏯 동양풍 맵: 나무 3(분홍 꽃·단풍·소나무) + 바위 기둥 3(납작·큰·중간) / 연못+다리 / 장식 3x3 / 깃발 + 돌 제단
                'east-props': {src: 'art/east-props.webp', tight: true}, 'east-pond': {src: 'art/east-pond.webp', max: 900},
                'east-decor': {src: 'art/east-decor.webp', max: 160, tight: true}, 'east-flag': {src: 'art/east-flag.webp', max: 320, blobs: true},   // 맨 왼쪽 덩어리 = 깃발
                'east-altar': {src: 'art/east-altar.webp', max: 320, blobs: true}};   // 맨 오른쪽 덩어리 = 돌 제단
// 빛 효과 (검은 배경, 가로·세로 칸이 고르게): 0 칼자국 1 폭발 2 치유 / 3 기절 별 4 빛의 창 5 빨간 구슬 / 6 순간 이동 7 섬광 8 마법진
const GLOWS = {fx: {src: 'art/fx.webp', cols: 3, rows: 3, max: 300},
               areas: {src: 'art/areas.webp', cols: 2, rows: 1, max: 760},   // 바닥 범위: 0 레이브 궁극기(보라 시계) · 1 생명의 샘(초록)
               // 0 가데온 평타(주황 칼자국) 1 가데온 궁극기 오라 2 궁극기 발밑 고리 / 3 레이브·4 가데온·5 세라 달려가는 꼬리
               fx2: {src: 'art/fx2.webp', cols: 3, rows: 2, max: 320},
               areaRave: {src: 'art/area-rave.webp', cols: 1, rows: 1, max: 1000}};   // 레이브 궁극기 범위 (얇은 선 버전)
const stand = {}, walk = {}, tiles = {}, sheets = {}, glows = {};

// 그림 주소에 판 번호(MAGIC_V)를 붙여서, 그림을 바꿔 올리면 브라우저가 새로 받게 함
const load = src => new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = src + (window.MAGIC_V ? '?v=' + window.MAGIC_V : ''); });

// 흰 배경을 지운 원본 크기 캔버스 + 픽셀 정보
function removeBg(img, fixes){
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently: true});
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data, n = w * h;
  for (const f of fixes || []){                            // 그림 실수 고치기: 붉은 얼룩만 덮기
    for (let y = f.y0; y < f.y1; y++) for (let x = f.x0; x < f.x1; x++){
      const i = (y * w + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 170 && r - gg > 90 && gg < 140 && r - b > 60){ d[i] = f.color[0]; d[i + 1] = f.color[1]; d[i + 2] = f.color[2]; }
    }
  }
  const whiteish = i => { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mn = Math.min(r, gg, b); return mn > 222 && Math.max(r, gg, b) - mn < 26; };
  const clear = new Uint8Array(n), stack = [];
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length){                                    // 가장자리에서 이어진 흰색만 지움
    const i = stack.pop();
    if (clear[i] || !whiteish(i)) continue;
    clear[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w); if (i < n - w) stack.push(i + w);
  }
  for (let i = 0; i < n; i++){                             // 지운 곳 옆은 밝을수록 반투명 (하얀 테두리 안 남게)
    if (clear[i]){ d[i * 4 + 3] = 0; continue; }
    const x = i % w;
    if (!((x > 0 && clear[i - 1]) || (x < w - 1 && clear[i + 1]) || (i >= w && clear[i - w]) || (i < n - w && clear[i + w]))) continue;
    const lum = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3, a = Math.max(0, Math.min(1, (255 - lum) / 110));
    if (a > 0 && a < 1) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, (d[i * 4 + k] - 255 * (1 - a)) / a));
    d[i * 4 + 3] = Math.round(a * 255);
  }
  g.putImageData(im, 0, 0);
  return {c, d, w, h};
}
const solid = (s, x, y) => s.d[(y * s.w + x) * 4 + 3] > 20;
function bbox(s, x0, x1, ya, yb){                       // ya~yb: 이 줄 안에서만 찾기 (없으면 그림 전체 높이)
  let y0 = s.h, y1 = -1, a = s.w, b = -1;
  for (let y = ya || 0; y <= (yb === undefined ? s.h - 1 : yb); y++) for (let x = x0; x <= x1; x++) if (solid(s, x, y)){ if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < a) a = x; if (x > b) b = x; }
  return y1 < 0 ? null : {x0: a, x1: b, y0, y1};
}
// 머리 위치(위쪽 35%의 가운데) → 칸마다 다리가 달라도 몸이 흔들리지 않게 여기를 기준으로 맞춤
function headX(s, box, y0, y1){
  let sum = 0, cnt = 0;
  const yEnd = y0 + (y1 - y0) * 0.35;
  for (let y = y0; y < yEnd; y++) for (let x = box.x0; x <= box.x1; x++) if (solid(s, x, y)){ sum += x; cnt++; }
  return cnt ? sum / cnt : (box.x0 + box.x1) / 2;
}
// 잘라서 줄이기: {img, ax(머리 기준 가로 위치)}
function cut(s, box, y0, y1, k){
  const cw = box.x1 - box.x0 + 1, ch = y1 - y0 + 1;
  const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const og = out.getContext('2d'); og.imageSmoothingQuality = 'high';
  og.drawImage(s.c, box.x0, y0, cw, ch, 0, 0, out.width, out.height);
  return {img: out, ax: (headX(s, box, y0, y1) - box.x0) * k};
}
function makeStand(img, fixes){
  const s = removeBg(img, fixes), box = bbox(s, 0, s.w - 1);
  if (!box) return null;
  return cut(s, box, box.y0, box.y1, Math.min(1, MAX / Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1)));
}
// 가로로 늘어선 칸 나누기: 그림이 하나도 없는 세로줄이 이어진 곳이 칸 사이
function makeWalk(img, fixes){
  const s = removeBg(img, fixes), cols = [];
  for (let x = 0; x < s.w; x++){ let any = false; for (let y = 0; y < s.h; y += 2) if (solid(s, x, y)){ any = true; break; } cols.push(any); }
  const segs = [];
  for (let x = 0; x < s.w; x++){
    if (!cols[x]) continue;
    let e = x; while (e + 1 < s.w && (cols[e + 1] || (e + 8 < s.w && cols.slice(e + 1, e + 8).some(Boolean)))) e++;
    if (e - x > 60) segs.push([x, e]);
    x = e;
  }
  if (segs.length < 2) return null;
  const boxes = segs.map(([a, b]) => bbox(s, a, b)).filter(Boolean);
  const y0 = Math.min(...boxes.map(b => b.y0)), y1 = Math.max(...boxes.map(b => b.y1));   // 4칸 모두 같은 높이 → 발 높이가 같음
  const k = Math.min(1, MAX / (y1 - y0 + 1));
  return boxes.map(b => cut(s, b, y0, y1, k));
}

// 여러 개 든 그림 자르기: 그림이 없는 가로줄로 줄을 나누고, 줄마다 그림이 없는 세로줄로 칸을 나눔
function segments(has, len, gap, min){
  const out = [];
  for (let i = 0; i < len; i++){
    if (!has(i)) continue;
    let e = i, miss = 0;
    for (let j = i + 1; j < len; j++){ if (has(j)){ e = j; miss = 0; } else if (++miss > gap) break; }
    if (e - i > min) out.push([i, e]);
    i = e;
  }
  return out;
}
// tight: 칸마다 자기 줄 안에서만 테두리를 찾음 (위·아래 줄 물건이 같은 칸 폭에 있어도 빈 곳이 안 생김)
function makeSheet(img, max, tight){
  const s = removeBg(img), parts = [];
  const rowHas = y => { for (let x = 0; x < s.w; x += 2) if (solid(s, x, y)) return true; return false; };
  for (const [ya, yb] of segments(rowHas, s.h, 10, 30)){
    const colHas = x => { for (let y = ya; y <= yb; y += 2) if (solid(s, x, y)) return true; return false; };
    for (const [xa, xb] of segments(colHas, s.w, 10, 30)){
      const box = tight ? bbox(s, xa, xb, ya, yb) : bbox(s, xa, xb);
      if (!box) continue;
      const b = {x0: box.x0, x1: box.x1, y0: Math.max(box.y0, ya), y1: Math.min(box.y1, yb)};
      const k = Math.min(1, (max || MAX) / Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1));
      const c = cut(s, b, b.y0, b.y1, k);
      c.ax = c.img.width / 2;   // 물건은 가운데 기준
      parts.push(c);
    }
  }
  return parts;
}
// 붙어 있는 덩어리끼리 나누기 (blobs: true): 물건끼리 가로·세로로 겹쳐서 빈 줄로는 못 나눌 때 (깃발 끝과 제단처럼)
// 큰 덩어리만 왼쪽부터 순서대로, 다른 덩어리 픽셀은 지우고 잘라 냄
function makeBlobs(img, max){
  const s = removeBg(img), {w, h} = s, n = w * h, lab = new Int32Array(n), comps = [];
  for (let i = 0; i < n; i++){
    if (lab[i] || s.d[i * 4 + 3] <= 20) continue;
    const id = comps.length + 1, st = [i], b = {id, x0: w, x1: -1, y0: h, y1: -1, n: 0};
    lab[i] = id;
    while (st.length){
      const j = st.pop(), x = j % w, y = (j - x) / w;
      b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1])
        if (k >= 0 && !lab[k] && s.d[k * 4 + 3] > 20){ lab[k] = id; st.push(k); }
    }
    comps.push(b);
  }
  const big = Math.max(0, ...comps.map(b => b.n));
  return comps.filter(b => b.n > big * 0.05).sort((a, b) => a.x0 - b.x0).map(b => {
    const cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1, one = document.createElement('canvas'); one.width = cw; one.height = ch;
    const g = one.getContext('2d'), im = g.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++){
      const j = (y + b.y0) * w + x + b.x0; if (lab[j] !== b.id) continue;
      const o = (y * cw + x) * 4; for (let k = 0; k < 4; k++) im.data[o + k] = s.d[j * 4 + k];
    }
    g.putImageData(im, 0, 0);
    const k = Math.min(1, (max || MAX) / Math.max(cw, ch)), out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
    const og = out.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(one, 0, 0, out.width, out.height);
    return {img: out, ax: out.width / 2};
  });
}
const sheetReady = Promise.all(Object.entries(SHEETS).map(async ([id, f]) => { const img = await load(f.src); if (img) sheets[id] = f.blobs ? makeBlobs(img, f.max) : makeSheet(img, f.max, f.tight); }));

// 빛 효과 자르기: 칸을 고르게 나누고, 검은색은 투명하게 (밝을수록 진하게 보임 → 어느 바닥에서도 빛처럼)
function makeGlow(img, cols, rows, max){
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4){
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    if (m < 14){ d[i + 3] = 0; continue; }
    const a = m / 255;
    d[i] = Math.min(255, d[i] / a); d[i + 1] = Math.min(255, d[i + 1] / a); d[i + 2] = Math.min(255, d[i + 2] / a); d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(im, 0, 0);
  const s = {c, d, w, h}, parts = [], cw = w / cols, chh = h / rows;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++){
    const x0 = Math.round(q * cw), x1 = Math.round((q + 1) * cw) - 1, y0 = Math.round(r * chh), y1 = Math.round((r + 1) * chh) - 1;
    let a = x1, b = x0, top = y1, bot = y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 40){ if (x < a) a = x; if (x > b) b = x; if (y < top) top = y; if (y > bot) bot = y; }
    if (b <= a){ parts.push(null); continue; }
    const box = {x0: a, x1: b, y0: top, y1: bot}, k = Math.min(1, max / Math.max(b - a + 1, bot - top + 1));
    const part = cut(s, box, top, bot, k); part.ax = part.img.width / 2; parts.push(part);
  }
  return parts;
}
const glowReady = Promise.all(Object.entries(GLOWS).map(async ([id, f]) => { const img = await load(f.src); if (img) glows[id] = makeGlow(img, f.cols, f.rows, f.max); }));

// 타일: 정해진 크기로 줄여 둠 (반복 무늬로 깔 때 그대로 씀)
function makeTile(img, size){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, size, size);
  return c;
}
const tileReady = Promise.all(Object.entries(TILES).map(async ([id, t]) => { const img = await load(t.src); if (img) tiles[id] = makeTile(img, t.size); }));

const ready = Promise.all(Object.entries(FILES).map(async ([id, f]) => {
  try {
    const a = await load(f.stand); if (a) stand[id] = makeStand(a);
    if (f.walk){ const b = await load(f.walk); if (b) walk[id] = makeWalk(b, f.fix); }
  } catch (e) { console.error(e); }
}));

window.MagicArt = {
  get: id => stand[id] || null,               // {img, ax}
  walk: id => walk[id] || null,               // [{img, ax} × 4] 또는 null
  tile: id => tiles[id] || null,              // 바닥 무늬 캔버스
  sheet: id => sheets[id] || null,            // [{img, ax}, …] 여러 개 든 그림
  // 스킬 아이콘 그림 주소 (없으면 null): 캐릭터 id, 몇 번째(0~4 스킬, 5 궁극기)
  icon: (cid, i) => { const s = sheets['icons-' + cid]; if (!s || !s[i]) return null; return s[i].url || (s[i].url = s[i].img.toDataURL()); },
  glow: id => glows[id] || null,              // 빛 효과 [{img}, …] (검은색은 투명)
  ready: Promise.all([ready, tileReady, sheetReady, glowReady]),
  url: id => stand[id] ? stand[id].img.toDataURL() : null
};
})();

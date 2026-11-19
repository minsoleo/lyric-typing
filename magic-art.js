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
const TILES = {grass: {src: 'art/grass.webp', size: 420}, dirt: {src: 'art/dirt.webp', size: 260}};
// 여러 개가 든 그림 (줄마다 왼쪽→오른쪽 순서로 자동으로 잘라 씀)
const SHEETS = {props: {src: 'art/trees-rocks.webp'},   // 나무 3 (위) · 바위 3 (아래)
                pond: {src: 'art/pond.webp', max: 900}}; // 연못 1 (크게 그려서 선명하게)
const stand = {}, walk = {}, tiles = {}, sheets = {};

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
function bbox(s, x0, x1){
  let y0 = s.h, y1 = -1, a = s.w, b = -1;
  for (let y = 0; y < s.h; y++) for (let x = x0; x <= x1; x++) if (solid(s, x, y)){ if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < a) a = x; if (x > b) b = x; }
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
function makeSheet(img, max){
  const s = removeBg(img), parts = [];
  const rowHas = y => { for (let x = 0; x < s.w; x += 2) if (solid(s, x, y)) return true; return false; };
  for (const [ya, yb] of segments(rowHas, s.h, 10, 30)){
    const colHas = x => { for (let y = ya; y <= yb; y += 2) if (solid(s, x, y)) return true; return false; };
    for (const [xa, xb] of segments(colHas, s.w, 10, 30)){
      const box = bbox(s, xa, xb);
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
const sheetReady = Promise.all(Object.entries(SHEETS).map(async ([id, f]) => { const img = await load(f.src); if (img) sheets[id] = makeSheet(img, f.max); }));

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
  ready: Promise.all([ready, tileReady, sheetReady]),
  url: id => stand[id] ? stand[id].img.toDataURL() : null
};
})();

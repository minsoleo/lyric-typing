/* 숲속의 한바탕: 캐릭터 그림 불러오기 (art/ 폴더)
   - 그림은 흰 배경이라, 불러올 때 바깥쪽 흰색을 투명하게 지우고(가장자리부터 번져 나가며, 외곽선 안은 그대로)
     캐릭터만 잘라서 작게 줄여 둠
   - 그림이 아직 안 왔거나 못 불러오면 null → 게임은 코드로 그린 모습으로 대신 그림
   - 그림은 모두 "오른쪽을 보는" 모습. 왼쪽을 볼 땐 게임에서 좌우로 뒤집어 그림 */
(function(){
'use strict';
const FILES = {tank: 'art/gadeon.webp', dealer: 'art/rave.webp', healer: 'art/sera.webp'};
const MAX = 360;                // 줄여 둘 최대 크기(픽셀)
const sprites = {};

// 배경 지우기: 바깥과 이어진 흰색만
function cutOut(img){
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently: true});
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data, n = w * h;
  const whiteish = i => { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mn = Math.min(r, gg, b); return mn > 222 && Math.max(r, gg, b) - mn < 26; };

  const clear = new Uint8Array(n);
  // 1) 가장자리에서 시작해 이어진 흰색 지우기
  const stack = [];
  for (let x = 0; x < w; x++){ stack.push(x, x + (h - 1) * w); }
  for (let y = 0; y < h; y++){ stack.push(y * w, y * w + w - 1); }
  while (stack.length){
    const i = stack.pop();
    if (clear[i] || !whiteish(i)) continue;
    clear[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w); if (i < n - w) stack.push(i + w);
  }
  // (외곽선 안쪽의 흰색은 칼날·갑옷·얼굴이라 그대로 둠)
  // 2) 지운 곳 바로 옆 픽셀은 밝을수록 반투명하게 (테두리가 하얗게 남지 않게)
  for (let i = 0; i < n; i++){
    if (clear[i]){ d[i * 4 + 3] = 0; continue; }
    const x = i % w;
    const edge = (x > 0 && clear[i - 1]) || (x < w - 1 && clear[i + 1]) || (i >= w && clear[i - w]) || (i < n - w && clear[i + w]);
    if (!edge) continue;
    const lum = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    const a = Math.max(0, Math.min(1, (255 - lum) / 110));
    if (a < 1 && a > 0){ for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, (d[i * 4 + k] - 255 * (1 - a)) / a)); }
    d[i * 4 + 3] = Math.round(a * 255);
  }
  g.putImageData(im, 0, 0);
  // 3) 캐릭터만 남게 잘라서 줄이기
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, MAX / Math.max(cw, ch));
  const out = document.createElement('canvas'); out.width = Math.round(cw * k); out.height = Math.round(ch * k);
  const og = out.getContext('2d'); og.imageSmoothingQuality = 'high';
  og.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}

const ready = Promise.all(Object.entries(FILES).map(([id, src]) => new Promise(res => {
  const img = new Image();
  img.onload = () => { try { sprites[id] = cutOut(img); } catch (e) { console.error(e); } res(); };
  img.onerror = () => res();
  img.src = src;
})));

window.MagicArt = {get: id => sprites[id] || null, ready, url: id => sprites[id] ? sprites[id].toDataURL() : null};
})();

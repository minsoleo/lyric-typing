/* 주문 대결: 화면과 상관없는 계산만 (테스트: tests/magic-logic.test.html) */
(function(){
  'use strict';

  const norm = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();

  // 친 글과 이름이 똑같은 주문 (띄어쓰기 개수·앞뒤 공백은 무시)
  function findSpell(spells, typed){
    const s = norm(typed);
    if (!s) return null;
    return spells.find(sp => norm(sp.name) === s) || null;
  }

  // 남은 재사용 대기시간(초)
  const cooldownLeft = (lastAt, cd, now) => lastAt === undefined ? 0 : Math.max(0, lastAt + cd - now);

  // 목표 쪽으로 step만큼 이동 (넘치면 목표에서 멈춤)
  function moveToward(p, t, step){
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
    if (d <= step || d === 0) return {x: t.x, y: t.y, arrived: true};
    return {x: p.x + dx / d * step, y: p.y + dy / d * step, arrived: false};
  }

  // from에서 to 쪽으로 최대 max까지만
  function clampReach(from, to, max){
    const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
    if (d <= max) return {x: to.x, y: to.y};
    return {x: from.x + dx / d * max, y: from.y + dy / d * max};
  }

  // 원(p, r)이 사각형들과 겹치면 가장 가까운 바깥으로 밀어냄 → 벽을 따라 미끄러지는 효과
  function pushOut(p, r, rects){
    let x = p.x, y = p.y;
    for (let pass = 0; pass < 3; pass++){
      let moved = false;
      for (const b of rects){
        const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h));
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        moved = true;
        if (d > 0){ x = cx + dx / d * r; y = cy + dy / d * r; }
        else {   // 중심이 사각형 안: 가장 가까운 변 쪽으로
          const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bottom = b.y + b.h - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
          else if (m === top) y = b.y - r; else y = b.y + b.h + r;
        }
      }
      if (!moved) break;
    }
    return {x, y};
  }

  const pointInRects = (x, y, pad, rects) =>
    rects.some(b => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);

  // 피해 주기: 방패(시간 안 지났을 때)가 먼저 깎이고 남은 만큼 체력
  function applyDamage(e, dmg, now){
    let shield = e.shieldUntil > now ? (e.shield || 0) : 0;
    const absorbed = Math.min(shield, dmg);
    shield -= absorbed;
    return {hp: Math.max(0, e.hp - (dmg - absorbed)), shield, absorbed};
  }

  const clampToWorld = (p, r, W, H) => ({x: Math.max(r, Math.min(W - r, p.x)), y: Math.max(r, Math.min(H - r, p.y))});

  window.MagicLogic = {norm, findSpell, cooldownLeft, moveToward, clampReach, pushOut, pointInRects, applyDamage, clampToWorld};
})();

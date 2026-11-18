/* 숲속의 한바탕: 화면과 상관없는 계산만 (테스트: tests/magic-logic.test.html) */
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

  // 카메라: 캐릭터가 화면 가운데 오도록, 단 맵 밖은 안 보이게
  const camFollow = (p, vw, vh, ww, wh) => ({x: Math.max(0, Math.min(ww - vw, p.x - vw / 2)), y: Math.max(0, Math.min(wh - vh, p.y - vh / 2))});

  /* ---------- 효과(버프·디버프): [{kind, value, until, tag}] ---------- */
  // 같은 kind+tag는 새로 덮어씀 (같은 스킬을 또 쓰면 시간만 새로)
  function addEffect(list, kind, value, until, tag){
    const e = {kind, value, until, tag};
    const i = list.findIndex(x => x.kind === kind && x.tag === tag);
    if (i >= 0) list[i] = e; else list.push(e);
    return list;
  }
  const effectSum = (list, kind, now) => (list || []).reduce((s, e) => e.kind === kind && e.until > now ? s + e.value : s, 0);
  // 받는 피해 배율: 피해 감소(def)는 곱해서 겹침 (40% + 30% → 0.6 × 0.7)
  const takenMult = (list, now) => (list || []).reduce((m, e) => e.kind === 'def' && e.until > now ? m * (1 - e.value) : m, 1);
  const pruneEffects = (list, now) => list.filter(e => e.until > now);
  const removeTag = (list, tag) => list.filter(e => e.tag !== tag);

  // 실제 피해 = 기본 피해 × (1 + 공격력 증가, 나약함은 마이너스) × 받는 피해 배율, 최소 1
  const calcDamage = (base, atkFx, defFx, now) =>
    Math.max(1, Math.round(base * Math.max(0.1, 1 + effectSum(atkFx, 'atk', now)) * takenMult(defFx, now)));

  // 근접 공격: target이 from에서 dir 쪽 부채꼴(각도 arcDeg, 거리 reach) 안에 있는지
  function inArc(from, dir, target, reach, arcDeg){
    const dx = target.x - from.x, dy = target.y - from.y, d = Math.hypot(dx, dy);
    if (d > reach) return false;
    if (d < 1) return true;
    return (dx * dir.x + dy * dir.y) / d >= Math.cos(arcDeg / 2 * Math.PI / 180) - 1e-9;
  }

  // 마우스(point)에서 radius 안, 나(from)에서 reach 안에 있는 적 중 마우스에 가장 가까운 것
  function pickTarget(list, point, radius, from, reach){
    let best = null, bd = Infinity;
    for (const e of list){
      const r = e.r || 0, dm = Math.hypot(e.x - point.x, e.y - point.y);
      if (dm > radius + r || Math.hypot(e.x - from.x, e.y - from.y) > reach + r) continue;
      if (dm < bd){ bd = dm; best = e; }
    }
    return best;
  }

  // 바위벽: center에서 dir과 수직으로 length만큼 늘어선 점들 (gap 간격)
  function wallPoints(center, dir, length, gap){
    const px = -dir.y, py = dir.x, n = Math.max(1, Math.round(length / gap)), pts = [];
    for (let i = 0; i <= n; i++){ const o = -length / 2 + length * i / n; pts.push({x: center.x + px * o, y: center.y + py * o}); }
    return pts;
  }

  const gainUlt = (cur, amount, max) => Math.min(max, cur + Math.max(0, amount || 0));

  // 스킬을 쓰는 동안(초): 이 시간 동안은 다른 스킬을 치거나 장전할 수 없음
  // 그림자 은신(instant)은 0, 바로 끝나는 공격(shot·leap·stun)도 0, 돌진은 달리는 시간(dashTime)
  function busyTime(sp, dashTime){
    if (!sp || sp.instant) return 0;
    if (sp.busy !== undefined) return sp.busy;
    if (sp.type === 'shot' || sp.type === 'leap' || sp.type === 'stun') return 0;
    if (sp.type === 'dash') return dashTime || 0;
    if (sp.type === 'slash') return (sp.swing || 0) + 0.2;
    return sp.time || 0;
  }

  window.MagicLogic = {norm, findSpell, cooldownLeft, moveToward, clampReach, pushOut, pointInRects, applyDamage, clampToWorld, camFollow,
    addEffect, effectSum, takenMult, pruneEffects, removeTag, calcDamage, inArc, pickTarget, wallPoints, gainUlt, busyTime};
})();

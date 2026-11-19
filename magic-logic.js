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

  /* ---------- 🚩 깃발쟁 ---------- */
  // 1초에 오르는 점수: 대결 시간의 처음 3/6은 1점, 다음 2/6은 2점, 마지막 1/6은 3점 (시간 비율 3 : 2 : 1)
  function flagRate(elapsed, len){
    if (elapsed < len * 3 / 6) return 1;
    if (elapsed < len * 5 / 6) return 2;
    return 3;
  }
  // 바닥에 떨어진 깃발을 누가 줍나: radius 안에 있는 살아 있는 사람 중 가장 가까운 사람 (없으면 null)
  function flagPickup(flag, people, radius){
    if (!flag || flag.by) return null;
    let best = null, bd = radius;
    for (const p of people){
      if (p.dead) continue;
      const d = Math.hypot(p.x - flag.x, p.y - flag.y);
      if (d <= bd){ bd = d; best = p.id; }
    }
    return best;
  }

  /* ---------- 🏳 점령전 ----------
     구역 하나 = {own: 주인 팀, c: 팀마다 1턴(점령하기) 게이지, h: 팀마다 2턴(완전 점령) 게이지, war: 전쟁 중, lock: 완전 점령}
     게이지는 0~100, rate = 1명이 1초에 채우는 % */
  const newZone = () => ({own: null, c: {red: 0, blue: 0}, h: {red: 0, blue: 0}, war: false, lock: false});
  const other = tm => tm === 'red' ? 'blue' : 'red';
  // dt초 동안의 변화를 계산한 새 구역 (넘긴 구역은 안 바꿈)
  function zoneStep(z, nRed, nBlue, dt, rate){
    const o = {own: z.own, c: {red: z.c.red, blue: z.c.blue}, h: {red: z.h.red, blue: z.h.blue}, war: false, lock: !!z.lock};
    if (o.lock) return o;                                      // 완전 점령: 더 안 바뀜
    if (nRed > 0 && nBlue > 0){ o.war = true; return o; }      // 두 팀이 같이 있으면 전쟁 중: 모두 멈춤
    const T = nRed > 0 ? 'red' : nBlue > 0 ? 'blue' : null, n = T === 'red' ? nRed : nBlue;
    o.in = T;                                                  // 지금 구역 안에 혼자 있는 팀 (고리에 무엇을 보여 줄지 정할 때 씀)
    if (T && o.own === T){
      o.h[T] = Math.min(100, o.h[T] + (1 + n) * rate * dt);    // 우리 구역 위: 저절로 차는 1명분 + 서 있는 사람 수
    } else if (T){
      o.c[T] = Math.min(100, o.c[T] + n * rate * dt);          // 남의 구역·주인 없는 구역: 서 있는 사람 수만큼 (주인 팀 2턴은 멈춤)
      if (o.c[T] >= 100){ o.own = T; o.c[other(T)] = 0; }      // 점령 완료 → 상대의 1턴은 0, 상대의 2턴 기록은 그대로
    } else if (o.own){
      o.h[o.own] = Math.min(100, o.h[o.own] + rate * dt);      // 아무도 없음: 주인 팀 2턴이 1명분으로 저절로
    }
    if (o.own && o.h[o.own] >= 100) o.lock = true;
    return o;
  }
  // 완전 점령한 구역이 2곳 이상인 팀 (없으면 null)
  function zoneWinner(zones){
    for (const tm of ['red', 'blue']) if (zones.filter(z => z.lock && z.own === tm).length >= 2) return tm;
    return null;
  }

  // 구역 고리에 보여 줄 게이지: 상대가 혼자 들어와서 뺏는 중이면 그 게이지, 주인이 있으면 완전 점령 게이지, 없으면 앞선 팀의 점령 게이지
  function zoneGauge(z){
    const o = z.own, oth = o === 'red' ? 'blue' : 'red';
    if (o && z.in === oth && z.c[oth] > 0) return {team: oth, pct: z.c[oth], label: '뺏는 중'};
    if (o) return {team: o, pct: z.h[o], label: '완전 점령까지'};
    const team = z.c.red >= z.c.blue ? 'red' : 'blue';
    return {team, pct: z.c[team], label: '점령 중'};
  }
  // 창이 숨어서(다른 창으로 넘어감) limit초 넘게 소식이 없는 친구는 빼기 (seen이 없는 건 나)
  const activePeople = (list, now, limit) => list.filter(q => q.seen === undefined || now - q.seen <= limit);
  // 한 팀이 grace초 동안 계속 비어 있어야 남은 팀 승리 (잠깐 인터넷이 끊긴 건 봐줌)
  function teamGone(since, hasRed, hasBlue, now, grace){
    if (hasRed === hasBlue) return {since: null, winner: null};
    const s = since === null || since === undefined ? now : since;
    return {since: s, winner: now - s >= grace ? (hasRed ? 'red' : 'blue') : null};
  }

  // 판 단계가 바뀔 때 할 일: 'start' = 게이지·대기 시간 처음부터 (3·2·1이 끝날 때만), 'end' = 결과 그리기, null = 아무것도 안 함
  // (대결 중 점수가 바뀌어도 play→play라서 새로 시작하지 않음 — 궁극기 게이지가 0이 되던 버그)
  const phaseKick = (prev, ph) => ph === 'end' ? 'end' : ph === 'play' && prev !== 'play' ? 'start' : null;
  // 같은 소식을 gap초 안에 또 알리지 않기 (구역 가장자리에서 '전쟁 중'이 여러 번 뜨던 것)
  const canAnnounce = (last, now, gap) => last === undefined || last === null || now - last >= gap;
  // 다음 판의 점수판이 판보다 먼저 왔는지 ('한 판 더' 때 0:0 무승부가 잠깐 비치던 것)
  const aheadObj = (o, curId) => !!(o && o.mid && curId && o.mid !== curId);
  // 방장 창이 오래 숨어 있을 때 넘겨줄 사람: 소식이 살아 있는 사람 중 가장 먼저 들어온 사람 (나는 빼고)
  function nextHost(list, me, now, limit){
    const ok = list.filter(q => q.id !== me && q.seen !== undefined && now - q.seen <= limit).sort((a, b) => (a.j || 0) - (b.j || 0));
    return ok.length ? ok[0].id : null;
  }

  // 그림자 은신이 풀리는 맞기: 피해를 받거나(방패로 막아도) 사슬에 끌려올 때 (느려짐·나약함만 걸리면 그대로)
  const breaksStealth = (o, out) => out > 0 || !!(o && o.pull);

  window.MagicLogic = {breaksStealth, phaseKick, canAnnounce, aheadObj, nextHost, zoneGauge, activePeople, teamGone, norm, findSpell, cooldownLeft, moveToward, clampReach, pushOut, pointInRects, applyDamage, clampToWorld, camFollow,
    addEffect, effectSum, takenMult, pruneEffects, removeTag, calcDamage, inArc, pickTarget, wallPoints, gainUlt, busyTime,
    flagRate, flagPickup, newZone, zoneStep, zoneWinner};
})();

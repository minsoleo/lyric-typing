/* 판 뒤집기: 화면·연결과 상관없는 계산만 모아 둔 파일 (테스트: tests/flip-logic.test.html) */
(function(){
  'use strict';

  // 글을 비교하기 좋게 정리: 한글 조합 방식 통일(NFC), 공백 여러 개 → 1개, 앞뒤 공백 제거
  const norm = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();

  // 목록에서 겹치지 않게 n개 뽑기 (섞은 뒤 앞에서 n개)
  function pickCards(pool, n, rand){
    const a = Array.from(new Set(pool.map(norm))).filter(Boolean);
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }

  // 친 글과 똑같은 카드 찾기
  //  flip: 뒤집을 수 있음 / own: 이미 우리 팀 카드 / none: 판에 없음
  function findTarget(cards, typed, team){
    const s = norm(typed);
    if (!s) return {index: -1, reason: 'none'};
    const i = cards.findIndex(c => norm(c.t) === s);
    if (i < 0) return {index: -1, reason: 'none'};
    return {index: i, reason: cards[i].o === team ? 'own' : 'flip'};
  }

  // 지금 치고 있는 글로 시작하는 카드 번호들 (판에서 찾기 쉽게 강조용)
  function prefixHits(cards, typed){
    const s = norm(typed);
    if (!s) return [];
    const hits = [];
    cards.forEach((c, i) => { if (norm(c.t).startsWith(s)) hits.push(i); });
    return hits;
  }

  function tally(cards){
    const r = {red: 0, blue: 0, none: 0};
    for (const c of cards) r[c.o === 'red' || c.o === 'blue' ? c.o : 'none']++;
    return r;
  }

  // 가장 많이 뒤집은 사람 (아무도 안 뒤집었으면 null)
  function mvp(players){
    let best = null;
    for (const [pid, p] of Object.entries(players || {})){
      const f = p.flips || 0;
      if (f > 0 && (!best || f > best.flips)) best = {pid, name: p.name, flips: f};
    }
    return best;
  }

  // 팀 섞기: 무작위로 섞은 뒤 번갈아 배정 → 인원 차이 최대 1
  function balanceTeams(pids, rand){
    const a = pids.slice();
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const first = rand() < 0.5 ? 'red' : 'blue', second = first === 'red' ? 'blue' : 'red';
    const out = {};
    a.forEach((pid, i) => { out[pid] = i % 2 === 0 ? first : second; });
    return out;
  }

  // 인원이 적은 팀 (같으면 빨강)
  function smallerTeam(players){
    let red = 0, blue = 0;
    for (const p of Object.values(players || {})) p.team === 'blue' ? blue++ : p.team === 'red' ? red++ : 0;
    return blue < red ? 'blue' : 'red';
  }

  // 방장이 나갔을 때 다음 방장: 가장 먼저 들어온 사람
  function nextHost(players){
    let best = null, at = Infinity;
    for (const [pid, p] of Object.entries(players || {})){
      const j = typeof p.joinedAt === 'number' ? p.joinedAt : Infinity;
      if (best === null || j < at){ best = pid; at = j; }
    }
    return best;
  }

  // 판 섞기: main에서 (n - extraCount)개 + extra에서 extraCount개를 뽑아 섞음
  // extra가 모자라면 있는 만큼만, 빈자리는 main으로 채움
  function mixBoard(main, extra, n, extraCount, rand){
    const ex = pickCards(extra || [], Math.min(extraCount, n), rand);
    const used = new Set(ex);
    const rest = pickCards((main || []).filter(t => !used.has(norm(t))), n - ex.length, rand);
    return pickCards(ex.concat(rest), n, rand);
  }

  const makeCode = rand => String(Math.floor(rand() * 10000)).padStart(4, '0');

  window.FlipLogic = {norm, pickCards, findTarget, prefixHits, tally, mvp, balanceTeams, smallerTeam, nextHost, makeCode, mixBoard};
})();

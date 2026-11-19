/* 숲속의 한바탕: 👫 친구랑 연습 — Firebase 방 연결만 맡는 파일
   rooms/<숫자 4자리> = {
     game: 'magic', createdAt, host(방장 pid), dmode(허수아비 모드),
     st:  {pid: 각자 내 캐릭터 상태 (0.1초마다 덮어씀)},
     dum: [허수아비 상태 — 방장만 씀],
     gmode: 대결 모드 'kill'(킬내기전) | 'flag'(깃발쟁) | 'zone'(점령전) — 방장이 고름, 맵도 이걸 따라감
     match: {id, mode, startAt, endAt(점령전은 없음), len, score: {red, blue}, over?, winner?} — ⚔ 대결 중일 때만 (시간은 서버 시계 기준)
     obj: 깃발쟁 {flag, score} / 점령전 {zones} — 방장이 계산해서 0.2초마다 씀
     ev:  {신호: 맞았어요 / 회복 / 강화 / 날아가는 공격·벽·샘 그리기 …  5초 뒤 보낸 사람이 지움}
   }
   판 뒤집기와 같은 Firebase를 쓰고, game: 'magic' 으로 구분함 */
(function(){
'use strict';
const DB_URL = 'https://lyric-typing-6ead1-default-rtdb.asia-southeast1.firebasedatabase.app';
const MAX = 8, EV_LIFE = 5000, HOST_CHECK_AFTER = 3000;
let app = null, offset = 0;

function db(){
  if (typeof firebase === 'undefined') throw new Error('온라인 연결 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. (학교 인터넷이 막고 있을 수도 있어요)');
  if (!app){
    app = firebase.initializeApp({databaseURL: DB_URL}, 'magic');
    app.database().ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });   // 내 시계와 서버 시계 차이
  }
  return app.database();
}
// 탭마다 다른 사람으로 (같은 컴퓨터에서 창 두 개로도 시험 가능)
function myPid(){
  let id = null;
  try { id = sessionStorage.getItem('magic.pid'); } catch (e) {}
  if (!id){ id = 'p' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('magic.pid', id); } catch (e) {} }
  return id;
}
const clean = o => JSON.parse(JSON.stringify(o));   // Firebase는 undefined를 못 받음
const inUse = r => !!r && ((r.st && Object.keys(r.st).length > 0) || (r.players && Object.keys(r.players).length > 0));
const netErr = e => (e && /permission|network|offline|disconnect/i.test(String(e.message || e))) ? new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.') : e;

async function create(name){
  const d = db(), pid = myPid();
  try {
    for (let i = 0; i < 15; i++){
      const code = String(Math.floor(Math.random() * 9000) + 1000);
      const res = await d.ref('rooms/' + code).transaction(cur => inUse(cur) ? undefined : {game: 'magic', createdAt: Date.now(), host: pid, dmode: 'still'});
      if (res.committed) return connect(code, name, true);
    }
  } catch (e) { throw netErr(e); }
  throw new Error('방을 만들지 못했어요. 다시 눌러 주세요.');
}

async function join(code, name){
  if (!/^[0-9]{4}$/.test(code)) throw new Error('방 코드는 숫자 4자리예요.');
  const d = db(), pid = myPid();
  let r;
  try { r = (await d.ref('rooms/' + code).once('value')).val(); } catch (e) { throw netErr(e); }
  if (!inUse(r)) throw new Error('그 코드의 방이 없어요. 숫자를 다시 확인해 주세요.');
  if (r.game !== 'magic') throw new Error('그건 판 뒤집기 방 코드예요. 숲속의 한바탕 방 코드를 넣어 주세요.');
  if (Object.keys(r.st || {}).filter(k => k !== pid).length >= MAX) throw new Error(`방이 꽉 찼어요. (최대 ${MAX}명)`);
  return connect(code, name, false);
}

function connect(code, name, created){
  const d = db(), pid = myPid(), ref = d.ref('rooms/' + code), stRef = ref.child('st/' + pid);
  const joinedAt = Date.now(), startAt = Date.now();
  const states = {};                    // 다른 사람들 상태 (방장 넘기기 계산용)
  let host = created ? pid : null, closed = false;
  const conn = {
    pid, code, name, created, on: {},
    isHost: () => host === pid,
    hostId: () => host,
    count: () => Object.keys(states).length + 1,
    send(ev){
      if (closed) return;
      ev.f = pid;
      const r = ref.child('ev').push(clean(ev));
      setTimeout(() => { r.remove().catch(() => {}); }, EV_LIFE);
    },
    publish(st){ if (closed) return; st.j = joinedAt; stRef.set(clean(st)).catch(() => {}); },
    publishDummies(arr){ if (!closed) ref.child('dum').set(arr).catch(() => {}); },
    setMode(m){ if (!closed) ref.child('dmode').set(m).catch(() => {}); },
    serverNow: () => Date.now() + offset,
    setMatch(m){ if (!closed) ref.child('match').set(m ? clean(m) : null).catch(() => {}); },
    endMatch(winner){ if (!closed) ref.child('match').update({over: Date.now() + offset, winner}).catch(() => {}); },   // 판 끝내기 (승리 팀 또는 'draw')
    setGmode(m){ if (!closed) ref.child('gmode').set(m).catch(() => {}); },
    publishObj(o){ if (!closed && host === pid) ref.child('obj').set(o ? clean(o) : null).catch(() => {}); },
    addScore(team){ if (!closed) ref.child('match/score/' + team).transaction(v => (v || 0) + 1).catch(() => {}); },
    leave
  };
  const fire = (k, ...a) => { const f = conn.on[k]; if (f) try { f(...a); } catch (e) { console.error(e); } };

  stRef.onDisconnect().remove();        // 창을 닫으면 자동으로 방에서 빠짐
  stRef.set({w: 1, n: name, j: joinedAt}).catch(() => {});   // 첫 상태를 보내기 전 자리 잡기 (w: 아직 준비 중)

  const stq = ref.child('st');
  const onSt = s => { if (s.key === pid) return; states[s.key] = s.val(); if (!s.val().w) fire('state', s.key, s.val()); };
  stq.on('child_added', onSt);
  stq.on('child_changed', onSt);
  stq.on('child_removed', s => { if (s.key === pid) return; delete states[s.key]; fire('leave', s.key); checkHost(); });

  // 신호: 내가 들어온 뒤의 것만 받음
  const evq = ref.child('ev').orderByKey().startAt(ref.child('ev').push().key);
  evq.on('child_added', s => {
    const v = s.val();
    if (!v || v.f === pid) return;
    if (v.to && v.to !== pid && !(v.to[0] === 'd' && host === pid)) return;   // 나에게 온 것 + (방장이면) 허수아비에게 온 것
    fire('event', v);
  });
  const hostRef = ref.child('host'), modeRef = ref.child('dmode'), dumRef = ref.child('dum'), matchRef = ref.child('match');
  const gmodeRef = ref.child('gmode'), objRef = ref.child('obj');
  gmodeRef.on('value', s => fire('gmode', s.val() || 'kill'));
  objRef.on('value', s => fire('obj', s.val()));
  matchRef.on('value', s => fire('match', s.val()));
  hostRef.on('value', s => { host = s.val(); fire('host', host); checkHost(); });
  modeRef.on('value', s => fire('mode', s.val() || 'still'));
  dumRef.on('value', s => { if (host !== pid) fire('dummies', s.val()); });

  // 인터넷이 잠깐 끊겼다 돌아오면 다시 자리 잡기
  const info = d.ref('.info/connected');
  const onInfo = s => { if (s.val() && !closed) stRef.onDisconnect().remove(); };
  info.on('value', onInfo);

  // 방장이 나가면: 남은 사람 중 가장 먼저 들어온 사람이 방장
  function checkHost(){
    if (closed || Date.now() - startAt < HOST_CHECK_AFTER) return;
    if (host && (host === pid || states[host])) return;
    const ids = Object.keys(states).concat([pid]);
    const j = k => k === pid ? joinedAt : (states[k].j || 0);
    ids.sort((a, b) => j(a) - j(b));
    if (ids[0] === pid){ const was = host; hostRef.transaction(cur => (!cur || cur === was) ? pid : undefined).catch(() => {}); }
  }
  const timer = setInterval(checkHost, 2000);

  async function leave(){
    if (closed) return;
    closed = true; clearInterval(timer);
    stq.off(); evq.off(); hostRef.off(); modeRef.off(); dumRef.off(); matchRef.off(); gmodeRef.off(); objRef.off(); info.off('value', onInfo);
    try {
      await stRef.onDisconnect().cancel();
      await stRef.remove();
      if (host === pid){
        const rest = Object.keys(states).sort((a, b) => (states[a].j || 0) - (states[b].j || 0));
        if (rest.length) await hostRef.set(rest[0]);
      }
      const left = await ref.child('st').once('value');
      if (!left.exists()) await ref.remove();      // 내가 마지막이면 방을 통째로 지움
    } catch (e) { console.error(e); }
  }
  return conn;
}

window.MagicNet = {create, join, myPid};
})();

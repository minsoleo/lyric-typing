/* 판 뒤집기: 화면 + Firebase 연결 */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const L = window.FlipLogic;
const MAX_PLAYERS = 16, BOARD = 49, MEME_PER_BOARD = 44, OLD_ROOM_MS = 6 * 3600 * 1000;
const TEAM_NAME = {red: '빨강', blue: '파랑'};

/* ---------- 밝은/어두운 버전 (타자연습과 같은 설정 공유) ---------- */
let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function applyTheme(){
  document.documentElement.dataset.theme = theme;
  const b = $('#themeBtn'), label = theme === 'light' ? '어두운 버전으로 바꾸기' : '밝은 버전으로 바꾸기';
  b.textContent = theme === 'light' ? '🌙' : '☀️';
  b.title = label; b.setAttribute('aria-label', label);
}
$('#themeBtn').onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light'; applyTheme();
  try { localStorage.setItem('lyricTyping.theme', theme); } catch (e) {}
};
applyTheme();

/* 만국기 */
(function(){
  const b = $('#bunting'), n = Math.max(16, Math.round(window.innerWidth / 34));
  for (let i = 0; i < n; i++) b.appendChild(document.createElement('i'));
})();

/* ---------- 저장 (닉네임은 계속, 내 번호·방은 이 탭에서만) ---------- */
const store = {
  get(k, session){ try { return (session ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
  set(k, v, session){ try { (session ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} },
  del(k, session){ try { (session ? sessionStorage : localStorage).removeItem(k); } catch (e) {} }
};
// 탭마다 다른 번호 → 같은 컴퓨터에서 창 두 개로도 두 사람처럼 할 수 있음
let pid = store.get('flip.pid', true);
if (!pid){ pid = 'p' + Math.random().toString(36).slice(2, 10); store.set('flip.pid', pid, true); }
$('#nameInput').value = store.get('flip.name') || '';

/* ---------- Firebase ---------- */
const fbApp = firebase.initializeApp({databaseURL: 'https://lyric-typing-6ead1-default-rtdb.asia-southeast1.firebasedatabase.app'});
const db = fbApp.database();
let offset = 0;                                   // 내 컴퓨터 시계와 서버 시계 차이
db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
const now = () => Date.now() + offset;

let code = null, roomRef = null, room = null, me = null, leaving = false;
const view = name => {
  document.body.dataset.view = name;
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== 'v-' + name;
};
const isHost = () => room && room.host === pid;
const players = () => (room && room.players) || {};
const myTeam = () => (players()[pid] || {}).team || 'red';

/* ---------- 입장 ---------- */
function getName(){
  const n = $('#nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 10);
  if (!n){ entryMsg('닉네임을 먼저 적어 주세요.'); $('#nameInput').focus(); return null; }
  store.set('flip.name', n);
  return n;
}
const entryMsg = m => { $('#entryMsg').textContent = m; };

$('#createBtn').onclick = async () => {
  const name = getName(); if (!name) return;
  entryMsg('방을 만드는 중…');
  setBusy(true);
  try {
    for (let i = 0; i < 12; i++){
      const c = L.makeCode(Math.random);
      const t = now();
      const res = await db.ref('rooms/' + c).transaction(cur => {
        if (cur && t - (cur.createdAt || 0) < OLD_ROOM_MS && cur.players) return;   // 쓰는 중인 방이면 다른 코드로
        return {createdAt: t, host: pid, state: 'lobby', round: 0,
                settings: {mode: 'word', seconds: 90},
                players: {[pid]: {name, team: 'red', joinedAt: t, flips: 0}}};
      });
      if (res.committed){ entryMsg(''); return enterRoom(c, name); }
    }
    entryMsg('방을 만들지 못했어요. 다시 눌러 주세요.');
  } catch (e) { connErr(e); }
  finally { setBusy(false); }
};

$('#joinBtn').onclick = () => joinRoom($('#codeInput').value.trim());
$('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
$('#codeInput').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

async function joinRoom(c, silent){
  const name = getName(); if (!name) return;
  if (!/^[0-9]{4}$/.test(c)){ entryMsg('방 코드는 숫자 4자리예요.'); return; }
  if (!silent) entryMsg('들어가는 중…');
  setBusy(true);
  try {
    const snap = await db.ref('rooms/' + c).once('value');
    const r = snap.val();
    if (!r || !r.players){ entryMsg('그 코드의 방이 없어요. 숫자를 다시 확인해 주세요.'); store.del('flip.code', true); return; }
    const ps = r.players;
    if (!ps[pid] && Object.keys(ps).length >= MAX_PLAYERS){ entryMsg(`방이 꽉 찼어요. (최대 ${MAX_PLAYERS}명)`); return; }
    // 새로고침으로 잠깐 빠졌던 거라면, 이 탭에 저장해 둔 내 팀·뒤집은 수를 되살림
    let saved = null;
    try { const s = JSON.parse(store.get('flip.me', true) || 'null'); if (s && s.code === c) saved = s.p; } catch (e) {}
    const mine = ps[pid] ? Object.assign({}, ps[pid], {name})
      : saved ? Object.assign({}, saved, {name})
      : {name, team: L.smallerTeam(ps), joinedAt: now(), flips: 0};
    await db.ref(`rooms/${c}/players/${pid}`).set(mine);
    entryMsg('');
    enterRoom(c, name);
  } catch (e) { connErr(e); }
  finally { setBusy(false); }
}
function setBusy(b){ $('#createBtn').disabled = b; $('#joinBtn').disabled = b; }
function connErr(e){
  console.error(e);
  entryMsg('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요. (학교 인터넷이 막고 있을 수도 있어요)');
}

function enterRoom(c, name){
  code = c; leaving = false;
  roomRef = db.ref('rooms/' + c);
  me = {name};
  store.set('flip.code', c, true);
  const pRef = roomRef.child('players/' + pid);
  pRef.onDisconnect().remove();                    // 창을 닫으면 자동으로 방에서 빠짐
  roomRef.on('value', onRoom);
  $('#lobbyCode').textContent = c;
}

// 잠깐 인터넷이 끊겼다 돌아오면 다시 방에 들어감
db.ref('.info/connected').on('value', s => {
  if (!s.val() || !roomRef || leaving) return;
  const pRef = roomRef.child('players/' + pid);
  pRef.onDisconnect().remove();
  if (me && me.saved) pRef.transaction(cur => cur || me.saved);
});

async function leaveRoom(){
  if (!roomRef) return;
  leaving = true;
  roomRef.off('value', onRoom);
  const ref = roomRef;
  roomRef = null; room = null; code = null;
  store.del('flip.code', true);
  try {
    await ref.child('players/' + pid).onDisconnect().cancel();
    // 내가 마지막 사람이면 방을 통째로 지움
    await ref.transaction(r => {
      if (!r) return r;
      if (r.players) delete r.players[pid];
      if (!r.players || !Object.keys(r.players).length) return null;
      return r;
    });
  } catch (e) { console.error(e); }
  stopTimer();
  view('entry');
}
$('#leaveBtn1').onclick = $('#leaveBtn2').onclick = leaveRoom;

/* ---------- 방 상태가 바뀔 때마다 ---------- */
function onRoom(snap){
  room = snap.val();
  if (!room){ entryMsg('방이 사라졌어요.'); roomRef && roomRef.off('value', onRoom); roomRef = null; code = null; store.del('flip.code', true); stopTimer(); view('entry'); return; }
  const ps = players();
  if (ps[pid]){ me.saved = ps[pid]; store.set('flip.me', JSON.stringify({code, p: ps[pid]}), true); }
  else if (me.saved && !leaving){ roomRef.child('players/' + pid).transaction(cur => cur || me.saved); return; }
  // 방장이 나갔으면 가장 먼저 들어온 사람이 방장
  if (!ps[room.host] && L.nextHost(ps) === pid) roomRef.child('host').set(pid);
  if (room.state === 'playing') renderGame();
  else if (room.state === 'ended') renderResult();
  else renderLobby();
}

/* ---------- 대기실 ---------- */
function listPlayers(team, withFlips){
  return Object.entries(players())
    .filter(([, p]) => p.team === team)
    .sort((a, b) => withFlips ? (b[1].flips || 0) - (a[1].flips || 0) : (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
}
function fillList(ul, list, withFlips){
  ul.textContent = '';
  for (const [id, p] of list){
    const li = document.createElement('li');
    if (id === pid) li.className = 'me';
    const n = document.createElement('span');
    n.textContent = (id === room.host ? '👑 ' : '') + p.name + (id === pid ? ' (나)' : '');
    li.appendChild(n);
    if (withFlips){ const f = document.createElement('span'); f.textContent = (p.flips || 0) + '장'; li.appendChild(f); }
    else {   // 대기실: 방장 / 준비 완료 / 준비 중
      const b = document.createElement('span');
      b.className = 'state ' + (id === room.host ? 'host' : p.ready ? 'ready' : 'wait');
      b.textContent = id === room.host ? '방장' : p.ready ? '✅ 준비' : '준비 중…';
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
}
function renderLobby(){
  stopTimer();
  view('lobby');
  const s = room.settings || {mode: 'word', seconds: 90}, host = isHost();
  const red = listPlayers('red'), blue = listPlayers('blue');
  fillList($('#redList'), red); fillList($('#blueList'), blue);
  $('#redCount').textContent = `(${red.length}명)`; $('#blueCount').textContent = `(${blue.length}명)`;
  $('#lobbyInfo').textContent = `${red.length + blue.length}명 / 최대 ${MAX_PLAYERS}명 · 방장: ${(players()[room.host] || {}).name || '-'}`;
  for (const b of $('#modeSeg').children){ b.classList.toggle('on', b.dataset.mode === s.mode); b.disabled = !host; }
  for (const b of $('#secSeg').children){ b.classList.toggle('on', +b.dataset.sec === s.seconds); b.disabled = !host; }
  $('#hostNote').textContent = host ? '방장만 바꿀 수 있어요' : '방장이 정해요';
  $('#toRed').disabled = myTeam() === 'red';
  $('#toBlue').disabled = myTeam() === 'blue';
  $('#shuffleBtn').hidden = !host;
  $('#startBtn').hidden = !host;
  moveChat('lobbyChatSlot');
  // 준비: 방장 빼고 모두 준비해야 시작 버튼이 노랗게 켜짐
  const r = readyCount(), meReady = !!(players()[pid] || {}).ready;
  const rb = $('#readyBtn');
  rb.hidden = host;
  rb.textContent = meReady ? '✅ 준비 완료! (누르면 취소)' : '✋ 준비';
  rb.classList.toggle('primary', !meReady);
  rb.classList.toggle('done', meReady);
  const sb = $('#startBtn');
  sb.textContent = r.all ? '▶ 경기 시작' : `▶ 경기 시작 (준비 ${r.ready}/${r.total})`;
  sb.classList.toggle('primary', r.all);
  $('#lobbyMsg').textContent = host
    ? (!r.all ? '친구들이 모두 준비하면 시작할 수 있어요.' : !red.length || !blue.length ? '한 팀이 비어 있어요. 그래도 시작할 수 있어요.' : '모두 준비 완료! 시작하세요.')
    : meReady ? '준비 완료! 방장이 시작하면 바로 경기가 열려요.' : '준비 버튼을 눌러 주세요.';
}
// 방장을 뺀 사람 중 준비한 사람 수
function readyCount(){
  const others = Object.entries(players()).filter(([id]) => id !== room.host);
  const ready = others.filter(([, p]) => p.ready).length;
  return {ready, total: others.length, all: ready === others.length};
}
$('#readyBtn').onclick = () => {
  if (!roomRef || isHost()) return;
  roomRef.child(`players/${pid}/ready`).set(!(players()[pid] || {}).ready);
};
$('#modeSeg').onclick = e => { const b = e.target.closest('button'); if (b && isHost()) roomRef.child('settings/mode').set(b.dataset.mode); };
$('#secSeg').onclick = e => { const b = e.target.closest('button'); if (b && isHost()) roomRef.child('settings/seconds').set(+b.dataset.sec); };
$('#toRed').onclick = () => roomRef && roomRef.child(`players/${pid}/team`).set('red');
$('#toBlue').onclick = () => roomRef && roomRef.child(`players/${pid}/team`).set('blue');
$('#shuffleBtn').onclick = () => {
  if (!isHost()) return;
  const t = L.balanceTeams(Object.keys(players()), Math.random), up = {};
  for (const [id, team] of Object.entries(t)) up[`players/${id}/team`] = team;
  roomRef.update(up);
};
$('#copyCode').onclick = async () => {
  try { await navigator.clipboard.writeText(code); $('#copyCode').textContent = '복사됨!'; }
  catch (e) { $('#copyCode').textContent = '복사 실패'; }
  setTimeout(() => { $('#copyCode').textContent = '코드 복사'; }, 1500);
};

function startRound(){
  if (!isHost()) return;
  const s = room.settings || {mode: 'word', seconds: 90};
  const W = window.FLIP_WORDS;
  // 긴 문장 판: 민솔님이 모은 밈 44개 + 기본 문장 5개 (기본 문장은 거의 안 보이게)
  const texts = s.mode === 'sentence'
    ? L.mixBoard(W.sentence, W.meme, BOARD, MEME_PER_BOARD, Math.random)
    : L.pickCards(W.word, BOARD, Math.random);
  const cards = texts.map(t => ({t, o: '', by: ''}));
  const startsAt = now() + 7000;   // 팀 소개 3.5초 + 3·2·1 3.5초
  const up = {state: 'playing', round: (room.round || 0) + 1, cards, startsAt, endsAt: startsAt + (s.seconds || 90) * 1000};
  // 다음 판 대기실에서 다시 준비하도록 준비 상태는 꺼 둠
  for (const id of Object.keys(players())){ up[`players/${id}/flips`] = 0; up[`players/${id}/ready`] = false; }
  roomRef.update(up);
}
$('#startBtn').onclick = () => {
  if (!isHost()) return;
  const r = readyCount();
  if (!r.all && !confirm(`아직 준비 안 한 친구가 있어요 (준비 ${r.ready}/${r.total}).\n그래도 시작할까요?`)) return;
  startRound();
};
$('#againBtn').onclick = startRound;
$('#toLobbyBtn').onclick = () => {
  if (!isHost()) return;
  const up = {state: 'lobby', cards: null, startsAt: null, endsAt: null};
  for (const id of Object.keys(players())) up[`players/${id}/ready`] = false;
  roomRef.update(up);
};

/* ---------- 게임 ---------- */
let builtRound = -1, lastOwners = [], timer = null, endAsked = false;
let inp = $('#flipInput');

function renderGame(){
  view('game');
  const cards = room.cards || [];
  const board = $('#board');
  if (builtRound !== room.round){
    builtRound = room.round; endAsked = false; lastOwners = [];
    board.textContent = '';
    board.classList.toggle('sent', (room.settings || {}).mode === 'sentence');
    cards.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'card'; d.dataset.i = i; d.textContent = c.t;
      board.appendChild(d);
    });
    clearInput(); gameMsg('');
  }
  cards.forEach((c, i) => {
    const d = board.children[i]; if (!d) return;
    d.classList.toggle('red', c.o === 'red');
    d.classList.toggle('blue', c.o === 'blue');
    if (lastOwners[i] !== undefined && lastOwners[i] !== c.o){ d.classList.remove('flip'); void d.offsetWidth; d.classList.add('flip'); }
    lastOwners[i] = c.o;
  });
  const t = L.tally(cards);
  $('#redScore').textContent = t.red; $('#blueScore').textContent = t.blue;
  // 줄다리기 막대: 빨강 비율만큼 빨강이 차고, 가운데 매듭이 이기는 쪽으로 끌려감
  const owned = t.red + t.blue, ratio = owned ? t.red / owned : 0.5;
  $('#ropeFill').style.width = (ratio * 100) + '%';
  $('#ropeKnot').style.left = (ratio * 100) + '%';
  const team = myTeam();
  document.body.dataset.team = team;
  $('#myTeamLabel').textContent = `${TEAM_NAME[team]} 팀`;
  $('#redSide').classList.toggle('mine', team === 'red');
  $('#blueSide').classList.toggle('mine', team === 'blue');
  fillRoster($('#redRoster'), 'red'); fillRoster($('#blueRoster'), 'blue');
  $('#myFlips').textContent = ((players()[pid] || {}).flips || 0) + '장';
  moveChat('gameChatSlot');
  highlight();
  startTimer();
}

// 채팅 상자를 지금 화면(대기실/게임)의 자리로 옮김
function moveChat(slotId){
  const box = $('#chatBox'), slot = $('#' + slotId);
  if (box.parentNode !== slot){ slot.appendChild(box); chatSig = ''; }
  $('#chatHint').textContent = slotId === 'gameChatSlot' ? 'Esc: 게임으로' : '';
  renderChat();
}
$('#gameLeaveBtn').onclick = () => {
  if (confirm('경기에서 나갈까요?\n지금까지 뒤집은 판은 팀 색 그대로 남아요.')) leaveRoom();
};

/* ---------- 채팅 ---------- */
const CHAT_KEEP = 50;            // 최근 50개만 보관
let chatSig = '';
function renderChat(){
  const chat = (room && room.chat) || {};
  const keys = Object.keys(chat).sort();          // push 키는 시간 순서로 정렬됨
  const sig = keys.length + ':' + (keys[keys.length - 1] || '');
  if (sig === chatSig) return;
  chatSig = sig;
  const log = $('#chatLog');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
  log.textContent = '';
  for (const k of keys.slice(-CHAT_KEEP)){
    const m = chat[k] || {}, p = document.createElement('p'), b = document.createElement('b');
    b.className = m.team === 'blue' ? 'blue' : 'red';
    b.textContent = (m.name || '?') + (m.pid === pid ? '(나)' : '');
    p.append(b, document.createTextNode(String(m.text || '')));
    log.appendChild(p);
  }
  if (atBottom || (chat[keys[keys.length - 1]] || {}).pid === pid) log.scrollTop = log.scrollHeight;
}
const chatInp = $('#chatInput');
let chatPending = false;
function sendChat(){
  const text = chatInp.value.replace(/\s+/g, ' ').trim().slice(0, 60);
  chatInp.value = '';
  if (!text || !roomRef) return;
  const p = players()[pid] || {};
  roomRef.child('chat').push({pid, name: p.name || me.name, team: p.team || 'red', text, at: firebase.database.ServerValue.TIMESTAMP});
  // 오래된 채팅 지우기 (방 데이터가 너무 커지지 않게)
  const keys = Object.keys((room && room.chat) || {}).sort();
  if (keys.length >= CHAT_KEEP + 10){
    const up = {};
    for (const k of keys.slice(0, keys.length - CHAT_KEEP)) up['chat/' + k] = null;
    roomRef.update(up);
  }
}
chatInp.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ e.preventDefault(); focusGame(true); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (e.isComposing){ chatPending = true; return; }
  sendChat();
});
chatInp.addEventListener('compositionend', () => { if (chatPending){ chatPending = false; setTimeout(sendChat, 0); } });
chatInp.addEventListener('paste', e => e.stopPropagation());   // 채팅은 붙여넣기 허용
// 채팅 치는 중에는 게임 입력 칸이 포커스를 뺏지 않게
function focusGame(force){
  if (inp.disabled) return;
  if (force || document.activeElement !== chatInp) inp.focus();
}
function fillRoster(ul, team){
  ul.textContent = '';
  for (const [id, p] of listPlayers(team, true)){
    const li = document.createElement('li');
    if (id === pid) li.className = 'me';
    const n = document.createElement('span'); n.textContent = p.name + (id === pid ? ' (나)' : '');
    const f = document.createElement('b'); f.textContent = p.flips || 0;
    li.append(n, f); ul.appendChild(li);
  }
}
function chips(el, team){
  el.textContent = ''; el.className = 'chips ' + team;
  for (const [id, p] of listPlayers(team)){
    const s = document.createElement('span');
    s.textContent = p.name + (id === pid ? ' (나)' : '');
    if (id === pid) s.className = 'me';
    el.appendChild(s);
  }
  if (!el.children.length){ const s = document.createElement('span'); s.textContent = '아무도 없어요'; s.style.opacity = '.6'; el.appendChild(s); }
}
function showIntro(){
  const team = myTeam(), foe = team === 'red' ? 'blue' : 'red', box = $('#intro');
  box.className = 'overlay intro ' + team;
  $('#introTeam').textContent = `나는 ${TEAM_NAME[team]} 팀!`;
  chips($('#introMates'), team);
  chips($('#introFoes'), foe);
  box.hidden = false;
}

function startTimer(){ if (!timer){ tick(); timer = setInterval(tick, 200); } }
function stopTimer(){ clearInterval(timer); timer = null; $('#countdown').hidden = true; $('#intro').hidden = true; }
function tick(){
  if (!room || room.state !== 'playing') return;
  const t = now(), cd = $('#countdown'), num = $('#countNum'), until = room.startsAt - t;
  if (until > 3200){                       // 1) 팀 소개
    showIntro(); cd.hidden = true; inp.disabled = true;
  } else if (until > 0){                    // 2) 3·2·1
    $('#intro').hidden = true;
    cd.hidden = false; num.className = 'count'; num.textContent = Math.ceil(until / 1000);
    inp.disabled = true;
  } else if (until > -700){                 // 3) 출발!
    $('#intro').hidden = true;
    cd.hidden = false; num.className = 'count go'; num.textContent = '출발!';
    if (inp.disabled){ inp.disabled = false; focusGame(); }
  } else {
    $('#intro').hidden = true; cd.hidden = true;
    if (inp.disabled && t < room.endsAt){ inp.disabled = false; focusGame(); }
  }
  const left = Math.max(0, Math.min(room.endsAt - room.startsAt, room.endsAt - t));
  const sec = Math.ceil(left / 1000);
  $('#timer').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  $('#watch').classList.toggle('hurry', sec <= 10);
  if (t >= room.endsAt){
    inp.disabled = true;
    // 시간이 끝나면 방장이 게임을 끝냄 (방장이 없으면 2초 뒤 누구든)
    if (!endAsked && (isHost() || t >= room.endsAt + 2000)){
      endAsked = true;
      const round = room.round;
      roomRef.transaction(r => {
        if (!r || r.state !== 'playing' || r.round !== round) return;
        r.state = 'ended'; return r;
      });
    }
  }
}

function highlight(){
  const hits = new Set(L.prefixHits(room.cards || [], inp.value));
  const board = $('#board');
  for (const d of board.children) d.classList.toggle('hit', hits.has(+d.dataset.i));
}
function gameMsg(m, good){
  const e = $('#gameMsg');
  e.textContent = m; e.classList.toggle('good', !!good);
}

function submit(text){
  if (!room || room.state !== 'playing') return;
  const t = now();
  if (t < room.startsAt || t >= room.endsAt) return;
  const typed = typeof text === 'string' ? text : inp.value;
  if (!L.norm(typed)) return;
  const team = myTeam();
  const r = L.findTarget(room.cards || [], typed, team);
  clearInput();
  highlight();
  if (r.reason === 'none'){ gameMsg('판에 없는 글이에요'); shake(); return; }
  if (r.reason === 'own'){ gameMsg('이미 우리 팀 카드예요'); return; }
  const round = room.round;
  roomRef.child('cards/' + r.index).transaction(c => {
    if (!c || c.o === team) return;                  // 그새 우리 팀이 뒤집었으면 그만
    if (!room || room.round !== round || now() >= room.endsAt) return;
    c.o = team; c.by = pid; return c;
  }, (err, committed) => {
    if (err) { gameMsg('연결이 불안정해요'); return; }
    if (committed){
      roomRef.child(`players/${pid}/flips`).set(firebase.database.ServerValue.increment(1));
      gameMsg('뒤집었다! ✔', true);
    } else gameMsg('한발 늦었어요');
  }, false);
}
$('#sendBtn').onclick = () => { submit(); if (!inp.disabled) inp.focus(); };
function shake(){ inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); }

/* 한글 조립 중에 Enter를 누르면 글자가 확정된 뒤에 보내기 */
let pendingSubmit = false;
function onKey(e){
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (e.isComposing){ pendingSubmit = true; return; }
  submit();
}
/* 스페이스바로 보내기
   - 짧은 단어 판: 단어에 띄어쓰기가 없으니 스페이스바 = Enter
   - 긴 문장 판: 문장 안에 띄어쓰기가 있으니, 판에 있는 문장과 똑같이 다 친 뒤에 누른 스페이스바만 보내기 */
function onTypeInput(){
  if (!room || room.state !== 'playing') return;
  const v = inp.value;
  if (/\s$/.test(v)){
    const body = v.replace(/\s+$/, '');
    if (body){
      const sentence = (room.settings || {}).mode === 'sentence';
      if (!sentence || L.findTarget(room.cards || [], body, myTeam()).index >= 0){ submit(body); return; }
    } else { inp.value = ''; }
  }
  highlight();
}
function bindInput(el){
  el.addEventListener('keydown', onKey);
  el.addEventListener('compositionend', () => { if (pendingSubmit){ pendingSubmit = false; setTimeout(submit, 0); } });
  el.addEventListener('input', onTypeInput);
  el.addEventListener('paste', e => e.preventDefault());   // 붙여넣기 금지
}
bindInput(inp);

/* 입력 칸 비우기 (휴대폰 키보드가 조립 중이던 글자를 다음 입력에 붙이지 않도록, 휴대폰에선 칸을 새로 바꿔 끼움) */
const isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
function clearInput(){
  pendingSubmit = false;
  if (isTouch){
    const old = inp, fresh = old.cloneNode(false);
    fresh.value = ''; bindInput(fresh);
    old.after(fresh); inp = fresh; fresh.focus(); old.remove();
  } else {
    inp.blur(); inp.value = ''; focusGame();
  }
}

/* ---------- 결과 ---------- */
function renderResult(){
  stopTimer();
  view('result');
  moveChat('resultChatSlot');
  const t = L.tally(room.cards || []);
  const win = t.red === t.blue ? '' : t.red > t.blue ? 'red' : 'blue';
  const w = $('#winText');
  w.className = 'big ' + win;
  w.textContent = !win ? '🤝 무승부!' : `🏆 ${TEAM_NAME[win]} 팀 승리!` + (win === myTeam() ? ' 🎉' : '');
  // 꽃가루 (결과 화면이 처음 열릴 때 한 번만)
  const cf = $('#confetti');
  if (cf.dataset.round !== String(room.round)){
    cf.dataset.round = room.round; cf.textContent = '';
    const colors = win === 'red' ? ['#ef4b4f', '#ff7a6b', '#ffc928', '#fff'] : win === 'blue' ? ['#2f7cf0', '#62a8ff', '#ffc928', '#fff'] : ['#ef4b4f', '#2f7cf0', '#ffc928', '#3fbf6a'];
    for (let i = 0; i < 60; i++){
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 1.2) + 's';
      c.style.animationDuration = (2 + Math.random() * 1.5) + 's';
      cf.appendChild(c);
    }
  }
  $('#finalRed').textContent = `빨강 ${t.red}장`;
  $('#finalBlue').textContent = `파랑 ${t.blue}장`;
  const m = L.mvp(players());
  $('#mvpText').textContent = m ? `⭐ MVP: ${m.name} (${m.flips}장 뒤집음)` : '';
  fillList($('#resRed'), listPlayers('red', true), true);
  fillList($('#resBlue'), listPlayers('blue', true), true);
  const host = isHost();
  $('#againBtn').hidden = !host; $('#toLobbyBtn').hidden = !host;
  $('#resultNote').textContent = host ? '한 판 더: 같은 팀·같은 설정으로 바로 시작 / 대기실로: 팀이나 설정 바꾸기' : '방장이 다음 판을 시작할 때까지 기다려요.';
}

/* ---------- 새로고침해도 같은 방으로 ---------- */
view('entry');
const savedCode = store.get('flip.code', true);
if (savedCode && $('#nameInput').value) joinRoom(savedCode, true);
})();

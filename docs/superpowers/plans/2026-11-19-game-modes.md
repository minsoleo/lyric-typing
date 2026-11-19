# 대결 모드 3가지 (킬내기전 · 깃발쟁 · 점령전) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 숲속의 한바탕 온라인 방에 깃발쟁·점령전을 더하고, 두 모드가 쓰는 넓은 대칭 맵을 만든다 (킬내기전은 지금 그대로).

**Architecture:** 맵 정의를 `magic-maps.js`로 빼고 `magic.js`가 `setMap(id)`로 지금 맵을 바꾼다. 깃발·점령 규칙은 `magic-logic.js`의 순수 함수로 계산하고(테스트), 방장 컴퓨터가 0.2초마다 그 함수를 돌려 결과를 Firebase `rooms/<코드>/obj`에 올리면 모두가 그것을 그린다. 방 모드는 `rooms/<코드>/gmode`, 대결은 기존 `match`에 `mode`·`over`·`winner`를 더한다.

**Tech Stack:** 순수 JS + Canvas 2D, Firebase Realtime Database compat 10.12.2, 테스트는 브라우저 페이지 `tests/magic-logic.test.html`.

**Spec:** `docs/superpowers/specs/2026-11-19-game-modes-design.md`

## Global Constraints
- 점령 속도: 1명 = 40초에 0→100% → `ZONE_RATE = 100 / 40` (%/초). 2턴은 (1 + 서 있는 우리 팀 수)명분.
- 깃발 점수 구간 3 : 2 : 1 → 처음 3/6 = 1점/초, 다음 2/6 = 2점/초, 마지막 1/6 = 3점/초.
- 점령전 승리 = 완전 점령 2곳. 제한 시간 없음, 끝내기 버튼 없음.
- 다시 살아나기 3초(`RESPAWN` 그대로), 깃발 든 사람 느려짐 없음, 은신 중에도 깃발은 보임.
- 넓은 맵 `wide` 4800x2400, 좌우 대칭, 기존 그림만 사용. 킬내기전 → `forest`, 깃발쟁·점령전 → `wide`.
- 깃발 줍기 거리 60, 구역 반지름 200.
- 노트북 1366x650에서 스크롤 없음.
- 게임 파일을 고쳐 올릴 때마다 `magic.html`·`flip.html`의 `?v=` 판 번호를 바꾼다 (이번: `20261119u`).
- 화면에 보이는 글은 한국어, 쉬운 말.

## Review Focus
1. **방장이 대결 중에 나감** (깃발을 누가 들고 있거나 구역 게이지가 반쯤) → 다음 방장이 서버의 `obj`에서 그대로 이어서 계산해야 함 (Task 4·5 확인 단계에서 방장 탭 닫기).
2. **방장 탭이 화면 뒤로 숨음** → `requestAnimationFrame`이 멈춰도 깃발 점수·점령 게이지는 계속 돌아야 함: 규칙 계산은 `setInterval(200)` + 실제 지난 시간(최대 2초)으로 돌리고, `zoneStep`은 큰 `dt`에도 100을 넘지 않아야 함 (Task 1 테스트 `zoneStep: 큰 dt도 100에서 멈춤`).
3. **깃발 든 사람이 창을 닫음 / 은신 중에 쓰러짐** → 마지막 위치에 깃발이 떨어지고 모두에게 보여야 함 (Task 4).
4. **대결 중에 들어온 사람** → `gmode`에 맞는 맵으로 바뀌고, 지금 `obj`(깃발 위치·게이지)를 바로 그려야 함 (Task 3·4).
5. **한 팀이 모두 나감** → 남은 팀 승리로 판이 끝나야 함 (Task 6).

---

### Task 1: 깃발·점령 계산 함수 (magic-logic.js)

**Files:**
- Modify: `magic-logic.js` (함수 추가, `window.MagicLogic`에 내보내기)
- Test: `tests/magic-logic.test.html` (끝의 요약 줄 바로 위에 추가)

**Interfaces:**
- Produces:
  - `flagRate(elapsed: 초, len: 초) → 1 | 2 | 3`
  - `flagPickup(flag: {x, y, by}, people: [{id, x, y, dead}], radius) → id | null` — `flag.by`가 있으면 null, 아니면 radius 안 살아 있는 가장 가까운 사람
  - `newZone() → {own: null, c: {red: 0, blue: 0}, h: {red: 0, blue: 0}, war: false, lock: false}`
  - `zoneStep(z, nRed, nBlue, dt, rate) → 새 zone 객체` (z를 바꾸지 않음)
  - `zoneWinner(zones) → 'red' | 'blue' | null` — lock된 구역이 2곳 이상인 팀

- [ ] **Step 1: 실패하는 테스트 쓰기** (`const R = 100 / 40; const Z = o => { const z = L.newZone(); Object.assign(z.c, o.c); Object.assign(z.h, o.h); return Object.assign(z, o, {c: z.c, h: z.h}); };` — 적지 않은 게이지는 0)
  - `flagRate: 3분 → 0~89초 1점, 90~149초 2점, 150초~ 3점` — `[0, 89.9].every(e => L.flagRate(e, 180) === 1) && L.flagRate(90, 180) === 2 && L.flagRate(149.9, 180) === 2 && L.flagRate(150, 180) === 3 && L.flagRate(179, 180) === 3`
  - `flagRate: 2분 → 60초부터 2점, 100초부터 3점` — `L.flagRate(59, 120) === 1 && L.flagRate(60, 120) === 2 && L.flagRate(100, 120) === 3`
  - `flagPickup: 60 안 가장 가까운 산 사람` — 깃발 (0,0) by null, A (50,0), B (30,0) → `'B'`; B `dead: true` → `'A'`; 둘 다 70 밖 → `null`; `by: 'A'`면 → `null`
  - `zoneStep: 빨강 1명 20초 → 1턴 50%, 주인 없음` — `c.red` ≈ 50, `own === null`
  - `zoneStep: 빨강 2명 20초 → 점령 완료` — `own === 'red' && c.red === 100`
  - `zoneStep: 두 팀이 같이 있으면 전쟁 중, 아무것도 안 바뀜` — `Z({c: {red: 30, blue: 10}})`, (1,2,10) → `war && c.red === 30 && c.blue === 10`; 다음 (1,0,1) → `war === false`
  - `zoneStep: 점령한 구역은 아무도 없어도 2턴이 40초 속도로 참` — `Z({own: 'red', c: {red: 100, blue: 0}})`, (0,0,20) → `h.red` ≈ 50
  - `zoneStep: 우리 팀 2명이 서 있으면 3명분` — 위와 같은 시작, (2,0,10) → `h.red` ≈ 75
  - `zoneStep: 상대 혼자 있으면 우리 2턴은 멈추고 상대 1턴이 참` — `Z({own: 'red', c: {red: 100}, h: {red: 60}})` (c.blue 0), (0,1,20) → `h.red === 60 && c.blue` ≈ 50 && `own === 'red'`
  - `zoneStep: 뺏기면 진 팀 1턴은 0, 2턴 기록은 남음` — 위 시작, (0,1,40) → `own === 'blue' && c.red === 0 && h.red === 60 && h.blue === 0`
  - `zoneStep: 다시 뺏으면 남아 있던 2턴부터 이어서` — 그 결과에서 (1,0,40) → `own === 'red'`, 다시 (0,0,16) → `h.red` ≈ 100 && `lock`
  - `zoneStep: 주인 없는 구역을 먼저 채우면 상대 1턴은 0` — `Z({c: {red: 90, blue: 80}})`, (0,1,10) → `own === 'blue' && c.red === 0`
  - `zoneStep: 완전 점령되면 더 안 바뀜` — `Z({own: 'red', c: {red: 100}, h: {red: 100}, lock: true})`, (0,3,100) → `own === 'red' && c.blue === 0 && lock`
  - `zoneStep: 큰 dt도 100에서 멈춤` — `L.newZone()`, (1,0,999) → `c.red === 100 && h.red === 0`
  - `zoneStep: 원래 구역 객체는 안 바뀜` — 넘긴 z의 `c.red`가 그대로
  - `zoneWinner: 완전 점령 2곳 팀이 승리, 1곳씩이면 없음` — `[lock red, lock red, newZone]` → `'red'`; `[lock red, lock blue, newZone]` → `null`
- [ ] **Step 2: 실패 확인** — 미리보기 서버(`.claude/launch.json` "site", 포트 8643)에서 `http://localhost:8643/tests/magic-logic.test.html?r=1` 열고 `#sum` 읽기. Expected: `FAIL` (새 테스트들, `L.flagRate is not a function`).
- [ ] **Step 3: 함수 구현** — `zoneStep` 순서 (한 단계에 하나만 일어남, 남는 시간은 넘기지 않음):
  1. `lock`이면 그대로 복사해서 돌려줌 (`war: false`).
  2. 두 팀 다 있으면 `war: true`, 나머지 그대로.
  3. 한 팀 T만 있고 T가 주인 → `h[T] = min(100, h[T] + (1 + nT) * rate * dt)`.
  4. 한 팀 T만 있고 T가 주인이 아님 → `c[T] = min(100, c[T] + nT * rate * dt)`; 100이면 `own = T`, 상대의 `c = 0` (상대의 `h`는 그대로).
  5. 아무도 없고 주인 O가 있음 → `h[O] = min(100, h[O] + rate * dt)`.
  6. 주인의 `h`가 100이면 `lock = true`.
- [ ] **Step 4: 통과 확인** — 같은 페이지 `?r=2`. Expected: `ALL PASS` (기존 48 + 새 테스트).
- [ ] **Step 5: 커밋** — `git add magic-logic.js tests/magic-logic.test.html` / `git commit -m "Forest Brawl: flag and capture-zone rules as tested logic"`

### Task 2: 맵을 여러 개로 + 넓은 맵

**Files:**
- Create: `magic-maps.js`
- Modify: `magic.js` (맵 상수 → `setMap`), `magic.html` (`magic-maps.js` 스크립트, 혼자 연습 맵 버튼 `#mapBtn`)

**Interfaces:**
- Produces:
  - `window.MAGIC_MAPS = {forest: {...}, wide: {...}}`, 각 맵: `{id, name, W, H, left: [...], center: [...], path: [[x0,y0,c1x,c1y,c2x,c2y,x1,y1], ...], spawn: {solo, red, blue}, dummies: [[x,y], ...], decorSeed, decorCount, flag: {x,y} | null, zones: [{x,y,r}] | null}` — 나무는 `{x,y,w,h,kind:'tree'}`, 바위 `'rock'`, 연못 `'pond'` (지금과 같은 모양).
  - `magic.js` 안: `let WW, WH, OBSTACLES, WALLS, BLOCKERS, DECOR, SPAWN, MAP;` + `setMap(id)` — 다시 계산 + `mmBg = null` + 허수아비를 그 맵 자리로 + 내 캐릭터를 내 팀 출발 자리로. `tracePath(g)`는 `MAP.path`의 곡선 조각을 이어서 그림. `window.__magic.setMap`, `get map()`도 내보냄.
- `forest`는 지금 `magic.js`의 값을 그대로 옮김 (`path: [[250,900,1000,650,2200,650,2950,900]]`, `decorSeed: 20261118`, `decorCount: 210`, 허수아비 `[[950,1080],[2250,1080],[1600,960]]`, `flag: null`, `zones: null`).
- `wide`: 4800x2400, 출발 빨강 (300,1200) · 파랑 (4500,1200), 깃발 (2400,1200), 구역 `[{x:1300,y:1200,r:200},{x:2400,y:1200,r:200},{x:3500,y:1200,r:200}]`, 허수아비 `[[1300,850],[3500,850],[2400,800]]`. 흙길은 출발 → 구역 → 가운데 → 구역 → 출발을 잇는 대칭 곡선 (구역 가운데에서 120 이내로 지남). 나무·바위는 forest처럼 적게, 고르게 (왼쪽 절반 나무 9~11 · 바위 5~6 정도 + 가운데 위·아래).

- [ ] **Step 1: `magic-maps.js` 작성, `magic.js`를 `setMap('forest')`로 시작하게 바꿈.** 혼자 연습에서 `#mapBtn`("🗺 숲 맵" ⇄ "🗺 넓은 맵", `localStorage 'magic.map'`)으로 바꿀 수 있음. 온라인일 때는 숨김.
- [ ] **Step 2: forest가 그대로인지 확인** — 미리보기에서 `magic.html?r=3` 열고 javascript_tool로 `__magic.OBSTACLES.length === 24` (나무 15 · 바위 8 · 연못 1), 같은 자리에서 찍은 스크린샷이 바꾸기 전과 같음.
- [ ] **Step 3: wide 검사** — `__magic.setMap('wide')` 후 javascript_tool로 다음이 모두 true인지:
  - 출발 자리 2곳·깃발 자리·구역 3곳(반지름 200 + 40) 안에 장애물 없음 (`pointInRects`)
  - 허수아비 좌우 이동 범위(±150)에 장애물 없음
  - 장애물끼리 겹침 0, 거울 대칭 (왼쪽 것마다 `W - x - w` 짝이 있음)
  - 흙길 위 점 100개 중 장애물 안 0개
  - 작은 지도가 다시 만들어지고(`mmBg`) 맵 전체가 보이는 스크린샷
- [ ] **Step 4: 1366x650에서 스크롤 없음 확인** (`resize_window` 1366x650, `document.documentElement.scrollHeight <= innerHeight`), 끝나면 `preset: desktop`.
- [ ] **Step 5: 커밋** — `git commit -m "Forest Brawl: maps moved to magic-maps.js, new wide symmetric map"`

### Task 3: 방 모드 고르기 + 연결 (magic-net.js, 방 막대)

**Files:**
- Modify: `magic-net.js`, `magic.js` (방 막대·`onMatch`·`phase`·`startMatch`), `magic.html` (`#gmode` 고르기 칸)

**Interfaces:**
- Consumes: Task 2 `setMap(id)`.
- Produces:
  - `conn.setGmode(m)` (`rooms/<코드>/gmode` = 'kill'|'flag'|'zone'), `conn.on.gmode(m)` (없으면 'kill')
  - `conn.publishObj(o)` (방장만, `rooms/<코드>/obj`), `conn.on.obj(o)` (모두에게, 방장 포함)
  - `conn.endMatch(winner)` → `match`에 `{over: serverNow, winner}` update ('red'|'blue'|'draw')
  - `magic.js`: `let gmode = 'kill', obj = null;` · `const MODE_MAP = {kill: 'forest', flag: 'wide', zone: 'wide'}` · `MODES = {kill: {name: '⚔ 킬내기전', goal: '상대 팀을 많이 쓰러뜨리면 이겨요'}, flag: {name: '🚩 깃발쟁', goal: '깃발을 오래 들고 있으면 이겨요'}, zone: {name: '🏳 점령전', goal: '구역 2곳을 먼저 완전 점령하면 이겨요'}}`
  - `match = {id, mode, startAt, endAt | 없음(점령전), len, score, over?, winner?}`
  - `phase()`: `n < startAt` → 'count'; `match.over` 있거나 (`endAt` 있고 `n >= endAt`) → 'end'; 아니면 'play'.
- 방 막대 `#matchBox` 안: `<select id="gmode">`(3모드) + 시간 고르기(점령전이면 숨김) + "⚔ 대결 시작". 방장 아니면 지금 모드 이름만 글자로 보임. 대결 중엔 바꿀 수 없음.
- 모드가 바뀌면(`on.gmode`) 모두 `setMap(MODE_MAP[m])`, 효과·벽·장전 정리, 자기 팀 출발 자리로, 알림 `🗺 ${MODES[m].name} 맵으로 바뀌었어요`.
- 연습 중(대결 아님) 넓은 맵: 깃발(가운데)·구역 3개를 흐리게(투명도 0.35) 그리고 구역 가운데에 "대결을 시작하면 켜져요".
- 3·2·1 안내 문구는 `MODES[match.mode].goal`.

- [ ] **Step 1: 구현.**
- [ ] **Step 2: 탭 두 개로 확인** (지난번처럼 같은 미리보기의 탭 두 개, 탭마다 다른 사람): 방장이 깃발쟁으로 바꾸면 두 탭 모두 `__magic.map.id === 'wide'`; 나중에 들어온 세 번째 탭도 바로 wide; 킬내기전 대결이 지금처럼 끝까지 돌아가고 결과표가 나옴; 방장 아닌 탭에서는 고르기 칸이 안 보임.
- [ ] **Step 3: 커밋** — `git commit -m "Forest Brawl: room game-mode picker, map follows mode"`

### Task 4: 깃발쟁

**Files:**
- Modify: `magic.js`

**Interfaces:**
- Consumes: Task 1 `flagRate`, `flagPickup`; Task 3 `publishObj`/`on.obj`/`endMatch`, `gmode`, `obj`.
- Produces: `obj = {flag: {x, y, by}, score: {red, blue}}` (score는 소수, 화면엔 `Math.floor`).
- **방장 계산** `objTick()` — `setInterval(objTick, 200)`, 방장이고 `phase() === 'play'`이고 `match.mode`가 flag/zone일 때만. `dt = min(2, 실제 지난 초)`. 사람 목록 = 나 + `others()` (`{id, x, y, dead, team}`).
  - 깃발을 든 사람이 목록에 없거나 `dead`면 → 마지막 위치(없으면 지금 깃발 자리)에 `by: null`.
  - `by` 있으면 깃발 x·y = 든 사람 위치, 그 팀 `score += flagRate(지난 시간, len) * dt`. `by` 없으면 `flagPickup(flag, people, 60)`.
  - `publishObj(obj)`.
- 대결 시작(`startMatch`, flag 모드): 방장이 `obj = {flag: {x: MAP.flag.x, y: MAP.flag.y, by: null}, score: {red: 0, blue: 0}}`를 먼저 올림. 연습으로 돌아가면 `publishObj(null)`.
- 방장이 바뀌면 새 방장은 마지막으로 받은 `obj`부터 이어서 계산.
- **그리기:** 깃발 = 막대 + 팀 색 천(바닥에 있으면 흰색 + 위아래로 둥실), 든 사람 머리 위에 (은신이어도 그림 — `drawRemote`의 숨김과 상관없이 따로 그리기). 위쪽 점수판: 빨강 점수 · 남은 시간 · 파랑 점수 + 지금 배수 "×1/×2/×3"(바뀔 때 알림 `🚩 이제 1초에 ${n}점!`). 작은 지도에 깃발 점(노랑 테두리). 깃발 줍기/떨어짐 알림 피드.
- **결과:** 끝나면 `obj.score` 정수로 비교 → 승리 팀/무승부. 결과 제목 아래 점수 `빨강 N : M 파랑`.

- [ ] **Step 1: 구현.**
- [ ] **Step 2: 탭 두 개로 확인** (대결 시간 2분, 테스트용으로 `__magic.startMatch`와 서버 시계를 그대로 씀): 빨강 탭이 깃발로 걸어가면 두 탭 모두 `obj.flag.by`가 빨강 pid, 빨강 점수가 1초에 약 1씩 오름; 파랑이 빨강을 쓰러뜨리면 깃발이 그 자리에 떨어지고 점수가 멈춤; 같은 팀(빨강)도 다시 주울 수 있음; 은신한 레이브가 들어도 상대 탭에 깃발이 보임; **방장 탭을 닫으면** 남은 탭이 방장이 되고 점수·깃발이 이어짐; **깃발 든 탭을 닫으면** 깃발이 마지막 자리에 떨어짐; 시간이 끝나면 결과가 두 탭에 같게 나옴.
- [ ] **Step 3: 커밋** — `git commit -m "Forest Brawl: flag mode"`

### Task 5: 점령전

**Files:**
- Modify: `magic.js`

**Interfaces:**
- Consumes: Task 1 `newZone`, `zoneStep`, `zoneWinner`; Task 4 `objTick` 틀.
- Produces: `obj = {zones: [zone, zone, zone]}` (`MAP.zones` 순서: 왼쪽·가운데·오른쪽).
- **방장 계산** (`objTick` 안, zone 모드): 구역마다 `nRed`/`nBlue` = 구역 안(`dist <= r`)의 **살아 있는** 사람 수 (은신 중인 사람도 셈) → `zoneStep(z, nRed, nBlue, dt, ZONE_RATE)`. 1턴 완료·뺏김·완전 점령·전쟁 시작은 알림 피드로 (방장이 `send({k: 'zmsg', ...})`로 모두에게). `zoneWinner`가 팀을 돌려주면 `endMatch(팀)`.
- 대결 시작(zone 모드): `endAt` 없이 `match` 생성, 방장이 `obj = {zones: [newZone() x3]}` 올림. 시간 고르기 숨김.
- **그리기:** 구역 원(주인 팀 색 채움 20%, 없으면 흰색 10%), 둘레 고리 = 주인의 2턴 게이지(주인 없으면 앞선 팀의 1턴 게이지, 그 팀 색), 내가 서 있는 구역에서는 지금 차는 게이지와 "%"를 크게. `war`면 "⚔ 전쟁 중" 깜빡임, `lock`이면 굵은 테두리 + 🔒. 위쪽 점수판 = 시간 대신 구역 3칸(왼쪽·가운데·오른쪽, 색·%·🔒) + 각 팀 완전 점령 수 "🔒 1/2". 작은 지도에 구역 원 색.
- **결과:** `match.winner` → "구역 2곳 완전 점령!" + 이긴 팀.

- [ ] **Step 1: 구현.**
- [ ] **Step 2: 탭 두 개로 확인** (테스트 동안만 javascript_tool로 `ZONE_RATE`를 키울 수 있게 `__magic.zoneRate` 설정자를 둠): 빨강 혼자 왼쪽 구역 → 점령 완료 → 비워 둬도 2턴이 참; 파랑이 같이 들어오면 두 탭 모두 "전쟁 중"·게이지 멈춤; 파랑 혼자 들어오면 빨강 2턴 멈추고 파랑 1턴 참 → 뺏으면 파랑 색, 빨강 2턴 기록은 남음; 빨강이 2곳 완전 점령하면 두 탭에 "빨강 팀 승리"; 방장 탭을 닫아도 게이지가 이어짐.
- [ ] **Step 3: 커밋** — `git commit -m "Forest Brawl: capture-zone mode"`

### Task 6: 한 팀이 모두 나가면 끝 + 마무리 · 올리기

**Files:**
- Modify: `magic.js`, `magic.html`, `flip.html` (판 번호), `docs/캐릭터-스킬표.md` (모드 설명), `C:\Users\ilove\.claude\CLAUDE.md`

**Interfaces:**
- Consumes: Task 3 `endMatch`.
- 방장이 `phase() === 'play'`일 때 (모든 모드) 빨강 또는 파랑이 0명이 되면 `endMatch(남은 팀)`, 결과 제목 아래 "상대 팀이 모두 나갔어요".

- [ ] **Step 1: 구현 + 확인** — 탭 두 개로 대결 중 한 탭을 닫으면 남은 탭에 승리 결과.
- [ ] **Step 2: 판 번호 바꾸기** — `sed -i "s/20261119t/20261119u/g" magic.html flip.html`, `magic.html`에 `<script src="magic-maps.js?v=20261119u"></script>`가 `magic.js` 앞에 있는지.
- [ ] **Step 3: 테스트 페이지 다시** — `ALL PASS`.
- [ ] **Step 4: 문서** — `docs/캐릭터-스킬표.md`에 "대결 모드" 절 (세 모드 규칙, 넓은 맵), CLAUDE.md 프로젝트 메모 갱신.
- [ ] **Step 5: 커밋 + push + 실제 주소 확인** — `git push` 후 `https://minsoleo.github.io/lyric-typing/magic.html`이 `20261119u`를 담을 때까지 확인, 실제 주소에서 방 만들기 → 깃발쟁으로 바꾸기 → 넓은 맵 보이는 스크린샷.

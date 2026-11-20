# 숲속의 한바탕 효과음 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스킬 21개와 게임 흐름에 효과음을 넣고, 근처 친구·상대 소리도 거리에 따라 들리게 하고, 🔊 끄기·크기 조절을 넣는다.

**Architecture:** 소리 표 `magic-sounds.js`(이름 → 파일·크기·겹침 수·간격·높낮이) + 소리 엔진 `magic-sfx.js`(Web Audio, 미리 불러 두기, 못 불러오면 조용히). 거리·은신 계산은 `magic-logic.js`의 순수 함수. `magic.js`는 정해진 자리에서 `sfx(name, gain)`만 부르고, 스킬은 친구에게 `snd` 신호를 보낸다.

**Tech Stack:** 순수 JS, Web Audio API, Firebase Realtime DB(기존 이벤트 길), Kenney CC0 효과음(.ogg).

**Spec:** `docs/superpowers/specs/2026-11-20-sound-effects-design.md`

## Global Constraints
- 다른 게임 소리 금지 — **CC0(누구나 써도 되는) 소리만**. 쓴 묶음: Kenney Impact Sounds · RPG Audio · Sci-fi Sounds · Interface Sounds · Music Jingles (모두 CC0).
- 배경 음악·걸음 소리 없음.
- 소리를 못 불러와도 게임은 오류 없이 그대로 돈다.
- 장전 "우웅"·틀림 "띡"은 내 화면에서만 (보내지 않음).
- 다른 사람 스킬: 거리 ≤ 700 거의 그대로, 1600 이상 안 들림. 은신한 **상대**의 소리는 안 들림 (우리 팀은 들림).
- 타격음은 내가 때렸거나 내가 맞았을 때만.
- 게임 흐름 소리(3·2·1·시작·승패·깃발·점령)는 거리 무관, 모두 같은 크기.
- 파일을 고쳐 올릴 때 `magic.html`(·`flip.html`)의 `?v=` 판 번호를 바꾼다 (지금 20261120e → 20261120f).
- 테스트: `tests/magic-logic.test.html` (Node 실행기: 스크래치의 `run-tests.js`, 브라우저로도 열림).

## Review Focus
1. 소리 파일이 하나라도 404·해독 실패 → 나머지는 나고, 게임은 멈추지 않아야 함 (Task 2: 없는 파일 이름으로 `play` 해도 오류 없음 확인).
2. 검의 폭풍(0.25초마다)·칼바람 연타 → 소리가 도배되지 않아야 함 (Task 2: `max`·`gap` 테스트, Task 4: 한 대마다 작은 `swing`).
3. 처음 클릭 전 브라우저가 소리를 막음 → 캐릭터 고르기 클릭에서 `unlock()` 후 정상 (Task 4 브라우저 확인).
4. 파랑 팀 화면(뒤집힌 화면)에서 친구 소리 거리 계산 → `snd` 자리도 뒤집혀야 함 (Task 1: `flipEvent` 'snd').
5. 🔇 끈 상태로 새로고침 → 계속 꺼져 있어야 함 (Task 4 브라우저 확인, localStorage `magic.sfx`).

---

### Task 1: 소리 계산 함수

**Files:**
- Modify: `magic-logic.js` (내보내기에 추가), `tests/magic-logic.test.html`

**Interfaces:**
- Produces: `MagicLogic.hearGain(dist: number, hidden: boolean) -> number` (0~1). `MagicLogic.SOUND_NEAR = 700`, `SOUND_FAR = 1600`. `flipEvent`가 `{k:'snd', s, x, y}`의 x·y를 뒤집음.

- [ ] **Step 1: 실패하는 테스트**
```js
t('hearGain: 가까우면 그대로, 멀면 작게, 아주 멀거나 숨은 상대면 0', () =>
  L.hearGain(0, false) === 1 && L.hearGain(700, false) === 1 && Math.abs(L.hearGain(1150, false) - 0.5) < 1e-9
  && L.hearGain(1600, false) === 0 && L.hearGain(5000, false) === 0 && L.hearGain(100, true) === 0);
t('flipEvent: snd 자리도 뒤집음', () => { const e = L.flipEvent({k: 'snd', s: 'chain', x: 100, y: 50}, 'x', 1000, 600); return e.x === 900 && e.y === 50 && e.s === 'chain'; });
```
- [ ] **Step 2: 실행 → FAIL** (`L.hearGain is not a function`, snd x 100). Run: `node <scratch>/run-tests.js .`
- [ ] **Step 3: 구현** — 700 이하 1, 1600 이상 0, 사이는 직선으로 줄어듦. `flipEvent`의 x·y 뒤집는 종류에 `'snd'` 추가.
- [ ] **Step 4: 실행 → ALL PASS (87)**
- [ ] **Step 5: 커밋** `Forest Brawl: sound math (hearGain, snd flip)`

### Task 2: 소리 엔진 + 소리 표

**Files:**
- Create: `magic-sfx.js`, `magic-sounds.js`, `tests/magic-sfx.test.html`
- Modify: `magic.html` (두 스크립트를 `magic.js` 앞에, `?v=`)

**Interfaces:**
- `window.MAGIC_SOUNDS = {이름: {file: string | string[], vol?: 1, max?: 3, gap?: 0, vary?: 0.06}}` — `file`이 배열이면 동시에 겹쳐 냄. 이름 목록은 Task 3.
- `window.MagicSfx = {load(table, base, v) -> Promise, unlock(), play(name, gain=1) -> boolean, setVolume(0~1), setMuted(bool), get volume, get muted}`
- 순수 판단 `MagicSfx.allow(state, name, entry, now) -> boolean` (`state = {[name]: {last, playing}}`): `now - last < gap`이면 false, `playing >= max`이면 false.

- [ ] **Step 1: 실패하는 테스트** (`tests/magic-sfx.test.html`, 실행기와 같은 모양)
```js
t('allow: 간격', () => { const st = {a: {last: 1.0, playing: 0}}; return !MagicSfx.allow(st, 'a', {gap: 0.1}, 1.05) && MagicSfx.allow(st, 'a', {gap: 0.1}, 1.2); });
t('allow: 동시에 max개까지', () => { const st = {a: {last: 0, playing: 3}}; return !MagicSfx.allow(st, 'a', {max: 3}, 9) && MagicSfx.allow({}, 'a', {max: 3}, 9); });
t('play: 없는 이름·불러오기 전이면 false, 오류 없음', () => MagicSfx.play('없음') === false);
```
- [ ] **Step 2: 실행 → FAIL** (`MagicSfx is not defined`). 실행기에 `magic-sfx.js`를 넣어 돌리도록 인자 추가.
- [ ] **Step 3: 구현** — AudioContext는 `unlock()` 때 만들거나 resume. `load`는 파일마다 fetch+decodeAudioData, 실패는 건너뜀(콘솔 경고 한 줄). `play`: 꺼짐/없음/`allow` false면 false. 높낮이 `1 ± vary` 랜덤, 크기 = vol × gain × 전체 크기. 끝나면 playing −1. 전체 크기·꺼짐은 localStorage `magic.sfx` = `{v, m}` (try/catch), 처음 값 `{v: 0.6, m: false}`.
- [ ] **Step 4: 실행 → 3 pass**, `magic-logic` 테스트도 ALL PASS.
- [ ] **Step 5: 커밋** `Forest Brawl: sound engine and table`

### Task 3: 효과음 파일 고르기 (CC0 묶음, 받기 전 민솔님 허락)

**Files:**
- Create: `sfx/*.ogg` (쓰는 것만, 내 이름으로), `sfx/LICENSE.txt` (Kenney CC0, 묶음 이름)
- Modify: `magic-sounds.js`

**소리 이름 (모두 채움):**
- 평타: `basic-tank` · `basic-dealer` · `basic-healer`
- 스킬(스펠 id): `rockwall guard chain crash flurry legion` · `gale rush throat shadow oath stopworld` · `sprint spring spear flash bless sanctum`
- 흐름: `charge fail swing boom hit hurt block heal down respawn ultReady tick go win lose flagUp flagDown capture lock`
- 느낌: 가데온 묵직한 쇠·돌, 레이브 날카롭고 빠름, 세라 맑은 자연·빛. 궁극기 3개는 두 파일을 겹쳐 크고 길게(1.5~3초).

- [ ] **Step 1:** 5개 묶음 zip을 받아 스크래치에 풀고, 후보를 들어 볼 수 없으니 파일 이름·길이(초)로 고른다 — 길이는 `node`로 ogg 헤더에서 읽거나 브라우저 `decodeAudioData().duration`.
- [ ] **Step 2:** 고른 파일을 `sfx/<소리이름>.ogg`(겹치는 건 `-2`)로 복사, 표 채우기. `vol`·`gap`·`max`: `swing` gap 0.08·vol 0.35, `heal` gap 0.5, `tick` 매초 1번, 궁극기 vol 1.
- [ ] **Step 3: 확인** — 브라우저에서 `MagicSfx.load` 후 모든 이름이 버퍼를 가졌는지(`Object.keys(MAGIC_SOUNDS)`마다 불러옴 성공) → 실패 0개.
- [ ] **Step 4: 커밋** `Forest Brawl: CC0 sound files`

### Task 4: 게임에 연결 + 🔊 버튼

**Files:**
- Modify: `magic.js`, `magic.html`(버튼·막대·CSS)

**Interfaces:**
- Consumes: `MagicSfx.*`, `L.hearGain`, `MAGIC_SOUNDS`.
- Produces (magic.js 안): `sfx(name, gain=1)` (MagicSfx 없으면 아무것도 안 함), `sfxAt(name, x, y, fromId)` (내 캐릭터와 거리 → `hearGain`, 숨은 상대면 0), `skillSound(name)` = 내 화면 `sfx` + `send({k:'snd', s: name, x, y})`.

- [ ] **Step 1: 자리 연결**
  - 장전: `submitSpell`에서 장전 성공 → `sfx('charge')`. 틀림(`!sp`) → `sfx('fail')`.
  - 스킬: `castSpell` 맨 앞 → `skillSound(sp.id)`. 평타 `basicAttack` → `skillSound('basic-' + cls.id)`.
  - 연타: 검의 폭풍·칼바람의 두 번째 휘두르기부터 → `sfx('swing')` (보내지 않음). 파쇄 돌격 폭발 → `skillSound('boom')`.
  - 타격: `dealHit` got > 0 → `sfx('hit')`. `applyHit`에서 내가 맞음 → 방패로 줄었으면 `block`, 아니면 `hurt`. `healPlayer` got > 0 & !silent → `sfx('heal')`.
  - 쓰러짐/부활/궁극기 준비: 내 `deadUntil`이 생길 때 `down`, 풀릴 때 `respawn`, `gainUlt` 준비 완료 → `ultReady`.
  - 받기: `onNetEvent` `case 'snd'` → `sfxAt(ev.s, ev.x, ev.y, ev.f)`. 은신: 보낸 사람 `o.stealth && o.team !== 내 팀`이면 0.
  - 대결: 3·2·1 숫자가 바뀔 때 `tick`, 시작 `go`, 끝 → 내 팀 승리 `win`, 아니면 `lose`(무승부는 `win`).
  - 깃발: obj 받을 때마다 앞의 들고 있던 사람과 비교 → 새로 들면 `flagUp`, 놓치면 `flagDown`. 점령: 구역 주인이 생기면 `capture`, 🔒 되면 `lock`.
- [ ] **Step 2: 🔊 버튼** — 위 버튼 줄(🗺 맵 버튼 옆)에 `#sfxBtn`(🔊/🔇)과 `#sfxVol`(range 0~100). 캐릭터 고르기 클릭·첫 mousedown·keydown에서 `MagicSfx.unlock()`.
- [ ] **Step 3: 브라우저 확인** (창 두 개, 16ms 드라이버) — `MagicSfx.play`를 감싸 불린 이름·크기를 기록:
  - 내 스킬 21개 각각 소리 이름이 기록됨
  - 파랑 화면에서 빨강이 700 안에서 쓴 사슬 → gain 1, 1600 밖 → 소리 없음
  - 상대 레이브 은신 중 스킬 → 소리 없음, 같은 팀이면 남
  - 검의 폭풍 3초 → `flurry` 1번 + `swing` 몇 번, 같은 순간 겹침 없음
  - 🔇 → 아무 소리도 안 남, 새로고침해도 🔇
  - 1366×650 스크롤 없음
- [ ] **Step 4: 커밋** `Forest Brawl: sound effects in game`

### Task 5: 올리기와 정리
- [ ] `?v=` → 20261120f, 테스트 ALL PASS, 커밋·푸시, 사이트 반영 확인 (curl).
- [ ] `docs/캐릭터-스킬표.md`에 소리 한 단락, `docs/AI-부탁-효과음.md`는 민솔님이 바꿀 소리를 고른 뒤에 씀 (이번엔 만들지 않음).

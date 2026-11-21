# 성 맵 (점령전) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 🏳 점령전을 새 성 맵(6400×3800, 180도 대칭, 1층 출발 → 계단 → Ⓐ 2층 → 계단 → Ⓑ 3층)에서 하게 한다. 그림이 오기 전엔 코드로 그린 임시 성.

**Architecture:** 성 맵은 200px 칸 격자(`grid`, 32×19 글자)로 층을 적는다: `#` 성벽, `1` `2` `3` 층, `a` 1↔2 계단, `b` 2↔3 계단. 걷기·돌진·끌려오기는 `MagicLogic.floorMove`가 칸 사이 이동을 막고(같은 층 또는 계단으로만), 날아가는 공격은 막지 않는다. 높은 층 아래쪽 가장자리의 "성벽 면" 띠는 움직임만 막는 직사각형(`kind: 'cliff'`)으로 `WALLS`에 넣는다. 격자가 180도 대칭이라 파랑 팀('xy' 화면)도 같은 격자를 그대로 쓴다.

**Tech Stack:** 순수 JS + Canvas 2D, 테스트는 브라우저 테스트 페이지(`node run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-11-20-team-view-and-new-maps-design.md` (2. 점령전 성 맵, Ⓑ = 3층 확정 2026-11-21)

## Global Constraints
- 맵 6400 × 3800, 180도 돌리면 똑같음 (`sym: 'xy'`), 칸 200px.
- 오르내리기는 계단에서만. 낭떠러지는 걷기·돌진·끌려오기만 막고 공격은 통과. 높이에 따른 사거리·피해 차이 없음.
- Ⓑ 둘레는 평평한 3층 광장 (광장 안에 계단·낭떠러지 없음). 한 팀에 계단 2개(출발→Ⓐ, Ⓐ→Ⓑ), 계단 폭 1칸(200px ≈ 3~4명).
- 점령전 = 성 맵. 킬내기전 = 숲 맵, 깃발쟁 = 넓은 맵 그대로.
- 게임 파일을 고치면 `magic.html`·`flip.html`의 `?v=` 판 번호를 올린다.

## Review Focus
1. 빠른 돌진(초당 10장 노트북에서 한 장에 170px 이동)이 낭떠러지를 뚫고 지나가지 않아야 함 → `floorMove`가 40px씩 나눠 검사 (테스트: 1000px 한 번에 이동).
2. 목 긋기(순간 이동)로 다른 층에 내려앉거나 가장자리에 걸쳐도 그 뒤로 못 움직이게 갇히지 않아야 함 → 걸친 자리에서는 가운데 칸만 검사 (테스트: 걸친 자리에서 출발).
3. 파랑 팀 화면(180도)에서 출발·구역·낭떠러지가 빨강 화면과 똑같아야 함 → 격자 대칭 테스트 + 창 두 개 확인.
4. 출발에서 상대 출발·세 구역까지 계단으로 다 갈 수 있어야 함 → 격자 길 찾기 테스트.
5. 장애물·허수아비·구역이 계단을 막거나 층 경계에 걸치지 않아야 함 → 맵 데이터 테스트.

---

### Task 1: 층 이동 계산 (`magic-logic.js`)

**Files:** Modify `magic-logic.js`; Test `tests/magic-logic.test.html`

**Interfaces — Produces:**
- `cellAt(g, x, y) → string` — `g = {rows: string[], cell: number}`, 바깥은 `'#'`
- `canPass(a, b) → boolean` — 같은 글자면 true(단 `#` 제외), 계단 `a`(1.5)·`b`(2.5)는 높이 차 0.5인 칸과 통함
- `floorMove(g, from, to, r) → {x, y}` — 40px(`cell/5`)씩 나눠 이동, 막히면 x만/y만 미끄러짐, 출발 자리가 걸쳐 있으면 가운데 칸만 검사, 출발 칸이 `#`면 `to` 그대로
- `cliffRects(g, h) → [{x, y, w, h, kind: 'cliff'}]` — 위 칸이 `#`이거나 더 높은(못 통하는) 칸인 걸을 수 있는 칸의 위쪽 h 띠

- [ ] 테스트: cellAt(안·바깥), canPass 표(1↔a↔2↔b↔3, 1↔2 ✗, a↔b ✗, #), floorMove(벽에 막힘 / 가장자리 따라 미끄러짐 / 계단으로 올라감 / 1000px 한 번에도 안 뚫음 / 걸친 자리에서 빠져나옴), cliffRects(작은 격자에서 개수·자리)
- [ ] 실패 확인 → 구현 → 통과 → 커밋

### Task 2: 성 맵 데이터 (`magic-maps.js`)

**Files:** Modify `magic-maps.js`; Create `tests/magic-maps.test.html`

**Interfaces — Produces:** `MAGIC_MAPS.castle = {id: 'castle', name: '성 맵', W: 6400, H: 3800, sym: 'xy', cell: 200, grid: [19줄 × 32글자], left: [장애물 절반 — 나머지는 180도로], center: [], path: [], spawn: {solo/red: (800,3400), blue: (5600,400)}, dummies: [[1000,1700],[5400,2100],[3200,1400]], decorSeed, decorCount: 0, flag: null, zones: [Ⓐ(1300,2300,r240,'red'), Ⓑ(3200,1900,r280,'mid'), Ⓒ(5100,1500,r240,'blue')]}`. 장애물 kind: `pillar` `statue` `crate`.

격자 (빨강 쪽 아래 절반, 위 절반은 180도):
- 15~18줄: 0~7칸 `1`(출발), 나머지 `#`
- 14줄: 0~15칸 `2`(4칸 `a`), 16~31 `#` / 13줄: 0~15칸 `2`(14칸 `b`), 16~31 `#`
- 10~12줄: 0~11 `2`, 12~19 `3`(Ⓑ), 20~29 `2`, 30~31 `#` / 9줄: 0~1 `#`, 2~11 `2`, 12~19 `3`, 20~29 `2`, 30~31 `#`

- [ ] 테스트: 32×19·허용 글자, 180도 대칭, 출발·구역·허수아비가 걸을 수 있는 칸, 구역 원이 한 층 안, 장애물(180도로 만든 것 포함)이 계단·구역과 안 겹침, 빨강 출발에서 파랑 출발·세 구역까지 길이 있음, 계단 `a`·`b` 각 2칸
- [ ] 실패 확인 → 데이터 → 통과 → 커밋

### Task 3: 게임에 연결 (`magic.js`)

**Files:** Modify `magic.js`

**Interfaces — Consumes:** Task 1 함수, Task 2 `castle`.
- `loadMap`: `sym: 'xy'`면 장애물 절반을 180도로, `GRID`(격자 있으면 `{rows, cell}`), `WALLS`에 `cliffRects(GRID, FACE_H=60)` 추가, `path`가 비면 흙길 안 그림
- `levelMove(from, to, r)` = GRID 있으면 `L.floorMove`, 없으면 `to` → 걷기·돌진·끌려가기(나·허수아비)·허수아비 좌우 걷기에 적용. 목 긋기 착지가 `#`이면 상대 자리로
- `propOf`는 나무·바위만, `MODE_MAP.zone = 'castle'`, 혼자 연습 맵 버튼 숲 → 넓은 → 성 순서(글자는 `🗺 ${MAP.name}`)

- [ ] 브라우저: 성 맵에서 낭떠러지에 막힘·계단으로 오르내림·돌진이 안 뚫음·공격은 넘어감·혼자/온라인 맵 바뀜 → 커밋

### Task 4: 임시 성 그리기 + 작은 지도

**Files:** Modify `magic.js`
- `drawCastle()`(화면에 보이는 칸만): 층마다 돌바닥 색(높을수록 밝게)·돌 줄눈, `#`는 어두운 성벽 윗면 + 톱니, 계단은 가로 단, 높은 칸 아래쪽 성벽 면(벽돌 무늬 띠, `cliffRects`와 같은 자리), 옆 낭떠러지는 어두운 세로 줄 + 위쪽 테두리 밝은 줄
- 장애물 `pillar`(돌기둥) `statue`(석상) `crate`(나무 상자) 코드 그림
- `buildMinimap`: 격자면 칸 색으로 그림

- [ ] 브라우저: 스크린샷으로 높이·계단이 보이는지, 1366×650 스크롤 없음, 작은 지도 → 커밋

### Task 5: 창 두 개 확인 · 올리기 · 기록
- [ ] 방장(빨강)·친구(파랑) 점령전: 둘 다 왼쪽 아래 출발, 구역 이름 우리 쪽/가운데/상대 쪽, 서로 위치가 맞게 보임
- [ ] `?v=` 올리고 push, 실제 주소 확인, `docs/캐릭터-스킬표.md` 점령전 칸·CLAUDE.md 기록

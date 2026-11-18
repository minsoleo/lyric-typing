# 주문 대결 1단계(혼자 연습판) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 허수아비를 상대로 클릭 이동·우클릭 평타·주문 타자를 연습하는 탑뷰 마법 게임 페이지.

**Architecture:** `magic-spells.js`(주문 이름·수치 표 — 민솔님이 나중에 이름을 바꿀 곳) + `magic-logic.js`(순수 계산, 테스트 대상) + `magic.js`(게임 루프·캔버스 그리기·입력) + `magic.html`. 게임 상태와 그리기를 나눠 2단계 온라인에서 상태만 주고받을 수 있게 함.

**Tech Stack:** HTML Canvas 2D, 바닐라 JS, GitHub Pages. 외부 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-18-spell-duel-design.md`

## Global Constraints
- 세계 크기 1600x900 (논리 좌표), 캔버스는 화면에 맞게 비율 유지 축소
- 1366x650에서 스크롤 없음
- 키보드 입력은 숨은 입력 칸 하나가 항상 받음, 캔버스 mousedown은 preventDefault (입력 칸 포커스 유지)
- 오른쪽 클릭 메뉴(contextmenu) 막기
- 주문 이름은 `magic-spells.js` 한 곳에만 (다른 파일에 이름 문자열 금지)
- 테마 `lyricTyping.theme` 공유

## Review Focus
- 한글 조합 중 Enter → 조합 끝난 뒤 주문 판정 (Task 3: compositionend 대기)
- 주문 치는 중 화면 클릭 → 입력 칸 글자가 유지됨 (Task 3)
- 공백·NFC 차이("얼음  감옥") → 같은 주문으로 인정 (Task 1 `findSpell` 테스트)
- 장애물 안으로 순간 이동 → 바깥으로 밀려남 (Task 1 `pushOut` 테스트)
- 방패가 있을 때 피해 → 방패 먼저 깎임 (Task 1 `applyDamage` 테스트)

---

### Task 1: 주문 표 + 순수 계산 + 테스트
**Files:** Create `magic-spells.js`, `magic-logic.js`, `tests/magic-logic.test.html`
**Produces (`window.MagicLogic`):**
- `norm(s): string`
- `findSpell(spells, typed): spell | null` — norm 일치
- `cooldownLeft(lastAt: number|undefined, cd: number, now: number): number` (초, 0 이상)
- `moveToward(p:{x,y}, t:{x,y}, step:number): {x,y,arrived:boolean}`
- `clampReach(from, to, max): {x,y}`
- `pushOut(p:{x,y}, r, rects): {x,y}` — 원이 사각형과 겹치면 밖으로
- `pointInRects(x, y, pad, rects): boolean`
- `applyDamage(e:{hp, shield, shieldUntil}, dmg, now): {hp, shield, absorbed}`
- `clampToWorld(p, r, W, H)`
**`window.MAGIC_SPELLS`**: `[{id, name, cd, desc}]` 7개 + `MAGIC_BASIC` (평타 수치)
- [ ] 테스트 작성 → 실패 확인 → 구현 → 통과 → Commit

### Task 2: 페이지 뼈대 + 캔버스 맞추기 + 맵 그리기
**Files:** Create `magic.html`, `magic.js`
- 위: 제목·테마·돌아가기 / 가운데: 캔버스 / 오른쪽: 주문책 / 아래: 체력·주문 칸·허수아비 모드
- [ ] 1366x650에서 스크롤 없음 확인 → Commit

### Task 3: 조작 (이동·평타·주문 입력)
- 왼쪽 누르고 있으면 목표 갱신, 오른쪽 = 평타(0.6초), Enter = 주문, Esc = 지우기, 틀리면 0.8초 잠김
- [ ] 창에서 직접 클릭·타자로 확인 → Commit

### Task 4: 주문 7개 효과 + 허수아비 + 피해 숫자 + 기록
- 허수아비 쓰러지면 3초 뒤 부활, 가만히/좌우 이동
- [ ] 주문마다 한 번씩 써서 효과 확인 → Commit → push → 인터넷 주소 확인

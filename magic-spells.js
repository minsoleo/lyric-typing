/* 주문 대결 — 주문 표
   ★ 주문 이름을 바꾸고 싶으면 여기 name만 고치면 돼요. (id는 그대로 두기)
   cd = 다시 쓸 수 있을 때까지 걸리는 시간(초), 나머지 숫자는 효과 세기 */
window.MAGIC_SPELLS = [
  {id: 'fire',    name: '불꽃',                   cd: 1.5, desc: '불덩이 발사 · 피해 12',            dmg: 12, speed: 700, radius: 11, range: 950},
  {id: 'ice',     name: '얼음 감옥',               cd: 6,   desc: '맞으면 1.5초 얼어붙음 · 피해 6',    dmg: 6,  speed: 600, radius: 13, range: 900, freeze: 1.5},
  {id: 'blink',   name: '순간 이동',               cd: 8,   desc: '마우스 쪽으로 휙 이동',             reach: 320},
  {id: 'shield',  name: '마법 방패',               cd: 10,  desc: '3초 동안 피해 30까지 막음',         amount: 30, time: 3},
  {id: 'heal',    name: '치유의 빛',               cd: 12,  desc: '체력 25 회복',                     heal: 25},
  {id: 'wind',    name: '바람의 칼날',             cd: 4,   desc: '뚫고 지나가는 칼날 · 피해 18',      dmg: 18, speed: 900, radius: 17, range: 1000, pierce: true},
  {id: 'thunder', name: '하늘을 가르는 천둥 번개', cd: 15,  desc: '0.7초 뒤 넓은 번개 · 피해 45',      dmg: 45, delay: 0.7, area: 110}
];

/* 오른쪽 클릭 평타 */
window.MAGIC_BASIC = {cd: 0.6, dmg: 8, speed: 650, radius: 7, range: 430};

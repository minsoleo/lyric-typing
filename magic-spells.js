/* 주문 대결 — 주문 표
   ★ 주문 이름을 바꾸고 싶으면 여기 name만 고치면 돼요. (id는 그대로 두기)
   cd = 쓴 뒤 다시 쓸 수 있을 때까지 걸리는 시간(초), 나머지 숫자는 효과 세기
   color = 장전됐을 때 빛나는 색 */
window.MAGIC_SPELLS = [
  {id: 'fire',    name: '불꽃',                   cd: 1.5, desc: '불덩이 발사 · 피해 12',            color: '#ff9a3d', dmg: 12, speed: 520, radius: 11, range: 900},
  {id: 'ice',     name: '얼음 감옥',               cd: 6,   desc: '맞으면 1.5초 얼어붙음 · 피해 6',    color: '#8fe3ff', dmg: 6,  speed: 450, radius: 13, range: 850, freeze: 1.5},
  {id: 'blink',   name: '순간 이동',               cd: 8,   desc: '마우스 쪽으로 휙 이동',             color: '#d6c2ff', reach: 320},
  {id: 'shield',  name: '마법 방패',               cd: 10,  desc: '3초 동안 피해 30까지 막음',         color: '#5fe1ff', amount: 30, time: 3},
  {id: 'heal',    name: '치유의 빛',               cd: 12,  desc: '체력 25 회복',                     color: '#7dffa8', heal: 25},
  {id: 'wind',    name: '바람의 칼날',             cd: 4,   desc: '뚫고 지나가는 칼날 · 피해 18',      color: '#d9fff0', dmg: 18, speed: 680, radius: 17, range: 950, pierce: true},
  {id: 'thunder', name: '하늘을 가르는 천둥 번개', cd: 15,  desc: '0.7초 뒤 넓은 번개 · 피해 45',      color: '#fff07a', dmg: 45, delay: 0.7, area: 110}
];

/* 오른쪽 클릭 평타 (장전된 주문이 없을 때) */
window.MAGIC_BASIC = {cd: 0.6, dmg: 8, speed: 500, radius: 7, range: 430};

/* 장전: 주문을 치고 Enter → 이 시간 안에 오른쪽 클릭으로 써야 함 (안 쓰면 흩어짐) */
window.MAGIC_CHARGE_TIME = 5;

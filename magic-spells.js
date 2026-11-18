/* 주문 대결 — 캐릭터(역할)와 주문 표
   ★ 캐릭터 이름, 주문 이름을 바꾸고 싶으면 여기 name만 고치면 돼요. (id는 그대로 두기)
   주문 type: shot(날아가는 마법) · dash(돌진) · blink(순간 이동) · shield(방패) · heal(회복)
              nova(내 주변 넓게) · zone(바닥에 회복 샘) · zap(잠깐 뒤 떨어지는 넓은 마법)
   cd = 쓴 뒤 다시 쓸 수 있을 때까지(초), color = 장전됐을 때 빛나는 색, look = 날아가는 모양 */
window.MAGIC_CLASSES = [
  {
    id: 'tank', role: '탱커', name: '바위 마법사', color: '#f08a24', hat: '#a8520c', hp: 160, speed: 165, r: 26,
    about: '튼튼하고 느려요. 앞에서 막고 적을 묶어요.',
    basic: {cd: 0.9, dmg: 12, speed: 420, radius: 11, range: 230, look: 'rock'},
    spells: [
      {id: 'punch',  type: 'shot',   name: '바위 주먹',                     cd: 2,  desc: '묵직한 바위 · 피해 14',           color: '#d9a066', look: 'rock',  dmg: 14, speed: 480, radius: 15, range: 380},
      {id: 'charge', type: 'dash',   name: '돌진',                          cd: 6,  desc: '앞으로 돌진 · 부딪히면 피해 12',  color: '#ffb36b', reach: 300, dmg: 12},
      {id: 'jail',   type: 'shot',   name: '바위 감옥',                     cd: 7,  desc: '맞으면 1.5초 묶임 · 피해 8',      color: '#c9b08a', look: 'rock',  dmg: 8,  speed: 420, radius: 16, range: 700, freeze: 1.5},
      {id: 'wall',   type: 'shield', name: '강철 방패',                     cd: 11, desc: '4초 동안 피해 60까지 막음',       color: '#9fd3ff', amount: 60, time: 4},
      {id: 'quake',  type: 'nova',   name: '땅을 뒤흔드는 거대한 지진',     cd: 16, desc: '내 주변 넓게 · 피해 30 · 1초 묶임', color: '#ffcf6b', area: 200, dmg: 30, freeze: 1}
    ]
  },
  {
    id: 'dealer', role: '딜러', name: '불꽃 마법사', color: '#7d4dff', hat: '#4b2bb3', hp: 100, speed: 185, r: 22,
    about: '피해를 가장 많이 줘요. 대신 몸이 약해요.',
    basic: {cd: 0.6, dmg: 8, speed: 500, radius: 7, range: 430, look: 'basic'},
    spells: [
      {id: 'fire',    type: 'shot',  name: '불꽃',                   cd: 1.5, desc: '불덩이 발사 · 피해 12',         color: '#ff9a3d', look: 'fire', dmg: 12, speed: 520, radius: 11, range: 900},
      {id: 'ice',     type: 'shot',  name: '얼음 감옥',               cd: 6,   desc: '맞으면 1.5초 얼어붙음 · 피해 6', color: '#8fe3ff', look: 'ice',  dmg: 6,  speed: 450, radius: 13, range: 850, freeze: 1.5},
      {id: 'wind',    type: 'shot',  name: '바람의 칼날',             cd: 4,   desc: '뚫고 지나감 · 피해 18',          color: '#d9fff0', look: 'wind', dmg: 18, speed: 680, radius: 17, range: 950, pierce: true},
      {id: 'blink',   type: 'blink', name: '순간 이동',               cd: 8,   desc: '마우스 쪽으로 휙 이동',          color: '#d6c2ff', reach: 320},
      {id: 'thunder', type: 'zap',   name: '하늘을 가르는 천둥 번개', cd: 15,  desc: '0.7초 뒤 넓은 번개 · 피해 45',   color: '#fff07a', delay: 0.7, area: 110, dmg: 45}
    ]
  },
  {
    id: 'healer', role: '힐러', name: '빛의 마법사', color: '#2fbf71', hat: '#1b7a47', hp: 90, speed: 195, r: 21,
    about: '나와 팀을 회복시켜요. 공격은 약해요.',
    basic: {cd: 0.7, dmg: 6, speed: 520, radius: 7, range: 400, look: 'light'},
    spells: [
      {id: 'orb',    type: 'shot',   name: '빛의 구슬',                     cd: 1.2, desc: '빛 구슬 · 피해 9',                     color: '#fff6b0', look: 'light', dmg: 9, speed: 560, radius: 10, range: 750},
      {id: 'heal',   type: 'heal',   name: '치유의 빛',                     cd: 8,   desc: '체력 25 회복',                         color: '#7dffa8', heal: 25},
      {id: 'spring', type: 'zone',   name: '생명의 샘',                     cd: 14,  desc: '바닥에 5초 동안 회복 샘 · 체력 30',     color: '#5cf0b0', reach: 500, area: 120, heal: 30, time: 5},
      {id: 'bless',  type: 'shield', name: '수호의 축복',                   cd: 10,  desc: '3초 동안 피해 30까지 막음',            color: '#bff7ff', amount: 30, time: 3},
      {id: 'angel',  type: 'zap',    name: '하늘에서 내려오는 천사의 빛',   cd: 18,  desc: '0.6초 뒤 넓은 빛 · 적 피해 22 · 나 회복 35', color: '#fffbd0', delay: 0.6, area: 140, dmg: 22, heal: 35}
    ]
  }
];

/* 장전: 주문을 치고 Enter → 이 시간 안에 오른쪽 클릭으로 써야 함 (안 쓰면 흩어짐) */
window.MAGIC_CHARGE_TIME = 5;

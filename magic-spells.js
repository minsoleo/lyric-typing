/* 숲속의 한바탕 — 캐릭터와 스킬 표 (정리본: docs/캐릭터-스킬표.md)
   ★ 캐릭터·스킬 이름을 바꾸고 싶으면 여기 name만 고치면 돼요. (id는 그대로 두기)
   스킬 type:
     shot      날아가는 공격 (pull: 맞으면 끌어옴)
     dash      돌진 (dmg: 지나가며 피해, boom: 멈춘 자리에서 폭발, healAll: 아군 모두 회복)
     slash     swing초 동안 every초마다 앞을 베고(한 번에 dmg), 다 휘두르면 뒤로 물러남
     wall      바위벽 세우기 (적이 쏜 공격을 막음)
     flurry    정해진 시간 동안 주먹 연타
     buff      나(와 아군)를 강하게 (fx 목록)
     stealth   투명해지고 빨라짐 (instant: 장전 없이 Enter만 쳐도 바로)
     leap      가리킨 적 등 뒤로 순간 이동 + 피해 (screen: 화면 안이면 거리 상관없음)
     stun      가리킨 적 기절
     zone      바닥에 회복 샘
     slowfield 나를 따라다니는 넓은 범위: 안에 들어온 적은 느려짐 + 나 강해짐 (time 동안 유지)
     sanctum   성역: 아군 회복 + 적 피해·나약함
   ally: 'one' = 가장 가까운 아군 한 명에게 (근처에 없으면 나) · 'near' = 나 + 주변 아군 모두
   fx kind: atk(주는 피해 +) · def(받는 피해 −) · speed(이동 속도 +) · basic(평타 피해 +) · reach(근접 공격 거리 +)
   cd = 쓴 뒤 다시 쓸 수 있을 때까지(초), color = 장전됐을 때 빛나는 색, look = 날아가는 모양
   궁극기(ult)는 대기 시간 대신 게이지(MAGIC_ULT)가 가득 차야 쓸 수 있음
   ★ 스킬을 쓰는 동안(지속 시간)은 다른 스킬을 치거나 장전할 수 없음 (그림자 은신만 예외)
     지속 시간 = time (돌진은 달리는 동안, 칼바람은 휘두르는 동안). 따로 정하고 싶으면 busy: 초 를 적으면 됨 */
window.MAGIC_CLASSES = [
  {
    id: 'tank', role: '탱커', name: '가데온', title: '강철 수호자', icon: '🛡', color: '#f08a24', dark: '#8a4a12', hp: 160, speed: 165, r: 26,
    about: '검과 방패를 든 기사. 아군을 지키며 맨 앞에서 싸워요. 튼튼하고 느려요.',
    basic: {name: '강철 베기', melee: true, cd: 0.9, dmg: 12, reach: 120, arc: 120},
    spells: [
      {id: 'rockwall', type: 'wall',   name: '바위벽',     cd: 10, desc: '5초 동안 적의 공격을 막는 벽',     color: '#c9b08a', dist: 95, length: 230, time: 5},
      {id: 'guard',    type: 'buff',   name: '수호의 방패', cd: 12, desc: '8초 동안 받는 피해 40% 감소',      color: '#9fd3ff', time: 8, ally: 'one', fx: [{kind: 'def', value: 0.4}]},
      {id: 'chain',    type: 'shot',   name: '강철 사슬',   cd: 9,  desc: '맞은 적을 끌어옴 · 피해 10',       color: '#cfd6e6', look: 'chain', dmg: 10, speed: 1400, radius: 12, range: 650, pull: true},
      {id: 'crash',    type: 'dash',   name: '파쇄 돌격',   cd: 8,  desc: '멀리 돌진 후 폭발 · 피해 20',      color: '#ffb36b', reach: 460, dmg: 0, boom: {area: 130, dmg: 20}},
      {id: 'flurry',   type: 'flurry', name: '검의 폭풍',   cd: 14, desc: '3초 동안 검 연타 · 한 대에 5',     color: '#ffcf6b', time: 3, every: 0.25, dmg: 5, reach: 110, arc: 120}
    ],
    ult: {id: 'legion', type: 'buff', name: '꺾이지 않는 강철 군단의 함성', desc: '8초 동안 받는 피해 −50% · 공격 거리 +50% · 공격력 +30% · 속도 +25% · 평타 2배', color: '#ffd84a', time: 8, ally: 'near',
      fx: [{kind: 'def', value: 0.5}, {kind: 'reach', value: 0.5}, {kind: 'atk', value: 0.3}, {kind: 'speed', value: 0.25}, {kind: 'basic', value: 1}]}
  },
  {
    id: 'dealer', role: '딜러', name: '레이브', title: '그림자 칼잡이', icon: '🗡', color: '#7d4dff', dark: '#3d2296', hp: 100, speed: 190, r: 22,
    about: '양손에 단검을 든 날쌘 전사. 피해를 가장 많이 주지만 몸이 약해요.',
    basic: {name: '단검 베기', melee: true, cd: 0.25, dmg: 9, reach: 72, arc: 100},
    spells: [
      {id: 'gale',   type: 'slash',   name: '칼바람',     cd: 6,  desc: '1.5초 동안 3번 휘두름(8씩) 후 물러남', color: '#d9c8ff', swing: 1.5, every: 0.5, dmg: 8, reach: 130, arc: 130, back: 190},
      {id: 'rush',   type: 'dash',    name: '질풍 베기',   cd: 8,  desc: '멀리 달려가며 지나간 적 모두 피해 22', color: '#b9a3ff', reach: 520, dmg: 22, wide: 34},
      {id: 'throat', type: 'leap',    name: '목 긋기',     cd: 10, desc: '화면 안 가리킨 적 등 뒤로 · 피해 22',  color: '#ff6b8b', screen: true, dmg: 22},
      {id: 'shadow', type: 'stealth', name: '그림자 은신', cd: 16, desc: 'Enter만 쳐도 바로! 15초 투명 · 속도 2배', color: '#8f86b8', instant: true, time: 15, fx: [{kind: 'speed', value: 1}]},
      {id: 'oath',   type: 'buff',    name: '칼끝의 맹세', cd: 14, desc: '6초 동안 공격력 +40%',                 color: '#ff9ad5', time: 6, ally: 'near', fx: [{kind: 'atk', value: 0.4}]}
    ],
    ult: {id: 'stopworld', type: 'slowfield', name: '멈춰 버린 세계를 가르는 칼날', desc: '12초 동안 나를 따라다니는 넓은 범위 · 안의 적 느려짐 · 나 속도 +30% · 피해 +40%', color: '#c7b8ff', time: 12, area: 650, slow: 0.5,
      fx: [{kind: 'speed', value: 0.3}, {kind: 'atk', value: 0.4}]}
  },
  {
    id: 'healer', role: '힐러', name: '세라', title: '덩굴 요정', icon: '🏹', color: '#2fbf71', dark: '#1b6e42', hp: 90, speed: 200, r: 21,
    about: '덩굴 활을 든 숲의 요정. 가장 빠르고 아군을 회복시켜요.',
    basic: {name: '덩굴 화살', cd: 0.7, dmg: 6, speed: 580, radius: 7, range: 460, look: 'arrow', allyHeal: 5},
    spells: [
      {id: 'sprint', type: 'dash',   name: '질주',       cd: 10, desc: '앞으로 달려감 · 아군 모두 체력 15 회복', color: '#9dffb0', reach: 260, dmg: 0, healAll: 15},
      {id: 'spring', type: 'zone',   name: '생명의 샘',   cd: 14, desc: '바닥에 7초 동안 회복 샘 · 체력 42',     color: '#5cf0b0', reach: 500, area: 120, heal: 42, time: 7},
      {id: 'spear',  type: 'shot',   name: '빛의 창',     cd: 3,  desc: '빛의 창을 던짐 · 피해 20',               color: '#fff6b0', look: 'spear', dmg: 20, speed: 660, radius: 10, range: 800},
      {id: 'flash',  type: 'stun',   name: '숲속의 섬광', cd: 12, desc: '가리킨 적 2.5초 기절',                   color: '#fffbd0', reach: 650, time: 2.5},
      {id: 'bless',  type: 'buff',   name: '수호의 축복', cd: 12, desc: '체력 20 회복 · 5초 동안 받는 피해 30% 감소', color: '#bff7ff', heal: 20, time: 5, ally: 'one', fx: [{kind: 'def', value: 0.3}]}
    ],
    ult: {id: 'sanctum', type: 'sanctum', name: '모든 어둠을 몰아내는 새벽의 성역', desc: '10초 동안 넓은 성역 · 아군 회복 80 · 적 피해 50 + 나약함', color: '#fff0a0', reach: 500, area: 320, time: 10, heal: 80, dmg: 50, weak: 0.3}
  }
];

/* 장전: 스킬을 치고 Enter → 이 시간 안에 오른쪽 클릭으로 써야 함 (안 쓰면 흩어짐) */
window.MAGIC_CHARGE_TIME = 5;

/* 궁극기 게이지: need만큼 차면 궁극기를 쓸 수 있음. 아래 숫자만큼 차오름
   idle: 가만히 있어도 1초마다 · spellDmg: 스킬로 준 피해 1마다 · basicDmg: 평타로 준 피해 1마다
   heal: 회복 1마다 · taken: 받은 피해 1마다 · typed: 스킬 이름을 맞게 칠 때마다 */
window.MAGIC_ULT = {need: 100, idle: 1, spellDmg: 0.5, basicDmg: 0.3, heal: 0.3, taken: 0.2, typed: 3};

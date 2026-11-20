/* 숲속의 한바탕 — 🔊 소리 표
   소리를 바꾸고 싶으면 그 줄의 file만 바꾸면 돼요 (파일은 sfx/ 폴더).
   file: 파일 하나, 또는 [여러 개] = 동시에 겹쳐서 냄
   vol: 크기(0~1) · rate: 빠르기(높낮이, 1 = 그대로) · len: 이 초에서 끊음
   mix / rates / at: 겹친 파일마다 크기 / 빠르기 / 늦게 시작(초)
   max: 동시에 몇 개까지 · gap: 같은 소리 최소 간격(초) · vary: 높낮이를 조금씩 흔듦
   지금 소리는 모두 Kenney(www.kenney.nl)의 CC0 효과음이에요 (누구나 무료로 쓸 수 있음). */
window.MAGIC_SOUNDS = {
  /* 🛡 가데온: 묵직한 쇠·돌 */
  'basic-tank': {file: ['chop.ogg', 'impactMetal_light_000.ogg'], rate: 0.85, mix: [1, 0.4], vol: 0.85},
  rockwall:     {file: ['impactMining_001.ogg', 'lowFrequency_explosion_001.ogg'], mix: [1, 0.7], len: 1.0},
  guard:        {file: ['forceField_001.ogg', 'impactPlate_heavy_000.ogg'], mix: [0.8, 0.6]},
  chain:        {file: ['handleCoins.ogg', 'metalLatch.ogg'], rates: [0.8, 1], mix: [1, 0.8]},
  crash:        {file: 'thrusterFire_000.ogg', rate: 1.2, len: 0.5, vol: 0.7},
  flurry:       {file: ['knifeSlice.ogg', 'impactMetal_light_001.ogg'], mix: [1, 0.5]},
  legion:       {file: ['impactBell_heavy_000.ogg', 'lowFrequency_explosion_000.ogg', 'explosionCrunch_002.ogg'], rates: [0.8, 1, 0.8], mix: [1, 0.8, 0.5], len: 2.2, vary: 0},

  /* 🗡 레이브: 날카롭고 빠른 칼·바람 */
  'basic-dealer': {file: 'knifeSlice2.ogg', rate: 1.3, len: 0.35, vol: 0.7},
  gale:         {file: ['cloth3.ogg', 'knifeSlice.ogg'], rates: [0.8, 1.2]},
  rush:         {file: ['thrusterFire_002.ogg', 'knifeSlice2.ogg'], rates: [1.6, 1], at: [0, 0.1], len: 0.6},
  throat:       {file: ['laserSmall_000.ogg', 'knifeSlice.ogg'], at: [0, 0.08], rate: 1.1},
  shadow:       {file: ['forceField_003.ogg', 'cloth4.ogg'], rates: [0.6, 1], mix: [0.7, 1]},
  oath:         {file: ['drawKnife1.ogg', 'impactBell_heavy_002.ogg'], rates: [1, 1.6], mix: [1, 0.35]},
  stopworld:    {file: ['impactBell_heavy_004.ogg', 'lowFrequency_explosion_000.ogg', 'forceField_000.ogg'], rates: [0.6, 1, 0.5], mix: [1, 0.7, 0.6], len: 2.5, vary: 0},

  /* 🏹 세라: 맑은 자연·빛 */
  'basic-healer': {file: ['pluck_002.ogg', 'cloth2.ogg'], rates: [0.9, 1.2], mix: [1, 0.4], vol: 0.8},
  sprint:       {file: ['cloth1.ogg', 'thrusterFire_001.ogg'], rates: [1.2, 1.8], mix: [1, 0.35], len: 0.5},
  spring:       {file: ['slime_000.ogg', 'glass_004.ogg'], mix: [0.8, 0.6]},
  spear:        {file: 'laserLarge_000.ogg', rate: 1.1},
  flash:        {file: ['impactGlass_light_000.ogg', 'forceField_002.ogg'], rates: [1, 1.6], mix: [1, 0.6], len: 0.7},
  bless:        {file: ['glass_002.ogg', 'bong_001.ogg', 'impactGlass_medium_000.ogg'], rates: [1, 1.2, 1.4], mix: [0.8, 0.8, 0.4]},
  sanctum:      {file: ['impactBell_heavy_001.ogg', 'forceField_000.ogg', 'maximize_006.ogg', 'glass_004.ogg'], rates: [1.4, 1.3, 1, 1], at: [0, 0, 0, 0.3], len: 2.4, vary: 0},

  /* 게임 흐름 */
  charge:   {file: 'maximize_003.ogg', vol: 0.5, vary: 0},             // 장전 (내 화면만)
  fail:     {file: 'error_004.ogg', vol: 0.6, vary: 0},               // 주문 틀림 (내 화면만)
  swing:    {file: 'knifeSlice2.ogg', rate: 1.3, len: 0.3, vol: 0.3, gap: 0.08},   // 연타 두 번째부터 작게
  boom:     {file: 'explosionCrunch_000.ogg'},                          // 파쇄 돌격 폭발
  hit:      {file: 'impactPunch_medium_000.ogg', vol: 0.7, max: 4, gap: 0.03},     // 내가 맞힘
  hurt:     {file: 'impactPunch_heavy_000.ogg', vol: 0.8},              // 내가 맞음
  block:    {file: 'impactMetal_light_002.ogg', vol: 0.8},              // 방패로 줄어든 피해
  heal:     {file: 'glass_004.ogg', vol: 0.35, gap: 0.6},               // 회복받음
  down:     {file: ['impactSoft_heavy_000.ogg', 'minimize_005.ogg'], vary: 0},
  respawn:  {file: ['maximize_008.ogg', 'forceField_004.ogg'], mix: [1, 0.4], len: 0.6, vary: 0},
  ultReady: {file: 'confirmation_004.ogg', vary: 0},
  tick:     {file: 'impactWood_light_000.ogg', vol: 0.8, vary: 0},      // 3·2·1
  go:       {file: ['impactBell_heavy_001.ogg', 'confirmation_003.ogg'], mix: [0.7, 1], vary: 0},
  win:      {file: 'jingles_NES00.ogg', vary: 0},
  lose:     {file: 'jingles_PIZZI07.ogg', vary: 0},
  flagUp:   {file: 'confirmation_002.ogg', vary: 0},
  flagDown: {file: 'drop_002.ogg', vary: 0},
  capture:  {file: 'maximize_004.ogg', vary: 0},
  lock:     {file: ['impactBell_heavy_003.ogg', 'confirmation_001.ogg'], mix: [0.8, 1], vary: 0}
};

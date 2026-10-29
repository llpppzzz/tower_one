/* =========================================================
   ASTRAL RIFT — game data
   ========================================================= */
(function () {
  'use strict';

  const WORLD = { w: 1600, h: 900 };
  const TOTAL_WAVES = 30;

  // Catmull-Rom control points; sampled in game.js
  const PATH_POINTS = [
    { x: -120, y: 430 },
    { x: 140, y: 430 },
    { x: 258, y: 246 },
    { x: 468, y: 218 },
    { x: 640, y: 330 },
    { x: 608, y: 528 },
    { x: 760, y: 650 },
    { x: 938, y: 592 },
    { x: 1002, y: 432 },
    { x: 1110, y: 430 }
  ];
  const CORE_POS = { x: 1110, y: 430 };

  const TOWER_ORDER = ['pulse', 'prism', 'mortar', 'cryo', 'rail'];

  const TOWERS = {
    pulse: {
      id: 'pulse', name: '脉冲炮塔', en: 'PULSE',
      role: '单体 · 高射速', desc: '稳定而精准的动能脉冲，对单体目标持续施压。',
      cost: 90, color: '#5cefff', color2: '#a8fbff',
      range: 215, damage: 15, cooldown: 0.62, projectileSpeed: 860,
      icon: 'i-pulse', shape: 'pulse', targetMode: 'first',
      upgradeCosts: [75, 140],
      statLine: '均衡型'
    },
    prism: {
      id: 'prism', name: '棱镜节点', en: 'PRISM',
      role: '连锁 · 群体', desc: '折射电弧在敌人之间跳跃，对密集队列效果拔群。',
      cost: 145, color: '#b08cff', color2: '#e1d4ff',
      range: 200, damage: 13, cooldown: 1.06, chain: 3, chainRange: 155, falloff: 0.8,
      icon: 'i-prism', shape: 'prism', targetMode: 'first',
      upgradeCosts: [120, 190],
      statLine: '连锁型'
    },
    mortar: {
      id: 'mortar', name: '迫击阵列', en: 'MORTAR',
      role: '范围 · 重击', desc: '抛射震荡弹头，对落点周围造成高额范围伤害。',
      cost: 175, color: '#ffb35c', color2: '#ffe0aa',
      range: 290, damage: 44, cooldown: 2.15, splash: 76,
      icon: 'i-mortar', shape: 'mortar', targetMode: 'strong',
      upgradeCosts: [145, 230],
      statLine: '爆破型'
    },
    cryo: {
      id: 'cryo', name: '低温场', en: 'CRYO',
      role: '减速 · 控场', desc: '持续冻结范围内的敌人，为其他火力创造输出窗口。',
      cost: 125, color: '#7edcff', color2: '#d6f7ff',
      range: 178, damage: 6, cooldown: 0.78, slow: 0.34, slowDuration: 1.45,
      icon: 'i-cryo', shape: 'cryo', targetMode: 'close',
      upgradeCosts: [105, 165],
      statLine: '控场型'
    },
    rail: {
      id: 'rail', name: '磁轨长枪', en: 'RAIL',
      role: '穿透 · 狙击', desc: '蓄能后贯穿一条直线上的所有目标，无视大部分装甲。',
      cost: 235, color: '#ff72b7', color2: '#ffd0e5',
      range: 355, damage: 90, cooldown: 3.35, pierce: 3, armorPen: 0.65,
      icon: 'i-rail', shape: 'rail', targetMode: 'strong',
      upgradeCosts: [185, 300],
      statLine: '狙击型'
    }
  };

  const ENEMY_ORDER = ['drone', 'runner', 'tank', 'splitter', 'shield', 'phase', 'healer'];

  const ENEMIES = {
    drone: {
      name: '侦猎机', hp: 52, speed: 64, reward: 9, leak: 5, radius: 16, armor: 0,
      color: '#ff5e95', color2: '#ffb0c9', shape: 'diamond', score: 10, icon: 'i-bolt', unlock: 1
    },
    runner: {
      name: '疾行体', hp: 35, speed: 108, reward: 8, leak: 4, radius: 12.5, armor: 0,
      color: '#ffcf66', color2: '#fff0b8', shape: 'arrow', score: 9, icon: 'i-chevrons', unlock: 2
    },
    tank: {
      name: '重装壳', hp: 278, speed: 37, reward: 25, leak: 15, radius: 24, armor: 10,
      color: '#ff7d58', color2: '#ffc4a0', shape: 'fortress', score: 28, icon: 'i-mortar', unlock: 4, tank: true
    },
    splitter: {
      name: '裂变体', hp: 132, speed: 56, reward: 16, leak: 8, radius: 20, armor: 2,
      color: '#ff6ce0', color2: '#ffc4f4', shape: 'splitter', score: 18, icon: 'i-prism', unlock: 6, splits: 2
    },
    shield: {
      name: '护盾卫', hp: 98, shield: 116, speed: 52, reward: 20, leak: 8, radius: 18, armor: 4,
      color: '#55d8ff', color2: '#d4f8ff', shape: 'shield', score: 22, icon: 'i-core', unlock: 8,
      regen: 19, regenDelay: 3.2
    },
    phase: {
      name: '相位幽灵', hp: 104, speed: 66, reward: 18, leak: 9, radius: 16.5, armor: 0,
      color: '#a88bff', color2: '#e2d7ff', shape: 'phase', score: 22, icon: 'i-nova', unlock: 11, blinkEvery: 6.4
    },
    healer: {
      name: '孢群母体', hp: 188, speed: 43, reward: 23, leak: 10, radius: 20, armor: 5,
      color: '#6df0b5', color2: '#d4ffea', shape: 'healer', score: 26, icon: 'i-heart', unlock: 14,
      heal: 16, healRadius: 148
    }
  };

  const WAVE_NAMES = [
    '校准脉冲', '疾行噪点', '铁锈回廊', '双生残响', '赤潮降临',
    '冷却余波', '折跃猎群', '护盾矩阵', '腐化孢群', '棱镜审判',
    '空蚀风暴', '相位裂隙', '钢铁圣咏', '静默潮汐', '虚空吞咽',
    '再生协议', '赤色警报', '时滞陷阱', '群星坟场', '裂变王座',
    '深渊回声', '无序增殖', '目标锁定', '临界熔毁', '时砂逆流',
    '终局演算', '星核灼烧', '天穹裂隙', '最后信号', '终焉之眼'
  ];

  const BOSSES = {
    5: {
      id: 'brood', name: '赤潮母舰', en: 'CRIMSON BROOD', style: 'brood',
      hpBase: 2600, speed: 28, reward: 165, leak: 28, radius: 38,
      color: '#ff5d8a', color2: '#ffc1d2', icon: 'i-prism',
      abilityName: '孵化脉冲', abilityDesc: '周期性释放侦猎机群。',
      modifier: 'overclocked'
    },
    10: {
      id: 'warden', name: '棱镜守卫', en: 'PRISM WARDEN', style: 'warden',
      hpBase: 4600, speed: 26, reward: 210, leak: 32, radius: 42,
      color: '#a88bff', color2: '#e6dcff', icon: 'i-core',
      abilityName: '镜像护盾', abilityDesc: '周期性展开吸收伤害的棱镜护盾。',
      modifier: 'aegis'
    },
    15: {
      id: 'devourer', name: '虚空吞噬者', en: 'VOID DEVOURER', style: 'devourer',
      hpBase: 7200, speed: 29, reward: 280, leak: 38, radius: 45,
      color: '#8b6cff', color2: '#d9ccff', icon: 'i-nova',
      abilityName: '相位折跃', abilityDesc: '不断折跃前进，并短暂不可锁定。',
      modifier: 'phase'
    },
    20: {
      id: 'tyrant', name: '裂变暴君', en: 'FISSION TYRANT', style: 'tyrant',
      hpBase: 10500, speed: 25, reward: 360, leak: 44, radius: 49,
      color: '#ff6b5e', color2: '#ffd0c5', icon: 'i-mortar',
      abilityName: '临界分裂', abilityDesc: '生命低于一半时裂变为两个子体。',
      modifier: 'frenzy'
    },
    25: {
      id: 'chronarch', name: '时砂领主', en: 'CHRONARCH', style: 'chronarch',
      hpBase: 15000, speed: 24, reward: 460, leak: 50, radius: 52,
      color: '#ffc36b', color2: '#fff0c5', icon: 'i-chrono',
      abilityName: '时滞领域', abilityDesc: '持续延缓全场炮塔的射击节奏。',
      modifier: 'emp'
    },
    30: {
      id: 'final', name: '终焉之眼', en: 'THE LAST EYE', style: 'final',
      hpBase: 21000, speed: 22, reward: 700, leak: 100, radius: 58,
      color: '#ff536e', color2: '#ffd1db', icon: 'i-core',
      abilityName: '终焉演算', abilityDesc: '在三个生命阶段中切换攻击、护盾与召唤。',
      modifier: 'regenerative'
    }
  };

  const WAVE_MODIFIERS = {
    overclocked: { id: 'overclocked', name: '过载潮汐', desc: '敌方移动速度 +18%', danger: true, speed: 1.18 },
    armored: { id: 'armored', name: '装甲回响', desc: '敌方护甲 +8', danger: true, armor: 8 },
    aegis: { id: 'aegis', name: '棱镜护盾', desc: '敌人获得 20% 最大生命的护盾', danger: true, shieldPct: 0.2 },
    bounty: { id: 'bounty', name: '赏金信号', desc: '击杀收益 +35%', danger: false, reward: 1.35 },
    emp: { id: 'emp', name: '静默风暴', desc: '炮塔射速 -12%', danger: true, towerRate: 0.88 },
    frenzy: { id: 'frenzy', name: '狂暴裂变', desc: '低生命敌人移速 +45%', danger: true, frenzy: true },
    regenerative: { id: 'regenerative', name: '再生孢子', desc: '敌人每秒恢复 1.1% 最大生命', danger: true, regenPct: 0.011 },
    phase: { id: 'phase', name: '相位迷雾', desc: '敌人周期性短暂不可锁定', danger: true, phase: true }
  };

  const RARITY = {
    common: { name: '标准协议', color: '#6be7ff', weight: 62 },
    rare: { name: '稀有协议', color: '#b692ff', weight: 30 },
    epic: { name: '史诗协议', color: '#ffc96b', weight: 8 }
  };

  // All modifiers are additive on run.mods unless otherwise noted.
  const UPGRADE_CARDS = [
    {
      id: 'kinetic', name: '动能校准', rarity: 'common', icon: 'i-bolt', repeatable: true,
      value: '+12%', unit: '全局伤害', desc: '所有防御单位的输出功率提升，稳定而直接。',
      apply: m => { m.damage += 0.12; }
    },
    {
      id: 'targeting', name: '广域瞄准', rarity: 'common', icon: 'i-pulse', repeatable: true,
      value: '+8%', unit: '射程', desc: '重构瞄准阵列，扩大所有炮塔的有效覆盖范围。',
      apply: m => { m.range += 0.08; }
    },
    {
      id: 'autoloader', name: '自动装填', rarity: 'common', icon: 'i-overclock', repeatable: true,
      value: '+9%', unit: '射速', desc: '压缩装填循环，提升全部炮塔的攻击频率。',
      apply: m => { m.fireRate += 0.09; }
    },
    {
      id: 'salvage', name: '回收协议', rarity: 'common', icon: 'i-credit', repeatable: true,
      value: '+2', unit: '击杀信用点', desc: '从敌人残骸中回收额外信用点。',
      apply: m => { m.killCredits += 2; }
    },
    {
      id: 'bounty', name: '战争债券', rarity: 'common', icon: 'i-shard', repeatable: true,
      value: '+12%', unit: '波次收益', desc: '每次清空波次时获得更多信用点。',
      apply: m => { m.waveCredits += 0.12; }
    },
    {
      id: 'resonance', name: '共振弹头', rarity: 'common', icon: 'i-nova', repeatable: true,
      value: '+10%', unit: '减速增伤', desc: '对处于减速状态的敌人造成额外伤害。',
      apply: m => { m.slowDamage += 0.1; }
    },
    {
      id: 'prismchain', name: '棱镜级联', rarity: 'rare', icon: 'i-prism',
      value: '+1', unit: '连锁目标', desc: '棱镜节点的电弧额外跳跃一次，并提高连锁保留率。',
      apply: m => { m.chainExtra += 1; m.chainFalloff += 0.04; }
    },
    {
      id: 'railpierce', name: '磁轨过载', rarity: 'rare', icon: 'i-rail',
      value: '+1', unit: '穿透目标', desc: '磁轨长枪的贯穿目标数 +1，伤害 +8%。',
      apply: m => { m.pierceExtra += 1; m.railDamage += 0.08; }
    },
    {
      id: 'mortarcluster', name: '集束弹头', rarity: 'rare', icon: 'i-mortar',
      value: '+30', unit: '爆炸半径', desc: '迫击阵列的爆炸范围扩大，并提高 10% 爆炸伤害。',
      apply: m => { m.splashBonus += 30; m.mortarDamage += 0.1; }
    },
    {
      id: 'absolutezero', name: '绝对零度', rarity: 'rare', icon: 'i-cryo',
      value: '+12%', unit: '冻结增伤', desc: '低温场的减速效果 +10%，被减速的敌人受到额外伤害。',
      apply: m => { m.slowBonus += 0.1; m.frozenDamage += 0.12; }
    },
    {
      id: 'overclockcore', name: '超频核心', rarity: 'rare', icon: 'i-overclock',
      value: '+2s', unit: '过载时长', desc: '战术过载持续时间 +2 秒，射速增益额外 +15%。',
      apply: m => { m.overclockDuration += 2; m.overclockBoost += 0.15; }
    },
    {
      id: 'novafission', name: '新星裂变', rarity: 'rare', icon: 'i-nova',
      value: '+60%', unit: '新星伤害', desc: '脉冲新星伤害 +60%，冷却时间 -4 秒。',
      apply: m => { m.novaDamage += 0.6; m.novaCooldown += 4; }
    },
    {
      id: 'chronolock', name: '时滞锁链', rarity: 'rare', icon: 'i-chrono',
      value: '+2s', unit: '时滞时长', desc: '时滞场持续时间 +2 秒，减速强度 +10%。',
      apply: m => { m.chronoDuration += 2; m.chronoSlow += 0.1; }
    },
    {
      id: 'execution', name: '处决程序', rarity: 'rare', icon: 'i-bolt', repeatable: true,
      value: '+28%', unit: '斩杀伤害', desc: '对生命低于 35% 的敌人造成额外伤害。',
      apply: m => { m.executeThreshold = Math.max(m.executeThreshold, 0.35); m.executeBonus += 0.28; }
    },
    {
      id: 'crit', name: '暴击矩阵', rarity: 'rare', icon: 'i-pulse', repeatable: true,
      value: '+7%', unit: '暴击几率', desc: '每次命中都有几率造成双倍伤害。',
      apply: m => { m.critChance += 0.07; }
    },
    {
      id: 'armorpen', name: '穿甲算法', rarity: 'rare', icon: 'i-rail', repeatable: true,
      value: '+15%', unit: '护甲穿透', desc: '所有炮塔忽略更多敌方护甲。',
      apply: m => { m.armorPen += 0.15; }
    },
    {
      id: 'cheap', name: '模块化铸造', rarity: 'rare', icon: 'i-core',
      value: '-8%', unit: '部署成本', desc: '所有防御单位的部署成本降低。',
      apply: m => { m.costReduction += 0.08; }
    },
    {
      id: 'abilitycap', name: '战术电容', rarity: 'common', icon: 'i-chrono', repeatable: true,
      value: '-8%', unit: '战术冷却', desc: '所有战术指令的冷却时间减少。',
      apply: m => { m.abilityCooldown += 0.08; }
    },
    {
      id: 'nanorepair', name: '纳米修复', rarity: 'common', icon: 'i-heart', repeatable: true,
      value: '+6', unit: '核心耐久', desc: '最大核心耐久 +6，并在每次清波后修复 4 点。',
      apply: m => { m.coreMax += 6; m.coreRegen += 4; }
    },
    {
      id: 'corematrix', name: '防御矩阵', rarity: 'rare', icon: 'i-core',
      value: '-25%', unit: '核心承伤', desc: '敌人突破防线时对星核造成的伤害降低。',
      apply: m => { m.coreDamageReduction += 0.25; }
    },
    {
      id: 'capital', name: '战时拨款', rarity: 'common', icon: 'i-credit', repeatable: true,
      value: '+110', unit: '立即信用点', desc: '立即获得一笔信用点，用于扩大防线。',
      apply: m => { m.instantCredits = (m.instantCredits || 0) + 110; }
    },
    {
      id: 'chainblast', name: '连锁爆破', rarity: 'epic', icon: 'i-mortar',
      value: '30 + 8%', unit: '死亡爆炸', desc: '敌人死亡时引爆核心，对周围敌人造成伤害。',
      apply: m => { m.deathExplosion += 1; }
    },
    {
      id: 'orbital', name: '轨道支援', rarity: 'epic', icon: 'i-rail',
      value: '12s', unit: '自动打击', desc: '每隔一段时间，天基武器会自动轰击最强的敌人。',
      apply: m => { m.orbital = true; }
    },
    {
      id: 'drone', name: '僚机协议', rarity: 'epic', icon: 'i-prism',
      value: '22%', unit: '追加射击', desc: '炮塔每次开火有几率释放一枚追加无人机弹。',
      apply: m => { m.droneChance += 0.22; }
    },
    {
      id: 'lowcore', name: '背水一战', rarity: 'epic', icon: 'i-bolt',
      value: '+25%', unit: '低血量射速', desc: '星核耐久低于 50% 时，所有炮塔射速提升。',
      apply: m => { m.lowCoreRate += 0.25; }
    },
    {
      id: 'elitehunter', name: '精英猎手', rarity: 'rare', icon: 'i-shard',
      value: '+10%', unit: '精英出现率', desc: '更多精英敌人会出现，但精英奖励大幅提升。',
      apply: m => { m.eliteChance += 0.1; m.eliteReward += 0.3; }
    },
    {
      id: 'overload', name: '不稳定过载', rarity: 'epic', icon: 'i-overclock',
      value: '+30%', unit: '伤害 / -10 耐久', desc: '牺牲部分核心耐久换取强大的火力增幅。',
      apply: m => { m.damage += 0.3; m.coreMax -= 10; }
    },
    {
      id: 'momentum', name: '动量储存', rarity: 'common', icon: 'i-nova', repeatable: true,
      value: '+4%', unit: '伤害成长', desc: '每次选择后，所有炮塔伤害永久提高 4%。',
      apply: m => { m.damage += 0.04; }
    }
  ];

  const META_UPGRADES = [
    {
      key: 'core', name: '星核装甲', icon: 'i-heart', max: 3,
      desc: (lv) => `最大核心耐久 +${lv * 25}`,
      costs: [80, 160, 260], value: 25
    },
    {
      key: 'capital', name: '战备储蓄', icon: 'i-credit', max: 3,
      desc: (lv) => `初始信用点 +${lv * 80}`,
      costs: [70, 150, 250], value: 80
    },
    {
      key: 'damage', name: '火力校准', icon: 'i-bolt', max: 4,
      desc: (lv) => `所有炮塔伤害 +${lv * 5}%`,
      costs: [90, 170, 280, 400], value: 0.05
    },
    {
      key: 'cost', name: '铸造优化', icon: 'i-shard', max: 3,
      desc: (lv) => `部署成本 -${lv * 4}%`,
      costs: [110, 210, 330], value: 0.04
    },
    {
      key: 'ability', name: '战术电容', icon: 'i-chrono', max: 3,
      desc: (lv) => `战术冷却 -${lv * 7}%`,
      costs: [90, 180, 300], value: 0.07
    }
  ];

  const DIFFICULTIES = {
    standard: { id: 'standard', name: '标准', hp: 1, speed: 1, reward: 1, shards: 1 },
    abyss: { id: 'abyss', name: '深渊', hp: 1.35, speed: 1.06, reward: 1.15, shards: 1.6 }
  };

  const ABILITIES = [
    {
      id: 'nova', key: 'Q', name: '脉冲新星', en: 'NOVA', icon: 'i-nova', color: '#66e9ff',
      cooldown: 24, desc: '释放环形冲击波，对全场敌人造成伤害并短暂眩晕。'
    },
    {
      id: 'overclock', key: 'W', name: '战术超频', en: 'OVERCLOCK', icon: 'i-overclock', color: '#ffc96b',
      cooldown: 34, desc: '所有炮塔进入超频状态，大幅提升射速。'
    },
    {
      id: 'chrono', key: 'E', name: '时滞场', en: 'CHRONO', icon: 'i-chrono', color: '#b08cff',
      cooldown: 38, desc: '冻结战场时间流速，减速全场敌人并使其承受更多伤害。'
    }
  ];

  const TUTORIAL = [
    '点击右侧炮塔，再点击地图上的空地完成部署。',
    '点击已部署的炮塔可进行强化、切换瞄准协议或回收。',
    '按 Q / W / E 释放战术指令，在危急时刻扭转局势。',
    '每波结束后三选一战术协议，它们会永久叠加到本次行动。',
    '击败第 5、10、15、20、25、30 波的裂隙首领。'
  ];

  window.GAME_DATA = {
    WORLD, TOTAL_WAVES, PATH_POINTS, CORE_POS, TOWER_ORDER, TOWERS,
    ENEMY_ORDER, ENEMIES, WAVE_NAMES, BOSSES, WAVE_MODIFIERS, RARITY,
    UPGRADE_CARDS, META_UPGRADES, DIFFICULTIES, ABILITIES, TUTORIAL
  };
})();

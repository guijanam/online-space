export const SURVIVAL_SECONDS = 180

export type GameStatus = 'idle' | 'running' | 'levelup' | 'paused' | 'over' | 'won'
export type EnemyKind = 'heckler' | 'sprinter' | 'youtuber' | 'urinator' | 'blocker' | 'boss'
export type Facing = 1 | -1
export type UpgradeId = 'rapid' | 'damage' | 'speed' | 'health' | 'multi' | 'pierce' | 'magnet'

export type Player = {
  x: number
  y: number
  r: number
  hp: number
  maxHp: number
  speed: number
  fireRate: number
  bulletSpeed: number
  damage: number
  multiShot: number
  pierce: number
  magnet: number
  facing: Facing
}

export type Enemy = {
  id: number
  kind: EnemyKind
  x: number
  y: number
  r: number
  hp: number
  maxHp: number
  speed: number
  damage: number
  xp: number
  facing: Facing
}

export type Bullet = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  pierce: number
  life: number
  hit: number[]
}

export type Gem = { x: number; y: number; value: number }

/** 화면 쪽(효과음 등)에 알려줄 일. updateGame 이 쌓고 화면이 꺼내 간다. */
export type SubwayEvent =
  | { type: 'shoot' }
  | { type: 'hit'; kind: EnemyKind }
  | { type: 'kill'; kind: EnemyKind }
  | { type: 'hurt' }
  | { type: 'gem' }
  | { type: 'levelup' }
  | { type: 'boss' }
  | { type: 'over' }
  | { type: 'won' }

/**
 * 세계는 끝이 없고, width/height 는 주인공을 가운데 둔 화면(카메라) 크기다.
 * 빌런 등장·정리 범위는 이 화면을 기준으로 정한다.
 */
export type SubwayState = {
  width: number
  height: number
  status: GameStatus
  time: number
  player: Player
  enemies: Enemy[]
  bullets: Bullet[]
  gems: Gem[]
  kills: number
  level: number
  xp: number
  xpNext: number
  invincible: number
  spawnTimer: number
  shotTimer: number
  bossSpawned: boolean
  nextId: number
  random: () => number
  events: SubwayEvent[]
}

export const UPGRADES: { id: UpgradeId; emoji: string; name: string; description: string }[] = [
  { id: 'rapid', emoji: '⚡', name: '빠른 대응', description: '발사 속도 +18%' },
  { id: 'damage', emoji: '💥', name: '강화 탄환', description: '공격력 +25%' },
  { id: 'speed', emoji: '👟', name: '가벼운 발걸음', description: '이동 속도 +12%' },
  { id: 'health', emoji: '💚', name: '든든한 처방', description: '최대 생명 +20, 생명 회복' },
  { id: 'multi', emoji: '🔱', name: '동시 대응', description: '발사 탄환 +1 (최대 4)' },
  { id: 'pierce', emoji: '🎯', name: '관통 탄환', description: '관통 횟수 +1 (최대 4)' },
  { id: 'magnet', emoji: '🧲', name: '경험치 수거', description: '수거 범위 +45%' },
]

export const ENEMY_STATS: Record<EnemyKind, Omit<Enemy, 'id' | 'kind' | 'x' | 'y' | 'hp' | 'maxHp' | 'facing'> & { baseHp: number }> = {
  heckler: { r: 15, speed: 55, damage: 10, xp: 5, baseHp: 42 },
  sprinter: { r: 11, speed: 94, damage: 8, xp: 6, baseHp: 28 },
  youtuber: { r: 16, speed: 62, damage: 10, xp: 8, baseHp: 60 },
  urinator: { r: 15, speed: 50, damage: 16, xp: 9, baseHp: 70 },
  blocker: { r: 21, speed: 34, damage: 18, xp: 12, baseHp: 135 },
  boss: { r: 34, speed: 29, damage: 25, xp: 70, baseHp: 1100 },
}

/** 시간이 지나면 해금되는 빌런과 등장 확률. 해금되지 않은 몫은 기본 빌런(heckler)이 차지한다. */
const SPAWN_TABLE: { kind: EnemyKind; after: number; chance: number }[] = [
  { kind: 'blocker', after: 35, chance: 0.14 },
  { kind: 'urinator', after: 45, chance: 0.12 },
  { kind: 'youtuber', after: 25, chance: 0.14 },
  { kind: 'sprinter', after: 12, chance: 0.28 },
]

export function pickEnemyKind(time: number, roll: number): EnemyKind {
  let edge = 0
  for (const entry of SPAWN_TABLE) {
    if (time <= entry.after) continue
    edge += entry.chance
    if (roll < edge) return entry.kind
  }
  return 'heckler'
}

export function createGame(width: number, height: number, random = Math.random): SubwayState {
  return {
    width,
    height,
    status: 'idle',
    time: 0,
    player: {
      x: width / 2,
      y: height / 2,
      r: 14,
      hp: 100,
      maxHp: 100,
      speed: 155,
      fireRate: 2.2,
      bulletSpeed: 390,
      damage: 25,
      multiShot: 1,
      pierce: 0,
      magnet: 95,
      facing: 1,
    },
    enemies: [],
    bullets: [],
    gems: [],
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: 20,
    invincible: 0,
    spawnTimer: 0.35,
    shotTimer: 0.15,
    bossSpawned: false,
    nextId: 1,
    random,
    events: [],
  }
}

/** 화면 밖 여유 거리: 카메라가 살짝 늦게 따라와도 빌런이 화면 안에서 갑자기 생기지 않게 */
const SPAWN_MARGIN = 40
/** 화면에서 이만큼 더 멀어진 빌런은 주인공 앞쪽 화면 가장자리로 다시 데려온다 */
const RECYCLE_MARGIN = 220

export function spawnEnemy(state: SubwayState, forcedKind?: EnemyKind, x?: number, y?: number): Enemy {
  const roll = state.random()
  const kind: EnemyKind = forcedKind ?? pickEnemyKind(state.time, roll)
  const { baseHp, ...base } = ENEMY_STATS[kind]
  const edge = Math.floor(state.random() * 4)
  const halfW = state.width / 2 + base.r + SPAWN_MARGIN
  const halfH = state.height / 2 + base.r + SPAWN_MARGIN
  const { x: cx, y: cy } = state.player
  const px = x ?? (edge === 0 ? cx - halfW : edge === 1 ? cx + halfW : cx + (state.random() - 0.5) * state.width)
  const py = y ?? (edge >= 2 ? (edge === 2 ? cy - halfH : cy + halfH) : cy + (state.random() - 0.5) * state.height)
  const hp = Math.round(baseHp * (kind === 'boss' ? 1 : 1 + state.time / 120))
  const facing: Facing = state.player.x >= px ? 1 : -1
  const enemy: Enemy = { id: state.nextId++, kind, x: px, y: py, ...base, hp, maxHp: hp, facing }
  state.enemies.push(enemy)
  return enemy
}

function fire(state: SubwayState): void {
  const { player } = state
  let target: Enemy | null = null
  let nearest = Infinity
  for (const enemy of state.enemies) {
    const d = Math.hypot(enemy.x - player.x, enemy.y - player.y)
    if (d < nearest) {
      nearest = d
      target = enemy
    }
  }
  if (!target) return
  state.events.push({ type: 'shoot' })
  const angle = Math.atan2(target.y - player.y, target.x - player.x)
  for (let i = 0; i < player.multiShot; i++) {
    const a = angle + (i - (player.multiShot - 1) / 2) * 0.16
    state.bullets.push({
      id: state.nextId++,
      x: player.x + Math.cos(a) * 18,
      y: player.y + Math.sin(a) * 18,
      vx: Math.cos(a) * player.bulletSpeed,
      vy: Math.sin(a) * player.bulletSpeed,
      damage: player.damage,
      pierce: player.pierce,
      life: 1.5,
      hit: [],
    })
  }
}

function gainXp(state: SubwayState, value: number): void {
  state.xp += value
  if (state.xp < state.xpNext) return
  state.xp -= state.xpNext
  state.level++
  state.xpNext = Math.floor(state.xpNext * 1.35 + 8)
  state.status = 'levelup'
  state.events.push({ type: 'levelup' })
}

export function updateGame(state: SubwayState, input: { x: number; y: number }, rawDt: number): void {
  if (state.status !== 'running') return
  const dt = Math.min(0.05, Math.max(0, rawDt))
  state.time += dt
  if (state.time >= SURVIVAL_SECONDS) {
    state.time = SURVIVAL_SECONDS
    state.status = 'won'
    state.events.push({ type: 'won' })
    return
  }
  const { player } = state
  state.invincible = Math.max(0, state.invincible - dt)
  const length = Math.hypot(input.x, input.y)
  const nx = length > 1 ? input.x / length : input.x
  const ny = length > 1 ? input.y / length : input.y
  if (nx > 0.05) player.facing = 1
  else if (nx < -0.05) player.facing = -1
  player.x += nx * player.speed * dt
  player.y += ny * player.speed * dt

  if (!state.bossSpawned && state.time >= 60) {
    state.bossSpawned = true
    spawnEnemy(state, 'boss')
    state.events.push({ type: 'boss' })
  }
  state.spawnTimer -= dt
  if (state.spawnTimer <= 0 && state.enemies.length < 120) {
    const count = Math.min(3, 1 + Math.floor(state.time / 55))
    for (let i = 0; i < count; i++) spawnEnemy(state)
    state.spawnTimer = Math.max(0.22, 0.85 - state.time * 0.0027)
  }

  state.shotTimer -= dt
  if (state.shotTimer <= 0 && state.enemies.length) {
    fire(state)
    state.shotTimer = 1 / player.fireRate
  }

  for (const enemy of state.enemies) {
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    const d = Math.hypot(dx, dy) || 1
    enemy.x += (dx / d) * enemy.speed * dt
    enemy.y += (dy / d) * enemy.speed * dt
    if (Math.abs(dx) > 2) enemy.facing = dx > 0 ? 1 : -1
    recycleFarEnemy(state, enemy)
  }
  for (let i = 0; i < state.enemies.length; i++) {
    for (let j = i + 1; j < state.enemies.length; j++) {
      const a = state.enemies[i]
      const b = state.enemies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 0.01
      const overlap = (a.r + b.r) * 0.72 - d
      if (overlap > 0) {
        const push = overlap * 0.25
        a.x -= (dx / d) * push
        a.y -= (dy / d) * push
        b.x += (dx / d) * push
        b.y += (dy / d) * push
      }
    }
  }

  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt
    bullet.y += bullet.vy * dt
    bullet.life -= dt
    for (const enemy of state.enemies) {
      if (bullet.pierce < 0) break
      if (enemy.hp <= 0 || bullet.hit.includes(enemy.id)) continue
      if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) > enemy.r + 4) continue
      enemy.hp -= bullet.damage
      if (enemy.hp > 0) state.events.push({ type: 'hit', kind: enemy.kind })
      bullet.hit.push(enemy.id)
      bullet.pierce--
    }
  }
  const viewX = state.width / 2 + 20
  const viewY = state.height / 2 + 20
  state.bullets = state.bullets.filter(
    (bullet) =>
      bullet.life > 0 && bullet.pierce >= 0 && Math.abs(bullet.x - player.x) < viewX && Math.abs(bullet.y - player.y) < viewY,
  )

  const survivors: Enemy[] = []
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      state.kills++
      state.events.push({ type: 'kill', kind: enemy.kind })
      state.gems.push({ x: enemy.x, y: enemy.y, value: enemy.xp })
      continue
    }
    survivors.push(enemy)
    if (state.invincible <= 0 && Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.r + player.r) {
      player.hp = Math.max(0, player.hp - enemy.damage)
      state.invincible = 0.65
      state.events.push({ type: 'hurt' })
      if (player.hp <= 0) {
        state.status = 'over'
        state.events.push({ type: 'over' })
        break
      }
    }
  }
  state.enemies = survivors
  if (state.status !== 'running') return

  const remainingGems: Gem[] = []
  for (let i = 0; i < state.gems.length; i++) {
    const gem = state.gems[i]
    const dx = player.x - gem.x
    const dy = player.y - gem.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 24) {
      state.events.push({ type: 'gem' })
      gainXp(state, gem.value)
      if (state.status !== 'running') {
        remainingGems.push(...state.gems.slice(i + 1))
        break
      }
    } else if (Math.abs(dx) > state.width * 1.5 || Math.abs(dy) > state.height * 1.5) {
      // 멀리 두고 온 보석은 정리한다 (계속 쌓이지 않게)
      continue
    } else {
      if (d < player.magnet) {
        gem.x += (dx / d) * 250 * dt
        gem.y += (dy / d) * 250 * dt
      }
      remainingGems.push(gem)
    }
  }
  state.gems = remainingGems
}

/**
 * 주인공이 멀리 달아나 화면에서 한참 벗어난 빌런을,
 * 주인공이 향하는 쪽(원래 있던 곳의 반대편) 화면 가장자리 바로 밖으로 옮긴다.
 */
function recycleFarEnemy(state: SubwayState, enemy: Enemy): void {
  const { player } = state
  const dx = enemy.x - player.x
  const dy = enemy.y - player.y
  const limitX = state.width / 2 + RECYCLE_MARGIN
  const limitY = state.height / 2 + RECYCLE_MARGIN
  if (Math.abs(dx) > limitX) {
    enemy.x = player.x - Math.sign(dx) * (state.width / 2 + enemy.r + SPAWN_MARGIN)
    enemy.y = player.y + Math.max(-state.height / 2, Math.min(state.height / 2, dy))
  } else if (Math.abs(dy) > limitY) {
    enemy.y = player.y - Math.sign(dy) * (state.height / 2 + enemy.r + SPAWN_MARGIN)
    enemy.x = player.x + Math.max(-state.width / 2, Math.min(state.width / 2, dx))
  }
}

export function upgradeChoices(state: SubwayState): typeof UPGRADES {
  const available = UPGRADES.filter(
    (upgrade) =>
      !((upgrade.id === 'multi' && state.player.multiShot >= 4) || (upgrade.id === 'pierce' && state.player.pierce >= 4)),
  )
  return available
    .map((upgrade) => ({ upgrade, order: state.random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map(({ upgrade }) => upgrade)
}

export function applyUpgrade(state: SubwayState, id: UpgradeId): void {
  const { player } = state
  switch (id) {
    case 'rapid':
      player.fireRate *= 1.18
      break
    case 'damage':
      player.damage *= 1.25
      break
    case 'speed':
      player.speed *= 1.12
      break
    case 'health':
      player.maxHp += 20
      player.hp = Math.min(player.maxHp, player.hp + 35)
      break
    case 'multi':
      player.multiShot = Math.min(4, player.multiShot + 1)
      break
    case 'pierce':
      player.pierce = Math.min(4, player.pierce + 1)
      break
    case 'magnet':
      player.magnet *= 1.45
      break
  }
  if (state.status === 'levelup') state.status = 'running'
}

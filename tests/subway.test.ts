import { describe, expect, it } from 'vitest'
import {
  SURVIVAL_SECONDS,
  applyUpgrade,
  createGame,
  pickEnemyKind,
  spawnEnemy,
  updateGame,
  upgradeChoices,
} from '../src/game/subway/engine'

function runningGame() {
  const state = createGame(400, 700, () => 0.5)
  state.status = 'running'
  state.spawnTimer = 999
  state.shotTimer = 999
  return state
}

describe('지하철 퇴치대 엔진', () => {
  it('이동을 정규화하고 화면 밖으로 나가지 않는다', () => {
    const state = runningGame()
    const x = state.player.x
    const y = state.player.y
    updateGame(state, { x: 1, y: 1 }, 0.05)
    expect(state.player.x).toBeGreaterThan(x)
    expect(state.player.y).toBeGreaterThan(y)
    for (let i = 0; i < 200; i++) updateGame(state, { x: -1, y: -1 }, 0.05)
    expect(state.player.x).toBe(state.player.r)
    expect(state.player.y).toBe(state.player.r)
  })

  it('가장 가까운 빌런에게 자동으로 발사한다', () => {
    const state = runningGame()
    spawnEnemy(state, 'heckler', 350, 350)
    const near = spawnEnemy(state, 'heckler', 250, 350)
    state.shotTimer = 0
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.bullets).toHaveLength(1)
    expect(state.bullets[0].vx).toBeGreaterThan(0)
    expect(near.x).toBeLessThan(250)
  })

  it('탄환으로 빌런을 처치하면 경험치 보석이 남는다', () => {
    const state = runningGame()
    const enemy = spawnEnemy(state, 'heckler', 230, 350)
    enemy.hp = 20
    state.bullets.push({ id: 900, x: 230, y: 350, vx: 0, vy: 0, damage: 25, pierce: 0, life: 1, hit: [] })
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.kills).toBe(1)
    expect(state.enemies).toHaveLength(0)
    expect(state.gems).toHaveLength(1)
    expect(state.bullets).toHaveLength(0)
  })

  it('관통이 없는 탄환은 한 번에 한 빌런만 맞힌다', () => {
    const state = runningGame()
    spawnEnemy(state, 'blocker', 250, 350)
    spawnEnemy(state, 'blocker', 250, 350)
    state.bullets.push({ id: 900, x: 250, y: 350, vx: 0, vy: 0, damage: 25, pierce: 0, life: 1, hit: [] })
    updateGame(state, { x: 0, y: 0 }, 0)
    expect(state.enemies.filter((enemy) => enemy.hp < enemy.maxHp)).toHaveLength(1)
  })

  it('경험치를 모으면 레벨업하고 강화 후 다시 진행한다', () => {
    const state = runningGame()
    state.gems.push({ x: state.player.x, y: state.player.y, value: 20 })
    const fireRate = state.player.fireRate
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.level).toBe(2)
    expect(state.status).toBe('levelup')
    expect(state.gems).toHaveLength(0)
    applyUpgrade(state, 'rapid')
    expect(state.player.fireRate).toBeCloseTo(fireRate * 1.18)
    expect(state.status).toBe('running')
  })

  it('레벨업과 동시에 남은 보석을 보존한다', () => {
    const state = runningGame()
    state.gems.push(
      { x: state.player.x, y: state.player.y, value: 20 },
      { x: state.player.x + 200, y: state.player.y, value: 5 },
    )
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.status).toBe('levelup')
    expect(state.gems).toHaveLength(1)
    expect(state.gems[0].value).toBe(5)
  })

  it('접촉 피해에는 짧은 무적 시간이 있다', () => {
    const state = runningGame()
    spawnEnemy(state, 'heckler', state.player.x, state.player.y)
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.player.hp).toBe(90)
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.player.hp).toBe(90)
  })

  it('60초에 보스가 나오고 3분이 지나면 생존 성공한다', () => {
    const state = runningGame()
    state.time = 60
    updateGame(state, { x: 0, y: 0 }, 0.016)
    expect(state.enemies.some((enemy) => enemy.kind === 'boss')).toBe(true)
    state.enemies = []
    state.time = SURVIVAL_SECONDS - 0.01
    updateGame(state, { x: 0, y: 0 }, 0.02)
    expect(state.status).toBe('won')
    expect(state.time).toBe(SURVIVAL_SECONDS)
  })

  it('빌런 종류는 시간이 지나야 해금된다', () => {
    const rolls = Array.from({ length: 100 }, (_, i) => i / 100)
    const kindsAt = (time: number) => new Set(rolls.map((roll) => pickEnemyKind(time, roll)))
    expect([...kindsAt(5)]).toEqual(['heckler'])
    expect(kindsAt(20).has('sprinter')).toBe(true)
    expect(kindsAt(20).has('youtuber')).toBe(false)
    expect(kindsAt(30).has('youtuber')).toBe(true)
    expect(kindsAt(40).has('urinator')).toBe(false)
    const late = kindsAt(50)
    for (const kind of ['heckler', 'sprinter', 'youtuber', 'urinator', 'blocker'] as const) expect(late.has(kind)).toBe(true)
    expect(late.has('boss')).toBe(false)
  })

  it('빌런은 주인공 쪽을 바라본다', () => {
    const state = runningGame()
    const left = spawnEnemy(state, 'youtuber', 50, 350)
    const right = spawnEnemy(state, 'urinator', 350, 350)
    expect(left.facing).toBe(1)
    expect(right.facing).toBe(-1)
    expect(right.damage).toBeGreaterThan(left.damage)
    updateGame(state, { x: -1, y: 0 }, 0.016)
    expect(state.player.facing).toBe(-1)
  })

  it('강화 선택지는 세 개다', () => {
    expect(upgradeChoices(runningGame())).toHaveLength(3)
  })
})

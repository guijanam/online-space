import { describe, expect, it } from 'vitest'
import { BOMB_PENALTY, GAME_DURATION_MS, STAR_POINTS, fallSpeed, scoreAfterCatch, spawnDelayMs } from '../src/game/rules'

describe('별 받기 게임 규칙', () => {
  it('별은 10점, 폭탄은 20점 감점', () => {
    expect(scoreAfterCatch(0, 'star')).toBe(STAR_POINTS)
    expect(scoreAfterCatch(30, 'bomb')).toBe(30 + BOMB_PENALTY)
  })

  it('점수는 0 아래로 낮아지지 않는다', () => {
    expect(scoreAfterCatch(10, 'bomb')).toBe(0)
    expect(scoreAfterCatch(0, 'bomb')).toBe(0)
  })

  it('후반으로 갈수록 별이 더 자주 빠르게 떨어진다', () => {
    expect(spawnDelayMs(GAME_DURATION_MS)).toBeLessThan(spawnDelayMs(0))
    expect(fallSpeed(GAME_DURATION_MS, 0.5)).toBeGreaterThan(fallSpeed(0, 0.5))
  })

  it('시간 범위를 벗어나도 생성 주기와 속도가 계속 바뀌지는 않는다', () => {
    expect(spawnDelayMs(-1)).toBe(spawnDelayMs(0))
    expect(spawnDelayMs(GAME_DURATION_MS * 2)).toBe(spawnDelayMs(GAME_DURATION_MS))
  })
})

import { describe, expect, it } from 'vitest'
import { ActMsg, GameStateMsg, MoveMsg, PROTOCOL_VERSION, StateMsg, clampToWorld } from '../src/protocol'
import { hueFor, nicknameFor } from '../src/identity'
import { WORLD_RADIUS } from '../src/config'

describe('protocol', () => {
  it('알 수 없는 필드(자유 텍스트)는 버린다', () => {
    const r = ActMsg.safeParse({ id: 'wave', text: '안녕하세요 채팅' })
    expect(r.success).toBe(true)
    expect(r.data).toEqual({ id: 'wave' })
  })

  it('캠핑의 마시멜로 굽기 행동을 전달한다', () => {
    expect(ActMsg.safeParse({ id: 'roast' })).toEqual({ success: true, data: { id: 'roast' } })
  })

  it('정의되지 않은 행동은 거절한다', () => {
    expect(ActMsg.safeParse({ id: 'dance' }).success).toBe(false)
    expect(ActMsg.safeParse({ id: 123 }).success).toBe(false)
    expect(ActMsg.safeParse('wave').success).toBe(false)
  })

  it('좌표는 숫자이고 범위 안이어야 한다', () => {
    expect(MoveMsg.safeParse({ x: 1, z: -2 }).success).toBe(true)
    expect(MoveMsg.safeParse({ x: 1e6, z: 0 }).success).toBe(false)
    expect(MoveMsg.safeParse({ x: NaN, z: 0 }).success).toBe(false)
    expect(MoveMsg.safeParse({ x: '1', z: 0 }).success).toBe(false)
  })

  it('상태 메시지는 프로토콜 버전이 맞아야 한다', () => {
    const ok = { v: PROTOCOL_VERSION, x: 0, z: 0, joinedAt: Date.now() }
    expect(StateMsg.safeParse(ok).success).toBe(true)
    expect(StateMsg.safeParse({ ...ok, v: 999 }).success).toBe(false)
  })

  it('자리 번호는 정수 범위만, 없어도 된다 (이전 버전 호환)', () => {
    expect(MoveMsg.safeParse({ x: 0, z: 0 }).success).toBe(true)
    expect(MoveMsg.safeParse({ x: 0, z: 0, seat: 3 }).data?.seat).toBe(3)
    expect(MoveMsg.safeParse({ x: 0, z: 0, seat: -1 }).success).toBe(true)
    expect(MoveMsg.safeParse({ x: 0, z: 0, seat: 99 }).success).toBe(false)
    expect(MoveMsg.safeParse({ x: 0, z: 0, seat: 1.5 }).success).toBe(false)
    expect(MoveMsg.safeParse({ x: 0, z: 0, seat: '의자' }).success).toBe(false)
  })

  it('게임 점수는 정수 범위와 프로토콜 버전을 검사한다', () => {
    const ok = { v: PROTOCOL_VERSION, joinedAt: Date.now(), round: 1, score: 30, best: 80, playing: true }
    expect(GameStateMsg.safeParse(ok).success).toBe(true)
    expect(GameStateMsg.safeParse({ ...ok, score: -10 }).success).toBe(false)
    expect(GameStateMsg.safeParse({ ...ok, score: 1.5 }).success).toBe(false)
    expect(GameStateMsg.safeParse({ ...ok, v: 999 }).success).toBe(false)
  })

  it('clampToWorld 는 원 밖 좌표를 경계로 끌어온다', () => {
    const p = clampToWorld(100, 0)
    expect(p.x).toBeCloseTo(WORLD_RADIUS - 0.5)
    expect(p.z).toBeCloseTo(0)
    expect(clampToWorld(1, 1)).toEqual({ x: 1, z: 1 })
  })
})

describe('identity', () => {
  it('같은 peerId 는 모든 기기에서 같은 별칭과 색', () => {
    expect(nicknameFor('abc123')).toBe(nicknameFor('abc123'))
    expect(hueFor('abc123')).toBe(hueFor('abc123'))
    expect(nicknameFor('abc123')).toMatch(/^\S+ \S+$/)
  })

  it('peerId 가 다르면 대체로 다른 별칭', () => {
    const names = new Set(Array.from({ length: 50 }, (_, i) => nicknameFor(`peer-${i}`)))
    expect(names.size).toBeGreaterThan(30)
  })
})

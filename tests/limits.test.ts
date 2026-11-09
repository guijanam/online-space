import { describe, expect, it } from 'vitest'
import { ReceiveGuard, RECEIVE_LIMITS, SendLimiter, SEND_LIMITS } from '../src/net/limits'

function fakeClock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('SendLimiter (보내는 쪽)', () => {
  it('행동별 쿨타임 동안 같은 행동을 막는다', () => {
    const c = fakeClock()
    const s = new SendLimiter(SEND_LIMITS, c.now)
    expect(s.tryAct('wave')).toBe(true)
    expect(s.tryAct('wave')).toBe(false)
    c.advance(4_999)
    expect(s.tryAct('wave')).toBe(false)
    c.advance(1)
    expect(s.tryAct('wave')).toBe(true)
  })

  it('다른 행동이라도 10초에 4번까지만', () => {
    const c = fakeClock()
    const s = new SendLimiter(SEND_LIMITS, c.now)
    for (const id of ['wave', 'bow', 'cheer', 'stretch'] as const) expect(s.tryAct(id)).toBe(true)
    expect(s.tryAct('heart')).toBe(false)
    expect(s.globalRemaining()).toBe(10_000)
    c.advance(10_000)
    expect(s.tryAct('heart')).toBe(true)
  })

  it('이동은 1초 간격', () => {
    const c = fakeClock(5_000)
    const s = new SendLimiter(SEND_LIMITS, c.now)
    expect(s.moveWait()).toBe(0)
    s.markMove()
    c.advance(400)
    expect(s.moveWait()).toBe(600)
  })
})

describe('ReceiveGuard (받는 쪽)', () => {
  it('정상 속도는 네트워크 지연 오차를 허용한다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    expect(g.allowAction('p', 'wave')).toBe(true)
    c.advance(5_000 - 500) // 지연으로 500ms 일찍 도착
    expect(g.allowAction('p', 'wave')).toBe(true)
  })

  it('쿨타임보다 빠른 행동은 무시한다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    expect(g.allowAction('p', 'wave')).toBe(true)
    c.advance(1_000)
    expect(g.allowAction('p', 'wave')).toBe(false)
  })

  it('도배(20연타)는 1번만 통과하고 결국 숨김 처리된다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    let passed = 0
    for (let i = 0; i < 20; i++) if (g.allowAction('bad', 'wave')) passed++
    expect(passed).toBe(1)
    expect(g.isMuted('bad')).toBe(true)
    c.advance(60_000)
    expect(g.allowAction('bad', 'wave')).toBe(false) // 세션 동안 유지
  })

  it('피어끼리는 서로 영향이 없다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    for (let i = 0; i < 20; i++) g.allowAction('bad', 'wave')
    expect(g.allowAction('good', 'wave')).toBe(true)
  })

  it('가끔 생기는 위반은 시간이 지나면 잊혀서 숨김까지 가지 않는다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    for (let i = 0; i < 30; i++) {
      g.allowMove('p')
      c.advance(100) // 위반 1회
      g.allowMove('p')
      c.advance(10_000)
    }
    expect(g.isMuted('p')).toBe(false)
  })

  it('이동은 700ms 간격 이상만 허용', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    expect(g.allowMove('p')).toBe(true)
    c.advance(300)
    expect(g.allowMove('p')).toBe(false)
    c.advance(700)
    expect(g.allowMove('p')).toBe(true)
  })

  it('상태 메시지는 2초 간격으로만 반영하지만 위반으로 치지 않는다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    expect(g.allowState('p')).toBe(true)
    for (let i = 0; i < 50; i++) expect(g.allowState('p')).toBe(false)
    expect(g.isMuted('p')).toBe(false)
    c.advance(2_000)
    expect(g.allowState('p')).toBe(true)
  })

  it('forget 하면 기록이 초기화된다', () => {
    const c = fakeClock()
    const g = new ReceiveGuard(RECEIVE_LIMITS, c.now)
    for (let i = 0; i < 20; i++) g.allowAction('p', 'wave')
    g.forget('p')
    expect(g.isMuted('p')).toBe(false)
  })
})

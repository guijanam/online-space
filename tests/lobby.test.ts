import { describe, expect, it } from 'vitest'
import { Lobby, shouldYield } from '../src/net/Lobby'
import type { JoinRoom, Room } from '../src/net/strategy'

describe('shouldYield (정원 초과 시 늦게 온 사람이 이동)', () => {
  const peers = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, joinedAt: from + i }))

  it('정원 + 여유분 이하면 아무도 옮기지 않는다', () => {
    expect(shouldYield({ id: 'me', joinedAt: 9_999 }, peers(22), 20, 3)).toBe(false)
  })

  it('넘치면 가장 늦게 온 사람들이 정원까지 줄인다', () => {
    // 나 포함 25명, 정원 20 → 늦게 온 5명이 이동
    const others = peers(24, 0)
    expect(shouldYield({ id: 'me', joinedAt: 100 }, others, 20, 3)).toBe(true)
    expect(shouldYield({ id: 'me', joinedAt: -1 }, others, 20, 3)).toBe(false)
  })

  it('모든 피어가 같은 결론을 낸다 (정확히 excess 명만 이동)', () => {
    const all = peers(26)
    const movers = all.filter((p) => shouldYield(p, all.filter((o) => o.id !== p.id), 20, 3))
    expect(movers.map((m) => m.id)).toEqual(['p20', 'p21', 'p22', 'p23', 'p24', 'p25'])
  })

  it('입장 시각이 같으면 id 순서로 정한다', () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `z${i}`, joinedAt: 0 }))
    const movers = all.filter((p) => shouldYield(p, all.filter((o) => o.id !== p.id), 2, 1))
    expect(movers.map((m) => m.id)).toEqual(['z2', 'z3', 'z4'])
  })
})

/** 방마다 인원이 고정된 가짜 joinRoom */
function fakeJoin(occupancy: Record<string, number>) {
  const opened: string[] = []
  const joinRoom: JoinRoom = (_cfg, roomId) => {
    opened.push(roomId)
    const n = occupancy[roomId] ?? 0
    const peers = Object.fromEntries(Array.from({ length: n }, (_, i) => [`${roomId}-p${i}`, {}]))
    return { getPeers: () => peers, leave: async () => {} } as unknown as Room
  }
  return { joinRoom, opened }
}

const opts = (joinRoom: JoinRoom) => ({
  joinRoom, appId: 't', password: 'x', capacity: 3, settleMs: 0, maxRooms: 10,
})

describe('Lobby.join (방 자동 분할)', () => {
  it('자리가 있는 첫 방에 앉는다', async () => {
    const f = fakeJoin({ 'room-1': 2 })
    expect((await new Lobby(opts(f.joinRoom)).join())?.index).toBe(1)
  })

  it('가득 찬 방은 건너뛴다', async () => {
    const f = fakeJoin({ 'room-1': 3, 'room-2': 3, 'room-3': 1 })
    expect((await new Lobby(opts(f.joinRoom)).join())?.index).toBe(3)
  })

  it('앞 방이 비고 다음 방에 사람이 있으면 그쪽으로 간다', async () => {
    const f = fakeJoin({ 'room-1': 0, 'room-2': 2 })
    expect((await new Lobby(opts(f.joinRoom)).join())?.index).toBe(2)
  })

  it('다음 방도 비었으면 처음 빈 방으로 돌아간다', async () => {
    const f = fakeJoin({})
    const seat = await new Lobby(opts(f.joinRoom)).join()
    expect(seat?.index).toBe(1)
    expect(f.opened).toEqual(['room-1', 'room-2', 'room-1'])
  })

  it('빈 방 다음 방이 가득 찼으면 빈 방으로 돌아간다', async () => {
    const f = fakeJoin({ 'room-1': 3, 'room-2': 0, 'room-3': 3 })
    expect((await new Lobby(opts(f.joinRoom)).join())?.index).toBe(2)
  })

  it('leave() 하면 진행 중인 join 이 취소된다', async () => {
    const f = fakeJoin({ 'room-1': 1 })
    const lobby = new Lobby({ ...opts(f.joinRoom), settleMs: 200 })
    const p = lobby.join()
    await lobby.leave()
    expect(await p).toBeNull()
    expect(lobby.seat).toBeNull()
  })
})

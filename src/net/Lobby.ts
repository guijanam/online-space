import type { JoinRoom, Room } from './strategy'
import type { TurnServerConfig } from 'trystero'

export type LobbyOptions = {
  joinRoom: JoinRoom
  appId: string
  password: string
  /** 방 이름 접두사 — 테마별로 다르게 해서 같은 테마끼리만 만나게 한다 */
  roomPrefix: string
  capacity: number
  settleMs: number
  maxRooms: number
  turnConfig?: TurnServerConfig[]
  onJoinError?: (message: string) => void
}

export type Seat = { room: Room; index: number; joinedAt: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const peerCount = (room: Room) => Object.keys(room.getPeers()).length

/**
 * 서버 없이 방을 나눈다.
 * room-1 부터 들어가서 피어가 모이기를 기다리고, 정원이 차 있으면 다음 방으로 넘어간다.
 * 빈 방을 만나면 바로 다음 방을 한 번 더 확인한다 — 앞 번호 방이 비었는데 뒤 번호 방에 사람들이
 * 모여 있는 경우 혼자 남지 않도록.
 */
export class Lobby {
  seat: Seat | null = null
  private token = 0

  constructor(private opts: LobbyOptions) {}

  private open(index: number): Room {
    const { joinRoom, appId, password, turnConfig, onJoinError } = this.opts
    return joinRoom(
      { appId, password, maxReceiveBytes: 1 << 20, ...(turnConfig ? { turnConfig } : {}) },
      `${this.opts.roomPrefix}-${index}`,
      { onJoinError: (d) => onJoinError?.(d.error) },
    )
  }

  /** settleMs 동안 피어를 기다린다. 정원이 차면 일찍 끝낸다. */
  private async settle(room: Room, token: number): Promise<number> {
    const end = performance.now() + this.opts.settleMs
    while (performance.now() < end && token === this.token) {
      if (peerCount(room) >= this.opts.capacity) break
      await sleep(250)
    }
    return peerCount(room)
  }

  /** 자리를 찾는다. 다른 join/leave가 끼어들면 null. */
  async join(from = 1): Promise<Seat | null> {
    const token = ++this.token
    await this.release()
    const { capacity, maxRooms } = this.opts
    let emptyFallback: number | null = null

    for (let i = from; i <= maxRooms; i++) {
      const room = this.open(i)
      const count = await this.settle(room, token)
      if (token !== this.token) {
        await room.leave()
        return null
      }
      const full = count >= capacity
      if (emptyFallback !== null) {
        // 빈 방 다음 방을 확인하는 중: 사람이 있고 자리도 있으면 여기, 아니면 빈 방으로 돌아간다
        if (count > 0 && !full) return this.take(room, i)
        await room.leave()
        break
      }
      if (full) {
        await room.leave()
        continue
      }
      if (count === 0 && i < maxRooms) {
        // 빈 방 — 다음 방을 한 번 확인해 본다
        emptyFallback = i
        await room.leave()
        continue
      }
      return this.take(room, i)
    }

    // 확인한 다음 방도 비었거나 가득 찼으면 처음 찾은 빈 방으로 돌아간다
    if (emptyFallback !== null && token === this.token) {
      return this.take(this.open(emptyFallback), emptyFallback)
    }
    return null
  }

  private take(room: Room, index: number): Seat {
    this.seat = { room, index, joinedAt: Date.now() }
    return this.seat
  }

  private async release(): Promise<void> {
    const seat = this.seat
    this.seat = null
    if (seat) await seat.room.leave()
  }

  /** 진행 중인 join을 취소하고 방을 나간다 */
  async leave(): Promise<void> {
    this.token++
    await this.release()
  }
}

/**
 * 정원 + 여유분을 넘었을 때 내가 다음 방으로 옮겨야 하는지.
 * 늦게 들어온 사람부터 (동시각이면 id 사전순 뒤쪽부터) 정원까지 줄어들 만큼 옮긴다.
 * 모든 피어가 같은 정보로 같은 판단을 하므로 조율 메시지가 필요 없다.
 */
export function shouldYield(
  self: { id: string; joinedAt: number },
  others: { id: string; joinedAt: number }[],
  capacity: number,
  overflow: number,
): boolean {
  const all = [self, ...others]
  if (all.length <= capacity + overflow) return false
  all.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const excess = all.length - capacity
  return all.slice(-excess).some((p) => p.id === self.id)
}

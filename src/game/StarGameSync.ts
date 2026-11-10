import { APP_ID, MAX_ROOMS, ROOM_CAPACITY, ROOM_PW, SETTLE_MS, TURN } from '../config'
import { GameStateMsg, MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from '../protocol'
import { Lobby } from '../net/Lobby'
import { joinRoom } from '../net/strategy'
import type { MessageAction, Room } from '../net/strategy'

type Wire = Record<string, number | string | boolean>
type LocalState = Omit<GameStateMsg, 'v' | 'joinedAt'>
type PeerState = { state: GameStateMsg; receivedAt: number }

type Handlers = {
  onPeer(peerId: string, state: GameStateMsg | null): void
  onStatus(kind: 'connecting' | 'online' | 'offline', people: number): void
}

export class StarGameSync {
  private lobby = new Lobby({
    joinRoom,
    appId: APP_ID,
    password: ROOM_PW,
    roomPrefix: 'star-catch-room',
    capacity: ROOM_CAPACITY,
    settleMs: SETTLE_MS,
    maxRooms: MAX_ROOMS,
    turnConfig: TURN,
    onJoinError: (message) => console.warn('[star-game]', message),
  })
  private room: Room | null = null
  private action: MessageAction<Wire> | null = null
  private peers = new Map<string, PeerState>()
  private local: LocalState = { round: 0, score: 0, best: 0, playing: false }
  private joinedAt = 0
  private generation = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private sendTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private lastSent = -Infinity

  constructor(private handlers: Handlers) {}

  async connect(): Promise<void> {
    await this.disconnect()
    const generation = this.generation
    this.handlers.onStatus('connecting', 0)
    const seat = await this.lobby.join()
    if (generation !== this.generation) return
    if (!seat) {
      this.handlers.onStatus('offline', 0)
      this.retryTimer = setTimeout(() => void this.connect(), 8000)
      return
    }
    this.room = seat.room
    this.joinedAt = seat.joinedAt
    this.action = this.room.makeAction<Wire>('gs', {
      onReceive: ({ byteLength }: { byteLength: number }) => byteLength <= MAX_MESSAGE_BYTES,
    })
    this.action.onMessage = (data, { peerId }) => this.receive(peerId, data)
    this.room.onPeerJoin = (peerId) => void this.send(peerId)
    this.room.onPeerLeave = (peerId) => this.removePeer(peerId)
    this.heartbeat = setInterval(() => void this.send(), 5000)
    await this.send()
    this.handlers.onStatus('online', this.peers.size)
  }

  setLocal(patch: Partial<LocalState>, immediate = false): void {
    this.local = { ...this.local, ...patch }
    if (immediate) {
      clearTimeout(this.sendTimer)
      this.sendTimer = undefined
      void this.send()
      return
    }
    if (this.sendTimer) return
    const wait = Math.max(0, 100 - (performance.now() - this.lastSent))
    this.sendTimer = setTimeout(() => {
      this.sendTimer = undefined
      void this.send()
    }, wait)
  }

  async disconnect(): Promise<void> {
    this.generation++
    clearTimeout(this.retryTimer)
    clearTimeout(this.sendTimer)
    clearInterval(this.heartbeat)
    this.retryTimer = this.sendTimer = this.heartbeat = undefined
    if (this.action) this.action.onMessage = null
    if (this.room) {
      this.room.onPeerJoin = null
      this.room.onPeerLeave = null
    }
    this.action = null
    this.room = null
    for (const id of this.peers.keys()) this.handlers.onPeer(id, null)
    this.peers.clear()
    await this.lobby.leave()
  }

  private async send(target?: string): Promise<void> {
    if (!this.action) return
    this.lastSent = performance.now()
    const message: GameStateMsg = { v: PROTOCOL_VERSION, joinedAt: this.joinedAt, ...this.local }
    await this.action.send(message, target ? { target } : undefined).catch(() => {})
  }

  private receive(peerId: string, data: unknown): void {
    const parsed = GameStateMsg.safeParse(data)
    if (!parsed.success) return
    const state = parsed.data
    const now = performance.now()
    const previous = this.peers.get(peerId)
    if (previous && now - previous.receivedAt < 80) return
    if (previous && previous.state.joinedAt === state.joinedAt) {
      if (state.round < previous.state.round) return
      if (state.round === previous.state.round && state.score < previous.state.score) return
    }
    const isNew = !previous
    this.peers.set(peerId, { state, receivedAt: now })
    this.handlers.onPeer(peerId, state)
    this.handlers.onStatus(navigator.onLine ? 'online' : 'offline', this.peers.size)
    if (isNew) void this.send(peerId)
  }

  private removePeer(peerId: string): void {
    if (!this.peers.delete(peerId)) return
    this.handlers.onPeer(peerId, null)
    this.handlers.onStatus(navigator.onLine ? 'online' : 'offline', this.peers.size)
  }
}

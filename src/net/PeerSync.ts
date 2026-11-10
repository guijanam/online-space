import type { ActionId } from '../actions'
import { HEARTBEAT_MS } from '../config'
import { checkLanternText } from '../lantern/filter'
import { ActMsg, LanternMsg, MAX_MESSAGE_BYTES, MoveMsg, PROTOCOL_VERSION, StateMsg, clampToWorld, round2 } from '../protocol'
import { ReceiveGuard } from './limits'
import type { MessageAction, Room } from './strategy'

export type PeerHandlers = {
  /** 피어 상태 수신 (처음이면 isNew=true) */
  onState(peerId: string, s: StateMsg, isNew: boolean): void
  /** seat: 가려는 자리 번호 (-1 = 그냥 걷기) */
  onMove(peerId: string, x: number, z: number, seat: number): void
  onAction(peerId: string, id: ActionId): void
  /** 풍등 (글은 이미 검사를 통과한 것) */
  onLantern(peerId: string, text: string): void
  onLeave(peerId: string): void
  /** 도배로 숨김 처리된 피어 */
  onMuted(peerId: string): void
}

export type SelfSnapshot = () => { x: number; z: number; joinedAt: number; seat: number }

type Wire = Record<string, number | string>

/**
 * Trystero 방 위에서 상태/이동/행동을 주고받는다.
 * 받은 메시지는 모두 크기 → 스키마 → 속도 순서로 검사한다.
 */
export class PeerSync {
  private st: MessageAction<Wire>
  private mv: MessageAction<Wire>
  private ac: MessageAction<Wire>
  private ln: MessageAction<Wire>
  private known = new Set<string>()
  private heartbeat: ReturnType<typeof setInterval> | undefined
  readonly guard = new ReceiveGuard()

  constructor(
    private room: Room,
    private self: SelfSnapshot,
    private h: PeerHandlers,
  ) {
    const onReceive = ({ byteLength }: { byteLength: number }) => byteLength <= MAX_MESSAGE_BYTES
    this.st = room.makeAction<Wire>('st', { onReceive })
    this.mv = room.makeAction<Wire>('mv', { onReceive })
    this.ac = room.makeAction<Wire>('ac', { onReceive })
    this.ln = room.makeAction<Wire>('ln', { onReceive })

    this.st.onMessage = (data, { peerId }) => this.recvState(peerId, data)
    this.mv.onMessage = (data, { peerId }) => this.recvMove(peerId, data)
    this.ac.onMessage = (data, { peerId }) => this.recvAction(peerId, data)
    this.ln.onMessage = (data, { peerId }) => this.recvLantern(peerId, data)

    // 새 피어에게는 내 상태를 바로 보낸다
    room.onPeerJoin = (peerId) => void this.sendState(peerId)
    room.onPeerLeave = (peerId) => this.drop(peerId)
  }

  /** 방에 이미 있던 피어들에게도 내 상태를 알리고 하트비트를 시작한다 */
  start(): void {
    void this.sendState()
    this.heartbeat = setInterval(() => void this.sendState(), HEARTBEAT_MS)
  }

  stop(): void {
    clearInterval(this.heartbeat)
    this.room.onPeerJoin = null
    this.room.onPeerLeave = null
    this.st.onMessage = this.mv.onMessage = this.ac.onMessage = this.ln.onMessage = null
    for (const id of this.known) this.h.onLeave(id)
    this.known.clear()
  }

  /** 상태가 확인된 (화면에 보이는) 피어들 */
  peers(): string[] {
    return [...this.known]
  }

  sendState(target?: string): Promise<void> {
    const s = this.self()
    const msg: StateMsg = { v: PROTOCOL_VERSION, x: round2(s.x), z: round2(s.z), joinedAt: s.joinedAt, seat: s.seat }
    return this.st.send(msg, target ? { target } : undefined).catch(() => {})
  }

  sendMove(x: number, z: number, seat = -1): void {
    void this.mv.send({ x: round2(x), z: round2(z), seat }).catch(() => {})
  }

  sendAction(id: ActionId): void {
    void this.ac.send({ id }).catch(() => {})
  }

  sendLantern(text: string): void {
    void this.ln.send({ text }).catch(() => {})
  }

  private reject(peerId: string): void {
    this.guard.noteInvalid(peerId)
    this.checkMuted(peerId)
  }

  private checkMuted(peerId: string): boolean {
    if (!this.guard.isMuted(peerId)) return false
    if (this.known.delete(peerId)) this.h.onMuted(peerId)
    return true
  }

  private recvState(peerId: string, data: unknown): void {
    if (this.guard.isMuted(peerId)) return
    const r = StateMsg.safeParse(data)
    if (!r.success) return this.reject(peerId)
    const isNew = !this.known.has(peerId)
    if (!this.guard.allowState(peerId) && !isNew) return
    const p = clampToWorld(r.data.x, r.data.z)
    this.known.add(peerId)
    this.h.onState(peerId, { ...r.data, ...p }, isNew)
    // 상대가 나를 아직 모를 수 있으니 (메시지 순서가 엇갈린 경우) 처음 만나면 답장한다
    if (isNew) void this.sendState(peerId)
  }

  private recvMove(peerId: string, data: unknown): void {
    if (!this.known.has(peerId)) return
    const r = MoveMsg.safeParse(data)
    if (!r.success) return this.reject(peerId)
    if (!this.guard.allowMove(peerId)) return void this.checkMuted(peerId)
    const p = clampToWorld(r.data.x, r.data.z)
    this.h.onMove(peerId, p.x, p.z, r.data.seat ?? -1)
  }

  private recvAction(peerId: string, data: unknown): void {
    if (!this.known.has(peerId)) return
    const r = ActMsg.safeParse(data)
    if (!r.success) return this.reject(peerId)
    if (!this.guard.allowAction(peerId, r.data.id)) return void this.checkMuted(peerId)
    this.h.onAction(peerId, r.data.id)
  }

  private recvLantern(peerId: string, data: unknown): void {
    if (!this.known.has(peerId)) return
    const r = LanternMsg.safeParse(data)
    if (!r.success) return this.reject(peerId)
    const c = checkLanternText(r.data.text)
    if (!c.ok) return this.reject(peerId) // 필터를 건너뛴 클라이언트
    if (!this.guard.allowLantern(peerId)) return void this.checkMuted(peerId)
    this.h.onLantern(peerId, c.text)
  }

  private drop(peerId: string): void {
    this.guard.forget(peerId)
    if (this.known.delete(peerId)) this.h.onLeave(peerId)
  }
}

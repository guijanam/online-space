import { getAction, type ActionId } from '../actions'

type Clock = () => number
const defaultClock: Clock = () => performance.now()

/** 보내는 쪽 제한 — 버튼 잠금/게이지 표시에 쓴다. */
export const SEND_LIMITS = {
  globalMax: 4,
  globalWindowMs: 10_000,
  moveMinGapMs: 1_000,
}

/**
 * 받는 쪽 제한 — 네트워크 지연으로 정상 사용자가 걸리지 않도록 보내는 쪽보다 약간 느슨하다.
 * 조작된 클라이언트가 도배를 보내도 다른 사람 화면에는 이 속도로만 보인다.
 */
export const RECEIVE_LIMITS = {
  toleranceMs: 600,
  globalMax: 5,
  globalWindowMs: 10_000,
  moveMinGapMs: 700,
  stateMinGapMs: 2_000,
  /** strikeWindowMs 안에 위반이 strikeMax 번 쌓이면 이번 세션 동안 숨긴다 */
  strikeMax: 8,
  strikeWindowMs: 30_000,
}

export class SendLimiter {
  private last = new Map<ActionId, number>()
  private recent: number[] = []
  private lastMove = -Infinity

  constructor(
    private cfg = SEND_LIMITS,
    private now: Clock = defaultClock,
  ) {}

  /** 행동 쿨타임 남은 시간(ms)과 진행률(0=방금 사용, 1=사용 가능) */
  actionCooldown(id: ActionId): { remainingMs: number; totalMs: number } {
    const t = this.now()
    const cd = getAction(id).cooldownMs
    const last = this.last.get(id)
    const own = last === undefined ? 0 : Math.max(0, last + cd - t)
    return { remainingMs: own, totalMs: cd }
  }

  /** 전역 리밋에 걸려 있으면 풀릴 때까지 남은 시간 */
  globalRemaining(): number {
    const t = this.now()
    this.recent = this.recent.filter((x) => t - x < this.cfg.globalWindowMs)
    if (this.recent.length < this.cfg.globalMax) return 0
    return this.recent[0] + this.cfg.globalWindowMs - t
  }

  canAct(id: ActionId): boolean {
    return this.actionCooldown(id).remainingMs <= 0 && this.globalRemaining() <= 0
  }

  /** 사용 가능하면 기록하고 true */
  tryAct(id: ActionId): boolean {
    if (!this.canAct(id)) return false
    const t = this.now()
    this.last.set(id, t)
    this.recent.push(t)
    return true
  }

  /** 이동 전송까지 기다려야 하는 시간 (0이면 바로 가능) */
  moveWait(): number {
    return Math.max(0, this.lastMove + this.cfg.moveMinGapMs - this.now())
  }

  markMove(): void {
    this.lastMove = this.now()
  }
}

type PeerRecord = {
  lastAction: Map<ActionId, number>
  recent: number[]
  lastMove: number
  lastState: number
  strikes: number[]
  muted: boolean
}

export class ReceiveGuard {
  private peers = new Map<string, PeerRecord>()

  constructor(
    private cfg = RECEIVE_LIMITS,
    private now: Clock = defaultClock,
  ) {}

  private rec(id: string): PeerRecord {
    let r = this.peers.get(id)
    if (!r) {
      r = { lastAction: new Map(), recent: [], lastMove: -Infinity, lastState: -Infinity, strikes: [], muted: false }
      this.peers.set(id, r)
    }
    return r
  }

  private strike(r: PeerRecord, t: number): void {
    r.strikes = r.strikes.filter((x) => t - x < this.cfg.strikeWindowMs)
    r.strikes.push(t)
    if (r.strikes.length >= this.cfg.strikeMax) r.muted = true
  }

  allowAction(peerId: string, id: ActionId): boolean {
    const r = this.rec(peerId)
    if (r.muted) return false
    const t = this.now()
    r.recent = r.recent.filter((x) => t - x < this.cfg.globalWindowMs)
    const last = r.lastAction.get(id)
    const tooSoon = last !== undefined && t - last < getAction(id).cooldownMs - this.cfg.toleranceMs
    if (tooSoon || r.recent.length >= this.cfg.globalMax) {
      this.strike(r, t)
      return false
    }
    r.lastAction.set(id, t)
    r.recent.push(t)
    return true
  }

  allowMove(peerId: string): boolean {
    const r = this.rec(peerId)
    if (r.muted) return false
    const t = this.now()
    if (t - r.lastMove < this.cfg.moveMinGapMs) {
      this.strike(r, t)
      return false
    }
    r.lastMove = t
    return true
  }

  /**
   * 상태(st) 메시지 — 입장 직후에는 정상적으로도 2~3개가 몰려 오므로 위반으로 치지 않고 무시만 한다.
   * 처음 받는 상태는 항상 허용.
   */
  allowState(peerId: string): boolean {
    const r = this.rec(peerId)
    if (r.muted) return false
    const t = this.now()
    if (t - r.lastState < this.cfg.stateMinGapMs) return false
    r.lastState = t
    return true
  }

  /** 스키마에 맞지 않는 메시지 */
  noteInvalid(peerId: string): void {
    this.strike(this.rec(peerId), this.now())
  }

  isMuted(peerId: string): boolean {
    return this.peers.get(peerId)?.muted ?? false
  }

  forget(peerId: string): void {
    this.peers.delete(peerId)
  }
}

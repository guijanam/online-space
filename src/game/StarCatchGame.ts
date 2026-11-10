import './game.css'
import type { GameStateMsg } from '../protocol'
import { hueFor, nicknameFor } from '../identity'
import { selfId } from '../net/strategy'
import { StarGameSync } from './StarGameSync'
import { GAME_DURATION_MS, fallSpeed, scoreAfterCatch, spawnDelayMs, type FallingKind } from './rules'

type FallingStar = {
  el: HTMLButtonElement
  kind: FallingKind
  x: number
  y: number
  speed: number
}

type RankEntry = {
  id: string
  score: number
  best: number
  playing: boolean
}

const BEST_KEY = 'starCatch.best'
const loadBest = (): number => {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0)
  } catch {
    return 0
  }
}

export class StarCatchGame {
  private field: HTMLElement
  private overlay: HTMLElement
  private title: HTMLElement
  private message: HTMLElement
  private scoreEl: HTMLElement
  private bestEl: HTMLElement
  private timeEl: HTMLElement
  private connectionEl: HTMLElement
  private rankEl: HTMLOListElement
  private sync: StarGameSync
  private peers = new Map<string, GameStateMsg>()
  private stars = new Map<number, FallingStar>()
  private nextStarId = 0
  private score = 0
  private best = loadBest()
  private round = 0
  private playing = false
  private endsAt = 0
  private lastFrame = 0
  private spawnTimer = 0
  private animationFrame = 0

  constructor(private host: HTMLElement) {
    const q = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!
    this.field = q('#game-field')
    this.overlay = q('#game-overlay')
    this.title = q('#game-title')
    this.message = q('#game-message')
    this.scoreEl = q('#game-score')
    this.bestEl = q('#game-best')
    this.timeEl = q('#game-time')
    this.connectionEl = q('#game-connection')
    this.rankEl = q<HTMLOListElement>('#game-rank')
    q<HTMLButtonElement>('#game-start').addEventListener('click', () => this.startRound())
    this.sync = new StarGameSync({
      onPeer: (id, state) => {
        if (state) this.peers.set(id, state)
        else this.peers.delete(id)
        this.renderRank()
      },
      onStatus: (kind, people) => {
        this.connectionEl.textContent =
          kind === 'connecting'
            ? '함께할 친구를 찾는 중…'
            : kind === 'offline'
              ? '네트워크 대기 중 · 혼자 플레이할 수 있어요'
              : people > 0
                ? `${people + 1}명이 실시간으로 점수를 나누는 중`
                : '혼자 플레이 중 · 친구가 들어오면 점수가 보여요'
      },
    })
  }

  start(): void {
    this.host.hidden = false
    this.bestEl.textContent = String(this.best)
    this.renderRank()
    this.sync.setLocal({ best: this.best })
    document.addEventListener('visibilitychange', this.onVisibility)
    addEventListener('pagehide', this.onPageHide)
    addEventListener('online', this.onOnline)
    addEventListener('offline', this.onOffline)
    void this.sync.connect()
  }

  private startRound(): void {
    this.clearStars()
    cancelAnimationFrame(this.animationFrame)
    this.round++
    this.score = 0
    this.scoreEl.textContent = '0'
    this.timeEl.textContent = '30'
    this.playing = true
    this.endsAt = performance.now() + GAME_DURATION_MS
    this.lastFrame = performance.now()
    this.spawnTimer = 0
    this.overlay.hidden = true
    this.sync.setLocal({ round: this.round, score: 0, best: this.best, playing: true }, true)
    this.renderRank()
    this.animationFrame = requestAnimationFrame(this.frame)
  }

  private frame = (now: number): void => {
    if (!this.playing) return
    const remaining = Math.max(0, this.endsAt - now)
    const seconds = String(Math.ceil(remaining / 1000))
    if (this.timeEl.textContent !== seconds) this.timeEl.textContent = seconds
    if (remaining <= 0) {
      this.finishRound()
      return
    }
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const elapsed = GAME_DURATION_MS - remaining
    this.spawnTimer -= dt * 1000
    if (this.spawnTimer <= 0) {
      this.spawn(elapsed)
      this.spawnTimer = spawnDelayMs(elapsed)
    }
    const height = this.field.clientHeight
    for (const [id, star] of this.stars) {
      star.y += star.speed * dt
      star.el.style.transform = `translate3d(${star.x}px,${star.y}px,0)`
      if (star.y > height) {
        star.el.remove()
        this.stars.delete(id)
      }
    }
    this.animationFrame = requestAnimationFrame(this.frame)
  }

  private spawn(elapsed: number): void {
    const id = this.nextStarId++
    const kind: FallingKind = Math.random() < 0.17 ? 'bomb' : 'star'
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `falling-star${kind === 'bomb' ? ' bomb' : ''}`
    el.textContent = kind === 'bomb' ? '💣' : '⭐'
    el.setAttribute('aria-label', kind === 'bomb' ? '폭탄, 누르지 않기' : '별 받기')
    const star: FallingStar = {
      el,
      kind,
      x: Math.random() * Math.max(1, this.field.clientWidth - 52),
      y: -52,
      speed: fallSpeed(elapsed, Math.random()),
    }
    el.style.transform = `translate3d(${star.x}px,${star.y}px,0)`
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.collect(id)
    })
    this.stars.set(id, star)
    this.field.appendChild(el)
  }

  private collect(id: number): void {
    if (!this.playing) return
    const star = this.stars.get(id)
    if (!star) return
    this.stars.delete(id)
    star.el.remove()
    this.score = scoreAfterCatch(this.score, star.kind)
    this.scoreEl.textContent = String(this.score)
    const delta = star.kind === 'star' ? '+10' : '−20'
    const pop = document.createElement('span')
    pop.className = `score-pop${star.kind === 'bomb' ? ' minus' : ''}`
    pop.textContent = delta
    pop.style.left = `${star.x + 10}px`
    pop.style.top = `${star.y + 8}px`
    this.field.appendChild(pop)
    setTimeout(() => pop.remove(), 700)
    navigator.vibrate?.(star.kind === 'bomb' ? 25 : 8)
    this.sync.setLocal({ score: this.score })
    this.renderRank()
  }

  private finishRound(): void {
    if (!this.playing) return
    this.playing = false
    cancelAnimationFrame(this.animationFrame)
    this.clearStars()
    if (this.score > this.best) {
      this.best = this.score
      this.bestEl.textContent = String(this.best)
      try {
        localStorage.setItem(BEST_KEY, String(this.best))
      } catch {
        /* 저장이 막혀 있어도 이번 게임의 최고 점수는 유지한다 */
      }
    }
    this.sync.setLocal({ score: this.score, best: this.best, playing: false }, true)
    this.title.textContent = `${this.score}점!`
    this.message.textContent =
      this.score >= this.best && this.score > 0
        ? '최고 기록이에요! 한 번 더 도전해 볼까요?'
        : `최고 기록은 ${this.best}점이에요. 한 번 더 도전해 보세요.`
    qStart(this.host).textContent = '다시 하기'
    this.overlay.hidden = false
    this.renderRank()
  }

  private clearStars(): void {
    for (const star of this.stars.values()) star.el.remove()
    this.stars.clear()
  }

  private renderRank(): void {
    const entries: RankEntry[] = [
      { id: selfId, score: this.score, best: this.best, playing: this.playing },
      ...[...this.peers].map(([id, state]) => ({
        id,
        score: state.score,
        best: state.best,
        playing: state.playing,
      })),
    ]
    entries.sort(
      (a, b) => b.score - a.score || b.best - a.best || nicknameFor(a.id).localeCompare(nicknameFor(b.id)),
    )
    const me = entries.find((entry) => entry.id === selfId)!
    const visible = entries.slice(0, 4)
    if (!visible.includes(me)) visible.splice(3, 1, me)
    this.rankEl.replaceChildren()
    for (const entry of visible) {
      const row = document.createElement('li')
      if (entry.id === selfId) row.className = 'me'
      const rank = document.createElement('span')
      rank.className = 'rank-no'
      rank.textContent = `${entries.indexOf(entry) + 1}`
      const dot = document.createElement('span')
      dot.className = 'rank-dot'
      dot.style.setProperty('--player-color', `hsl(${hueFor(entry.id) * 360} 75% 72%)`)
      const name = document.createElement('span')
      name.className = 'rank-name'
      name.textContent = `${nicknameFor(entry.id)}${entry.id === selfId ? ' (나)' : ''}`
      const detail = document.createElement('small')
      detail.textContent = entry.playing ? '게임 중' : `최고 ${entry.best}`
      name.appendChild(detail)
      const score = document.createElement('strong')
      score.textContent = `${entry.score}점`
      row.append(rank, dot, name, score)
      this.rankEl.appendChild(row)
    }
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.finishRound()
      void this.sync.disconnect()
    } else {
      void this.sync.connect()
    }
  }

  private onPageHide = (): void => void this.sync.disconnect()
  private onOnline = (): void => void this.sync.connect()
  private onOffline = (): void => {
    this.connectionEl.textContent = '네트워크 대기 중 · 혼자 플레이할 수 있어요'
  }
}

function qStart(host: HTMLElement): HTMLButtonElement {
  return host.querySelector<HTMLButtonElement>('#game-start')!
}

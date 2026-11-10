import './subway.css'
import {
  SURVIVAL_SECONDS,
  applyUpgrade,
  createGame,
  updateGame,
  upgradeChoices,
  type Enemy,
  type SubwayState,
} from './engine'

const BEST_KILLS_KEY = 'subway.bestKills'
const BEST_TIME_KEY = 'subway.bestTime'
const numberRecord = (key: string): number => {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0)
  } catch {
    return 0
  }
}
const saveRecord = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* 저장이 막혀 있어도 게임은 계속할 수 있다 */
  }
}
const clockText = (seconds: number): string => {
  const value = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export class SubwayGame {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private overlay: HTMLElement
  private logo: HTMLElement
  private title: HTMLElement
  private message: HTMLElement
  private record: HTMLElement
  private startButton: HTMLButtonElement
  private upgrades: HTMLElement
  private timeEl: HTMLElement
  private killsEl: HTMLElement
  private levelEl: HTMLElement
  private hpEl: HTMLElement
  private hpBar: HTMLElement
  private xpBar: HTMLElement
  private joystick: HTMLElement
  private joystickKnob: HTMLElement
  private state: SubwayState = createGame(390, 844)
  private keys = new Set<string>()
  private stick = { x: 0, y: 0 }
  private stickPointer: number | null = null
  private lastFrame = 0
  private shownStatus = this.state.status

  constructor(private host: HTMLElement) {
    const q = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!
    this.canvas = q<HTMLCanvasElement>('#subway-canvas')
    this.ctx = this.canvas.getContext('2d')!
    this.overlay = q('#subway-overlay')
    this.logo = q('#subway-logo')
    this.title = q('#subway-title')
    this.message = q('#subway-message')
    this.record = q('#subway-record')
    this.startButton = q<HTMLButtonElement>('#subway-start')
    this.upgrades = q('#subway-upgrades')
    this.timeEl = q('#subway-time')
    this.killsEl = q('#subway-kills')
    this.levelEl = q('#subway-level')
    this.hpEl = q('#subway-hp')
    this.hpBar = q('#subway-hp-bar')
    this.xpBar = q('#subway-xp-bar')
    this.joystick = q('#subway-joystick')
    this.joystickKnob = this.joystick.querySelector('span')!
    this.startButton.addEventListener('click', () => this.pressStart())
    q<HTMLButtonElement>('#subway-pause').addEventListener('click', () => this.togglePause())
    this.bindControls()
  }

  start(): void {
    this.host.hidden = false
    this.resize()
    new ResizeObserver(() => this.resize()).observe(this.host)
    document.addEventListener('visibilitychange', this.onVisibility)
    const bestKills = numberRecord(BEST_KILLS_KEY)
    if (bestKills > 0) this.record.textContent = `최다 처치 ${bestKills} · 최대 생존 ${Math.floor(numberRecord(BEST_TIME_KEY))}초`
    this.lastFrame = performance.now()
    requestAnimationFrame(this.frame)
    const game = this
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __subway: {
          get status() { return game.state.status },
          get player() { return { ...game.state.player } },
          get enemies() { return game.state.enemies.length },
          get bullets() { return game.state.bullets.length },
          get time() { return game.state.time },
          get kills() { return game.state.kills },
        },
      })
    }
  }

  private resize(): void {
    const width = this.host.clientWidth || 390
    const height = this.host.clientHeight || 844
    const dpr = Math.min(devicePixelRatio, 2)
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.state.width = width
    this.state.height = height
    this.state.player.x = Math.max(14, Math.min(width - 14, this.state.player.x))
    this.state.player.y = Math.max(14, Math.min(height - 14, this.state.player.y))
  }

  private pressStart(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running'
      this.syncOverlay()
      return
    }
    if (!['idle', 'over', 'won'].includes(this.state.status)) return
    this.state = createGame(this.host.clientWidth, this.host.clientHeight)
    this.state.status = 'running'
    this.stick = { x: 0, y: 0 }
    this.overlay.hidden = true
    this.upgrades.hidden = true
    this.syncOverlay()
  }

  private togglePause(): void {
    if (this.state.status === 'running') this.state.status = 'paused'
    else if (this.state.status === 'paused') this.state.status = 'running'
    this.syncOverlay()
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const keyboardX = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'))
    const keyboardY = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'))
    updateGame(this.state, { x: this.stick.x + keyboardX, y: this.stick.y + keyboardY }, dt)
    this.render()
    this.updateHud()
    this.syncOverlay()
    requestAnimationFrame(this.frame)
  }

  private syncOverlay(): void {
    if (this.shownStatus === this.state.status) return
    this.shownStatus = this.state.status
    if (this.state.status === 'running') {
      this.overlay.hidden = true
      return
    }
    if (this.state.status === 'levelup') {
      this.showUpgrades()
      return
    }
    if (this.state.status === 'paused') {
      this.logo.textContent = '⏸️'
      this.title.textContent = '잠시 멈췄어요'
      this.message.textContent = '준비가 되면 이어서 플레이하세요.'
      this.startButton.hidden = false
      this.startButton.textContent = '계속하기'
      this.upgrades.hidden = true
      this.record.textContent = '게임이 일시정지되었습니다'
      this.overlay.hidden = false
      return
    }
    if (this.state.status === 'over' || this.state.status === 'won') this.showResult()
  }

  private showUpgrades(): void {
    this.logo.textContent = '⬆️'
    this.title.textContent = `레벨 ${this.state.level}`
    this.message.textContent = '새로운 대응 능력을 선택하세요.'
    this.startButton.hidden = true
    this.upgrades.replaceChildren()
    for (const upgrade of upgradeChoices(this.state)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'upgrade-choice'
      const emoji = document.createElement('span')
      emoji.className = 'emoji'
      emoji.textContent = upgrade.emoji
      const name = document.createElement('strong')
      name.textContent = upgrade.name
      const description = document.createElement('small')
      description.textContent = upgrade.description
      button.append(emoji, name, description)
      button.addEventListener('click', () => {
        applyUpgrade(this.state, upgrade.id)
        this.upgrades.hidden = true
        this.overlay.hidden = true
        this.syncOverlay()
      })
      this.upgrades.appendChild(button)
    }
    this.upgrades.hidden = false
    this.record.textContent = '선택하는 동안 게임이 멈춥니다'
    this.overlay.hidden = false
  }

  private showResult(): void {
    const won = this.state.status === 'won'
    const bestKills = Math.max(numberRecord(BEST_KILLS_KEY), this.state.kills)
    const bestTime = Math.max(numberRecord(BEST_TIME_KEY), this.state.time)
    saveRecord(BEST_KILLS_KEY, bestKills)
    saveRecord(BEST_TIME_KEY, bestTime)
    this.logo.textContent = won ? '🏆' : '🚨'
    this.title.textContent = won ? '3분 생존 성공!' : '이번 운행은 종료'
    this.message.textContent = `빌런 ${this.state.kills}명 처치 · 레벨 ${this.state.level}\n생존 시간 ${Math.floor(this.state.time)}초`
    this.message.style.whiteSpace = 'pre-line'
    this.startButton.hidden = false
    this.startButton.textContent = '다시 도전'
    this.upgrades.hidden = true
    this.record.textContent = `최다 처치 ${bestKills} · 최대 생존 ${Math.floor(bestTime)}초`
    this.overlay.hidden = false
  }

  private updateHud(): void {
    this.timeEl.textContent = clockText(SURVIVAL_SECONDS - this.state.time)
    this.killsEl.textContent = String(this.state.kills)
    this.levelEl.textContent = String(this.state.level)
    this.hpEl.textContent = `${Math.ceil(this.state.player.hp)} / ${this.state.player.maxHp}`
    this.hpBar.style.transform = `scaleX(${this.state.player.hp / this.state.player.maxHp})`
    this.xpBar.style.transform = `scaleX(${Math.min(1, this.state.xp / this.state.xpNext)})`
  }

  private render(): void {
    const { width: w, height: h } = this.state
    const ctx = this.ctx
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#17252e'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2b3c43'
    ctx.fillRect(w * 0.17, 0, w * 0.66, h)
    ctx.strokeStyle = 'rgba(155,190,199,0.1)'
    ctx.lineWidth = 1
    for (let y = 0; y < h; y += 72) {
      ctx.beginPath()
      ctx.moveTo(w * 0.17, y)
      ctx.lineTo(w * 0.83, y)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(230,209,118,0.28)'
    ctx.setLineDash([12, 14])
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.stroke()
    ctx.setLineDash([])
    for (let y = 112; y < h; y += 168) this.drawSeats(y)
    for (const gem of this.state.gems) {
      ctx.save()
      ctx.translate(gem.x, gem.y)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = '#67dcf5'
      ctx.shadowColor = '#67dcf5'
      ctx.shadowBlur = 8
      ctx.fillRect(-5, -5, 10, 10)
      ctx.restore()
    }
    for (const bullet of this.state.bullets) {
      ctx.fillStyle = '#ffe394'
      ctx.shadowColor = '#ffe394'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
    for (const enemy of this.state.enemies) this.drawEnemy(enemy)
    this.drawPlayer()
    if (this.state.time > 55 && this.state.time < 60) {
      ctx.fillStyle = 'rgba(100,20,25,0.8)'
      ctx.fillRect(0, 124, w, 34)
      ctx.fillStyle = '#ffd4d4'
      ctx.font = '700 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('⚠ 강한 빌런이 접근하고 있습니다', w / 2, 146)
    }
    if (this.state.invincible > 0.42) {
      ctx.strokeStyle = 'rgba(255,75,75,0.45)'
      ctx.lineWidth = 14
      ctx.strokeRect(0, 0, w, h)
    }
  }

  private drawSeats(y: number): void {
    const { width: w } = this.state
    const ctx = this.ctx
    for (const side of [-1, 1]) {
      const x = side < 0 ? 8 : w - w * 0.14 - 8
      ctx.fillStyle = '#416575'
      ctx.beginPath()
      ctx.roundRect(x, y, w * 0.14, 102, 10)
      ctx.fill()
      ctx.fillStyle = '#20343e'
      ctx.fillRect(side < 0 ? x + w * 0.14 - 5 : x, y + 7, 5, 88)
      ctx.strokeStyle = 'rgba(185,218,227,0.25)'
      ctx.beginPath()
      ctx.moveTo(x + 8, y + 51)
      ctx.lineTo(x + w * 0.14 - 8, y + 51)
      ctx.stroke()
    }
  }

  private drawPlayer(): void {
    const { player } = this.state
    const ctx = this.ctx
    ctx.save()
    if (this.state.invincible > 0 && Math.floor(this.state.time * 18) % 2 === 0) ctx.globalAlpha = 0.35
    ctx.fillStyle = 'rgba(98,207,245,0.18)'
    ctx.beginPath()
    ctx.arc(player.x, player.y, player.r + 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#62bfe2'
    ctx.beginPath()
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f4d3b3'
    ctx.beginPath()
    ctx.arc(player.x, player.y - 3, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#173f62'
    ctx.beginPath()
    ctx.arc(player.x, player.y - 7, 9, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(player.x - 10, player.y - 8, 20, 3)
    ctx.fillStyle = '#18303b'
    ctx.fillRect(player.x - 5, player.y - 3, 2, 2)
    ctx.fillRect(player.x + 3, player.y - 3, 2, 2)
    ctx.restore()
  }

  private drawEnemy(enemy: Enemy): void {
    const ctx = this.ctx
    const color = enemy.kind === 'boss' ? '#a84862' : enemy.kind === 'blocker' ? '#875b9e' : enemy.kind === 'sprinter' ? '#dc8650' : '#b65757'
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(enemy.x, enemy.y + enemy.r * 0.8, enemy.r, enemy.r * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = enemy.kind === 'boss' ? 4 : 2
    ctx.stroke()
    ctx.strokeStyle = '#321d25'
    ctx.lineWidth = 2
    const eye = Math.max(3, enemy.r * 0.25)
    ctx.beginPath()
    ctx.moveTo(enemy.x - eye - 3, enemy.y - 4)
    ctx.lineTo(enemy.x - 2, enemy.y - 2)
    ctx.moveTo(enemy.x + eye + 3, enemy.y - 4)
    ctx.lineTo(enemy.x + 2, enemy.y - 2)
    ctx.stroke()
    ctx.fillStyle = '#321d25'
    ctx.fillRect(enemy.x - 4, enemy.y + 5, 8, 2)
    if (enemy.kind === 'boss') {
      ctx.fillStyle = '#ffd77b'
      ctx.font = '700 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('막차 빌런', enemy.x, enemy.y - enemy.r - 12)
    }
    if (enemy.hp < enemy.maxHp || enemy.kind === 'boss') {
      const width = enemy.r * 2
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 7, width, 4)
      ctx.fillStyle = '#ef8a8a'
      ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 7, width * Math.max(0, enemy.hp / enemy.maxHp), 4)
    }
  }

  private bindControls(): void {
    const moveStick = (event: PointerEvent): void => {
      const rect = this.joystick.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      const length = Math.hypot(dx, dy)
      const scale = length > 38 ? 38 / length : 1
      const x = dx * scale
      const y = dy * scale
      this.stick = { x: x / 38, y: y / 38 }
      this.joystickKnob.style.transform = `translate(${x}px,${y}px)`
    }
    this.joystick.addEventListener('pointerdown', (event) => {
      this.stickPointer = event.pointerId
      this.joystick.setPointerCapture(event.pointerId)
      moveStick(event)
    })
    this.joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.stickPointer) moveStick(event)
    })
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointer) return
      this.stickPointer = null
      this.stick = { x: 0, y: 0 }
      this.joystickKnob.style.transform = ''
    }
    this.joystick.addEventListener('pointerup', release)
    this.joystick.addEventListener('pointercancel', release)
    addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault()
        this.keys.add(key)
      }
    })
    addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()))
  }

  private onVisibility = (): void => {
    if (!document.hidden || this.state.status !== 'running') return
    this.state.status = 'paused'
    this.syncOverlay()
  }
}

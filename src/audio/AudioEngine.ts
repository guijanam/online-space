import { makeNoise, type Kit } from './synth'
import { AMBIENCES, footstep, type Ambience, type AmbienceId, type FootstepKind } from './sounds'

const KEY = 'space.sound'
/** 전체 볼륨 (휴대폰 스피커 기준). 컴프레서가 튀는 소리를 눌러준다. */
const MASTER_VOLUME = 2

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

function saveEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* 저장 안 되는 환경 */
  }
}

/**
 * 배경 소리 + 발소리.
 * 모바일 브라우저·웹뷰는 사용자가 화면을 누른 순간에만 소리를 켤 수 있어서
 * unlock() 을 터치 이벤트 안에서 불러야 한다.
 */
export class AudioEngine {
  enabled = loadEnabled()
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private kit: Kit | null = null
  private ambienceId: AmbienceId | null = null
  private ambience: Ambience | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private paused = false
  private listener = { x: 0, z: 0 }

  /** 터치/클릭 핸들러 안에서 호출 */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      const master = ctx.createGain()
      master.gain.value = 0
      // 여러 소리가 겹쳐도 찢어지지 않게
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 4
      master.connect(comp).connect(ctx.destination)
      this.ctx = ctx
      this.master = master
      this.kit = { ctx, out: master, noise: makeNoise(ctx) }
    }
    this.apply()
  }

  setAmbience(id: AmbienceId): void {
    this.ambienceId = id
    this.apply()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    saveEnabled(on)
    this.apply()
  }

  /** 백그라운드로 갈 때 */
  pause(): void {
    this.paused = true
    this.apply()
  }

  /** 화면으로 돌아왔을 때 (막히면 다음 터치에서 다시 켠다) */
  resume(): void {
    this.paused = false
    this.apply()
    if (this.ctx?.state !== 'running' && this.enabled) {
      const retry = () => this.unlock()
      addEventListener('pointerdown', retry, { once: true, capture: true })
    }
  }

  setListener(x: number, z: number): void {
    this.listener.x = x
    this.listener.z = z
    this.ambience?.setListener?.(x, z)
  }

  step(kind: FootstepKind, vol = 1, pan = 0): void {
    if (!this.kit || !this.isPlaying()) return
    footstep(this.kit, kind, vol, pan)
  }

  private analyser: AnalyserNode | null = null
  /** 현재 출력 레벨(RMS) — 개발·테스트용 */
  level(): number {
    if (!this.ctx || !this.master) return 0
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.master.connect(this.analyser)
    }
    const buf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(buf)
    let s = 0
    for (const v of buf) s += v * v
    return Math.sqrt(s / buf.length)
  }

  get state(): string {
    return this.ctx?.state ?? 'none'
  }

  private isPlaying(): boolean {
    return this.enabled && !this.paused && this.ctx?.state === 'running'
  }

  /** 현재 상태(켜짐/꺼짐/백그라운드)에 맞게 컨텍스트와 배경 소리를 맞춘다 */
  private apply(): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.kit) return
    const want = this.enabled && !this.paused
    const now = ctx.currentTime

    if (want) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {})
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(MASTER_VOLUME, now, 0.4) // 부드럽게 커짐
      if (this.ambienceId && !this.ambience) {
        this.ambience = AMBIENCES[this.ambienceId](this.kit)
        this.ambience.setListener?.(this.listener.x, this.listener.z)
      }
      this.timer ??= setInterval(() => {
        if (this.ctx?.state === 'running') this.ambience?.tick(this.ctx.currentTime)
      }, 100)
    } else {
      clearInterval(this.timer)
      this.timer = undefined
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(0, now, 0.08)
      const amb = this.ambience
      this.ambience = null
      // 소리가 줄어든 뒤 노드를 정리하고 컨텍스트를 멈춰 배터리를 아낀다
      setTimeout(() => {
        amb?.stop()
        if (!(this.enabled && !this.paused)) void ctx.suspend().catch(() => {})
      }, 400)
    }
  }
}

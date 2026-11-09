/** Web Audio 로 만드는 소리 재료들 — 음원 파일 없이 전부 합성한다. */

export type Kit = {
  ctx: AudioContext
  /** 이 앰비언스/효과음이 연결될 출력 */
  out: AudioNode
  noise: AudioBuffer
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** 2초짜리 화이트 노이즈 (반복 재생용) */
export function makeNoise(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function panner(kit: Kit, pan: number, dest: AudioNode): AudioNode {
  if (!pan || !kit.ctx.createStereoPanner) return dest
  const p = kit.ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(dest)
  return p
}

/** 계속 흐르는 필터링된 노이즈 (바람, 불길, 쉭쉭 소리) */
export function noiseBed(
  kit: Kit,
  opts: { type: BiquadFilterType; freq: number; q?: number; gain: number; dest?: AudioNode },
): { gain: GainNode; stop(): void } {
  const { ctx } = kit
  const src = ctx.createBufferSource()
  src.buffer = kit.noise
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = opts.type
  f.frequency.value = opts.freq
  f.Q.value = opts.q ?? 0.7
  const g = ctx.createGain()
  g.gain.value = opts.gain
  src.connect(f).connect(g).connect(opts.dest ?? kit.out)
  src.start(0, Math.random() * 1.5)
  return {
    gain: g,
    stop() {
      try {
        src.stop()
      } catch {
        /* 이미 멈춤 */
      }
      g.disconnect()
    },
  }
}

/** 느린 LFO 로 AudioParam 을 흔든다 (바람이 불었다 잦아드는 느낌) */
export function wobble(kit: Kit, param: AudioParam, rate: number, depth: number): () => void {
  const osc = kit.ctx.createOscillator()
  osc.frequency.value = rate
  const g = kit.ctx.createGain()
  g.gain.value = depth
  osc.connect(g).connect(param)
  osc.start()
  return () => {
    osc.stop()
    g.disconnect()
  }
}

/** 짧은 노이즈 한 방 (발소리, 불티 튀는 소리) */
export function burst(
  kit: Kit,
  t: number,
  opts: {
    dur: number
    type: BiquadFilterType
    freq: number
    q?: number
    gain: number
    attack?: number
    pan?: number
    dest?: AudioNode
  },
): void {
  const { ctx } = kit
  const src = ctx.createBufferSource()
  src.buffer = kit.noise
  src.playbackRate.value = rand(0.8, 1.2)
  const f = ctx.createBiquadFilter()
  f.type = opts.type
  f.frequency.value = opts.freq
  f.Q.value = opts.q ?? 0.8
  const g = ctx.createGain()
  const a = opts.attack ?? 0.003
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(opts.gain, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + opts.dur)
  src.connect(f).connect(g).connect(panner(kit, opts.pan ?? 0, opts.dest ?? kit.out))
  src.start(t, Math.random() * 1.5)
  src.stop(t + a + opts.dur + 0.02)
}

/** 짧은 음 (새소리, 귀뚜라미, 부엉이) */
export function tone(
  kit: Kit,
  t: number,
  opts: {
    freq: number
    freqEnd?: number
    dur: number
    gain: number
    type?: OscillatorType
    attack?: number
    pan?: number
    vibrato?: [rate: number, depth: number]
  },
): void {
  const { ctx } = kit
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t)
  if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.dur)
  let stopVib: (() => void) | undefined
  if (opts.vibrato) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = opts.vibrato[0]
    const lg = ctx.createGain()
    lg.gain.value = opts.vibrato[1]
    lfo.connect(lg).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + opts.dur + 0.05)
    stopVib = () => lg.disconnect()
  }
  const g = ctx.createGain()
  const a = opts.attack ?? 0.01
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(opts.gain, t + a)
  g.gain.setValueAtTime(opts.gain, t + Math.max(a, opts.dur * 0.6))
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
  osc.connect(g).connect(panner(kit, opts.pan ?? 0, kit.out))
  osc.start(t)
  osc.stop(t + opts.dur + 0.05)
  osc.onended = () => {
    stopVib?.()
    g.disconnect()
  }
}

/**
 * 불규칙하게 반복되는 이벤트 스케줄러.
 * tick(now) 를 주기적으로 부르면 조금 앞(lookahead)까지 미리 예약한다.
 */
export class Recurring {
  private next = -1

  constructor(
    private interval: () => number,
    private fire: (t: number) => void,
    private firstDelay = interval(),
  ) {}

  tick(now: number, lookahead = 0.35): void {
    if (this.next < 0) this.next = now + this.firstDelay
    // 백그라운드에서 돌아왔을 때 밀린 이벤트를 한꺼번에 울리지 않는다
    if (this.next < now - 1) this.next = now + this.interval()
    while (this.next < now + lookahead) {
      this.fire(this.next)
      this.next += this.interval()
    }
  }
}

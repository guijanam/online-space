import { Recurring, burst, noiseBed, rand, tone, wobble, type Kit } from './synth'

export type AmbienceId = 'dusk' | 'campfire'
export type FootstepKind = 'grass' | 'dirt'

export interface Ambience {
  tick(now: number): void
  /** 내 위치 — 소리가 나는 곳(모닥불 등)과의 거리로 볼륨을 바꾼다 */
  setListener?(x: number, z: number): void
  stop(): void
}

/** 귀뚜라미 한 마리: 짧은 펄스 3~4개가 한 번의 '찌르르' */
function cricket(kit: Kit, opts: { pitch: number; gain: number; pan: number; every: [number, number] }) {
  return new Recurring(
    () => rand(...opts.every),
    (t) => {
      const pulses = 3 + Math.floor(Math.random() * 2)
      const f = opts.pitch * rand(0.97, 1.03)
      for (let i = 0; i < pulses; i++) {
        tone(kit, t + i * 0.048, { freq: f, dur: 0.028, gain: opts.gain, attack: 0.004, pan: opts.pan })
      }
    },
    rand(0, 2),
  )
}

/** 해 질 녘 광장: 산들바람, 나뭇잎, 새소리, 멀리 귀뚜라미 */
function dusk(kit: Kit): Ambience {
  const wind = noiseBed(kit, { type: 'bandpass', freq: 520, q: 0.5, gain: 0.05 })
  const leaves = noiseBed(kit, { type: 'highpass', freq: 3200, gain: 0.008 })
  const stops = [wobble(kit, wind.gain.gain, 0.07, 0.035), wobble(kit, leaves.gain.gain, 0.13, 0.006)]

  const birds = new Recurring(
    () => rand(3.5, 9),
    (t) => {
      const notes = 2 + Math.floor(Math.random() * 3)
      const base = rand(2400, 3600)
      const pan = rand(-0.7, 0.7)
      let at = t
      for (let i = 0; i < notes; i++) {
        const dur = rand(0.07, 0.14)
        tone(kit, at, {
          freq: base * rand(0.9, 1.1),
          freqEnd: base * (Math.random() < 0.5 ? rand(1.2, 1.45) : rand(0.7, 0.85)),
          dur,
          gain: 0.028,
          attack: 0.008,
          pan,
        })
        at += dur + rand(0.05, 0.12)
      }
    },
    1.5,
  )
  const crickets = [
    cricket(kit, { pitch: 4300, gain: 0.006, pan: -0.5, every: [1.2, 2.2] }),
    cricket(kit, { pitch: 4700, gain: 0.005, pan: 0.6, every: [1.6, 2.8] }),
  ]

  return {
    tick(now) {
      birds.tick(now)
      for (const c of crickets) c.tick(now)
    },
    stop() {
      wind.stop()
      leaves.stop()
      for (const s of stops) s()
    },
  }
}

/** 산속 캠핑: 모닥불(타는 소리 + 탁탁 튀는 소리), 귀뚜라미, 밤바람, 부엉이 */
function campfire(kit: Kit): Ambience {
  const { ctx } = kit
  // 모닥불 소리는 따로 모아서 거리에 따라 볼륨 조절
  const fireBus = ctx.createGain()
  fireBus.gain.value = 1
  fireBus.connect(kit.out)

  const roar = noiseBed(kit, { type: 'lowpass', freq: 420, q: 0.4, gain: 0.11, dest: fireBus })
  const hiss = noiseBed(kit, { type: 'highpass', freq: 5200, gain: 0.006, dest: fireBus })
  const wind = noiseBed(kit, { type: 'bandpass', freq: 300, q: 0.5, gain: 0.022 })
  const stops = [
    wobble(kit, roar.gain.gain, 0.45, 0.035),
    wobble(kit, hiss.gain.gain, 0.9, 0.003),
    wobble(kit, wind.gain.gain, 0.05, 0.015),
  ]

  const fireKit: Kit = { ...kit, out: fireBus }
  const crackle = new Recurring(
    () => -Math.log(1 - Math.random()) / 7, // 초당 평균 7번 (포아송)
    (t) => {
      if (Math.random() < 0.04) {
        // 가끔 크게 '탁'
        burst(fireKit, t, { type: 'bandpass', freq: rand(700, 1200), q: 1, dur: 0.05, gain: 0.32, attack: 0.001, pan: rand(-0.2, 0.2) })
        burst(fireKit, t + 0.004, { type: 'highpass', freq: 3000, dur: 0.02, gain: 0.15, attack: 0.001 })
      } else {
        burst(fireKit, t, {
          type: 'highpass',
          freq: rand(1500, 5000),
          dur: rand(0.004, 0.02),
          gain: rand(0.04, 0.2),
          attack: 0.0008,
          pan: rand(-0.25, 0.25),
        })
      }
    },
    0.1,
  )

  const crickets = [
    cricket(kit, { pitch: 4100, gain: 0.012, pan: -0.6, every: [0.9, 1.5] }),
    cricket(kit, { pitch: 4600, gain: 0.01, pan: 0.5, every: [1.1, 1.9] }),
    cricket(kit, { pitch: 5000, gain: 0.007, pan: 0.1, every: [1.4, 2.4] }),
  ]

  const owl = new Recurring(
    () => rand(18, 38),
    (t) => {
      const pan = rand(-0.8, 0.8)
      const f = rand(340, 390)
      const hoo = (at: number, dur: number) =>
        tone(kit, at, { freq: f, freqEnd: f * 0.92, dur, gain: 0.03, attack: 0.06, pan, vibrato: [5, 4] })
      hoo(t, 0.42)
      hoo(t + 0.75, 0.2)
      hoo(t + 1.02, 0.36)
    },
    rand(6, 12),
  )

  return {
    tick(now) {
      crackle.tick(now, 0.15)
      for (const c of crickets) c.tick(now)
      owl.tick(now)
    },
    setListener(x, z) {
      const d = Math.hypot(x, z)
      const v = Math.max(0.18, Math.min(1, 1.35 - d / 8))
      fireBus.gain.setTargetAtTime(v, ctx.currentTime, 0.25)
    },
    stop() {
      roar.stop()
      hiss.stop()
      wind.stop()
      for (const s of stops) s()
      fireBus.disconnect()
    },
  }
}

export const AMBIENCES: Record<AmbienceId, (kit: Kit) => Ambience> = { dusk, campfire }

/** 발소리 한 걸음. vol 0~1, pan -1~1 */
export function footstep(kit: Kit, kind: FootstepKind, vol: number, pan: number): void {
  const t = kit.ctx.currentTime + 0.005
  if (kind === 'grass') {
    // 풀을 스치는 부드러운 '사각'
    burst(kit, t, { type: 'bandpass', freq: rand(1200, 1800), q: 0.7, dur: 0.09, gain: 0.08 * vol, attack: 0.008, pan })
    burst(kit, t + 0.015, { type: 'highpass', freq: 3500, dur: 0.05, gain: 0.025 * vol, attack: 0.006, pan })
  } else {
    // 흙·마른 잎을 밟는 '바스락' + 낮은 '툭'
    tone(kit, t, { freq: 115, freqEnd: 70, dur: 0.06, gain: 0.07 * vol, attack: 0.002, pan })
    burst(kit, t, { type: 'bandpass', freq: rand(800, 1100), q: 1.1, dur: 0.06, gain: 0.09 * vol, attack: 0.002, pan })
    const crunches = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < crunches; i++) {
      burst(kit, t + rand(0.004, 0.045), {
        type: 'highpass',
        freq: rand(2500, 4500),
        dur: rand(0.004, 0.012),
        gain: rand(0.03, 0.07) * vol,
        attack: 0.0008,
        pan,
      })
    }
  }
}

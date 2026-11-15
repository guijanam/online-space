import { burst, rand, tone, type Kit } from './synth'

/** 지하철 퇴치대 효과음 — 전부 Web Audio 로 합성한다. */
export type SubwaySfx = 'shoot' | 'hit' | 'kill' | 'bossKill' | 'hurt' | 'gem' | 'levelup' | 'pick' | 'boss' | 'over' | 'won'

const SOUNDS: Record<SubwaySfx, (kit: Kit, t: number) => void> = {
  // 뿅! 짧게 떨어지는 사각파 + 탁 하는 노이즈
  shoot(kit, t) {
    tone(kit, t, { freq: rand(880, 960), freqEnd: 240, dur: 0.08, gain: 0.05, type: 'square', attack: 0.002 })
    burst(kit, t, { dur: 0.03, type: 'highpass', freq: 3200, gain: 0.05 })
  },
  // 퍽
  hit(kit, t) {
    burst(kit, t, { dur: 0.05, type: 'bandpass', freq: rand(900, 1300), q: 1.4, gain: 0.12 })
  },
  // 펑 + 낮게 떨어지는 음
  kill(kit, t) {
    burst(kit, t, { dur: 0.14, type: 'lowpass', freq: 1400, gain: 0.2 })
    tone(kit, t, { freq: rand(420, 520), freqEnd: 110, dur: 0.16, gain: 0.08, type: 'triangle', attack: 0.003 })
  },
  bossKill(kit, t) {
    burst(kit, t, { dur: 0.6, type: 'lowpass', freq: 900, gain: 0.35, attack: 0.005 })
    tone(kit, t, { freq: 180, freqEnd: 40, dur: 0.7, gain: 0.18, type: 'sawtooth' })
    ;[523, 659, 784, 1047].forEach((f, i) => tone(kit, t + 0.25 + i * 0.09, { freq: f, dur: 0.18, gain: 0.07, type: 'triangle' }))
  },
  // 아야 — 거칠게 떨어지는 톱니파
  hurt(kit, t) {
    tone(kit, t, { freq: 320, freqEnd: 90, dur: 0.22, gain: 0.14, type: 'sawtooth', attack: 0.003 })
    burst(kit, t, { dur: 0.12, type: 'lowpass', freq: 700, gain: 0.22 })
  },
  // 띵
  gem(kit, t) {
    tone(kit, t, { freq: rand(1250, 1450), freqEnd: 1900, dur: 0.07, gain: 0.04, type: 'sine', attack: 0.002 })
  },
  levelup(kit, t) {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(kit, t + i * 0.07, { freq: f, dur: 0.16, gain: 0.08, type: 'square' }))
  },
  pick(kit, t) {
    tone(kit, t, { freq: 660, freqEnd: 1320, dur: 0.12, gain: 0.07, type: 'triangle' })
  },
  // 보스 등장 경고음 (두 번 울림)
  boss(kit, t) {
    for (let i = 0; i < 3; i++) tone(kit, t + i * 0.32, { freq: 220, freqEnd: 180, dur: 0.26, gain: 0.12, type: 'sawtooth', vibrato: [9, 12] })
  },
  over(kit, t) {
    ;[392, 330, 262, 196].forEach((f, i) => tone(kit, t + i * 0.16, { freq: f, dur: 0.24, gain: 0.09, type: 'triangle' }))
  },
  won(kit, t) {
    ;[523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(kit, t + i * 0.11, { freq: f, dur: i === 5 ? 0.5 : 0.14, gain: 0.08, type: 'square' }))
  },
}

export function playSubway(kit: Kit, sfx: SubwaySfx): void {
  SOUNDS[sfx](kit, kit.ctx.currentTime + 0.005)
}

export const GAME_DURATION_MS = 30_000
export const STAR_POINTS = 10
export const BOMB_PENALTY = -20

export type FallingKind = 'star' | 'bomb'

export function scoreAfterCatch(score: number, kind: FallingKind): number {
  return Math.max(0, score + (kind === 'star' ? STAR_POINTS : BOMB_PENALTY))
}

export function spawnDelayMs(elapsedMs: number): number {
  const p = Math.min(1, Math.max(0, elapsedMs / GAME_DURATION_MS))
  return 620 - p * 240
}

export function fallSpeed(elapsedMs: number, random: number): number {
  const p = Math.min(1, Math.max(0, elapsedMs / GAME_DURATION_MS))
  return 115 + p * 75 + random * 65
}

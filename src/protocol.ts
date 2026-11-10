import { z } from 'zod'
import { ACTION_IDS } from './actions'
import { WORLD_RADIUS } from './config'

/** 호환되지 않는 변경이 생기면 올린다. 다른 버전의 상태 메시지는 무시된다. */
export const PROTOCOL_VERSION = 2

/** 이 크기를 넘는 메시지는 받기 전에 거절한다 */
export const MAX_MESSAGE_BYTES = 256

const LIMIT = WORLD_RADIUS + 1
const coord = z.number().min(-LIMIT).max(LIMIT)
/** 앉은/누운 자리 번호 (-1 = 서 있음). 이전 버전 클라이언트는 이 필드를 보내지 않는다. */
export const MAX_SPOTS = 32
const seat = z.number().int().min(-1).max(MAX_SPOTS - 1).optional()

// z.object 는 알 수 없는 필드를 버린다 → 자유 텍스트를 실을 자리가 없다.
export const StateMsg = z.object({
  v: z.literal(PROTOCOL_VERSION),
  x: coord,
  z: coord,
  joinedAt: z.number().int().min(0).max(1e13),
  seat,
})
export const MoveMsg = z.object({ x: coord, z: coord, seat })
export const ActMsg = z.object({ id: z.enum(ACTION_IDS) })
/** 풍등: 짧은 글 하나. 글 내용은 받는 쪽에서 lantern/filter.ts 로 다시 검사한다 */
export const LanternMsg = z.object({ text: z.string().min(1).max(80) })
export const GameStateMsg = z.object({
  v: z.literal(PROTOCOL_VERSION),
  joinedAt: z.number().int().min(0).max(1e13),
  round: z.number().int().min(0).max(1e6),
  score: z.number().int().min(0).max(1e6),
  best: z.number().int().min(0).max(1e6),
  playing: z.boolean(),
})

export type StateMsg = z.infer<typeof StateMsg>
export type MoveMsg = z.infer<typeof MoveMsg>
export type ActMsg = z.infer<typeof ActMsg>
export type LanternMsg = z.infer<typeof LanternMsg>
export type GameStateMsg = z.infer<typeof GameStateMsg>

/** 좌표를 광장 안으로 보정 (원형 경계) */
export function clampToWorld(x: number, z: number, radius = WORLD_RADIUS - 0.5): { x: number; z: number } {
  const d = Math.hypot(x, z)
  if (d <= radius) return { x, z }
  const k = radius / d
  return { x: x * k, z: z * k }
}

/** 전송용 반올림 (메시지 크기 축소) */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

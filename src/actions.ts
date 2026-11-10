/** 행동 테이블 — 보내는 쪽(버튼 잠금)과 받는 쪽(도배 필터)이 같은 값을 쓴다. */
export const ACTIONS = [
  { id: 'wave', emoji: '👋', label: '손인사', cooldownMs: 5_000, durationMs: 1_800 },
  { id: 'bow', emoji: '🙇', label: '꾸벅', cooldownMs: 6_000, durationMs: 1_800 },
  { id: 'cheer', emoji: '🙌', label: '힘내요', cooldownMs: 10_000, durationMs: 2_000 },
  { id: 'stretch', emoji: '🙆', label: '기지개', cooldownMs: 8_000, durationMs: 2_400 },
  { id: 'heart', emoji: '💗', label: '하트', cooldownMs: 10_000, durationMs: 2_200 },
  { id: 'sleep', emoji: '💤', label: '졸음', cooldownMs: 30_000, durationMs: 5_000 },
  { id: 'roast', emoji: '🍢', label: '마시멜로', cooldownMs: 10_000, durationMs: 10_000, theme: 'campfire' },
] as const

export type ActionDef = (typeof ACTIONS)[number]
export type ActionId = ActionDef['id']

export const ACTION_IDS = ACTIONS.map((a) => a.id) as [ActionId, ...ActionId[]]

const byId = new Map<ActionId, ActionDef>(ACTIONS.map((a) => [a.id, a]))

export function getAction(id: ActionId): ActionDef {
  return byId.get(id)!
}

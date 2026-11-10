import { campfire } from './themes/campfire'
import type { ThemeDef } from './themes/common'
import { plaza } from './themes/plaza'
import { starcatch } from './themes/starcatch'
import { subway } from './themes/subway'

export type { ThemeDef, WorldHandle } from './themes/common'

/**
 * 공간 테마 목록 — 입장할 때 고른다.
 * 새 테마는 themes/ 에 ThemeDef 를 만들고 여기에 추가하면 선택 화면에 바로 나타난다.
 * 테마마다 방이 따로라서, 같은 테마를 고른 사람끼리만 만난다.
 */
export const THEMES: readonly ThemeDef[] = [plaza, campfire, starcatch, subway]

export function findTheme(id: string | null | undefined): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id)
}

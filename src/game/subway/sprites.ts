import type { EnemyKind } from './engine'

export type SpriteKey = EnemyKind | 'player'

/**
 * 캐릭터 이미지는 public/subway/ 에 넣는다.
 * 투명 배경, 정사각형(256×256 정도), 오른쪽을 바라보는 방향으로 그린다.
 * 파일이 없으면 캔버스 기본 도형으로 대신 그린다.
 */
export const SPRITE_SOURCES: Record<SpriteKey, string> = {
  player: 'subway/ttotta.png',
  heckler: 'subway/villain-danso.png',
  sprinter: 'subway/villain-slipper.png',
  youtuber: 'subway/villain-youtuber.png',
  urinator: 'subway/villain-pee.png',
  blocker: 'subway/villain-sleeper.png',
  boss: 'subway/villain-vomit.png',
}

export const VILLAIN_NAMES: Record<EnemyKind, string> = {
  heckler: '단소 빌런',
  sprinter: '슬리퍼 빌런',
  youtuber: '유튜버 빌런',
  urinator: '노상방뇨 빌런',
  blocker: '드러누운 청소년 빌런',
  boss: '토사물 빌런',
}

export type Sprites = { get(key: SpriteKey): HTMLImageElement | null }

export function loadSprites(): Sprites {
  const base = import.meta.env.BASE_URL
  const images = new Map<SpriteKey, HTMLImageElement>()
  for (const [key, src] of Object.entries(SPRITE_SOURCES) as [SpriteKey, string][]) {
    const image = new Image()
    image.decoding = 'async'
    image.src = base + src
    images.set(key, image)
  }
  return {
    get(key) {
      const image = images.get(key)
      return image && image.complete && image.naturalWidth > 0 ? image : null
    },
  }
}

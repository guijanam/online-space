import type { TurnServerConfig } from 'trystero'

/** Trystero 앱 네임스페이스. 프로토콜이 호환되지 않게 바뀌면 v 숫자를 올린다. */
export const APP_ID = 'crew-healing-space-v1' + (import.meta.env.DEV ? '-dev' : '')
// ↑ 개발 서버(npm run dev)는 별도 공간을 써서 실제 사용자 방에 테스트 아바타가 섞이지 않게 한다

/**
 * 시그널링(SDP) 암호화용 공유 비밀번호.
 * 클라이언트 코드에 들어가므로 외부인 차단 수단은 아니다 — 릴레이 운영자가 세션 정보를 읽지 못하게 하고
 * 다른 앱과 섞이지 않게 하는 용도.
 */
export const ROOM_PW = 'quiet-platform-breathing-room'

function devNumberParam(name: string): number | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const v = Number(new URLSearchParams(location.search).get(name))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** 방 하나의 정원 (WebRTC 메시 구조라 모바일 기준 20명). 개발 모드에서는 ?cap=2 로 바꿀 수 있다. */
export const ROOM_CAPACITY = devNumberParam('cap') ?? 20
/** 동시 입장으로 잠깐 정원을 넘는 것을 허용하는 여유분 */
export const ROOM_OVERFLOW = 3
/** 방에 들어가서 기존 피어가 모이기를 기다리는 시간 */
export const SETTLE_MS = 3000
/** 시도할 최대 방 번호 */
export const MAX_ROOMS = 50
/** 상태 하트비트 주기 (놓친 메시지 보정용) */
export const HEARTBEAT_MS = 10_000

/** 걸어다닐 수 있는 원형 광장 반지름 */
export const WORLD_RADIUS = 9

/**
 * TURN 서버. 통신사·사내망 NAT 때문에 연결 실패가 잦으면 여기에 추가한다.
 * 예: [{ urls: ['turn:turn.example.com:3478'], username: '...', credential: '...' }]
 */
export const TURN: TurnServerConfig[] | undefined = undefined

/**
 * 시그널링 전략 교체 지점.
 * 기본: Nostr (trystero 패키지의 기본값 = @trystero-p2p/nostr)
 * Nostr 릴레이가 불안정하면 아래 줄을 바꾼다:
 *   export { joinRoom, selfId } from '@trystero-p2p/mqtt'     (npm i @trystero-p2p/mqtt)
 *   export { joinRoom, selfId } from '@trystero-p2p/torrent'  (npm i @trystero-p2p/torrent)
 */
export { joinRoom, selfId } from 'trystero'
export type { Room, JoinRoom, MessageAction } from 'trystero'

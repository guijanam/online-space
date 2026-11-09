/**
 * 익명 별칭과 색 — peerId 해시로 결정한다.
 * 모든 피어가 같은 함수로 계산하므로 이름을 전송할 필요가 없다 (자유 텍스트 0).
 */

export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const ADJECTIVES = [
  '고요한', '포근한', '느긋한', '따뜻한', '반짝이는', '싱그러운',
  '다정한', '산뜻한', '잔잔한', '말랑한', '푸근한', '맑은',
  '졸린', '든든한', '살랑이는', '보송한',
]
const ANIMALS = [
  '수달', '고양이', '여우', '토끼', '펭귄', '곰',
  '다람쥐', '고래', '부엉이', '사슴', '판다', '강아지',
  '해달', '오리', '거북이', '햄스터',
]

export function nicknameFor(peerId: string): string {
  const h = hash32(peerId)
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >>> 8) % ANIMALS.length]}`
}

/** 0~1 범위 hue */
export function hueFor(peerId: string): number {
  return ((hash32(peerId) >>> 16) % 360) / 360
}

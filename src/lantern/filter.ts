/**
 * 풍등에 담는 짧은 글 검사. 보내는 쪽과 받는 쪽이 같은 함수를 쓴다.
 * (조작된 클라이언트가 필터를 건너뛰고 보내도 받는 쪽에서 다시 걸러진다)
 */

/** 풍등 한 개에 담을 수 있는 글자 수 (이모지 1개 = 1글자) */
export const LANTERN_MAX_CHARS = 20

export type FilterResult = { ok: true; text: string } | { ok: false; reason: string }

/**
 * 금칙어. 띄어쓰기·숫자·기호를 빼고 비교하므로 "씨 발", "씨1발", "ㅅ.ㅂ" 도 걸린다.
 * 운영하면서 필요한 말을 여기에 더하면 된다 (소문자, 띄어쓰기 없이).
 */
export const BLOCKED_WORDS: readonly string[] = [
  // 욕설
  '시발', '씨발', '씨바', '시바', '씨빨', '시빨', '쓰발', '쓰바', '씨팔', '시팔', '십팔', '슈발', '싸발', '씹',
  'ㅅㅂ', 'ㅆㅂ', 'ㅅㅃ', 'ㅆㅃ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㅈㄴ', 'ㅁㅊ', 'ㄲㅈ', 'ㅗ',
  '병신', '븅신', '빙신', '병쉰', '등신', '좆', '좇', '존나', '졸라', '존니', '개새', '개색', '개세끼', '새끼', '쌔끼', '색기',
  '지랄', '미친', '미쳤', '또라이', '돌아이', '찐따', '닥쳐', '닥치', '꺼져', '엿먹', '썅', '쌍년', '쌍놈', '염병', '옘병',
  '개같', '개소리', '개년', '개놈', '년아', '놈아', '니애미', '느금', '니엄마', '애미', '애비',
  // 비하·혐오
  '한남', '김치녀', '틀딱', '급식충', '맘충', '한녀',
  // 위협·자해
  '뒤져', '뒤질', '죽어라', '죽을래', '죽여', '자살', '살인',
  // 성적인 말
  '섹스', '섹기', '야동', '보빨', '자위',
  // 영어
  'fuck', 'shit', 'bitch', 'asshole', 'porn', 'sex', 'dick', 'pussy',
]

/** 풍등을 날릴 때 고를 수 있는 예시 문구 */
export const LANTERN_PRESETS: readonly string[] = [
  '오늘도 무사히 🚇',
  '모두 수고 많았어요',
  '퇴근까지 힘내요 💪',
  '푹 쉬다 가세요 🌙',
  '안전 운행 하세요',
  '좋은 꿈 꾸세요 ✨',
]

/** 허용하는 글자: 한글, 영문, 숫자, 띄어쓰기, 몇 가지 문장부호, 이모지 */
const ALLOWED = /^(?:[\p{Script=Hangul}A-Za-z0-9 .,!?~'"^()\-_♡♥☆★]|\p{Extended_Pictographic}|\p{Emoji_Component})+$/u
/** 연락처·링크 */
const LINK = /(https?|www\.|\.(com|net|org|kr|io|me|ly|gg|co)\b|@)/i
const MAX_DIGITS = 3

/** 비교용으로 압축: 한글·영문만 남기고 소문자로 */
export function compact(text: string): string {
  // NFKC: 전각 문자를 반각으로, 낱자(ㅂㅏㄹ)를 글자(발)로 합친다
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{Script=Hangul}a-z]/gu, '').normalize('NFKC')
}
const BLOCKED_COMPACT = BLOCKED_WORDS.map(compact)

/** 이모지 묶음까지 한 글자로 센다 */
export function countChars(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<unknown> } }).Segmenter
  if (Seg) return [...new Seg('ko', { granularity: 'grapheme' }).segment(text)].length
  return Array.from(text).length
}

/** 보이지 않는 문자 제거, 공백 정리, 한글 자모 합치기 */
export function normalize(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/(?!\p{Emoji_Component})\p{Cf}/gu, '') // 폭 없는 문자 (이모지 결합용 ZWJ 등은 남김)
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function checkLanternText(raw: unknown): FilterResult {
  if (typeof raw !== 'string' || raw.length > 200) return { ok: false, reason: '글이 너무 길어요' }
  const text = normalize(raw)
  if (!text) return { ok: false, reason: '풍등에 담을 말을 적어주세요' }
  if (countChars(text) > LANTERN_MAX_CHARS) return { ok: false, reason: `${LANTERN_MAX_CHARS}자까지 담을 수 있어요` }
  if (LINK.test(text) || (text.match(/\d/g)?.length ?? 0) > MAX_DIGITS) {
    return { ok: false, reason: '연락처나 링크는 담을 수 없어요' }
  }
  if (!ALLOWED.test(text)) return { ok: false, reason: '한글·영문·이모지만 쓸 수 있어요' }
  const c = compact(text)
  if (BLOCKED_COMPACT.some((w) => c.includes(w))) return { ok: false, reason: '다른 따뜻한 말로 바꿔볼까요?' }
  return { ok: true, text }
}

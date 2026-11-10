import { describe, expect, it } from 'vitest'
import { LANTERN_MAX_CHARS, LANTERN_PRESETS, checkLanternText } from '../src/lantern/filter'
import { LANTERN_COOLDOWN_MS } from '../src/config'
import { RECEIVE_LIMITS, ReceiveGuard, SendLimiter, SEND_LIMITS } from '../src/net/limits'
import { LanternMsg } from '../src/protocol'

const ok = (s: string) => checkLanternText(s).ok

describe('풍등 글 필터', () => {
  it('평범한 응원 문구와 예시 문구는 통과', () => {
    for (const s of ['오늘도 무사히 🚇', '다들 수고했어요!', 'ㅋㅋ 힘내요~', '퇴근까지 3시간', 'Good night ✨', '👍🏻']) {
      expect(checkLanternText(s), s).toMatchObject({ ok: true })
    }
    for (const p of LANTERN_PRESETS) expect(ok(p), p).toBe(true)
  })

  it('공백을 정리해서 돌려준다', () => {
    expect(checkLanternText('  안녕   하세요 \n')).toEqual({ ok: true, text: '안녕 하세요' })
  })

  it('빈 글, 너무 긴 글, 글이 아닌 값은 거절', () => {
    expect(ok('   ')).toBe(false)
    expect(ok('가'.repeat(LANTERN_MAX_CHARS))).toBe(true)
    expect(ok('가'.repeat(LANTERN_MAX_CHARS + 1))).toBe(false)
    expect(ok(123 as unknown as string)).toBe(false)
  })

  it('욕설은 띄어쓰기·숫자·기호·초성으로 바꿔 써도 걸린다', () => {
    for (const s of ['씨발', '씨 발', '씨1발', '시.발', 'ㅅㅂ', 'ㅅ ㅂ', '병신같네', '개새끼', 'F U C K', 'ｓｈｉｔ']) {
      expect(ok(s), s).toBe(false)
    }
  })

  it('연락처·링크는 거절', () => {
    for (const s of ['010-1234-5678', '공일공 1234 5678', 'naver.com', 'www.abc', 'http://x', '카톡 a@b']) {
      expect(ok(s), s).toBe(false)
    }
  })

  it('허용하지 않는 문자(한자·특수기호·보이지 않는 문자로 우회)는 거절하거나 지운다', () => {
    expect(ok('你好')).toBe(false)
    expect(ok('<script>')).toBe(false)
    // 폭 없는 문자를 끼워 넣어도 지운 다음 금칙어 검사
    expect(ok('씨' + String.fromCharCode(0x200b) + '발')).toBe(false)
    expect(checkLanternText('안' + String.fromCharCode(0x200b) + '녕')).toEqual({ ok: true, text: '안녕' })
  })

  it('메시지 스키마는 문자열만, 길이 제한', () => {
    expect(LanternMsg.safeParse({ text: '안녕' }).success).toBe(true)
    expect(LanternMsg.safeParse({ text: '' }).success).toBe(false)
    expect(LanternMsg.safeParse({ text: 'x'.repeat(200) }).success).toBe(false)
    expect(LanternMsg.safeParse({ text: 1 }).success).toBe(false)
  })
})

describe('풍등 쿨타임', () => {
  it('보내는 쪽: 1분에 한 번', () => {
    let t = 0
    const s = new SendLimiter(SEND_LIMITS, () => t)
    expect(s.tryLantern()).toBe(true)
    expect(s.tryLantern()).toBe(false)
    t = LANTERN_COOLDOWN_MS - 1
    expect(s.lanternRemaining()).toBe(1)
    t = LANTERN_COOLDOWN_MS
    expect(s.tryLantern()).toBe(true)
  })

  it('받는 쪽: 쿨타임보다 빨리 오면 무시하고, 계속 어기면 숨긴다', () => {
    let t = 0
    const g = new ReceiveGuard(RECEIVE_LIMITS, () => t)
    expect(g.allowLantern('p')).toBe(true)
    t = LANTERN_COOLDOWN_MS - RECEIVE_LIMITS.toleranceMs + 1 // 약간의 네트워크 지연은 봐준다
    expect(g.allowLantern('p')).toBe(true)
    for (let i = 0; i < RECEIVE_LIMITS.strikeMax; i++) {
      t += 10
      expect(g.allowLantern('p')).toBe(false)
    }
    expect(g.isMuted('p')).toBe(true)
  })
})

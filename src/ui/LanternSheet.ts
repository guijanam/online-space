import { LANTERN_MAX_CHARS, LANTERN_PRESETS, checkLanternText, countChars, normalize } from '../lantern/filter'

/**
 * 풍등 글쓰기 창. 키보드에 가리지 않도록 화면 위쪽에 띄운다.
 * 보내기 전에 금칙어·글자 수를 검사하고, 통과한 글만 onSend 로 넘긴다.
 */
export class LanternSheet {
  private input: HTMLInputElement
  private count: HTMLElement
  private error: HTMLElement
  private send: HTMLButtonElement
  private onSend: ((text: string) => boolean) | null = null

  constructor(private host: HTMLElement) {
    host.innerHTML = `
      <div class="backdrop"></div>
      <form class="panel" autocomplete="off">
        <strong>🏮 풍등에 마음을 담아 날려요</strong>
        <p class="sub">지금 함께 있는 동료들만 볼 수 있고, 하늘로 올라가면 사라져요</p>
        <div class="field">
          <input type="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" placeholder="예) 오늘도 무사히" />
          <span class="count"></span>
        </div>
        <p class="error" role="alert"></p>
        <div class="chips"></div>
        <div class="buttons">
          <button type="button" class="cancel">닫기</button>
          <button type="submit" class="go">날리기</button>
        </div>
      </form>`
    this.input = host.querySelector('input')!
    this.count = host.querySelector('.count')!
    this.error = host.querySelector('.error')!
    this.send = host.querySelector('.go')!
    const chips = host.querySelector('.chips')!
    for (const p of LANTERN_PRESETS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = p
      b.addEventListener('click', () => {
        this.input.value = p
        this.refresh()
      })
      chips.appendChild(b)
    }
    this.input.addEventListener('input', () => this.refresh())
    host.querySelector('.cancel')!.addEventListener('click', () => this.close())
    host.querySelector('.backdrop')!.addEventListener('click', () => this.close())
    host.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      this.submit()
    })
  }

  get isOpen(): boolean {
    return !this.host.hidden
  }

  /** onSend 가 false 를 돌려주면(쿨타임 등) 창을 닫지 않는다 */
  open(onSend: (text: string) => boolean): void {
    this.onSend = onSend
    this.error.textContent = ''
    this.host.hidden = false
    this.refresh()
    // 키보드는 사용자가 입력칸을 누를 때 올라온다 (예시 문구만 고르는 사람도 있으므로)
  }

  close(): void {
    this.input.blur()
    this.host.hidden = true
    this.onSend = null
  }

  private refresh(): void {
    const n = countChars(normalize(this.input.value))
    this.count.textContent = `${n}/${LANTERN_MAX_CHARS}`
    this.count.classList.toggle('over', n > LANTERN_MAX_CHARS)
    this.send.disabled = n === 0
    this.error.textContent = ''
  }

  private submit(): void {
    const r = checkLanternText(this.input.value)
    if (!r.ok) {
      this.error.textContent = r.reason
      return
    }
    if (this.onSend?.(r.text)) {
      this.input.value = ''
      this.close()
    }
  }
}

/** 다른 사람 풍등을 눌렀을 때: 가리기 확인 */
export function confirmHide(host: HTMLElement, text: string): Promise<boolean> {
  host.innerHTML = `
    <div class="backdrop"></div>
    <div class="panel">
      <strong>이 분의 풍등을 가릴까요?</strong>
      <p class="sub"></p>
      <div class="buttons">
        <button type="button" class="cancel">그대로 두기</button>
        <button type="button" class="go">가리기</button>
      </div>
    </div>`
  host.querySelector('.sub')!.textContent = `“${text}” — 이번 접속 동안 이 분이 날리는 풍등이 보이지 않아요`
  host.hidden = false
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      host.hidden = true
      resolve(v)
    }
    host.querySelector('.backdrop')!.addEventListener('click', () => done(false))
    host.querySelector('.cancel')!.addEventListener('click', () => done(false))
    host.querySelector('.go')!.addEventListener('click', () => done(true))
  })
}

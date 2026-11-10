import { ACTIONS, type ActionId } from '../actions'
import type { SendLimiter } from '../net/limits'

/** 하단 공용 행동 버튼. 쿨타임 동안 잠기고 원형 게이지로 남은 시간을 보여준다. */
export class ActionBar {
  private buttons = new Map<ActionId, { el: HTMLButtonElement; secs: HTMLElement }>()

  constructor(
    host: HTMLElement,
    private limiter: SendLimiter,
    private onAct: (id: ActionId) => void,
  ) {
    for (const a of ACTIONS) {
      if ('theme' in a) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'act'
      el.setAttribute('aria-label', a.label)
      el.innerHTML = `<span class="emoji">${a.emoji}</span><span class="label">${a.label}</span><span class="cd"><b></b></span>`
      el.addEventListener('click', () => this.press(a.id, el))
      host.appendChild(el)
      this.buttons.set(a.id, { el, secs: el.querySelector('.cd b')! })
    }
  }

  private press(id: ActionId, el: HTMLButtonElement): void {
    if (this.limiter.tryAct(id)) {
      this.onAct(id)
      navigator.vibrate?.(12)
    } else {
      el.classList.remove('nope')
      void el.offsetWidth // 애니메이션 재시작
      el.classList.add('nope')
    }
  }

  /** 매 프레임 호출 — 게이지 갱신 */
  update(): void {
    const global = this.limiter.globalRemaining()
    for (const [id, { el, secs }] of this.buttons) {
      const { remainingMs, totalMs } = this.limiter.actionCooldown(id)
      const wait = Math.max(remainingMs, global)
      const locked = wait > 0
      el.classList.toggle('locked', locked)
      if (locked) {
        const frac = remainingMs >= global ? remainingMs / totalMs : 1
        el.style.setProperty('--p', String(frac))
        const s = String(Math.ceil(wait / 1000))
        if (secs.textContent !== s) secs.textContent = s
      }
    }
  }
}

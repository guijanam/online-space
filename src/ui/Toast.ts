/** 잠깐 떴다 사라지는 안내 문구 */
export class Toast {
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private el: HTMLElement) {}

  show(text: string, ms = 2200): void {
    this.el.textContent = text
    this.el.classList.add('show')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.el.classList.remove('show'), ms)
  }
}

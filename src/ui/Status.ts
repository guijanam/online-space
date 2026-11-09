/** 상단 상태 표시 */
export class Status {
  constructor(private el: HTMLElement) {}

  private set(text: string, kind: 'wait' | 'ok' | 'warn'): void {
    if (this.el.textContent !== text) this.el.textContent = text
    this.el.dataset.kind = kind
  }

  connecting(): void {
    this.set('함께 쉴 자리를 찾는 중…', 'wait')
  }

  people(othersCount: number): void {
    if (othersCount === 0) this.set('지금은 혼자예요 · 곧 누군가 올 거예요', 'ok')
    else this.set(`${othersCount + 1}명이 함께 쉬고 있어요`, 'ok')
  }

  offline(): void {
    this.set('연결이 불안정해요 · 다시 연결하는 중…', 'warn')
  }
}

import { THEMES, findTheme, type ThemeDef } from '../scene/World'

const KEY = 'space.theme'

function loadLast(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function saveLast(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* 저장이 안 되는 환경이면 기억만 못 할 뿐 */
  }
}

/**
 * 입장할 때 공간 컨셉을 고르는 화면. 고르면 닫히고 선택한 테마를 돌려준다.
 * onTap 은 터치 이벤트 안에서 바로 불린다 (소리 켜기처럼 사용자 제스처가 필요한 작업용).
 */
export function pickTheme(host: HTMLElement, onTap?: () => void): Promise<ThemeDef> {
  const last = findTheme(loadLast())
  const list = host.querySelector<HTMLElement>('.cards')!
  list.replaceChildren()

  return new Promise((resolve) => {
    for (const theme of THEMES) {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'card'
      card.style.setProperty('--preview', theme.preview)
      card.innerHTML = `
        <span class="art"><span class="emoji">${theme.emoji}</span></span>
        <span class="text">
          <strong>${theme.name}</strong>
          <small>${theme.description}</small>
        </span>
        ${theme.id === last?.id ? '<em class="badge">지난번</em>' : ''}`
      card.addEventListener('click', () => {
        onTap?.()
        saveLast(theme.id)
        host.classList.add('closing')
        setTimeout(() => (host.hidden = true), 280)
        resolve(theme)
      })
      list.appendChild(card)
    }
    host.hidden = false
  })
}

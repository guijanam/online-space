import './style.css'
import * as THREE from 'three'
import type { ActionId } from './actions'
import {
  APP_ID, MAX_ROOMS, ROOM_CAPACITY, ROOM_OVERFLOW, ROOM_PW, SETTLE_MS, TURN,
} from './config'
import { clampToWorld } from './protocol'
import { SendLimiter } from './net/limits'
import { Lobby, shouldYield, type Seat } from './net/Lobby'
import { PeerSync, type PeerHandlers } from './net/PeerSync'
import { joinRoom, selfId } from './net/strategy'
import { AudioEngine } from './audio/AudioEngine'
import { Avatar, pushOut } from './scene/Avatar'
import { attachPicking, TapMarker } from './scene/Picking'
import type { ThemeDef } from './scene/World'
import { ActionBar } from './ui/ActionBar'
import { Status } from './ui/Status'
import { pickTheme } from './ui/ThemePicker'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

// ── 웹뷰 잠금: 길게 누르기 메뉴, 선택, 드래그, 확대, 링크 이동 차단 ──────────────
for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick'] as const) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('a')) e.preventDefault()
})
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })

const status = new Status($('#status'))

function hasWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

const audio = new AudioEngine()

if (!hasWebGL()) {
  $('#status').textContent = '이 기기에서는 3D 화면을 열 수 없어요'
} else {
  // 카드를 누르는 순간(사용자 제스처)에 소리를 켤 수 있게 한다
  void pickTheme($('#picker'), () => audio.unlock()).then(start)
}

function setupSoundButton(): void {
  const btn = $<HTMLButtonElement>('#sound')
  const render = () => {
    btn.dataset.on = String(audio.enabled)
    btn.setAttribute('aria-pressed', String(audio.enabled))
    btn.setAttribute('aria-label', audio.enabled ? '소리 끄기' : '소리 켜기')
  }
  btn.addEventListener('click', () => {
    audio.unlock()
    audio.setEnabled(!audio.enabled)
    render()
  })
  render()
  btn.hidden = false
}

function start(theme: ThemeDef): void {
  document.body.dataset.theme = theme.id
  // 공간 바꾸기: 처음 화면(컨셉 선택)으로 돌아간다
  $('#switch').hidden = false
  $('#switch').addEventListener('click', () => location.reload())
  setupSoundButton()
  audio.setAmbience(theme.sound.ambience)

  // ── 렌더러 / 씬 ───────────────────────────────────────────────────────────
  const stage = $('#stage')
  const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2 })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  stage.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  const world = theme.build(scene)
  Avatar.keepOut = theme.keepOut
  const marker = new TapMarker()
  scene.add(marker.mesh)

  // 세로 화면에서도 광장이 충분히 보이도록 가로 시야각 기준으로 세로 FOV를 잡는다
  const MIN_HFOV = THREE.MathUtils.degToRad(38)
  const resize = () => {
    const w = stage.clientWidth || 1
    const h = stage.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const vfov = 2 * Math.atan(Math.tan(MIN_HFOV / 2) / camera.aspect)
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 50, 75)
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(stage)
  resize()

  // ── 아바타 ────────────────────────────────────────────────────────────────
  const me = new Avatar(selfId, true)
  {
    const a = Math.random() * Math.PI * 2
    const [rmin, rmax] = theme.spawn
    const r = rmin + Math.random() * (rmax - rmin)
    me.placeAt(Math.cos(a) * r, Math.sin(a) * r)
  }
  scene.add(me.root)
  me.onStep = () => audio.step(theme.sound.footstep, 1)

  /** 다른 사람 발소리: 가까울수록 크게, 좌우 위치에 따라 왼쪽/오른쪽에서 */
  const HEAR_DIST = 7
  const stepOf = (a: Avatar) => () => {
    const dx = a.position.x - me.position.x
    const d = Math.hypot(dx, a.position.z - me.position.z)
    const vol = (1 - d / HEAR_DIST) * 0.45
    if (vol > 0.03) audio.step(theme.sound.footstep, vol, dx / HEAR_DIST)
  }

  const others = new Map<string, Avatar>()
  const joinedAt = new Map<string, number>()
  const clock = () => performance.now() / 1000

  const removePeer = (id: string) => {
    others.get(id)?.dispose()
    others.delete(id)
    joinedAt.delete(id)
    refreshStatus()
  }

  // ── 네트워크 ──────────────────────────────────────────────────────────────
  const limiter = new SendLimiter()
  const lobby = new Lobby({
    joinRoom,
    appId: APP_ID,
    password: ROOM_PW,
    roomPrefix: `${theme.id}-room`,
    capacity: ROOM_CAPACITY,
    settleMs: SETTLE_MS,
    maxRooms: MAX_ROOMS,
    turnConfig: TURN,
    onJoinError: (m) => console.warn('[trystero]', m),
  })
  let seat: Seat | null = null
  let sync: PeerSync | null = null
  let generation = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let relocating = false

  const refreshStatus = () => {
    if (!sync) return
    if (!navigator.onLine) status.offline()
    else status.people(others.size)
  }

  const checkOverflow = () => {
    if (!seat || relocating) return
    const list = [...joinedAt].map(([id, t]) => ({ id, joinedAt: t }))
    if (shouldYield({ id: selfId, joinedAt: seat.joinedAt }, list, ROOM_CAPACITY, ROOM_OVERFLOW)) {
      relocating = true
      const next = seat.index + 1
      void connect(next).finally(() => (relocating = false))
    }
  }

  const handlers: PeerHandlers = {
    onState(id, s, isNew) {
      let a = others.get(id)
      if (!a) {
        a = new Avatar(id)
        a.onStep = stepOf(a)
        a.placeAt(s.x, s.z)
        scene.add(a.root)
        others.set(id, a)
      } else if (!isNew) {
        a.walkTo(s.x, s.z)
      }
      joinedAt.set(id, s.joinedAt)
      refreshStatus()
      checkOverflow()
    },
    onMove: (id, x, z) => others.get(id)?.walkTo(x, z),
    onAction: (id, act) => others.get(id)?.play(act, clock()),
    onLeave: removePeer,
    onMuted: removePeer,
  }

  async function disconnect(): Promise<void> {
    generation++
    clearTimeout(retryTimer)
    sync?.stop()
    sync = null
    seat = null
    await lobby.leave()
  }

  async function connect(from = 1): Promise<void> {
    await disconnect()
    const gen = generation
    status.connecting()
    const s = await lobby.join(from)
    if (gen !== generation) return // 그 사이 다른 연결/해제가 시작됨
    if (!s) {
      status.offline()
      retryTimer = setTimeout(() => void connect(), 8000)
      return
    }
    seat = s
    sync = new PeerSync(
      s.room,
      () => ({ x: me.destination.x, z: me.destination.z, joinedAt: s.joinedAt }),
      handlers,
    )
    sync.start()
    refreshStatus()
    if (import.meta.env.DEV) console.info(`[space] ${theme.id} room-${s.index} 입장 (나: ${me.nickname})`)
  }

  // ── 입력: 탭 이동 (전송은 1초에 1번, 마지막 목적지만) ─────────────────────────
  let pendingMove: { x: number; z: number } | null = null
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  const flushMove = () => {
    if (!pendingMove) return
    const wait = limiter.moveWait()
    if (wait > 0) {
      moveTimer ??= setTimeout(() => {
        moveTimer = undefined
        flushMove()
      }, wait)
      return
    }
    sync?.sendMove(pendingMove.x, pendingMove.z)
    limiter.markMove()
    pendingMove = null
  }
  attachPicking(renderer.domElement, camera, (x, z) => {
    const c = clampToWorld(x, z)
    const p = pushOut(c.x, c.z, theme.keepOut)
    me.walkTo(p.x, p.z)
    marker.show(p.x, p.z)
    pendingMove = p
    flushMove()
  })

  // ── 입력: 행동 버튼 ───────────────────────────────────────────────────────
  const bar = new ActionBar($('#actionbar'), limiter, (id: ActionId) => {
    me.play(id, clock())
    sync?.sendAction(id)
  })

  // ── 렌더 루프 ─────────────────────────────────────────────────────────────
  const look = new THREE.Vector3()
  const CAM_OFFSET = new THREE.Vector3(...theme.cameraOffset)
  const FOLLOW = 0.6
  let last = performance.now()
  const frame = () => {
    const nowMs = performance.now()
    const dt = Math.min(0.05, (nowMs - last) / 1000)
    last = nowMs
    const t = nowMs / 1000
    world.update(dt, t)
    me.update(dt, t)
    for (const a of others.values()) a.update(dt, t)
    marker.update(dt)
    bar.update()
    audio.setListener(me.position.x, me.position.z)
    look.lerp(me.position.clone().multiplyScalar(FOLLOW), Math.min(1, dt * 3))
    camera.position.copy(look).add(CAM_OFFSET)
    camera.lookAt(look.x, 0.8, look.z)
    renderer.render(scene, camera)
  }
  look.copy(me.position).multiplyScalar(FOLLOW)
  renderer.setAnimationLoop(frame)

  // ── 생명주기: 백그라운드에서는 렌더·연결을 모두 멈춘다 ───────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null)
      audio.pause()
      void disconnect()
    } else {
      last = performance.now()
      renderer.setAnimationLoop(frame)
      audio.resume()
      void connect()
    }
  })
  addEventListener('pagehide', () => void disconnect())
  addEventListener('offline', () => status.offline())
  addEventListener('online', () => void connect())
  renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault())

  void connect()

  // 개발 모드 전용 도구: 도배 내성 테스트 (보내는 쪽 제한을 우회해서 직접 전송)
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __space: {
        spam(id: ActionId = 'wave', n = 20) {
          for (let i = 0; i < n; i++) sync?.sendAction(id)
        },
        get room() {
          return seat?.index
        },
        get peers() {
          return sync?.peers() ?? []
        },
        audio,
      },
    })
  }
}

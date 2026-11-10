import './style.css'
import * as THREE from 'three'
import type { ActionId } from './actions'
import {
  APP_ID, LANTERN_COOLDOWN_MS, MAX_ROOMS, ROOM_CAPACITY, ROOM_OVERFLOW, ROOM_PW, SETTLE_MS, TURN,
} from './config'
import { clampToWorld } from './protocol'
import { SendLimiter } from './net/limits'
import { Lobby, shouldYield, type Seat } from './net/Lobby'
import { PeerSync, type PeerHandlers } from './net/PeerSync'
import { joinRoom, selfId } from './net/strategy'
import { AudioEngine } from './audio/AudioEngine'
import { Avatar, pushOut } from './scene/Avatar'
import { attachPicking, TapMarker } from './scene/Picking'
import { Lanterns, type Lantern } from './scene/Lanterns'
import type { ThemeDef } from './scene/World'
import { ActionBar } from './ui/ActionBar'
import { Status } from './ui/Status'
import { Toast } from './ui/Toast'
import { LanternSheet, confirmHide } from './ui/LanternSheet'
import { pickTheme } from './ui/ThemePicker'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

// ── 웹뷰 잠금: 길게 누르기 메뉴, 선택, 드래그, 확대, 링크 이동 차단 ──────────────
const inInput = (e: Event) => (e.target as Element | null)?.closest?.('input, textarea') != null
for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick'] as const) {
  document.addEventListener(type, (e) => inInput(e) || e.preventDefault(), { passive: false })
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
  const spots = world.spots ?? []
  /** 네트워크로 받은 자리 번호를 이 테마의 자리로 (범위 밖이면 null) */
  const spotAt = (i: number | undefined) => (i !== undefined && i >= 0 ? (spots[i] ?? null) : null)
  const toast = new Toast($('#toast'))
  $('#hint').textContent = theme.hint
  const marker = new TapMarker()
  scene.add(marker.mesh)
  const lanterns = new Lanterns(scene)
  /** 이번 접속 동안 풍등을 가린 사람 */
  const hiddenLanterns = new Set<string>()

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

  /**
   * 같은 자리를 두 사람이 동시에 차지했으면 peerId 가 큰 쪽이 양보한다.
   * 양쪽이 같은 규칙으로 판단하므로 조율 메시지가 필요 없다.
   */
  const resolveSeatConflict = () => {
    const mine = me.seatIndex
    const s = spotAt(mine)
    if (!s) return
    for (const [id, a] of others) {
      if (a.seatIndex === mine && selfId > id) {
        standAndWalk(s.ax, s.az)
        toast.show('다른 분이 먼저 자리를 잡았어요')
        return
      }
    }
  }

  /** 다른 사람의 이동/자리 변경을 반영 */
  const applyRemote = (a: Avatar, x: number, z: number, seatIdx: number | undefined, instant: boolean) => {
    const s = spotAt(seatIdx)
    if (s) {
      if (instant) a.placeInSpot(seatIdx!, s)
      else a.goToSpot(seatIdx!, s)
    } else if (instant) {
      a.placeAt(x, z)
    } else {
      a.walkTo(x, z)
    }
    resolveSeatConflict()
  }

  const handlers: PeerHandlers = {
    onState(id, s, isNew) {
      let a = others.get(id)
      if (!a) {
        a = new Avatar(id)
        a.onStep = stepOf(a)
        scene.add(a.root)
        others.set(id, a)
        applyRemote(a, s.x, s.z, s.seat, true)
      } else if (!isNew) {
        // 하트비트: 이미 같은 자리에 있으면 그대로 둔다
        const seatNow = s.seat ?? -1
        if (seatNow < 0 || seatNow !== a.seatIndex) applyRemote(a, s.x, s.z, seatNow, false)
      }
      joinedAt.set(id, s.joinedAt)
      refreshStatus()
      checkOverflow()
    },
    onMove(id, x, z, seatIdx) {
      const a = others.get(id)
      if (a) applyRemote(a, x, z, seatIdx, false)
    },
    onAction: (id, act) => others.get(id)?.play(act, clock()),
    onLantern(id, text) {
      const a = others.get(id)
      if (!a || hiddenLanterns.has(id)) return
      lanterns.launch(id, a.position.x, a.position.z, text, false)
      const d = Math.hypot(a.position.x - me.position.x, a.position.z - me.position.z)
      audio.lantern(Math.max(0.15, 0.5 - d * 0.04))
    },
    onLeave: removePeer,
    onMuted(id) {
      lanterns.removeOwner(id)
      removePeer(id)
    },
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
      () => ({ x: me.destination.x, z: me.destination.z, joinedAt: s.joinedAt, seat: me.seatIndex }),
      handlers,
    )
    sync.start()
    refreshStatus()
    if (import.meta.env.DEV) console.info(`[space] ${theme.id} room-${s.index} 입장 (나: ${me.nickname})`)
  }

  // ── 입력: 탭 이동 (전송은 1초에 1번, 마지막 목적지만) ─────────────────────────
  let pendingMove: { x: number; z: number; seat: number } | null = null
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
    sync?.sendMove(pendingMove.x, pendingMove.z, pendingMove.seat)
    limiter.markMove()
    pendingMove = null
  }
  const queueMove = (x: number, z: number, seatIdx: number) => {
    pendingMove = { x, z, seat: seatIdx }
    flushMove()
  }

  function standAndWalk(x: number, z: number): void {
    endGaze()
    const c = clampToWorld(x, z)
    const p = pushOut(c.x, c.z, theme.keepOut)
    me.walkTo(p.x, p.z)
    world.focusSpot?.(-1)
    marker.show(p.x, p.z)
    queueMove(p.x, p.z, -1)
  }

  /** 의자/텐트를 눌렀을 때: 빈 자리가 있으면 가서 앉거나 눕는다 */
  const takeSpot = (ids: number[]) => {
    endGaze()
    if (ids.includes(me.seatIndex)) return
    const taken = new Set([...others.values()].map((a) => a.seatIndex))
    const free = ids.find((i) => !taken.has(i) && spots[i])
    if (free === undefined) {
      toast.show(spots[ids[0]]?.kind === 'lie' ? '텐트에 자리가 없어요' : '이미 다른 분이 앉아 있어요')
      return
    }
    const s = spots[free]
    me.goToSpot(free, s)
    world.focusSpot?.(free)
    marker.show(s.ax, s.az)
    queueMove(s.ax, s.az, free)
  }

  const spotTargets = world.targets ?? []
  attachPicking(renderer.domElement, camera, {
    targets: () => [...lanterns.targets(), ...spotTargets],
    onTarget(obj) {
      const spotIds = obj.userData.spots as number[] | undefined
      if (spotIds?.length) {
        takeSpot(spotIds)
        return true
      }
      const l = lanterns.lanternOf(obj)
      if (!l) return false
      if (l.owner !== selfId) {
        void confirmHide($('#lantern-hide'), l.text).then((yes) => {
          if (!yes) return
          hiddenLanterns.add(l.owner)
          lanterns.removeOwner(l.owner)
          toast.show('이 분의 풍등을 가렸어요')
        })
      }
      return true
    },
    onGround: standAndWalk,
  })

  // ── 풍등 ─────────────────────────────────────────────────────────────────
  const sheet = new LanternSheet($('#lantern-sheet'))
  const lanternBtn = $<HTMLButtonElement>('#lantern')
  const lanternSecs = lanternBtn.querySelector<HTMLElement>('.cd b')!
  lanternBtn.hidden = false
  /** 내 풍등을 날린 직후 몇 초 동안 카메라가 살짝 올려다본다 */
  let gaze: { l: Lantern; t: number } | null = null
  const GAZE_IN = 1.5
  const GAZE_HOLD = 7
  const GAZE_OUT = 2.5
  function endGaze(): void {
    if (gaze && gaze.t < GAZE_HOLD) gaze.t = GAZE_HOLD
  }
  lanternBtn.addEventListener('click', () => {
    const wait = limiter.lanternRemaining()
    if (wait > 0) {
      lanternBtn.classList.remove('nope')
      void lanternBtn.offsetWidth
      lanternBtn.classList.add('nope')
      toast.show(`${Math.ceil(wait / 1000)}초 뒤에 다시 날릴 수 있어요`)
      return
    }
    sheet.open((text) => {
      if (!limiter.tryLantern()) return false
      const l = lanterns.launch(selfId, me.position.x, me.position.z, text, true)
      sync?.sendLantern(text)
      audio.lantern(1)
      navigator.vibrate?.(15)
      gaze = { l, t: 0 }
      return true
    })
  })
  const updateLanternBtn = () => {
    const wait = limiter.lanternRemaining()
    lanternBtn.classList.toggle('locked', wait > 0)
    if (wait > 0) {
      lanternBtn.style.setProperty('--p', String(wait / LANTERN_COOLDOWN_MS))
      const sec = String(Math.ceil(wait / 1000))
      if (lanternSecs.textContent !== sec) lanternSecs.textContent = sec
    }
  }

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
    lanterns.update(dt)
    bar.update()
    updateLanternBtn()
    audio.setListener(me.position.x, me.position.z)
    look.lerp(me.position.clone().multiplyScalar(FOLLOW), Math.min(1, dt * 3))
    camera.position.copy(look).add(CAM_OFFSET)
    let lookY = 0.8
    if (gaze) {
      gaze.t += dt
      const g = gaze.t
      const w =
        g < GAZE_IN ? g / GAZE_IN : g < GAZE_HOLD ? 1 : Math.max(0, 1 - (g - GAZE_HOLD) / GAZE_OUT)
      const h = lanterns.heightOf(gaze.l)
      if (h === null || w <= 0) gaze = null
      else lookY += (h - 0.8) * 0.85 * (w * w * (3 - 2 * w))
    }
    camera.lookAt(look.x, lookY, look.z)
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
        /** 자리 i 의 화면 좌표 (E2E 에서 실제로 탭해 보기 위함) */
        screenOfSpot(i: number) {
          const sp = spots[i]
          // 의자는 좌석, 텐트는 몸통 가운데 (발 위치에서 텐트 안쪽으로)
          const v =
            sp.kind === 'lie'
              ? new THREE.Vector3(sp.x * 2 - sp.ax, 1.0, sp.z * 2 - sp.az).project(camera)
              : new THREE.Vector3(sp.x, 0.7, sp.z).project(camera)
          const r = renderer.domElement.getBoundingClientRect()
          return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
        },
        lanterns,
        /** 쿨타임·필터를 건너뛰고 풍등 전송 (받는 쪽 방어 테스트) */
        rawLantern(text: string) {
          sync?.sendLantern(text)
        },
        get mySeat() {
          return me.seatIndex
        },
        get seats() {
          return Object.fromEntries([...others].map(([id, a]) => [id, a.seatIndex]))
        },
      },
    })
  }
}

import * as THREE from 'three'
import { getAction, type ActionId } from '../actions'
import { hueFor, nicknameFor } from '../identity'
import type { SpotDef } from './themes/common'
import { MarshmallowRoast } from './MarshmallowRoast'

// 모든 아바타가 지오메트리를 공유한다
const GEO = {
  body: new THREE.CapsuleGeometry(0.32, 0.5, 4, 10),
  head: new THREE.SphereGeometry(0.3, 16, 12),
  arm: new THREE.CapsuleGeometry(0.08, 0.34, 3, 6),
  eye: new THREE.SphereGeometry(0.045, 6, 4),
  ring: new THREE.RingGeometry(0.46, 0.56, 28),
}
const MAT_EYE = new THREE.MeshBasicMaterial({ color: 0x2b2633 })
const MAT_RING = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })

const bodyMats = new Map<number, THREE.MeshLambertMaterial>()
function bodyMaterial(hue: number): THREE.MeshLambertMaterial {
  const key = Math.round(hue * 360)
  let m = bodyMats.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.62, 0.62) })
    bodyMats.set(key, m)
  }
  return m
}

const emojiTextures = new Map<string, THREE.Texture>()
function emojiTexture(emoji: string): THREE.Texture {
  let t = emojiTextures.get(emoji)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(emoji, 64, 72)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    emojiTextures.set(emoji, t)
  }
  return t
}

function labelSprite(text: string, self: boolean): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.font = '600 28px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
  const w = Math.min(248, g.measureText(text).width + 28)
  g.fillStyle = self ? 'rgba(255,240,200,0.92)' : 'rgba(30,28,48,0.55)'
  g.beginPath()
  g.roundRect((256 - w) / 2, 10, w, 44, 22)
  g.fill()
  g.fillStyle = self ? '#3a2d1c' : '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 33)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // 이름표는 텐트·나무에 가려지지 않게 항상 위에 그린다
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false }))
  s.renderOrder = 10
  s.scale.set(1.7, 0.425, 1)
  s.position.y = 2.05
  return s
}

const WALK_SPEED = 2.2
const ease = (p: number) => Math.sin(Math.min(1, Math.max(0, p)) * Math.PI)
/** 0→1 빠르게 올라가고, 끝에서 내려오는 엔벨로프 */
const hold = (p: number) => Math.min(1, p * 5, (1 - p) * 5)

/** 중심에서 k 보다 가까운 좌표를 원 둘레로 밀어낸다 */
export function pushOut(x: number, z: number, k: number): { x: number; z: number } {
  if (k <= 0) return { x, z }
  const r = Math.hypot(x, z)
  if (r >= k) return { x, z }
  if (r < 1e-6) return { x: k, z: 0 }
  return { x: (x / r) * k, z: (z / r) * k }
}

export class Avatar {
  /** 테마의 가운데 장애물 반지름 (모든 아바타 공통) */
  static keepOut = 0

  readonly root = new THREE.Group()
  readonly nickname: string
  private rig = new THREE.Group()
  private head: THREE.Mesh
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private emote: THREE.Sprite
  private label: THREE.Sprite
  private roast = new MarshmallowRoast()
  private target: THREE.Vector3 | null = null
  private act: { id: ActionId; t0: number; dur: number } | null = null
  private walkPhase = 0
  private lastStep = 0
  /** 한 걸음 디딜 때마다 (발소리용) */
  onStep: (() => void) | null = null
  /** 다른 행동으로 중단되지 않고 끝까지 재생됐을 때만 호출 */
  onActionEnd: ((id: ActionId) => void) | null = null

  /** 차지한(또는 가는 중인) 자리 번호, -1 = 서 있음 */
  seatIndex = -1
  private spot: SpotDef | null = null
  /** 자리에 들어가는 중 (다가가는 지점 → 자리) */
  private settle: { from: THREE.Vector3; yaw0: number; t: number } | null = null
  private seated = false
  /** 자세 섞는 정도 0(서기)~1(앉기/눕기), 일어날 때 부드럽게 풀기 위해 마지막 자세를 기억 */
  private poseW = 0
  private poseKind: SpotDef['kind'] = 'sit'

  constructor(
    readonly peerId: string,
    readonly isSelf = false,
  ) {
    this.nickname = nicknameFor(peerId)
    const mat = bodyMaterial(hueFor(peerId))

    const body = new THREE.Mesh(GEO.body, mat)
    body.position.y = 0.57
    this.head = new THREE.Mesh(GEO.head, mat)
    this.head.position.y = 1.38
    for (const x of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(GEO.eye, MAT_EYE)
      eye.position.set(x, 0.03, 0.27)
      this.head.add(eye)
    }
    for (const [arm, x] of [[this.armL, -0.38], [this.armR, 0.38]] as const) {
      const m = new THREE.Mesh(GEO.arm, mat)
      m.position.y = -0.22
      arm.add(m)
      arm.position.set(x, 1.0, 0)
    }
    this.rig.add(body, this.head, this.armL, this.armR, this.roast.root)
    this.rig.rotation.order = 'YXZ' // 방향(yaw)을 먼저 돌리고, 그 기준으로 숙이기(x)
    this.root.add(this.rig)

    if (isSelf) {
      const ring = new THREE.Mesh(GEO.ring, MAT_RING)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.02
      this.root.add(ring)
    }

    this.label = labelSprite(this.nickname, isSelf)
    this.emote = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }))
    this.emote.renderOrder = 11
    this.emote.visible = false
    this.root.add(this.label, this.emote)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  get isSitting(): boolean {
    return this.seated && this.poseKind === 'sit'
  }

  /** 현재 목적지 (없으면 현재 위치) — 상태 동기화용 */
  get destination(): THREE.Vector3 {
    return this.target ?? this.root.position
  }

  placeAt(x: number, z: number): void {
    this.leaveSpot()
    const p = pushOut(x, z, Avatar.keepOut)
    this.root.position.set(p.x, 0, p.z)
    this.target = null
  }

  /** 그냥 걷기 — 앉아 있었다면 일어나서 간다 */
  walkTo(x: number, z: number): void {
    this.leaveSpot()
    const p = pushOut(x, z, Avatar.keepOut)
    this.target = new THREE.Vector3(p.x, 0, p.z)
  }

  /** 자리로 걸어가서 앉거나 눕는다 */
  goToSpot(index: number, spot: SpotDef): void {
    if (this.seatIndex === index && this.spot) return
    this.leaveSpot()
    this.seatIndex = index
    this.spot = spot
    this.poseKind = spot.kind
    this.target = new THREE.Vector3(spot.ax, 0, spot.az)
  }

  /** 이미 앉아/누워 있는 상태로 바로 배치 (늦게 들어온 사람이 볼 때) */
  placeInSpot(index: number, spot: SpotDef): void {
    this.seatIndex = index
    this.spot = spot
    this.poseKind = spot.kind
    this.settle = null
    this.seated = true
    this.poseW = 1
    this.target = null
    this.root.position.set(spot.x, 0, spot.z)
    this.rig.rotation.y = spot.yaw
  }

  private leaveSpot(): void {
    this.seatIndex = -1
    this.spot = null
    this.settle = null
    this.seated = false
  }

  play(id: ActionId, now: number): void {
    const a = getAction(id)
    this.act = { id, t0: now, dur: a.durationMs / 1000 }
    this.emote.material.map = emojiTexture(a.emoji)
    this.emote.material.needsUpdate = true
    this.emote.visible = true
  }

  update(dt: number, t: number): void {
    // 이동
    let walking = false
    if (this.target) {
      const d = this.target.clone().sub(this.root.position)
      const dist = d.length()
      if (dist < 0.05) {
        this.target = null
        if (this.spot && !this.seated) {
          this.settle = { from: this.root.position.clone(), yaw0: this.rig.rotation.y, t: 0 }
        }
      } else {
        walking = true
        const step = Math.min(dist, WALK_SPEED * dt)
        const p = this.root.position
        const dir = d.normalize()
        const k = Avatar.keepOut
        if (k > 0 && Math.hypot(p.x + dir.x * step, p.z + dir.z * step) < k) {
          // 가운데(모닥불 등)를 가로지르지 않고 둘레를 따라 돌아간다
          let tx = -p.z
          let tz = p.x
          const len = Math.hypot(tx, tz) || 1
          tx /= len
          tz /= len
          if (tx * dir.x + tz * dir.z < 0) {
            tx = -tx
            tz = -tz
          }
          dir.set(tx, 0, tz)
        }
        p.addScaledVector(dir, step)
        if (k > 0) {
          const r = Math.hypot(p.x, p.z)
          if (r < k && r > 1e-6) p.multiplyScalar(k / r)
        }
        const yaw = Math.atan2(dir.x, dir.z)
        let diff = yaw - this.rig.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        this.rig.rotation.y += diff * Math.min(1, dt * 10)
      }
    }
    // 자리에 들어가기: 다가가는 지점에서 자리로 미끄러지듯 이동하며 방향을 맞춘다
    if (this.settle && this.spot) {
      const s = this.settle
      s.t = Math.min(1, s.t + dt / 0.5)
      const e = s.t * s.t * (3 - 2 * s.t)
      this.root.position.lerpVectors(s.from, new THREE.Vector3(this.spot.x, 0, this.spot.z), e)
      let diff = this.spot.yaw - s.yaw0
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      this.rig.rotation.y = s.yaw0 + diff * e
      if (s.t >= 1) {
        this.settle = null
        this.seated = true
      }
    }
    const poseGoal = this.seated || this.settle ? 1 : 0
    this.poseW += (poseGoal - this.poseW) * Math.min(1, dt * 6)

    this.walkPhase = walking ? this.walkPhase + dt * 11 : this.walkPhase * 0.85
    // 팔 흔들기 반 주기 = 한 걸음
    const stepIdx = Math.floor(this.walkPhase / Math.PI)
    if (walking && stepIdx !== this.lastStep) this.onStep?.()
    this.lastStep = stepIdx

    // 기본 자세 (숨쉬기 + 걷기)
    const swing = Math.sin(this.walkPhase) * 0.5
    let armL = -0.12
    let armR = 0.12
    let armRX = -swing
    let lift = Math.abs(Math.sin(this.walkPhase)) * 0.08
    let tiltX = 0
    let tiltZ = 0
    let headZ = 0
    let stretch = 1 + Math.sin(t * 2 + this.peerId.length) * 0.015

    // 행동 애니메이션
    this.roast.hide()
    if (this.act) {
      const el = t - this.act.t0
      const p = el / this.act.dur
      if (p >= 1) {
        const finished = this.act.id
        this.act = null
        this.emote.visible = false
        this.onActionEnd?.(finished)
      } else {
        const e = hold(p)
        switch (this.act.id) {
          case 'wave':
            armR = THREE.MathUtils.lerp(armR, 2.6 + Math.sin(el * 12) * 0.35, e)
            break
          case 'bow':
            tiltX = 0.55 * ease(p)
            break
          case 'cheer':
            armL = THREE.MathUtils.lerp(armL, -2.8, e)
            armR = THREE.MathUtils.lerp(armR, 2.8, e)
            lift += Math.abs(Math.sin(el * 8)) * 0.35 * e
            break
          case 'stretch':
            armL = THREE.MathUtils.lerp(armL, -2.95, ease(p))
            armR = THREE.MathUtils.lerp(armR, 2.95, ease(p))
            stretch += 0.1 * ease(p)
            break
          case 'heart':
            tiltZ = Math.sin(el * 4) * 0.12 * e
            break
          case 'sleep':
            headZ = 0.3 * e
            lift += Math.sin(el * 2) * 0.02 * e
            break
          case 'roast':
            armR = THREE.MathUtils.lerp(armR, 0.05, e)
            armRX = THREE.MathUtils.lerp(armRX, -1.15, e)
            this.roast.update(p, t)
            break
        }
        // 이모지: 떠오르며 사라짐
        const pop = Math.min(1, el * 6)
        this.emote.position.y = 2.5 + p * 0.6
        this.emote.scale.setScalar(0.75 * pop)
        this.emote.material.opacity = Math.min(1, (1 - p) * 3)
      }
    }

    // 앉기/눕기 자세 (행동 애니메이션 위에 더한다)
    const w = this.poseW
    let lie = 0
    if (w > 0.001) {
      if (this.poseKind === 'sit') {
        // 다리가 없는 몸이라 의자 천(좌석 높이 ≈0.57)에 몸 아랫부분이 묻히도록 앉히고, 등받이에 기댄다
        lift += 0.36 * w
        tiltX += -0.2 * w
        armL += -0.4 * w
        armR += 0.4 * w
        stretch *= 1 - 0.08 * w
      } else {
        // 발을 축으로 뒤로 눕는다 (YXZ 순서라 머리가 몸 뒤쪽 = 텐트 안쪽으로)
        lie = w
        lift += 0.3 * w
        tiltX += (-Math.PI / 2) * w
        armL *= 1 - w
        armR *= 1 - w
      }
    }
    // 누우면 이름표·이모지를 머리 쪽으로 옮긴다
    const yaw = this.rig.rotation.y
    const hx = -Math.sin(yaw) * 0.9 * lie
    const hz = -Math.cos(yaw) * 0.9 * lie
    this.label.position.set(hx, 2.05 - 1.15 * lie, hz)
    this.emote.position.x = hx
    this.emote.position.z = hz
    if (lie > 0 && this.act) this.emote.position.y -= 1.15 * lie

    this.armL.rotation.z = armL
    this.armR.rotation.z = armR
    this.armL.rotation.x = swing
    this.armR.rotation.x = armRX
    this.rig.position.y = lift
    this.rig.rotation.x = tiltX
    this.rig.rotation.z = tiltZ
    this.rig.scale.y = stretch
    this.head.rotation.z = headZ
  }

  dispose(): void {
    this.label.material.map?.dispose()
    this.label.material.dispose()
    this.emote.material.dispose()
    this.roast.dispose()
    this.root.removeFromParent()
  }
}

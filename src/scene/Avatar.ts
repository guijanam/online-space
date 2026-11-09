import * as THREE from 'three'
import { getAction, type ActionId } from '../actions'
import { hueFor, nicknameFor } from '../identity'

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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }))
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
  private target: THREE.Vector3 | null = null
  private act: { id: ActionId; t0: number; dur: number } | null = null
  private walkPhase = 0
  private lastStep = 0
  /** 한 걸음 디딜 때마다 (발소리용) */
  onStep: (() => void) | null = null

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
    this.rig.add(body, this.head, this.armL, this.armR)
    this.rig.rotation.order = 'YXZ' // 방향(yaw)을 먼저 돌리고, 그 기준으로 숙이기(x)
    this.root.add(this.rig)

    if (isSelf) {
      const ring = new THREE.Mesh(GEO.ring, MAT_RING)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.02
      this.root.add(ring)
    }

    this.label = labelSprite(this.nickname, isSelf)
    this.emote = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
    this.emote.visible = false
    this.root.add(this.label, this.emote)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** 현재 목적지 (없으면 현재 위치) — 상태 동기화용 */
  get destination(): THREE.Vector3 {
    return this.target ?? this.root.position
  }

  placeAt(x: number, z: number): void {
    const p = pushOut(x, z, Avatar.keepOut)
    this.root.position.set(p.x, 0, p.z)
    this.target = null
  }

  walkTo(x: number, z: number): void {
    const p = pushOut(x, z, Avatar.keepOut)
    this.target = new THREE.Vector3(p.x, 0, p.z)
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
    this.walkPhase = walking ? this.walkPhase + dt * 11 : this.walkPhase * 0.85
    // 팔 흔들기 반 주기 = 한 걸음
    const stepIdx = Math.floor(this.walkPhase / Math.PI)
    if (walking && stepIdx !== this.lastStep) this.onStep?.()
    this.lastStep = stepIdx

    // 기본 자세 (숨쉬기 + 걷기)
    const swing = Math.sin(this.walkPhase) * 0.5
    let armL = -0.12
    let armR = 0.12
    let lift = Math.abs(Math.sin(this.walkPhase)) * 0.08
    let tiltX = 0
    let tiltZ = 0
    let headZ = 0
    let stretch = 1 + Math.sin(t * 2 + this.peerId.length) * 0.015

    // 행동 애니메이션
    if (this.act) {
      const el = t - this.act.t0
      const p = el / this.act.dur
      if (p >= 1) {
        this.act = null
        this.emote.visible = false
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
        }
        // 이모지: 떠오르며 사라짐
        const pop = Math.min(1, el * 6)
        this.emote.position.y = 2.5 + p * 0.6
        this.emote.scale.setScalar(0.75 * pop)
        this.emote.material.opacity = Math.min(1, (1 - p) * 3)
      }
    }

    this.armL.rotation.z = armL
    this.armR.rotation.z = armR
    this.armL.rotation.x = swing
    this.armR.rotation.x = -swing
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
    this.root.removeFromParent()
  }
}

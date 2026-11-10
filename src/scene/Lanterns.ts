import * as THREE from 'three'
import { glowTexture } from './themes/common'

/** 풍등 하나가 하늘에 머무는 시간(초) */
const LIFE = 42
/** 글씨가 보이는 시간(초) — 그 뒤로는 불빛만 남는다 */
const TEXT_LIFE = 18
/** 동시에 보이는 풍등 수 상한 (오래된 것부터 사라짐) */
const MAX_LANTERNS = 24

let shared: {
  body: THREE.CylinderGeometry
  cap: THREE.CircleGeometry
  bodyTex: THREE.Texture
  glow: THREE.Texture
  hit: THREE.SphereGeometry
  hitMat: THREE.MeshBasicMaterial
} | null = null

function assets() {
  if (shared) return shared
  // 아래쪽이 밝고 위로 갈수록 붉어지는 한지 느낌
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 64, 0, 0)
  grad.addColorStop(0, '#fff3c4')
  grad.addColorStop(0.45, '#ffc062')
  grad.addColorStop(1, '#e0652e')
  g.fillStyle = grad
  g.fillRect(0, 0, 8, 64)
  const bodyTex = new THREE.CanvasTexture(c)
  bodyTex.colorSpace = THREE.SRGBColorSpace
  shared = {
    body: new THREE.CylinderGeometry(0.3, 0.22, 0.6, 12, 1, true),
    cap: new THREE.CircleGeometry(0.3, 12),
    bodyTex,
    glow: glowTexture('rgba(255,190,110,0.9)', 'rgba(255,120,40,0)'),
    hit: new THREE.SphereGeometry(0.75, 8, 6),
    hitMat: new THREE.MeshBasicMaterial({ visible: false }),
  }
  return shared
}

function textSprite(text: string, own: boolean): THREE.Sprite {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const font = '600 30px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
  g.font = font
  const w = Math.ceil(g.measureText(text).width) + 36
  c.width = w
  c.height = 56
  g.font = font
  g.fillStyle = own ? 'rgba(120,60,20,0.62)' : 'rgba(40,24,30,0.55)'
  g.beginPath()
  g.roundRect(0, 4, w, 48, 24)
  g.fill()
  g.fillStyle = '#fff6e0'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, w / 2, 29)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }),
  )
  const h = 0.42
  s.scale.set((h * w) / 56, h, 1)
  s.position.y = 0.62 // 풍등 위쪽 (아래는 아바타 이름표와 겹친다)
  s.renderOrder = 12
  return s
}

type Lantern = {
  owner: string
  text: string
  root: THREE.Group
  body: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>
  cap: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  halo: THREE.Sprite
  label: THREE.Sprite
  hit: THREE.Mesh
  start: THREE.Vector3
  drift: THREE.Vector2
  seed: number
  age: number
}

/**
 * 풍등: 사람 머리 위에서 떠올라 천천히 하늘로 멀어지다가 사라진다.
 * 저장하지 않는다 — 그 순간 같은 방에 있던 사람만 본다.
 */
export class Lanterns {
  readonly group = new THREE.Group()
  private list: Lantern[] = []

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  launch(owner: string, x: number, z: number, text: string, own: boolean): Lantern {
    const a = assets()
    while (this.list.length >= MAX_LANTERNS) this.remove(this.list[0])

    const root = new THREE.Group()
    const body = new THREE.Mesh(
      a.body,
      new THREE.MeshBasicMaterial({ map: a.bodyTex, side: THREE.DoubleSide, transparent: true, fog: false }),
    )
    const cap = new THREE.Mesh(a.cap, new THREE.MeshBasicMaterial({ color: 0xc8502a, transparent: true, fog: false }))
    cap.rotation.x = -Math.PI / 2
    cap.position.y = 0.3
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: a.glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    )
    halo.scale.setScalar(1.9)
    const label = textSprite(text, own)
    const hit = new THREE.Mesh(a.hit, a.hitMat)
    root.add(halo, body, cap, label, hit)

    const start = new THREE.Vector3(x, 2.6, z)
    root.position.copy(start)
    root.scale.setScalar(0.01)
    // 바람: 카메라 반대쪽(먼 하늘)으로 흘러가서 화면에 오래 남는다
    const drift = new THREE.Vector2((Math.random() - 0.5) * 0.3, -(0.32 + Math.random() * 0.12))
    const l: Lantern = { owner, text, root, body, cap, halo, label, hit, start, drift, seed: Math.random() * 100, age: 0 }
    hit.userData.lantern = l
    this.group.add(root)
    this.list.push(l)
    return l
  }

  /** 탭 판정용 */
  targets(): THREE.Object3D[] {
    return this.list.map((l) => l.hit)
  }

  /** 탭한 물체가 풍등이면 그 풍등 */
  lanternOf(obj: THREE.Object3D): Lantern | null {
    return (obj.userData.lantern as Lantern | undefined) ?? null
  }

  /** 이 사람이 날린 풍등을 모두 내린다 */
  removeOwner(owner: string): void {
    for (const l of [...this.list]) if (l.owner === owner) this.remove(l)
  }

  /** 풍등의 현재 높이 (카메라가 내 풍등을 올려다볼 때) */
  heightOf(l: Lantern): number | null {
    return this.list.includes(l) ? l.root.position.y : null
  }

  update(dt: number): void {
    for (const l of [...this.list]) {
      l.age += dt
      const t = l.age
      if (t >= LIFE) {
        this.remove(l)
        continue
      }
      // 처음 3초는 천천히 커지며 떠오르고, 그다음 일정한 속도로 올라간다
      const rise = t < 3 ? 0.07 * t * t : 0.63 + (t - 3) * 0.42
      const wander = t < 3 ? (t / 3) ** 2 : 1
      const sway = Math.sin(t * 0.7 + l.seed) * 0.35 * wander
      l.root.position.set(
        l.start.x + (l.drift.x * t + sway) * wander,
        l.start.y + rise,
        l.start.z + l.drift.y * Math.max(0, t - 2),
      )
      l.root.scale.setScalar(Math.min(1, 0.3 + t * 0.7))
      l.root.rotation.y = t * 0.25 + l.seed
      // 불빛이 살짝 일렁인다
      const flick = 0.85 + 0.15 * Math.sin(t * 9 + l.seed) * Math.sin(t * 5.3 + l.seed * 2)
      const fade = t > LIFE - 6 ? (LIFE - t) / 6 : 1
      l.halo.material.opacity = flick * fade
      l.body.material.opacity = (0.82 + flick * 0.18) * fade
      l.cap.material.opacity = fade
      l.label.material.opacity = t < TEXT_LIFE - 3 ? 1 : Math.max(0, (TEXT_LIFE - t) / 3)
      l.label.visible = t < TEXT_LIFE
    }
  }

  private remove(l: Lantern): void {
    const i = this.list.indexOf(l)
    if (i >= 0) this.list.splice(i, 1)
    this.group.remove(l.root)
    l.body.material.dispose()
    l.cap.material.dispose()
    l.halo.material.dispose()
    l.label.material.map?.dispose()
    l.label.material.dispose()
  }
}

export type { Lantern }

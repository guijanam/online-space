import * as THREE from 'three'

export type WorldHandle = {
  /** 탭으로 이동할 수 있는 바닥 (Raycaster 대상) */
  floor: THREE.Mesh
  update(dt: number, t: number): void
}

export type ThemeDef = {
  id: string
  name: string
  emoji: string
  description: string
  /** 선택 카드 배경 (CSS) */
  preview: string
  /** 가운데 장애물(등불·모닥불) 반지름 — 아바타가 이 안으로 들어가지 않는다 */
  keepOut: number
  /** 처음 나타나는 위치 (중심으로부터 거리 범위) */
  spawn: [number, number]
  /** 바라보는 지점 기준 카메라 위치 */
  cameraOffset: [number, number, number]
  build(scene: THREE.Scene): WorldHandle
}

/** 세로 그라데이션 하늘 */
export function skyTexture(stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 2
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  g.fillRect(0, 0, 2, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 재현 가능한 난수 (테마 배치가 모든 기기에서 같도록) */
export function seeded(seed: number): () => number {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export function flatDisc(radius: number, color: number, y: number, segments = 48): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), new THREE.MeshLambertMaterial({ color }))
  m.rotation.x = -Math.PI / 2
  m.position.y = y
  return m
}

/** 원형으로 둘러싼 침엽수 숲 (InstancedMesh 2개) */
export function forestRing(opts: {
  count: number
  inner: number
  depth: number
  rand: () => number
  trunk: number
  crown: (rand: () => number, c: THREE.Color) => THREE.Color
  scale?: [number, number]
}): THREE.Object3D[] {
  const { count, inner, depth, rand } = opts
  const [smin, smax] = opts.scale ?? [0.8, 1.5]
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1, 6),
    new THREE.MeshLambertMaterial({ color: opts.trunk }),
    count,
  )
  const crowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 2.4, 7),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    count,
  )
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.15
    const r = inner + rand() * depth
    const s = smin + rand() * (smax - smin)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    m.compose(new THREE.Vector3(x, 0.5 * s, z), q, new THREE.Vector3(s, s, s))
    trunks.setMatrixAt(i, m)
    m.compose(new THREE.Vector3(x, 2.2 * s, z), q, new THREE.Vector3(s, s, s))
    crowns.setMatrixAt(i, m)
    crowns.setColorAt(i, opts.crown(rand, color))
  }
  return [trunks, crowns]
}

/** 가운데가 밝은 원형 빛 텍스처 (모닥불 빛무리 등) */
export function glowTexture(inner: string, outer = 'rgba(0,0,0,0)'): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

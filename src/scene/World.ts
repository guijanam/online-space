import * as THREE from 'three'
import { WORLD_RADIUS } from '../config'

/**
 * 테마 교체 지점 — 공간 컨셉이 정해지면 이 파일만 바꾼다.
 * 지금은 플레이스홀더: 해 질 녘 원형 광장 + 숲 + 반딧불.
 */
export type WorldHandle = {
  /** 탭으로 이동할 수 있는 바닥 (Raycaster 대상) */
  floor: THREE.Mesh
  update(dt: number, t: number): void
}

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 2
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#26305e')
  grad.addColorStop(0.45, '#6b6fa8')
  grad.addColorStop(0.75, '#e9a7a0')
  grad.addColorStop(1, '#f6d6b0')
  g.fillStyle = grad
  g.fillRect(0, 0, 2, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildWorld(scene: THREE.Scene): WorldHandle {
  scene.background = skyTexture()
  scene.fog = new THREE.Fog(0xb59aa8, 18, 42)

  scene.add(new THREE.HemisphereLight(0xffe9d6, 0x3b4a3a, 1.6))
  const sun = new THREE.DirectionalLight(0xffd2a8, 1.4)
  sun.position.set(-6, 10, 4)
  scene.add(sun)

  // 바깥 땅
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 32),
    new THREE.MeshLambertMaterial({ color: 0x5f7d55 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  scene.add(ground)

  // 광장 바닥 (이동 가능 영역)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS, 48),
    new THREE.MeshLambertMaterial({ color: 0x9fbf87 }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // 산책로 링
  const path = new THREE.Mesh(
    new THREE.RingGeometry(WORLD_RADIUS - 0.6, WORLD_RADIUS, 64),
    new THREE.MeshLambertMaterial({ color: 0xd9c6a1 }),
  )
  path.rotation.x = -Math.PI / 2
  path.position.y = 0.01
  scene.add(path)

  // 나무 (InstancedMesh 2개로 draw call 최소화)
  const TREE_COUNT = 34
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a33 }),
    TREE_COUNT,
  )
  const crowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 2.4, 7),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    TREE_COUNT,
  )
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const color = new THREE.Color()
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < TREE_COUNT; i++) {
    const a = (i / TREE_COUNT) * Math.PI * 2 + rand() * 0.15
    const r = WORLD_RADIUS + 1.8 + rand() * 6
    const s = 0.8 + rand() * 0.7
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    m.compose(new THREE.Vector3(x, 0.5 * s, z), q, new THREE.Vector3(s, s, s))
    trunks.setMatrixAt(i, m)
    m.compose(new THREE.Vector3(x, (1 + 1.2) * s, z), q, new THREE.Vector3(s, s, s))
    crowns.setMatrixAt(i, m)
    crowns.setColorAt(i, color.setHSL(0.27 + rand() * 0.08, 0.35, 0.3 + rand() * 0.12))
  }
  scene.add(trunks, crowns)

  // 가운데 등불
  const lamp = new THREE.Group()
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8),
    new THREE.MeshLambertMaterial({ color: 0x4b3d36 }),
  )
  post.position.y = 0.8
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe3a3 }),
  )
  orb.position.y = 1.85
  const glow = new THREE.PointLight(0xffc977, 6, 7, 1.6)
  glow.position.y = 1.85
  lamp.add(post, orb, glow)
  scene.add(lamp)

  // 반딧불
  const FIREFLIES = 90
  const base = new Float32Array(FIREFLIES * 3)
  const phase = new Float32Array(FIREFLIES)
  for (let i = 0; i < FIREFLIES; i++) {
    const a = rand() * Math.PI * 2
    const r = 1.5 + rand() * (WORLD_RADIUS + 5)
    base[i * 3] = Math.cos(a) * r
    base[i * 3 + 1] = 0.4 + rand() * 3
    base[i * 3 + 2] = Math.sin(a) * r
    phase[i] = rand() * Math.PI * 2
  }
  const fireGeo = new THREE.BufferGeometry()
  const pos = new Float32Array(base)
  fireGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const fireflies = new THREE.Points(
    fireGeo,
    new THREE.PointsMaterial({
      color: 0xfff1a8,
      size: 0.12,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  scene.add(fireflies)

  return {
    floor,
    update(_dt, t) {
      for (let i = 0; i < FIREFLIES; i++) {
        const p = phase[i]
        pos[i * 3] = base[i * 3] + Math.sin(t * 0.3 + p) * 0.6
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.7 + p * 2) * 0.3
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.25 + p) * 0.6
      }
      fireGeo.attributes.position.needsUpdate = true
      orb.position.y = 1.85 + Math.sin(t * 1.2) * 0.04
      glow.intensity = 6 + Math.sin(t * 2.1) * 0.6
    },
  }
}

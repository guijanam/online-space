import * as THREE from 'three'
import { WORLD_RADIUS } from '../../config'
import { flatDisc, forestRing, seeded, skyTexture, type ThemeDef, type WorldHandle } from './common'

/** 해 질 녘 광장 — 숲으로 둘러싸인 잔디 광장, 가운데 등불, 반딧불 */
function build(scene: THREE.Scene): WorldHandle {
  const rand = seeded(7)
  scene.background = skyTexture([
    [0, '#26305e'],
    [0.45, '#6b6fa8'],
    [0.75, '#e9a7a0'],
    [1, '#f6d6b0'],
  ])
  scene.fog = new THREE.Fog(0xb59aa8, 18, 42)

  scene.add(new THREE.HemisphereLight(0xffe9d6, 0x3b4a3a, 1.6))
  const sun = new THREE.DirectionalLight(0xffd2a8, 1.4)
  sun.position.set(-6, 10, 4)
  scene.add(sun)

  scene.add(flatDisc(40, 0x5f7d55, -0.02, 32))
  const floor = flatDisc(WORLD_RADIUS, 0x9fbf87, 0)
  scene.add(floor)

  const path = new THREE.Mesh(
    new THREE.RingGeometry(WORLD_RADIUS - 0.6, WORLD_RADIUS, 64),
    new THREE.MeshLambertMaterial({ color: 0xd9c6a1 }),
  )
  path.rotation.x = -Math.PI / 2
  path.position.y = 0.01
  scene.add(path)

  scene.add(
    ...forestRing({
      count: 34,
      inner: WORLD_RADIUS + 1.8,
      depth: 6,
      rand,
      trunk: 0x6b4a33,
      crown: (r, c) => c.setHSL(0.27 + r() * 0.08, 0.35, 0.3 + r() * 0.12),
    }),
  )

  // 가운데 등불
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8),
    new THREE.MeshLambertMaterial({ color: 0x4b3d36 }),
  )
  post.position.y = 0.8
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe3a3 }))
  orb.position.y = 1.85
  const glow = new THREE.PointLight(0xffc977, 6, 7, 1.6)
  glow.position.y = 1.85
  scene.add(post, orb, glow)

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
  scene.add(
    new THREE.Points(
      fireGeo,
      new THREE.PointsMaterial({
        color: 0xfff1a8,
        size: 0.12,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  )

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

export const plaza: ThemeDef = {
  id: 'plaza',
  name: '해 질 녘 광장',
  emoji: '🌇',
  description: '노을 진 숲속 광장을 거닐며 반딧불 구경',
  preview: 'linear-gradient(180deg,#26305e 0%,#6b6fa8 40%,#e9a7a0 70%,#9fbf87 71%,#7d9d68 100%)',
  keepOut: 0.5,
  spawn: [3, 6],
  cameraOffset: [0, 12, 12],
  sound: { ambience: 'dusk', footstep: 'grass' },
  build,
}

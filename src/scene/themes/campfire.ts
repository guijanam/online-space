import * as THREE from 'three'
import { WORLD_RADIUS } from '../../config'
import { flatDisc, forestRing, glowTexture, seeded, skyTexture, type ThemeDef, type WorldHandle } from './common'

/** 산속 캠핑 — 별 쏟아지는 밤, 산 능선, 텐트, 가운데 모닥불에서 불멍 */
function build(scene: THREE.Scene): WorldHandle {
  const rand = seeded(11)
  scene.background = skyTexture([
    [0, '#05081a'],
    [0.5, '#111735'],
    [0.8, '#241f47'],
    [1, '#3a2742'],
  ])
  scene.fog = new THREE.Fog(0x0b0e20, 16, 46)

  // 달빛(차갑게) + 아주 어두운 환경광 — 따뜻한 빛은 모닥불이 담당
  scene.add(new THREE.HemisphereLight(0x5a6bb0, 0x1a130e, 0.8))
  const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.45)
  moonLight.position.set(8, 12, -6)
  scene.add(moonLight)

  // ── 하늘: 별, 달 ─────────────────────────────────────────────
  const STARS = 360
  const starPos = new Float32Array(STARS * 3)
  for (let i = 0; i < STARS; i++) {
    const a = rand() * Math.PI * 2
    const elev = 0.16 + Math.pow(rand(), 1.6) * 1.3 // 지평선 위쪽, 낮은 하늘에 더 많이
    const R = 60
    starPos[i * 3] = Math.cos(a) * Math.cos(elev) * R
    starPos[i * 3 + 1] = Math.sin(elev) * R
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(elev) * R
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({
    color: 0xe8ecff,
    size: 0.5,
    transparent: true,
    opacity: 0.9,
    fog: false,
    depthWrite: false,
  })
  scene.add(new THREE.Points(starGeo, starMat))

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xf4f0d8, fog: false }),
  )
  moon.position.set(-20, 24, -42)
  const moonHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(220,225,255,0.45)'),
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  moonHalo.scale.setScalar(14)
  moonHalo.position.copy(moon.position)
  scene.add(moonHalo, moon)

  // ── 산 능선 (실루엣) ─────────────────────────────────────────
  const MOUNTAINS = 16
  const mountains = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
    MOUNTAINS,
  )
  {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const c = new THREE.Color()
    for (let i = 0; i < MOUNTAINS; i++) {
      const a = (i / MOUNTAINS) * Math.PI * 2 + rand() * 0.2
      const r = 38 + rand() * 6
      const h = 5 + rand() * 5
      const w = 10 + rand() * 8
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI)
      m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r), q, new THREE.Vector3(w, h, w))
      mountains.setMatrixAt(i, m)
      mountains.setColorAt(i, c.setHSL(0.66, 0.35, 0.1 + rand() * 0.06, THREE.SRGBColorSpace))
    }
  }
  scene.add(mountains)

  // ── 땅 / 숲 ─────────────────────────────────────────────────
  scene.add(flatDisc(45, 0x182116, -0.02, 32))
  const floor = flatDisc(WORLD_RADIUS, 0x34452b, 0)
  scene.add(floor)
  scene.add(flatDisc(2.4, 0x4a3a2a, 0.005, 32)) // 불 주변 흙

  scene.add(
    ...forestRing({
      count: 40,
      inner: WORLD_RADIUS + 1.5,
      depth: 8,
      rand,
      trunk: 0x2e2018,
      crown: (r, c) => c.setHSL(0.36 + r() * 0.06, 0.35, 0.1 + r() * 0.08),
      scale: [1, 1.9],
    }),
  )

  // ── 모닥불 ─────────────────────────────────────────────────
  const fire = new THREE.Group()
  scene.add(fire)

  // 돌 테두리
  const STONES = 11
  const stones = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.2, 0),
    new THREE.MeshLambertMaterial({ color: 0x77706a }),
    STONES,
  )
  {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < STONES; i++) {
      const a = (i / STONES) * Math.PI * 2
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3))
      const s = 0.8 + rand() * 0.5
      m.compose(new THREE.Vector3(Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9), q, new THREE.Vector3(s, s * 0.8, s))
      stones.setMatrixAt(i, m)
    }
  }
  fire.add(stones)

  // 장작 (원뿔처럼 기대어 세움)
  const logGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6)
  const logMat = new THREE.MeshLambertMaterial({ color: 0x4a2e1c })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const log = new THREE.Mesh(logGeo, logMat)
    log.position.set(Math.cos(a) * 0.28, 0.38, Math.sin(a) * 0.28)
    log.rotation.set(0, -a, 0)
    log.rotateZ(0.55)
    fire.add(log)
  }

  // 불꽃: 겹친 원뿔 3개 (가산 혼합)
  const flameGeo = new THREE.ConeGeometry(0.32, 1, 8, 1, true)
  flameGeo.translate(0, 0.5, 0) // 바닥을 기준으로 늘어나도록
  const flames = [
    { color: 0xff5a1f, r: 1.0, h: 1.15, speed: 7.3 },
    { color: 0xff9a2e, r: 0.75, h: 0.95, speed: 9.1 },
    { color: 0xffe08a, r: 0.45, h: 0.7, speed: 11.7 },
  ].map((f, i) => {
    const mesh = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({
        color: f.color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    )
    mesh.position.y = 0.15
    mesh.renderOrder = 2 + i
    fire.add(mesh)
    return { mesh, ...f, phase: i * 1.7 }
  })

  // 빛무리
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,150,60,0.55)'),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.position.y = 0.7
  halo.scale.setScalar(3.4)
  fire.add(halo)

  // 따뜻한 불빛 — 장면의 주 조명
  const fireLight = new THREE.PointLight(0xff8a3d, 22, 16, 1.4)
  fireLight.position.y = 1.0
  fire.add(fireLight)

  // 불티 (위로 떠올랐다가 사라지고 다시 아래에서 시작)
  const SPARKS = 46
  const sparkPos = new Float32Array(SPARKS * 3)
  const spark = Array.from({ length: SPARKS }, () => ({
    life: rand(),
    speed: 0.6 + rand() * 0.9,
    drift: (rand() - 0.5) * 0.6,
    a: rand() * Math.PI * 2,
  }))
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: 0xffb35c,
      size: 0.07,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  fire.add(sparks)

  // ── 둘러앉는 통나무 의자, 텐트, 랜턴 ─────────────────────────
  const benchGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.7, 8)
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x5b3b25 })
  for (const a of [0.35, 2.4, 4.4]) {
    const b = new THREE.Mesh(benchGeo, benchMat)
    b.position.set(Math.cos(a) * 2.7, 0.22, Math.sin(a) * 2.7)
    b.rotation.set(0, -a, Math.PI / 2) // 불을 향해 가로로 눕힘
    scene.add(b)
  }

  const tentGroup = new THREE.Group()
  const tent = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 1.9, 4),
    new THREE.MeshLambertMaterial({ color: 0xc9813f, flatShading: true }),
  )
  tent.position.y = 0.95
  tent.rotation.y = Math.PI / 4
  const door = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 3),
    new THREE.MeshBasicMaterial({ color: 0x1c130c }),
  )
  door.position.set(0, 0.36, 1.07)
  door.rotation.z = Math.PI / 2
  tentGroup.add(tent, door)
  tentGroup.position.set(-5.2, 0, -4.2)
  tentGroup.lookAt(0, 0, 0)
  scene.add(tentGroup)

  const tent2 = tentGroup.clone()
  tent2.position.set(5.6, 0, -3.6)
  tent2.lookAt(0, 0, 0)
  ;(tent2.children[0] as THREE.Mesh).material = new THREE.MeshLambertMaterial({ color: 0x4f7a8a, flatShading: true })
  scene.add(tent2)

  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd98a }),
  )
  lantern.position.set(-3.9, 0.15, -3.3)
  const lanternGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture('rgba(255,210,130,0.6)'), depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  lanternGlow.position.copy(lantern.position)
  lanternGlow.scale.setScalar(1.2)
  scene.add(lantern, lanternGlow)

  return {
    floor,
    update(dt, t) {
      // 불꽃 일렁임 (겹친 사인파로 불규칙하게)
      for (const f of flames) {
        const n = Math.sin(t * f.speed + f.phase) * 0.5 + Math.sin(t * f.speed * 1.73 + f.phase * 2) * 0.5
        f.mesh.scale.set(f.r * (1 + n * 0.08), f.h * (1 + n * 0.18), f.r * (1 - n * 0.06))
        f.mesh.rotation.y = t * 0.6 + f.phase
        f.mesh.position.x = Math.sin(t * 3.1 + f.phase) * 0.03
      }
      const flicker = Math.sin(t * 8.3) * 0.5 + Math.sin(t * 13.7) * 0.3 + Math.sin(t * 3.1) * 0.2
      fireLight.intensity = 22 + flicker * 3.5
      halo.material.opacity = 0.85 + flicker * 0.1

      for (let i = 0; i < SPARKS; i++) {
        const s = spark[i]
        s.life += dt * s.speed * 0.45
        if (s.life >= 1) {
          s.life -= 1
          s.a = Math.random() * Math.PI * 2
        }
        const rr = 0.12 + s.life * 0.35
        sparkPos[i * 3] = Math.cos(s.a + s.life * 2) * rr + s.drift * s.life
        sparkPos[i * 3 + 1] = 0.5 + s.life * 3.2
        sparkPos[i * 3 + 2] = Math.sin(s.a + s.life * 2) * rr
      }
      sparkGeo.attributes.position.needsUpdate = true

      starMat.opacity = 0.8 + Math.sin(t * 0.8) * 0.1
      lanternGlow.material.opacity = 0.8 + Math.sin(t * 2.3) * 0.15
    },
  }
}

export const campfire: ThemeDef = {
  id: 'campfire',
  name: '산속 캠핑',
  emoji: '🔥',
  description: '별빛 아래 모닥불 앞에 둘러앉아 불멍',
  preview:
    'radial-gradient(circle at 50% 78%,#ffb35c 0,#ff6a1f 7%,rgba(255,106,31,0) 26%),linear-gradient(180deg,#05081a 0%,#241f47 55%,#1b2418 56%,#34452b 100%)',
  keepOut: 1.25,
  spawn: [2.2, 4.5],
  // 낮은 시점 — 모닥불 너머로 산 능선과 별하늘이 보이게
  cameraOffset: [0, 4.8, 11],
  build,
}

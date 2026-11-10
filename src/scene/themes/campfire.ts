import * as THREE from 'three'
import { WORLD_RADIUS } from '../../config'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { flatDisc, forestRing, glowTexture, seeded, skyTexture, type SpotDef, type ThemeDef, type WorldHandle } from './common'

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

  // ── 앉고 누울 수 있는 자리: 캠핑 의자 6개 + 텐트 2동(각 2자리) ──────────
  const spots: SpotDef[] = []
  const targets: THREE.Object3D[] = []
  const hitMat = new THREE.MeshBasicMaterial({ visible: false }) // 탭 판정용 (보이지 않음)

  // 캠핑 의자: 접이식 프레임 + 천. 지오메트리를 합쳐 의자 하나당 메시 2개만 쓴다.
  const { frame: chairFrame, fabric: chairFabric } = campChairGeometry()
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e })
  const hitBox = new THREE.BoxGeometry(1.05, 1.4, 1.05)
  const CHAIR_COLORS = [0x2f6f5e, 0xc65a3a, 0x3f5f9a, 0xd9a441, 0x7a4f8f, 0x4f8a4a]
  CHAIR_COLORS.forEach((color, i) => {
    const a = Math.PI / 2 + (i / CHAIR_COLORS.length) * Math.PI * 2 + 0.25
    const x = Math.cos(a) * 2.75
    const z = Math.sin(a) * 2.75
    const chair = new THREE.Group()
    chair.add(
      new THREE.Mesh(chairFrame, frameMat),
      new THREE.Mesh(chairFabric, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })),
    )
    const hit = new THREE.Mesh(hitBox, hitMat)
    hit.position.y = 0.7
    hit.userData.spots = [spots.length]
    chair.add(hit)
    chair.position.set(x, 0, z)
    chair.lookAt(0, 0, 0) // 앞(+z)이 모닥불을 향하게
    scene.add(chair)
    targets.push(hit)
    const toFire = new THREE.Vector2(-x, -z).normalize()
    spots.push({
      kind: 'sit',
      x,
      z,
      ax: x + toFire.x * 0.8,
      az: z + toFire.y * 0.8,
      yaw: Math.atan2(-x, -z),
    })
  })

  // 텐트: 앞문이 모닥불을 향하고, 문 앞에 발을 두고 안쪽으로 머리를 두고 눕는다
  const tentGeo = new THREE.ConeGeometry(1.5, 1.9, 4)
  const doorGeo = new THREE.CircleGeometry(0.62, 3)
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x1c130c, transparent: true })
  const tents: { mat: THREE.MeshLambertMaterial; spots: number[] }[] = []
  for (const [tx, tz, color] of [
    [-5.2, -4.2, 0xc9813f],
    [5.6, -3.6, 0x4f7a8a],
  ] as const) {
    const group = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true })
    const tent = new THREE.Mesh(tentGeo, mat)
    tent.position.y = 0.95
    tent.rotation.y = Math.PI / 4
    const door = new THREE.Mesh(doorGeo, doorMat)
    door.position.set(0, 0.42, 1.04)
    door.rotation.z = Math.PI / 2
    group.add(tent, door)
    group.position.set(tx, 0, tz)
    group.lookAt(0, 0, 0)
    group.updateMatrixWorld(true)
    scene.add(group)

    const yaw = Math.atan2(-tx, -tz) // 발→바깥(모닥불 쪽), 머리→텐트 안쪽
    const ids: number[] = []
    for (const side of [-0.36, 0.36]) {
      const feet = group.localToWorld(new THREE.Vector3(side, 0, 1.45))
      const near = group.localToWorld(new THREE.Vector3(side, 0, 2.35))
      ids.push(spots.length)
      spots.push({ kind: 'lie', x: feet.x, z: feet.z, ax: near.x, az: near.z, yaw })
    }
    tent.userData.spots = ids
    door.userData.spots = ids
    targets.push(tent, door)
    tents.push({ mat, spots: ids })
  }

  /** 내가 텐트에 누우면 그 텐트를 반투명하게 해서 안이 보이게 한다 */
  const focusSpot = (index: number) => {
    for (const t of tents) {
      const inside = t.spots.includes(index)
      t.mat.opacity = inside ? 0.32 : 1
      t.mat.depthWrite = !inside
    }
    doorMat.opacity = tents.some((t) => t.spots.includes(index)) ? 0.3 : 1
  }

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
    spots,
    targets,
    focusSpot,
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
  description: '별빛 아래 모닥불에서 마시멜로와 불멍',
  preview:
    'radial-gradient(circle at 50% 78%,#ffb35c 0,#ff6a1f 7%,rgba(255,106,31,0) 26%),linear-gradient(180deg,#05081a 0%,#241f47 55%,#1b2418 56%,#34452b 100%)',
  keepOut: 1.25,
  spawn: [2.2, 4.5],
  // 낮은 시점 — 모닥불 너머로 산 능선과 별하늘이 보이게
  cameraOffset: [0, 4.8, 11],
  hint: '의자에 앉아 마시멜로를 구워보세요',
  sound: { ambience: 'campfire', footstep: 'dirt' },
  build,
}

/**
 * 접이식 캠핑 의자 (앞쪽 = +z). 프레임과 천을 각각 하나의 지오메트리로 합친다.
 * 최종 좌석 높이 약 0.57 — Avatar 의 앉기 자세가 이 높이에 맞춰져 있다.
 */
function campChairGeometry(): { frame: THREE.BufferGeometry; fabric: THREE.BufferGeometry } {
  const piece = (g: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) =>
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
        new THREE.Vector3(1, 1, 1),
      ),
    )
  const tube = (len: number) => new THREE.CylinderGeometry(0.02, 0.02, len, 5)

  const frame: THREE.BufferGeometry[] = []
  for (const sx of [-0.29, 0.29]) {
    // 옆에서 보면 X 자로 교차하는 다리
    frame.push(piece(tube(0.62), [sx, 0.22, 0], [0.62, 0, 0]))
    frame.push(piece(tube(0.62), [sx, 0.22, 0], [-0.62, 0, 0]))
    // 팔걸이
    frame.push(piece(new THREE.BoxGeometry(0.06, 0.035, 0.44), [sx, 0.62, 0.0]))
    frame.push(piece(tube(0.2), [sx, 0.52, 0.18]))
    // 등받이 기둥
    frame.push(piece(tube(0.62), [sx, 0.7, -0.24], [-0.2, 0, 0]))
  }
  const fabric = [
    piece(new THREE.BoxGeometry(0.58, 0.035, 0.46), [0, 0.42, 0], [0.06, 0, 0]), // 좌석 (뒤로 살짝 처짐)
    piece(new THREE.BoxGeometry(0.58, 0.48, 0.03), [0, 0.72, -0.25], [-0.2, 0, 0]), // 등받이
  ]
  // 아바타 몸보다 넉넉하게 키운다 → 좌석 높이 0.42 × 1.35 ≈ 0.57
  const S = 1.35
  return { frame: mergeGeometries(frame)!.scale(S, S, S), fabric: mergeGeometries(fabric)!.scale(S, S, S) }
}

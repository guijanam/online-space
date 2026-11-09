import * as THREE from 'three'

const TAP_MAX_MOVE_PX = 12
const TAP_MAX_MS = 450

/**
 * 화면을 탭하면 땅(y=0 평면) 위의 지점을 알려준다. 드래그·길게 누르기는 무시.
 * 광장 밖(숲·먼 땅)을 눌러도 그 방향으로 걸어가도록 메시가 아니라 평면과 교차시킨다.
 * 하늘을 누른 경우는 수평선 바로 앞 지점으로 본다.
 */
export function attachPicking(
  el: HTMLElement,
  camera: THREE.Camera,
  opts: {
    /** 먼저 검사할 물체들 (의자·텐트). userData.spots 에 자리 번호 */
    targets: THREE.Object3D[]
    onTarget(spots: number[]): void
    onGround(x: number, z: number): void
  },
): () => void {
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()
  let start: { x: number; y: number; t: number; id: number } | null = null

  const down = (e: PointerEvent) => {
    if (!e.isPrimary) return
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
  }
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    const quick = performance.now() - start.t < TAP_MAX_MS
    start = null
    if (moved > TAP_MAX_MOVE_PX || !quick) return
    const r = el.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (opts.targets.length) {
      for (const h of ray.intersectObjects(opts.targets, false)) {
        const spots = h.object.userData.spots as number[] | undefined
        if (spots?.length) return opts.onTarget(spots)
      }
    }
    const onPick = opts.onGround
    const dir = ray.ray.direction
    if (dir.y < -0.02 && ray.ray.intersectPlane(ground, hit)) {
      onPick(hit.x, hit.z)
    } else {
      // 하늘을 눌렀으면 그 방향으로 멀리 (호출하는 쪽에서 광장 경계로 보정)
      onPick(camera.position.x + dir.x * 100, camera.position.z + dir.z * 100)
    }
  }
  const cancel = () => (start = null)

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', cancel)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', cancel)
  }
}

/** 탭한 지점에 퍼지는 물결 표시 */
export class TapMarker {
  readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private t = 1

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    )
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.y = 0.03
  }

  show(x: number, z: number): void {
    this.mesh.position.x = x
    this.mesh.position.z = z
    this.t = 0
  }

  update(dt: number): void {
    if (this.t >= 1) return
    this.t = Math.min(1, this.t + dt * 1.6)
    this.mesh.scale.setScalar(1 + this.t * 1.5)
    this.mesh.material.opacity = (1 - this.t) * 0.8
  }
}

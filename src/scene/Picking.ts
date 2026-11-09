import * as THREE from 'three'

const TAP_MAX_MOVE_PX = 12
const TAP_MAX_MS = 450

/** 바닥을 탭하면 그 지점(월드 좌표)을 알려준다. 드래그·길게 누르기는 무시. */
export function attachPicking(
  el: HTMLElement,
  camera: THREE.Camera,
  floor: THREE.Object3D,
  onPick: (x: number, z: number) => void,
): () => void {
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
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
    const hit = ray.intersectObject(floor, false)[0]
    if (hit) onPick(hit.point.x, hit.point.z)
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

import * as THREE from 'three'

const SKEWER_GEO = new THREE.CylinderGeometry(0.012, 0.018, 1.85, 6)
const MARSHMALLOW_GEO = new THREE.CapsuleGeometry(0.105, 0.11, 4, 10)
const SKEWER_MAT = new THREE.MeshLambertMaterial({ color: 0x8b5a32 })
const CREAM = new THREE.Color(0xfff4dc)
const GOLDEN = new THREE.Color(0xc97b3f)
const TOASTED = new THREE.Color(0x79401f)

/** 아바타가 모닥불 쪽(+z)으로 드는 꼬치와 마시멜로 */
export class MarshmallowRoast {
  readonly root = new THREE.Group()
  private marshmallow: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshLambertMaterial>

  constructor() {
    const skewer = new THREE.Mesh(SKEWER_GEO, SKEWER_MAT)
    skewer.rotation.x = Math.PI / 2
    skewer.position.set(0.36, 0.87, 1.08)
    this.marshmallow = new THREE.Mesh(
      MARSHMALLOW_GEO,
      new THREE.MeshLambertMaterial({ color: CREAM, emissive: 0x2a1408, emissiveIntensity: 0.12 }),
    )
    this.marshmallow.position.set(0.36, 0.9, 2.02)
    this.marshmallow.rotation.z = 0.12
    this.root.add(skewer, this.marshmallow)
    this.root.visible = false
  }

  update(progress: number, t: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1)
    const browned = p * p * (3 - 2 * p)
    this.marshmallow.material.color.copy(CREAM).lerp(GOLDEN, browned)
    if (p > 0.82) {
      this.marshmallow.material.color.lerp(TOASTED, ((p - 0.82) / 0.18) * 0.3)
    }
    this.root.visible = true
    this.root.rotation.x = Math.sin(Math.min(1, p * 5) * Math.PI) * 0.04
    this.root.rotation.y = Math.sin(t * 1.7) * 0.025
    this.marshmallow.rotation.y = t * 0.45
  }

  hide(): void {
    this.root.visible = false
  }

  dispose(): void {
    this.marshmallow.material.dispose()
  }
}

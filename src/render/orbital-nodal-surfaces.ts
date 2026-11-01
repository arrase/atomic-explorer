import * as THREE from 'three';

export type CrossSectionAxis = 'none' | 'x' | 'y' | 'z';

export interface NodalSurfacesOptions {
  frameRadius: number;
  radialNodes: number[];
  polarCosines: number[];
  m: number;
  useRealOrbital: boolean;
  clipPlane: THREE.Plane | null;
}

const CROSS_SECTION_INDEX: Record<CrossSectionAxis, number> = {
  none: 0,
  x: 1,
  y: 2,
  z: 3,
};

const RADIAL_NODE_COLOR = 0xf87171;
const ANGULAR_FILL_COLOR = 0xe2e8f0;
const ANGULAR_RIM_COLOR = 0x94a3b8;
const SURFACE_OPACITY = 0.11;
const RADIAL_RING_OPACITY = 0.42;
const ANGULAR_RIM_OPACITY = 0.5;
const VORTEX_LINE_OPACITY = 0.55;
const ANGULAR_OUTER_SCALE = 1.05;
const CIRCLE_SEGMENTS = 64;

export function crossSectionAxisToIndex(axis: CrossSectionAxis): number {
  return CROSS_SECTION_INDEX[axis];
}

export function createCrossSectionPlane(axis: CrossSectionAxis): THREE.Plane | null {
  if (axis === 'x') return new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  if (axis === 'y') return new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  if (axis === 'z') return new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  return null;
}

export function createRaymarchBoxMax(boxExtent: number, axis: CrossSectionAxis): THREE.Vector3 {
  return new THREE.Vector3(
    axis === 'x' ? 0 : boxExtent,
    axis === 'y' ? 0 : boxExtent,
    axis === 'z' ? 0 : boxExtent,
  );
}

function buildCircleLoopGeometry(radius: number, segments = CIRCLE_SEGMENTS): THREE.BufferGeometry {
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions[i * 3] = radius * Math.cos(angle);
    positions[i * 3 + 1] = radius * Math.sin(angle);
    positions[i * 3 + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function createSurfaceMaterial(
  color: number,
  clippingPlanes: THREE.Plane[] | null = null,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    opacity: SURFACE_OPACITY,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    clippingPlanes,
  });
}

function createLineMaterial(
  color: number,
  opacity: number,
  clippingPlanes: THREE.Plane[] | null = null,
): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    clippingPlanes,
  });
}

function addRadialNodalSpheres(
  group: THREE.Group,
  radialNodes: number[],
  clipPlane: THREE.Plane | null,
): void {
  const planes = clipPlane ? [clipPlane] : null;
  for (const radius of radialNodes) {
    if (radius <= 0) continue;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      createSurfaceMaterial(RADIAL_NODE_COLOR, planes),
    );
    sphere.userData.clipRadial = true;
    group.add(sphere);

    const ringGeometries = [
      buildCircleLoopGeometry(radius),
      buildCircleLoopGeometry(radius).rotateX(Math.PI / 2),
      buildCircleLoopGeometry(radius).rotateY(Math.PI / 2),
    ];

    for (const ringGeom of ringGeometries) {
      const ring = new THREE.LineLoop(
        ringGeom,
        createLineMaterial(RADIAL_NODE_COLOR, RADIAL_RING_OPACITY, planes),
      );
      ring.userData.clipRadial = true;
      group.add(ring);
    }
  }
}

function addPolarAngularNodes(
  group: THREE.Group,
  polarCosines: number[],
  outerRadius: number,
): void {
  for (const c of polarCosines) {
    if (Math.abs(c) < 1e-6) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(outerRadius, CIRCLE_SEGMENTS),
        createSurfaceMaterial(ANGULAR_FILL_COLOR),
      );
      const rim = new THREE.LineLoop(
        buildCircleLoopGeometry(outerRadius),
        createLineMaterial(ANGULAR_RIM_COLOR, ANGULAR_RIM_OPACITY),
      );
      group.add(disc, rim);
    } else {
      const rimRadius = outerRadius * Math.sqrt(Math.max(0, 1 - c * c));
      const rimZ = outerRadius * c;
      const coneGeom = new THREE.LatheGeometry(
        [new THREE.Vector2(0, 0), new THREE.Vector2(rimRadius, rimZ)],
        CIRCLE_SEGMENTS,
      );
      coneGeom.rotateX(Math.PI / 2);

      const rimGeom = buildCircleLoopGeometry(rimRadius);
      rimGeom.translate(0, 0, rimZ);

      const cone = new THREE.Mesh(coneGeom, createSurfaceMaterial(ANGULAR_FILL_COLOR));
      const rim = new THREE.LineLoop(
        rimGeom,
        createLineMaterial(ANGULAR_RIM_COLOR, ANGULAR_RIM_OPACITY),
      );
      group.add(cone, rim);
    }
  }
}

function addAzimuthalNodalPlanes(group: THREE.Group, m: number, outerRadius: number): void {
  const mAbs = Math.abs(m);
  for (let k = 0; k < mAbs; k++) {
    const phi = m > 0 ? ((2 * k + 1) * Math.PI) / (2 * mAbs) : (k * Math.PI) / mAbs;

    const discGeom = new THREE.CircleGeometry(outerRadius, CIRCLE_SEGMENTS);
    discGeom.rotateX(Math.PI / 2);
    discGeom.rotateZ(phi);

    const rimGeom = buildCircleLoopGeometry(outerRadius);
    rimGeom.rotateX(Math.PI / 2);
    rimGeom.rotateZ(phi);

    const disc = new THREE.Mesh(discGeom, createSurfaceMaterial(ANGULAR_FILL_COLOR));
    const rim = new THREE.LineLoop(
      rimGeom,
      createLineMaterial(ANGULAR_RIM_COLOR, ANGULAR_RIM_OPACITY),
    );
    group.add(disc, rim);
  }
}

function addAxialVortexLine(group: THREE.Group, outerRadius: number): void {
  const lineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -outerRadius),
    new THREE.Vector3(0, 0, outerRadius),
  ]);
  const line = new THREE.Line(
    lineGeom,
    createLineMaterial(ANGULAR_RIM_COLOR, VORTEX_LINE_OPACITY),
  );
  group.add(line);
}

export function buildNodalSurfacesGroup(opts: NodalSurfacesOptions): THREE.Group {
  const group = new THREE.Group();
  group.renderOrder = 1;
  const outerRadius = opts.frameRadius * ANGULAR_OUTER_SCALE;

  addRadialNodalSpheres(group, opts.radialNodes, opts.clipPlane);
  addPolarAngularNodes(group, opts.polarCosines, outerRadius);

  if (opts.m !== 0) {
    if (opts.useRealOrbital) {
      addAzimuthalNodalPlanes(group, opts.m, outerRadius);
    } else {
      addAxialVortexLine(group, outerRadius);
    }
  }

  return group;
}

export function applyClippingToNodalGroup(
  group: THREE.Group,
  clipPlane: THREE.Plane | null,
): void {
  const planes = clipPlane ? [clipPlane] : null;
  for (const child of group.children) {
    if (child.userData.clipRadial !== true) continue;
    const material = (child as THREE.Mesh | THREE.LineLoop).material as THREE.Material;
    material.clippingPlanes = planes;
    material.needsUpdate = true;
  }
}

export function disposeNodalSurfacesGroup(group: THREE.Group): void {
  for (const child of group.children) {
    const renderable = child as THREE.Mesh | THREE.Line;
    renderable.geometry.dispose();
    const material = renderable.material;
    if (Array.isArray(material)) {
      for (const mat of material) mat.dispose();
    } else {
      material.dispose();
    }
  }
  group.clear();
}

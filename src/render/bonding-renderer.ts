import * as THREE from 'three';
import { AtomOrbitalSpec } from '../core/lcao';
import { ColorPalette, PALETTE_CONFIG, computeFrameDistance } from './orbital-point-cloud';
import { BaseThreeRenderer, RendererTarget } from './render-utils';

export interface BondingRenderState {
  atomA: AtomOrbitalSpec;
  atomB: AtomOrbitalSpec;
  rBohr: number;
  cA: number;
  cB: number;
  peakRefDensity: number;
  showNodalPlanes: boolean;
  hasTransverseNode: boolean;
  nodalZ: number;
  hasPiPlane: boolean;
  palette: ColorPalette;
  contrast: number;
}

const FRAME_MARGIN = 1.12;
const INITIAL_FRAME_RADIUS = 5.6;
const CLIP_HEADROOM = 1.05;
const RAYMARCH_ABSORPTION = 4.6;
const DENSITY_FLOOR = 5e-4;

const bondingVertexShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vOrigin = cameraPosition;
    vDirection = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const bondingFragmentShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  uniform int u_nA;
  uniform int u_lA;
  uniform int u_mA;
  uniform float u_zEffA;

  uniform int u_nB;
  uniform int u_lB;
  uniform int u_mB;
  uniform float u_zEffB;

  uniform float u_R;
  uniform float u_cA;
  uniform float u_cB;
  uniform float u_peakDensity;
  uniform float u_frameRadius;
  uniform float u_absorption;
  uniform float u_densityFloor;
  uniform float u_contrast;
  uniform int u_palette;

  uniform bool u_showNodalPlanes;
  uniform bool u_hasTransverseNode;
  uniform float u_nodalZ;
  uniform bool u_hasPiPlane;

  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;

  #define PI 3.14159265359

  float evalAtomicPsi(vec3 p, int n, int l, int m, float zeff) {
    float r = length(p);
    float zr = zeff * r;
    float z15 = pow(zeff, 1.5);
    if (n == 1) {
      return (1.0 / sqrt(PI)) * z15 * exp(-zr);
    }
    if (l == 0) {
      return (1.0 / (4.0 * sqrt(2.0 * PI))) * z15 * (2.0 - zr) * exp(-0.5 * zr);
    }
    float axisCoord = p.z;
    if (m == 1) {
      axisCoord = p.x;
    } else if (m == -1) {
      axisCoord = p.y;
    }
    return (1.0 / (4.0 * sqrt(2.0 * PI))) * z15 * zeff * axisCoord * exp(-0.5 * zr);
  }

  float evalMolecularPsi(vec3 pos) {
    vec3 pA = pos - vec3(0.0, 0.0, -0.5 * u_R);
    vec3 pB = pos - vec3(0.0, 0.0,  0.5 * u_R);
    vec3 pBLocal = vec3(pB.x, pB.y, -pB.z);
    return u_cA * evalAtomicPsi(pA, u_nA, u_lA, u_mA, u_zEffA)
         + u_cB * evalAtomicPsi(pBLocal, u_nB, u_lB, u_mB, u_zEffB);
  }

  vec2 rayBoxIntersection(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
    vec3 safeDir = vec3(
      abs(rd.x) < 1e-7 ? (rd.x < 0.0 ? -1e-7 : 1e-7) : rd.x,
      abs(rd.y) < 1e-7 ? (rd.y < 0.0 ? -1e-7 : 1e-7) : rd.y,
      abs(rd.z) < 1e-7 ? (rd.z < 0.0 ? -1e-7 : 1e-7) : rd.z
    );
    vec3 invDir = 1.0 / safeDir;
    vec3 t0 = (boxMin - ro) * invDir;
    vec3 t1 = (boxMax - ro) * invDir;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tNear = max(max(tmin.x, tmin.y), tmin.z);
    float tFar = min(min(tmax.x, tmax.y), tmax.z);
    return vec2(tNear, tFar);
  }

  float intersectSphere(vec3 ro, vec3 rd, vec3 center, float radius) {
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return -1.0;
    float t = -b - sqrt(h);
    return t > 0.0 ? t : -1.0;
  }

  vec3 shadeNucleus(vec3 hitPos, vec3 center, vec3 rayDir) {
    vec3 n = normalize(hitPos - center);
    vec3 v = -rayDir;
    vec3 lightDir = normalize(vec3(-0.55, 0.75, 0.38));
    float diff = max(dot(n, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir + v);
    float spec = pow(max(dot(n, halfVec), 0.0), 36.0);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    vec3 coreWhite = vec3(0.973, 0.980, 0.988);
    vec3 rimBlue = vec3(0.376, 0.647, 0.980);
    vec3 body = mix(rimBlue * 0.45, coreWhite, 0.32 + 0.68 * diff);
    return body + rimBlue * (0.55 * fresnel) + vec3(0.95) * (0.45 * spec);
  }

  vec4 evalTransversePlane(vec3 ro, vec3 rd, float tPlane, float tMin, float tMax) {
    if (!u_showNodalPlanes || !u_hasTransverseNode || tPlane < tMin || tPlane > tMax) {
      return vec4(0.0);
    }
    vec3 hit = ro + rd * tPlane;
    float maxR = 0.74 * u_boxMax.x;
    float r = length(hit.xy);
    if (r > maxR) return vec4(0.0);
    float edgeFade = 1.0 - smoothstep(maxR * 0.90, maxR, r);
    float rim = smoothstep(maxR * 0.84, maxR * 0.93, r) * edgeFade;
    float grazing = 1.0 - 0.35 * abs(rd.z);
    float alpha = (0.14 * grazing * edgeFade) + (0.30 * rim);
    vec3 col = mix(vec3(0.68, 0.82, 1.0), vec3(0.92, 0.96, 1.0), rim);
    return vec4(col, clamp(alpha, 0.0, 0.55));
  }

  vec4 evalPiPlane(vec3 ro, vec3 rd, float tPlane, float tMin, float tMax) {
    if (!u_showNodalPlanes || !u_hasPiPlane || tPlane < tMin || tPlane > tMax) {
      return vec4(0.0);
    }
    vec3 hit = ro + rd * tPlane;
    float maxR = 0.74 * u_boxMax.y;
    float dz = max(abs(hit.z) - 0.5 * u_R, 0.0);
    float r = length(vec2(hit.y, dz));
    if (r > maxR) return vec4(0.0);
    float edgeFade = 1.0 - smoothstep(maxR * 0.90, maxR, r);
    float rim = smoothstep(maxR * 0.84, maxR * 0.93, r) * edgeFade;
    float grazing = 1.0 - 0.35 * abs(rd.x);
    float alpha = (0.13 * grazing * edgeFade) + (0.28 * rim);
    vec3 col = mix(vec3(0.62, 0.88, 0.96), vec3(0.90, 0.98, 1.0), rim);
    return vec4(col, clamp(alpha, 0.0, 0.52));
  }

  vec3 getPaletteColor(float psi, float enhancedDensity, int paletteId) {
    float t = clamp(enhancedDensity * 1.1, 0.0, 1.0);
    if (paletteId == 1) {
      if (psi > 0.0) return mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.2), t);
      return mix(vec3(0.8, 0.0, 0.2), vec3(0.4, 0.0, 0.6), t);
    } else if (paletteId == 2) {
      if (psi > 0.0) return mix(vec3(0.0, 0.8, 0.5), vec3(0.4, 1.0, 0.7), t);
      return mix(vec3(0.8, 0.8, 0.1), vec3(0.2, 0.5, 0.2), t);
    } else if (paletteId == 3) {
      if (psi > 0.0) return mix(vec3(0.6, 0.1, 1.0), vec3(0.1, 0.8, 1.0), t);
      return mix(vec3(1.0, 0.1, 0.5), vec3(1.0, 0.6, 0.1), t);
    }
    if (psi > 0.0) return mix(vec3(0.1, 0.6, 1.0), vec3(0.0, 0.9, 1.0), t);
    return mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.8, 0.2), t);
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 tHit = rayBoxIntersection(vOrigin, rayDir, u_boxMin, u_boxMax);
    if (tHit.x > tHit.y || tHit.y < 0.0) {
      discard;
    }

    float tStart = max(tHit.x, 0.0);
    float dist = tHit.y - tStart;
    float stepSize = dist / 128.0;
    float stepFraction = stepSize / max(u_frameRadius, 0.1);

    vec3 centerA = vec3(0.0, 0.0, -0.5 * u_R);
    vec3 centerB = vec3(0.0, 0.0,  0.5 * u_R);
    float tA = intersectSphere(vOrigin, rayDir, centerA, 0.15);
    float tB = intersectSphere(vOrigin, rayDir, centerB, 0.15);

    float tNucleus = -1.0;
    vec3 nucCenter = centerA;
    if (tA > 0.0 && (tB < 0.0 || tA <= tB)) {
      tNucleus = tA;
      nucCenter = centerA;
    } else if (tB > 0.0) {
      tNucleus = tB;
      nucCenter = centerB;
    }

    float tLimit = tNucleus > 0.0 ? min(tHit.y, tNucleus) : tHit.y;

    float tPlaneZ = abs(rayDir.z) > 1e-6 ? (u_nodalZ - vOrigin.z) / rayDir.z : -1.0;
    float tPlaneX = abs(rayDir.x) > 1e-6 ? -vOrigin.x / rayDir.x : -1.0;
    vec4 colPlaneZ = evalTransversePlane(vOrigin, rayDir, tPlaneZ, tStart, tLimit);
    vec4 colPlaneX = evalPiPlane(vOrigin, rayDir, tPlaneX, tStart, tLimit);

    float tFirstPlane = tPlaneZ;
    vec4 firstPlane = colPlaneZ;
    float tSecondPlane = tPlaneX;
    vec4 secondPlane = colPlaneX;
    if (tPlaneX < tPlaneZ) {
      tFirstPlane = tPlaneX;
      firstPlane = colPlaneX;
      tSecondPlane = tPlaneZ;
      secondPlane = colPlaneZ;
    }
    bool doneFirst = firstPlane.a <= 0.0;
    bool doneSecond = secondPlane.a <= 0.0;

    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = (dither - 0.5) * stepSize * 0.5;
    vec4 accumColor = vec4(0.0);

    for (int i = 0; i < 128; i++) {
      float tCurr = tStart + startOffset + (float(i) + 0.5) * stepSize;
      if (tCurr >= tLimit) break;

      if (!doneFirst && tCurr >= tFirstPlane) {
        accumColor.rgb += (1.0 - accumColor.a) * firstPlane.rgb * firstPlane.a;
        accumColor.a += (1.0 - accumColor.a) * firstPlane.a;
        doneFirst = true;
      }
      if (!doneSecond && tCurr >= tSecondPlane) {
        accumColor.rgb += (1.0 - accumColor.a) * secondPlane.rgb * secondPlane.a;
        accumColor.a += (1.0 - accumColor.a) * secondPlane.a;
        doneSecond = true;
      }

      vec3 pos = vOrigin + rayDir * max(tCurr, tStart);
      float psi = evalMolecularPsi(pos);
      float normDensity = clamp((psi * psi) / max(u_peakDensity, 1e-12), 0.0, 1.0);
      float t = clamp(1.0 - log(max(normDensity, 1e-30)) / log(u_densityFloor), 0.0, 1.0);
      float ramped = t * t * (3.0 - 2.0 * t);
      float enhanced = u_contrast > 0.0
        ? log(1.0 + u_contrast * ramped) / log(1.0 + u_contrast)
        : ramped;

      if (enhanced > 1e-6) {
        vec3 color = getPaletteColor(psi, enhanced, u_palette);
        float alphaSample = 1.0 - exp(-enhanced * stepFraction * u_absorption);
        accumColor.rgb += (1.0 - accumColor.a) * color * alphaSample;
        accumColor.a += (1.0 - accumColor.a) * alphaSample;
        if (accumColor.a >= 0.97) break;
      }
    }

    if (!doneFirst) {
      accumColor.rgb += (1.0 - accumColor.a) * firstPlane.rgb * firstPlane.a;
      accumColor.a += (1.0 - accumColor.a) * firstPlane.a;
    }
    if (!doneSecond) {
      accumColor.rgb += (1.0 - accumColor.a) * secondPlane.rgb * secondPlane.a;
      accumColor.a += (1.0 - accumColor.a) * secondPlane.a;
    }

    if (tNucleus > 0.0) {
      vec3 nucColor = shadeNucleus(vOrigin + rayDir * tNucleus, nucCenter, rayDir);
      accumColor.rgb += (1.0 - accumColor.a) * nucColor;
      accumColor.a = 1.0;
    }

    gl_FragColor = accumColor;
  }
`;

export class BondingRenderer extends BaseThreeRenderer {
  private readonly defaultCameraDir = new THREE.Vector3(-0.74, 0.5, 0.45).normalize();
  private readonly volumeGeometry: THREE.BoxGeometry;
  private readonly volumeMaterial: THREE.ShaderMaterial;
  private readonly volumeMesh: THREE.Mesh;

  private framingRadius = INITIAL_FRAME_RADIUS;
  private clipReach = INITIAL_FRAME_RADIUS * 2.0;
  private hasFramedOnce = false;

  constructor(target: RendererTarget) {
    super(target, new THREE.Vector3(-0.74, 0.5, 0.45).normalize().multiplyScalar(16.0));
    this.autoRotateSpeed = 1.4;

    this.volumeGeometry = new THREE.BoxGeometry(2, 2, 2);
    this.volumeMaterial = new THREE.ShaderMaterial({
      vertexShader: bondingVertexShader,
      fragmentShader: bondingFragmentShader,
      uniforms: {
        u_nA: { value: 1 },
        u_lA: { value: 0 },
        u_mA: { value: 0 },
        u_zEffA: { value: 1.0 },
        u_nB: { value: 1 },
        u_lB: { value: 0 },
        u_mB: { value: 0 },
        u_zEffB: { value: 1.0 },
        u_R: { value: 1.4 },
        u_cA: { value: 0.54 },
        u_cB: { value: 0.54 },
        u_peakDensity: { value: 0.35 },
        u_frameRadius: { value: 6.2 },
        u_absorption: { value: RAYMARCH_ABSORPTION },
        u_densityFloor: { value: DENSITY_FLOOR },
        u_contrast: { value: 0.0 },
        u_palette: { value: 0 },
        u_showNodalPlanes: { value: true },
        u_hasTransverseNode: { value: false },
        u_nodalZ: { value: 0.0 },
        u_hasPiPlane: { value: false },
        u_boxMin: { value: new THREE.Vector3(-6.2, -6.2, -6.9) },
        u_boxMax: { value: new THREE.Vector3(6.2, 6.2, 6.9) },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.volumeMesh = new THREE.Mesh(this.volumeGeometry, this.volumeMaterial);
    this.volumeMesh.frustumCulled = false;
    this.scene.add(this.volumeMesh);

    this.applyFraming(INITIAL_FRAME_RADIUS, false);
    this.resetCameraInstant();
    this.stop();
  }

  protected override updateClipping(): void {
    const reach = Math.max(this.clipReach, Number.EPSILON);
    const distance = this.camera.position.distanceTo(this.controls.target);
    const near = Math.max(distance - reach, reach * 1e-4);
    const far = distance + reach;
    if (near === this.camera.near && far === this.camera.far) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  protected override onViewportChanged(): void {
    this.applyFraming(this.framingRadius, false);
  }

  private applyFraming(radius: number, reframeCamera: boolean): void {
    this.framingRadius = radius;
    const distance = computeFrameDistance(radius, this.camera.fov, this.camera.aspect, FRAME_MARGIN);
    this.defaultCameraPos.copy(this.defaultTarget).addScaledVector(this.defaultCameraDir, distance);
    this.updateClipping();

    if (!reframeCamera) return;
    if (!this.hasFramedOnce || !this.isAnimating) {
      this.hasFramedOnce = true;
      this.resetCameraInstant();
      return;
    }
    this.animateCameraTo(this.defaultCameraPos.clone(), new THREE.Vector3(0, 1, 0), this.defaultTarget.clone(), 380);
  }

  public updateState(state: BondingRenderState, reframeCamera: boolean): void {
    const extentA = (3.2 * state.atomA.n * state.atomA.n + 3.0) / state.atomA.zEff;
    const extentB = (3.2 * state.atomB.n * state.atomB.n + 3.0) / state.atomB.zEff;
    const atomicExtent = Math.max(extentA, extentB);
    const halfXY = atomicExtent;
    const halfZ = 0.5 * state.rBohr + atomicExtent;

    this.volumeMesh.scale.set(halfXY, halfXY, halfZ);
    this.clipReach = Math.hypot(halfXY, halfXY, halfZ) * CLIP_HEADROOM;

    const u = this.volumeMaterial.uniforms;
    u.u_nA.value = state.atomA.n;
    u.u_lA.value = state.atomA.l;
    u.u_mA.value = state.atomA.m;
    u.u_zEffA.value = state.atomA.zEff;
    u.u_nB.value = state.atomB.n;
    u.u_lB.value = state.atomB.l;
    u.u_mB.value = state.atomB.m;
    u.u_zEffB.value = state.atomB.zEff;
    u.u_R.value = state.rBohr;
    u.u_cA.value = state.cA;
    u.u_cB.value = state.cB;
    u.u_peakDensity.value = state.peakRefDensity;
    u.u_frameRadius.value = atomicExtent;
    u.u_contrast.value = state.contrast;
    u.u_palette.value = PALETTE_CONFIG[state.palette].id;
    u.u_showNodalPlanes.value = state.showNodalPlanes;
    u.u_hasTransverseNode.value = state.hasTransverseNode;
    u.u_nodalZ.value = state.nodalZ;
    u.u_hasPiPlane.value = state.hasPiPlane;
    (u.u_boxMin.value as THREE.Vector3).set(-halfXY, -halfXY, -halfZ);
    (u.u_boxMax.value as THREE.Vector3).set(halfXY, halfXY, halfZ);

    const framingRadius = Math.max(INITIAL_FRAME_RADIUS, atomicExtent * 1.15);
    this.applyFraming(framingRadius, reframeCamera);
  }

  protected override cleanupScene(): void {
    this.scene.remove(this.volumeMesh);
    this.volumeGeometry.dispose();
    this.volumeMaterial.dispose();
  }
}

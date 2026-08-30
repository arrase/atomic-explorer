import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { captureWebGLSnapshot, SnapshotOptions } from './render-utils';
import { OrientationGizmo } from './orientation-gizmo';

export type RenderMode = 'points' | 'isosurface' | 'raymarching';
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'extreme' | 'custom';
export type ColorPalette = 'default' | 'fire' | 'emerald' | 'spectrum';

export interface OrbitalRenderParams {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
  mode: RenderMode;
  isolevel?: number;
  quality?: QualityPreset;
  raymarchingSteps?: number;
  pointCount?: number;
  resolutionScale?: number;
  colorPalette?: ColorPalette;
  contrast?: number;
}

export const PALETTE_CONFIG: Record<ColorPalette, { id: number; posColor: number; negColor: number }> = {
  default: { id: 0, posColor: 0x00ccff, negColor: 0xff6611 },
  fire: { id: 1, posColor: 0xffcc33, negColor: 0x6600cc },
  emerald: { id: 2, posColor: 0x66ffb2, negColor: 0xcc9900 },
  spectrum: { id: 3, posColor: 0x22ccff, negColor: 0xff2255 },
};

// Shader for Point Cloud rendering with Wavefunction Phase Sign (+/-)
const pointVertexShader = `
  attribute float a_sign;
  varying float vDistance;
  varying float vSign;
  uniform float u_pointSizeScale;
  uniform float u_spatialScale;

  void main() {
    vSign = a_sign;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vDistance = length(position);
    float dynamicSize = u_pointSizeScale * clamp(u_spatialScale * 0.35, 1.0, 4.0) * (10.0 / -mvPosition.z);
    gl_PointSize = clamp(dynamicSize, 2.0, 96.0);
  }
`;

const pointFragmentShader = `
  varying float vDistance;
  varying float vSign;
  uniform int u_palette;

  vec3 getPointPaletteColor(float dist, float signVal, int paletteId) {
    float t = clamp(dist / 15.0, 0.0, 1.0);
    if (paletteId == 1) { // Fire
      if (signVal > 0.0) return mix(vec3(1.0, 0.7, 0.1), vec3(1.0, 0.9, 0.3), t);
      return mix(vec3(0.9, 0.1, 0.1), vec3(0.5, 0.0, 0.5), t);
    } else if (paletteId == 2) { // Emerald
      if (signVal > 0.0) return mix(vec3(0.2, 1.0, 0.6), vec3(0.5, 1.0, 0.8), t);
      return mix(vec3(0.9, 0.6, 0.1), vec3(0.8, 0.3, 0.0), t);
    } else if (paletteId == 3) { // Spectrum
      if (signVal > 0.0) return mix(vec3(0.8, 0.2, 1.0), vec3(0.4, 0.6, 1.0), t);
      return mix(vec3(1.0, 0.2, 0.4), vec3(1.0, 0.6, 0.1), t);
    }
    // Default Cyan (+ phase) & Orange/Red (- phase)
    if (signVal > 0.0) return mix(vec3(0.2, 0.85, 1.0), vec3(0.0, 0.95, 1.0), t);
    return mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.7, 0.2), t);
  }

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    float alpha = pow(1.0 - (dist * 2.0), 1.2);
    vec3 finalColor = getPointPaletteColor(vDistance, vSign, u_palette);
    gl_FragColor = vec4(finalColor, alpha * 0.92);
  }
`;

// Shaders for GLSL Volumetric Raymarching with Dynamic Steps & Dithering
const raymarchVertexShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vOrigin = cameraPosition;
    vDirection = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const raymarchFragmentShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;
  varying vec3 vLocalPos;

  uniform int u_n;
  uniform int u_l;
  uniform int u_m;
  uniform bool u_useReal;
  uniform float u_zEff;
  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;
  uniform int u_steps;
  uniform int u_palette;
  uniform float u_peakDensity;
  uniform float u_contrast;

  #define PI 3.14159265359

  // Factorial for small n (sufficient for quantum numbers up to n=7)
  float factorialF(int n) {
    float f = 1.0;
    for (int i = 2; i <= 20; i++) {
      if (i > n) break;
      f *= float(i);
    }
    return f;
  }

  // Associated Laguerre polynomial L_p^q(x) via recurrence relation
  float assocLaguerre(int p, int q, float x) {
    if (p == 0) return 1.0;
    float qf = float(q);
    float l0 = 1.0;
    float l1 = (qf + 1.0) - x;
    if (p == 1) return l1;
    float lp = l1;
    for (int k = 1; k < 20; k++) {
      if (k >= p) break;
      float kf = float(k);
      float next = ((2.0 * kf + 1.0 + qf - x) * l1 - (kf + qf) * l0) / (kf + 1.0);
      l0 = l1;
      l1 = next;
      lp = next;
    }
    return lp;
  }

  // Radial hydrogen wavefunction R_nl(r) — analytic for n<=4, generic Laguerre for n>4
  float evalR(int n, int l, float zeff, float r) {
    float zr = zeff * r;
    if (n == 1 && l == 0) {
      return 2.0 * pow(zeff, 1.5) * exp(-zr);
    } else if (n == 2 && l == 0) {
      return (1.0 / (2.0 * sqrt(2.0))) * pow(zeff, 1.5) * (2.0 - zr) * exp(-zr / 2.0);
    } else if (n == 2 && l == 1) {
      return (1.0 / (2.0 * sqrt(6.0))) * pow(zeff, 1.5) * zr * exp(-zr / 2.0);
    } else if (n == 3 && l == 0) {
      return (2.0 / (81.0 * sqrt(3.0))) * pow(zeff, 1.5) * (27.0 - 18.0*zr + 2.0*zr*zr) * exp(-zr / 3.0);
    } else if (n == 3 && l == 1) {
      return (4.0 / (81.0 * sqrt(6.0))) * pow(zeff, 1.5) * (6.0*zr - zr*zr) * exp(-zr / 3.0);
    } else if (n == 3 && l == 2) {
      return (4.0 / (81.0 * sqrt(30.0))) * pow(zeff, 1.5) * (zr*zr) * exp(-zr / 3.0);
    } else if (n == 4 && l == 0) {
      return (1.0 / 768.0) * pow(zeff, 1.5) * (192.0 - 144.0*zr + 24.0*zr*zr - zr*zr*zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 1) {
      return (1.0 / (256.0 * sqrt(15.0))) * pow(zeff, 1.5) * (80.0*zr - 20.0*zr*zr + zr*zr*zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 2) {
      return (1.0 / (768.0 * sqrt(5.0))) * pow(zeff, 1.5) * (12.0*zr*zr - zr*zr*zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 3) {
      return (1.0 / (768.0 * sqrt(35.0))) * pow(zeff, 1.5) * (zr*zr*zr) * exp(-zr / 4.0);
    }
    // Generic formula using associated Laguerre polynomials for n > 4
    float nf = float(n);
    float rho = 2.0 * zr / nf;
    int p = n - l - 1;
    int q = 2 * l + 1;
    float lag = assocLaguerre(p, q, rho);
    float num = pow(2.0 * zeff / nf, 3.0) * factorialF(n - l - 1);
    float den = 2.0 * nf * factorialF(n + l);
    float prefactor = sqrt(num / den);
    return prefactor * exp(-zr / nf) * pow(rho, float(l)) * lag;
  }

  float evalY(int l, int m, bool useReal, float theta, float phi) {
    float ct = cos(theta);
    float st = sin(theta);
    float cp = useReal ? cos(phi) : 1.0;
    float sp = useReal ? sin(phi) : 1.0;

    float y = 0.5 * sqrt(1.0 / PI);

    if (l == 0) {
      y = 0.5 * sqrt(1.0 / PI);
    } else if (l == 1) {
      if (m == 0) y = 0.5 * sqrt(3.0 / PI) * ct;
      else if (m == 1) y = 0.5 * sqrt(3.0 / PI) * st * cp;
      else if (m == -1) y = 0.5 * sqrt(3.0 / PI) * st * sp;
    } else if (l == 2) {
      if (m == 0) y = 0.25 * sqrt(5.0 / PI) * (3.0 * ct * ct - 1.0);
      else if (m == 1) y = 0.5 * sqrt(15.0 / PI) * st * ct * cp;
      else if (m == -1) y = 0.5 * sqrt(15.0 / PI) * st * ct * sp;
      else if (m == 2) y = 0.25 * sqrt(15.0 / PI) * st * st * (useReal ? cos(2.0 * phi) : 1.0);
      else if (m == -2) y = 0.25 * sqrt(15.0 / PI) * st * st * (useReal ? sin(2.0 * phi) : 1.0);
    } else if (l == 3) {
      if (m == 0) y = 0.25 * sqrt(7.0 / PI) * (5.0 * ct * ct * ct - 3.0 * ct);
      else if (abs(m) == 1) y = 0.125 * sqrt(42.0 / PI) * st * (5.0 * ct * ct - 1.0) * (m > 0 ? cp : sp);
      else if (abs(m) == 2) y = 0.25 * sqrt(105.0 / PI) * st * st * ct * (useReal ? (m > 0 ? cos(2.0*phi) : sin(2.0*phi)) : 1.0);
      else if (abs(m) == 3) y = 0.125 * sqrt(70.0 / PI) * st * st * st * (useReal ? (m > 0 ? cos(3.0*phi) : sin(3.0*phi)) : 1.0);
    }
    
    if (!useReal && m != 0) {
      y *= 0.70710678;
    }
    return y;
  }

  float evalPsi(vec3 p) {
    float r = length(p);
    if (r < 1e-4) return 0.0;
    float theta = acos(clamp(p.z / r, -1.0, 1.0));
    float phi = atan(p.y, p.x);
    float R = evalR(u_n, u_l, u_zEff, r);
    float Y = evalY(u_l, u_m, u_useReal, theta, phi);
    return R * Y;
  }

  vec2 rayBoxIntersection(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
    vec3 invDir = 1.0 / rd;
    vec3 t0 = (boxMin - ro) * invDir;
    vec3 t1 = (boxMax - ro) * invDir;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tNear = max(max(tmin.x, tmin.y), tmin.z);
    float tFar = min(min(tmax.x, tmax.y), tmax.z);
    return vec2(tNear, tFar);
  }

  vec3 getPaletteColor(float psi, float enhancedDensity, int paletteId) {
    float t = clamp(enhancedDensity * 1.1, 0.0, 1.0);
    if (paletteId == 1) { // Atomic Fire
      if (psi > 0.0) return mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.2), t);
      return mix(vec3(0.8, 0.0, 0.2), vec3(0.4, 0.0, 0.6), t);
    } else if (paletteId == 2) { // Emerald Glow
      if (psi > 0.0) return mix(vec3(0.0, 0.8, 0.5), vec3(0.4, 1.0, 0.7), t);
      return mix(vec3(0.8, 0.8, 0.1), vec3(0.2, 0.5, 0.2), t);
    } else if (paletteId == 3) { // Quantum Spectrum
      if (psi > 0.0) return mix(vec3(0.6, 0.1, 1.0), vec3(0.1, 0.8, 1.0), t);
      return mix(vec3(1.0, 0.1, 0.5), vec3(1.0, 0.6, 0.1), t);
    }
    // Default Cyan & Orange/Red
    if (psi > 0.0) return mix(vec3(0.1, 0.6, 1.0), vec3(0.0, 0.9, 1.0), t);
    return mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.8, 0.2), t);
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 tHit = rayBoxIntersection(vOrigin, rayDir, u_boxMin, u_boxMax);

    if (tHit.x > tHit.y || tHit.y < 0.0) {
      discard;
    }

    tHit.x = max(tHit.x, 0.0);
    vec3 entryPoint = vOrigin + rayDir * tHit.x;
    float dist = tHit.y - tHit.x;

    int maxSteps = clamp(u_steps, 32, 512);
    float stepSize = dist / float(maxSteps);
    vec4 accumColor = vec4(0.0);

    // Stochastic dithering to prevent slice banding
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = dither * stepSize;

    for (int i = 0; i < 512; i++) {
      if (i >= maxSteps) break;
      vec3 currentPos = entryPoint + rayDir * (startOffset + float(i) * stepSize);
      float psi = evalPsi(currentPos);
      float rawDensity = psi * psi;

      float normDensity = clamp(rawDensity / max(u_peakDensity, 1e-12), 0.0, 1.0);

      // Non-linear contrast enhancement for diffuse tails (preserves 0 nodes exactly)
      float enhancedDensity = log(1.0 + u_contrast * normDensity) / log(1.0 + u_contrast);

      if (enhancedDensity > 1e-6) {
        vec3 color = getPaletteColor(psi, enhancedDensity, u_palette);
        
        float alphaSample = 1.0 - exp(-enhancedDensity * stepSize * 3.5);

        accumColor.rgb += (1.0 - accumColor.a) * color * alphaSample;
        accumColor.a += (1.0 - accumColor.a) * alphaSample;

        if (accumColor.a >= 0.96) break;
      }
    }

    gl_FragColor = accumColor;
  }
`;

export class OrbitalRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private animationId: number = 0;
  private cameraTransitionId: number = 0;
  private autoRotate: boolean = false;
  private gizmo: OrientationGizmo | null = null;
  private defaultCameraPos = new THREE.Vector3(16, 16, 16);

  private pointsMesh: THREE.Points | null = null;
  private marchingCubesGroup: THREE.Group | null = null;
  private raymarchingMesh: THREE.Mesh | null = null;
  private raymarchingMaterial: THREE.ShaderMaterial | null = null;

  private currentMode: RenderMode = 'raymarching';
  private currentParams: OrbitalRenderParams = {
    n: 1,
    l: 0,
    m: 0,
    useRealOrbital: true,
    zEff: 1.0,
    mode: 'raymarching',
    quality: 'medium',
    raymarchingSteps: 128,
    colorPalette: 'default',
    resolutionScale: 1.0,
    contrast: 25.0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(new THREE.Color('#0a0a1a'));

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(16, 16, 16);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.setupLighting();

    window.addEventListener('resize', this.onWindowResize);
    this.onWindowResize();
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x40c0ff, 1.2);
    dirLight1.position.set(20, 30, 20);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff8844, 0.8);
    dirLight2.position.set(-20, -20, -20);
    this.scene.add(dirLight2);
  }

  public calculatePeakDensity(n: number, l: number, m: number, zEff: number, useReal: boolean): number {
    const rMax = (4.0 * (n * n)) / Math.max(zEff, 0.5);
    let maxRSq = 0;
    const rSteps = 200;
    for (let i = 1; i <= rSteps; i++) {
      const r = (i / rSteps) * rMax;
      const R = this.evalRadial(n, l, zEff, r);
      const RSq = R * R;
      if (RSq > maxRSq) maxRSq = RSq;
    }

    let maxYPx = 0;
    const thetaSteps = 50;
    const phiSteps = 50;
    for (let j = 0; j <= thetaSteps; j++) {
      const theta = (j / thetaSteps) * Math.PI;
      for (let k = 0; k <= phiSteps; k++) {
        const phi = (k / phiSteps) * 2.0 * Math.PI;
        const Y = this.evalAngular(l, m, useReal, theta, phi);
        const YSq = Y * Y;
        if (YSq > maxYPx) maxYPx = YSq;
      }
    }

    return Math.max(maxRSq * maxYPx, 1e-12);
  }

  public setPointCloud(buffer: Float32Array): void {
    this.clearCurrentMesh();
    this.currentMode = 'points';

    const count = Math.floor(buffer.length / 4);
    if (count === 0) return;

    const positions = new Float32Array(count * 3);
    const signs = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = buffer[i * 4];
      positions[i * 3 + 1] = buffer[i * 4 + 1];
      positions[i * 3 + 2] = buffer[i * 4 + 2];
      signs[i] = buffer[i * 4 + 3];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('a_sign', new THREE.BufferAttribute(signs, 1));

    const palette = PALETTE_CONFIG[this.currentParams.colorPalette || 'default'];
    const spatialScale = Math.sqrt((this.currentParams.n * this.currentParams.n) / this.currentParams.zEff);

    const material = new THREE.ShaderMaterial({
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      uniforms: {
        u_pointSizeScale: { value: 18.0 },
        u_spatialScale: { value: spatialScale },
        u_palette: { value: palette.id },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.pointsMesh = new THREE.Points(geometry, material);
    this.scene.add(this.pointsMesh);
  }

  public updateIsosurface(params: OrbitalRenderParams): void {
    this.clearCurrentMesh();
    this.currentMode = 'isosurface';
    this.currentParams = { ...params };

    const gridRes =
      params.quality === 'low'
        ? 32
        : params.quality === 'medium'
        ? 48
        : params.quality === 'high'
        ? 64
        : params.quality === 'ultra'
        ? 96
        : params.quality === 'extreme'
        ? 128
        : 64;

    const palette = PALETTE_CONFIG[params.colorPalette || 'default'];
    const baseColorPos = palette.posColor;
    const baseColorNeg = palette.negColor;

    const materialPos = new THREE.MeshPhysicalMaterial({
      color: baseColorPos,
      roughness: 0.15,
      metalness: 0.2,
      transmission: 0.65,
      opacity: 0.85,
      transparent: true,
      side: THREE.DoubleSide,
    });
    
    const materialNeg = new THREE.MeshPhysicalMaterial({
      color: baseColorNeg,
      roughness: 0.15,
      metalness: 0.2,
      transmission: 0.65,
      opacity: 0.85,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mcPos = new MarchingCubes(gridRes, materialPos, false, false, 200000);
    const mcNeg = new MarchingCubes(gridRes, materialNeg, false, false, 200000);
    const boxExtent = (4.0 * (params.n * params.n)) / Math.max(params.zEff, 0.5);
    mcPos.scale.set(boxExtent, boxExtent, boxExtent);
    mcNeg.scale.set(boxExtent, boxExtent, boxExtent);

    // Compute grid values
    this.fillMarchingCubesGrids(mcPos, mcNeg, gridRes, params);
    mcPos.update();
    mcNeg.update();

    this.marchingCubesGroup = new THREE.Group();
    this.marchingCubesGroup.add(mcPos);
    this.marchingCubesGroup.add(mcNeg);
    this.scene.add(this.marchingCubesGroup);
  }

  private fillMarchingCubesGrids(mcPos: MarchingCubes, mcNeg: MarchingCubes, resolution: number, params: OrbitalRenderParams): void {
    const { n, l, m, useRealOrbital, zEff } = params;
    
    const isolevel = params.isolevel ?? 0.05;
    const contrast = params.contrast ?? 25.0;
    const peakDensity = this.calculatePeakDensity(n, l, m, zEff, useRealOrbital);

    mcPos.reset();
    mcPos.isolation = isolevel;
    
    mcNeg.reset();
    mcNeg.isolation = isolevel;

    const rMax = (4.0 * (n * n)) / Math.max(zEff, 0.5);

    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        for (let z = 0; z < resolution; z++) {
          const px = (x / (resolution - 1) - 0.5) * 2.0 * rMax;
          const py = (y / (resolution - 1) - 0.5) * 2.0 * rMax;
          const pz = (z / (resolution - 1) - 0.5) * 2.0 * rMax;

          const r = Math.hypot(px, py, pz);
          let signedDensity = 0;
          if (r > 1e-4) {
            const theta = Math.acos(Math.max(-1, Math.min(1, pz / r)));
            const phi = Math.atan2(py, px);

            const R = this.evalRadial(n, l, zEff, r);
            const Y = this.evalAngular(l, m, useRealOrbital, theta, phi);
            const psi = R * Y;
            const rawDensity = psi * psi;
            
            const normDensity = Math.min(1.0, rawDensity / Math.max(peakDensity, 1e-12));
            const enhancedDensity = Math.log(1.0 + contrast * normDensity) / Math.log(1.0 + contrast);
            signedDensity = psi >= 0 ? enhancedDensity : -enhancedDensity;
          }

          mcPos.setCell(x, y, z, signedDensity);
          mcNeg.setCell(x, y, z, -signedDensity);
        }
      }
    }
  }

  public updateRaymarching(params: OrbitalRenderParams): void {
    this.clearCurrentMesh();
    this.currentMode = 'raymarching';
    this.currentParams = { ...params };

    const boxExtent = (4.0 * (params.n * params.n)) / params.zEff;
    const geometry = new THREE.BoxGeometry(boxExtent * 2, boxExtent * 2, boxExtent * 2);

    const steps = params.raymarchingSteps ?? (
      params.quality === 'low' ? 64 :
      params.quality === 'medium' ? 96 :
      params.quality === 'high' ? 128 :
      params.quality === 'ultra' ? 256 :
      params.quality === 'extreme' ? 512 : 128
    );

    const palette = PALETTE_CONFIG[params.colorPalette || 'default'];
    const peakDensity = this.calculatePeakDensity(params.n, params.l, params.m, params.zEff, params.useRealOrbital);
    const contrast = params.contrast ?? 25.0;

    this.raymarchingMaterial = new THREE.ShaderMaterial({
      vertexShader: raymarchVertexShader,
      fragmentShader: raymarchFragmentShader,
      uniforms: {
        u_n: { value: params.n },
        u_l: { value: params.l },
        u_m: { value: params.m },
        u_useReal: { value: params.useRealOrbital },
        u_zEff: { value: params.zEff },
        u_boxMin: { value: new THREE.Vector3(-boxExtent, -boxExtent, -boxExtent) },
        u_boxMax: { value: new THREE.Vector3(boxExtent, boxExtent, boxExtent) },
        u_steps: { value: steps },
        u_palette: { value: palette.id },
        u_peakDensity: { value: peakDensity },
        u_contrast: { value: contrast },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.raymarchingMesh = new THREE.Mesh(geometry, this.raymarchingMaterial);
    this.scene.add(this.raymarchingMesh);
  }

  private factorial(n: number): number {
    let f = 1.0;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  }

  private associatedLaguerre(p: number, q: number, x: number): number {
    if (p === 0) return 1.0;
    const qf = q;
    let l0 = 1.0;
    let l1 = (qf + 1.0) - x;
    if (p === 1) return l1;
    let lp = l1;
    for (let k = 1; k < p; k++) {
      const next = ((2.0 * k + 1.0 + qf - x) * l1 - (k + qf) * l0) / (k + 1.0);
      l0 = l1;
      l1 = next;
      lp = next;
    }
    return lp;
  }

  private evalRadial(n: number, l: number, zeff: number, r: number): number {
    const zr = zeff * r;
    if (n === 1 && l === 0) return 2.0 * Math.pow(zeff, 1.5) * Math.exp(-zr);
    if (n === 2 && l === 0) return (1.0 / (2.0 * Math.SQRT2)) * Math.pow(zeff, 1.5) * (2.0 - zr) * Math.exp(-zr / 2.0);
    if (n === 2 && l === 1) return (1.0 / (2.0 * Math.sqrt(6))) * Math.pow(zeff, 1.5) * zr * Math.exp(-zr / 2.0);
    if (n === 3 && l === 0) return (2.0 / (81.0 * Math.sqrt(3))) * Math.pow(zeff, 1.5) * (27.0 - 18.0 * zr + 2.0 * zr * zr) * Math.exp(-zr / 3.0);
    if (n === 3 && l === 1) return (4.0 / (81.0 * Math.sqrt(6))) * Math.pow(zeff, 1.5) * (6.0 * zr - zr * zr) * Math.exp(-zr / 3.0);
    if (n === 3 && l === 2) return (4.0 / (81.0 * Math.sqrt(30))) * Math.pow(zeff, 1.5) * (zr * zr) * Math.exp(-zr / 3.0);
    if (n === 4 && l === 0) return (1.0 / 768.0) * Math.pow(zeff, 1.5) * (192.0 - 144.0 * zr + 24.0 * zr * zr - zr * zr * zr) * Math.exp(-zr / 4.0);
    if (n === 4 && l === 1) return (1.0 / (256.0 * Math.sqrt(15))) * Math.pow(zeff, 1.5) * (80.0 * zr - 20.0 * zr * zr + zr * zr * zr) * Math.exp(-zr / 4.0);
    if (n === 4 && l === 2) return (1.0 / (768.0 * Math.sqrt(5))) * Math.pow(zeff, 1.5) * (12.0 * zr * zr - zr * zr * zr) * Math.exp(-zr / 4.0);
    if (n === 4 && l === 3) return (1.0 / (768.0 * Math.sqrt(35))) * Math.pow(zeff, 1.5) * (zr * zr * zr) * Math.exp(-zr / 4.0);
    // Generic formula using associated Laguerre polynomials for n > 4
    const rho = 2.0 * zr / n;
    const p = n - l - 1;
    const q = 2 * l + 1;
    const lag = this.associatedLaguerre(p, q, rho);
    const num = Math.pow(2.0 * zeff / n, 3) * this.factorial(n - l - 1);
    const den = 2.0 * n * this.factorial(n + l);
    const prefactor = Math.sqrt(num / den);
    return prefactor * Math.exp(-zr / n) * Math.pow(rho, l) * lag;
  }

  private evalAngular(l: number, m: number, useReal: boolean, theta: number, phi: number): number {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = useReal ? Math.cos(phi) : 1.0;
    const sp = useReal ? Math.sin(phi) : 1.0;

    let y = 0.5 * Math.sqrt(1.0 / Math.PI);

    if (l === 0) y = 0.5 * Math.sqrt(1.0 / Math.PI);
    else if (l === 1) {
      if (m === 0) y = 0.5 * Math.sqrt(3.0 / Math.PI) * ct;
      else if (m === 1) y = 0.5 * Math.sqrt(3.0 / Math.PI) * st * cp;
      else if (m === -1) y = 0.5 * Math.sqrt(3.0 / Math.PI) * st * sp;
    }
    else if (l === 2) {
      if (m === 0) y = 0.25 * Math.sqrt(5.0 / Math.PI) * (3.0 * ct * ct - 1.0);
      else if (m === 1) y = 0.5 * Math.sqrt(15.0 / Math.PI) * st * ct * cp;
      else if (m === -1) y = 0.5 * Math.sqrt(15.0 / Math.PI) * st * ct * sp;
      else if (m === 2) y = 0.25 * Math.sqrt(15.0 / Math.PI) * st * st * (useReal ? Math.cos(2 * phi) : 1.0);
      else if (m === -2) y = 0.25 * Math.sqrt(15.0 / Math.PI) * st * st * (useReal ? Math.sin(2 * phi) : 1.0);
    }
    else if (l === 3) {
      if (m === 0) y = 0.25 * Math.sqrt(7.0 / Math.PI) * (5.0 * ct * ct * ct - 3.0 * ct);
      else if (m === 1) y = 0.25 * Math.sqrt(10.5 / Math.PI) * st * (5.0 * ct * ct - 1.0) * cp;
      else if (m === -1) y = 0.25 * Math.sqrt(10.5 / Math.PI) * st * (5.0 * ct * ct - 1.0) * sp;
      else if (m === 2) y = 0.25 * Math.sqrt(105.0 / Math.PI) * st * st * ct * (useReal ? Math.cos(2 * phi) : 1.0);
      else if (m === -2) y = 0.25 * Math.sqrt(105.0 / Math.PI) * st * st * ct * (useReal ? Math.sin(2 * phi) : 1.0);
      else if (m === 3) y = 0.25 * Math.sqrt(17.5 / Math.PI) * st * st * st * (useReal ? Math.cos(3 * phi) : 1.0);
      else if (m === -3) y = 0.25 * Math.sqrt(17.5 / Math.PI) * st * st * st * (useReal ? Math.sin(3 * phi) : 1.0);
    }
    
    if (!useReal && m !== 0) {
      y *= Math.SQRT1_2;
    }
    return y;
  }

  private clearCurrentMesh(): void {
    if (this.pointsMesh) {
      this.scene.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      (this.pointsMesh.material as THREE.Material).dispose();
      this.pointsMesh = null;
    }
    if (this.marchingCubesGroup) {
      this.scene.remove(this.marchingCubesGroup);
      this.marchingCubesGroup.children.forEach(child => {
        const mc = child as MarchingCubes;
        mc.geometry.dispose();
        (mc.material as THREE.Material).dispose();
      });
      this.marchingCubesGroup = null;
    }
    if (this.raymarchingMesh) {
      this.scene.remove(this.raymarchingMesh);
      this.raymarchingMesh.geometry.dispose();
      if (this.raymarchingMaterial) {
        this.raymarchingMaterial.dispose();
        this.raymarchingMaterial = null;
      }
      this.raymarchingMesh = null;
    }
  }

  public setMode(mode: RenderMode, params?: OrbitalRenderParams): void {
    const mergedParams = params ?? this.currentParams;
    mergedParams.mode = mode;
    this.currentMode = mode;
    this.currentParams = mergedParams;

    this.clearCurrentMesh();

    if (mode === 'isosurface') {
      this.updateIsosurface(mergedParams);
    } else if (mode === 'raymarching') {
      this.updateRaymarching(mergedParams);
    }
  }

  public updateParams(params: Partial<OrbitalRenderParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    if (params.mode) {
      this.setMode(params.mode, this.currentParams);
    }
  }

  public getCurrentMode(): RenderMode {
    return this.currentMode;
  }

  private onWindowResize = (): void => {
    const resScale = this.currentParams.resolutionScale ?? 1.0;
    const pixelRatio = Math.min(window.devicePixelRatio * resScale, 2.0);

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

  };

  public async captureSnapshot(options: SnapshotOptions): Promise<string> {
    return captureWebGLSnapshot(this.renderer, this.scene, this.camera, options, this.onWindowResize);
  }

  public setGizmo(gizmo: OrientationGizmo | null): void {
    this.gizmo = gizmo;
    if (gizmo) {
      gizmo.setCamera(this.camera, (dir, up) => this.alignCameraTo(dir, up));
    }
  }

  public toggleAutoRotate(enabled?: boolean): boolean {
    this.autoRotate = enabled === undefined ? !this.autoRotate : enabled;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 1.5;
    return this.autoRotate;
  }

  public isAutoRotating(): boolean {
    return this.autoRotate;
  }

  public resetCamera(smooth: boolean = true): void {
    if (smooth) {
      this.animateCameraTo(this.defaultCameraPos.clone(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 450);
    } else {
      this.camera.position.copy(this.defaultCameraPos);
      this.camera.up.set(0, 1, 0);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      if (this.gizmo) this.gizmo.update();
    }
  }

  public alignCameraTo(dir: THREE.Vector3, up: THREE.Vector3, smooth: boolean = true): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const targetPos = this.controls.target.clone().addScaledVector(dir, Math.max(dist, 5.0));
    if (smooth) {
      this.animateCameraTo(targetPos, up, this.controls.target.clone(), 400);
    } else {
      this.camera.position.copy(targetPos);
      this.camera.up.copy(up);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
      if (this.gizmo) this.gizmo.update();
    }
  }

  public animateCameraTo(targetPos: THREE.Vector3, targetUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0), targetLookAt?: THREE.Vector3, duration: number = 400): void {
    cancelAnimationFrame(this.cameraTransitionId);
    const startPos = this.camera.position.clone();
    const startUp = this.camera.up.clone();
    const startTarget = this.controls.target.clone();
    const endTarget = targetLookAt ? targetLookAt.clone() : startTarget.clone();
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.camera.up.lerpVectors(startUp, targetUp, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.camera.lookAt(this.controls.target);
      this.controls.update();

      if (this.gizmo) {
        this.gizmo.update();
      }

      if (progress < 1.0) {
        this.cameraTransitionId = requestAnimationFrame(step);
      }
    };

    this.cameraTransitionId = requestAnimationFrame(step);
  }

  private isAnimating: boolean = false;

  public start(): void {
    if (!this.isAnimating) {
      this.isAnimating = true;
      cancelAnimationFrame(this.animationId);
      this.animate();
    }
  }

  public stop(): void {
    this.isAnimating = false;
    cancelAnimationFrame(this.animationId);
  }

  public animate = (): void => {
    if (!this.isAnimating) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    if (this.gizmo) {
      this.gizmo.update();
    }

    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    cancelAnimationFrame(this.cameraTransitionId);
    window.removeEventListener('resize', this.onWindowResize);
    this.clearCurrentMesh();
    this.controls.dispose();
    this.renderer.dispose();
  }
}


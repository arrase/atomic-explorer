import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

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
}

// Shader for Point Cloud rendering
const pointVertexShader = `
  varying float vDistance;
  varying float vIntensity;
  uniform float u_pointSizeScale;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vDistance = length(position);
    gl_PointSize = clamp(u_pointSizeScale * (10.0 / -mvPosition.z), 2.0, 64.0);
  }
`;

const pointFragmentShader = `
  varying float vDistance;
  uniform int u_palette;

  vec3 getPointPaletteColor(float dist, int paletteId) {
    float t = clamp(dist / 15.0, 0.0, 1.0);
    if (paletteId == 1) { // Fire
      return mix(vec3(1.0, 0.7, 0.1), vec3(0.9, 0.1, 0.1), t);
    } else if (paletteId == 2) { // Emerald
      return mix(vec3(0.2, 1.0, 0.6), vec3(0.0, 0.5, 0.4), t);
    } else if (paletteId == 3) { // Spectrum
      return mix(vec3(0.8, 0.2, 1.0), vec3(0.1, 0.9, 0.9), t);
    }
    // Default Cyan & Magenta
    return mix(vec3(0.2, 0.85, 1.0), vec3(0.7, 0.25, 0.9), t);
  }

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    float alpha = pow(1.0 - (dist * 2.0), 1.5);
    vec3 finalColor = getPointPaletteColor(vDistance, u_palette);
    gl_FragColor = vec4(finalColor, alpha * 0.85);
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

  #define PI 3.14159265359

  // Radial hydrogen wavefunction approximation in GLSL
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
    return exp(-zr / float(n));
  }

  // Angular wavefunction in GLSL
  float evalY(int l, int m, bool useReal, float theta, float phi) {
    float ct = cos(theta);
    float st = sin(theta);
    float cp = cos(phi);
    float sp = sin(phi);

    if (l == 0) {
      return 0.5 * sqrt(1.0 / PI);
    } else if (l == 1) {
      if (m == 0) return 0.5 * sqrt(3.0 / PI) * ct;
      if (m == 1) return 0.5 * sqrt(3.0 / PI) * st * cp;
      if (m == -1) return 0.5 * sqrt(3.0 / PI) * st * sp;
    } else if (l == 2) {
      if (m == 0) return 0.25 * sqrt(5.0 / PI) * (3.0 * ct * ct - 1.0);
      if (m == 1) return 0.5 * sqrt(15.0 / PI) * st * ct * cp;
      if (m == -1) return 0.5 * sqrt(15.0 / PI) * st * ct * sp;
      if (m == 2) return 0.25 * sqrt(15.0 / PI) * st * st * cos(2.0 * phi);
      if (m == -2) return 0.25 * sqrt(15.0 / PI) * st * st * sin(2.0 * phi);
    } else if (l == 3) {
      if (m == 0) return 0.25 * sqrt(7.0 / PI) * (5.0 * ct * ct * ct - 3.0 * ct);
      if (abs(m) == 1) return 0.125 * sqrt(42.0 / PI) * st * (5.0 * ct * ct - 1.0) * (m > 0 ? cp : sp);
      if (abs(m) == 2) return 0.25 * sqrt(105.0 / PI) * st * st * ct * (m > 0 ? cos(2.0*phi) : sin(2.0*phi));
      if (abs(m) == 3) return 0.125 * sqrt(70.0 / PI) * st * st * st * (m > 0 ? cos(3.0*phi) : sin(3.0*phi));
    }
    return 0.5 * sqrt(1.0 / PI);
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

  vec3 getPaletteColor(float psi, float density, int paletteId) {
    float t = clamp(density * 12.0, 0.0, 1.0);
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
    // Default Cyan & Magenta
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
      float density = psi * psi;

      if (density > 0.0001) {
        vec3 color = getPaletteColor(psi, density, u_palette);
        float alphaSample = 1.0 - exp(-density * stepSize * 30.0);

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


  private pointsMesh: THREE.Points | null = null;
  private marchingCubesMesh: MarchingCubes | null = null;
  private raymarchingMesh: THREE.Mesh | null = null;
  private raymarchingMaterial: THREE.ShaderMaterial | null = null;

  private currentMode: RenderMode = 'points';
  private currentParams: OrbitalRenderParams = {
    n: 1,
    l: 0,
    m: 0,
    useRealOrbital: true,
    zEff: 1.0,
    mode: 'points',
    quality: 'medium',
    raymarchingSteps: 128,
    colorPalette: 'default',
    resolutionScale: 1.0,
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


  public setPointCloud(positions: Float32Array): void {
    this.clearCurrentMesh();
    this.currentMode = 'points';

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const paletteId = this.paletteToId(this.currentParams.colorPalette);

    const material = new THREE.ShaderMaterial({
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      uniforms: {
        u_pointSizeScale: { value: 18.0 },
        u_palette: { value: paletteId },
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

    const baseColor = this.paletteToIsoColor(params.colorPalette);

    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.15,
      metalness: 0.2,
      transmission: 0.65,
      opacity: 0.85,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mc = new MarchingCubes(gridRes, material, false, false, 200000);
    const boxExtent = (4.0 * (params.n * params.n)) / Math.max(params.zEff, 0.5);
    mc.scale.set(boxExtent, boxExtent, boxExtent);

    // Compute grid values
    this.fillMarchingCubesGrid(mc, gridRes, params);
    mc.update();

    this.marchingCubesMesh = mc;
    this.scene.add(mc);
  }

  private fillMarchingCubesGrid(mc: MarchingCubes, resolution: number, params: OrbitalRenderParams): void {
    const { n, l, m, useRealOrbital, zEff } = params;
    const isolevel = params.isolevel ?? 0.005;

    mc.reset();
    mc.isolation = isolevel;

    const rMax = (4.0 * (n * n)) / Math.max(zEff, 0.5);
    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        for (let z = 0; z < resolution; z++) {
          const px = (x / (resolution - 1) - 0.5) * 2.0 * rMax;
          const py = (y / (resolution - 1) - 0.5) * 2.0 * rMax;
          const pz = (z / (resolution - 1) - 0.5) * 2.0 * rMax;

          const r = Math.hypot(px, py, pz);
          let density = 0;
          if (r > 1e-4) {
            const theta = Math.acos(Math.max(-1, Math.min(1, pz / r)));
            const phi = Math.atan2(py, px);

            const R = this.evalRadial(n, l, zEff, r);
            const Y = this.evalAngular(l, m, useRealOrbital, theta, phi);
            const psi = R * Y;
            density = psi * psi;
          }

          mc.setCell(x, y, z, density);
        }
      }
    }
  }

  public updateRaymarching(params: OrbitalRenderParams): void {
    this.clearCurrentMesh();
    this.currentMode = 'raymarching';
    this.currentParams = { ...params };

    const boxExtent = (4.0 * (params.n * params.n)) / Math.max(params.zEff, 0.5);
    const geometry = new THREE.BoxGeometry(boxExtent * 2, boxExtent * 2, boxExtent * 2);

    const steps = params.raymarchingSteps ?? (
      params.quality === 'low' ? 64 :
      params.quality === 'medium' ? 96 :
      params.quality === 'high' ? 128 :
      params.quality === 'ultra' ? 256 :
      params.quality === 'extreme' ? 512 : 128
    );

    const paletteId = this.paletteToId(params.colorPalette);

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
        u_palette: { value: paletteId },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.raymarchingMesh = new THREE.Mesh(geometry, this.raymarchingMaterial);
    this.scene.add(this.raymarchingMesh);
  }

  private paletteToId(palette?: ColorPalette): number {
    switch (palette) {
      case 'fire': return 1;
      case 'emerald': return 2;
      case 'spectrum': return 3;
      default: return 0;
    }
  }

  private paletteToIsoColor(palette?: ColorPalette): number {
    switch (palette) {
      case 'fire': return 0xff6600;
      case 'emerald': return 0x00cc88;
      case 'spectrum': return 0xaa22ff;
      default: return 0x2080ff;
    }
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
    return Math.exp(-zr / n);
  }

  private evalAngular(l: number, m: number, useReal: boolean, theta: number, phi: number): number {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);

    if (l === 0) return 0.5 * Math.sqrt(1.0 / Math.PI);
    if (l === 1) {
      if (m === 0) return 0.5 * Math.sqrt(3.0 / Math.PI) * ct;
      if (m === 1) return 0.5 * Math.sqrt(3.0 / Math.PI) * st * (useReal ? cp : 1.0);
      if (m === -1) return 0.5 * Math.sqrt(3.0 / Math.PI) * st * (useReal ? sp : 1.0);
    }
    if (l === 2) {
      if (m === 0) return 0.25 * Math.sqrt(5.0 / Math.PI) * (3.0 * ct * ct - 1.0);
      if (m === 1) return 0.5 * Math.sqrt(15.0 / Math.PI) * st * ct * cp;
      if (m === -1) return 0.5 * Math.sqrt(15.0 / Math.PI) * st * ct * sp;
      if (m === 2) return 0.25 * Math.sqrt(15.0 / Math.PI) * st * st * Math.cos(2 * phi);
      if (m === -2) return 0.25 * Math.sqrt(15.0 / Math.PI) * st * st * Math.sin(2 * phi);
    }
    return 0.5 * Math.sqrt(1.0 / Math.PI);
  }

  private clearCurrentMesh(): void {
    if (this.pointsMesh) {
      this.scene.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      (this.pointsMesh.material as THREE.Material).dispose();
      this.pointsMesh = null;
    }
    if (this.marchingCubesMesh) {
      this.scene.remove(this.marchingCubesMesh);
      (this.marchingCubesMesh.material as THREE.Material).dispose();
      this.marchingCubesMesh = null;
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
    const pixelRatio = Math.min(window.devicePixelRatio * resScale, 4.0);

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

  };

  public async captureSnapshot(options: {
    width: number;
    height: number;
    superSampling: number;
    format: 'image/png' | 'image/jpeg' | 'image/webp';
    background: 'dark' | 'black' | 'white' | 'transparent';
  }): Promise<string> {
    const origPixelRatio = this.renderer.getPixelRatio();
    const origClearColor = new THREE.Color();
    this.renderer.getClearColor(origClearColor);
    const origClearAlpha = this.renderer.getClearAlpha();

    const targetWidth = Math.round(options.width);
    const targetHeight = Math.round(options.height);

    this.renderer.setPixelRatio(options.superSampling);
    this.renderer.setSize(targetWidth, targetHeight, false);

    this.camera.aspect = targetWidth / targetHeight;
    this.camera.updateProjectionMatrix();

    if (options.background === 'black') {
      this.renderer.setClearColor(new THREE.Color(0x000000), 1.0);
    } else if (options.background === 'white') {
      this.renderer.setClearColor(new THREE.Color(0xffffff), 1.0);
    } else if (options.background === 'transparent') {
      this.renderer.setClearColor(new THREE.Color(0x000000), 0.0);
    } else {
      this.renderer.setClearColor(new THREE.Color('#0a0a1a'), 1.0);
    }

    this.renderer.render(this.scene, this.camera);

    const dataUrl = this.renderer.domElement.toDataURL(options.format, 0.95);

    // Restore original size
    this.renderer.setPixelRatio(origPixelRatio);
    this.renderer.setClearColor(origClearColor, origClearAlpha);
    this.onWindowResize();

    return dataUrl;
  }

  private isAnimating: boolean = false;

  public start(): void {
    if (!this.isAnimating) {
      this.isAnimating = true;
      if (this.animationId !== undefined) {
        cancelAnimationFrame(this.animationId);
      }
      this.animate();
    }
  }

  public stop(): void {
    this.isAnimating = false;
    if (this.animationId !== undefined) {
      cancelAnimationFrame(this.animationId);
    }
  }

  public animate = (): void => {
    if (!this.isAnimating) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    if (this.pointsMesh) {
      this.pointsMesh.rotation.y += 0.001;
    } else if (this.marchingCubesMesh) {
      this.marchingCubesMesh.rotation.y += 0.001;
    } else if (this.raymarchingMesh) {
      this.raymarchingMesh.rotation.y += 0.001;
    }

    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize);
    this.clearCurrentMesh();
    this.controls.dispose();
    this.renderer.dispose();
  }
}


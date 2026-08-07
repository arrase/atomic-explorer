import { OrbitalParams } from '../core/wasm-bridge';
import { RenderMode, QualityPreset, ColorPalette } from '../render/orbital-renderer';
import { getStrings, onLanguageChange, I18nStrings, ConceptExplanation } from '../i18n';
import { ExplanationModal } from './info-modal';
import { OrbitalPhysicsPanel } from './orbital-physics-panel';

export interface ExtendedOrbitalParams extends OrbitalParams {
  s: number;
  mode: RenderMode;
  quality: QualityPreset;
  raymarchingSteps: number;
  resolutionScale: number;
  colorPalette: ColorPalette;
  elementZ?: number;
}

export class ControlPanel {
  private container: HTMLElement;
  private onChange: (params: ExtendedOrbitalParams) => void;
  private onExportClick?: () => void;
  private physicsPanel: OrbitalPhysicsPanel | null = null;

  private currentParams: ExtendedOrbitalParams = {
    n: 1,
    l: 0,
    m: 0,
    s: 0.5,
    useRealOrbital: true,
    zEff: 1.0,
    pointCount: 50000,
    mode: 'raymarching',
    quality: 'medium',
    raymarchingSteps: 96,
    resolutionScale: 1.0,
    colorPalette: 'default',
    elementZ: 1,
  };

  constructor(
    container: HTMLElement,
    onChange: (params: ExtendedOrbitalParams) => void,
    onExportClick?: () => void
  ) {
    this.container = container;
    this.onChange = onChange;
    this.onExportClick = onExportClick;
    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const strings = getStrings();
    const isCustom = this.currentParams.quality === 'custom';

    this.container.innerHTML = `
      <div class="mobile-floating-actions">
        <button class="mobile-float-btn" id="btn-show-controls" title="${strings.orbitalControls}">
          <span class="btn-icon">🎛️</span>
          <span class="btn-label">${strings.orbitalControls}</span>
        </button>
        <button class="mobile-float-btn" id="btn-show-physics" title="${strings.physicsPanelTitle}">
          <span class="btn-icon">📊</span>
          <span class="btn-label">${strings.physicsPanelTitle}</span>
        </button>
      </div>

      <div class="control-panel">
        <div class="panel-header">
          <h3>${strings.orbitalControls}</h3>
          <div class="panel-header-actions">
            <button class="btn-export-hdr" id="btn-open-export" title="${strings.exportImage}">
              ${strings.exportImage}
            </button>
            <button class="panel-close-btn" id="btn-close-controls" aria-label="Close">✕</button>
          </div>
        </div>

        <div class="control-grid">
          <!-- Quantum Number n -->
          <div class="control-group">
            <label for="n-select">
              <span>${strings.principalQuantum}: <span id="n-val">${this.currentParams.n}</span></span>
              <button class="btn-info-icon" data-explain="explainN" aria-label="Info">ℹ️</button>
            </label>
            <input type="range" id="n-select" min="1" max="7" value="${this.currentParams.n}" step="1" />
          </div>

          <!-- Quantum Number l -->
          <div class="control-group">
            <label for="l-select">
              <span>${strings.azimuthalQuantum}: <span id="l-val">${this.currentParams.l}</span></span>
              <button class="btn-info-icon" data-explain="explainL" aria-label="Info">ℹ️</button>
            </label>
            <input type="range" id="l-select" min="0" max="${this.currentParams.n - 1}" value="${this.currentParams.l}" step="1" />
          </div>

          <!-- Quantum Number m -->
          <div class="control-group">
            <label for="m-select">
              <span>${strings.magneticQuantum}: <span id="m-val">${this.currentParams.m}</span></span>
              <button class="btn-info-icon" data-explain="explainM" aria-label="Info">ℹ️</button>
            </label>
            <input type="range" id="m-select" min="${-this.currentParams.l}" max="${this.currentParams.l}" value="${this.currentParams.m}" step="1" />
          </div>

          <!-- Spin s -->
          <div class="control-group">
            <label for="spin-select">
              <span>${strings.spinQuantum}:</span>
              <button class="btn-info-icon" data-explain="explainS" aria-label="Info">ℹ️</button>
            </label>
            <select id="spin-select">
              <option value="0.5" ${this.currentParams.s === 0.5 ? 'selected' : ''}>+1/2 (↑)</option>
              <option value="-0.5" ${this.currentParams.s === -0.5 ? 'selected' : ''}>-1/2 (↓)</option>
            </select>
          </div>

          <!-- Render Mode -->
          <div class="control-group">
            <label for="mode-select">
              <span>${strings.mode}:</span>
              <button class="btn-info-icon" data-explain="explainMode" aria-label="Info">ℹ️</button>
            </label>
            <select id="mode-select">
              <option value="points" ${this.currentParams.mode === 'points' ? 'selected' : ''}>${strings.modePoints}</option>
              <option value="isosurface" ${this.currentParams.mode === 'isosurface' ? 'selected' : ''}>${strings.modeIsosurface}</option>
              <option value="raymarching" ${this.currentParams.mode === 'raymarching' ? 'selected' : ''}>${strings.modeRaymarching}</option>
            </select>
          </div>

          <!-- Orbital Type (Real vs Pure) -->
          <div class="control-group">
            <label for="type-select">
              <span>${strings.orbitalType}:</span>
              <button class="btn-info-icon" data-explain="explainOrbitalType" aria-label="Info">ℹ️</button>
            </label>
            <select id="type-select">
              <option value="real" ${this.currentParams.useRealOrbital ? 'selected' : ''}>${strings.modeRealOrbital}</option>
              <option value="eigen" ${!this.currentParams.useRealOrbital ? 'selected' : ''}>${strings.modeEigenstate}</option>
            </select>
          </div>

          <!-- Quality Preset -->
          <div class="control-group">
            <label for="quality-select">
              <span>${strings.quality}:</span>
              <button class="btn-info-icon" data-explain="explainQuality" aria-label="Info">ℹ️</button>
            </label>
            <select id="quality-select">
              <option value="low" ${this.currentParams.quality === 'low' ? 'selected' : ''}>${strings.qualityLow}</option>
              <option value="medium" ${this.currentParams.quality === 'medium' ? 'selected' : ''}>${strings.qualityMedium}</option>
              <option value="high" ${this.currentParams.quality === 'high' ? 'selected' : ''}>${strings.qualityHigh}</option>
              <option value="ultra" ${this.currentParams.quality === 'ultra' ? 'selected' : ''}>${strings.qualityUltra}</option>
              <option value="extreme" ${this.currentParams.quality === 'extreme' ? 'selected' : ''}>${strings.qualityExtreme}</option>
              <option value="custom" ${isCustom ? 'selected' : ''}>${strings.qualityCustom}</option>
            </select>
          </div>

          <!-- Color Palette -->
          <div class="control-group">
            <label for="palette-select">
              <span>${strings.colorPalette}:</span>
              <button class="btn-info-icon" data-explain="explainPalette" aria-label="Info">ℹ️</button>
            </label>
            <select id="palette-select">
              <option value="default" ${this.currentParams.colorPalette === 'default' ? 'selected' : ''}>${strings.paletteDefault}</option>
              <option value="fire" ${this.currentParams.colorPalette === 'fire' ? 'selected' : ''}>${strings.paletteFire}</option>
              <option value="emerald" ${this.currentParams.colorPalette === 'emerald' ? 'selected' : ''}>${strings.paletteEmerald}</option>
              <option value="spectrum" ${this.currentParams.colorPalette === 'spectrum' ? 'selected' : ''}>${strings.paletteSpectrum}</option>
            </select>
          </div>

          <!-- Effective Nuclear Charge Z_eff -->
          <div class="control-group">
            <label for="zeff-input">
              <span>${strings.zEffCharge}: <span id="zeff-val">${this.currentParams.zEff.toFixed(2)}</span></span>
              <button class="btn-info-icon" data-explain="explainZeff" aria-label="Info">ℹ️</button>
            </label>
            <input type="range" id="zeff-input" min="0.1" max="118" value="${this.currentParams.zEff}" step="0.1" />
          </div>

          <!-- Custom Fine-Tuning Controls (Visible when quality=custom) -->
          <div class="custom-tuning-panel ${isCustom ? '' : 'hidden'}" id="custom-tuning">
            <div class="control-group">
              <label for="pts-input">${strings.pointCount}: <span id="pts-val">${this.currentParams.pointCount.toLocaleString()}</span></label>
              <input type="range" id="pts-input" min="10000" max="2500000" value="${this.currentParams.pointCount}" step="10000" />
            </div>

            <div class="control-group">
              <label for="steps-input">${strings.raymarchingSteps}: <span id="steps-val">${this.currentParams.raymarchingSteps}</span></label>
              <input type="range" id="steps-input" min="32" max="512" value="${this.currentParams.raymarchingSteps}" step="16" />
            </div>

            <div class="control-group">
              <label for="scale-select">${strings.superSampling}:</label>
              <select id="scale-select">
                <option value="1.0" ${this.currentParams.resolutionScale === 1.0 ? 'selected' : ''}>1.0x (Nativo)</option>
                <option value="1.5" ${this.currentParams.resolutionScale === 1.5 ? 'selected' : ''}>1.5x (SuperSampling QHD)</option>
                <option value="2.0" ${this.currentParams.resolutionScale === 2.0 ? 'selected' : ''}>2.0x (SuperSampling 4K)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="physics-panel-container"></div>
    `;

    const physicsContainer = this.container.querySelector('.physics-panel-container') as HTMLElement;
    if (physicsContainer) {
      this.physicsPanel = new OrbitalPhysicsPanel(physicsContainer, this.currentParams);
    }

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const strings = getStrings();

    const controlPanel = this.container.querySelector('.control-panel') as HTMLElement;
    const physicsContainer = this.container.querySelector('.physics-panel-container') as HTMLElement;

    const btnShowControls = this.container.querySelector('#btn-show-controls');
    const btnShowPhysics = this.container.querySelector('#btn-show-physics');
    const btnCloseControls = this.container.querySelector('#btn-close-controls');

    btnShowControls?.addEventListener('click', () => {
      controlPanel?.classList.add('mobile-open');
      physicsContainer?.classList.remove('mobile-open');
    });

    btnShowPhysics?.addEventListener('click', () => {
      physicsContainer?.classList.add('mobile-open');
      controlPanel?.classList.remove('mobile-open');
    });

    btnCloseControls?.addEventListener('click', () => {
      controlPanel?.classList.remove('mobile-open');
    });

    const nInput = this.container.querySelector('#n-select') as HTMLInputElement;
    const lInput = this.container.querySelector('#l-select') as HTMLInputElement;
    const mInput = this.container.querySelector('#m-select') as HTMLInputElement;
    const spinSelect = this.container.querySelector('#spin-select') as HTMLSelectElement;
    const modeSelect = this.container.querySelector('#mode-select') as HTMLSelectElement;
    const typeSelect = this.container.querySelector('#type-select') as HTMLSelectElement;
    const qualitySelect = this.container.querySelector('#quality-select') as HTMLSelectElement;
    const paletteSelect = this.container.querySelector('#palette-select') as HTMLSelectElement;
    const zeffInput = this.container.querySelector('#zeff-input') as HTMLInputElement;

    const exportBtn = this.container.querySelector('#btn-open-export');

    const customPanel = this.container.querySelector('#custom-tuning') as HTMLElement;
    const ptsInput = this.container.querySelector('#pts-input') as HTMLInputElement;
    const stepsInput = this.container.querySelector('#steps-input') as HTMLInputElement;
    const scaleSelect = this.container.querySelector('#scale-select') as HTMLSelectElement;

    const nVal = this.container.querySelector('#n-val') as HTMLElement;
    const lVal = this.container.querySelector('#l-val') as HTMLElement;
    const mVal = this.container.querySelector('#m-val') as HTMLElement;
    const zeffVal = this.container.querySelector('#zeff-val') as HTMLElement;
    const ptsVal = this.container.querySelector('#pts-val') as HTMLElement;
    const stepsVal = this.container.querySelector('#steps-val') as HTMLElement;

    exportBtn?.addEventListener('click', () => {
      if (this.onExportClick) this.onExportClick();
    });

    const infoBtns = this.container.querySelectorAll('.btn-info-icon');
    infoBtns.forEach((btn) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const explainKey = (btn as HTMLElement).dataset.explain as keyof I18nStrings;
        if (explainKey && strings[explainKey]) {
          const explanation = strings[explainKey] as ConceptExplanation;
          ExplanationModal.show(explanation);
        }
      });
    });

    const updateControls = () => {
      const n = parseInt(nInput.value, 10);
      nVal.textContent = String(n);

      lInput.max = String(n - 1);
      let l = parseInt(lInput.value, 10);
      if (l >= n) {
        l = n - 1;
        lInput.value = String(l);
      }
      lVal.textContent = String(l);

      mInput.min = String(-l);
      mInput.max = String(l);
      let m = parseInt(mInput.value, 10);
      if (m < -l) m = -l;
      if (m > l) m = l;
      mInput.value = String(m);
      mVal.textContent = String(m);

      const s = parseFloat(spinSelect.value);
      const mode = modeSelect.value as RenderMode;
      const useRealOrbital = typeSelect.value === 'real';
      const quality = qualitySelect.value as QualityPreset;
      const colorPalette = paletteSelect.value as ColorPalette;
      const zEff = parseFloat(zeffInput.value);
      zeffVal.textContent = zEff.toFixed(2);

      const qualitySettings = this.resolveQualityPreset(
        quality,
        customPanel,
        ptsInput,
        stepsInput,
        scaleSelect,
        ptsVal,
        stepsVal
      );

      if (ptsInput) ptsInput.value = String(qualitySettings.pointCount);
      if (stepsInput) stepsInput.value = String(qualitySettings.raymarchingSteps);
      if (scaleSelect) scaleSelect.value = String(qualitySettings.resolutionScale);

      this.currentParams = {
        ...this.currentParams,
        n,
        l,
        m,
        s,
        useRealOrbital,
        zEff,
        pointCount: qualitySettings.pointCount,
        mode,
        quality,
        raymarchingSteps: qualitySettings.raymarchingSteps,
        resolutionScale: qualitySettings.resolutionScale,
        colorPalette,
      };

      this.physicsPanel?.updateParams(this.currentParams);
      this.onChange(this.currentParams);
    };

    nInput.addEventListener('input', updateControls);
    lInput.addEventListener('input', updateControls);
    mInput.addEventListener('input', updateControls);
    spinSelect.addEventListener('change', updateControls);
    modeSelect.addEventListener('change', updateControls);
    typeSelect.addEventListener('change', updateControls);
    qualitySelect.addEventListener('change', updateControls);
    paletteSelect.addEventListener('change', updateControls);
    zeffInput.addEventListener('input', updateControls);

    if (ptsInput) ptsInput.addEventListener('input', updateControls);
    if (stepsInput) stepsInput.addEventListener('input', updateControls);
    if (scaleSelect) scaleSelect.addEventListener('change', updateControls);
  }

  private resolveQualityPreset(
    quality: QualityPreset,
    customPanel: HTMLElement,
    ptsInput: HTMLInputElement | null,
    stepsInput: HTMLInputElement | null,
    scaleSelect: HTMLSelectElement | null,
    ptsVal: HTMLElement | null,
    stepsVal: HTMLElement | null
  ): { pointCount: number; raymarchingSteps: number; resolutionScale: number } {
    if (quality === 'custom') {
      customPanel.classList.remove('hidden');
      const pointCount = ptsInput ? parseInt(ptsInput.value, 10) : 50000;
      const raymarchingSteps = stepsInput ? parseInt(stepsInput.value, 10) : 96;
      const resolutionScale = scaleSelect ? parseFloat(scaleSelect.value) : 1.0;

      if (ptsVal) ptsVal.textContent = pointCount.toLocaleString();
      if (stepsVal) stepsVal.textContent = String(raymarchingSteps);

      return { pointCount, raymarchingSteps, resolutionScale };
    }

    customPanel.classList.add('hidden');

    const presets: Record<Exclude<QualityPreset, 'custom'>, { pointCount: number; raymarchingSteps: number; resolutionScale: number }> = {
      low: { pointCount: 20000, raymarchingSteps: 64, resolutionScale: 1.0 },
      medium: { pointCount: 50000, raymarchingSteps: 96, resolutionScale: 1.0 },
      high: { pointCount: 150000, raymarchingSteps: 128, resolutionScale: 1.0 },
      ultra: { pointCount: 500000, raymarchingSteps: 256, resolutionScale: 1.5 },
      extreme: { pointCount: 1500000, raymarchingSteps: 512, resolutionScale: 2.0 },
    };

    return presets[quality] || presets.medium;
  }

  public setParams(params: Partial<ExtendedOrbitalParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    
    if (this.currentParams.n !== undefined) {
      this.currentParams.n = Math.max(1, Math.min(7, Math.floor(this.currentParams.n)));
    }
    const maxL = this.currentParams.n - 1;
    if (this.currentParams.l > maxL) {
      this.currentParams.l = maxL;
    }
    const maxM = this.currentParams.l;
    if (Math.abs(this.currentParams.m) > maxM) {
      this.currentParams.m = this.currentParams.m < 0 ? -maxM : maxM;
    }

    this.render();
  }

  public getParams(): ExtendedOrbitalParams {
    return this.currentParams;
  }

  public getPhysicsPanel(): OrbitalPhysicsPanel | null {
    return this.physicsPanel;
  }
}

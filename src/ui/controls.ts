import { OrbitalParams } from '../core/wasm-bridge';
import { RenderMode, QualityPreset, ColorPalette } from '../render/orbital-renderer';
import { getStrings, onLanguageChange } from '../i18n';

export interface ExtendedOrbitalParams extends OrbitalParams {
  s: number;
  mode: RenderMode;
  quality: QualityPreset;
  raymarchingSteps: number;
  resolutionScale: number;
  colorPalette: ColorPalette;
  enableBloom: boolean;
  bloomIntensity: number;
  elementZ?: number;
}

export class ControlPanel {
  private container: HTMLElement;
  private onChange: (params: ExtendedOrbitalParams) => void;
  private onExportClick?: () => void;

  private currentParams: ExtendedOrbitalParams = {
    n: 1,
    l: 0,
    m: 0,
    s: 0.5,
    useRealOrbital: true,
    zEff: 1.0,
    pointCount: 50000,
    mode: 'points',
    quality: 'medium',
    raymarchingSteps: 96,
    resolutionScale: 1.0,
    colorPalette: 'default',
    enableBloom: true,
    bloomIntensity: 0.8,
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
      <div class="control-panel">
        <div class="panel-header">
          <h3>${strings.orbitalControls}</h3>
          <button class="btn-export-hdr" id="btn-open-export" title="${strings.exportImage}">
            ${strings.exportImage}
          </button>
        </div>

        <div class="control-grid">
          <!-- Quantum Number n -->
          <div class="control-group">
            <label for="n-select">${strings.principalQuantum}: <span id="n-val">${this.currentParams.n}</span></label>
            <input type="range" id="n-select" min="1" max="4" value="${this.currentParams.n}" step="1" />
          </div>

          <!-- Quantum Number l -->
          <div class="control-group">
            <label for="l-select">${strings.azimuthalQuantum}: <span id="l-val">${this.currentParams.l}</span></label>
            <input type="range" id="l-select" min="0" max="${this.currentParams.n - 1}" value="${this.currentParams.l}" step="1" />
          </div>

          <!-- Quantum Number m -->
          <div class="control-group">
            <label for="m-select">${strings.magneticQuantum}: <span id="m-val">${this.currentParams.m}</span></label>
            <input type="range" id="m-select" min="${-this.currentParams.l}" max="${this.currentParams.l}" value="${this.currentParams.m}" step="1" />
          </div>

          <!-- Spin s -->
          <div class="control-group">
            <label for="spin-select">${strings.spinQuantum}:</label>
            <select id="spin-select">
              <option value="0.5" ${this.currentParams.s === 0.5 ? 'selected' : ''}>+1/2 (↑)</option>
              <option value="-0.5" ${this.currentParams.s === -0.5 ? 'selected' : ''}>-1/2 (↓)</option>
            </select>
          </div>

          <!-- Render Mode -->
          <div class="control-group">
            <label for="mode-select">${strings.mode}:</label>
            <select id="mode-select">
              <option value="points" ${this.currentParams.mode === 'points' ? 'selected' : ''}>${strings.modePoints}</option>
              <option value="isosurface" ${this.currentParams.mode === 'isosurface' ? 'selected' : ''}>${strings.modeIsosurface}</option>
              <option value="raymarching" ${this.currentParams.mode === 'raymarching' ? 'selected' : ''}>${strings.modeRaymarching}</option>
            </select>
          </div>

          <!-- Orbital Type (Real vs Pure) -->
          <div class="control-group">
            <label for="type-select">${strings.orbitalType}:</label>
            <select id="type-select">
              <option value="real" ${this.currentParams.useRealOrbital ? 'selected' : ''}>${strings.modeRealOrbital}</option>
              <option value="eigen" ${!this.currentParams.useRealOrbital ? 'selected' : ''}>${strings.modeEigenstate}</option>
            </select>
          </div>

          <!-- Quality Preset -->
          <div class="control-group">
            <label for="quality-select">${strings.quality}:</label>
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
            <label for="palette-select">${strings.colorPalette}:</label>
            <select id="palette-select">
              <option value="default" ${this.currentParams.colorPalette === 'default' ? 'selected' : ''}>${strings.paletteDefault}</option>
              <option value="fire" ${this.currentParams.colorPalette === 'fire' ? 'selected' : ''}>${strings.paletteFire}</option>
              <option value="emerald" ${this.currentParams.colorPalette === 'emerald' ? 'selected' : ''}>${strings.paletteEmerald}</option>
              <option value="spectrum" ${this.currentParams.colorPalette === 'spectrum' ? 'selected' : ''}>${strings.paletteSpectrum}</option>
            </select>
          </div>

          <!-- Bloom Glow Toggle -->
          <div class="control-group checkbox-group">
            <label for="bloom-toggle">
              <input type="checkbox" id="bloom-toggle" ${this.currentParams.enableBloom ? 'checked' : ''} />
              ${strings.bloomEffect}
            </label>
          </div>

          <!-- Effective Nuclear Charge Z_eff -->
          <div class="control-group">
            <label for="zeff-input">${strings.zEffCharge}: <span id="zeff-val">${this.currentParams.zEff.toFixed(2)}</span></label>
            <input type="range" id="zeff-input" min="1" max="10" value="${this.currentParams.zEff}" step="0.1" />
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
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const nInput = this.container.querySelector('#n-select') as HTMLInputElement;
    const lInput = this.container.querySelector('#l-select') as HTMLInputElement;
    const mInput = this.container.querySelector('#m-select') as HTMLInputElement;
    const spinSelect = this.container.querySelector('#spin-select') as HTMLSelectElement;
    const modeSelect = this.container.querySelector('#mode-select') as HTMLSelectElement;
    const typeSelect = this.container.querySelector('#type-select') as HTMLSelectElement;
    const qualitySelect = this.container.querySelector('#quality-select') as HTMLSelectElement;
    const paletteSelect = this.container.querySelector('#palette-select') as HTMLSelectElement;
    const bloomToggle = this.container.querySelector('#bloom-toggle') as HTMLInputElement;
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
      const enableBloom = bloomToggle.checked;
      const zEff = parseFloat(zeffInput.value);
      zeffVal.textContent = zEff.toFixed(2);

      let pointCount = 50000;
      let raymarchingSteps = 96;
      let resolutionScale = 1.0;

      if (quality === 'low') {
        pointCount = 20000;
        raymarchingSteps = 64;
        resolutionScale = 1.0;
        customPanel.classList.add('hidden');
      } else if (quality === 'medium') {
        pointCount = 50000;
        raymarchingSteps = 96;
        resolutionScale = 1.0;
        customPanel.classList.add('hidden');
      } else if (quality === 'high') {
        pointCount = 150000;
        raymarchingSteps = 128;
        resolutionScale = 1.0;
        customPanel.classList.add('hidden');
      } else if (quality === 'ultra') {
        pointCount = 500000;
        raymarchingSteps = 256;
        resolutionScale = 1.5;
        customPanel.classList.add('hidden');
      } else if (quality === 'extreme') {
        pointCount = 1500000;
        raymarchingSteps = 512;
        resolutionScale = 2.0;
        customPanel.classList.add('hidden');
      } else if (quality === 'custom') {
        customPanel.classList.remove('hidden');
        pointCount = parseInt(ptsInput.value, 10);
        raymarchingSteps = parseInt(stepsInput.value, 10);
        resolutionScale = parseFloat(scaleSelect.value);
        if (ptsVal) ptsVal.textContent = pointCount.toLocaleString();
        if (stepsVal) stepsVal.textContent = String(raymarchingSteps);
      }

      this.currentParams = {
        n,
        l,
        m,
        s,
        useRealOrbital,
        zEff,
        pointCount,
        mode,
        quality,
        raymarchingSteps,
        resolutionScale,
        colorPalette,
        enableBloom,
        bloomIntensity: 0.8,
      };

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
    bloomToggle.addEventListener('change', updateControls);
    zeffInput.addEventListener('input', updateControls);

    if (ptsInput) ptsInput.addEventListener('input', updateControls);
    if (stepsInput) stepsInput.addEventListener('input', updateControls);
    if (scaleSelect) scaleSelect.addEventListener('change', updateControls);
  }

  public setParams(params: Partial<ExtendedOrbitalParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    this.render();
  }

  public getParams(): ExtendedOrbitalParams {
    return this.currentParams;
  }
}


import { OrbitalParams } from '../core/wasm-bridge';
import { RenderMode } from '../render/orbital-renderer';
import { getStrings, onLanguageChange } from '../i18n';

export interface ExtendedOrbitalParams extends OrbitalParams {
  s: number;
  mode: RenderMode;
  quality: 'low' | 'medium' | 'high';
  elementZ?: number;
}

export class ControlPanel {
  private container: HTMLElement;
  private onChange: (params: ExtendedOrbitalParams) => void;

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
    elementZ: 1,
  };

  constructor(container: HTMLElement, onChange: (params: ExtendedOrbitalParams) => void) {
    this.container = container;
    this.onChange = onChange;
    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const strings = getStrings();

    this.container.innerHTML = `
      <div class="control-panel">
        <div class="panel-header">
          <h3>${strings.orbitalControls}</h3>
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

          <!-- Quality -->
          <div class="control-group">
            <label for="quality-select">${strings.quality}:</label>
            <select id="quality-select">
              <option value="low" ${this.currentParams.quality === 'low' ? 'selected' : ''}>${strings.qualityLow}</option>
              <option value="medium" ${this.currentParams.quality === 'medium' ? 'selected' : ''}>${strings.qualityMedium}</option>
              <option value="high" ${this.currentParams.quality === 'high' ? 'selected' : ''}>${strings.qualityHigh}</option>
            </select>
          </div>

          <!-- Effective Nuclear Charge Z_eff -->
          <div class="control-group">
            <label for="zeff-input">${strings.zEffCharge}: <span id="zeff-val">${this.currentParams.zEff.toFixed(2)}</span></label>
            <input type="range" id="zeff-input" min="1" max="10" value="${this.currentParams.zEff}" step="0.1" />
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
    const zeffInput = this.container.querySelector('#zeff-input') as HTMLInputElement;

    const nVal = this.container.querySelector('#n-val') as HTMLElement;
    const lVal = this.container.querySelector('#l-val') as HTMLElement;
    const mVal = this.container.querySelector('#m-val') as HTMLElement;
    const zeffVal = this.container.querySelector('#zeff-val') as HTMLElement;

    const updateControls = () => {
      const n = parseInt(nInput.value, 10);
      nVal.textContent = String(n);

      // Clamp l to [0, n-1]
      lInput.max = String(n - 1);
      let l = parseInt(lInput.value, 10);
      if (l >= n) {
        l = n - 1;
        lInput.value = String(l);
      }
      lVal.textContent = String(l);

      // Clamp m to [-l, l]
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
      const quality = qualitySelect.value as 'low' | 'medium' | 'high';
      const pointCount = quality === 'low' ? 20000 : quality === 'high' ? 150000 : 50000;
      const zEff = parseFloat(zeffInput.value);
      zeffVal.textContent = zEff.toFixed(2);

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
    zeffInput.addEventListener('input', updateControls);
  }

  public setParams(params: Partial<ExtendedOrbitalParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    this.render();
  }

  public getParams(): ExtendedOrbitalParams {
    return this.currentParams;
  }
}

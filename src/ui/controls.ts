import { OrbitalParams } from '../core/wasm-bridge';
import { RenderMode, QualityPreset, ColorPalette } from '../render/orbital-renderer';
import { getStrings, onLanguageChange, I18nStrings, ConceptExplanation } from '../i18n';
import { ExplanationModal } from './info-modal';
import { OrbitalPhysicsPanel } from './orbital-physics-panel';
import { icon } from './icons';

export interface ExtendedOrbitalParams extends OrbitalParams {
  s: number;
  mode: RenderMode;
  quality: QualityPreset;
  raymarchingSteps: number;
  resolutionScale: number;
  colorPalette: ColorPalette;
  contrast: number;
}

export class ControlPanel {
  private container: HTMLElement;
  private onChange: (params: ExtendedOrbitalParams) => void;
  private onExportClick?: () => void;
  private physicsPanel: OrbitalPhysicsPanel | null = null;

  private isCollapsed: boolean = false;
  private openSections: Record<string, boolean> = {
    quantum: true,
    nuclear: true,
    render: true,
  };

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
    contrast: 0.0,
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
      <div class="mobile-drawer-backdrop" id="controls-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button class="mobile-float-btn" id="btn-show-controls" title="${strings.orbitalControls}" aria-label="${strings.orbitalControls}" aria-expanded="false" aria-controls="controls-panel">
          <span class="btn-icon">${icon('sliders')}</span>
          <span class="btn-label">${strings.quantumSection}</span>
        </button>
        <button class="mobile-float-btn" id="btn-show-physics" title="${strings.physicsPanelTitle}" aria-label="${strings.physicsPanelTitle}" aria-expanded="false" aria-controls="orbital-physics-panel">
          <span class="btn-icon">${icon('chart')}</span>
          <span class="btn-label">${strings.physicsPanelTitle}</span>
        </button>
      </div>

      <!-- Dock Handle / Expand Pill when Left Panel is Collapsed on Desktop -->
      <button class="dock-tab-pill dock-left-pill ${this.isCollapsed ? 'visible' : ''}" id="btn-expand-controls" title="${strings.expandPanel}" aria-label="${strings.expandPanel}" aria-expanded="${!this.isCollapsed}" aria-controls="controls-panel">
        ${icon('sliders')}
        <span>${strings.quantumSection}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="control-panel ${this.isCollapsed ? 'collapsed' : ''}" id="controls-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header">
          <div class="panel-title-group">
            <span class="panel-header-icon">${icon('atom')}</span>
            <h3>${strings.orbitalControls}</h3>
          </div>
          <div class="panel-header-actions">
            <button class="btn-export-hdr" id="btn-open-export" title="${strings.exportImage}">
              ${icon('camera')}
              <span>${strings.exportImage}</span>
            </button>
            <button class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-controls" title="${strings.collapsePanel}" aria-label="${strings.collapsePanel}" aria-expanded="${!this.isCollapsed}" aria-controls="controls-panel">
              ${icon('chevron-left')}
            </button>
            <button class="panel-close-btn mobile-only" id="btn-close-controls" aria-label="Close">
              ${icon('close')}
            </button>
          </div>
        </div>

        <div class="control-accordion-container">
          <!-- SECTION 1: Quantum Parameters -->
          <div class="control-accordion-section ${this.openSections.quantum ? 'open' : ''}" data-section="quantum">
            <button type="button" class="accordion-header" id="accordion-header-quantum" data-toggle="quantum" aria-expanded="${this.openSections.quantum ? 'true' : 'false'}" aria-controls="accordion-body-quantum">
              <span class="accordion-title">
                ${icon('atom')}
                <span>${strings.quantumSection}</span>
              </span>
              <span class="accordion-chevron">${icon('chevron-down')}</span>
            </button>

            <div class="accordion-body" id="accordion-body-quantum" role="region" aria-labelledby="accordion-header-quantum">
              <div class="control-grid">
                <!-- Quantum Number n -->
                <div class="control-group">
                  <label for="n-select">
                    <span>${strings.principalQuantum}: <span id="n-val" class="val-badge">${this.currentParams.n}</span></span>
                    <button class="btn-info-icon" data-explain="explainN" aria-label="Info">${icon('info')}</button>
                  </label>
                  <input type="range" id="n-select" min="1" max="7" value="${this.currentParams.n}" step="1" />
                </div>

                <!-- Quantum Number l -->
                <div class="control-group">
                  <label for="l-select">
                    <span>${strings.azimuthalQuantum}: <span id="l-val" class="val-badge">${this.currentParams.l}</span></span>
                    <button class="btn-info-icon" data-explain="explainL" aria-label="Info">${icon('info')}</button>
                  </label>
                  <input type="range" id="l-select" min="0" max="${this.currentParams.n - 1}" value="${this.currentParams.l}" step="1" />
                </div>

                <!-- Quantum Number m -->
                <div class="control-group">
                  <label for="m-select">
                    <span>${strings.magneticQuantum}: <span id="m-val" class="val-badge">${this.currentParams.m}</span></span>
                    <button class="btn-info-icon" data-explain="explainM" aria-label="Info">${icon('info')}</button>
                  </label>
                  <input type="range" id="m-select" min="${-this.currentParams.l}" max="${this.currentParams.l}" value="${this.currentParams.m}" step="1" />
                </div>

                <!-- Spin s -->
                <div class="control-group">
                  <label for="spin-select">
                    <span>${strings.spinQuantum}:</span>
                    <button class="btn-info-icon" data-explain="explainS" aria-label="Info">${icon('info')}</button>
                  </label>
                  <select id="spin-select">
                    <option value="0.5" ${this.currentParams.s === 0.5 ? 'selected' : ''}>+1/2 (↑)</option>
                    <option value="-0.5" ${this.currentParams.s === -0.5 ? 'selected' : ''}>-1/2 (↓)</option>
                  </select>
                </div>

                <!-- Orbital Type (Real vs Pure) -->
                <div class="control-group">
                  <label for="type-select">
                    <span>${strings.orbitalType}:</span>
                    <button class="btn-info-icon" data-explain="explainOrbitalType" aria-label="Info">${icon('info')}</button>
                  </label>
                  <select id="type-select">
                    <option value="real" ${this.currentParams.useRealOrbital ? 'selected' : ''}>${strings.modeRealOrbital}</option>
                    <option value="eigen" ${!this.currentParams.useRealOrbital ? 'selected' : ''}>${strings.modeEigenstate}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 2: Nuclear Physics & Atom -->
          <div class="control-accordion-section ${this.openSections.nuclear ? 'open' : ''}" data-section="nuclear">
            <button type="button" class="accordion-header" id="accordion-header-nuclear" data-toggle="nuclear" aria-expanded="${this.openSections.nuclear ? 'true' : 'false'}" aria-controls="accordion-body-nuclear">
              <span class="accordion-title">
                ${icon('chart')}
                <span>${strings.nuclearSection}</span>
              </span>
              <span class="accordion-chevron">${icon('chevron-down')}</span>
            </button>

            <div class="accordion-body" id="accordion-body-nuclear" role="region" aria-labelledby="accordion-header-nuclear">
              <div class="control-grid">
                <!-- Effective Nuclear Charge Z_eff -->
                <div class="control-group">
                  <label for="zeff-input">
                    <span>${strings.zEffCharge}: <span id="zeff-val" class="val-badge">${this.currentParams.zEff.toFixed(2)}</span></span>
                    <button class="btn-info-icon" data-explain="explainZeff" aria-label="Info">${icon('info')}</button>
                  </label>
                  <input type="range" id="zeff-input" min="0.1" max="118" value="${this.currentParams.zEff}" step="0.1" />
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 3: Rendering & Quality -->
          <div class="control-accordion-section ${this.openSections.render ? 'open' : ''}" data-section="render">
            <button type="button" class="accordion-header" id="accordion-header-render" data-toggle="render" aria-expanded="${this.openSections.render ? 'true' : 'false'}" aria-controls="accordion-body-render">
              <span class="accordion-title">
                ${icon('sliders')}
                <span>${strings.renderSection}</span>
              </span>
              <span class="accordion-chevron">${icon('chevron-down')}</span>
            </button>

            <div class="accordion-body" id="accordion-body-render" role="region" aria-labelledby="accordion-header-render">
              <div class="control-grid">
                <!-- Render Mode -->
                <div class="control-group">
                  <label for="mode-select">
                    <span>${strings.mode}:</span>
                    <button class="btn-info-icon" data-explain="explainMode" aria-label="Info">${icon('info')}</button>
                  </label>
                  <select id="mode-select">
                    <option value="points" ${this.currentParams.mode === 'points' ? 'selected' : ''}>${strings.modePoints}</option>
                    <option value="isosurface" ${this.currentParams.mode === 'isosurface' ? 'selected' : ''}>${strings.modeIsosurface}</option>
                    <option value="raymarching" ${this.currentParams.mode === 'raymarching' ? 'selected' : ''}>${strings.modeRaymarching}</option>
                  </select>
                </div>

                <!-- Quality Preset -->
                <div class="control-group">
                  <label for="quality-select">
                    <span>${strings.quality}:</span>
                    <button class="btn-info-icon" data-explain="explainQuality" aria-label="Info">${icon('info')}</button>
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
                    <button class="btn-info-icon" data-explain="explainPalette" aria-label="Info">${icon('info')}</button>
                  </label>
                  <select id="palette-select">
                    <option value="default" ${this.currentParams.colorPalette === 'default' ? 'selected' : ''}>${strings.paletteDefault}</option>
                    <option value="fire" ${this.currentParams.colorPalette === 'fire' ? 'selected' : ''}>${strings.paletteFire}</option>
                    <option value="emerald" ${this.currentParams.colorPalette === 'emerald' ? 'selected' : ''}>${strings.paletteEmerald}</option>
                    <option value="spectrum" ${this.currentParams.colorPalette === 'spectrum' ? 'selected' : ''}>${strings.paletteSpectrum}</option>
                  </select>
                </div>

                <!-- Diffuse Cloud Contrast -->
                <div class="control-group">
                  <label for="contrast-input">
                    <span>${strings.contrastControl}: <span id="contrast-val" class="val-badge">${this.currentParams.contrast}</span></span>
                    <button class="btn-info-icon" data-explain="explainContrast" aria-label="Info">${icon('info')}</button>
                  </label>
                  <input type="range" id="contrast-input" min="0" max="100" value="${this.currentParams.contrast}" step="1" />
                </div>

                <!-- Custom Fine-Tuning Controls (Visible when quality=custom) -->
                <div class="custom-tuning-panel ${isCustom ? '' : 'hidden'}" id="custom-tuning">
                  <div class="control-group">
                    <label for="pts-input">${strings.pointCount}: <span id="pts-val" class="val-badge">${this.currentParams.pointCount.toLocaleString()}</span></label>
                    <input type="range" id="pts-input" min="10000" max="2500000" value="${this.currentParams.pointCount}" step="10000" />
                  </div>

                  <div class="control-group">
                    <label for="steps-input">${strings.raymarchingSteps}: <span id="steps-val" class="val-badge">${this.currentParams.raymarchingSteps}</span></label>
                    <input type="range" id="steps-input" min="32" max="512" value="${this.currentParams.raymarchingSteps}" step="16" />
                  </div>

                  <div class="control-group">
                    <label for="scale-select">${strings.superSampling}:</label>
                    <select id="scale-select">
                      <option value="1.0" ${this.currentParams.resolutionScale === 1.0 ? 'selected' : ''}>${strings.scaleNative}</option>
                      <option value="1.5" ${this.currentParams.resolutionScale === 1.5 ? 'selected' : ''}>${strings.scaleQHD}</option>
                      <option value="2.0" ${this.currentParams.resolutionScale === 2.0 ? 'selected' : ''}>${strings.scale4K}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="physics-panel-container"></div>
    `;

    if (this.physicsPanel) {
      this.physicsPanel.destroy();
    }

    const physicsContainer = this.container.querySelector('.physics-panel-container') as HTMLElement;
    this.physicsPanel = new OrbitalPhysicsPanel(physicsContainer, this.currentParams);

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const strings = getStrings();

    const controlPanel = this.container.querySelector('.control-panel') as HTMLElement;
    const physicsContainer = this.container.querySelector('.physics-panel-container') as HTMLElement;
    const backdrop = this.container.querySelector('#controls-drawer-backdrop') as HTMLElement;

    const btnShowControls = this.container.querySelector('#btn-show-controls') as HTMLElement;
    const btnShowPhysics = this.container.querySelector('#btn-show-physics') as HTMLElement;
    const btnCloseControls = this.container.querySelector('#btn-close-controls') as HTMLElement;

    const btnCollapse = this.container.querySelector('#btn-collapse-controls') as HTMLElement;
    const btnExpand = this.container.querySelector('#btn-expand-controls') as HTMLElement;

    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        this.isCollapsed = true;
        controlPanel.classList.add('collapsed');
        btnCollapse.setAttribute('aria-expanded', 'false');
        if (btnExpand) {
          btnExpand.classList.add('visible');
          btnExpand.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        this.isCollapsed = false;
        controlPanel.classList.remove('collapsed');
        btnCollapse?.setAttribute('aria-expanded', 'true');
        btnExpand.classList.remove('visible');
        btnExpand.setAttribute('aria-expanded', 'true');
      });
    }

    // Accordion Toggle Listeners
    const accordionHeaders = this.container.querySelectorAll('.accordion-header');
    accordionHeaders.forEach((header) => {
      header.addEventListener('click', () => {
        const sectionName = header.getAttribute('data-toggle');
        if (!sectionName) return;
        const sectionEl = this.container.querySelector(`.control-accordion-section[data-section="${sectionName}"]`);
        if (sectionEl) {
          const isOpen = sectionEl.classList.toggle('open');
          this.openSections[sectionName] = isOpen;
          header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
      });
    });

    const closeAllDrawers = () => {
      controlPanel.classList.remove('mobile-open');
      physicsContainer.classList.remove('mobile-open');
      backdrop.classList.remove('active');
      btnShowControls.classList.remove('active');
      btnShowPhysics.classList.remove('active');
      btnShowControls.setAttribute('aria-expanded', 'false');
      btnShowPhysics.setAttribute('aria-expanded', 'false');
    };

    btnShowControls.addEventListener('click', () => {
      const isOpen = controlPanel.classList.contains('mobile-open');
      closeAllDrawers();
      if (!isOpen) {
        controlPanel.classList.add('mobile-open');
        backdrop.classList.add('active');
        btnShowControls.classList.add('active');
        btnShowControls.setAttribute('aria-expanded', 'true');
      }
    });

    btnShowPhysics.addEventListener('click', () => {
      const isOpen = physicsContainer.classList.contains('mobile-open');
      closeAllDrawers();
      if (!isOpen) {
        physicsContainer.classList.add('mobile-open');
        backdrop.classList.add('active');
        btnShowPhysics.classList.add('active');
        btnShowPhysics.setAttribute('aria-expanded', 'true');
      }
    });

    btnCloseControls.addEventListener('click', closeAllDrawers);
    backdrop.addEventListener('click', closeAllDrawers);

    const nInput = this.container.querySelector('#n-select') as HTMLInputElement;
    const lInput = this.container.querySelector('#l-select') as HTMLInputElement;
    const mInput = this.container.querySelector('#m-select') as HTMLInputElement;
    const spinSelect = this.container.querySelector('#spin-select') as HTMLSelectElement;
    const modeSelect = this.container.querySelector('#mode-select') as HTMLSelectElement;
    const typeSelect = this.container.querySelector('#type-select') as HTMLSelectElement;
    const qualitySelect = this.container.querySelector('#quality-select') as HTMLSelectElement;
    const paletteSelect = this.container.querySelector('#palette-select') as HTMLSelectElement;
    const zeffInput = this.container.querySelector('#zeff-input') as HTMLInputElement;
    const contrastInput = this.container.querySelector('#contrast-input') as HTMLInputElement;

    const exportBtn = this.container.querySelector('#btn-open-export') as HTMLElement;

    const customPanel = this.container.querySelector('#custom-tuning') as HTMLElement;
    const ptsInput = this.container.querySelector('#pts-input') as HTMLInputElement;
    const stepsInput = this.container.querySelector('#steps-input') as HTMLInputElement;
    const scaleSelect = this.container.querySelector('#scale-select') as HTMLSelectElement;

    const nVal = this.container.querySelector('#n-val') as HTMLElement;
    const lVal = this.container.querySelector('#l-val') as HTMLElement;
    const mVal = this.container.querySelector('#m-val') as HTMLElement;
    const zeffVal = this.container.querySelector('#zeff-val') as HTMLElement;
    const contrastVal = this.container.querySelector('#contrast-val') as HTMLElement;
    const ptsVal = this.container.querySelector('#pts-val') as HTMLElement;
    const stepsVal = this.container.querySelector('#steps-val') as HTMLElement;

    exportBtn.addEventListener('click', () => {
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
      const contrast = parseFloat(contrastInput.value);
      contrastVal.textContent = String(Math.round(contrast));

      const qualitySettings = this.resolveQualityPreset(
        quality,
        customPanel,
        ptsInput,
        stepsInput,
        scaleSelect,
        ptsVal,
        stepsVal
      );

      ptsInput.value = String(qualitySettings.pointCount);
      stepsInput.value = String(qualitySettings.raymarchingSteps);
      scaleSelect.value = String(qualitySettings.resolutionScale);

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
        contrast,
      };

      this.physicsPanel!.updateParams(this.currentParams);
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
    contrastInput.addEventListener('input', updateControls);

    ptsInput.addEventListener('input', updateControls);
    stepsInput.addEventListener('input', updateControls);
    scaleSelect.addEventListener('change', updateControls);
  }

  private resolveQualityPreset(
    quality: QualityPreset,
    customPanel: HTMLElement,
    ptsInput: HTMLInputElement,
    stepsInput: HTMLInputElement,
    scaleSelect: HTMLSelectElement,
    ptsVal: HTMLElement,
    stepsVal: HTMLElement
  ): { pointCount: number; raymarchingSteps: number; resolutionScale: number } {
    if (quality === 'custom') {
      customPanel.classList.remove('hidden');
      const pointCount = parseInt(ptsInput.value, 10);
      const raymarchingSteps = parseInt(stepsInput.value, 10);
      const resolutionScale = parseFloat(scaleSelect.value);

      ptsVal.textContent = pointCount.toLocaleString();
      stepsVal.textContent = String(raymarchingSteps);

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

    return presets[quality];
  }

  public setParams(params: Partial<ExtendedOrbitalParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    
    this.currentParams.n = Math.max(1, Math.min(7, Math.floor(this.currentParams.n)));
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
}

import { OrbitalParams } from '../core/wasm-bridge';
import { RenderMode, QualityPreset, ColorPalette } from '../render/orbital-renderer';
import { getStrings, onLanguageChange, I18nStrings } from '../i18n';
import { ExplanationModal } from './info-modal';
import { OrbitalPhysicsPanel } from './orbital-physics-panel';
import { escapeHtml } from './modal-utils';
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

function renderOption(value: string, label: string, selectedValue: string): string {
  return `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`;
}

const MODE_OPTIONS: { value: RenderMode; labelKey: keyof I18nStrings }[] = [
  { value: 'points', labelKey: 'modePoints' },
  { value: 'isosurface', labelKey: 'modeIsosurface' },
  { value: 'raymarching', labelKey: 'modeRaymarching' },
];

const QUALITY_OPTIONS: { value: QualityPreset; labelKey: keyof I18nStrings }[] = [
  { value: 'low', labelKey: 'qualityLow' },
  { value: 'medium', labelKey: 'qualityMedium' },
  { value: 'high', labelKey: 'qualityHigh' },
  { value: 'ultra', labelKey: 'qualityUltra' },
  { value: 'extreme', labelKey: 'qualityExtreme' },
  { value: 'custom', labelKey: 'qualityCustom' },
];

const PALETTE_OPTIONS: { value: ColorPalette; labelKey: keyof I18nStrings }[] = [
  { value: 'default', labelKey: 'paletteDefault' },
  { value: 'fire', labelKey: 'paletteFire' },
  { value: 'emerald', labelKey: 'paletteEmerald' },
  { value: 'spectrum', labelKey: 'paletteSpectrum' },
];

const SCALE_OPTIONS: { value: string; labelKey: keyof I18nStrings }[] = [
  { value: '1.0', labelKey: 'scaleNative' },
  { value: '1.5', labelKey: 'scaleQHD' },
  { value: '2.0', labelKey: 'scale4K' },
];

export class ControlPanel {
  private readonly container: HTMLElement;
  private readonly onChange: (params: ExtendedOrbitalParams) => void;
  private readonly onExportClick?: () => void;
  private physicsPanel: OrbitalPhysicsPanel | null = null;

  private isCollapsed: boolean = false;
  private readonly openSections: Record<string, boolean> = {
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
        <button type="button" class="mobile-float-btn" id="btn-show-controls" title="${escapeHtml(strings.orbitalControls)}" aria-label="${escapeHtml(strings.orbitalControls)}" aria-expanded="false" aria-controls="controls-panel">
          <span class="btn-icon">${icon('sliders')}</span>
          <span class="btn-label">${escapeHtml(strings.quantumSection)}</span>
        </button>
        <button type="button" class="mobile-float-btn" id="btn-show-physics" title="${escapeHtml(strings.physicsPanelTitle)}" aria-label="${escapeHtml(strings.physicsPanelTitle)}" aria-expanded="false" aria-controls="orbital-physics-panel">
          <span class="btn-icon">${icon('chart')}</span>
          <span class="btn-label">${escapeHtml(strings.physicsPanelTitle)}</span>
        </button>
      </div>

      <!-- Dock Handle / Expand Pill when Left Panel is Collapsed on Desktop -->
      <button type="button" class="dock-tab-pill dock-left-pill ${this.isCollapsed ? 'visible' : ''}" id="btn-expand-controls" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isCollapsed}" aria-controls="controls-panel">
        ${icon('sliders')}
        <span>${escapeHtml(strings.quantumSection)}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="control-panel ${this.isCollapsed ? 'collapsed' : ''}" id="controls-panel">
        <div class="mobile-drawer-handle"></div>
        ${this.renderHeader(strings)}

        <div class="control-accordion-container">
          ${this.renderQuantumSection(strings)}
          ${this.renderNuclearSection(strings)}
          ${this.renderRenderSection(strings, isCustom)}
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

  private renderHeader(strings: I18nStrings): string {
    return `
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('atom')}</span>
          <h3>${escapeHtml(strings.orbitalControls)}</h3>
        </div>
        <div class="panel-header-actions">
          <button type="button" class="btn-export-hdr" id="btn-open-export" title="${escapeHtml(strings.exportImage)}" aria-label="${escapeHtml(strings.exportImage)}">
            ${icon('camera')}
            <span>${escapeHtml(strings.exportImage)}</span>
          </button>
          <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-controls" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isCollapsed}" aria-controls="controls-panel">
            ${icon('chevron-left')}
          </button>
          <button type="button" class="panel-close-btn mobile-only" id="btn-close-controls" aria-label="${escapeHtml(strings.infoModalClose)}">
            ${icon('close')}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Renders a labelled control row. The info affordance lives outside the
   * `<label>` so the text node is not split by a button (which previously
   * produced the broken "Label ⓘ:" rendering).
   */
  private controlRow(opts: {
    id: string;
    label: string;
    valueId?: string;
    valueHtml?: string;
    explainKey?: string;
    control: string;
  }): string {
    const infoBtn = opts.explainKey
      ? `<button type="button" class="btn-info-icon" data-explain="${opts.explainKey}" aria-label="Info">${icon('info')}</button>`
      : '';
    const badge =
      opts.valueId && opts.valueHtml !== undefined
        ? `<span class="val-badge" id="${opts.valueId}">${opts.valueHtml}</span>`
        : '';
    return `
      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="${opts.id}">${escapeHtml(opts.label)}${badge}</label>
          ${infoBtn}
        </div>
        ${opts.control}
      </div>
    `;
  }

  private slider(id: string, min: number, max: number, value: number, step: number): string {
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    return `<input type="range" id="${id}" min="${min}" max="${max}" value="${value}" step="${step}" style="--fill: ${pct}%" />`;
  }

  private select(id: string, options: string): string {
    return `<select id="${id}">${options}</select>`;
  }

  private renderQuantumSection(strings: I18nStrings): string {
    const isOpen = this.openSections.quantum;
    const spinOptions =
      renderOption('0.5', '+1/2 (↑)', String(this.currentParams.s)) +
      renderOption('-0.5', '-1/2 (↓)', String(this.currentParams.s));

    const typeValue = this.currentParams.useRealOrbital ? 'real' : 'eigen';
    const typeOptions =
      renderOption('real', escapeHtml(strings.modeRealOrbital), typeValue) +
      renderOption('eigen', escapeHtml(strings.modeEigenstate), typeValue);

    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="quantum">
        <button type="button" class="accordion-header" id="accordion-header-quantum" data-toggle="quantum" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="accordion-body-quantum">
          <span class="accordion-title">
            ${icon('atom')}
            <span>${escapeHtml(strings.quantumSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>

        <div class="accordion-body" id="accordion-body-quantum" role="region" aria-labelledby="accordion-header-quantum">
          <div class="control-grid">
            ${this.controlRow({
              id: 'n-select',
              label: strings.principalQuantum,
              valueId: 'n-val',
              valueHtml: String(this.currentParams.n),
              explainKey: 'explainN',
              control: this.slider('n-select', 1, 7, this.currentParams.n, 1),
            })}
            ${this.controlRow({
              id: 'l-select',
              label: strings.azimuthalQuantum,
              valueId: 'l-val',
              valueHtml: String(this.currentParams.l),
              explainKey: 'explainL',
              control: this.slider('l-select', 0, this.currentParams.n - 1, this.currentParams.l, 1),
            })}
            ${this.controlRow({
              id: 'm-select',
              label: strings.magneticQuantum,
              valueId: 'm-val',
              valueHtml: String(this.currentParams.m),
              explainKey: 'explainM',
              control: this.slider('m-select', -this.currentParams.l, this.currentParams.l, this.currentParams.m, 1),
            })}
            ${this.controlRow({
              id: 'spin-select',
              label: strings.spinQuantum,
              explainKey: 'explainS',
              control: this.select('spin-select', spinOptions),
            })}
            ${this.controlRow({
              id: 'type-select',
              label: strings.orbitalType,
              explainKey: 'explainOrbitalType',
              control: this.select('type-select', typeOptions),
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderNuclearSection(strings: I18nStrings): string {
    const isOpen = this.openSections.nuclear;
    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="nuclear">
        <button type="button" class="accordion-header" id="accordion-header-nuclear" data-toggle="nuclear" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="accordion-body-nuclear">
          <span class="accordion-title">
            ${icon('chart')}
            <span>${escapeHtml(strings.nuclearSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>

        <div class="accordion-body" id="accordion-body-nuclear" role="region" aria-labelledby="accordion-header-nuclear">
          <div class="control-grid">
            ${this.controlRow({
              id: 'zeff-input',
              label: strings.zEffCharge,
              valueId: 'zeff-val',
              valueHtml: this.currentParams.zEff.toFixed(2),
              explainKey: 'explainZeff',
              control: this.slider('zeff-input', 0.1, 118, this.currentParams.zEff, 0.1),
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderRenderSection(strings: I18nStrings, isCustom: boolean): string {
    const isOpen = this.openSections.render;
    const modeOptions = MODE_OPTIONS.map((opt) =>
      renderOption(opt.value, escapeHtml(strings[opt.labelKey] as string), this.currentParams.mode)
    ).join('');
    const qualityOptions = QUALITY_OPTIONS.map((opt) =>
      renderOption(opt.value, escapeHtml(strings[opt.labelKey] as string), this.currentParams.quality)
    ).join('');
    const paletteOptions = PALETTE_OPTIONS.map((opt) =>
      renderOption(opt.value, escapeHtml(strings[opt.labelKey] as string), this.currentParams.colorPalette)
    ).join('');

    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="render">
        <button type="button" class="accordion-header" id="accordion-header-render" data-toggle="render" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="accordion-body-render">
          <span class="accordion-title">
            ${icon('sliders')}
            <span>${escapeHtml(strings.renderSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>

        <div class="accordion-body" id="accordion-body-render" role="region" aria-labelledby="accordion-header-render">
          <div class="control-grid">
            ${this.controlRow({
              id: 'mode-select',
              label: strings.mode,
              explainKey: 'explainMode',
              control: this.select('mode-select', modeOptions),
            })}
            ${this.controlRow({
              id: 'quality-select',
              label: strings.quality,
              explainKey: 'explainQuality',
              control: this.select('quality-select', qualityOptions),
            })}
            ${this.controlRow({
              id: 'palette-select',
              label: strings.colorPalette,
              explainKey: 'explainPalette',
              control: this.select('palette-select', paletteOptions),
            })}
            ${this.controlRow({
              id: 'contrast-input',
              label: strings.contrastControl,
              valueId: 'contrast-val',
              valueHtml: String(this.currentParams.contrast),
              explainKey: 'explainContrast',
              control: this.slider('contrast-input', 0, 100, this.currentParams.contrast, 1),
            })}

            ${this.renderCustomTuningPanel(strings, isCustom)}
          </div>
        </div>
      </div>
    `;
  }

  private renderCustomTuningPanel(strings: I18nStrings, isCustom: boolean): string {
    const hiddenClass = isCustom ? '' : 'hidden';
    const scaleOptions = SCALE_OPTIONS.map((opt) =>
      renderOption(opt.value, escapeHtml(strings[opt.labelKey] as string), String(this.currentParams.resolutionScale))
    ).join('');

    return `
      <div class="custom-tuning-panel ${hiddenClass}" id="custom-tuning">
        ${this.controlRow({
          id: 'pts-input',
          label: strings.pointCount,
          valueId: 'pts-val',
          valueHtml: this.currentParams.pointCount.toLocaleString(),
          control: this.slider('pts-input', 10000, 2500000, this.currentParams.pointCount, 10000),
        })}
        ${this.controlRow({
          id: 'steps-input',
          label: strings.raymarchingSteps,
          valueId: 'steps-val',
          valueHtml: String(this.currentParams.raymarchingSteps),
          control: this.slider('steps-input', 32, 512, this.currentParams.raymarchingSteps, 16),
        })}
        ${this.controlRow({
          id: 'scale-select',
          label: strings.superSampling,
          control: this.select('scale-select', scaleOptions),
        })}
      </div>
    `;
  }

  private attachEventListeners(): void {
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
    const accordionHeaders = this.container.querySelectorAll<HTMLElement>('.accordion-header');
    accordionHeaders.forEach((header) => {
      header.addEventListener('click', () => {
        const sectionName = header.dataset.toggle;
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

    const openDrawer = (panel: HTMLElement, trigger: HTMLElement) => {
      closeAllDrawers();
      panel.classList.add('mobile-open');
      backdrop.classList.add('active');
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
    };

    btnShowControls.addEventListener('click', () => {
      if (controlPanel.classList.contains('mobile-open')) {
        closeAllDrawers();
      } else {
        openDrawer(controlPanel, btnShowControls);
        controlPanel.querySelector<HTMLElement>('#btn-close-controls')?.focus();
      }
    });

    btnShowPhysics.addEventListener('click', () => {
      if (physicsContainer.classList.contains('mobile-open')) {
        closeAllDrawers();
      } else {
        openDrawer(physicsContainer, btnShowPhysics);
        physicsContainer.querySelector<HTMLElement>('#btn-close-physics')?.focus();
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

    ExplanationModal.attachInfoButtons(this.container);

    /** Keeps the range track fill in sync with the current value. */
    const syncRangeFill = (input: HTMLInputElement) => {
      const min = Number.parseFloat(input.min);
      const max = Number.parseFloat(input.max);
      const value = Number.parseFloat(input.value);
      if (Number.isNaN(min) || Number.isNaN(max) || max === min) return;
      const pct = ((value - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
    };

    const allRanges = this.container.querySelectorAll<HTMLInputElement>('input[type="range"]');
    allRanges.forEach(syncRangeFill);

    const updateControls = () => {
      const n = Number.parseInt(nInput.value, 10);
      nVal.textContent = String(n);

      lInput.max = String(n - 1);
      let l = Number.parseInt(lInput.value, 10);
      if (l >= n) {
        l = n - 1;
        lInput.value = String(l);
      }
      lVal.textContent = String(l);

      mInput.min = String(-l);
      mInput.max = String(l);
      let m = Number.parseInt(mInput.value, 10);
      if (m < -l) m = -l;
      if (m > l) m = l;
      mInput.value = String(m);
      mVal.textContent = String(m);

      const s = Number.parseFloat(spinSelect.value);
      const mode = modeSelect.value as RenderMode;
      const useRealOrbital = typeSelect.value === 'real';
      const quality = qualitySelect.value as QualityPreset;
      const colorPalette = paletteSelect.value as ColorPalette;
      const zEff = Number.parseFloat(zeffInput.value);
      zeffVal.textContent = zEff.toFixed(2);
      const contrast = Number.parseFloat(contrastInput.value);
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

      // m/l bounds change as n changes, so the fills must be recomputed.
      allRanges.forEach(syncRangeFill);
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
      const pointCount = Number.parseInt(ptsInput.value, 10);
      const raymarchingSteps = Number.parseInt(stepsInput.value, 10);
      const resolutionScale = Number.parseFloat(scaleSelect.value);

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

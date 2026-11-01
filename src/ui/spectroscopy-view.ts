import { energyLevelEv } from '../core/physics-constants';
import {
  ION_PRESETS,
  QuantumState,
  SPECTRAL_PRESETS,
  SeriesLine,
  SpectralBand,
  SpectralLinePreset,
  TransitionMetrics,
  TransitionMode,
  clampQuantumState,
  computeSeriesLines,
  computeTransitionMetrics,
  wavelengthToRgb,
} from '../core/spectroscopy';
import { I18nStrings, getStrings, onLanguageChange } from '../i18n';
import { SpectroscopyRenderer } from '../render/spectroscopy-renderer';
import { icon } from './icons';
import { ExplanationModal } from './info-modal';
import { escapeHtml } from './modal-utils';
import { DischargeSpectrumStrip, EnergyLevelDiagram } from './spectroscopy-charts';

const SUBSHELL_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i'] as const;
const HC_EV_NM = 1239.841984;

const SUPERSCRIPTS: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function syncRangeFill(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const value = Number.parseFloat(input.value);
  if (Number.isNaN(min) || Number.isNaN(max)) return;
  if (max === min) {
    input.style.setProperty('--fill', '0%');
    return;
  }
  const pct = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
}

function presetSwatchHex(preset: SpectralLinePreset): string {
  if (preset.id === 'forbidden-2s-1s') return '#64748b';
  const deltaE = Math.abs(
    energyLevelEv(preset.upper.n, preset.zEff) - energyLevelEv(preset.lower.n, preset.zEff),
  );
  return wavelengthToRgb(HC_EV_NM / deltaE).hex;
}

function formatSubshellState(state: QuantumState): string {
  const letter = SUBSHELL_LETTERS[state.l];
  const mStr = state.m > 0 ? `+${state.m}` : `${state.m}`;
  return `${state.n}${letter} (m=${mStr})`;
}

function formatWavelengthNm(nm: number): string {
  if (nm < 100) return nm.toFixed(2);
  if (nm < 1000) return nm.toFixed(1);
  return nm.toFixed(0);
}

function formatFrequencyThz(thz: number): string {
  if (thz >= 1000) return `${thz.toFixed(0)} THz`;
  if (thz >= 10) return `${thz.toFixed(1)} THz`;
  return `${thz.toFixed(2)} THz`;
}

function formatEinsteinA(a: number): string {
  if (a <= 0) return '0 s⁻¹';
  const exp = Math.floor(Math.log10(a));
  const mantissa = a / Math.pow(10, exp);
  const expStr = String(exp)
    .split('')
    .map((ch) => SUPERSCRIPTS[ch])
    .join('');
  return `${mantissa.toFixed(2)} × 10${expStr} s⁻¹`;
}

function formatLifetime(lifetimeNs: number | null, metastableLabel: string): string {
  if (lifetimeNs === null) return metastableLabel;
  if (lifetimeNs < 1) return `${(lifetimeNs * 1000).toFixed(1)} ps`;
  if (lifetimeNs < 1000) return `${lifetimeNs.toFixed(2)} ns`;
  return `${(lifetimeNs / 1000).toFixed(2)} µs`;
}

function resolveSeriesName(seriesIndex: number, strings: I18nStrings): string {
  const seriesByLowerN: Record<number, string> = {
    1: strings.seriesLyman,
    2: strings.seriesBalmer,
    3: strings.seriesPaschen,
    4: strings.seriesBrackett,
    5: strings.seriesPfund,
    6: strings.seriesHumphreys,
  };
  return seriesByLowerN[seriesIndex];
}

function resolveBandLabel(band: SpectralBand, strings: I18nStrings): string {
  if (band === 'uv') return strings.bandUV;
  if (band === 'ir') return strings.bandIR;
  return strings.bandVisible;
}

function resolveRuleBadgeText(metrics: TransitionMetrics, strings: I18nStrings): string {
  if (metrics.isAllowed) return strings.transitionAllowed;
  if (metrics.forbiddenReason === 'delta_l_zero') {
    return `${strings.transitionForbidden} (Δl = 0)`;
  }
  if (metrics.forbiddenReason === 'delta_l_multi') {
    return `${strings.transitionForbidden} (|Δl| ≠ 1)`;
  }
  return `${strings.transitionForbidden} (|Δm| > 1)`;
}

function isDipoleValidPair(lower: QuantumState, upper: QuantumState): boolean {
  const lowerValid = lower.l >= 0 && lower.l < lower.n && Math.abs(lower.m) <= lower.l;
  const upperValid = upper.l >= 0 && upper.l < upper.n && Math.abs(upper.m) <= upper.l;
  const dipoleAllowed = Math.abs(upper.l - lower.l) === 1 && Math.abs(upper.m - lower.m) <= 1;
  return lowerValid && upperValid && dipoleAllowed;
}

export class SpectroscopyView {
  public onStateChange?: () => void;

  private readonly container: HTMLElement;
  private readonly renderer: SpectroscopyRenderer;
  private readonly onExportClick: () => void;
  private readonly onScaleTextChange: (text: string) => void;

  private upper: QuantumState = { n: 3, l: 2, m: 0 };
  private lower: QuantumState = { n: 2, l: 1, m: 0 };
  private zEff = 1.0;
  private mode: TransitionMode = 'emission';
  private speed = 1.0;

  private isLeftCollapsed = false;
  private isRightCollapsed = false;
  private readonly openSections: Record<string, boolean> = {
    presets: true,
    upper: true,
    lower: true,
    ion: true,
    antenna: true,
  };

  private energyDiagram: EnergyLevelDiagram | null = null;
  private spectrumStrip: DischargeSpectrumStrip | null = null;
  private latestMetrics: TransitionMetrics | null = null;
  private latestSeriesLines: SeriesLine[] = [];
  private lastScaleText = '';
  private hasLoadedOnce = false;
  private metricsToken = 0;

  constructor(
    container: HTMLElement,
    renderer: SpectroscopyRenderer,
    onExportClick: () => void,
    onScaleTextChange: (text: string) => void,
  ) {
    this.container = container;
    this.renderer = renderer;
    this.onExportClick = onExportClick;
    this.onScaleTextChange = onScaleTextChange;

    this.render();
    onLanguageChange(() => this.handleLanguageChange());
  }

  public activate(): void {
    if (!this.hasLoadedOnce) {
      this.hasLoadedOnce = true;
      void this.refreshTransition();
      return;
    }
    if (this.lastScaleText) {
      this.onScaleTextChange(this.lastScaleText);
    }
  }

  public getDeepLinkParams(): { el: number; n1: number; n2: number } {
    return {
      el: Math.max(1, Math.min(118, Math.round(this.zEff))),
      n1: this.lower.n,
      n2: this.upper.n,
    };
  }

  public applyDeepLinkParams(opts: { el?: number; n1?: number; n2?: number }): void {
    if (opts.el !== undefined) {
      this.zEff = Math.max(0.5, Math.min(118, opts.el));
    }

    let n1 = opts.n1 !== undefined ? Math.max(1, Math.min(6, Math.trunc(opts.n1))) : this.lower.n;
    let n2 = opts.n2 !== undefined ? Math.max(2, Math.min(7, Math.trunc(opts.n2))) : this.upper.n;

    if (n1 >= n2) {
      if (opts.n1 !== undefined && opts.n2 === undefined) {
        n2 = Math.min(7, n1 + 1);
      } else {
        n1 = Math.max(1, n2 - 1);
      }
    }

    this.lower = { ...this.lower, n: n1 };
    this.upper = { ...this.upper, n: n2 };

    if (!isDipoleValidPair(this.lower, this.upper)) {
      this.lower = { n: n1, l: 0, m: 0 };
      this.upper = { n: n2, l: 1, m: 0 };
    }

    this.syncControlsToDom();
    this.hasLoadedOnce = true;
    void this.refreshTransition();
  }

  private handleLanguageChange(): void {
    this.render();
    if (this.latestMetrics) {
      this.applyMetricsToDom(this.latestMetrics, this.latestSeriesLines);
    }
  }

  private render(): void {
    const strings = getStrings();

    if (this.energyDiagram) {
      this.energyDiagram.destroy();
      this.energyDiagram = null;
    }
    if (this.spectrumStrip) {
      this.spectrumStrip.destroy();
      this.spectrumStrip = null;
    }

    this.container.innerHTML = `
      <div class="mobile-drawer-backdrop" id="spec-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button type="button" class="mobile-float-btn" id="btn-show-spec-controls" title="${escapeHtml(strings.spectroscopyTitle)}" aria-label="${escapeHtml(strings.spectroscopyTitle)}" aria-expanded="false" aria-controls="spec-controls-panel">
          <span class="btn-icon">${icon('sliders')}</span>
          <span class="btn-label">${escapeHtml(strings.spectroscopyTitle)}</span>
        </button>
        <button type="button" class="mobile-float-btn" id="btn-show-spec-physics" title="${escapeHtml(strings.spectroscopyAnalysisTitle)}" aria-label="${escapeHtml(strings.spectroscopyAnalysisTitle)}" aria-expanded="false" aria-controls="spec-physics-panel">
          <span class="btn-icon">${icon('chart')}</span>
          <span class="btn-label">${escapeHtml(strings.spectroscopyAnalysisTitle)}</span>
        </button>
      </div>

      ${this.renderLeftPanel(strings)}
      ${this.renderRightPanel(strings)}
    `;

    const energyHost = this.container.querySelector('#spec-energy-diagram') as HTMLElement;
    const stripHost = this.container.querySelector('#spec-spectrum-strip') as HTMLElement;

    this.energyDiagram = new EnergyLevelDiagram(energyHost, (n) => this.handleEnergyLevelSelect(n));
    this.spectrumStrip = new DischargeSpectrumStrip(stripHost, (nUpper) =>
      this.handleSeriesUpperSelect(nUpper),
    );

    this.attachEventListeners();
    this.syncControlsToDom();
  }

  private renderLeftPanel(strings: I18nStrings): string {
    const isEmission = this.mode === 'emission';
    return `
      <button type="button" class="dock-tab-pill dock-left-pill ${this.isLeftCollapsed ? 'visible' : ''}" id="btn-expand-spec-controls" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isLeftCollapsed}" aria-controls="spec-controls-panel">
        ${icon('spectrum')}
        <span>${escapeHtml(strings.spectroscopyTitle)}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="control-panel ${this.isLeftCollapsed ? 'collapsed' : ''}" id="spec-controls-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header">
          <div class="panel-title-group">
            <span class="panel-header-icon">${icon('spectrum')}</span>
            <h3>${escapeHtml(strings.spectroscopyTitle)}</h3>
          </div>
          <div class="panel-header-actions">
            <button type="button" class="btn-export-hdr" id="btn-spec-export" title="${escapeHtml(strings.exportImage)}" aria-label="${escapeHtml(strings.exportImage)}">
              ${icon('camera')}
              <span>${escapeHtml(strings.exportImage)}</span>
            </button>
            <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-spec-controls" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isLeftCollapsed}" aria-controls="spec-controls-panel">
              ${icon('chevron-left')}
            </button>
            <button type="button" class="panel-close-btn mobile-only" id="btn-close-spec-controls" aria-label="${escapeHtml(strings.infoModalClose)}">
              ${icon('close')}
            </button>
          </div>
        </div>

        <div class="molecule-view-actions spec-mode-actions">
          <button type="button" class="btn-action-toggle ${isEmission ? 'active' : ''}" id="btn-spec-emission" aria-pressed="${isEmission}">
            <span>${escapeHtml(strings.modeEmission)}</span>
          </button>
          <button type="button" class="btn-action-toggle ${!isEmission ? 'active' : ''}" id="btn-spec-absorption" aria-pressed="${!isEmission}">
            <span>${escapeHtml(strings.modeAbsorption)}</span>
          </button>
        </div>

        <div class="control-accordion-container">
          ${this.renderPresetsSection(strings)}
          ${this.renderQuantumSection('upper', strings.upperStateSection, 'n2', this.upper, 2, 7, strings)}
          ${this.renderQuantumSection('lower', strings.lowerStateSection, 'n1', this.lower, 1, 6, strings)}
          ${this.renderIonSection(strings)}
          ${this.renderAntennaSection(strings)}
        </div>
      </div>
    `;
  }

  private renderPresetsSection(strings: I18nStrings): string {
    const isOpen = this.openSections.presets;
    const buttonsHtml = SPECTRAL_PRESETS.map((preset) => {
      const label =
        preset.id === 'forbidden-2s-1s' ? strings.presetForbidden2s1s : preset.shortLabel;
      const swatch = presetSwatchHex(preset);
      return `
        <button type="button" class="spec-preset-btn" data-preset-id="${preset.id}" aria-pressed="false">
          <span class="spec-swatch-dot" style="background-color: ${swatch};" aria-hidden="true"></span>
          <span class="spec-preset-label">${escapeHtml(label)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="presets">
        <button type="button" class="accordion-header" id="spec-acc-hdr-presets" data-toggle="presets" aria-expanded="${isOpen}" aria-controls="spec-acc-body-presets">
          <span class="accordion-title">
            ${icon('spectrum')}
            <span>${escapeHtml(strings.famousLinesSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>
        <div class="accordion-body" id="spec-acc-body-presets" role="region" aria-labelledby="spec-acc-hdr-presets">
          <div class="spec-presets-grid">
            ${buttonsHtml}
          </div>
        </div>
      </div>
    `;
  }

  private renderQuantumSection(
    sectionKey: 'upper' | 'lower',
    title: string,
    tierSuffix: 'n2' | 'n1',
    state: QuantumState,
    minN: number,
    maxN: number,
    strings: I18nStrings,
  ): string {
    const isOpen = this.openSections[sectionKey];
    const idx = tierSuffix === 'n2' ? '2' : '1';
    const subshellBadge = `${state.l} (${SUBSHELL_LETTERS[state.l]})`;

    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="${sectionKey}">
        <button type="button" class="accordion-header" id="spec-acc-hdr-${sectionKey}" data-toggle="${sectionKey}" aria-expanded="${isOpen}" aria-controls="spec-acc-body-${sectionKey}">
          <span class="accordion-title">
            ${icon('atom')}
            <span>${escapeHtml(title)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>
        <div class="accordion-body" id="spec-acc-body-${sectionKey}" role="region" aria-labelledby="spec-acc-hdr-${sectionKey}">
          <div class="control-grid">
            ${this.controlRow({
              id: `spec-n${idx}`,
              label: strings.principalQuantum,
              valueId: `spec-n${idx}-val`,
              valueText: String(state.n),
              explainKey: 'explainN',
              control: this.slider(`spec-n${idx}`, minN, maxN, state.n, 1),
            })}
            ${this.controlRow({
              id: `spec-l${idx}`,
              label: strings.azimuthalQuantum,
              valueId: `spec-l${idx}-val`,
              valueText: subshellBadge,
              explainKey: 'explainL',
              control: this.slider(`spec-l${idx}`, 0, state.n - 1, state.l, 1),
            })}
            ${this.controlRow({
              id: `spec-m${idx}`,
              label: strings.magneticQuantum,
              valueId: `spec-m${idx}-val`,
              valueText: String(state.m),
              explainKey: 'explainM',
              control: this.slider(`spec-m${idx}`, -state.l, state.l, state.m, 1),
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderIonSection(strings: I18nStrings): string {
    const isOpen = this.openSections.ion;
    const pillsHtml = ION_PRESETS.map(
      (ion) => `
        <button type="button" class="spec-ion-pill" data-ion-zeff="${ion.zEff}" aria-pressed="false">
          ${escapeHtml(ion.label)}
        </button>
      `,
    ).join('');

    const sliderMax = Math.max(6, this.zEff);
    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="ion">
        <button type="button" class="accordion-header" id="spec-acc-hdr-ion" data-toggle="ion" aria-expanded="${isOpen}" aria-controls="spec-acc-body-ion">
          <span class="accordion-title">
            ${icon('zap')}
            <span>${escapeHtml(strings.ionPresetLabel)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>
        <div class="accordion-body" id="spec-acc-body-ion" role="region" aria-labelledby="spec-acc-hdr-ion">
          <div class="control-grid">
            <div class="spec-ion-pills">
              ${pillsHtml}
            </div>
            ${this.controlRow({
              id: 'spec-zeff',
              label: strings.zEffCharge,
              valueId: 'spec-zeff-val',
              valueText: this.zEff.toFixed(2),
              explainKey: 'explainZeff',
              control: this.slider('spec-zeff', 0.5, sliderMax, this.zEff, 0.05),
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderAntennaSection(strings: I18nStrings): string {
    const isOpen = this.openSections.antenna;
    const isPlaying = this.renderer.isPlaying();
    const playLabel = isPlaying ? strings.antennaPause : strings.antennaPlay;
    const playIcon = isPlaying ? icon('pause') : icon('play');

    return `
      <div class="control-accordion-section ${isOpen ? 'open' : ''}" data-section="antenna">
        <button type="button" class="accordion-header" id="spec-acc-hdr-antenna" data-toggle="antenna" aria-expanded="${isOpen}" aria-controls="spec-acc-body-antenna">
          <span class="accordion-title">
            ${icon('dipole')}
            <span>${escapeHtml(strings.antennaSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </button>
        <div class="accordion-body" id="spec-acc-body-antenna" role="region" aria-labelledby="spec-acc-hdr-antenna">
          <div class="control-grid">
            <div class="control-label-row">
              <button type="button" class="btn-action-toggle ${isPlaying ? 'active' : ''}" id="btn-spec-play" aria-pressed="${isPlaying}">
                ${playIcon}
                <span>${escapeHtml(playLabel)}</span>
              </button>
              <button type="button" class="btn-info-icon" data-explain="explainQuantumAntenna" aria-label="Info">${icon('info')}</button>
            </div>
            ${this.controlRow({
              id: 'spec-speed',
              label: strings.antennaSpeed,
              valueId: 'spec-speed-val',
              valueText: `${this.speed.toFixed(2)}×`,
              control: this.slider('spec-speed', 0.25, 3.0, this.speed, 0.25),
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderRightPanel(strings: I18nStrings): string {
    return `
      <div class="physics-panel-container">
        <button type="button" class="dock-tab-pill dock-right-pill ${this.isRightCollapsed ? 'visible' : ''}" id="btn-expand-spec-physics" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isRightCollapsed}" aria-controls="spec-physics-panel">
          ${icon('chevron-left', 'pill-chevron')}
          <span>${escapeHtml(strings.spectroscopyAnalysisTitle)}</span>
          ${icon('chart')}
        </button>

        <div class="orbital-physics-panel glass-panel ${this.isRightCollapsed ? 'collapsed' : ''}" id="spec-physics-panel">
          <div class="mobile-drawer-handle"></div>
          <div class="physics-header">
            <div class="physics-header-top">
              <div class="panel-title-group">
                <span class="panel-header-icon">${icon('chart')}</span>
                <h3>${escapeHtml(strings.spectroscopyAnalysisTitle)}</h3>
              </div>
              <div class="panel-header-actions">
                <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-spec-physics" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isRightCollapsed}" aria-controls="spec-physics-panel">
                  ${icon('chevron-right')}
                </button>
                <button type="button" class="panel-close-btn mobile-only" id="btn-close-spec-physics" aria-label="${escapeHtml(strings.infoModalClose)}">
                  ${icon('close')}
                </button>
              </div>
            </div>

            <div class="active-state-badge">
              <span class="badge-label">${escapeHtml(strings.activeState)}</span>
              <span class="badge-value" id="spec-active-notation">--</span>
            </div>

            <div class="control-label-row spec-rule-row">
              <span class="spec-rule-badge is-allowed" id="spec-rule-badge">${escapeHtml(strings.transitionAllowed)}</span>
              <button type="button" class="btn-info-icon" data-explain="explainSelectionRules" aria-label="Info">${icon('info')}</button>
            </div>
          </div>

          <div class="physics-section">
            <div class="section-title">
              <h4>${escapeHtml(strings.energyDiagramTitle)}</h4>
            </div>
            <div class="energy-diagram-wrapper radial-chart-wrapper" id="spec-energy-diagram"></div>
          </div>

          <div class="physics-section">
            <div class="section-title">
              <h4>${escapeHtml(strings.spectrumStripTitle)}</h4>
            </div>
            <div class="spectrum-strip-wrapper radial-chart-wrapper" id="spec-spectrum-strip"></div>
          </div>

          <div class="physics-section">
            <div class="spec-readouts-grid nodes-grid">
              <div class="stat-tile">
                <span class="node-label">${escapeHtml(strings.transitionDeltaE)}</span>
                <span class="node-value numeric" id="spec-val-delta-e">--</span>
              </div>
              <div class="stat-tile">
                <span class="node-label">${escapeHtml(strings.transitionWavelength)}</span>
                <span class="node-value numeric" id="spec-val-wavelength">--</span>
              </div>
              <div class="stat-tile">
                <span class="node-label">${escapeHtml(strings.transitionFrequency)}</span>
                <span class="node-value numeric" id="spec-val-frequency">--</span>
              </div>
            </div>

            <div class="mol-details spec-details-list">
              <div class="detail-row">
                <span class="detail-row-label">${escapeHtml(strings.spectralSeries)}</span>
                <strong id="spec-val-series">--</strong>
              </div>
              <div class="detail-row">
                <span class="detail-row-label">
                  ${escapeHtml(strings.einsteinACoeff)}
                  <button type="button" class="btn-info-icon" data-explain="explainEinsteinA" aria-label="Info">${icon('info')}</button>
                </span>
                <strong id="spec-val-einstein-a">--</strong>
              </div>
              <div class="detail-row">
                <span class="detail-row-label">${escapeHtml(strings.stateLifetime)}</span>
                <strong id="spec-val-lifetime">--</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private controlRow(opts: {
    id: string;
    label: string;
    valueId: string;
    valueText: string;
    explainKey?: string;
    control: string;
  }): string {
    const infoBtn = opts.explainKey
      ? `<button type="button" class="btn-info-icon" data-explain="${opts.explainKey}" aria-label="Info">${icon('info')}</button>`
      : '';
    return `
      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="${opts.id}">${escapeHtml(opts.label)}<span class="val-badge" id="${opts.valueId}">${escapeHtml(opts.valueText)}</span></label>
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

  private attachEventListeners(): void {
    this.bindCollapseAndAccordionListeners();
    this.bindMobileDrawerListeners();
    this.bindModeAndPresetListeners();
    this.bindQuantumSliderListeners();
    this.bindIonAndAntennaListeners();
    ExplanationModal.attachInfoButtons(this.container);
  }

  private bindCollapseAndAccordionListeners(): void {
    const leftPanel = this.container.querySelector('#spec-controls-panel') as HTMLElement;
    const btnCollapseLeft = this.container.querySelector('#btn-collapse-spec-controls') as HTMLElement;
    const btnExpandLeft = this.container.querySelector('#btn-expand-spec-controls') as HTMLElement;

    btnCollapseLeft.addEventListener('click', () => {
      this.isLeftCollapsed = true;
      leftPanel.classList.add('collapsed');
      btnCollapseLeft.setAttribute('aria-expanded', 'false');
      btnExpandLeft.classList.add('visible');
      btnExpandLeft.setAttribute('aria-expanded', 'false');
    });

    btnExpandLeft.addEventListener('click', () => {
      this.isLeftCollapsed = false;
      leftPanel.classList.remove('collapsed');
      btnCollapseLeft.setAttribute('aria-expanded', 'true');
      btnExpandLeft.classList.remove('visible');
      btnExpandLeft.setAttribute('aria-expanded', 'true');
    });

    const rightPanel = this.container.querySelector('#spec-physics-panel') as HTMLElement;
    const btnCollapseRight = this.container.querySelector('#btn-collapse-spec-physics') as HTMLElement;
    const btnExpandRight = this.container.querySelector('#btn-expand-spec-physics') as HTMLElement;

    btnCollapseRight.addEventListener('click', () => {
      this.isRightCollapsed = true;
      rightPanel.classList.add('collapsed');
      btnCollapseRight.setAttribute('aria-expanded', 'false');
      btnExpandRight.classList.add('visible');
      btnExpandRight.setAttribute('aria-expanded', 'false');
    });

    btnExpandRight.addEventListener('click', () => {
      this.isRightCollapsed = false;
      rightPanel.classList.remove('collapsed');
      btnCollapseRight.setAttribute('aria-expanded', 'true');
      btnExpandRight.classList.remove('visible');
      btnExpandRight.setAttribute('aria-expanded', 'true');
    });

    const accordionHeaders = this.container.querySelectorAll<HTMLElement>('.accordion-header');
    accordionHeaders.forEach((header) => {
      header.addEventListener('click', () => {
        const key = header.dataset.toggle;
        if (!key) return;
        const section = this.container.querySelector(
          `.control-accordion-section[data-section="${key}"]`,
        );
        if (!section) return;
        const isOpen = section.classList.toggle('open');
        this.openSections[key] = isOpen;
        header.setAttribute('aria-expanded', String(isOpen));
      });
    });
  }

  private bindMobileDrawerListeners(): void {
    const leftPanel = this.container.querySelector('#spec-controls-panel') as HTMLElement;
    const rightContainer = this.container.querySelector('.physics-panel-container') as HTMLElement;
    const backdrop = this.container.querySelector('#spec-drawer-backdrop') as HTMLElement;
    const btnShowControls = this.container.querySelector('#btn-show-spec-controls') as HTMLElement;
    const btnShowPhysics = this.container.querySelector('#btn-show-spec-physics') as HTMLElement;
    const btnCloseControls = this.container.querySelector('#btn-close-spec-controls') as HTMLElement;
    const btnClosePhysics = this.container.querySelector('#btn-close-spec-physics') as HTMLElement;

    const closeAll = () => {
      leftPanel.classList.remove('mobile-open');
      rightContainer.classList.remove('mobile-open');
      backdrop.classList.remove('active');
      btnShowControls.classList.remove('active');
      btnShowPhysics.classList.remove('active');
      btnShowControls.setAttribute('aria-expanded', 'false');
      btnShowPhysics.setAttribute('aria-expanded', 'false');
    };

    const toggleDrawer = (panel: HTMLElement, trigger: HTMLElement, closeBtn: HTMLElement) => {
      if (panel.classList.contains('mobile-open')) {
        closeAll();
        return;
      }
      closeAll();
      panel.classList.add('mobile-open');
      backdrop.classList.add('active');
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
    };

    btnShowControls.addEventListener('click', () =>
      toggleDrawer(leftPanel, btnShowControls, btnCloseControls),
    );
    btnShowPhysics.addEventListener('click', () =>
      toggleDrawer(rightContainer, btnShowPhysics, btnClosePhysics),
    );
    btnCloseControls.addEventListener('click', closeAll);
    btnClosePhysics.addEventListener('click', closeAll);
    backdrop.addEventListener('click', closeAll);
  }

  private bindModeAndPresetListeners(): void {
    const exportBtn = this.container.querySelector('#btn-spec-export') as HTMLButtonElement;
    const btnEmission = this.container.querySelector('#btn-spec-emission') as HTMLButtonElement;
    const btnAbsorption = this.container.querySelector('#btn-spec-absorption') as HTMLButtonElement;

    exportBtn.addEventListener('click', () => this.onExportClick());

    const setMode = (nextMode: TransitionMode) => {
      if (this.mode === nextMode) return;
      this.mode = nextMode;
      this.syncControlsToDom();
      this.notifyAndRefresh();
    };

    btnEmission.addEventListener('click', () => setMode('emission'));
    btnAbsorption.addEventListener('click', () => setMode('absorption'));

    const presetBtns = this.container.querySelectorAll<HTMLButtonElement>('.spec-preset-btn');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = SPECTRAL_PRESETS.find((p) => p.id === btn.dataset.presetId);
        if (!preset) return;
        this.zEff = preset.zEff;
        this.upper = { ...preset.upper };
        this.lower = { ...preset.lower };
        this.syncControlsToDom();
        this.notifyAndRefresh();
      });
    });
  }

  private bindQuantumSliderListeners(): void {
    const n2Input = this.container.querySelector('#spec-n2') as HTMLInputElement;
    const l2Input = this.container.querySelector('#spec-l2') as HTMLInputElement;
    const m2Input = this.container.querySelector('#spec-m2') as HTMLInputElement;
    const n1Input = this.container.querySelector('#spec-n1') as HTMLInputElement;
    const l1Input = this.container.querySelector('#spec-l1') as HTMLInputElement;
    const m1Input = this.container.querySelector('#spec-m1') as HTMLInputElement;

    const handleUpperInput = () => {
      this.upper = clampQuantumState(
        {
          n: Number.parseInt(n2Input.value, 10),
          l: Number.parseInt(l2Input.value, 10),
          m: Number.parseInt(m2Input.value, 10),
        },
        2,
        7,
      );
      if (this.lower.n >= this.upper.n) {
        this.lower = clampQuantumState({ ...this.lower, n: this.upper.n - 1 }, 1, 6);
      }
      this.syncControlsToDom();
      this.notifyAndRefresh();
    };

    const handleLowerInput = () => {
      this.lower = clampQuantumState(
        {
          n: Number.parseInt(n1Input.value, 10),
          l: Number.parseInt(l1Input.value, 10),
          m: Number.parseInt(m1Input.value, 10),
        },
        1,
        6,
      );
      if (this.upper.n <= this.lower.n) {
        this.upper = clampQuantumState({ ...this.upper, n: this.lower.n + 1 }, 2, 7);
      }
      this.syncControlsToDom();
      this.notifyAndRefresh();
    };

    for (const input of [n2Input, l2Input, m2Input]) {
      input.addEventListener('input', handleUpperInput);
    }
    for (const input of [n1Input, l1Input, m1Input]) {
      input.addEventListener('input', handleLowerInput);
    }
  }

  private bindIonAndAntennaListeners(): void {
    const ionPills = this.container.querySelectorAll<HTMLButtonElement>('.spec-ion-pill');
    const zeffInput = this.container.querySelector('#spec-zeff') as HTMLInputElement;
    const playBtn = this.container.querySelector('#btn-spec-play') as HTMLButtonElement;
    const speedInput = this.container.querySelector('#spec-speed') as HTMLInputElement;
    const speedVal = this.container.querySelector('#spec-speed-val') as HTMLElement;

    ionPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const val = Number.parseFloat(pill.dataset.ionZeff as string);
        this.zEff = val;
        this.syncControlsToDom();
        this.notifyAndRefresh();
      });
    });

    zeffInput.addEventListener('input', () => {
      this.zEff = Number.parseFloat(zeffInput.value);
      this.syncControlsToDom();
      this.notifyAndRefresh();
    });

    playBtn.addEventListener('click', () => {
      const nextPlaying = !this.renderer.isPlaying();
      this.renderer.setPlaying(nextPlaying);
      this.syncPlayButtonToDom();
    });

    speedInput.addEventListener('input', () => {
      this.speed = Number.parseFloat(speedInput.value);
      this.renderer.setSpeed(this.speed);
      speedVal.textContent = `${this.speed.toFixed(2)}×`;
      syncRangeFill(speedInput);
    });
  }

  private handleEnergyLevelSelect(n: number): void {
    if (n === this.lower.n || n === this.upper.n) return;

    if (this.mode === 'emission') {
      if (n > this.lower.n) {
        this.upper = clampQuantumState({ ...this.upper, n }, 2, 7);
      } else {
        this.lower = clampQuantumState({ ...this.lower, n }, 1, 6);
      }
    } else if (n < this.upper.n) {
      this.lower = clampQuantumState({ ...this.lower, n }, 1, 6);
    } else {
      this.upper = clampQuantumState({ ...this.upper, n }, 2, 7);
    }

    this.syncControlsToDom();
    this.notifyAndRefresh();
  }

  private handleSeriesUpperSelect(nUpper: number): void {
    const clampedUpper = Math.max(this.lower.n + 1, Math.min(7, nUpper));
    if (clampedUpper === this.upper.n) return;
    this.upper = clampQuantumState({ ...this.upper, n: clampedUpper }, 2, 7);
    this.syncControlsToDom();
    this.notifyAndRefresh();
  }

  private syncPlayButtonToDom(): void {
    const playBtn = this.container.querySelector('#btn-spec-play') as HTMLButtonElement | null;
    if (!playBtn) return;
    const strings = getStrings();
    const isPlaying = this.renderer.isPlaying();
    const label = isPlaying ? strings.antennaPause : strings.antennaPlay;
    playBtn.classList.toggle('active', isPlaying);
    playBtn.setAttribute('aria-pressed', String(isPlaying));
    playBtn.innerHTML = `${isPlaying ? icon('pause') : icon('play')} <span>${escapeHtml(label)}</span>`;
  }

  private syncControlsToDom(): void {
    const btnEmission = this.container.querySelector('#btn-spec-emission') as HTMLButtonElement;
    const btnAbsorption = this.container.querySelector('#btn-spec-absorption') as HTMLButtonElement;
    const isEmission = this.mode === 'emission';
    btnEmission.classList.toggle('active', isEmission);
    btnEmission.setAttribute('aria-pressed', String(isEmission));
    btnAbsorption.classList.toggle('active', !isEmission);
    btnAbsorption.setAttribute('aria-pressed', String(!isEmission));

    this.syncSingleStateSliders('2', this.upper);
    this.syncSingleStateSliders('1', this.lower);

    const zeffInput = this.container.querySelector('#spec-zeff') as HTMLInputElement;
    const zeffVal = this.container.querySelector('#spec-zeff-val') as HTMLElement;
    zeffInput.max = String(Math.max(6, this.zEff));
    zeffInput.value = String(this.zEff);
    zeffVal.textContent = this.zEff.toFixed(2);

    this.updatePresetAndIonHighlights();
    this.syncPlayButtonToDom();

    const allRanges = this.container.querySelectorAll<HTMLInputElement>('input[type="range"]');
    allRanges.forEach(syncRangeFill);
  }

  private syncSingleStateSliders(idx: '1' | '2', state: QuantumState): void {
    const nInput = this.container.querySelector(`#spec-n${idx}`) as HTMLInputElement;
    const lInput = this.container.querySelector(`#spec-l${idx}`) as HTMLInputElement;
    const mInput = this.container.querySelector(`#spec-m${idx}`) as HTMLInputElement;

    const nVal = this.container.querySelector(`#spec-n${idx}-val`) as HTMLElement;
    const lVal = this.container.querySelector(`#spec-l${idx}-val`) as HTMLElement;
    const mVal = this.container.querySelector(`#spec-m${idx}-val`) as HTMLElement;

    nInput.value = String(state.n);
    nVal.textContent = String(state.n);

    lInput.max = String(state.n - 1);
    lInput.value = String(state.l);
    lVal.textContent = `${state.l} (${SUBSHELL_LETTERS[state.l]})`;

    mInput.min = String(-state.l);
    mInput.max = String(state.l);
    mInput.value = String(state.m);
    mVal.textContent = String(state.m);
  }

  private updatePresetAndIonHighlights(): void {
    const presetBtns = this.container.querySelectorAll<HTMLButtonElement>('.spec-preset-btn');
    presetBtns.forEach((btn) => {
      const preset = SPECTRAL_PRESETS.find((p) => p.id === btn.dataset.presetId);
      const isMatch = Boolean(
        preset &&
          Math.abs(preset.zEff - this.zEff) < 1e-3 &&
          preset.upper.n === this.upper.n &&
          preset.upper.l === this.upper.l &&
          preset.upper.m === this.upper.m &&
          preset.lower.n === this.lower.n &&
          preset.lower.l === this.lower.l &&
          preset.lower.m === this.lower.m,
      );
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    });

    const ionPills = this.container.querySelectorAll<HTMLButtonElement>('.spec-ion-pill');
    ionPills.forEach((pill) => {
      const ionZ = Number.parseFloat(pill.dataset.ionZeff as string);
      const isMatch = Math.abs(ionZ - this.zEff) < 1e-3;
      pill.classList.toggle('active', isMatch);
      pill.setAttribute('aria-pressed', String(isMatch));
    });
  }

  private notifyAndRefresh(): void {
    this.hasLoadedOnce = true;
    this.onStateChange?.();
    void this.refreshTransition();
  }

  private async refreshTransition(): Promise<void> {
    const token = ++this.metricsToken;
    const lowerSnap = { ...this.lower };
    const upperSnap = { ...this.upper };
    const zEffSnap = this.zEff;
    const modeSnap = this.mode;

    const [metrics, seriesLines] = await Promise.all([
      computeTransitionMetrics(zEffSnap, lowerSnap, upperSnap),
      computeSeriesLines(zEffSnap, lowerSnap.n, 7),
    ]);

    if (token !== this.metricsToken) return;

    this.latestMetrics = metrics;
    this.latestSeriesLines = seriesLines;
    this.applyMetricsToDom(metrics, seriesLines);

    await this.renderer.updateTransition({
      lower: lowerSnap,
      upper: upperSnap,
      zEff: zEffSnap,
      mode: modeSnap,
      isAllowed: metrics.isAllowed,
      photonColorRgb: [metrics.color.r, metrics.color.g, metrics.color.b],
      dipoleIntegralBohr: metrics.dipoleIntegralBohr,
    });
  }

  private applyMetricsToDom(metrics: TransitionMetrics, seriesLines: SeriesLine[]): void {
    const strings = getStrings();
    const notationEl = this.container.querySelector('#spec-active-notation') as HTMLElement;
    const ruleBadgeEl = this.container.querySelector('#spec-rule-badge') as HTMLElement;
    const deltaEEl = this.container.querySelector('#spec-val-delta-e') as HTMLElement;
    const wavelengthEl = this.container.querySelector('#spec-val-wavelength') as HTMLElement;
    const frequencyEl = this.container.querySelector('#spec-val-frequency') as HTMLElement;
    const seriesEl = this.container.querySelector('#spec-val-series') as HTMLElement;
    const einsteinEl = this.container.querySelector('#spec-val-einstein-a') as HTMLElement;
    const lifetimeEl = this.container.querySelector('#spec-val-lifetime') as HTMLElement;

    const upperStr = formatSubshellState(this.upper);
    const lowerStr = formatSubshellState(this.lower);
    notationEl.textContent =
      this.mode === 'emission' ? `${upperStr} → ${lowerStr}` : `${lowerStr} → ${upperStr}`;

    ruleBadgeEl.textContent = resolveRuleBadgeText(metrics, strings);
    ruleBadgeEl.classList.toggle('is-allowed', metrics.isAllowed);
    ruleBadgeEl.classList.toggle('is-forbidden', !metrics.isAllowed);

    const wlStr = formatWavelengthNm(metrics.wavelengthNm);
    const bandLabel = resolveBandLabel(metrics.color.band, strings);

    deltaEEl.textContent = `${metrics.deltaEEv.toFixed(2)} eV`;
    wavelengthEl.innerHTML = `<span class="spec-swatch-dot" style="background-color: ${metrics.color.hex};" aria-hidden="true"></span>${escapeHtml(wlStr)} nm <small class="spec-band-pill band-${metrics.color.band}">${escapeHtml(bandLabel)}</small>`;
    frequencyEl.textContent = formatFrequencyThz(metrics.frequencyThz);

    seriesEl.textContent = resolveSeriesName(metrics.seriesIndex, strings);
    einsteinEl.textContent = formatEinsteinA(metrics.einsteinA);
    lifetimeEl.textContent = formatLifetime(metrics.lifetimeNs, strings.metastableInfinite);

    this.energyDiagram?.update({
      zEff: this.zEff,
      nLower: this.lower.n,
      nUpper: this.upper.n,
      mode: this.mode,
      isAllowed: metrics.isAllowed,
      photonHex: metrics.color.hex,
    });

    this.spectrumStrip?.update({
      lines: seriesLines,
      activeUpperN: this.upper.n,
      mode: this.mode,
      isAllowed: metrics.isAllowed,
    });

    this.lastScaleText = `λ ${wlStr} nm · ΔE ${metrics.deltaEEv.toFixed(2)} eV`;
    this.onScaleTextChange(this.lastScaleText);
  }
}

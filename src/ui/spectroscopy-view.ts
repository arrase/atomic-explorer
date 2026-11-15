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
import { SpectroscopyRenderer, SpectroscopyVisualMode } from '../render/spectroscopy-renderer';
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

function splitPresetLabel(
  preset: SpectralLinePreset,
  strings: I18nStrings,
): { title: string; sub: string } {
  if (preset.id === 'forbidden-2s-1s') {
    const match = /^(.+?)\s*\(([^)]+)\)$/.exec(strings.presetForbidden2s1s);
    return match
      ? { title: match[1], sub: match[2] }
      : { title: preset.shortLabel, sub: strings.transitionForbidden };
  }
  const [title, sub] = preset.shortLabel.split(' · ');
  return { title, sub };
}

function renderNPillButtons(
  tier: 'upper' | 'lower',
  minN: number,
  maxN: number,
  activeN: number,
): string {
  const buttons: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    const isActive = n === activeN;
    buttons.push(
      `<button type="button" class="spec-q-pill ${isActive ? 'active' : ''}" data-tier="${tier}" data-q="n" data-val="${n}" aria-pressed="${isActive}">${n}</button>`,
    );
  }
  return buttons.join('');
}

function renderLPillButtons(tier: 'upper' | 'lower', state: QuantumState): string {
  const buttons: string[] = [];
  for (let l = 0; l < state.n; l++) {
    const isActive = l === state.l;
    buttons.push(
      `<button type="button" class="spec-q-pill ${isActive ? 'active' : ''}" data-tier="${tier}" data-q="l" data-val="${l}" aria-pressed="${isActive}">${l}${SUBSHELL_LETTERS[l]}</button>`,
    );
  }
  return buttons.join('');
}

function renderMPillButtons(tier: 'upper' | 'lower', state: QuantumState): string {
  if (state.l === 0) {
    return '<button type="button" class="spec-q-pill active" disabled aria-pressed="true">0</button>';
  }
  const buttons: string[] = [];
  for (let m = -state.l; m <= state.l; m++) {
    const isActive = m === state.m;
    const label = m > 0 ? `+${m}` : `${m}`;
    buttons.push(
      `<button type="button" class="spec-q-pill ${isActive ? 'active' : ''}" data-tier="${tier}" data-q="m" data-val="${m}" aria-pressed="${isActive}">${label}</button>`,
    );
  }
  return buttons.join('');
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
  private visualMode: SpectroscopyVisualMode = 'slice';
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

      <div class="spec-viewport-legend" id="spec-viewport-legend">
        <span class="spec-legend-item" id="spec-legend-beat-item">
          <span class="spec-legend-swatch" id="spec-legend-beat-swatch" aria-hidden="true"></span>
          <span>${escapeHtml(strings.specLegendBeat)}</span>
        </span>
        <span class="spec-legend-item" id="spec-legend-dipole-item">
          <span class="spec-legend-arrow-swatch" aria-hidden="true"></span>
          <span>${escapeHtml(strings.specLegendDipole)}</span>
        </span>
        <span class="spec-legend-item" id="spec-legend-photon-item">
          <span class="spec-legend-wave-swatch" id="spec-legend-photon-swatch" aria-hidden="true"></span>
          <span>${escapeHtml(strings.specLegendPhoton)}</span>
        </span>
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
            <h2>${escapeHtml(strings.spectroscopyTitle)}</h2>
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

        <div class="segmented-toggle spec-mode-actions" role="group" aria-label="${escapeHtml(strings.mode)}">
          <button type="button" class="segmented-toggle-btn ${isEmission ? 'active' : ''}" id="btn-spec-emission" aria-pressed="${isEmission}">
            ${escapeHtml(strings.modeEmission)}
          </button>
          <button type="button" class="segmented-toggle-btn ${!isEmission ? 'active' : ''}" id="btn-spec-absorption" aria-pressed="${!isEmission}">
            ${escapeHtml(strings.modeAbsorption)}
          </button>
        </div>

        <div class="control-accordion-container">
          ${this.renderPresetsSection(strings)}
          ${this.renderAntennaSection(strings)}
          ${this.renderQuantumSection('upper', strings.upperStateSection, 'n2', this.upper, 2, 7, strings)}
          ${this.renderQuantumSection('lower', strings.lowerStateSection, 'n1', this.lower, 1, 6, strings)}
          ${this.renderIonSection(strings)}
        </div>
      </div>
    `;
  }

  private renderPresetsSection(strings: I18nStrings): string {
    const isOpen = this.openSections.presets;
    const buttonsHtml = SPECTRAL_PRESETS.map((preset) => {
      const { title, sub } = splitPresetLabel(preset, strings);
      const swatch = presetSwatchHex(preset);
      return `
        <button type="button" class="spec-preset-btn" data-preset-id="${preset.id}" aria-pressed="false">
          <span class="spec-preset-top">
            <span class="spec-swatch-dot" style="background: ${swatch};" aria-hidden="true"></span>
            <span class="spec-preset-title">${escapeHtml(title)}</span>
          </span>
          <span class="spec-preset-sub">${escapeHtml(sub)}</span>
        </button>
      `;
    }).join('');

    return `
      <details class="control-accordion-section" data-section="presets"${isOpen ? ' open' : ''}>
        <summary class="accordion-header" id="spec-acc-hdr-presets">
          <span class="accordion-title">
            ${icon('spectrum')}
            <span>${escapeHtml(strings.famousLinesSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </summary>
        <div class="accordion-body" id="spec-acc-body-presets">
          <div class="spec-presets-grid">
            ${buttonsHtml}
          </div>
        </div>
      </details>
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
    const mBadge = state.m > 0 ? `+${state.m}` : String(state.m);

    return `
      <details class="control-accordion-section" data-section="${sectionKey}"${isOpen ? ' open' : ''}>
        <summary class="accordion-header" id="spec-acc-hdr-${sectionKey}">
          <span class="accordion-title">
            ${icon('atom')}
            <span>${escapeHtml(title)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </summary>
        <div class="accordion-body" id="spec-acc-body-${sectionKey}">
          <div class="control-grid">
            ${this.renderQuantumRow({
              q: 'n',
              idx,
              label: strings.principalQuantum,
              valueText: String(state.n),
              explainKey: 'explainN',
              pillsHtml: renderNPillButtons(sectionKey, minN, maxN, state.n),
            })}
            ${this.renderQuantumRow({
              q: 'l',
              idx,
              label: strings.azimuthalQuantum,
              valueText: subshellBadge,
              explainKey: 'explainL',
              dataAttr: `data-rendered-n="${state.n}"`,
              pillsHtml: renderLPillButtons(sectionKey, state),
            })}
            ${this.renderQuantumRow({
              q: 'm',
              idx,
              label: strings.magneticQuantum,
              valueText: mBadge,
              explainKey: 'explainM',
              dataAttr: `data-rendered-l="${state.l}"`,
              pillsHtml: renderMPillButtons(sectionKey, state),
            })}
          </div>
        </div>
      </details>
    `;
  }

  private renderQuantumRow(opts: {
    q: 'n' | 'l' | 'm';
    idx: '1' | '2';
    label: string;
    valueText: string;
    explainKey: string;
    dataAttr?: string;
    pillsHtml: string;
  }): string {
    const extraAttr = opts.dataAttr ? ` ${opts.dataAttr}` : '';
    return `
      <div class="spec-quantum-row">
        <div class="control-label-row">
          <span class="control-label">${escapeHtml(opts.label)}<span class="val-badge" id="spec-${opts.q}${opts.idx}-val">${escapeHtml(opts.valueText)}</span></span>
          <button type="button" class="btn-info-icon" data-explain="${opts.explainKey}" aria-label="Info">${icon('info')}</button>
        </div>
        <div class="spec-quantum-pills" id="spec-${opts.q}${opts.idx}-pills" role="group" aria-label="${escapeHtml(opts.label)}"${extraAttr}>
          ${opts.pillsHtml}
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
      <details class="control-accordion-section" data-section="ion"${isOpen ? ' open' : ''}>
        <summary class="accordion-header" id="spec-acc-hdr-ion">
          <span class="accordion-title">
            ${icon('zap')}
            <span>${escapeHtml(strings.ionPresetLabel)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </summary>
        <div class="accordion-body" id="spec-acc-body-ion">
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
      </details>
    `;
  }

  private renderAntennaSection(strings: I18nStrings): string {
    const isOpen = this.openSections.antenna;
    const isPlaying = this.renderer.isPlaying();
    const isSlice = this.visualMode === 'slice';
    const playLabel = isPlaying ? strings.antennaPause : strings.antennaPlay;
    const playIcon = isPlaying ? icon('pause') : icon('play');

    return `
      <details class="control-accordion-section" data-section="antenna"${isOpen ? ' open' : ''}>
        <summary class="accordion-header" id="spec-acc-hdr-antenna">
          <span class="accordion-title">
            ${icon('dipole')}
            <span>${escapeHtml(strings.antennaSection)}</span>
          </span>
          <span class="accordion-chevron">${icon('chevron-down')}</span>
        </summary>
        <div class="accordion-body" id="spec-acc-body-antenna">
          <div class="control-grid">
            <div class="control-group">
              <div class="control-label-row">
                <span class="control-label">${escapeHtml(strings.specVisualModeLabel)}</span>
              </div>
              <div class="segmented-toggle" role="group" aria-label="${escapeHtml(strings.specVisualModeLabel)}">
                <button type="button" class="segmented-toggle-btn ${isSlice ? 'active' : ''}" id="btn-spec-mode-slice" aria-pressed="${isSlice}">
                  ${escapeHtml(strings.specModeSlice)}
                </button>
                <button type="button" class="segmented-toggle-btn ${!isSlice ? 'active' : ''}" id="btn-spec-mode-volume" aria-pressed="${!isSlice}">
                  ${escapeHtml(strings.specModeVolume)}
                </button>
              </div>
            </div>
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
      </details>
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
                <h2>${escapeHtml(strings.spectroscopyAnalysisTitle)}</h2>
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
            <p class="spec-insight-text" id="spec-insight-text"></p>
          </div>

          <div class="physics-section">
            <div class="section-title">
              <h3>${escapeHtml(strings.energyDiagramTitle)}</h3>
            </div>
            <div class="energy-diagram-wrapper radial-chart-wrapper" id="spec-energy-diagram"></div>
          </div>

          <div class="physics-section">
            <div class="section-title">
              <h3 id="spec-strip-title">${escapeHtml(this.mode === 'emission' ? strings.spectrumStripTitle : strings.spectrumAbsorptionTitle)}</h3>
              <span class="spec-false-color-note">${escapeHtml(strings.specFalseColorNote)}</span>
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
                <span class="detail-row-label">${escapeHtml(strings.spectralSeriesShort)}</span>
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
    this.bindQuantumPillListeners();
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

    const accordionSections = this.container.querySelectorAll<HTMLDetailsElement>(
      'details.control-accordion-section',
    );
    accordionSections.forEach((detailsEl) => {
      detailsEl.addEventListener('toggle', () => {
        const key = detailsEl.dataset.section;
        if (key) {
          this.openSections[key] = detailsEl.open;
        }
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

  private bindQuantumPillListeners(): void {
    const pillGroups = this.container.querySelectorAll<HTMLElement>('.spec-quantum-pills');
    pillGroups.forEach((group) => {
      group.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.spec-q-pill');
        if (!btn || btn.disabled) return;
        const tier = btn.dataset.tier as 'upper' | 'lower';
        const q = btn.dataset.q as 'n' | 'l' | 'm';
        const value = Number.parseInt(btn.dataset.val as string, 10);
        this.handleQuantumPillSelect(tier, q, value);
      });
    });
  }

  private handleQuantumPillSelect(
    tier: 'upper' | 'lower',
    q: 'n' | 'l' | 'm',
    value: number,
  ): void {
    const current = tier === 'upper' ? this.upper : this.lower;
    if (current[q] === value) return;

    if (tier === 'upper') {
      this.upper = clampQuantumState({ ...this.upper, [q]: value }, 2, 7);
      if (this.lower.n >= this.upper.n) {
        this.lower = clampQuantumState({ ...this.lower, n: this.upper.n - 1 }, 1, 6);
      }
    } else {
      this.lower = clampQuantumState({ ...this.lower, [q]: value }, 1, 6);
      if (this.upper.n <= this.lower.n) {
        this.upper = clampQuantumState({ ...this.upper, n: this.lower.n + 1 }, 2, 7);
      }
    }

    this.syncControlsToDom();
    this.notifyAndRefresh();
  }

  private bindIonAndAntennaListeners(): void {
    const ionPills = this.container.querySelectorAll<HTMLButtonElement>('.spec-ion-pill');
    const zeffInput = this.container.querySelector('#spec-zeff') as HTMLInputElement;
    const btnModeSlice = this.container.querySelector('#btn-spec-mode-slice') as HTMLButtonElement;
    const btnModeVolume = this.container.querySelector('#btn-spec-mode-volume') as HTMLButtonElement;
    const playBtn = this.container.querySelector('#btn-spec-play') as HTMLButtonElement;
    const speedInput = this.container.querySelector('#spec-speed') as HTMLInputElement;
    const speedVal = this.container.querySelector('#spec-speed-val') as HTMLElement;

    const setVisualMode = (nextMode: SpectroscopyVisualMode) => {
      if (this.visualMode === nextMode) return;
      this.visualMode = nextMode;
      this.syncControlsToDom();
      void this.refreshTransition();
    };

    btnModeSlice.addEventListener('click', () => setVisualMode('slice'));
    btnModeVolume.addEventListener('click', () => setVisualMode('volume'));

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

    const btnSlice = this.container.querySelector('#btn-spec-mode-slice') as HTMLButtonElement;
    const btnVolume = this.container.querySelector('#btn-spec-mode-volume') as HTMLButtonElement;
    const isSlice = this.visualMode === 'slice';
    btnSlice.classList.toggle('active', isSlice);
    btnSlice.setAttribute('aria-pressed', String(isSlice));
    btnVolume.classList.toggle('active', !isSlice);
    btnVolume.setAttribute('aria-pressed', String(!isSlice));

    this.syncQuantumPills('upper', '2', this.upper);
    this.syncQuantumPills('lower', '1', this.lower);

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

  private syncQuantumPills(tier: 'upper' | 'lower', idx: '1' | '2', state: QuantumState): void {
    const nVal = this.container.querySelector(`#spec-n${idx}-val`) as HTMLElement;
    const lVal = this.container.querySelector(`#spec-l${idx}-val`) as HTMLElement;
    const mVal = this.container.querySelector(`#spec-m${idx}-val`) as HTMLElement;

    nVal.textContent = String(state.n);
    lVal.textContent = `${state.l} (${SUBSHELL_LETTERS[state.l]})`;
    mVal.textContent = state.m > 0 ? `+${state.m}` : String(state.m);

    const nPills = this.container.querySelector(`#spec-n${idx}-pills`) as HTMLElement;
    nPills.querySelectorAll<HTMLButtonElement>('.spec-q-pill').forEach((btn) => {
      const isActive = Number.parseInt(btn.dataset.val as string, 10) === state.n;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    const lPills = this.container.querySelector(`#spec-l${idx}-pills`) as HTMLElement;
    if (lPills.dataset.renderedN !== String(state.n)) {
      lPills.dataset.renderedN = String(state.n);
      lPills.innerHTML = renderLPillButtons(tier, state);
    } else {
      lPills.querySelectorAll<HTMLButtonElement>('.spec-q-pill').forEach((btn) => {
        const isActive = Number.parseInt(btn.dataset.val as string, 10) === state.l;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
    }

    const mPills = this.container.querySelector(`#spec-m${idx}-pills`) as HTMLElement;
    if (mPills.dataset.renderedL !== String(state.l)) {
      mPills.dataset.renderedL = String(state.l);
      mPills.innerHTML = renderMPillButtons(tier, state);
    } else if (state.l > 0) {
      mPills.querySelectorAll<HTMLButtonElement>('.spec-q-pill').forEach((btn) => {
        const isActive = Number.parseInt(btn.dataset.val as string, 10) === state.m;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
    }
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
    const visualModeSnap = this.visualMode;

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
      visualMode: visualModeSnap,
    });
  }

  private applyMetricsToDom(metrics: TransitionMetrics, seriesLines: SeriesLine[]): void {
    const strings = getStrings();
    const beatSwatchEl = this.container.querySelector('#spec-legend-beat-swatch') as HTMLElement;
    const dipoleItemEl = this.container.querySelector('#spec-legend-dipole-item') as HTMLElement;
    const photonItemEl = this.container.querySelector('#spec-legend-photon-item') as HTMLElement;
    const photonSwatchEl = this.container.querySelector('#spec-legend-photon-swatch') as HTMLElement;
    const notationEl = this.container.querySelector('#spec-active-notation') as HTMLElement;
    const ruleBadgeEl = this.container.querySelector('#spec-rule-badge') as HTMLElement;
    const insightEl = this.container.querySelector('#spec-insight-text') as HTMLElement;
    const stripTitleEl = this.container.querySelector('#spec-strip-title') as HTMLElement;
    const deltaEEl = this.container.querySelector('#spec-val-delta-e') as HTMLElement;
    const wavelengthEl = this.container.querySelector('#spec-val-wavelength') as HTMLElement;
    const frequencyEl = this.container.querySelector('#spec-val-frequency') as HTMLElement;
    const seriesEl = this.container.querySelector('#spec-val-series') as HTMLElement;
    const einsteinEl = this.container.querySelector('#spec-val-einstein-a') as HTMLElement;
    const lifetimeEl = this.container.querySelector('#spec-val-lifetime') as HTMLElement;

    beatSwatchEl.style.background = metrics.isAllowed
      ? `linear-gradient(135deg, #335785 0%, ${metrics.color.hex} 100%)`
      : 'linear-gradient(135deg, #33577a 0%, #75bde0 100%)';
    dipoleItemEl.classList.toggle('hidden', !metrics.isAllowed);
    photonItemEl.classList.toggle('hidden', !metrics.isAllowed);
    photonSwatchEl.style.color = metrics.color.hex;

    const firstState = this.mode === 'emission' ? this.upper : this.lower;
    const secondState = this.mode === 'emission' ? this.lower : this.upper;
    notationEl.innerHTML =
      `<span class="spec-state-token">${escapeHtml(formatSubshellState(firstState))} →</span>` +
      `<span class="spec-state-token">${escapeHtml(formatSubshellState(secondState))}</span>`;

    ruleBadgeEl.textContent = resolveRuleBadgeText(metrics, strings);
    ruleBadgeEl.classList.toggle('is-allowed', metrics.isAllowed);
    ruleBadgeEl.classList.toggle('is-forbidden', !metrics.isAllowed);

    const deltaM = this.upper.m - this.lower.m;
    const isPi = metrics.isAllowed && deltaM === 0;
    const isSigma = metrics.isAllowed && Math.abs(deltaM) === 1;
    insightEl.classList.toggle('is-forbidden', !metrics.isAllowed);
    insightEl.classList.toggle('is-pi', isPi);
    insightEl.classList.toggle('is-sigma', isSigma);
    insightEl.textContent = !metrics.isAllowed
      ? strings.specInsightForbidden
      : isPi
        ? strings.specInsightPi
        : strings.specInsightSigma;

    stripTitleEl.textContent =
      this.mode === 'emission' ? strings.spectrumStripTitle : strings.spectrumAbsorptionTitle;

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
      lLower: this.lower.l,
      lUpper: this.upper.l,
      mLower: this.lower.m,
      mUpper: this.upper.m,
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

import elementsData from '../../assets/data/elements.json';
import {
  getStrings,
  getLanguage,
  onLanguageChange,
  type I18nStrings,
  type ElementUseKey,
} from '../i18n';
import { ExplanationModal } from './info-modal';
import { escapeHtml } from './modal-utils';
import { icon } from './icons';
import { OrbitalPreview } from '../render/orbital-preview';
import { calculateValenceQuantumNumbers, subshellName } from '../core/valence-orbital';
import { meanRadiusBohr } from '../core/physics-constants';
import {
  ANCIENT_DISCOVERY_SENTINEL,
  DEFAULT_TEMPERATURE_K,
  MAX_DISCOVERY_YEAR,
  MAX_TEMPERATURE_K,
  MIN_TEMPERATURE_K,
  getElementPhase,
  isAncientDiscovery,
  isElementDiscovered,
  kelvinToCelsius,
  type MatterPhase,
} from '../core/periodic-trends';
import {
  ELECTRONEGATIVITY_GRADIENT,
  IONIZATION_GRADIENT,
  RADIUS_GRADIENT,
  getCategoryColor,
  getDiscoveryColor,
  getElectronegativityColor,
  getIonizationColor,
  getLegendCategoryOrder,
  getPhaseColor,
  getRadiusColor,
} from './element-colors';

export interface ElementData {
  Z: number;
  symbol: string;
  name_es: string;
  name_en: string;
  category: string;
  atomic_mass: number;
  electron_config_str: string;
  radius_pm: number;
  electronegativity: number | null;
  ionization_energy: number | null;
  oxidation_states?: number[];
  discovery_year: number | string;
  melting_point_k: number | null;
  boiling_point_k: number | null;
  uses: ElementUseKey[];
}

export type ChemicalBlock = 'all' | 's' | 'p' | 'd' | 'f';
export type ColorScheme =
  | 'category'
  | 'electronegativity'
  | 'radius'
  | 'ionization'
  | 'phase'
  | 'discovery';

const VALID_BLOCKS: ReadonlySet<ChemicalBlock> = new Set(['all', 's', 'p', 'd', 'f']);
const VALID_COLOR_SCHEMES: ReadonlySet<string> = new Set<ColorScheme>([
  'category',
  'electronegativity',
  'radius',
  'ionization',
  'phase',
  'discovery',
]);
const MATTER_PHASES: readonly MatterPhase[] = ['solid', 'liquid', 'gas', 'unknown'];

interface TemperaturePreset {
  readonly k: number;
  readonly labelKey: 'tempPresetRoom' | 'tempPresetLava' | 'tempPresetSun' | null;
}

const TEMPERATURE_PRESETS: readonly TemperaturePreset[] = [
  { k: 298, labelKey: 'tempPresetRoom' },
  { k: 1000, labelKey: 'tempPresetLava' },
  { k: 3000, labelKey: null },
  { k: 5778, labelKey: 'tempPresetSun' },
];

interface GridRange {
  readonly maxZ: number;
  readonly row: number;
  readonly colOffset: number;
}

const GRID_RANGES: readonly GridRange[] = [
  { maxZ: 1, row: 2, colOffset: 1 },
  { maxZ: 2, row: 2, colOffset: 17 },
  { maxZ: 4, row: 3, colOffset: -1 },
  { maxZ: 10, row: 3, colOffset: 9 },
  { maxZ: 12, row: 4, colOffset: -9 },
  { maxZ: 18, row: 4, colOffset: 1 },
  { maxZ: 36, row: 5, colOffset: -17 },
  { maxZ: 54, row: 6, colOffset: -35 },
  { maxZ: 56, row: 7, colOffset: -53 },
  { maxZ: 71, row: 10, colOffset: -53 },
  { maxZ: 86, row: 7, colOffset: -67 },
  { maxZ: 88, row: 8, colOffset: -85 },
  { maxZ: 103, row: 11, colOffset: -85 },
  { maxZ: 118, row: 8, colOffset: -99 },
];

function syncRangeFill(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const value = Number.parseFloat(input.value);
  const pct = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
}

export class PeriodicTableView {
  private readonly container: HTMLElement;
  private readonly elements: ElementData[] = elementsData as ElementData[];
  private readonly preview: OrbitalPreview;
  private selectedElement: ElementData | null = null;
  private currentColorScheme: ColorScheme = 'category';
  private selectedBlock: ChemicalBlock = 'all';
  private temperatureK: number = DEFAULT_TEMPERATURE_K;
  private discoveryYear: number = MAX_DISCOVERY_YEAR;
  private readonly onSelectElementOrbital: (element: ElementData) => void;
  public onStateChange?: () => void;

  constructor(
    container: HTMLElement,
    onSelectElementOrbital: (element: ElementData) => void,
    preview: OrbitalPreview
  ) {
    this.container = container;
    this.onSelectElementOrbital = onSelectElementOrbital;
    this.preview = preview;
    this.selectedElement = this.elements[0];
    this.render();
    onLanguageChange(() => this.render());
  }

  public getDeepLinkState(): {
    el: number;
    block: 'all' | 's' | 'p' | 'd' | 'f';
    colorScheme: ColorScheme;
  } {
    return {
      el: this.selectedElement ? this.selectedElement.Z : 1,
      block: this.selectedBlock,
      colorScheme: this.currentColorScheme,
    };
  }

  public selectElementByZ(z: number): void {
    const el = this.elements.find((item) => item.Z === z);
    if (el) {
      this.selectElement(el);
    }
  }

  public setToolbarState(opts: {
    block?: 'all' | 's' | 'p' | 'd' | 'f';
    colorScheme?: string;
  }): void {
    if (opts.block && VALID_BLOCKS.has(opts.block)) {
      this.selectedBlock = opts.block;
      this.syncBlockFilterButtons();
    }
    if (opts.colorScheme && VALID_COLOR_SCHEMES.has(opts.colorScheme)) {
      this.currentColorScheme = opts.colorScheme as ColorScheme;
      const select = this.container.querySelector<HTMLSelectElement>('#color-scheme-select');
      if (select) {
        select.value = this.currentColorScheme;
      }
      this.refreshLegend();
    }
    this.updateGridAppearance(this.getSearchQuery());
  }

  private renderColorOption(value: ColorScheme, label: string): string {
    const selected = this.currentColorScheme === value ? 'selected' : '';
    return `<option value="${value}" ${selected}>${escapeHtml(label)}</option>`;
  }

  private renderBlockButton(block: ChemicalBlock, label: string): string {
    const active = this.selectedBlock === block ? 'active' : '';
    return `<button type="button" class="btn-block-filter ${active}" data-block="${block}">${escapeHtml(label)}</button>`;
  }

  private render(): void {
    const strings = getStrings();

    this.container.innerHTML = `
      <div class="periodic-table-wrapper">
        <div class="table-toolbar">
          <div class="toolbar-left-group">
            <div class="toolbar-group">
              <label for="color-scheme-select">${escapeHtml(strings.colorCoding)}:</label>
              <select id="color-scheme-select">
                ${this.renderColorOption('category', strings.colorCategory)}
                ${this.renderColorOption('electronegativity', strings.colorElectronegativity)}
                ${this.renderColorOption('radius', strings.colorRadius)}
                ${this.renderColorOption('ionization', strings.ionizationEnergy)}
                ${this.renderColorOption('phase', strings.colorPhase)}
                ${this.renderColorOption('discovery', strings.colorDiscovery)}
              </select>
            </div>
            <div class="block-filter-bar">
              ${this.renderBlockButton('all', strings.blockFilterAll)}
              ${this.renderBlockButton('s', strings.blockFilterS)}
              ${this.renderBlockButton('p', strings.blockFilterP)}
              ${this.renderBlockButton('d', strings.blockFilterD)}
              ${this.renderBlockButton('f', strings.blockFilterF)}
            </div>
          </div>
          <div class="toolbar-group search-group">
            <div class="search-input-wrapper">
              <span class="search-icon-inside">${icon('search')}</span>
              <input type="text" id="element-search" placeholder="${escapeHtml(strings.searchPlaceholder)}" />
            </div>
          </div>
        </div>

        <div class="periodic-legend-container" id="periodic-legend-container">
          ${this.renderLegendBar()}
        </div>

        <div class="periodic-grid-container">
          <div class="periodic-grid" id="periodic-grid" role="listbox" aria-label="${escapeHtml(strings.periodicTrendsGuideTitle)}" aria-orientation="horizontal">
            ${this.renderGridCells()}
          </div>
          <div class="periodic-scroll-hint">
            <span>${icon('chevron-left')} ${escapeHtml(strings.swipeToExplore)} ${icon('chevron-right')}</span>
          </div>
          <div class="periodic-trends-card">
            <div class="trends-card-header">
              <h4>${escapeHtml(strings.periodicTrendsGuideTitle)}</h4>
              <button type="button" class="btn-info-icon" data-explain="explainAtomicRadius" aria-label="Info">${icon('info')}</button>
            </div>
            <p>${escapeHtml(strings.periodicTrendsGuideText)}</p>
          </div>
        </div>

        <!-- Persistent Mobile Quick Inspector Bar (Visible on mobile/tablet <=1024px) -->
        <div class="mobile-quick-inspector" id="mobile-quick-inspector">
          ${this.renderQuickInspectorContent()}
        </div>

        <!-- Mobile Drawer Backdrop -->
        <div class="mobile-drawer-backdrop" id="periodic-drawer-backdrop"></div>

        <!-- Full Element Inspector Panel (Desktop sidebar / Mobile bottom sheet) -->
        <div class="element-inspector-panel" id="element-inspector">
          <div class="mobile-drawer-handle"></div>
          <div class="panel-header-actions mobile-only-header">
            <button type="button" class="panel-close-btn" id="btn-close-inspector" aria-label="${escapeHtml(strings.infoModalClose)}">${icon('close')}</button>
          </div>
          ${this.renderInspectorContent()}
        </div>
      </div>
    `;

    this.attachEventListeners();
    void this.updatePreview();
  }

  private getElementName(el: ElementData): string {
    return getLanguage() === 'es' ? el.name_es : (el.name_en || el.name_es);
  }

  private getCategoryName(categoryKey: string, strings: I18nStrings): string {
    switch (categoryKey) {
      case 'no metal': return strings.catNonMetal;
      case 'gas noble': return strings.catNobleGas;
      case 'metal alcalino': return strings.catAlkaliMetal;
      case 'alcalinotérreo': return strings.catAlkalineEarth;
      case 'metaloide': return strings.catMetalloid;
      case 'halógeno': return strings.catHalogen;
      case 'metal de transición': return strings.catTransitionMetal;
      case 'metal del bloque p': return strings.catPostTransitionMetal;
      case 'lantánido': return strings.catLanthanide;
      case 'actínido': return strings.catActinide;
      default: return categoryKey;
    }
  }

  private getPhaseLabel(phase: MatterPhase, strings: I18nStrings): string {
    switch (phase) {
      case 'solid': return strings.phaseSolid;
      case 'liquid': return strings.phaseLiquid;
      case 'gas': return strings.phaseGas;
      case 'unknown': return strings.phaseUnknown;
    }
  }

  private getPhaseChipColor(phase: MatterPhase): string {
    return phase === 'unknown' ? '#8a92a5' : getPhaseColor(phase);
  }

  private formatTemperature(tempK: number): string {
    return `${tempK} K (${kelvinToCelsius(tempK)} °C)`;
  }

  private formatPhasePoint(k: number | null): string {
    return k !== null ? `${k} K (${kelvinToCelsius(k)} °C)` : 'N/A';
  }

  private formatDiscoveryCutoff(year: number, strings: I18nStrings): string {
    return year <= ANCIENT_DISCOVERY_SENTINEL ? strings.ancient : String(year);
  }

  private formatOxidationStates(states?: number[]): string {
    if (!states || states.length === 0) return 'N/A';
    return states.map((s) => (s > 0 ? `+${s}` : `${s}`)).join(', ');
  }

  public getElementBlock(el: ElementData): 's' | 'p' | 'd' | 'f' {
    const { row, col } = this.getElementGridPosition(el.Z);
    if (row >= 10) return 'f';
    if (col <= 3 || el.Z === 2) return 's';
    if (col >= 14) return 'p';
    return 'd';
  }

  private countElementsByPhase(): Record<MatterPhase, number> {
    const counts: Record<MatterPhase, number> = { solid: 0, liquid: 0, gas: 0, unknown: 0 };
    for (const el of this.elements) {
      counts[getElementPhase(el.melting_point_k, el.boiling_point_k, this.temperatureK)]++;
    }
    return counts;
  }

  private countDiscoveredElements(): number {
    let count = 0;
    for (const el of this.elements) {
      if (isElementDiscovered(el.discovery_year, this.discoveryYear)) {
        count++;
      }
    }
    return count;
  }

  private renderLegendBar(): string {
    const strings = getStrings();
    switch (this.currentColorScheme) {
      case 'electronegativity':
        return this.renderGradientLegend(
          strings.legendElectronegativity,
          '0.7 (Fr)',
          '4.0 (F)',
          ELECTRONEGATIVITY_GRADIENT,
          `N/A: ${strings.catNobleGas}`
        );
      case 'radius':
        return this.renderGradientLegend(
          strings.legendAtomicRadius,
          '32 pm (He)',
          '260 pm (Fr)',
          RADIUS_GRADIENT
        );
      case 'ionization':
        return this.renderGradientLegend(
          strings.legendIonizationEnergy,
          '376 kJ/mol (Cs)',
          '2372 kJ/mol (He)',
          IONIZATION_GRADIENT,
          'N/A'
        );
      case 'phase':
        return this.renderPhaseLegend(strings);
      case 'discovery':
        return this.renderDiscoveryLegend(strings);
      case 'category':
        return this.renderCategoryLegend(strings);
    }
  }

  private renderCategoryLegend(strings: I18nStrings): string {
    const chips = getLegendCategoryOrder()
      .map(
        (key) =>
          `<span class="cat-chip" style="--cat: ${getCategoryColor(key)}">${escapeHtml(this.getCategoryName(key, strings))}</span>`
      )
      .join('');
    return `
      <div class="periodic-legend-bar category-legend-bar">
        <div class="category-chips">${chips}</div>
      </div>
    `;
  }

  private renderGradientLegend(
    title: string,
    minLabel: string,
    maxLabel: string,
    gradient: string,
    naBadgeText?: string
  ): string {
    const badge = naBadgeText
      ? `<span class="legend-na-badge">${escapeHtml(naBadgeText)}</span>`
      : '';
    return `
      <div class="periodic-legend-bar">
        <div class="legend-header">
          <span class="legend-title">${escapeHtml(title)}</span>
          ${badge}
        </div>
        <div class="legend-gradient-wrapper">
          <span class="legend-val-min">${escapeHtml(minLabel)}</span>
          <div class="legend-gradient-track" style="background: ${gradient}"></div>
          <span class="legend-val-max">${escapeHtml(maxLabel)}</span>
        </div>
      </div>
    `;
  }

  private renderPhaseLegend(strings: I18nStrings): string {
    const counts = this.countElementsByPhase();
    const tempText = this.formatTemperature(this.temperatureK);
    const phaseChips = MATTER_PHASES.map(
      (phase) =>
        `<span class="cat-chip" style="--cat: ${this.getPhaseChipColor(phase)}">${escapeHtml(this.getPhaseLabel(phase, strings))} <span class="numeric" data-phase-count="${phase}">${counts[phase]}</span></span>`
    ).join('');

    const presetButtons = TEMPERATURE_PRESETS.map((preset) => {
      const isActive = this.temperatureK === preset.k;
      const label = preset.labelKey
        ? `${preset.k} K · ${escapeHtml(strings[preset.labelKey])}`
        : `${preset.k} K`;
      return `<button type="button" class="preset-chip ${isActive ? 'active' : ''}" data-temp-k="${preset.k}" aria-pressed="${isActive}">${label}</button>`;
    }).join('');

    return `
      <div class="periodic-legend-bar">
        <div class="legend-header">
          <div class="legend-header-left">
            <span class="legend-title">${escapeHtml(strings.legendPhase)}</span>
            <output class="val-badge" id="phase-temp-readout" for="phase-temp-slider">${tempText}</output>
          </div>
          <div class="legend-header-right">
            ${phaseChips}
          </div>
        </div>
        <div class="legend-controls-row">
          <div class="legend-gradient-wrapper">
            <span class="legend-val-min">${MIN_TEMPERATURE_K} K</span>
            <input type="range" id="phase-temp-slider" min="${MIN_TEMPERATURE_K}" max="${MAX_TEMPERATURE_K}" step="1" value="${this.temperatureK}" aria-label="${escapeHtml(strings.legendPhase)}" aria-valuetext="${tempText}" />
            <span class="legend-val-max">${MAX_TEMPERATURE_K} K</span>
          </div>
          <div class="legend-presets">
            ${presetButtons}
          </div>
        </div>
      </div>
    `;
  }

  private renderDiscoveryLegend(strings: I18nStrings): string {
    const cutoffLabel = escapeHtml(this.formatDiscoveryCutoff(this.discoveryYear, strings));
    const discoveredCount = this.countDiscoveredElements();

    return `
      <div class="periodic-legend-bar">
        <div class="legend-header">
          <div class="legend-header-left">
            <span class="legend-title">${escapeHtml(strings.legendDiscovery)}</span>
            <output class="val-badge" id="discovery-year-readout" for="discovery-year-slider">${cutoffLabel}</output>
          </div>
          <div class="legend-header-right">
            <output class="val-badge" id="discovery-count-readout" for="discovery-year-slider">${discoveredCount} / ${this.elements.length}</output>
          </div>
        </div>
        <div class="legend-gradient-wrapper">
          <span class="legend-val-min">${escapeHtml(strings.ancient)}</span>
          <input type="range" id="discovery-year-slider" min="${ANCIENT_DISCOVERY_SENTINEL}" max="${MAX_DISCOVERY_YEAR}" step="1" value="${this.discoveryYear}" aria-label="${escapeHtml(strings.legendDiscovery)}" aria-valuetext="${cutoffLabel}" />
          <span class="legend-val-max">${MAX_DISCOVERY_YEAR}</span>
        </div>
      </div>
    `;
  }

  private matchesSearchQuery(el: ElementData, query: string): boolean {
    if (!query) return true;
    return (
      el.name_es.toLowerCase().includes(query) ||
      el.name_en.toLowerCase().includes(query) ||
      el.symbol.toLowerCase().includes(query) ||
      String(el.Z).includes(query)
    );
  }

  private isElementDimmed(el: ElementData, query: string): boolean {
    if (!this.matchesSearchQuery(el, query)) return true;
    if (this.selectedBlock !== 'all' && this.getElementBlock(el) !== this.selectedBlock) return true;
    return (
      this.currentColorScheme === 'discovery' &&
      !isElementDiscovered(el.discovery_year, this.discoveryYear)
    );
  }

  private renderGridCells(filterText: string = ''): string {
    const strings = getStrings();
    const query = filterText.toLowerCase().trim();
    let html = '';

    // 1. Group Headers (Columns 1 to 18) -> Row 1, Cols 2 to 19
    for (let g = 1; g <= 18; g++) {
      html += `
        <div class="grid-header-cell group-header-cell" style="grid-column: ${g + 1}; grid-row: 1;">
          <span>${g}</span>
        </div>
      `;
    }

    // 2. Period Headers (Rows 1 to 7) -> Col 1, Rows 2 to 8
    for (let p = 1; p <= 7; p++) {
      html += `
        <div class="grid-header-cell period-header-cell" style="grid-column: 1; grid-row: ${p + 1};">
          <span>${p}</span>
        </div>
      `;
    }

    // 3. Series Placeholders in Main Table (Period 6 and 7, Group 3 -> Row 7 Col 4 and Row 8 Col 4)
    html += `
      <div class="element-cell placeholder-cell" style="grid-column: 4; grid-row: 7;">
        <span class="el-z">57-71</span>
        <span class="el-symbol">*</span>
        <span class="el-name">La-Lu</span>
      </div>
      <div class="element-cell placeholder-cell" style="grid-column: 4; grid-row: 8;">
        <span class="el-z">89-103</span>
        <span class="el-symbol">**</span>
        <span class="el-name">Ac-Lr</span>
      </div>
    `;

    // 4. Series Row Labels for Lanthanides (Row 10) & Actinides (Row 11)
    html += `
      <div class="grid-header-cell series-header-cell" style="grid-column: 1 / 4; grid-row: 10;">
        <span>* 57-71</span>
      </div>
      <div class="grid-header-cell series-header-cell" style="grid-column: 1 / 4; grid-row: 11;">
        <span>** 89-103</span>
      </div>
    `;

    // 5. Element Cells
    const elementCellsHtml = this.elements
      .map((el) => {
        const block = this.getElementBlock(el);
        const isDimmed = this.isElementDimmed(el, query);
        const gridPos = this.getElementGridPosition(el.Z);
        const color = this.getElementColor(el);
        const name = this.getElementName(el);
        const catName = this.getCategoryName(el.category, strings);
        const ariaLabel = `${name} (${el.symbol}), Z=${el.Z}, ${catName}`;
        const isSelected = this.selectedElement?.Z === el.Z;

        return `
          <div class="element-cell ${isDimmed ? 'dimmed' : ''} ${isSelected ? 'selected' : ''}"
               role="option"
               tabindex="${isSelected ? '0' : '-1'}"
               aria-selected="${isSelected}"
               aria-label="${escapeHtml(ariaLabel)}"
               data-z="${el.Z}"
               data-row="${gridPos.row}"
               data-col="${gridPos.col}"
               data-block="${block}"
               style="grid-column: ${gridPos.col}; grid-row: ${gridPos.row}; --cat: ${color};">
            <span class="el-z">${el.Z}</span>
            <span class="el-symbol">${escapeHtml(el.symbol)}</span>
            <span class="el-name">${escapeHtml(name)}</span>
          </div>
        `;
      })
      .join('');

    return html + elementCellsHtml;
  }

  private getElementGridPosition(z: number): { row: number; col: number } {
    for (const range of GRID_RANGES) {
      if (z <= range.maxZ) {
        return { row: range.row, col: z + range.colOffset };
      }
    }
    return { row: 2, col: 2 };
  }

  private getElementColor(el: ElementData): string {
    switch (this.currentColorScheme) {
      case 'category':
        return getCategoryColor(el.category);
      case 'electronegativity':
        return getElectronegativityColor(el.electronegativity);
      case 'radius':
        return getRadiusColor(el.radius_pm);
      case 'ionization':
        return getIonizationColor(el.ionization_energy);
      case 'phase':
        return getPhaseColor(
          getElementPhase(el.melting_point_k, el.boiling_point_k, this.temperatureK)
        );
      case 'discovery':
        return getDiscoveryColor(el.discovery_year, this.discoveryYear);
    }
  }

  private updateGridAppearance(filterText: string): void {
    const query = filterText.toLowerCase().trim();
    const cells = this.container.querySelectorAll<HTMLElement>(
      '#periodic-grid .element-cell:not(.placeholder-cell)'
    );
    cells.forEach((cell) => {
      const z = Number.parseInt(cell.dataset.z!, 10);
      const el = this.elements[z - 1];
      cell.style.setProperty('--cat', this.getElementColor(el));
      cell.classList.toggle('dimmed', this.isElementDimmed(el, query));
    });

    if (this.selectedElement) {
      const badge = this.container.querySelector<HTMLElement>('.quick-el-badge');
      if (badge) {
        badge.style.borderColor = this.getElementColor(this.selectedElement);
      }
    }
  }

  private updateInspectorPhaseInPlace(): void {
    const el = this.selectedElement;
    if (!el) return;

    const strings = getStrings();
    const phase = getElementPhase(el.melting_point_k, el.boiling_point_k, this.temperatureK);

    const tempEl = this.container.querySelector<HTMLElement>('#inspector-phase-temp');
    if (tempEl) {
      tempEl.textContent = `(${this.temperatureK} K)`;
    }

    const pillEl = this.container.querySelector<HTMLElement>('#inspector-phase-pill');
    if (pillEl) {
      pillEl.style.setProperty('--cat', this.getPhaseChipColor(phase));
      pillEl.textContent = this.getPhaseLabel(phase, strings);
    }
  }

  private renderQuickInspectorContent(): string {
    const strings = getStrings();
    if (!this.selectedElement) {
      return `<div class="quick-inspector-placeholder"><span>${escapeHtml(strings.selectElementPrompt)}</span></div>`;
    }

    const el = this.selectedElement;
    const name = this.getElementName(el);
    const color = this.getElementColor(el);

    return `
      <div class="quick-inspector-card" id="quick-inspector-trigger">
        <div class="quick-el-badge" style="border-color: ${color}">
          <span class="quick-z">${el.Z}</span>
          <span class="quick-symbol">${escapeHtml(el.symbol)}</span>
        </div>
        <div class="quick-el-info">
          <span class="quick-name">${escapeHtml(name)}</span>
          <span class="quick-config"><code>${escapeHtml(el.electron_config_str)}</code></span>
        </div>
        <div class="quick-actions">
          <button type="button" class="btn-primary btn-quick-3d" id="btn-quick-3d" title="${escapeHtml(strings.btnView3DOrbital)}">
            ${icon('atom')}
            <span>3D</span>
          </button>
          <button type="button" class="btn-secondary btn-quick-details" id="btn-quick-details" title="${escapeHtml(strings.viewFullDetails)}">
            ${icon('chart')}
          </button>
        </div>
      </div>
    `;
  }

  private renderInspectorContent(): string {
    const strings = getStrings();

    if (!this.selectedElement) {
      return `
        <div class="inspector-placeholder">
          <p>${escapeHtml(strings.selectElementPrompt)}</p>
        </div>
      `;
    }

    const el = this.selectedElement;
    const elementName = this.getElementName(el);
    const categoryName = this.getCategoryName(el.category, strings);
    const discoveryStr = isAncientDiscovery(el.discovery_year)
      ? strings.ancient
      : String(el.discovery_year);
    const phase = getElementPhase(el.melting_point_k, el.boiling_point_k, this.temperatureK);
    const phaseChipColor = this.getPhaseChipColor(phase);
    const usesChips = el.uses
      .map((key) => `<span class="use-chip">${escapeHtml(strings.elementUses[key])}</span>`)
      .join('');
    const ionizationText =
      el.ionization_energy !== null ? `${el.ionization_energy} kJ/mol` : 'N/A';

    return `
      <div class="inspector-card">
        <div class="inspector-header">
          <div class="insp-header-title">
            <span class="insp-z">Z = ${el.Z} <button type="button" class="btn-info-icon" data-explain="explainAtomicNumber" aria-label="Info">${icon('info')}</button></span>
            <h2 class="insp-symbol">${escapeHtml(el.symbol)}</h2>
            <span class="insp-name">${escapeHtml(elementName)}</span>
            <span class="insp-category">${escapeHtml(categoryName)}</span>
          </div>
        </div>

        ${this.renderPreview()}

        <button type="button" class="btn-primary btn-inspector-view-3d" id="btn-view-orbital">
          ${icon('atom')}
          <span>${escapeHtml(strings.btnView3DOrbital)}</span>
        </button>

        <div class="inspector-details">
          <div class="inspector-uses-section">
            <h4 class="section-title">${escapeHtml(strings.dailyLifeTitle)}</h4>
            <div class="inspector-uses-chips">
              ${usesChips}
            </div>
          </div>
          <div class="detail-row">
            <span class="detail-row-label">${escapeHtml(strings.colorPhase)} <small id="inspector-phase-temp" class="numeric">(${this.temperatureK} K)</small></span>
            <strong><span id="inspector-phase-pill" class="cat-chip" style="--cat: ${phaseChipColor}">${escapeHtml(this.getPhaseLabel(phase, strings))}</span></strong>
          </div>
          ${this.detailRow(strings.meltingPoint, null, this.formatPhasePoint(el.melting_point_k))}
          ${this.detailRow(strings.boilingPoint, null, this.formatPhasePoint(el.boiling_point_k))}
          ${this.detailRow(strings.atomicMass, 'explainAtomicMass', `${el.atomic_mass} u`)}
          ${this.detailRow(strings.electronConfig, 'explainElectronConfig', `<code>${escapeHtml(el.electron_config_str)}</code>`)}
          ${this.detailRow(strings.atomicRadius, 'explainAtomicRadius', `${el.radius_pm} pm`)}
          ${this.detailRow(strings.electronegativity, 'explainElectronegativity', escapeHtml(String(el.electronegativity ?? 'N/A')))}
          ${this.detailRow(strings.ionizationEnergy, 'explainIonizationEnergy', ionizationText)}
          ${this.detailRow(strings.oxidationStates, null, escapeHtml(this.formatOxidationStates(el.oxidation_states)))}
          ${this.detailRow(strings.discovery, null, escapeHtml(discoveryStr))}
        </div>
      </div>
    `;
  }

  /**
   * Thumbnail of the element's valence cloud.
   *
   * The readout under it is filled in by `updatePreview`, because both halves of
   * it come out of WASM: the subshell name and the mean radius are properties of
   * the state, not of the element, and the element alone does not determine them
   * until the valence solve comes back.
   */
  private renderPreview(): string {
    const strings = getStrings();
    return `
      <div
        class="orbital-preview"
        id="orbital-preview"
        title="${escapeHtml(strings.orbitalPreviewHint)}"
      >
        <div class="orbital-preview-head">
          <span class="orbital-preview-label">${escapeHtml(strings.orbitalPreviewTitle)}</span>
          <span class="orbital-preview-state" id="orbital-preview-state"></span>
        </div>
        <div class="orbital-preview-stage" id="orbital-preview-stage" role="img"></div>
        <div class="orbital-preview-readout" id="orbital-preview-readout"></div>
      </div>
    `;
  }

  /**
   * Resolves the valence state of the selection and hands it to the thumbnail.
   *
   * The same solve feeds the 3D tab, so the preview cannot advertise an orbital
   * the big renderer would never show. Both of its steps are async, so the
   * selection is re-checked afterwards: walking a row of the table can leave
   * several solves in flight, and the slowest one is the first, not the last.
   *
   * Never rejects - it handles its own failures - so callers can fire and forget.
   */
  private async updatePreview(): Promise<void> {
    const element = this.selectedElement;
    if (!element) return;
    const z = element.Z;

    try {
      const { n, l, m, zEff } = await calculateValenceQuantumNumbers(z);
      if (this.selectedElement?.Z !== z) return;

      const state = this.container.querySelector<HTMLElement>('#orbital-preview-state');
      if (state) {
        state.textContent = subshellName(n, l);
      }

      const readout = this.container.querySelector<HTMLElement>('#orbital-preview-readout');
      if (readout) {
        readout.textContent = `Z_eff ${zEff.toFixed(2)} · ⟨r⟩ ${meanRadiusBohr(n, l, zEff).toFixed(2)} a₀`;
      }

      const stage = this.container.querySelector<HTMLElement>('#orbital-preview-stage');
      if (stage) {
        stage.setAttribute(
          'aria-label',
          `${getStrings().orbitalPreviewTitle} ${subshellName(n, l)}`
        );
        this.preview.mount(stage);
      }
      await this.preview.showOrbital({ n, l, m, useRealOrbital: true, zEff });
    } catch (error) {
      // The WASM engine rejects unsupported states rather than clamping them, and
      // this runs detached from any event handler, so a rejection would otherwise
      // surface as an unhandled promise with an empty thumbnail and no clue.
      console.error('[atomic-explorer] failed to preview valence orbital', z, error);
    }
  }

  private detailRow(label: string, explainKey: string | null, valueHtml: string): string {
    const infoBtn = explainKey
      ? `<button type="button" class="btn-info-icon" data-explain="${explainKey}" aria-label="Info">${icon('info')}</button>`
      : '';
    return `
      <div class="detail-row">
        <span class="detail-row-label">${escapeHtml(label)}${infoBtn}</span>
        <strong>${valueHtml}</strong>
      </div>
    `;
  }

  private openFullInspector(): void {
    if (window.innerWidth <= 1024) {
      const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
      const backdrop = this.container.querySelector('#periodic-drawer-backdrop') as HTMLElement;
      inspector.classList.add('mobile-open');
      backdrop.classList.add('active');
    }
  }

  private closeFullInspector(): void {
    const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
    const backdrop = this.container.querySelector('#periodic-drawer-backdrop') as HTMLElement;
    inspector.classList.remove('mobile-open');
    backdrop.classList.remove('active');
  }

  public selectElement(el: ElementData): void {
    this.selectedElement = el;

    const grid = this.container.querySelector('#periodic-grid');
    if (grid) {
      grid.querySelectorAll<HTMLElement>('.element-cell').forEach((c) => {
        const isMatch = c.dataset.z === String(el.Z);
        c.classList.toggle('selected', isMatch);
        c.setAttribute('aria-selected', String(isMatch));
        // Roving tabindex: the whole grid is a single tab stop.
        c.tabIndex = isMatch ? 0 : -1;
      });
    }

    const quickInspector = this.container.querySelector<HTMLElement>('#mobile-quick-inspector');
    if (quickInspector) {
      quickInspector.innerHTML = this.renderQuickInspectorContent();
    }

    const inspector = this.container.querySelector<HTMLElement>('#element-inspector');
    if (inspector) {
      const closeLabel = escapeHtml(getStrings().infoModalClose);
      inspector.innerHTML = `
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header-actions mobile-only-header">
          <button type="button" class="panel-close-btn" id="btn-close-inspector" aria-label="${closeLabel}">${icon('close')}</button>
        </div>
        ${this.renderInspectorContent()}
      `;
      ExplanationModal.attachInfoButtons(inspector);
    }

    void this.updatePreview();
    this.onStateChange?.();
  }

  public getSelectedElement(): ElementData | null {
    return this.selectedElement;
  }

  private getSearchQuery(): string {
    const searchInput = this.container.querySelector<HTMLInputElement>('#element-search');
    return searchInput ? searchInput.value : '';
  }

  private syncLegendRangeFills(): void {
    this.container
      .querySelectorAll<HTMLInputElement>('#periodic-legend-container input[type="range"]')
      .forEach(syncRangeFill);
  }

  private refreshLegend(): void {
    const legendContainer = this.container.querySelector<HTMLElement>('#periodic-legend-container');
    if (legendContainer) {
      legendContainer.innerHTML = this.renderLegendBar();
      this.syncLegendRangeFills();
    }
  }

  private syncBlockFilterButtons(): void {
    this.container.querySelectorAll<HTMLElement>('.btn-block-filter').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.block === this.selectedBlock);
    });
  }

  private applyTemperatureUpdate(tempK: number, slider: HTMLInputElement | null): void {
    this.temperatureK = tempK;
    const tempText = this.formatTemperature(tempK);

    if (slider) {
      syncRangeFill(slider);
      slider.setAttribute('aria-valuetext', tempText);
    }

    const readout = this.container.querySelector<HTMLElement>('#phase-temp-readout');
    if (readout) {
      readout.textContent = tempText;
    }

    const counts = this.countElementsByPhase();
    for (const phase of MATTER_PHASES) {
      const span = this.container.querySelector<HTMLElement>(`[data-phase-count="${phase}"]`);
      if (span) {
        span.textContent = String(counts[phase]);
      }
    }

    this.container.querySelectorAll<HTMLElement>('.preset-chip[data-temp-k]').forEach((chip) => {
      const isActive = Number.parseInt(chip.dataset.tempK!, 10) === tempK;
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });

    this.updateGridAppearance(this.getSearchQuery());
    this.updateInspectorPhaseInPlace();
  }

  private applyDiscoveryYearUpdate(year: number, slider: HTMLInputElement): void {
    this.discoveryYear = year;
    const cutoffText = this.formatDiscoveryCutoff(year, getStrings());

    syncRangeFill(slider);
    slider.setAttribute('aria-valuetext', cutoffText);

    const yearReadout = this.container.querySelector<HTMLElement>('#discovery-year-readout');
    if (yearReadout) {
      yearReadout.textContent = cutoffText;
    }

    const countReadout = this.container.querySelector<HTMLElement>('#discovery-count-readout');
    if (countReadout) {
      countReadout.textContent = `${this.countDiscoveredElements()} / ${this.elements.length}`;
    }

    this.updateGridAppearance(this.getSearchQuery());
  }

  private handleLegendInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'phase-temp-slider') {
      this.applyTemperatureUpdate(Number.parseInt(target.value, 10), target);
    } else if (target.id === 'discovery-year-slider') {
      this.applyDiscoveryYearUpdate(Number.parseInt(target.value, 10), target);
    }
  }

  private handleLegendClick(e: MouseEvent, legendContainer: HTMLElement): void {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.preset-chip[data-temp-k]');
    if (!chip) return;
    const tempK = Number.parseInt(chip.dataset.tempK!, 10);
    const slider = legendContainer.querySelector<HTMLInputElement>('#phase-temp-slider');
    if (slider) {
      slider.value = String(tempK);
    }
    this.applyTemperatureUpdate(tempK, slider);
  }

  private handleContainerClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;

    const orbitalBtn = target.closest<HTMLElement>(
      '#btn-quick-3d, #btn-view-orbital, #orbital-preview'
    );
    if (orbitalBtn) {
      e.stopPropagation();
      if (this.selectedElement) {
        this.closeFullInspector();
        this.onSelectElementOrbital(this.selectedElement);
      }
      return;
    }

    const detailsBtn = target.closest<HTMLElement>('#btn-quick-details, #quick-inspector-trigger');
    if (detailsBtn) {
      e.stopPropagation();
      this.openFullInspector();
      return;
    }

    const closeBtn = target.closest<HTMLElement>(
      '#btn-close-inspector, #periodic-drawer-backdrop'
    );
    if (closeBtn) {
      this.closeFullInspector();
    }
  }

  private attachEventListeners(): void {
    const colorSelect = this.container.querySelector('#color-scheme-select') as HTMLSelectElement;
    const searchInput = this.container.querySelector('#element-search') as HTMLInputElement;
    const grid = this.container.querySelector('#periodic-grid') as HTMLElement;
    const legendContainer = this.container.querySelector(
      '#periodic-legend-container'
    ) as HTMLElement;

    this.syncLegendRangeFills();

    colorSelect.addEventListener('change', () => {
      this.currentColorScheme = colorSelect.value as ColorScheme;
      legendContainer.innerHTML = this.renderLegendBar();
      this.syncLegendRangeFills();
      this.updateGridAppearance(searchInput.value);
      this.onStateChange?.();
    });

    // Block Filter Buttons
    this.container.querySelectorAll<HTMLElement>('.btn-block-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const block = btn.dataset.block as ChemicalBlock;
        if (block) {
          this.selectedBlock = block;
          this.syncBlockFilterButtons();
          this.updateGridAppearance(searchInput.value);
          this.onStateChange?.();
        }
      });
    });

    searchInput.addEventListener('input', () => {
      this.updateGridAppearance(searchInput.value);
    });

    legendContainer.addEventListener('input', (e: Event) => {
      this.handleLegendInput(e);
    });

    legendContainer.addEventListener('click', (e: MouseEvent) => {
      this.handleLegendClick(e, legendContainer);
    });

    // Click on element cell
    grid.addEventListener('click', (e) => {
      const data = this.getElementFromEvent(e);
      if (data) {
        this.selectElement(data.el);
      }
    });

    // Double-click to launch 3D orbital directly
    grid.addEventListener('dblclick', (e) => {
      const data = this.getElementFromEvent(e);
      if (data) {
        this.selectElement(data.el);
        this.closeFullInspector();
        this.onSelectElementOrbital(data.el);
      }
    });

    // Keyboard navigation & selection
    grid.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleGridKeydown(e, grid);
    });

    // Unified container click delegation. Assigned rather than added because
    // `render` runs on every language change while the container element itself
    // is never replaced, so addEventListener would stack a handler per change.
    this.container.onclick = (e: MouseEvent) => {
      this.handleContainerClick(e);
    };

    ExplanationModal.attachInfoButtons(this.container);
  }

  private getElementFromEvent(e: Event): { cell: HTMLElement; el: ElementData; z: number } | null {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(
      '.element-cell:not(.placeholder-cell)'
    );
    const zStr = cell?.dataset.z;
    if (!cell || !zStr) return null;
    const z = Number.parseInt(zStr, 10);
    const el = this.elements.find((item) => item.Z === z);
    if (!el) return null;
    return { cell, el, z };
  }

  private handleGridKeydown(e: KeyboardEvent, grid: HTMLElement): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const data = this.getElementFromEvent(e);
    if (!data) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleCellActivation(e.key, data.el);
    } else if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown'
    ) {
      this.handleCellArrowNavigation(e, data.cell, data.z, grid);
    }
  }

  private handleCellActivation(key: string, el: ElementData): void {
    if (this.selectedElement?.Z === el.Z && key === 'Enter') {
      this.closeFullInspector();
      this.onSelectElementOrbital(el);
    } else {
      this.selectElement(el);
    }
  }

  private handleCellArrowNavigation(
    e: KeyboardEvent,
    target: HTMLElement,
    currentZ: number,
    grid: HTMLElement
  ): void {
    const cells = Array.from(
      grid.querySelectorAll<HTMLElement>('.element-cell:not(.placeholder-cell)')
    );
    const nextCell = this.findNextCell(e.key, target, currentZ, cells);

    if (nextCell) {
      e.preventDefault();
      target.tabIndex = -1;
      nextCell.tabIndex = 0;
      nextCell.focus();
      nextCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const nextZ = Number.parseInt(nextCell.dataset.z!, 10);
      const nextEl = this.elements.find((item) => item.Z === nextZ);
      if (nextEl) {
        this.selectElement(nextEl);
      }
    }
  }

  private findNextCell(
    key: string,
    target: HTMLElement,
    currentZ: number,
    cells: HTMLElement[]
  ): HTMLElement | undefined {
    const currentRow = Number.parseInt(target.dataset.row!, 10);
    const currentCol = Number.parseInt(target.dataset.col!, 10);

    switch (key) {
      case 'ArrowRight':
        return this.findCellRight(cells, currentRow, currentCol, currentZ);
      case 'ArrowLeft':
        return this.findCellLeft(cells, currentRow, currentCol, currentZ);
      case 'ArrowDown':
        return this.findCellDown(cells, currentRow, currentCol);
      case 'ArrowUp':
        return this.findCellUp(cells, currentRow, currentCol);
      default:
        return undefined;
    }
  }

  private findCellRight(
    cells: HTMLElement[],
    currentRow: number,
    currentCol: number,
    currentZ: number
  ): HTMLElement | undefined {
    const nextInRow = cells
      .filter(
        (c) =>
          Number.parseInt(c.dataset.row!, 10) === currentRow &&
          Number.parseInt(c.dataset.col!, 10) > currentCol
      )
      .sort((a, b) => Number.parseInt(a.dataset.col!, 10) - Number.parseInt(b.dataset.col!, 10))[0];

    if (nextInRow) {
      return nextInRow;
    }
    return cells.find((c) => Number.parseInt(c.dataset.z!, 10) === currentZ + 1);
  }

  private findCellLeft(
    cells: HTMLElement[],
    currentRow: number,
    currentCol: number,
    currentZ: number
  ): HTMLElement | undefined {
    const nextInRow = cells
      .filter(
        (c) =>
          Number.parseInt(c.dataset.row!, 10) === currentRow &&
          Number.parseInt(c.dataset.col!, 10) < currentCol
      )
      .sort((a, b) => Number.parseInt(b.dataset.col!, 10) - Number.parseInt(a.dataset.col!, 10))[0];

    if (nextInRow) {
      return nextInRow;
    }
    return cells.find((c) => Number.parseInt(c.dataset.z!, 10) === currentZ - 1);
  }

  private findCellDown(
    cells: HTMLElement[],
    currentRow: number,
    currentCol: number
  ): HTMLElement | undefined {
    return cells
      .filter(
        (c) =>
          Number.parseInt(c.dataset.col!, 10) === currentCol &&
          Number.parseInt(c.dataset.row!, 10) > currentRow
      )
      .sort((a, b) => Number.parseInt(a.dataset.row!, 10) - Number.parseInt(b.dataset.row!, 10))[0];
  }

  private findCellUp(
    cells: HTMLElement[],
    currentRow: number,
    currentCol: number
  ): HTMLElement | undefined {
    return cells
      .filter(
        (c) =>
          Number.parseInt(c.dataset.col!, 10) === currentCol &&
          Number.parseInt(c.dataset.row!, 10) < currentRow
      )
      .sort((a, b) => Number.parseInt(b.dataset.row!, 10) - Number.parseInt(a.dataset.row!, 10))[0];
  }
}

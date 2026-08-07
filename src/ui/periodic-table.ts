import elementsData from '../../assets/data/elements.json';
import { getStrings, getLanguage, onLanguageChange, I18nStrings, ConceptExplanation } from '../i18n';
import { ExplanationModal } from './info-modal';

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
  oxidation_states?: number[] | string;
  discovery_year: number | string;
}

export class PeriodicTableView {
  private container: HTMLElement;
  private elements: ElementData[] = elementsData as ElementData[];
  private selectedElement: ElementData | null = null;
  private currentColorScheme: 'category' | 'electronegativity' | 'radius' = 'category';
  private onSelectElementOrbital: (element: ElementData) => void;

  constructor(container: HTMLElement, onSelectElementOrbital: (element: ElementData) => void) {
    this.container = container;
    this.onSelectElementOrbital = onSelectElementOrbital;
    this.selectedElement = this.elements.find((e) => e.Z === 1) || this.elements[0] || null;
    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const strings = getStrings();

    this.container.innerHTML = `
      <div class="periodic-table-wrapper">
        <div class="table-toolbar">
          <div class="toolbar-group">
            <label for="color-scheme-select">${strings.colorCoding}:</label>
            <select id="color-scheme-select">
              <option value="category" ${this.currentColorScheme === 'category' ? 'selected' : ''}>${strings.colorCategory}</option>
              <option value="electronegativity" ${this.currentColorScheme === 'electronegativity' ? 'selected' : ''}>${strings.colorElectronegativity}</option>
              <option value="radius" ${this.currentColorScheme === 'radius' ? 'selected' : ''}>${strings.colorRadius}</option>
            </select>
          </div>
          <div class="toolbar-group search-group">
            <input type="text" id="element-search" placeholder="${strings.searchPlaceholder}" />
          </div>
        </div>

        <div class="periodic-grid-container">
          <div class="periodic-grid" id="periodic-grid">
            ${this.renderGridCells()}
          </div>
          <div class="periodic-scroll-hint">
            <span>👈 ${strings.swipeToExplore} 👉</span>
          </div>
          <div class="periodic-trends-card">
            <div class="trends-card-header">
              <h4>${strings.periodicTrendsGuideTitle}</h4>
              <button class="btn-info-icon" data-explain="explainAtomicRadius" aria-label="Info">ℹ️</button>
            </div>
            <p>${strings.periodicTrendsGuideText}</p>
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
            <button class="panel-close-btn" id="btn-close-inspector" aria-label="Close">✕</button>
          </div>
          ${this.renderInspectorContent()}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private getElementName(el: ElementData): string {
    const lang = getLanguage();
    return lang === 'es' ? el.name_es : (el.name_en || el.name_es);
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

  private renderGridCells(filterText: string = ''): string {
    const query = filterText.toLowerCase().trim();

    return this.elements
      .map((el) => {
        const nameEs = el.name_es.toLowerCase();
        const nameEn = (el.name_en || '').toLowerCase();
        const matches =
          !query ||
          nameEs.includes(query) ||
          nameEn.includes(query) ||
          el.symbol.toLowerCase().includes(query) ||
          String(el.Z).includes(query);

        const gridPos = this.getElementGridPosition(el.Z);
        const color = this.getElementColor(el);
        const name = this.getElementName(el);

        return `
          <div class="element-cell ${matches ? '' : 'dimmed'} ${this.selectedElement?.Z === el.Z ? 'selected' : ''}"
               data-z="${el.Z}"
               style="grid-column: ${gridPos.col}; grid-row: ${gridPos.row}; background-color: ${color};">
            <span class="el-z">${el.Z}</span>
            <span class="el-symbol">${el.symbol}</span>
            <span class="el-name">${name}</span>
          </div>
        `;
      })
      .join('');
  }

  private getElementGridPosition(z: number): { row: number; col: number } {
    if (z === 1) return { row: 1, col: 1 };
    if (z === 2) return { row: 1, col: 18 };

    if (z >= 3 && z <= 4) return { row: 2, col: z - 2 };
    if (z >= 5 && z <= 10) return { row: 2, col: z + 8 };

    if (z >= 11 && z <= 12) return { row: 3, col: z - 10 };
    if (z >= 13 && z <= 18) return { row: 3, col: z };

    if (z >= 19 && z <= 36) return { row: 4, col: z - 18 };
    if (z >= 37 && z <= 54) return { row: 5, col: z - 36 };

    if (z === 55 || z === 56) return { row: 6, col: z - 54 };
    if (z >= 57 && z <= 71) return { row: 9, col: z - 54 }; // Lanthanides
    if (z >= 72 && z <= 86) return { row: 6, col: z - 68 };

    if (z === 87 || z === 88) return { row: 7, col: z - 86 };
    if (z >= 89 && z <= 103) return { row: 10, col: z - 86 }; // Actinides
    if (z >= 104 && z <= 118) return { row: 7, col: z - 100 };

    return { row: 1, col: 1 };
  }

  private getElementColor(el: ElementData): string {
    if (this.currentColorScheme === 'category') {
      const categoryColors: Record<string, string> = {
        'no metal': 'rgba(40, 160, 220, 0.7)',
        'gas noble': 'rgba(160, 60, 220, 0.7)',
        'metal alcalino': 'rgba(240, 90, 90, 0.7)',
        'alcalinotérreo': 'rgba(240, 160, 60, 0.7)',
        'metaloide': 'rgba(40, 180, 140, 0.7)',
        'halógeno': 'rgba(200, 200, 40, 0.7)',
        'metal de transición': 'rgba(120, 140, 220, 0.7)',
        'metal del bloque p': 'rgba(100, 180, 240, 0.7)',
        'lantánido': 'rgba(220, 140, 180, 0.7)',
        'actínido': 'rgba(200, 100, 160, 0.7)',
      };
      return categoryColors[el.category] || 'rgba(100, 100, 120, 0.7)';
    } else if (this.currentColorScheme === 'electronegativity') {
      if (el.electronegativity === null) return 'rgba(60, 60, 70, 0.6)';
      const t = Math.min(1, Math.max(0, (el.electronegativity - 0.7) / (4.0 - 0.7)));
      const r = Math.round(t * 255);
      const b = Math.round((1 - t) * 255);
      return `rgba(${r}, 100, ${b}, 0.75)`;
    } else {
      const t = Math.min(1, Math.max(0, (el.radius_pm - 30) / (260 - 30)));
      const g = Math.round(t * 220);
      const b = Math.round((1 - t) * 240);
      return `rgba(50, ${g}, ${b}, 0.75)`;
    }
  }

  private renderQuickInspectorContent(): string {
    const strings = getStrings();
    if (!this.selectedElement) {
      return `<div class="quick-inspector-placeholder"><span>${strings.selectElementPrompt}</span></div>`;
    }

    const el = this.selectedElement;
    const name = this.getElementName(el);
    const color = this.getElementColor(el);

    return `
      <div class="quick-inspector-card" id="quick-inspector-trigger">
        <div class="quick-el-badge" style="border-color: ${color}">
          <span class="quick-z">${el.Z}</span>
          <span class="quick-symbol">${el.symbol}</span>
        </div>
        <div class="quick-el-info">
          <span class="quick-name">${name}</span>
          <span class="quick-config"><code>${el.electron_config_str}</code></span>
        </div>
        <div class="quick-actions">
          <button class="btn-primary btn-quick-3d" id="btn-quick-3d" title="${strings.btnView3DOrbital}">
            ⚛️ 3D
          </button>
          <button class="btn-secondary btn-quick-details" id="btn-quick-details" title="${strings.viewFullDetails}">
            📋
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
          <p>${strings.selectElementPrompt}</p>
        </div>
      `;
    }

    const el = this.selectedElement;
    const elementName = this.getElementName(el);
    const categoryName = this.getCategoryName(el.category, strings);

    const discoveryStr =
      el.discovery_year === 'Antigüedad' || el.discovery_year === 'Ancient'
        ? strings.ancient
        : String(el.discovery_year);

    return `
      <div class="inspector-card">
        <div class="inspector-header">
          <div class="insp-header-title">
            <span class="insp-z">Z = ${el.Z}</span>
            <h2 class="insp-symbol">${el.symbol}</h2>
            <span class="insp-name">${elementName}</span>
            <span class="insp-category">${categoryName}</span>
          </div>
          <button class="btn-primary btn-inspector-view-3d" id="btn-view-orbital">
            ${strings.btnView3DOrbital}
          </button>
        </div>

        <div class="inspector-details">
          <div class="detail-row">
            <span>${strings.atomicMass} <button class="btn-info-icon" data-explain="explainAtomicMass" aria-label="Info">ℹ️</button>:</span>
            <strong>${el.atomic_mass} u</strong>
          </div>
          <div class="detail-row">
            <span>${strings.electronConfig} <button class="btn-info-icon" data-explain="explainElectronConfig" aria-label="Info">ℹ️</button>:</span>
            <strong><code>${el.electron_config_str}</code></strong>
          </div>
          <div class="detail-row">
            <span>${strings.atomicRadius} <button class="btn-info-icon" data-explain="explainAtomicRadius" aria-label="Info">ℹ️</button>:</span>
            <strong>${el.radius_pm} pm</strong>
          </div>
          <div class="detail-row">
            <span>${strings.electronegativity} <button class="btn-info-icon" data-explain="explainElectronegativity" aria-label="Info">ℹ️</button>:</span>
            <strong>${el.electronegativity ?? 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.ionizationEnergy} <button class="btn-info-icon" data-explain="explainIonizationEnergy" aria-label="Info">ℹ️</button>:</span>
            <strong>${el.ionization_energy ? `${el.ionization_energy} kJ/mol` : 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.oxidationStates}:</span>
            <strong>${el.oxidation_states ? (Array.isArray(el.oxidation_states) ? el.oxidation_states.map(s => s > 0 ? `+${s}` : `${s}`).join(', ') : el.oxidation_states) : 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.discovery}:</span>
            <strong>${discoveryStr}</strong>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    const colorSelect = this.container.querySelector('#color-scheme-select') as HTMLSelectElement;
    const searchInput = this.container.querySelector('#element-search') as HTMLInputElement;
    const grid = this.container.querySelector('#periodic-grid') as HTMLElement;

    const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
    const backdrop = this.container.querySelector('#periodic-drawer-backdrop') as HTMLElement;
    const btnCloseInspector = this.container.querySelector('#btn-close-inspector');

    const openFullInspector = () => {
      if (window.innerWidth <= 1024) {
        inspector?.classList.add('mobile-open');
        backdrop?.classList.add('active');
      }
    };

    const closeFullInspector = () => {
      inspector?.classList.remove('mobile-open');
      backdrop?.classList.remove('active');
    };

    btnCloseInspector?.addEventListener('click', closeFullInspector);
    backdrop?.addEventListener('click', closeFullInspector);

    colorSelect?.addEventListener('change', () => {
      this.currentColorScheme = colorSelect.value as 'category' | 'electronegativity' | 'radius';
      grid.innerHTML = this.renderGridCells(searchInput?.value || '');
      this.attachCellClickEvents();
    });

    searchInput?.addEventListener('input', () => {
      grid.innerHTML = this.renderGridCells(searchInput.value);
      this.attachCellClickEvents();
    });

    this.attachQuickInspectorEvents(openFullInspector, closeFullInspector);
    this.attachCellClickEvents();
    this.attachInfoButtonEvents(this.container);
  }

  private attachQuickInspectorEvents(openFullInspector: () => void, closeFullInspector: () => void): void {
    const quick3dBtn = this.container.querySelector('#btn-quick-3d');
    const quickDetailsBtn = this.container.querySelector('#btn-quick-details');
    const quickTrigger = this.container.querySelector('#quick-inspector-trigger');
    const inspector3dBtn = this.container.querySelector('#btn-view-orbital');

    quick3dBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.selectedElement) {
        closeFullInspector();
        this.onSelectElementOrbital(this.selectedElement);
      }
    });

    quickDetailsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullInspector();
    });

    quickTrigger?.addEventListener('click', () => {
      openFullInspector();
    });

    inspector3dBtn?.addEventListener('click', () => {
      if (this.selectedElement) {
        closeFullInspector();
        this.onSelectElementOrbital(this.selectedElement);
      }
    });
  }

  private attachInfoButtonEvents(parent: HTMLElement): void {
    const infoBtns = parent.querySelectorAll('.btn-info-icon');
    const strings = getStrings();
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
  }

  private attachCellClickEvents(): void {
    const cells = this.container.querySelectorAll('.element-cell');
    const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
    const quickInspector = this.container.querySelector('#mobile-quick-inspector') as HTMLElement;

    const openFullInspector = () => {
      if (window.innerWidth <= 1024) {
        inspector?.classList.add('mobile-open');
        const backdrop = this.container.querySelector('#periodic-drawer-backdrop');
        backdrop?.classList.add('active');
      }
    };

    const closeFullInspector = () => {
      inspector?.classList.remove('mobile-open');
      const backdrop = this.container.querySelector('#periodic-drawer-backdrop');
      backdrop?.classList.remove('active');
    };

    cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const z = parseInt(cell.getAttribute('data-z') || '1', 10);
        this.selectedElement = this.elements.find((e) => e.Z === z) || null;

        cells.forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');

        // Update Quick Inspector Bar
        if (quickInspector) {
          quickInspector.innerHTML = this.renderQuickInspectorContent();
        }

        // Update Full Inspector Panel
        if (inspector) {
          inspector.innerHTML = `
            <div class="mobile-drawer-handle"></div>
            <div class="panel-header-actions mobile-only-header">
              <button class="panel-close-btn" id="btn-close-inspector" aria-label="Close">✕</button>
            </div>
            ${this.renderInspectorContent()}
          `;
          this.attachInfoButtonEvents(inspector);

          const closeBtn = inspector.querySelector('#btn-close-inspector');
          closeBtn?.addEventListener('click', closeFullInspector);
        }

        this.attachQuickInspectorEvents(openFullInspector, closeFullInspector);
      });
    });
  }
}


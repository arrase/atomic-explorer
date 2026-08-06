import elementsData from '../../assets/data/elements.json';
import { getStrings, getLanguage, onLanguageChange, I18nStrings } from '../i18n';

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
        </div>

        <div class="element-inspector-panel" id="element-inspector">
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
          <span class="insp-z">Z = ${el.Z}</span>
          <h2 class="insp-symbol">${el.symbol}</h2>
          <span class="insp-name">${elementName}</span>
          <span class="insp-category">${categoryName}</span>
        </div>

        <div class="inspector-details">
          <div class="detail-row">
            <span>${strings.atomicMass}:</span>
            <strong>${el.atomic_mass} u</strong>
          </div>
          <div class="detail-row">
            <span>${strings.electronConfig}:</span>
            <strong><code>${el.electron_config_str}</code></strong>
          </div>
          <div class="detail-row">
            <span>${strings.atomicRadius}:</span>
            <strong>${el.radius_pm} pm</strong>
          </div>
          <div class="detail-row">
            <span>${strings.electronegativity}:</span>
            <strong>${el.electronegativity ?? 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.ionizationEnergy}:</span>
            <strong>${el.ionization_energy ? `${el.ionization_energy} kJ/mol` : 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.discovery}:</span>
            <strong>${discoveryStr}</strong>
          </div>
        </div>

        <button class="btn-primary" id="btn-view-orbital">
          ${strings.btnView3DOrbital}
        </button>
      </div>
    `;
  }

  private attachEventListeners(): void {
    const colorSelect = this.container.querySelector('#color-scheme-select') as HTMLSelectElement;
    const searchInput = this.container.querySelector('#element-search') as HTMLInputElement;
    const grid = this.container.querySelector('#periodic-grid') as HTMLElement;

    colorSelect?.addEventListener('change', () => {
      this.currentColorScheme = colorSelect.value as 'category' | 'electronegativity' | 'radius';
      grid.innerHTML = this.renderGridCells(searchInput?.value || '');
      this.attachCellClickEvents();
    });

    searchInput?.addEventListener('input', () => {
      grid.innerHTML = this.renderGridCells(searchInput.value);
      this.attachCellClickEvents();
    });

    this.attachCellClickEvents();
  }

  private attachCellClickEvents(): void {
    const cells = this.container.querySelectorAll('.element-cell');
    cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const z = parseInt(cell.getAttribute('data-z') || '1', 10);
        this.selectedElement = this.elements.find((e) => e.Z === z) || null;

        cells.forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');

        const inspector = this.container.querySelector('#element-inspector');
        if (inspector) {
          inspector.innerHTML = this.renderInspectorContent();
          const btnView = inspector.querySelector('#btn-view-orbital');
          btnView?.addEventListener('click', () => {
            if (this.selectedElement) {
              this.onSelectElementOrbital(this.selectedElement);
            }
          });
        }
      });
    });
  }
}

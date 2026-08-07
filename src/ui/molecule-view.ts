import moleculesData from '../../assets/data/molecules.json';
import elementsData from '../../assets/data/elements.json';
import { MoleculeRenderer, MoleculeData as BaseMoleculeData } from '../render/molecule-renderer';
import { getStrings, getLanguage, onLanguageChange, I18nStrings, ConceptExplanation } from '../i18n';
import { ElementData } from './periodic-table';
import { ExplanationModal } from './info-modal';

export interface LocalizedMoleculeData extends BaseMoleculeData {
  name_es?: string;
  name_en?: string;
  geometry_es?: string;
  geometry_en?: string;
  description_es?: string;
  description_en?: string;
}

export class MoleculeView {
  private container: HTMLElement;
  private renderer: MoleculeRenderer;
  private molecules: LocalizedMoleculeData[] = moleculesData as LocalizedMoleculeData[];
  private currentMolecule: LocalizedMoleculeData = this.molecules[1] || this.molecules[0]; // H2O default
  private showLobes: boolean = true;

  constructor(container: HTMLElement, renderer: MoleculeRenderer) {
    this.container = container;
    this.renderer = renderer;
    this.renderer.onLobeClick = (type) => {
      const strings = getStrings();
      const expl = type === 'bonding' ? strings.explainBondingLobe : strings.explainLonePairLobe;
      ExplanationModal.show(expl);
    };
    this.renderer.onAtomClick = (symbol) => {
      const element = (elementsData as ElementData[]).find(e => e.symbol === symbol);
      const lang = getLanguage();
      const elementName = element ? (lang === 'es' ? element.name_es : element.name_en) : symbol;
      const strings = getStrings();
      const title = `${strings.atomClickTitle}: ${elementName} (${symbol})`;
      ExplanationModal.showSimple(title, strings.atomClickSummary, strings.atomClickDetail);
    };
    this.render();
    onLanguageChange(() => this.render());
  }

  private getMoleculeName(m: LocalizedMoleculeData): string {
    const lang = getLanguage();
    return lang === 'es' ? (m.name_es || m.name) : (m.name_en || m.name_es || m.name);
  }

  private getMoleculeGeometry(m: LocalizedMoleculeData): string {
    const lang = getLanguage();
    return lang === 'es' ? (m.geometry_es || m.geometry) : (m.geometry_en || m.geometry_es || m.geometry);
  }

  private getMoleculeDescription(m: LocalizedMoleculeData): string {
    const lang = getLanguage();
    return lang === 'es' ? (m.description_es || m.description) : (m.description_en || m.description_es || m.description);
  }

  private render(): void {
    const strings = getStrings();
    this.renderer.loadMolecule(this.currentMolecule);

    this.container.innerHTML = `
      <div class="mobile-drawer-backdrop" id="molecule-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button class="mobile-float-btn" id="btn-show-molecule" title="${strings.moleculesVseprTitle}">
          <span class="btn-icon">🧬</span>
          <span class="btn-label">${strings.moleculesVseprTitle}</span>
        </button>
      </div>

      <div class="molecule-overlay-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header">
          <h3>${strings.moleculesVseprTitle}</h3>
          <button class="panel-close-btn" id="btn-close-molecule" aria-label="Close">✕</button>
        </div>

        <div class="molecule-controls">
          <div class="control-group">
            <label for="molecule-select">${strings.selectMolecule}:</label>
            <select id="molecule-select">
              ${this.molecules
                .map(
                  (m) => `
                <option value="${m.id}" ${m.id === this.currentMolecule.id ? 'selected' : ''}>
                  ${m.formula} - ${this.getMoleculeName(m)} (${this.getMoleculeGeometry(m)})
                </option>
              `
                )
                .join('')}
            </select>
          </div>

          <button class="btn-secondary" id="btn-toggle-lobes">
            ${this.showLobes ? strings.toggleLobesHide : strings.toggleLobesShow}
          </button>
        </div>

        <div class="molecule-info-card" id="molecule-info">
          ${this.renderMoleculeInfo()}
        </div>

        <div class="vsepr-guide-card">
          <div class="vsepr-guide-header">
            <h4>${strings.vseprGuideTitle}</h4>
            <button class="btn-info-icon" data-explain="explainVsepr" aria-label="Info">ℹ️</button>
          </div>
          <p>${strings.vseprGuideText}</p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderMoleculeInfo(): string {
    const strings = getStrings();
    const m = this.currentMolecule;
    const name = this.getMoleculeName(m);
    const geometry = this.getMoleculeGeometry(m);
    const description = this.getMoleculeDescription(m);

    return `
      <div class="mol-header">
        <span class="mol-formula">${m.formula}</span>
        <h2 class="mol-name">${name}</h2>
      </div>
      <div class="mol-details">
        <div class="detail-row">
          <span>${strings.vseprGeometry} <button class="btn-info-icon" data-explain="explainVsepr" aria-label="Info">ℹ️</button>:</span>
          <strong>${geometry}</strong>
        </div>
        <div class="detail-row">
          <span>${strings.hybridization} <button class="btn-info-icon" data-explain="explainHybridization" aria-label="Info">ℹ️</button>:</span>
          <strong><code>${m.hybridization}</code></strong>
        </div>
        <div class="detail-row">
          <span>${strings.bondAngle} <button class="btn-info-icon" data-explain="explainBondAngle" aria-label="Info">ℹ️</button>:</span>
          <strong class="highlight-angle">${m.bond_angle}</strong>
        </div>
      </div>
      <p class="mol-description">${description}</p>
    `;
  }

  private attachEventListeners(): void {
    const molPanel = this.container.querySelector('.molecule-overlay-panel') as HTMLElement;
    const backdrop = this.container.querySelector('#molecule-drawer-backdrop') as HTMLElement;
    const btnShowMol = this.container.querySelector('#btn-show-molecule') as HTMLElement;
    const btnCloseMol = this.container.querySelector('#btn-close-molecule');

    const toggleMolDrawer = () => {
      const isOpen = molPanel?.classList.contains('mobile-open');
      if (isOpen) {
        molPanel?.classList.remove('mobile-open');
        backdrop?.classList.remove('active');
        btnShowMol?.classList.remove('active');
      } else {
        molPanel?.classList.add('mobile-open');
        backdrop?.classList.add('active');
        btnShowMol?.classList.add('active');
      }
    };

    const closeMolDrawer = () => {
      molPanel?.classList.remove('mobile-open');
      backdrop?.classList.remove('active');
      btnShowMol?.classList.remove('active');
    };

    btnShowMol?.addEventListener('click', toggleMolDrawer);
    btnCloseMol?.addEventListener('click', closeMolDrawer);
    backdrop?.addEventListener('click', closeMolDrawer);

    const molSelect = this.container.querySelector('#molecule-select') as HTMLSelectElement;
    const btnToggle = this.container.querySelector('#btn-toggle-lobes') as HTMLButtonElement;

    molSelect?.addEventListener('change', () => {
      const selected = this.molecules.find((m) => m.id === molSelect.value);
      if (selected) {
        this.currentMolecule = selected;
        this.renderer.loadMolecule(this.currentMolecule);
        const infoCard = this.container.querySelector('#molecule-info') as HTMLElement;
        if (infoCard) {
          infoCard.innerHTML = this.renderMoleculeInfo();
          this.attachInfoButtonEvents(infoCard);
        }
      }
    });

    btnToggle?.addEventListener('click', () => {
      const strings = getStrings();
      this.showLobes = this.renderer.toggleLobes();
      btnToggle.innerHTML = this.showLobes ? strings.toggleLobesHide : strings.toggleLobesShow;
    });

    this.attachInfoButtonEvents(this.container);
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

  public setMoleculeById(id: string): void {
    const selected = this.molecules.find((m) => m.id === id);
    if (selected) {
      this.currentMolecule = selected;
      this.render();
    }
  }
}


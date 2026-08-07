import moleculesData from '../../assets/data/molecules.json';
import elementsData from '../../assets/data/elements.json';
import { MoleculeRenderer, MoleculeData as BaseMoleculeData } from '../render/molecule-renderer';
import { getStrings, getLanguage, onLanguageChange, I18nStrings } from '../i18n';
import { InfoModal, ConceptExplanation } from './info-modal';

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
      InfoModal.show(expl as any);
    };
    this.renderer.onAtomClick = (symbol) => {
      const element = (elementsData as any[]).find(e => e.symbol === symbol);
      const lang = getLanguage();
      const elementName = element ? (lang === 'es' ? element.name_es : element.name_en) : symbol;
      const title = lang === 'es' ? `Átomo: ${elementName} (${symbol})` : `Atom: ${elementName} (${symbol})`;
      const summary = lang === 'es' ? 'Elemento químico de la molécula.' : 'Chemical element of the molecule.';
      const detail = lang === 'es' 
        ? 'Las esferas representan el núcleo atómico. Aquí puedes ver cómo se distribuyen las nubes electrónicas a su alrededor formando enlaces.' 
        : 'The spheres represent the atomic nucleus. Here you can see how the electron clouds are distributed around it forming bonds.';

      InfoModal.showSimple(title, summary, detail);
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
      <div class="molecule-overlay-panel">
        <div class="panel-header">
          <h3>${strings.moleculesVseprTitle}</h3>
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
            ${this.showLobes ? '👁️ Ocultar Nubes Electrónicas' : '👁️🗨️ Mostrar Nubes Electrónicas'}
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
      this.showLobes = this.renderer.toggleLobes();
      btnToggle.innerHTML = this.showLobes ? '👁️ Ocultar Nubes Electrónicas' : '👁️🗨️ Mostrar Nubes Electrónicas';
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
          InfoModal.show(explanation);
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


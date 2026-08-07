import { getStrings, getLanguage, setLanguage, onLanguageChange, Language } from '../i18n';
import { GlossaryModal } from './glossary-modal';
import { ExplanationModal } from './info-modal';

export type TabId = 'orbitals' | 'periodic-table' | 'molecules';

export class NavigationBar {
  private container: HTMLElement;
  private activeTab: TabId = 'orbitals';
  private onTabChange: (tab: TabId) => void;
  private glossaryModal: GlossaryModal;

  constructor(container: HTMLElement, onTabChange: (tab: TabId) => void) {
    this.container = container;
    this.onTabChange = onTabChange;
    this.glossaryModal = new GlossaryModal();
    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const strings = getStrings();
    const currentLang = getLanguage();

    const tabs: { id: TabId; label: string; icon: string }[] = [
      { id: 'orbitals', label: strings.tabOrbitals, icon: '⚛️' },
      { id: 'periodic-table', label: strings.tabPeriodicTable, icon: '🧪' },
      { id: 'molecules', label: strings.tabMolecules, icon: '🧬' },
    ];

    this.container.innerHTML = `
      <nav class="top-nav">
        <div class="nav-brand">
          <span class="nav-logo">⚛️</span>
          <span class="nav-title">${strings.title}</span>
        </div>
        <div class="nav-tabs">
          ${tabs
            .map(
              (tab) => `
            <button class="nav-tab ${tab.id === this.activeTab ? 'active' : ''}" data-tab="${tab.id}">
              <span class="tab-icon">${tab.icon}</span>
              <span class="tab-label">${tab.label}</span>
            </button>
          `
            )
            .join('')}
          <button class="nav-tab nav-glossary-btn" id="nav-glossary-btn" title="${strings.btnGlossary}">
            <span class="tab-icon">📖</span>
            <span class="tab-label">${strings.btnGlossary}</span>
          </button>
          <button class="nav-tab nav-intro-btn" id="nav-intro-btn" title="${strings.btnIntro}">
            <span class="tab-icon">👋</span>
            <span class="tab-label">${strings.btnIntro}</span>
          </button>
        </div>
        <div class="nav-lang-switcher">
          <select id="lang-select" aria-label="${strings.language}">
            <option value="es" ${currentLang === 'es' ? 'selected' : ''}>🇪🇸 ES</option>
            <option value="en" ${currentLang === 'en' ? 'selected' : ''}>🇬🇧 EN</option>
          </select>
        </div>
      </nav>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const buttons = this.container.querySelectorAll('.nav-tab[data-tab]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement).getAttribute('data-tab') as TabId;
        if (target && target !== this.activeTab) {
          this.setActiveTab(target);
          this.onTabChange(target);
        }
      });
    });

    const glossaryBtn = this.container.querySelector('#nav-glossary-btn');
    glossaryBtn?.addEventListener('click', () => {
      this.glossaryModal.open();
    });

    const introBtn = this.container.querySelector('#nav-intro-btn');
    introBtn?.addEventListener('click', () => {
      ExplanationModal.show(getStrings().explainIntro);
    });

    const langSelect = this.container.querySelector('#lang-select') as HTMLSelectElement;
    langSelect?.addEventListener('change', (e) => {
      const selectedLang = (e.target as HTMLSelectElement).value as Language;
      setLanguage(selectedLang);
    });
  }

  public setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    const buttons = this.container.querySelectorAll('.nav-tab[data-tab]');
    buttons.forEach((btn) => {
      if (btn.getAttribute('data-tab') === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
}


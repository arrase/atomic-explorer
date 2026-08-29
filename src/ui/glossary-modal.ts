import { getStrings, getLanguage, onLanguageChange, GlossaryItem } from '../i18n';

export class GlossaryModal {
  private overlayElement: HTMLElement | null = null;
  private isOpen: boolean = false;
  private searchQuery: string = '';
  private activeCategory: string = 'all';
  private expandedItemIds: Set<string> = new Set();
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    onLanguageChange(() => {
      if (this.isOpen && this.overlayElement) {
        this.render();
      }
    });
  }

  /**
   * Opens the scientific glossary modal.
   */
  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
    this.attachGlobalListeners();
  }

  /**
   * Closes the glossary modal.
   */
  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.detachGlobalListeners();

    if (this.overlayElement) {
      const overlay = this.overlayElement;
      this.overlayElement = null;

      overlay.classList.add('fade-out');

      const cleanup = () => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      };

      overlay.addEventListener('animationend', cleanup, { once: true });
      setTimeout(cleanup, 300);
    }
  }

  private attachGlobalListeners(): void {
    this.detachGlobalListeners();
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private detachGlobalListeners(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  private getFilteredItems(): GlossaryItem[] {
    const items: GlossaryItem[] = getStrings().glossaryItems || [];
    const query = this.searchQuery.toLowerCase().trim();

    return items.filter((item) => {
      const matchesCategory = this.activeCategory === 'all' || item.category === this.activeCategory;
      const matchesQuery =
        !query ||
        item.term.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.definition.toLowerCase().includes(query) ||
        item.details.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }

  private render(): void {
    const strings = getStrings();
    const currentLang = getLanguage();
    const items = strings.glossaryItems || [];

    const rawCategories = Array.from(new Set(items.map((item) => item.category)));
    const allLabel = currentLang === 'es' ? 'Todos' : 'All';
    const filteredItems = this.getFilteredItems();

    if (!this.overlayElement) {
      this.overlayElement = document.createElement('div');
      this.overlayElement.className = 'glass-modal-overlay glossary-modal-overlay';
      document.body.appendChild(this.overlayElement);
    }

    this.overlayElement.innerHTML = `
      <div class="glass-modal-card glossary-modal-card">
        <div class="glass-modal-header">
          <div class="glossary-modal-header-title">
            <h2 class="glass-modal-title">📖 ${strings.glossaryTitle}</h2>
            <p class="glossary-subtitle">${strings.glossarySubtitle}</p>
          </div>
          <button class="btn-close-modal" aria-label="${strings.infoModalClose || 'Close'}">&times;</button>
        </div>

        <div class="glossary-controls">
          <div class="glossary-search-wrapper">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="glossary-search-input"
              class="glossary-search-input"
              placeholder="${strings.glossarySearchPlaceholder}"
              value="${this.escapeHtml(this.searchQuery)}"
            />
            ${
              this.searchQuery
                ? `<button type="button" class="btn-clear-search" id="btn-clear-search">&times;</button>`
                : ''
            }
          </div>

          <div class="glossary-categories">
            <button
              type="button"
              class="category-tag ${this.activeCategory === 'all' ? 'active' : ''}"
              data-category="all"
            >
              ${allLabel}
            </button>
            ${rawCategories
              .map(
                (cat) => `
              <button
                type="button"
                class="category-tag ${this.activeCategory === cat ? 'active' : ''}"
                data-category="${this.escapeHtml(cat)}"
              >
                ${this.escapeHtml(cat)}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="glossary-list">
          ${this.renderGlossaryListHtml(filteredItems, currentLang)}
        </div>

        <div class="glass-modal-footer">
          <button type="button" class="btn-primary glossary-modal-close-btn">${strings.infoModalClose || 'Close'}</button>
        </div>
      </div>
    `;

    this.attachDomEvents();
  }

  private attachDomEvents(): void {
    if (!this.overlayElement) return;

    this.overlayElement.onclick = (e: MouseEvent) => {
      if (e.target === this.overlayElement) {
        this.close();
      }
    };

    const closeBtn = this.overlayElement.querySelector('.btn-close-modal') as HTMLElement;
    const footerCloseBtn = this.overlayElement.querySelector('.glossary-modal-close-btn') as HTMLElement;

    closeBtn.addEventListener('click', () => this.close());
    footerCloseBtn.addEventListener('click', () => this.close());

    const searchInput = this.overlayElement.querySelector('#glossary-search-input') as HTMLInputElement;
    searchInput.addEventListener('input', (e: Event) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderListOnly();
    });

    const clearBtn = this.overlayElement.querySelector('#btn-clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        this.render();
      });
    }

    const categoryTags = this.overlayElement.querySelectorAll('.category-tag');
    categoryTags.forEach((tag) => {
      tag.addEventListener('click', (e: Event) => {
        const cat = (e.currentTarget as HTMLElement).getAttribute('data-category');
        if (cat) {
          this.activeCategory = cat;
          this.render();
        }
      });
    });

    this.attachCardClickEvents(this.overlayElement);
  }

  private renderListOnly(): void {
    if (!this.overlayElement) return;
    const currentLang = getLanguage();
    const filteredItems = this.getFilteredItems();

    const listContainer = this.overlayElement.querySelector('.glossary-list') as HTMLElement;
    listContainer.innerHTML = this.renderGlossaryListHtml(filteredItems, currentLang);
    this.attachCardClickEvents(listContainer);

    const searchWrapper = this.overlayElement.querySelector('.glossary-search-wrapper') as HTMLElement;
    const existingClearBtn = searchWrapper.querySelector('#btn-clear-search');
    if (this.searchQuery && !existingClearBtn) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn-clear-search';
      clearBtn.id = 'btn-clear-search';
      clearBtn.innerHTML = '&times;';
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        const searchInput = this.overlayElement!.querySelector('#glossary-search-input') as HTMLInputElement;
        searchInput.value = '';
        this.render();
      });
      searchWrapper.appendChild(clearBtn);
    } else if (!this.searchQuery && existingClearBtn) {
      existingClearBtn.remove();
    }
  }

  private renderGlossaryListHtml(items: GlossaryItem[], lang: string): string {
    if (items.length === 0) {
      const emptyMsg = lang === 'es'
        ? 'No se encontraron términos que coincidan con la búsqueda.'
        : 'No matching glossary terms found.';
      return `<div class="glossary-empty"><p>🔍 ${emptyMsg}</p></div>`;
    }
    return items.map((item) => this.renderGlossaryCardHtml(item, this.expandedItemIds.has(item.id))).join('');
  }

  private renderGlossaryCardHtml(item: GlossaryItem, isExpanded: boolean): string {
    return `
      <div class="glossary-item-card ${isExpanded ? 'expanded' : ''}" data-id="${item.id}">
        <div class="glossary-item-header">
          <div class="glossary-item-title-group">
            <h3 class="glossary-item-term">${this.escapeHtml(item.term)}</h3>
            <span class="glossary-item-badge">${this.escapeHtml(item.category)}</span>
          </div>
          <span class="glossary-item-toggle">${isExpanded ? '▲' : '▼'}</span>
        </div>
        <p class="glossary-item-definition">${this.escapeHtml(item.definition)}</p>
        ${isExpanded ? `<div class="glossary-item-details"><p>${this.escapeHtml(item.details)}</p></div>` : ''}
      </div>
    `;
  }

  private attachCardClickEvents(parent: HTMLElement): void {
    const itemCards = parent.querySelectorAll('.glossary-item-card');
    itemCards.forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        if (id) {
          if (this.expandedItemIds.has(id)) {
            this.expandedItemIds.delete(id);
          } else {
            this.expandedItemIds.add(id);
          }
          this.renderListOnly();
        }
      });
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

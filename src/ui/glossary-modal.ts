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

  private render(): void {
    const strings = getStrings();
    const currentLang = getLanguage();
    const items: GlossaryItem[] = strings.glossaryItems || [];

    // Extract unique categories dynamically from current language glossary items
    const rawCategories = Array.from(new Set(items.map((item) => item.category)));
    const allLabel = currentLang === 'es' ? 'Todos' : 'All';

    // Filter items based on active category & search query
    const query = this.searchQuery.toLowerCase().trim();
    const filteredItems = items.filter((item) => {
      const matchesCategory = this.activeCategory === 'all' || item.category === this.activeCategory;
      const matchesQuery =
        !query ||
        item.term.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.definition.toLowerCase().includes(query) ||
        item.details.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });

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
          ${
            filteredItems.length === 0
              ? `
            <div class="glossary-empty">
              <p>🔍 ${
                currentLang === 'es'
                  ? 'No se encontraron términos que coincidan con la búsqueda.'
                  : 'No matching glossary terms found.'
              }</p>
            </div>
          `
              : filteredItems
                  .map((item) => {
                    const isExpanded = this.expandedItemIds.has(item.id);
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
                ${
                  isExpanded
                    ? `
                  <div class="glossary-item-details">
                    <p>${this.escapeHtml(item.details)}</p>
                  </div>
                `
                    : ''
                }
              </div>
            `;
                  })
                  .join('')
          }
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

    // Overlay click outside card
    this.overlayElement.onclick = (e: MouseEvent) => {
      if (e.target === this.overlayElement) {
        this.close();
      }
    };

    // Close buttons
    const closeBtn = this.overlayElement.querySelector('.btn-close-modal');
    const footerCloseBtn = this.overlayElement.querySelector('.glossary-modal-close-btn');

    closeBtn?.addEventListener('click', () => this.close());
    footerCloseBtn?.addEventListener('click', () => this.close());

    // Search input
    const searchInput = this.overlayElement.querySelector('#glossary-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e: Event) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.renderListOnly();
      });
      // Maintain focus position when re-rendering list
    }

    const clearBtn = this.overlayElement.querySelector('#btn-clear-search');
    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      this.render();
    });

    // Category tags
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

    // Expand / Collapse item cards
    const itemCards = this.overlayElement.querySelectorAll('.glossary-item-card');
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

  private renderListOnly(): void {
    if (!this.overlayElement) return;
    const strings = getStrings();
    const currentLang = getLanguage();
    const items: GlossaryItem[] = strings.glossaryItems || [];

    const query = this.searchQuery.toLowerCase().trim();
    const filteredItems = items.filter((item) => {
      const matchesCategory = this.activeCategory === 'all' || item.category === this.activeCategory;
      const matchesQuery =
        !query ||
        item.term.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.definition.toLowerCase().includes(query) ||
        item.details.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });

    const listContainer = this.overlayElement.querySelector('.glossary-list');
    if (listContainer) {
      listContainer.innerHTML =
        filteredItems.length === 0
          ? `
        <div class="glossary-empty">
          <p>🔍 ${
            currentLang === 'es'
              ? 'No se encontraron términos que coincidan con la búsqueda.'
              : 'No matching glossary terms found.'
          }</p>
        </div>
      `
          : filteredItems
              .map((item) => {
                const isExpanded = this.expandedItemIds.has(item.id);
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
            ${
              isExpanded
                ? `
              <div class="glossary-item-details">
                <p>${this.escapeHtml(item.details)}</p>
              </div>
            `
                : ''
            }
          </div>
        `;
              })
              .join('');

      // Re-attach card click listeners
      const itemCards = listContainer.querySelectorAll('.glossary-item-card');
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

    // Toggle clear search button visibility
    const searchWrapper = this.overlayElement.querySelector('.glossary-search-wrapper');
    const existingClearBtn = searchWrapper?.querySelector('#btn-clear-search');
    if (this.searchQuery && !existingClearBtn && searchWrapper) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn-clear-search';
      clearBtn.id = 'btn-clear-search';
      clearBtn.innerHTML = '&times;';
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        const searchInput = this.overlayElement?.querySelector('#glossary-search-input') as HTMLInputElement;
        if (searchInput) searchInput.value = '';
        this.render();
      });
      searchWrapper.appendChild(clearBtn);
    } else if (!this.searchQuery && existingClearBtn) {
      existingClearBtn.remove();
    }
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

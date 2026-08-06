import { getStrings } from '../i18n';

export interface ConceptExplanation {
  title: string;
  summary: string;
  detail: string;
  analogy?: string;
}

export class InfoModal {
  private static overlayElement: HTMLElement | null = null;
  private static keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Shows a glassmorphic modal with scientific explanation details.
   */
  public static show(info: ConceptExplanation): void {
    // Close existing modal if one is currently open
    InfoModal.close();

    const strings = getStrings();

    const overlay = document.createElement('div');
    overlay.className = 'glass-modal-overlay info-modal-overlay';

    const card = document.createElement('div');
    card.className = 'glass-modal-card info-modal-card';

    const analogyHtml = info.analogy
      ? `<div class="info-modal-analogy">
           <div class="analogy-label">💡 ${strings.analogyLabel}:</div>
           <p>${info.analogy}</p>
         </div>`
      : '';

    card.innerHTML = `
      <div class="glass-modal-header">
        <h3 class="glass-modal-title">${info.title}</h3>
        <button class="btn-close-modal" aria-label="${strings.infoModalClose || 'Close'}">&times;</button>
      </div>
      <div class="glass-modal-body">
        <p class="info-modal-summary">${info.summary}</p>
        <div class="info-modal-detail">${info.detail}</div>
        ${analogyHtml}
      </div>
      <div class="glass-modal-footer">
        <button class="btn-primary info-modal-close-btn">${strings.infoModalClose || 'Close'}</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    InfoModal.overlayElement = overlay;

    const closeBtn = card.querySelector('.btn-close-modal');
    const footerCloseBtn = card.querySelector('.info-modal-close-btn');

    const handleClose = () => InfoModal.close();

    closeBtn?.addEventListener('click', handleClose);
    footerCloseBtn?.addEventListener('click', handleClose);

    overlay.addEventListener('click', (e: MouseEvent) => {
      if (e.target === overlay) {
        handleClose();
      }
    });

    InfoModal.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', InfoModal.keydownHandler);
  }

  /**
   * Helper method to show a simple explanation modal without optional analogy.
   */
  public static showSimple(title: string, summary: string, detail: string): void {
    InfoModal.show({ title, summary, detail });
  }

  /**
   * Closes the active info modal if present.
   */
  public static close(): void {
    if (InfoModal.keydownHandler) {
      document.removeEventListener('keydown', InfoModal.keydownHandler);
      InfoModal.keydownHandler = null;
    }

    if (InfoModal.overlayElement) {
      const overlay = InfoModal.overlayElement;
      InfoModal.overlayElement = null;

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
}

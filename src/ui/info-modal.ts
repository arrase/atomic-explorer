import { ConceptExplanation, getStrings } from '../i18n';
import { icon } from './icons';

export class ExplanationModal {
  private static overlayElement: HTMLElement | null = null;
  private static keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private static previousActiveElement: HTMLElement | null = null;

  public static show(info: ConceptExplanation, options?: { showDontShowAgain?: boolean, storageKey?: string }): void {
    ExplanationModal.previousActiveElement = document.activeElement as HTMLElement | null;
    ExplanationModal.close();

    const strings = getStrings();

    const overlay = document.createElement('div');
    overlay.className = 'glass-modal-overlay modal-backdrop info-modal-overlay';

    const card = document.createElement('div');
    card.className = 'glass-modal-card info-modal-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'info-modal-title');

    const analogyHtml = info.analogy
      ? `<div class="info-modal-analogy">
           <div class="analogy-label">${icon('help')} <span>${strings.analogyLabel}:</span></div>
           <p>${info.analogy}</p>
         </div>`
      : '';

    card.innerHTML = `
      <div class="glass-modal-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('info')}</span>
          <h3 class="glass-modal-title" id="info-modal-title">${info.title}</h3>
        </div>
        <button class="btn-close-modal" aria-label="${strings.infoModalClose}">${icon('close')}</button>
      </div>
      <div class="glass-modal-body">
        <p class="info-modal-summary">${info.summary}</p>
        <div class="info-modal-detail">${info.detail}</div>
        ${analogyHtml}
      </div>
      <div class="glass-modal-footer">
        ${options?.showDontShowAgain ? `
          <label class="info-modal-dont-show-again">
            <input type="checkbox" id="dont-show-again-checkbox">
            ${strings.dontShowAgain}
          </label>
        ` : ''}
        <button class="btn-primary info-modal-close-btn">${strings.infoModalClose}</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    ExplanationModal.overlayElement = overlay;

    const closeBtn = card.querySelector('.btn-close-modal') as HTMLElement;
    const footerCloseBtn = card.querySelector('.info-modal-close-btn') as HTMLElement;

    const handleClose = () => {
      if (options?.showDontShowAgain && options?.storageKey) {
        const checkbox = card.querySelector('#dont-show-again-checkbox') as HTMLInputElement;
        if (checkbox && checkbox.checked) {
          localStorage.setItem(options.storageKey, 'true');
        }
      }
      ExplanationModal.close();
    };

    closeBtn.addEventListener('click', handleClose);
    footerCloseBtn.addEventListener('click', handleClose);

    overlay.addEventListener('click', (e: MouseEvent) => {
      if (e.target === overlay) {
        handleClose();
      }
    });

    ExplanationModal.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Tab') {
        const focusable = Array.from(card.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', ExplanationModal.keydownHandler);

    closeBtn.focus();
  }

  public static showSimple(title: string, summary: string, detail: string): void {
    ExplanationModal.show({ title, summary, detail });
  }

  public static close(): void {
    if (ExplanationModal.keydownHandler) {
      document.removeEventListener('keydown', ExplanationModal.keydownHandler);
      ExplanationModal.keydownHandler = null;
    }

    if (ExplanationModal.previousActiveElement) {
      ExplanationModal.previousActiveElement.focus();
      ExplanationModal.previousActiveElement = null;
    }

    if (ExplanationModal.overlayElement) {
      const overlay = ExplanationModal.overlayElement;
      ExplanationModal.overlayElement = null;

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


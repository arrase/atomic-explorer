import { getStrings, onLanguageChange } from '../i18n';
import { icon } from './icons';

export interface ViewportHUDCallbacks {
  onResetCamera: () => void;
  onToggleAutoRotate: () => void;
  onToggleZenMode: () => void;
  onShareLink?: () => void;
}

export class ViewportHUD {
  private readonly container: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly extraSlot: HTMLElement;
  private readonly callbacks: ViewportHUDCallbacks;
  private isAutoRotating: boolean = false;
  private scaleText: string = '1 a₀ = 52.9 pm';
  private readonly keydownHandler: (e: KeyboardEvent) => void;

  constructor(parent: HTMLElement, callbacks: ViewportHUDCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.className = 'viewport-hud';
    parent.appendChild(this.container);

    this.inner = document.createElement('div');
    this.inner.className = 'hud-inner';
    this.container.appendChild(this.inner);

    // Persistent slot for host-owned content (the FPS readout) so that
    // re-rendering the toolbar on language change does not destroy it.
    this.extraSlot = document.createElement('div');
    this.extraSlot.className = 'hud-extra';
    this.container.appendChild(this.extraSlot);

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.inner
          .querySelectorAll<HTMLElement>('.hud-btn[data-tooltip]:hover, .hud-btn[data-tooltip]:focus-visible')
          .forEach((btn) => {
            btn.dataset.tooltipDismissed = '';
          });
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

    this.render();
    onLanguageChange(() => this.render());
  }

  public getExtraSlot(): HTMLElement {
    return this.extraSlot;
  }

  private render(): void {
    const strings = getStrings();

    this.inner.innerHTML = `
      <div class="hud-group">
        <button type="button" class="hud-btn" id="hud-btn-reset" aria-label="${strings.hudResetCamera}" data-tooltip="${strings.hudResetCamera}">
          ${icon('rotate-ccw')}
        </button>

        <button type="button" class="hud-btn ${this.isAutoRotating ? 'active' : ''}" id="hud-btn-turntable" aria-label="${strings.hudTurntable}" aria-pressed="${this.isAutoRotating}" data-tooltip="${strings.hudTurntable}">
          ${icon('turntable')}
        </button>
      </div>

      <div class="hud-divider"></div>

      <div class="hud-scale-badge" id="hud-scale-badge" title="${strings.hudScale}">
        <span class="scale-icon">${icon('grid')}</span>
        <span class="scale-label">${this.scaleText}</span>
      </div>

      <div class="hud-divider"></div>

      <div class="hud-group">
        <button type="button" class="hud-btn" id="hud-btn-share" aria-label="${strings.shareLink}" data-tooltip="${strings.shareLink}">
          ${icon('share')}
        </button>

        <button type="button" class="hud-btn" id="hud-btn-zen" aria-label="${strings.hudZenMode}" data-tooltip="${strings.hudZenMode}">
          ${icon('zen')}
        </button>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const clearDismissed = (e: Event) => {
      delete (e.currentTarget as HTMLElement).dataset.tooltipDismissed;
    };
    this.inner.querySelectorAll<HTMLElement>('.hud-btn[data-tooltip]').forEach((btn) => {
      btn.addEventListener('pointerleave', clearDismissed);
      btn.addEventListener('blur', clearDismissed);
    });

    const btnReset = this.container.querySelector('#hud-btn-reset');
    const btnTurntable = this.container.querySelector('#hud-btn-turntable');
    const btnShare = this.container.querySelector('#hud-btn-share');
    const btnZen = this.container.querySelector('#hud-btn-zen');

    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onResetCamera();
      });
    }

    if (btnTurntable) {
      btnTurntable.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onToggleAutoRotate();
      });
    }

    if (btnShare) {
      btnShare.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onShareLink?.();
      });
    }

    if (btnZen) {
      btnZen.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onToggleZenMode();
      });
    }
  }

  public setAutoRotateState(active: boolean): void {
    this.isAutoRotating = active;
    const btnTurntable = this.container.querySelector('#hud-btn-turntable');
    if (btnTurntable) {
      btnTurntable.classList.toggle('active', active);
      btnTurntable.setAttribute('aria-pressed', String(active));
    }
  }

  public updateScale(text: string): void {
    this.scaleText = text;
    const label = this.container.querySelector('.scale-label');
    if (label) {
      label.textContent = text;
    }
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.keydownHandler);
    this.container.remove();
  }
}

import { getStrings } from '../i18n';
import { closeModalDialog, wireModalDialogLifecycle } from './dialog-helpers';
import { icon } from './icons';
import { escapeHtml } from './modal-utils';

export interface ExportOptions {
  width: number;
  height: number;
  superSampling: number;
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  background: 'dark' | 'black' | 'white' | 'transparent';
}

export class ImageExporterModal {
  private readonly dialog: HTMLDialogElement;
  private readonly onExport: (options: ExportOptions) => string;

  constructor(onExport: (options: ExportOptions) => string) {
    this.onExport = onExport;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'export-modal app-dialog';
    this.dialog.setAttribute('closedby', 'any');
    this.dialog.setAttribute('aria-labelledby', 'export-modal-title');
    document.body.appendChild(this.dialog);
    wireModalDialogLifecycle(this.dialog);
    this.render();
  }

  public open(): void {
    delete this.dialog.dataset.closing;
    this.render();
    this.dialog.showModal();

    const resSelect = this.dialog.querySelector('#export-res-select') as HTMLSelectElement | null;
    const closeBtn = this.dialog.querySelector('#btn-close-export') as HTMLElement | null;
    if (resSelect) {
      resSelect.focus();
    } else if (closeBtn) {
      closeBtn.focus();
    }
  }

  public close(): void {
    closeModalDialog(this.dialog);
  }

  private render(): void {
    const strings = getStrings();

    this.dialog.innerHTML = `
      <div class="export-modal-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('camera')}</span>
          <h2 id="export-modal-title">${strings.exportTitle}</h2>
        </div>
        <button type="button" class="btn-close-modal" id="btn-close-export" aria-label="${escapeHtml(strings.exportClose)}">${icon('close')}</button>
      </div>

      <div class="export-modal-body">
        <!-- Resolution -->
        <div class="control-group">
          <label for="export-res-select">${strings.exportResolution}</label>
          <select id="export-res-select">
            <option value="screen">${strings.resScreen}</option>
            <option value="1080p" selected>${strings.res1080p}</option>
            <option value="2K">${strings.res2K}</option>
            <option value="4K">${strings.res4K}</option>
            <option value="8K">${strings.res8K}</option>
          </select>
        </div>

        <!-- SuperSampling -->
        <div class="control-group">
          <label for="export-ss-select">${strings.superSampling}</label>
          <select id="export-ss-select">
            <option value="1">${strings.ssNative}</option>
            <option value="2" selected>${strings.ssCrisp}</option>
            <option value="4">${strings.ssUltra}</option>
          </select>
        </div>

        <!-- Background -->
        <div class="control-group">
          <label for="export-bg-select">${strings.exportBackground}</label>
          <select id="export-bg-select">
            <option value="dark" selected>${strings.bgDark}</option>
            <option value="black">${strings.bgBlack}</option>
            <option value="white">${strings.bgWhite}</option>
            <option value="transparent">${strings.bgTransparent}</option>
          </select>
        </div>

        <!-- Format -->
        <div class="control-group">
          <label for="export-fmt-select">${strings.exportFormat}</label>
          <select id="export-fmt-select">
            <option value="image/png" selected>${strings.formatPng}</option>
            <option value="image/jpeg">${strings.formatJpeg}</option>
            <option value="image/webp">${strings.formatWebp}</option>
          </select>
        </div>
      </div>

      <div class="export-modal-footer">
        <button type="button" class="btn-secondary" id="btn-cancel-export">${strings.exportClose}</button>
        <button type="button" class="btn-primary" id="btn-do-export">${strings.exportBtn}</button>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const closeBtn = this.dialog.querySelector('#btn-close-export') as HTMLElement;
    const cancelBtn = this.dialog.querySelector('#btn-cancel-export') as HTMLElement;
    const exportBtn = this.dialog.querySelector('#btn-do-export') as HTMLButtonElement;

    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.close());

    exportBtn.addEventListener('click', () => {
      const resSelect = this.dialog.querySelector('#export-res-select') as HTMLSelectElement;
      const ssSelect = this.dialog.querySelector('#export-ss-select') as HTMLSelectElement;
      const bgSelect = this.dialog.querySelector('#export-bg-select') as HTMLSelectElement;
      const fmtSelect = this.dialog.querySelector('#export-fmt-select') as HTMLSelectElement;

      let width = window.innerWidth;
      let height = window.innerHeight;

      switch (resSelect.value) {
        case '1080p':
          width = 1920;
          height = 1080;
          break;
        case '2K':
          width = 2560;
          height = 1440;
          break;
        case '4K':
          width = 3840;
          height = 2160;
          break;
        case '8K':
          width = 7680;
          height = 4320;
          break;
      }

      const superSampling = Number.parseFloat(ssSelect.value);
      const background = bgSelect.value as ExportOptions['background'];
      const format = fmtSelect.value as ExportOptions['format'];

      exportBtn.disabled = true;
      const origText = exportBtn.textContent;
      exportBtn.textContent = getStrings().exportGenerating;

      try {
        const dataUrl = this.onExport({ width, height, superSampling, background, format });

        // Trigger download
        let ext = 'png';
        if (format === 'image/jpeg') {
          ext = 'jpg';
        } else if (format === 'image/webp') {
          ext = 'webp';
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `atomic-explorer-${width}x${height}-${timestamp}.${ext}`;

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        this.close();
      } catch (error) {
        // A capture can fail outright - most often because the requested buffer
        // exceeds what the GPU can allocate - and without this the button would
        // stay disabled reading "Generating" forever.
        console.error('[atomic-explorer] image export failed', error);
        exportBtn.textContent = getStrings().exportFailed;
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = origText;
      }
    });
  }
}

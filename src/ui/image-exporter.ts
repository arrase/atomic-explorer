import { getStrings } from '../i18n';

export interface ExportOptions {
  width: number;
  height: number;
  superSampling: number;
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  background: 'dark' | 'black' | 'white' | 'transparent';
}

export class ImageExporterModal {
  private overlay: HTMLElement;
  private onExport: (options: ExportOptions) => Promise<string>;

  constructor(onExport: (options: ExportOptions) => Promise<string>) {
    this.onExport = onExport;
    this.overlay = document.createElement('div');
    this.overlay.className = 'export-modal-overlay hidden';
    document.body.appendChild(this.overlay);
    this.render();
  }

  public open(): void {
    this.render();
    this.overlay.classList.remove('hidden');
  }

  public close(): void {
    this.overlay.classList.add('hidden');
  }

  private render(): void {
    const strings = getStrings();

    this.overlay.innerHTML = `
      <div class="export-modal">
        <div class="export-modal-header">
          <h3>${strings.exportTitle}</h3>
          <button class="btn-close-modal" id="btn-close-export">&times;</button>
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
          <button class="btn-secondary" id="btn-cancel-export">${strings.exportClose}</button>
          <button class="btn-primary" id="btn-do-export">${strings.exportBtn}</button>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const closeBtn = this.overlay.querySelector('#btn-close-export');
    const cancelBtn = this.overlay.querySelector('#btn-cancel-export');
    const exportBtn = this.overlay.querySelector('#btn-do-export') as HTMLButtonElement;

    closeBtn?.addEventListener('click', () => this.close());
    cancelBtn?.addEventListener('click', () => this.close());

    exportBtn?.addEventListener('click', async () => {
      const resSelect = this.overlay.querySelector('#export-res-select') as HTMLSelectElement;
      const ssSelect = this.overlay.querySelector('#export-ss-select') as HTMLSelectElement;
      const bgSelect = this.overlay.querySelector('#export-bg-select') as HTMLSelectElement;
      const fmtSelect = this.overlay.querySelector('#export-fmt-select') as HTMLSelectElement;

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

      const superSampling = parseFloat(ssSelect.value);
      const background = bgSelect.value as ExportOptions['background'];
      const format = fmtSelect.value as ExportOptions['format'];

      exportBtn.disabled = true;
      const origText = exportBtn.textContent;
      exportBtn.textContent = getStrings().exportGenerating;

      try {
        const dataUrl = await this.onExport({ width, height, superSampling, background, format });

        // Trigger download
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `atomic-explorer-${width}x${height}-${timestamp}.${ext}`;

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.close();
      } catch (err) {
        console.error('Export image failed:', err);
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = origText;
      }
    });
  }
}

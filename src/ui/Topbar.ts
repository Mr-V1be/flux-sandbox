import {
  createIcons,
  Play,
  Pause,
  Eraser,
  Circle,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Flame,
  Square,
  Minus,
  Replace,
  Share2,
  Menu,
  Wrench,
  Camera as CameraIcon,
  Video,
  Save,
  FolderOpen,
} from 'lucide';
import { BrushShape, store } from '@/state/Store';
import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { Camera } from '@/rendering/Camera';
import { scenarios } from '@/state/Scenarios';
import { serialize, deserialize } from '@/state/Serializer';
import { showToast } from './Toast';
import { downloadPng, downloadBlob, VideoRecorder } from '@/effects/Recorder';
import {
  clearSnapshot,
  listSlots,
  loadSnapshot,
  saveSnapshot,
  slotLabel,
} from '@/state/Snapshots';

const SHAPE_ICON: Record<BrushShape, string> = {
  circle: 'circle',
  square: 'square',
  spray: 'sparkles',
  line: 'minus',
  replace: 'replace',
};

/**
 * Topbar: brand, transport (pause/play/clear), scenarios,
 * brush slider, zoom controls, temperature overlay toggle, live stats.
 */
export class Topbar {
  private fpsEl!: HTMLElement;
  private cellsEl!: HTMLElement;
  private chunksEl!: HTMLElement;
  private zoomEl!: HTMLElement;
  private brushLabel!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private thermalBtn!: HTMLButtonElement;
  private shapeBtn!: HTMLButtonElement;
  private brushSlider!: HTMLInputElement;
  private recorder!: VideoRecorder;

  constructor(
    private readonly root: HTMLElement,
    private readonly grid: Grid,
    private readonly field: TemperatureField,
    private readonly camera: Camera,
    private readonly onFit: () => void,
  ) {
    this.build();
    this.subscribe();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="flex items-center gap-2">
        <button data-act="burger" class="ui-btn burger-btn" aria-label="Menu" title="Elements">
          <i data-lucide="menu"></i>
        </button>
        <div class="h-6 w-6 rounded-md bg-gradient-to-br from-neutral-200 to-neutral-500"></div>
        <div class="flex flex-col leading-none brand-text">
          <span class="text-[11px] tracking-[0.22em] text-neutral-400 uppercase">Flux</span>
          <span class="text-sm font-semibold text-neutral-100">Sandbox</span>
        </div>
      </div>

      <div class="flex items-center gap-2 topbar-actions">
        <button data-act="play" class="ui-btn" aria-label="Play/Pause" title="Pause (Space)">
          <i data-lucide="pause"></i>
        </button>
        <button data-act="clear" class="ui-btn" aria-label="Clear" title="Clear (C)">
          <i data-lucide="eraser"></i>
        </button>
        <div class="relative" data-menu="scenarios">
          <button data-act="scenarios" class="ui-btn" aria-label="Scenarios" title="Scenarios">
            <i data-lucide="sparkles"></i>
          </button>
          <div data-menu-panel
            class="hidden absolute top-9 left-0 z-10 w-56 p-1 rounded-md border border-neutral-800 bg-[var(--color-panel)] shadow-xl">
          </div>
        </div>
        <div class="relative" data-menu="tools">
          <button data-act="tools" class="ui-btn" aria-label="Tools" title="Export / snapshots">
            <i data-lucide="wrench"></i>
          </button>
          <div data-menu-panel
            class="hidden absolute top-9 left-0 z-10 w-64 p-1 rounded-md border border-neutral-800 bg-[var(--color-panel)] shadow-xl">
          </div>
        </div>

        <div class="flex items-center gap-1.5 ml-3 pl-3 border-l border-neutral-800/70 zoom-cluster">
          <button data-act="zoom-out" class="ui-btn" aria-label="Zoom out" title="Zoom − (−)">
            <i data-lucide="zoom-out"></i>
          </button>
          <button data-act="fit" class="ui-btn" aria-label="Fit" title="Fit (F)">
            <i data-lucide="maximize-2"></i>
          </button>
          <button data-act="zoom-in" class="ui-btn" aria-label="Zoom in" title="Zoom + (+)">
            <i data-lucide="zoom-in"></i>
          </button>
          <span data-out="zoom" class="text-[10px] text-neutral-500 tabular-nums w-10 text-right">100%</span>
        </div>

        <div class="flex items-center gap-2 ml-3 pl-3 border-l border-neutral-800/70 brush-cluster">
          <button data-act="shape" class="ui-btn" aria-label="Brush shape" title="Brush shape (Tab)">
            <i data-lucide="circle" data-shape-icon></i>
          </button>
          <input type="range" min="1" max="64" value="6" data-ctrl="brush"
            class="accent-neutral-200 w-24 h-1" />
          <span data-out="brush" class="text-xs text-neutral-400 tabular-nums w-6 text-right brush-num">6</span>
        </div>

        <button data-act="thermal" class="ui-btn ml-3" aria-label="Heat overlay" title="Heat overlay (T)">
          <i data-lucide="flame"></i>
        </button>
        <button data-act="share" class="ui-btn" aria-label="Share" title="Copy shareable link">
          <i data-lucide="share-2"></i>
        </button>
      </div>

      <div class="flex items-center gap-4 text-xs text-neutral-400 tabular-nums topbar-stats">
        <div class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span data-out="fps">0</span> fps
        </div>
        <div><span data-out="cells">0</span> cells</div>
        <div><span data-out="chunks">0</span> chunks</div>
      </div>
    `;

    this.playBtn = this.root.querySelector('[data-act="play"]') as HTMLButtonElement;
    this.thermalBtn = this.root.querySelector('[data-act="thermal"]') as HTMLButtonElement;
    this.shapeBtn = this.root.querySelector('[data-act="shape"]') as HTMLButtonElement;
    this.brushSlider = this.root.querySelector('[data-ctrl="brush"]') as HTMLInputElement;
    this.brushLabel = this.root.querySelector('[data-out="brush"]') as HTMLElement;
    this.fpsEl = this.root.querySelector('[data-out="fps"]') as HTMLElement;
    this.cellsEl = this.root.querySelector('[data-out="cells"]') as HTMLElement;
    this.chunksEl = this.root.querySelector('[data-out="chunks"]') as HTMLElement;
    this.zoomEl = this.root.querySelector('[data-out="zoom"]') as HTMLElement;

    this.playBtn.addEventListener('click', () => store.getState().togglePause());
    (this.root.querySelector('[data-act="clear"]') as HTMLElement).addEventListener(
      'click',
      () => {
        this.grid.clear();
        this.field.clear();
      },
    );
    this.thermalBtn.addEventListener('click', () => store.getState().toggleTemperature());
    this.shapeBtn.addEventListener('click', () => store.getState().cycleBrushShape());
    (this.root.querySelector('[data-act="share"]') as HTMLElement).addEventListener(
      'click',
      () => this.share(),
    );
    (this.root.querySelector('[data-act="burger"]') as HTMLElement).addEventListener(
      'click',
      () => store.getState().toggleDrawer(),
    );
    this.brushSlider.addEventListener('input', () => {
      store.getState().setBrush(Number(this.brushSlider.value));
    });

    (this.root.querySelector('[data-act="zoom-in"]') as HTMLElement).addEventListener(
      'click',
      () => {
        const cx = this.canvasCenter();
        this.camera.zoomAt(cx.x, cx.y, 1.25);
        store.getState().setStats({ zoom: this.camera.zoom / (window.devicePixelRatio || 1) });
      },
    );
    (this.root.querySelector('[data-act="zoom-out"]') as HTMLElement).addEventListener(
      'click',
      () => {
        const cx = this.canvasCenter();
        this.camera.zoomAt(cx.x, cx.y, 1 / 1.25);
        store.getState().setStats({ zoom: this.camera.zoom / (window.devicePixelRatio || 1) });
      },
    );
    (this.root.querySelector('[data-act="fit"]') as HTMLElement).addEventListener(
      'click',
      () => this.onFit(),
    );

    this.wireScenarios();
    this.wireTools();
    this.renderIcons();
  }

  private wireTools(): void {
    const wrap = this.root.querySelector('[data-menu="tools"]') as HTMLElement;
    const btn = wrap.querySelector('[data-act="tools"]') as HTMLButtonElement;
    const panel = wrap.querySelector('[data-menu-panel]') as HTMLElement;
    this.recorder = new VideoRecorder(document.getElementById('sim') as HTMLCanvasElement, 60);

    const render = (): void => {
      const supportsVideo = this.recorder.available;
      const slots = listSlots();
      panel.innerHTML = `
        <div class="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Export</div>
        <button data-tool="png" class="tool-row">
          <i data-lucide="camera"></i>
          <span>Screenshot PNG</span>
        </button>
        <button data-tool="record" class="tool-row ${this.recorder.status === 'recording' ? 'recording' : ''}" ${
          supportsVideo ? '' : 'disabled'
        }>
          <i data-lucide="video"></i>
          <span>${this.recorder.status === 'recording' ? 'Stop recording' : supportsVideo ? 'Record video' : 'Video unsupported'}</span>
        </button>
        <button data-tool="exportfile" class="tool-row">
          <i data-lucide="save"></i>
          <span>Export .flux file</span>
        </button>
        <button data-tool="importfile" class="tool-row">
          <i data-lucide="folder-open"></i>
          <span>Import .flux file</span>
        </button>
        <div class="mx-2 my-1 h-px bg-neutral-800"></div>
        <div class="px-2 pt-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Snapshots</div>
        <div class="grid grid-cols-1 gap-0.5 px-1 pb-1">
          ${slots
            .map(
              (s) => `
                <div class="flex items-center gap-1">
                  <button class="tool-row flex-1 text-left" data-tool="snap-save" data-idx="${s.idx}">
                    <span class="text-neutral-100 font-medium mr-1.5">S${s.idx + 1}</span>
                    <span class="text-[10px] text-neutral-500">${escapeHtml(slotLabel(s))}</span>
                  </button>
                  ${s.hasData ? `
                    <button class="ui-btn h-7 w-7 shrink-0" data-tool="snap-load" data-idx="${s.idx}" title="Load slot">
                      <i data-lucide="folder-open" class="h-3 w-3"></i>
                    </button>
                    <button class="ui-btn h-7 w-7 shrink-0" data-tool="snap-clear" data-idx="${s.idx}" title="Clear slot">
                      <i data-lucide="eraser" class="h-3 w-3"></i>
                    </button>
                  ` : ''}
                </div>`,
            )
            .join('')}
        </div>
      `;
      createIcons({
        icons: { CameraIcon, Video, Save, FolderOpen, Eraser, Wrench },
      });
      // Lucide "camera-icon" name in DOM is "camera"; relink.
    };
    render();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.classList.contains('hidden')) render();
      panel.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target as Node)) panel.classList.add('hidden');
    });

    panel.addEventListener('click', async (e) => {
      const target = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
      if (!target) return;
      const tool = target.dataset.tool!;
      const idxRaw = target.dataset.idx;
      const idx = idxRaw !== undefined ? parseInt(idxRaw, 10) : -1;

      if (tool === 'png') {
        try {
          const canvas = document.getElementById('sim') as HTMLCanvasElement;
          await downloadPng(canvas, `flux-${timestampFile()}.png`);
          showToast('Screenshot saved', 'success');
        } catch (err) {
          showToast(`Screenshot failed: ${(err as Error).message}`, 'error');
        }
        panel.classList.add('hidden');
      } else if (tool === 'record') {
        this.recorder.toggle({
          onStart: () => {
            showToast('Recording… click again to stop', 'info', 2000);
            render();
          },
          onStop: (blob) => {
            if (blob) {
              const ext = (blob.type.includes('mp4') ? 'mp4' : 'webm');
              downloadBlob(blob, `flux-${timestampFile()}.${ext}`);
              showToast(`Video saved (${Math.round(blob.size / 1024)} KB)`, 'success');
            }
            render();
          },
          onError: (err) => {
            showToast(`Recording failed: ${err.message}`, 'error');
            render();
          },
        });
      } else if (tool === 'exportfile') {
        try {
          const encoded = await serialize(this.grid, this.field);
          const bytes = base64UrlToBytes(encoded);
          downloadBlob(
            new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
            `flux-${timestampFile()}.flux`,
          );
          showToast('File exported', 'success');
          panel.classList.add('hidden');
        } catch (err) {
          showToast(`Export failed: ${(err as Error).message}`, 'error');
        }
      } else if (tool === 'importfile') {
        this.pickFluxFile();
        panel.classList.add('hidden');
      } else if (tool === 'snap-save' && idx >= 0) {
        try {
          await saveSnapshot(idx, this.grid, this.field);
          showToast(`Saved to slot ${idx + 1}`, 'success');
          render();
        } catch (err) {
          showToast(`Save failed: ${(err as Error).message}`, 'error');
        }
      } else if (tool === 'snap-load' && idx >= 0) {
        const res = await loadSnapshot(idx, this.grid, this.field);
        if (res.ok) {
          showToast(`Loaded slot ${idx + 1}`, 'success');
          panel.classList.add('hidden');
        } else {
          showToast(`Load failed: ${res.reason}`, 'error');
        }
      } else if (tool === 'snap-clear' && idx >= 0) {
        clearSnapshot(idx);
        showToast(`Slot ${idx + 1} cleared`, 'info');
        render();
      }
    });
  }

  private pickFluxFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.flux,application/octet-stream';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const encoded = bytesToBase64Url(buf);
        const res = await deserialize(encoded, this.grid, this.field);
        if (res.ok) showToast(`Loaded ${file.name}`, 'success');
        else showToast(`Load failed: ${res.reason}`, 'error');
      } catch (err) {
        showToast(`Import failed: ${(err as Error).message}`, 'error');
      }
    });
    input.click();
  }

  private canvasCenter(): { x: number; y: number } {
    const canvas = document.getElementById('sim') as HTMLCanvasElement;
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }

  private wireScenarios(): void {
    const wrap = this.root.querySelector('[data-menu="scenarios"]') as HTMLElement;
    const btn = wrap.querySelector('[data-act="scenarios"]') as HTMLButtonElement;
    const panel = wrap.querySelector('[data-menu-panel]') as HTMLElement;

    for (const s of scenarios) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'w-full text-left px-2.5 py-1.5 rounded hover:bg-neutral-800/70 text-xs';
      item.innerHTML = `
        <div class="text-neutral-100 font-medium">${s.label}</div>
        <div class="text-neutral-500 text-[10px] mt-0.5">${s.description}</div>
      `;
      item.addEventListener('click', () => {
        s.apply(this.grid);
        this.grid.wakeAll();
        this.field.clear();
        panel.classList.add('hidden');
      });
      panel.appendChild(item);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target as Node)) panel.classList.add('hidden');
    });
  }

  private async share(): Promise<void> {
    try {
      const encoded = await serialize(this.grid, this.field);
      const url = `${location.origin}${location.pathname}#s=${encoded}`;
      const sizeKb = Math.round(url.length / 1024);
      // Warn if URL is absurdly long (pathological but possible).
      if (url.length > 200_000) {
        showToast(`Link is very large (${sizeKb} KB) — may not paste everywhere`, 'error', 3500);
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast(`Link copied (${sizeKb} KB)`, 'success');
      } else {
        // Fallback: put it in the address bar so user can copy manually.
        location.hash = `s=${encoded}`;
        showToast('Clipboard unavailable — URL updated in address bar', 'info');
      }
    } catch (e) {
      showToast(`Share failed: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  private renderIcons(): void {
    createIcons({
      icons: {
        Play, Pause, Eraser, Circle, Sparkles, ZoomIn, ZoomOut, Maximize2,
        Flame, Square, Minus, Replace, Share2, Menu, Wrench,
        CameraIcon, Video, Save, FolderOpen,
      },
    });
  }

  private subscribe(): void {
    store.subscribe((s) => {
      this.brushSlider.value = String(s.brushSize);
      this.brushLabel.textContent = String(s.brushSize);
      this.fpsEl.textContent = s.fps.toFixed(0);
      this.cellsEl.textContent = s.activeCells.toLocaleString();
      this.chunksEl.textContent = s.activeChunks.toLocaleString();
      this.zoomEl.textContent = `${Math.round(s.zoom * 100)}%`;

      this.playBtn.innerHTML = s.paused
        ? '<i data-lucide="play"></i>'
        : '<i data-lucide="pause"></i>';

      if (s.showTemperature) this.thermalBtn.classList.add('is-active');
      else this.thermalBtn.classList.remove('is-active');

      // Update shape icon.
      this.shapeBtn.innerHTML = `<i data-lucide="${SHAPE_ICON[s.brushShape]}"></i>`;
      this.shapeBtn.title = `Brush shape: ${s.brushShape} (Tab)`;

      this.renderIcons();
    });
  }
}

// ─── module helpers ───────────────────────────────────────────────────

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const timestampFile = (): string => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBytes = (b64url: string): Uint8Array => {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

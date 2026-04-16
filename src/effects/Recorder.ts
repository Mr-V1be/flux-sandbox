/**
 * Canvas screenshot + video capture.
 *
 * Both features read directly from the main canvas after the full render
 * pipeline (grid + bloom + overlays + post-process) has run, so what the
 * user sees is exactly what gets exported.
 *
 * PNG export uses `canvas.toBlob`. Video uses `canvas.captureStream()` +
 * `MediaRecorder` with VP9 → VP8 → generic WebM fallback so it works on
 * Chromium, Firefox, and (best-effort) Safari.
 */

export const downloadPng = async (
  canvas: HTMLCanvasElement,
  fileName = `flux-${Date.now()}.png`,
): Promise<void> => {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
  triggerDownload(blob, fileName);
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  triggerDownload(blob, fileName);
};

const triggerDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke lazily so Chrome finishes the save dialog.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Pick the first `MediaRecorder`-supported codec from a priority list. */
const pickMimeType = (): string | undefined => {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
};

export type RecorderStatus = 'idle' | 'recording';

export interface RecorderEvents {
  onStart?: () => void;
  onStop?: (blob: Blob | null) => void;
  onError?: (err: Error) => void;
}

export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  public status: RecorderStatus = 'idle';
  public lastBlob: Blob | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly fps = 60,
  ) {}

  get available(): boolean {
    return typeof MediaRecorder !== 'undefined' && pickMimeType() !== undefined;
  }

  start(events?: RecorderEvents): void {
    if (this.status === 'recording') return;
    if (!this.available) {
      events?.onError?.(new Error('MediaRecorder / captureStream not supported'));
      return;
    }
    try {
      const stream = (this.canvas as HTMLCanvasElement & {
        captureStream: (fps?: number) => MediaStream;
      }).captureStream(this.fps);
      const mimeType = pickMimeType();
      this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        const blob = this.chunks.length
          ? new Blob(this.chunks, { type: this.recorder?.mimeType ?? 'video/webm' })
          : null;
        this.lastBlob = blob;
        this.status = 'idle';
        events?.onStop?.(blob);
      };
      this.recorder.onerror = (e: Event) => {
        events?.onError?.(new Error(`MediaRecorder error: ${(e as ErrorEvent).message ?? e}`));
      };
      this.recorder.start(250); // flush every 250 ms
      this.status = 'recording';
      events?.onStart?.();
    } catch (err) {
      events?.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (this.status !== 'recording' || !this.recorder) return;
    this.recorder.stop();
    this.recorder = null;
  }

  toggle(events?: RecorderEvents): void {
    if (this.status === 'recording') this.stop();
    else this.start(events);
  }
}

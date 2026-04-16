/**
 * Minimal transient notification.
 * Only one toast is visible at a time; a new message replaces the old one.
 */
let current: HTMLElement | null = null;
let currentTimer: number | null = null;

export type ToastVariant = 'info' | 'success' | 'error';

const VARIANT_CLASS: Record<ToastVariant, string> = {
  info: 'border-neutral-700 text-neutral-100',
  success: 'border-emerald-700/70 text-emerald-100',
  error: 'border-rose-700/70 text-rose-100',
};

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  durationMs = 2500,
): void {
  if (current) current.remove();
  if (currentTimer !== null) window.clearTimeout(currentTimer);

  const el = document.createElement('div');
  el.className = [
    'fixed bottom-14 left-1/2 -translate-x-1/2 z-50',
    'px-3.5 py-2 rounded-md bg-neutral-900/95 border shadow-xl backdrop-blur',
    'text-[12px] tracking-tight animate-toast',
    VARIANT_CLASS[variant],
  ].join(' ');
  el.textContent = message;
  document.body.appendChild(el);
  current = el;

  currentTimer = window.setTimeout(() => {
    if (current === el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity 180ms ease-out';
      window.setTimeout(() => {
        if (current === el) {
          el.remove();
          current = null;
        }
      }, 180);
    }
  }, durationMs);
}

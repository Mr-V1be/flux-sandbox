/**
 * Typed pub/sub for simulation → effects (audio, particles, shake).
 *
 * The simulation core is pure and knows nothing about feel. It only
 * emits semantic events; listeners decide how to render them.
 */

export type SimEvent =
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'ignition'; x: number; y: number }
  | { type: 'zap'; x: number; y: number }
  | { type: 'boil'; x: number; y: number }
  | { type: 'freeze'; x: number; y: number };

type Handler = (e: SimEvent) => void;

export class EventBus {
  private handlers = new Set<Handler>();

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  emit(e: SimEvent): void {
    for (const h of this.handlers) h(e);
  }
}

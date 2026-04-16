/**
 * Core simulation types.
 * Elements are identified by a numeric ID for fast grid storage.
 */

export type ElementId = number;

/** Cell metadata packed into a single Uint32 per cell:
 * bits  0..11 : elementId          (up to 4096 elements)
 * bits 12..19 : life / counter     (0..255 — burn timer, grow timer, etc.)
 * bits 20..27 : variant / color    (deterministic per-cell tint)
 * bit  28     : updated-this-tick flag
 * bits 29..31 : reserved
 */
export const BIT_ELEMENT = 0;
export const MASK_ELEMENT = 0xfff;
export const BIT_LIFE = 12;
export const MASK_LIFE = 0xff;
export const BIT_VARIANT = 20;
export const MASK_VARIANT = 0xff;
export const BIT_UPDATED = 28;

export const encode = (id: ElementId, life = 0, variant = 0): number =>
  (id & MASK_ELEMENT) |
  ((life & MASK_LIFE) << BIT_LIFE) |
  ((variant & MASK_VARIANT) << BIT_VARIANT);

export const getElement = (cell: number): ElementId => cell & MASK_ELEMENT;
export const getLife = (cell: number): number => (cell >> BIT_LIFE) & MASK_LIFE;
export const getVariant = (cell: number): number => (cell >> BIT_VARIANT) & MASK_VARIANT;
export const isUpdated = (cell: number): boolean => ((cell >> BIT_UPDATED) & 1) === 1;

export const withElement = (cell: number, id: ElementId): number =>
  (cell & ~MASK_ELEMENT) | (id & MASK_ELEMENT);
export const withLife = (cell: number, life: number): number =>
  (cell & ~(MASK_LIFE << BIT_LIFE)) | ((life & MASK_LIFE) << BIT_LIFE);
export const withVariant = (cell: number, variant: number): number =>
  (cell & ~(MASK_VARIANT << BIT_VARIANT)) | ((variant & MASK_VARIANT) << BIT_VARIANT);
export const withUpdated = (cell: number, flag: boolean): number =>
  flag ? cell | (1 << BIT_UPDATED) : cell & ~(1 << BIT_UPDATED);

export type Category = 'empty' | 'solid' | 'powder' | 'liquid' | 'gas' | 'special';

/**
 * Thermal profile — purely declarative.
 * The ThermalEngine reads these to decide temperature-driven state changes.
 * Units are an abstract "game temperature" on an Int8 range (-128..127).
 */
export interface ThermalProfile {
  /** Thermal conductivity 0..0.5. Higher = exchanges heat faster with neighbors. */
  conductivity: number;
  /**
   * Relative heat capacity. Incoming thermal energy is divided by this
   * value, so a higher capacity means the cell resists temperature
   * change for the same amount of flux. Think: water holds its heat,
   * air flips hot/cold instantly. Default 1.0.
   *
   *   ~0.15 — air                    (flips almost instantly)
   *   ~0.3  — other gases / foam
   *   1.0   — metals, base materials
   *   2.0   — sand, ice, wood, lava  (solid thermal mass)
   *   3.0   — water, stone, wall     (high-inertia reservoirs)
   */
  heatCapacity?: number;
  /** If set, the cell resets toward this temp each tick (heat source / sink). */
  emitTemp?: number;
  /** Strength with which emitTemp pulls the cell (0..1). Default 1 (hard reset). */
  emitStrength?: number;
  /** Below this → transition to freezesInto (liquid → solid). */
  freezeAt?: number;
  freezesInto?: string;
  /** Above this → transition to meltsInto (solid → liquid). */
  meltAt?: number;
  meltsInto?: string;
  /** Above this (for liquids) → boilsInto. */
  boilAt?: number;
  boilsInto?: string;
  /** Below this (for gases) → condensesInto. */
  condenseAt?: number;
  condensesInto?: string;
  /** Above this → ignite. */
  ignitesAt?: number;
  /** If set, ignition triggers explosion of this radius instead of burning. */
  explodeRadius?: number;
}

export interface GridApi {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint32Array;
  inBounds(x: number, y: number): boolean;
  get(x: number, y: number): number;
  set(x: number, y: number, cell: number): void;
  swap(ax: number, ay: number, bx: number, by: number): void;
  wake(x: number, y: number): void;
}

/**
 * Read/write access to the temperature field from element behaviors.
 * Letting behaviors inject heat directly enables e.g. uranium's chain
 * reaction without bolting special cases onto ThermalEngine.
 */
export interface FieldApi {
  get(x: number, y: number): number;
  set(x: number, y: number, t: number): void;
  add(x: number, y: number, delta: number): void;
}

export interface ElementContext {
  readonly grid: GridApi;
  readonly field: FieldApi;
  readonly x: number;
  readonly y: number;
  readonly cell: number;
  readonly tick: number;
  rand(): number;
  markUpdated(x: number, y: number): void;
}

export type ElementBehavior = (ctx: ElementContext) => void;

export interface ElementDefinition {
  readonly id: ElementId;
  readonly key: string;
  readonly label: string;
  readonly category: Category;
  /** Base color as 0xRRGGBB. */
  readonly color: number;
  /** Max +/- tint per channel for variance. */
  readonly colorVariance?: number;
  /** Density used by liquid/gas displacement. Higher sinks. */
  readonly density: number;
  /** Whether fire can ignite this (burn timer on the cell). */
  readonly flammable?: boolean;
  /** Whether this acts as fuel for fire source cells. */
  readonly burnChance?: number;
  /** Optional keyboard shortcut. */
  readonly hotkey?: string;
  /** Optional short description shown in UI. */
  readonly description?: string;
  /** Update function. If omitted, element is inert. */
  readonly update?: ElementBehavior;
  /**
   * Optional dynamic color override. Allows per-cell visual state
   * (e.g. a charged conductor glowing). If it returns -1 the renderer
   * falls back to the static color + variance.
   */
  readonly renderColor?: (cell: number, life: number, variant: number) => number;
  /** Thermal properties. If omitted, the cell doesn't participate in heat sim. */
  readonly thermal?: ThermalProfile;
}

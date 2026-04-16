import { ElementDefinition } from './types';

/**
 * Temperature a freshly placed cell starts at.
 *
 *   lava, fire, torch, ice, cryo, … → their own intrinsic `thermal.spawnTemp`
 *   sand, stone, wood, empty, …     → `ambient` (the room-temperature slider)
 *
 * Paint UI, brush strokes, and the flux-hook `paintDot` helper all funnel
 * through here so there is one answer to "what temperature does a brand-new
 * cell of X have right now?".
 */
export const resolveSpawnTemp = (
  def: ElementDefinition | undefined,
  ambient: number,
): number => def?.thermal?.spawnTemp ?? ambient;

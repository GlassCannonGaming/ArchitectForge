import { type AssetCategory, type ClueItem, type FloorId, type HingeSwingMode, INITIAL_CLUES, INITIAL_FLOOR_LAYERS, type PlacedAsset, snapToGrid } from './coreTypesAndFloors';
import { LATE_70S_THRILLER_PALETTE, LIGHTING_PRESETS, buildProcedural3DSpecFromPrompt } from './buildAndPlacement';
import { type ArchitectForgeProjectSnapshot, verifyAiModelCompliance } from './projectAiAndInstaller';
import { DEFAULT_GLOBAL_INSTRUCTION_SET } from './scheduleAndCharacterRig';
// ============================================================================
// SMOOTH 500MS HINGE ROTATION ANIMATION & SYNCHRONIZED FOLEY (PROPOSALS 1 & 2)
// ============================================================================

export const HINGE_TRANSITION_DURATION_MS = 500;

export interface HingeSwingTransform {
  swingMode: HingeSwingMode;
  progress: number;
  easedProgress: number;
  angleRad: number;
  hingeEdgeX: number;
  slideOffsetX: number;
  panelOffsetX: number;
  panelOffsetZ: number;
  isAnimating: boolean;
}

/**
 * Pure helper that computes the smooth cubic ease-in-out hinge rotation angle (or pocket slide offset)
 * for a door or secret bookshelf passage of width `width` across `'right_hinge'`, `'left_hinge'`, or `'pocket_slide'`.
 */
export function computeHingeSwingTransform(
  width: number,
  openProgress: number,
  maxAngleRad = Math.PI / 2.4,
  isAnimating = false,
  swingMode: HingeSwingMode = 'right_hinge'
): HingeSwingTransform {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(openProgress) ? openProgress : 0));
  // Smooth cubic ease-in-out curve over [0, 1]
  const easedProgress =
    clamped < 0.5
      ? 4 * clamped * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 3) / 2;

  if (swingMode === 'pocket_slide') {
    const slideOffsetX = Number((easedProgress * width * 0.86).toFixed(4));
    return {
      swingMode,
      progress: Number(clamped.toFixed(4)),
      easedProgress: Number(easedProgress.toFixed(4)),
      angleRad: 0,
      hingeEdgeX: 0,
      slideOffsetX,
      panelOffsetX: slideOffsetX,
      panelOffsetZ: 0,
      isAnimating
    };
  }

  const sign = swingMode === 'left_hinge' ? -1 : 1;
  const angleRad = Number((sign * easedProgress * maxAngleRad).toFixed(5));
  const hingeEdgeX = Number((sign * width * 0.46).toFixed(4));
  const panelOffsetX = Number(
    (sign * (Math.abs(hingeEdgeX) * (1 - Math.cos(Math.abs(angleRad))) + width * 0.26 * easedProgress)).toFixed(4)
  );
  const panelOffsetZ = Number((- Math.abs(hingeEdgeX) * Math.sin(Math.abs(angleRad))).toFixed(4));

  return {
    swingMode,
    progress: Number(clamped.toFixed(4)),
    easedProgress: Number(easedProgress.toFixed(4)),
    angleRad,
    hingeEdgeX,
    slideOffsetX: 0,
    panelOffsetX,
    panelOffsetZ,
    isAnimating
  };
}

/**
 * Evaluates a PlacedAsset's live hinge animation state at timestamp `nowMs` over the 500ms window.
 */
export function computeAssetHingeAnimationState(
  asset: Pick<
    PlacedAsset,
    | 'dimensions'
    | 'isOpen'
    | 'openProgress'
    | 'hingeSwingMode'
    | 'hingeTransitionStartMs'
    | 'hingeTransitionFrom'
    | 'hingeTransitionTo'
    | 'hingeDurationMs'
  > & { subType?: string },
  nowMs: number,
  maxAngleRad = Math.PI / 2.4
): HingeSwingTransform {
  const width = asset.dimensions?.[0] || 1.2;
  const targetOpen = asset.isOpen ? 1 : 0;
  const defaultSwingMode: HingeSwingMode = (asset.subType || '').toLowerCase().includes('sliding_door')
    ? 'pocket_slide'
    : 'right_hinge';
  const swingMode: HingeSwingMode = asset.hingeSwingMode || defaultSwingMode;

  if (typeof asset.hingeTransitionStartMs === 'number' && Number.isFinite(asset.hingeTransitionStartMs)) {
    const durationMs = Math.max(1, asset.hingeDurationMs || HINGE_TRANSITION_DURATION_MS);
    const fromProgress =
      typeof asset.hingeTransitionFrom === 'number'
        ? asset.hingeTransitionFrom
        : asset.isOpen
          ? 0
          : 1;
    const toProgress =
      typeof asset.hingeTransitionTo === 'number' ? asset.hingeTransitionTo : targetOpen;
    const elapsed = Math.max(0, nowMs - asset.hingeTransitionStartMs);
    const rawT = Math.min(1, elapsed / durationMs);
    const interpolatedProgress = fromProgress + (toProgress - fromProgress) * rawT;
    return computeHingeSwingTransform(width, interpolatedProgress, maxAngleRad, rawT < 1, swingMode);
  }

  const staticProgress =
    typeof asset.openProgress === 'number' ? asset.openProgress : targetOpen;
  return computeHingeSwingTransform(width, staticProgress, maxAngleRad, false, swingMode);
}

/**
 * Pure state transition helper invoked by `handleToggleAssetOpen` to initiate a smooth
 * 500ms hinge rotation from the door/secret passage's current angle to the toggled state.
 */
export function initiateAssetHingeToggle(
  asset: PlacedAsset,
  nowMs = Date.now(),
  durationMs = HINGE_TRANSITION_DURATION_MS
): PlacedAsset {
  const currentAnim = computeAssetHingeAnimationState(asset, nowMs);
  const nextOpen = !asset.isOpen;
  return {
    ...asset,
    isOpen: nextOpen,
    openProgress: currentAnim.progress,
    hingeTransitionStartMs: nowMs,
    hingeTransitionFrom: currentAnim.progress,
    hingeTransitionTo: nextOpen ? 1 : 0,
    hingeDurationMs: durationMs
  };
}

export interface SynchronizedHingeFoleySpec {
  durationMs: number;
  swingPhaseEndSec: number;
  latchClickTimeSec: number;
  swingMode: HingeSwingMode;
  isOpening: boolean;
  isSecretPassage: boolean;
  oscillatorType: 'sawtooth' | 'triangle' | 'sine';
  sweepStartHz: number;
  sweepEndHz: number;
  filterType: 'lowpass' | 'bandpass';
  filterStartCutoffHz: number;
  filterPeakCutoffHz: number;
  latchClickFreqHz: number;
  latchClickDurationSec: number;
  descriptionLabel: string;
}

/**
 * Proposal 1: Computes the synchronized 500ms procedural Foley synthesis envelope
 * (0ms–460ms continuous creak/stone-scrape/pocket-rail sweep + 480ms brass latch-click transient).
 */
export function computeSynchronizedHingeFoleySpec(options?: {
  swingMode?: HingeSwingMode;
  isOpening?: boolean;
  isSecretPassage?: boolean;
  durationMs?: number;
}): SynchronizedHingeFoleySpec {
  const durationMs = Math.max(100, options?.durationMs ?? HINGE_TRANSITION_DURATION_MS);
  const durationSec = durationMs / 1000;
  const swingPhaseEndSec = Number((durationSec * 0.92).toFixed(3)); // 0.46s for 500ms
  const latchClickTimeSec = Number((durationSec * 0.96).toFixed(3)); // 0.48s for 500ms
  const swingMode: HingeSwingMode = options?.swingMode || 'right_hinge';
  const isOpening = options?.isOpening ?? true;
  const isSecretPassage = Boolean(options?.isSecretPassage);

  if (swingMode === 'pocket_slide') {
    return {
      durationMs,
      swingPhaseEndSec,
      latchClickTimeSec,
      swingMode,
      isOpening,
      isSecretPassage,
      oscillatorType: 'triangle',
      sweepStartHz: isOpening ? 112 : 164,
      sweepEndHz: isOpening ? 168 : 96,
      filterType: 'bandpass',
      filterStartCutoffHz: 380,
      filterPeakCutoffHz: 940,
      latchClickFreqHz: 1260,
      latchClickDurationSec: 0.045,
      descriptionLabel: `500ms Pocket-Rail Glide + 480ms Brass Stop Click`
    };
  }

  if (isSecretPassage) {
    return {
      durationMs,
      swingPhaseEndSec,
      latchClickTimeSec,
      swingMode,
      isOpening,
      isSecretPassage,
      oscillatorType: 'sawtooth',
      sweepStartHz: isOpening ? 64 : 46,
      sweepEndHz: isOpening ? 42 : 68,
      filterType: 'lowpass',
      filterStartCutoffHz: 160,
      filterPeakCutoffHz: 540,
      latchClickFreqHz: 980,
      latchClickDurationSec: 0.055,
      descriptionLabel: `500ms Secret Masonry Scrape (${swingMode}) + 480ms Mortise Latch`
    };
  }

  return {
    durationMs,
    swingPhaseEndSec,
    latchClickTimeSec,
    swingMode,
    isOpening,
    isSecretPassage,
    oscillatorType: 'sawtooth',
    sweepStartHz: isOpening ? 142 : 118,
    sweepEndHz: isOpening ? 90 : 76,
    filterType: 'bandpass',
    filterStartCutoffHz: 310,
    filterPeakCutoffHz: 790,
    latchClickFreqHz: 1420,
    latchClickDurationSec: 0.04,
    descriptionLabel: `500ms Aged Timber Hinge Creak (${swingMode}) + 480ms Brass Latch Click`
  };
}

// ============================================================================
// WALL ROW DRAG PLACEMENT CALCULATION
// ============================================================================

export interface WallRowPlacement {
  x: number;
  z: number;
  rotationY: number;
  dimensions: [number, number, number];
}

/**
 * Computes connected wall segment placements in a straight row
 * when clicking and dragging across the 128x128 lot canvas.
 * Automatically aligns to the dominant axis (X or Z) and snaps to grid.
 */
export function computeWallRowPlacements(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  wallDimensions: [number, number, number] = [3.0, 3.0, 0.35],
  gridStep = 0.5
): WallRowPlacement[] {
  const sx = snapToGrid(startX, gridStep);
  const sz = snapToGrid(startZ, gridStep);
  const ex = snapToGrid(endX, gridStep);
  const ez = snapToGrid(endZ, gridStep);

  const dx = ex - sx;
  const dz = ez - sz;
  const dist = Math.hypot(dx, dz);
  const segLength = Math.max(0.5, wallDimensions[0]);

  // If drag distance is very small (< 1.2m), return single segment at start position
  if (dist < 1.2) {
    return [
      {
        x: sx,
        z: sz,
        rotationY: 0,
        dimensions: [...wallDimensions] as [number, number, number]
      }
    ];
  }

  const isXDominant = Math.abs(dx) >= Math.abs(dz);

  if (isXDominant) {
    const totalDist = Math.abs(dx);
    const count = Math.max(1, Math.min(64, Math.round(totalDist / segLength)));
    const dir = dx >= 0 ? 1 : -1;
    const placements: WallRowPlacement[] = [];

    for (let i = 0; i < count; i++) {
      const centerX = sx + dir * (i * segLength + segLength / 2);
      placements.push({
        x: snapToGrid(centerX, gridStep),
        z: sz,
        rotationY: 0,
        dimensions: [...wallDimensions] as [number, number, number]
      });
    }
    return placements;
  } else {
    const totalDist = Math.abs(dz);
    const count = Math.max(1, Math.min(64, Math.round(totalDist / segLength)));
    const dir = dz >= 0 ? 1 : -1;
    const placements: WallRowPlacement[] = [];

    for (let i = 0; i < count; i++) {
      const centerZ = sz + dir * (i * segLength + segLength / 2);
      placements.push({
        x: sx,
        z: snapToGrid(centerZ, gridStep),
        rotationY: Math.PI / 2, // Rotate 90 deg along Z axis
        dimensions: [...wallDimensions] as [number, number, number]
      });
    }
    return placements;
  }
}

// ============================================================================
// FIRST-PERSON CAMERA CONTROLS & PAN DELTA CALCULATIONS
// ============================================================================

/**
 * Computes first-person camera translation relative to the camera's current horizontal yaw.
 * W moves forward in the view direction, S backwards, A strafes left, D strafes right,
 * Space/C move up/down.
 */
export function computeFirstPersonCameraDisplacement(
  theta: number,
  forwardInput: number,
  rightInput: number,
  upInput: number,
  moveSpeed: number
): { dx: number; dy: number; dz: number } {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Looking into the screen toward target:
  const forwardX = -sinT;
  const forwardZ = -cosT;
  const rightX = cosT;
  const rightZ = -sinT;

  const dx = (forwardX * forwardInput + rightX * rightInput) * moveSpeed;
  const dz = (forwardZ * forwardInput + rightZ * rightInput) * moveSpeed;
  const dy = upInput * moveSpeed;

  return { dx, dy, dz };
}

/**
 * Computes world-space camera pan offset from 2D pixel delta,
 * matching 1:1 screen grab motion for left-click empty space drag.
 */
export function computeCameraPanDelta(
  dxPixels: number,
  dyPixels: number,
  cameraFovDegrees: number,
  cameraDistance: number,
  viewportHeightPixels: number,
  cameraRight: [number, number, number],
  cameraUp: [number, number, number]
): { panX: number; panY: number; panZ: number } {
  const vh = Math.max(1, viewportHeightPixels);
  const fovRad = (cameraFovDegrees * Math.PI) / 180;
  const visibleHeightAtDist = 2 * cameraDistance * Math.tan(fovRad * 0.5);
  const unitsPerPixel = visibleHeightAtDist / vh;

  const panX = -cameraRight[0] * (dxPixels * unitsPerPixel) + cameraUp[0] * (dyPixels * unitsPerPixel);
  const panY = -cameraRight[1] * (dxPixels * unitsPerPixel) + cameraUp[1] * (dyPixels * unitsPerPixel);
  const panZ = -cameraRight[2] * (dxPixels * unitsPerPixel) + cameraUp[2] * (dyPixels * unitsPerPixel);

  return { panX, panY, panZ };
}


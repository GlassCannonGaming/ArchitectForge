import { computeFirstPersonCameraDisplacement } from './lightingHingesAndAudio';
import { type CharacterAppearance, type FacialRigParams, type FloorId, type ScheduledActivityGesture, type SkeletonPoseEuler, type TenantDisposition } from './coreTypesAndFloors';
import { computeFacialRigParams, computeSkeletonPose } from './scheduleAndCharacterRig';
export type GlobalAnimationFps = 6 | 8 | 12 | 24;

export const ALLOWED_GLOBAL_ANIMATION_FPS: readonly GlobalAnimationFps[] = [6, 8, 12, 24] as const;

export const DEFAULT_GLOBAL_ANIMATION_FPS: GlobalAnimationFps = 8;

export interface MeshyAnimationActionPreset {
  gesture: ScheduledActivityGesture;
  actionId: number;
  actionName: string;
  categoryLabel: string;
  cycleDurationSec: number;
  description: string;
}

/**
 * Maps each scheduled tenant/character activity gesture to Meshy.ai's
 * `/openapi/v1/animations` library `action_id` preset.
 */
export const MESHY_ANIMATION_PRESETS: Record<ScheduledActivityGesture, MeshyAnimationActionPreset> = {
  idle_observe: {
    gesture: 'idle_observe',
    actionId: 0,
    actionName: 'Idle_Observe_Breathing',
    categoryLabel: 'Daily · Idle Observe',
    cycleDurationSec: 2.5,
    description: 'Low-frame subtle weight shift and watchful corridor scan (Meshy Action #0).'
  },
  pace_corridor: {
    gesture: 'pace_corridor',
    actionId: 1,
    actionName: 'Walk_Corridor_Patrol',
    categoryLabel: 'Locomotion · Corridor Stride',
    cycleDurationSec: 1.5,
    description: 'Measured bipedal walking gait with cane/arm swing synchronization (Meshy Action #1).'
  },
  inspect_ledger: {
    gesture: 'inspect_ledger',
    actionId: 22,
    actionName: 'Inspect_Desk_Ledger',
    categoryLabel: 'Investigation · Inspect Ledger',
    cycleDurationSec: 2.0,
    description: 'Forward thoracic lean with raised right forearm examining registry notes (Meshy Action #22).'
  },
  wall_listen: {
    gesture: 'wall_listen',
    actionId: 45,
    actionName: 'Eavesdrop_Wall_Lean',
    categoryLabel: 'Stealth · Wall Listen',
    cycleDurationSec: 2.5,
    description: 'Conspiratorial ear-to-wainscoting tilt with cupped hand posture (Meshy Action #45).'
  },
  parlor_social: {
    gesture: 'parlor_social',
    actionId: 92,
    actionName: 'Parlor_Converse_Gesture',
    categoryLabel: 'Social · Parlor Converse',
    cycleDurationSec: 2.0,
    description: 'Expressive wrist and shoulder cadence for lobby social hour (Meshy Action #92).'
  },
  sleepwalk_trance: {
    gesture: 'sleepwalk_trance',
    actionId: 118,
    actionName: 'Sleepwalk_Hollow_Trance',
    categoryLabel: 'Occult · Sleepwalk Trance',
    cycleDurationSec: 3.0,
    description: 'Somnambulist swaying drift with outstretched forearms and hollow head pitch (Meshy Action #118).'
  },
  sit_chair: {
    gesture: 'sit_chair',
    actionId: 132,
    actionName: 'Sit_In_Chair_Shared',
    categoryLabel: 'Interact · Sit in Chair',
    cycleDurationSec: 2.0,
    description: 'Shared basic seated posture with 90-degree hip/knee bend and hands resting on armrests (Meshy Action #132).'
  },
  open_door: {
    gesture: 'open_door',
    actionId: 145,
    actionName: 'Open_Door_Handle_Shared',
    categoryLabel: 'Interact · Open Door',
    cycleDurationSec: 1.5,
    description: 'Shared basic door handle reach, brass latch turn, and pull/push swing motion (Meshy Action #145).'
  },
  press_button: {
    gesture: 'press_button',
    actionId: 152,
    actionName: 'Reach_Touch_Button_Shared',
    categoryLabel: 'Interact · Press Button / Switch',
    cycleDurationSec: 1.2,
    description: 'Shared basic reach-out-and-touch right-hand button press animation for all button-activated assets (Meshy Action #152).'
  },
  pickup_item: {
    gesture: 'pickup_item',
    actionId: 164,
    actionName: 'Place_Pickup_Item_Shared',
    categoryLabel: 'Interact · Place / Pickup Item',
    cycleDurationSec: 1.6,
    description: 'Shared basic knee-bend and two-handed reach to place or pick up items (Meshy Action #164).'
  },
  lay_bed: {
    gesture: 'lay_bed',
    actionId: 178,
    actionName: 'Lay_In_Bed_Shared',
    categoryLabel: 'Interact · Lay in Bed',
    cycleDurationSec: 3.0,
    description: 'Shared basic horizontal reclining posture for beds and cots (Meshy Action #178).'
  },
  crawl: {
    gesture: 'crawl',
    actionId: 186,
    actionName: 'Low_Crawl_Shared',
    categoryLabel: 'Locomotion · Crawl',
    cycleDurationSec: 1.8,
    description: 'Shared basic hands-and-knees low crawl cycle for crawlspaces and shafts (Meshy Action #186).'
  },
  run: {
    gesture: 'run',
    actionId: 194,
    actionName: 'Brisk_Run_Shared',
    categoryLabel: 'Locomotion · Run',
    cycleDurationSec: 1.0,
    description: 'Shared basic rapid bipedal run cycle with high knee drive and pumped forearms (Meshy Action #194).'
  }
};

export interface DecimatedPoseKeyframe {
  frameIndex: number;
  timeSec: number;
  pose: SkeletonPoseEuler;
}

export interface MeshyCharacterAnimationClipSpec {
  rigTaskId: string;
  animationTaskId: string;
  gesture: ScheduledActivityGesture;
  actionId: number;
  actionName: string;
  sourceFps: number;
  bakedFps: GlobalAnimationFps;
  cycleDurationSec: number;
  originalFrameCount: number;
  decimatedFrameCount: number;
  keyframeReductionPct: number;
  postProcessOperation: 'change_fps';
  status: 'SUCCEEDED' | 'SYNTHESIZED_LOW_FRAME';
  riggedGlbUrl?: string;
  animationGlbUrl?: string;
  bakedAtIso: string;
  decimatedKeyframes: DecimatedPoseKeyframe[];
}

export interface MeshyRiggingApiPayload {
  model_url: string;
  height_meters: number;
}

export interface MeshyAnimationApiPayload {
  rig_task_id: string;
  action_id: number;
  post_process: {
    operation_type: 'change_fps';
    fps: GlobalAnimationFps;
  };
}

/**
 * Normalizes any numeric FPS input to one of the global low-frame step rates (6, 8, 12, 24).
 */
export function normalizeGlobalAnimationFps(fps?: number): GlobalAnimationFps {
  if (fps === 6 || fps === 8 || fps === 12 || fps === 24) {
    return fps;
  }
  if (typeof fps === 'number' && Number.isFinite(fps)) {
    if (fps <= 7) return 6;
    if (fps <= 10) return 8;
    if (fps <= 18) return 12;
    return 24;
  }
  return DEFAULT_GLOBAL_ANIMATION_FPS;
}

/**
 * Builds the official Meshy.ai `/openapi/v1/rigging` request payload.
 */
export function buildMeshyRiggingRequestPayload(
  modelUrl: string,
  appearance?: Partial<CharacterAppearance>
): MeshyRiggingApiPayload {
  const scale = appearance?.heightScale ?? 1.0;
  const heightMeters = Number(Math.max(1.2, Math.min(2.2, 1.75 * scale)).toFixed(2));
  return {
    model_url: modelUrl.trim() || 'https://assets.meshy.ai/alderney/default_humanoid_hull.glb',
    height_meters: heightMeters
  };
}

/**
 * Builds the official Meshy.ai `/openapi/v1/animations` request payload with
 * `post_process: { operation_type: "change_fps", fps }` to minimize frame density at source.
 */
export function buildMeshyAnimateRequestPayload(
  rigTaskId: string,
  gesture: ScheduledActivityGesture,
  globalFps: GlobalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS
): MeshyAnimationApiPayload {
  const preset = MESHY_ANIMATION_PRESETS[gesture] || MESHY_ANIMATION_PRESETS.idle_observe;
  const validFps = normalizeGlobalAnimationFps(globalFps);
  return {
    rig_task_id: rigTaskId.trim() || 'meshy_rig_default',
    action_id: preset.actionId,
    post_process: {
      operation_type: 'change_fps',
      fps: validFps
    }
  };
}

/**
 * Alteration 1: Quantizes continuous elapsed seconds into discrete low-frame time steps
 * (`stepInterval = 1 / effectiveFps`), creating a deliberate stop-motion / low-frame step clock.
 */
export function quantizeAnimationTimeToStep(
  continuousTimeSec: number,
  effectiveFps: number = DEFAULT_GLOBAL_ANIMATION_FPS
): {
  steppedTimeSec: number;
  stepIndex: number;
  stepIntervalSec: number;
} {
  const safeFps = Math.max(1, Math.min(60, effectiveFps || DEFAULT_GLOBAL_ANIMATION_FPS));
  const stepIntervalSec = 1 / safeFps;
  const safeTime = Math.max(0, Number.isFinite(continuousTimeSec) ? continuousTimeSec : 0);
  const stepIndex = Math.floor(safeTime * safeFps + 1e-7);
  const steppedTimeSec = Number((stepIndex * stepIntervalSec).toFixed(5));
  return {
    steppedTimeSec,
    stepIndex,
    stepIntervalSec
  };
}

/**
 * Alteration 1: Client-side / Server-side keyframe decimation & baking for a character rig.
 * Samples dense 60 FPS skeletal motion down to `globalFps` discrete keyframes and computes
 * exact keyframe reduction savings.
 */
export function decimateAnimationKeyframes(
  appearance: CharacterAppearance,
  gesture: ScheduledActivityGesture,
  globalFps: GlobalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS,
  rigTaskId = 'meshy_rig_local',
  animationTaskId = 'meshy_anim_local',
  sourceFps = 60
): MeshyCharacterAnimationClipSpec {
  const validFps = normalizeGlobalAnimationFps(globalFps);
  const preset = MESHY_ANIMATION_PRESETS[gesture] || MESHY_ANIMATION_PRESETS.idle_observe;
  const cycleDurationSec = preset.cycleDurationSec;
  const originalFrameCount = Math.max(1, Math.round(cycleDurationSec * sourceFps));
  const decimatedFrameCount = Math.max(2, Math.round(cycleDurationSec * validFps));
  const isMoving = gesture === 'pace_corridor' || gesture === 'sleepwalk_trance';

  const decimatedKeyframes: DecimatedPoseKeyframe[] = [];
  for (let i = 0; i < decimatedFrameCount; i++) {
    const timeSec = Number(((i / validFps) % cycleDurationSec).toFixed(4));
    const pose = computeSkeletonPose(
      timeSec,
      isMoving,
      appearance.spineCurvature ?? 0,
      appearance.hasWalkingCane ?? false,
      false,
      gesture
    );
    decimatedKeyframes.push({
      frameIndex: i,
      timeSec,
      pose
    });
  }

  const keyframeReductionPct = Math.max(
    0,
    Math.min(95, Math.round(((originalFrameCount - decimatedFrameCount) / originalFrameCount) * 100))
  );

  return {
    rigTaskId,
    animationTaskId,
    gesture,
    actionId: preset.actionId,
    actionName: preset.actionName,
    sourceFps,
    bakedFps: validFps,
    cycleDurationSec,
    originalFrameCount,
    decimatedFrameCount,
    keyframeReductionPct,
    postProcessOperation: 'change_fps',
    status: rigTaskId.startsWith('meshy_live_') ? 'SUCCEEDED' : 'SYNTHESIZED_LOW_FRAME',
    bakedAtIso: new Date().toISOString(),
    decimatedKeyframes
  };
}

/**
 * Samples a pre-baked `MeshyCharacterAnimationClipSpec` at a stepped timestamp, or falls back
 * to stepped procedural evaluation if no clip is baked for the active gesture.
 */
export function sampleDecimatedClipPose(
  appearance: CharacterAppearance,
  gesture: ScheduledActivityGesture,
  steppedTimeSec: number,
  isMoving: boolean,
  isSpeaking = false
): SkeletonPoseEuler {
  const clip = appearance.googleAiAnimations?.[gesture] || appearance.meshyAnimations?.[gesture];
  if (clip && Array.isArray(clip.decimatedKeyframes) && clip.decimatedKeyframes.length > 0 && !isMoving && !isSpeaking) {
    const cycle = Math.max(0.25, clip.cycleDurationSec || 2.0);
    const wrapped = ((steppedTimeSec % cycle) + cycle) % cycle;
    const idx = Math.min(
      clip.decimatedKeyframes.length - 1,
      Math.floor((wrapped / cycle) * clip.decimatedKeyframes.length)
    );
    return clip.decimatedKeyframes[idx].pose;
  }
  return computeSkeletonPose(
    steppedTimeSec,
    isMoving,
    appearance.spineCurvature ?? 0,
    appearance.hasWalkingCane ?? false,
    isSpeaking,
    gesture
  );
}

export type CharacterAnimationLodTier =
  | 'full_stepped'
  | 'half_stepped'
  | 'minimal_stepped'
  | 'culled';

export interface CharacterAnimationLodState {
  tier: CharacterAnimationLodTier;
  effectiveBodyFps: number;
  steppedTimeSec: number;
  stepIndex: number;
  shouldUpdateBody: boolean;
  shouldUpdateFace: boolean;
  distanceMeters: number;
  cpuSavingsEstimatePct: number;
}

/**
 * Alteration 3: Distance and off-floor animation LOD throttling.
 * - Off-floor or > 35m: `'culled'` (0 FPS body & face updates, 100% CPU saved)
 * - 24m to 35m: `'minimal_stepped'` (2 FPS body updates, face updates paused)
 * - 12m to 24m: `'half_stepped'` (`Math.max(4, Math.floor(globalFps / 2))` FPS body updates, active face)
 * - 0m to 12m: `'full_stepped'` (`globalFps` body updates, full 60Hz facial expressions & lip-sync)
 */
export function computeCharacterAnimationLodState(params: {
  characterFloor: FloorId;
  activeFloor: FloorId;
  isFloorVisible?: boolean;
  distanceMeters: number;
  continuousTimeSec: number;
  lastUpdatedStepIndex?: number;
  globalFps?: GlobalAnimationFps;
}): CharacterAnimationLodState {
  const {
    characterFloor,
    activeFloor,
    isFloorVisible = characterFloor === activeFloor,
    distanceMeters,
    continuousTimeSec,
    lastUpdatedStepIndex,
    globalFps = DEFAULT_GLOBAL_ANIMATION_FPS
  } = params;

  const validGlobalFps = normalizeGlobalAnimationFps(globalFps);
  const safeDist = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0);

  if (!isFloorVisible || safeDist > 35) {
    return {
      tier: 'culled',
      effectiveBodyFps: 0,
      steppedTimeSec: 0,
      stepIndex: -1,
      shouldUpdateBody: false,
      shouldUpdateFace: false,
      distanceMeters: Number(safeDist.toFixed(2)),
      cpuSavingsEstimatePct: 100
    };
  }

  let tier: CharacterAnimationLodTier = 'full_stepped';
  let effectiveBodyFps: number = validGlobalFps;
  let shouldUpdateFace = true;

  if (safeDist > 24) {
    tier = 'minimal_stepped';
    effectiveBodyFps = 2;
    shouldUpdateFace = false;
  } else if (safeDist > 12) {
    tier = 'half_stepped';
    effectiveBodyFps = Math.max(4, Math.floor(validGlobalFps / 2));
    shouldUpdateFace = true;
  }

  const { steppedTimeSec, stepIndex } = quantizeAnimationTimeToStep(
    continuousTimeSec,
    effectiveBodyFps
  );

  const shouldUpdateBody =
    lastUpdatedStepIndex === undefined || lastUpdatedStepIndex !== stepIndex;

  const cpuSavingsEstimatePct = Math.max(
    0,
    Math.min(98, Math.round(((60 - effectiveBodyFps) / 60) * 100))
  );

  return {
    tier,
    effectiveBodyFps,
    steppedTimeSec,
    stepIndex,
    shouldUpdateBody,
    shouldUpdateFace,
    distanceMeters: Number(safeDist.toFixed(2)),
    cpuSavingsEstimatePct
  };
}

/**
 * Alteration 2: Evaluates the hybrid low-frame character rig state where:
 * - Body skeleton joints (`bodyPose`) are evaluated ONLY on discrete low-frame stepped ticks (`steppedTimeSec`)
 * - 3D facial expression & speech lip-sync (`facialRig`) remain active at full continuous frame rate (`continuousTimeSec`)
 */
export function evaluateHybridLowFrameRigState(params: {
  appearance: CharacterAppearance;
  gesture: ScheduledActivityGesture;
  isMoving: boolean;
  isSpeaking: boolean;
  continuousTimeSec: number;
  effectiveFps?: number;
  disposition?: TenantDisposition;
  hasUnansweredQuestions?: boolean;
  cachedBodyPose?: SkeletonPoseEuler;
  lastStepIndex?: number;
}): {
  bodyPose: SkeletonPoseEuler;
  facialRig: FacialRigParams;
  steppedTimeSec: number;
  stepIndex: number;
  bodyPoseRecomputed: boolean;
} {
  const {
    appearance,
    gesture,
    isMoving,
    isSpeaking,
    continuousTimeSec,
    effectiveFps = DEFAULT_GLOBAL_ANIMATION_FPS,
    disposition,
    hasUnansweredQuestions = false,
    cachedBodyPose,
    lastStepIndex
  } = params;

  const safeFps = Math.max(1, Math.min(60, effectiveFps || DEFAULT_GLOBAL_ANIMATION_FPS));
  const { steppedTimeSec, stepIndex } = quantizeAnimationTimeToStep(continuousTimeSec, safeFps);

  const shouldRecomputeBody =
    !cachedBodyPose || lastStepIndex === undefined || lastStepIndex !== stepIndex;

  const bodyPose = shouldRecomputeBody
    ? sampleDecimatedClipPose(appearance, gesture, steppedTimeSec, isMoving, isSpeaking)
    : cachedBodyPose;

  // Alteration 2: Full-rate 3D facial expression & lip-sync rig on top of low-frame body
  const isElderly =
    appearance.archetype === 'Elderly Matron' || (appearance.spineCurvature ?? 0) >= 20;
  const facialRig = computeFacialRigParams(
    appearance.facialExpression || 'neutral',
    disposition,
    isSpeaking,
    continuousTimeSec * 12,
    hasUnansweredQuestions,
    isElderly
  );

  return {
    bodyPose,
    facialRig,
    steppedTimeSec,
    stepIndex,
    bodyPoseRecomputed: shouldRecomputeBody
  };
}


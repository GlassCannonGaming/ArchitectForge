import {
  APARTMENT_ROOM_ASSET_SETS,
  APARTMENT_BUILDING_CATALOG_BLUEPRINTS,
  togglePlacedAssetConditionVariant,
  getPairedVariantSubtype,
  buildGeminiApartmentAssetPromptQueue,
  APARTMENT_1990S_HOTEL_CATALOG_BLUEPRINTS,
  APARTMENT_UPDATED_HOTEL_ASSET_SETS,
  STRUCTURAL_HOTEL_ASSET_SUBTYPES,
  isStructuralHotelAsset,
  canAssetBeUpdatedInHotel,
  getUpdated1990sVariantSubtype,
  getPredecessor1978Subtype,
  upgradeAssetTo1990sHotelVersion,
  downgradeAssetTo1978Version,
  buildGemini1990sHotelAssetPromptQueue
} from '../apartmentImportData';
import { type RoomBlueprint, type StudioWindowId } from './roomBlueprintsAndWindows';
import { type AssetCategory, type AssetConditionVariant, type CharacterAppearance, type CharacterVoiceProfile, type CompositeSubPart, type FacialExpressionType, type FloorId, GRID_TILE_COUNT, type GeminiPrebuiltVoiceName, type HingeSwingMode, type HotelAgentProfile, type PlacedAsset, type ScheduledActivityGesture, type SkeletonPoseEuler, type TexturePresetId, snapToGrid } from './coreTypesAndFloors';
import { DEFAULT_GLOBAL_ANIMATION_FPS, type DecimatedPoseKeyframe, type GlobalAnimationFps, type MeshyCharacterAnimationClipSpec, decimateAnimationKeyframes, normalizeGlobalAnimationFps } from './keybindingsAndAnimation';
import { type InteractionMemoryEvaluation } from './scheduleAndCharacterRig';
// ============================================================================
// GOOGLE AI STUDIO CHARACTER ANIMATION & FACIAL / VOICE IDENTITY SYSTEM
// (`gemini-3.1-flash-lite` Low-Frame Keyframe Synthesis + `gemini-3.8-flash-lite-tts`
//  Persistent Character Voice, Tone, Accent & Facial Expression Continuity)
// ============================================================================

export interface GoogleAiAnimationActionPreset {
  gesture: ScheduledActivityGesture;
  presetId: string;
  actionName: string;
  categoryLabel: string;
  cycleDurationSec: number;
  defaultFacialExpression: FacialExpressionType;
  motionPromptDirective: string;
  description: string;
}

export const GOOGLE_AI_ANIMATION_PRESETS: Record<ScheduledActivityGesture, GoogleAiAnimationActionPreset> = {
  idle_observe: {
    gesture: 'idle_observe',
    presetId: 'gai_anim_idle_observe',
    actionName: 'GoogleAI_Idle_Observe_Scan',
    categoryLabel: 'Daily · Watchful Idle Scan',
    cycleDurationSec: 2.5,
    defaultFacialExpression: 'suspicious',
    motionPromptDirective:
      'Subtle breathing chest rise, slow watchful head pan across the hotel corridor, micro-shifts in shoulder stance.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame watchful idle scan with synchronized suspicious eye-gaze micro-shifts.'
  },
  pace_corridor: {
    gesture: 'pace_corridor',
    presetId: 'gai_anim_pace_corridor',
    actionName: 'GoogleAI_Corridor_Patrol_Gait',
    categoryLabel: 'Locomotion · Measured Corridor Stride',
    cycleDurationSec: 1.5,
    defaultFacialExpression: 'weary',
    motionPromptDirective:
      'Measured bipedal hotel corridor walking stride with natural arm counter-swing and attentive head pitch.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame bipedal corridor walk cycle with synchronized facial focus.'
  },
  inspect_ledger: {
    gesture: 'inspect_ledger',
    presetId: 'gai_anim_inspect_ledger',
    actionName: 'GoogleAI_Inspect_Ledger_Audit',
    categoryLabel: 'Investigation · Inspect Guest Ledger',
    cycleDurationSec: 2.0,
    defaultFacialExpression: 'side_eye_glare',
    motionPromptDirective:
      'Attentive upper-body lean over desk register, right forearm tracing entries, subtle head nod and brow furrow.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame ledger inspection sequence with analytical brow furrow.'
  },
  wall_listen: {
    gesture: 'wall_listen',
    presetId: 'gai_anim_wall_listen',
    actionName: 'GoogleAI_Wall_Eavesdrop_Lean',
    categoryLabel: 'Stealth · Wainscoting Eavesdrop',
    cycleDurationSec: 2.5,
    defaultFacialExpression: 'paranoid_twitch',
    motionPromptDirective:
      'Conspiratorial lateral head tilt toward hollow brick partition, raised hand near ear, tense stillness.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame eavesdropping posture with paranoid eyelid micro-tremor.'
  },
  parlor_social: {
    gesture: 'parlor_social',
    presetId: 'gai_anim_parlor_social',
    actionName: 'GoogleAI_Parlor_Converse_Cadence',
    categoryLabel: 'Social · Parlor Conversation',
    cycleDurationSec: 2.0,
    defaultFacialExpression: 'smirk',
    motionPromptDirective:
      'Expressive conversational forearm and wrist gestures, poised head tilt, guarded parlor demeanor.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame social conversing cadence with expressive facial inflection.'
  },
  sleepwalk_trance: {
    gesture: 'sleepwalk_trance',
    presetId: 'gai_anim_sleepwalk_trance',
    actionName: 'GoogleAI_Sleepwalk_Somnambulist',
    categoryLabel: 'Occult · Somnambulist Drift',
    cycleDurationSec: 3.0,
    defaultFacialExpression: 'hollow_stare',
    motionPromptDirective:
      'Hypnotic swaying torso drift, partially raised forearms, entranced head pitch toward basement shaft.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame somnambulist trance cycle with dilated hollow stare.'
  },
  sit_chair: {
    gesture: 'sit_chair',
    presetId: 'gai_anim_sit_chair',
    actionName: 'GoogleAI_Sit_In_Chair',
    categoryLabel: 'Interact · Sit in Chair',
    cycleDurationSec: 2.0,
    defaultFacialExpression: 'neutral',
    motionPromptDirective: 'Basic shared seated posture with 90-degree hip and knee bend and calm breathing.',
    description: 'Shared basic rig movement for sitting in chairs, armchairs, and parlor sofas.'
  },
  open_door: {
    gesture: 'open_door',
    presetId: 'gai_anim_open_door',
    actionName: 'GoogleAI_Open_Door',
    categoryLabel: 'Interact · Open Door',
    cycleDurationSec: 1.5,
    defaultFacialExpression: 'suspicious',
    motionPromptDirective: 'Basic shared right-hand reach, handle twist, and door swing pull/push.',
    description: 'Shared basic rig movement for opening suite doors and secret bookshelf passages.'
  },
  press_button: {
    gesture: 'press_button',
    presetId: 'gai_anim_press_button',
    actionName: 'GoogleAI_Press_Button_Touch',
    categoryLabel: 'Interact · Press Button / Touch',
    cycleDurationSec: 1.2,
    defaultFacialExpression: 'neutral',
    motionPromptDirective: 'Same shared reach-out-and-touch right-arm extension for all button-activated assets.',
    description: 'Shared basic reach-out-and-touch animation used across all button-activated assets (TVs, switches, intercoms, radios, elevators).'
  },
  pickup_item: {
    gesture: 'pickup_item',
    presetId: 'gai_anim_pickup_item',
    actionName: 'GoogleAI_Place_Pickup_Item',
    categoryLabel: 'Interact · Place / Pickup Item',
    cycleDurationSec: 1.6,
    defaultFacialExpression: 'suspicious',
    motionPromptDirective: 'Basic shared knee crouch and forward reach to pick up or place an item.',
    description: 'Shared basic rig movement for placing or picking up clues, keys, and props.'
  },
  lay_bed: {
    gesture: 'lay_bed',
    presetId: 'gai_anim_lay_bed',
    actionName: 'GoogleAI_Lay_In_Bed',
    categoryLabel: 'Interact · Lay in Bed',
    cycleDurationSec: 3.0,
    defaultFacialExpression: 'weary',
    motionPromptDirective: 'Basic shared horizontal reclining posture on a suite bed with slow breathing.',
    description: 'Shared basic rig movement for laying in a bed.'
  },
  crawl: {
    gesture: 'crawl',
    presetId: 'gai_anim_crawl',
    actionName: 'GoogleAI_Crawl',
    categoryLabel: 'Locomotion · Crawl',
    cycleDurationSec: 1.8,
    defaultFacialExpression: 'alarmed',
    motionPromptDirective: 'Basic shared low hands-and-knees crawl locomotion.',
    description: 'Shared basic rig movement for crawling through low passages.'
  },
  run: {
    gesture: 'run',
    presetId: 'gai_anim_run',
    actionName: 'GoogleAI_Run',
    categoryLabel: 'Locomotion · Run',
    cycleDurationSec: 1.0,
    defaultFacialExpression: 'alarmed',
    motionPromptDirective: 'Basic shared brisk running stride with reciprocal arm and knee drive.',
    description: 'Shared basic rig movement for running down corridors.'
  }
};

export interface GoogleAiAnimationKeyframe extends DecimatedPoseKeyframe {
  facialExpression?: FacialExpressionType;
  browFurrowOffset?: number;
  mouthApertureOffset?: number;
}

export interface GoogleAiCharacterAnimationClipSpec extends MeshyCharacterAnimationClipSpec {
  engine: 'google_ai_studio';
  modelId: 'gemini-3.1-flash-lite';
  presetId: string;
  motionPrompt: string;
  dominantExpression: FacialExpressionType;
  keyframes: GoogleAiAnimationKeyframe[];
}

export function buildGoogleAiAnimationPromptSpec(params: {
  characterName: string;
  archetype: string;
  gesture: ScheduledActivityGesture;
  globalFps?: GlobalAnimationFps;
  customMotionPrompt?: string;
  facialExpression?: FacialExpressionType;
  voiceProfile?: CharacterVoiceProfile;
}): {
  modelId: 'gemini-3.1-flash-lite';
  gesture: ScheduledActivityGesture;
  targetFps: GlobalAnimationFps;
  expectedKeyframeCount: number;
  cycleDurationSec: number;
  promptText: string;
} {
  const validFps = normalizeGlobalAnimationFps(params.globalFps);
  const preset = GOOGLE_AI_ANIMATION_PRESETS[params.gesture] || GOOGLE_AI_ANIMATION_PRESETS.idle_observe;
  const expectedKeyframeCount = Math.max(2, Math.round(preset.cycleDurationSec * validFps));
  const expr = params.facialExpression || preset.defaultFacialExpression;
  const customNote = (params.customMotionPrompt || '').trim();
  const voiceNote = params.voiceProfile
    ? `Locked Voice/Demeanor: ${params.voiceProfile.vocalTone} (${params.voiceProfile.accent} accent, ${params.voiceProfile.cadenceStyle}).`
    : '';

  const promptText = [
    `Synthesize a low-frame 3D humanoid skeletal animation clip for "${params.characterName}" (${params.archetype}) in a late-1970s mystery hotel.`,
    `Target Gesture: ${preset.actionName} (${preset.gesture}) · Cycle Duration: ${preset.cycleDurationSec}s · Step Rate: ${validFps} FPS (${expectedKeyframeCount} keyframes).`,
    `Motion Directive: ${customNote || preset.motionPromptDirective}`,
    `Synchronized 3D Facial Expression: ${expr}. ${voiceNote}`,
    `Output upright external-rig-compatible Euler angles (radians) for pelvis, lumbar/thoracic spine, neck, head, clavicles, upper arms, forearms, hands, thighs, calves, and feet.`
  ].join('\n');

  return {
    modelId: 'gemini-3.1-flash-lite',
    gesture: params.gesture,
    targetFps: validFps,
    expectedKeyframeCount,
    cycleDurationSec: preset.cycleDurationSec,
    promptText
  };
}

/**
 * Synthesizes a Google AI Studio (`gemini-3.1-flash-lite`) low-frame character animation clip
 * with optional AI-generated keyframe overrides and synchronized 3D facial expression tags.
 */
export function synthesizeGoogleAiCharacterAnimationClip(
  appearance: CharacterAppearance,
  gesture: ScheduledActivityGesture,
  globalFps: GlobalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS,
  options: {
    customMotionPrompt?: string;
    facialExpression?: FacialExpressionType;
    aiKeyframeModifiers?: Array<{
      headX?: number;
      headY?: number;
      headZ?: number;
      spineThoracicX?: number;
      spineLumbarY?: number;
      leftUpperArmX?: number;
      rightUpperArmX?: number;
      leftForearmX?: number;
      rightForearmX?: number;
      facialExpression?: FacialExpressionType;
    }>;
    taskId?: string;
  } = {}
): GoogleAiCharacterAnimationClipSpec {
  const validFps = normalizeGlobalAnimationFps(globalFps);
  const preset = GOOGLE_AI_ANIMATION_PRESETS[gesture] || GOOGLE_AI_ANIMATION_PRESETS.idle_observe;
  const dominantExpression =
    options.facialExpression ||
    appearance.facialExpression ||
    preset.defaultFacialExpression;

  // Always use upright external-rig-ready posture (spineCurvature = 0) unless explicitly set
  const cleanAppearance: CharacterAppearance = {
    ...appearance,
    spineCurvature: 0,
    hasWalkingCane: false
  };

  const taskId = options.taskId || `gai_anim_${gesture}_${validFps}fps`;
  const baseSpec = decimateAnimationKeyframes(
    cleanAppearance,
    gesture,
    validFps,
    `gai_rig_${gesture}`,
    taskId,
    60
  );

  const modifiers = Array.isArray(options.aiKeyframeModifiers) ? options.aiKeyframeModifiers : [];
  const keyframes: GoogleAiAnimationKeyframe[] = baseSpec.decimatedKeyframes.map((kf, idx) => {
    const mod = modifiers[idx % Math.max(1, modifiers.length)];
    const clampRad = (val: number | undefined, fallback: number, limit = 1.35) =>
      typeof val === 'number' && Number.isFinite(val)
        ? Math.max(-limit, Math.min(limit, Number(val.toFixed(4))))
        : fallback;

    const mergedPose: SkeletonPoseEuler = mod
      ? {
          ...kf.pose,
          headX: clampRad(mod.headX, kf.pose.headX, 0.65),
          headY: clampRad(mod.headY, kf.pose.headY, 0.85),
          headZ: clampRad(mod.headZ, kf.pose.headZ, 0.45),
          spineThoracicX: clampRad(mod.spineThoracicX, kf.pose.spineThoracicX, 0.55),
          spineLumbarY: clampRad(mod.spineLumbarY, kf.pose.spineLumbarY, 0.45),
          leftUpperArmX: clampRad(mod.leftUpperArmX, kf.pose.leftUpperArmX, 1.35),
          rightUpperArmX: clampRad(mod.rightUpperArmX, kf.pose.rightUpperArmX, 1.35),
          leftForearmX: clampRad(mod.leftForearmX, kf.pose.leftForearmX, 1.45),
          rightForearmX: clampRad(mod.rightForearmX, kf.pose.rightForearmX, 1.45),
          caneGripActive: false
        }
      : { ...kf.pose, caneGripActive: false };

    return {
      frameIndex: kf.frameIndex,
      timeSec: kf.timeSec,
      pose: mergedPose,
      facialExpression: mod?.facialExpression || dominantExpression
    };
  });

  return {
    ...baseSpec,
    engine: 'google_ai_studio',
    modelId: 'gemini-3.1-flash-lite',
    presetId: preset.presetId,
    actionName: preset.actionName,
    motionPrompt: (options.customMotionPrompt || '').trim() || preset.motionPromptDirective,
    dominantExpression,
    decimatedKeyframes: keyframes,
    keyframes
  };
}

/**
 * Canonical locked-in voice, vocal tone, regional accent, and baseline facial expression profiles
 * for all core characters in The Alderney Arms Hotel. Ensures every character has a distinct
 * voice/tone/accent maintained strictly throughout the entire playthrough.
 */
export const DEFAULT_CHARACTER_VOICE_PROFILES: Record<string, CharacterVoiceProfile> = {
  agent_arthur: {
    prebuiltVoiceName: 'Charon',
    vocalTone: 'Hushed, gravel-edged, world-weary front-desk baritone',
    accent: '1970s Old New York Mid-Atlantic',
    cadenceStyle: 'Measured, deliberate pauses while cross-checking ledger timestamps',
    pitchMultiplier: 0.88,
    speakingRate: 0.92,
    baselineExpression: 'weary',
    persistAcrossPlaythrough: true
  },
  agent_eleanor: {
    prebuiltVoiceName: 'Kore',
    vocalTone: 'Poised, aristocratic, sharply observant contralto',
    accent: 'New England Brahmin Transatlantic',
    cadenceStyle: 'Clipped, articulate phrasing with guarded upper-crust composure',
    pitchMultiplier: 1.06,
    speakingRate: 0.95,
    baselineExpression: 'suspicious',
    persistAcrossPlaythrough: true
  },
  agent_barnaby: {
    prebuiltVoiceName: 'Fenrir',
    vocalTone: 'Reverent, ink-stained, conspiratorial academic bass',
    accent: 'Oxford-Inflected Antiquarian',
    cadenceStyle: 'Rhythmic, scholarly cadence that drops to a whisper on occult masonry',
    pitchMultiplier: 0.84,
    speakingRate: 0.90,
    baselineExpression: 'paranoid_twitch',
    persistAcrossPlaythrough: true
  },
  agent_clara: {
    prebuiltVoiceName: 'Zephyr',
    vocalTone: 'Breathless, velvet-gloved, theatrical socialite mezzo',
    accent: 'Manhattan Upper East Side Vintage',
    cadenceStyle: 'Expressive, dramatic inflections punctuated by knowing sighs',
    pitchMultiplier: 1.12,
    speakingRate: 1.04,
    baselineExpression: 'smirk',
    persistAcrossPlaythrough: true
  },
  agent_marcus: {
    prebuiltVoiceName: 'Puck',
    vocalTone: 'Restless, analytical, sleep-deprived structural tenor',
    accent: 'Chicago Industrial Drafting-Room',
    cadenceStyle: 'Crisp, blueprint-precise technical phrasing with nervous urgency',
    pitchMultiplier: 0.96,
    speakingRate: 1.06,
    baselineExpression: 'side_eye_glare',
    persistAcrossPlaythrough: true
  },
  agent_helper: {
    prebuiltVoiceName: 'Zephyr',
    vocalTone: 'Metallic, brass-horn phonograph resonance with warm vacuum-tube hum',
    accent: '1920s Transatlantic Broadcast Modulation',
    cadenceStyle: 'Rhythmic turntable-locked cadence with subtle static pauses',
    pitchMultiplier: 0.92,
    speakingRate: 0.88,
    baselineExpression: 'cryptic_whisper',
    persistAcrossPlaythrough: true
  }
};

export function inferVoiceProfileFromArchetypeAndName(
  name: string,
  archetype: string,
  seedText = ''
): CharacterVoiceProfile {
  const lowerName = (name || '').toLowerCase();
  const lowerArch = (archetype || '').toLowerCase();
  const lowerSeed = (seedText || '').toLowerCase();

  if (lowerName.includes('arthur')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_arthur };
  if (lowerName.includes('eleanor')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_eleanor };
  if (lowerName.includes('barnaby') || lowerName.includes('finch')) {
    return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_barnaby };
  }
  if (lowerName.includes('clara')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_clara };
  if (lowerName.includes('marcus')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_marcus };

  if (lowerArch.includes('archivist') || lowerSeed.includes('occult')) {
    return {
      prebuiltVoiceName: 'Fenrir',
      vocalTone: 'Hushed, resonant, scholarly baritone',
      accent: 'Old-World Antiquarian Mid-Atlantic',
      cadenceStyle: 'Measured, deliberate academic phrasing with conspiratorial pauses',
      pitchMultiplier: 0.86,
      speakingRate: 0.91,
      baselineExpression: 'suspicious',
      persistAcrossPlaythrough: true
    };
  }
  if (lowerArch.includes('socialite') || lowerArch.includes('matron')) {
    return {
      prebuiltVoiceName: 'Kore',
      vocalTone: 'Refined, velvet-edged, observant alto',
      accent: '1970s Manhattan Transatlantic',
      cadenceStyle: 'Poised, articulate, slightly theatrical delivery',
      pitchMultiplier: 1.08,
      speakingRate: 0.96,
      baselineExpression: 'smirk',
      persistAcrossPlaythrough: true
    };
  }
  if (lowerArch.includes('bellhop')) {
    return {
      prebuiltVoiceName: 'Puck',
      vocalTone: 'Quick-witted, watchful late-shift tenor',
      accent: '1970s Lower East Side New York',
      cadenceStyle: 'Brisk, street-smart, low-volume corridor delivery',
      pitchMultiplier: 1.02,
      speakingRate: 1.05,
      baselineExpression: 'alarmed',
      persistAcrossPlaythrough: true
    };
  }

  return {
    prebuiltVoiceName: 'Charon',
    vocalTone: 'Measured, smoky noir baritone',
    accent: '1970s Classic New York Noir',
    cadenceStyle: 'Calm, observant, unhurried detective cadence',
    pitchMultiplier: 0.90,
    speakingRate: 0.94,
    baselineExpression: 'neutral',
    persistAcrossPlaythrough: true
  };
}

/**
 * Returns a character's locked `CharacterVoiceProfile`, preserving any customized voice/tone/accent
 * across the entire playthrough.
 */
export function getOrCreateCharacterVoiceProfile(
  agent: Pick<HotelAgentProfile, 'id' | 'name' | 'occupation' | 'voiceStyle' | 'voiceProfile'> & {
    appearance?: Partial<CharacterAppearance>;
  }
): CharacterVoiceProfile {
  if (agent.voiceProfile && agent.voiceProfile.prebuiltVoiceName) {
    return {
      ...agent.voiceProfile,
      persistAcrossPlaythrough: true
    };
  }
  if (agent.appearance?.voiceProfile && agent.appearance.voiceProfile.prebuiltVoiceName) {
    return {
      ...agent.appearance.voiceProfile,
      persistAcrossPlaythrough: true
    };
  }
  if (agent.id && DEFAULT_CHARACTER_VOICE_PROFILES[agent.id]) {
    return { ...DEFAULT_CHARACTER_VOICE_PROFILES[agent.id] };
  }
  return inferVoiceProfileFromArchetypeAndName(
    agent.name || 'Tenant',
    agent.occupation || agent.appearance?.archetype || 'Detective Clerk',
    agent.voiceStyle || ''
  );
}

/**
 * Resolves the character's locked `CharacterVoiceProfile` and context-driven 3D `FacialExpressionType`
 * for a dialogue turn while strictly preserving the character's voice, vocal tone, and accent across the playthrough.
 */
export function resolveCharacterVoiceAndExpressionForTurn(
  agent: HotelAgentProfile,
  memoryEval?: Partial<InteractionMemoryEvaluation> | null,
  replyText = ''
): {
  voiceProfile: CharacterVoiceProfile;
  activeFacialExpression: FacialExpressionType;
  ttsStyleDirective: string;
} {
  const voiceProfile = getOrCreateCharacterVoiceProfile(agent);
  const lowerReply = (replyText || '').toLowerCase();
  let activeFacialExpression: FacialExpressionType =
    agent.activeFacialExpression ||
    agent.appearance?.facialExpression ||
    voiceProfile.baselineExpression ||
    'neutral';

  if (memoryEval) {
    if ((memoryEval.triggeredDislikes && memoryEval.triggeredDislikes.length > 0) || (memoryEval.trustDelta ?? 0) <= -10) {
      activeFacialExpression =
        memoryEval.resultingDisposition === 'hostile' ? 'grimace' : 'side_eye_glare';
    } else if (memoryEval.unansweredDaysWaiting && memoryEval.unansweredDaysWaiting >= 1) {
      activeFacialExpression = 'suspicious';
    } else if ((memoryEval.triggeredLikes && memoryEval.triggeredLikes.length > 0) || (memoryEval.trustDelta ?? 0) >= 8) {
      activeFacialExpression = 'smirk';
    }
  }

  if (lowerReply.includes('whisper') || lowerReply.includes('behind the wall') || lowerReply.includes('hush')) {
    activeFacialExpression = 'cryptic_whisper';
  } else if (lowerReply.includes('vanished') || lowerReply.includes('blood') || lowerReply.includes('scream')) {
    activeFacialExpression = 'shocked';
  } else if (lowerReply.includes('watch') || lowerReply.includes('careful') || lowerReply.includes('latch')) {
    if (activeFacialExpression === 'neutral') {
      activeFacialExpression = 'suspicious';
    }
  }

  const ttsStyleDirective = `Speak with a ${voiceProfile.accent} accent in a ${voiceProfile.vocalTone} tone (${voiceProfile.cadenceStyle}), conveying a ${activeFacialExpression.replace(/_/g, ' ')} facial expression`;

  return {
    voiceProfile,
    activeFacialExpression,
    ttsStyleDirective
  };
}

/**
 * Builds the official Google AI Studio `gemini-3.8-flash-lite-tts` request payload
 * using `prebuiltVoiceConfig.voiceName` and `speechMetadata.style` so the character's
 * voice, tone, and accent remain locked across the entire playthrough.
 */
export function buildGeminiTtsRequestPayload(
  agent: Pick<HotelAgentProfile, 'id' | 'name' | 'occupation' | 'voiceStyle' | 'voiceProfile' | 'activeFacialExpression'> & {
    appearance?: Partial<CharacterAppearance>;
  },
  textToSpeak: string,
  overrideExpression?: FacialExpressionType
): {
  model: 'gemini-3.8-flash-lite-tts';
  contents: {
    parts: Array<{
      text: string;
      speechMetadata: {
        style: string;
      };
    }>;
  };
  config: {
    responseModalities: ['AUDIO'];
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: GeminiPrebuiltVoiceName;
        };
      };
    };
  };
  voiceProfile: CharacterVoiceProfile;
  activeFacialExpression: FacialExpressionType;
} {
  const voiceProfile = getOrCreateCharacterVoiceProfile(agent);
  const activeFacialExpression: FacialExpressionType =
    overrideExpression ||
    agent.activeFacialExpression ||
    agent.appearance?.facialExpression ||
    voiceProfile.baselineExpression ||
    'neutral';

  const styleDirective = `Speak with a consistent ${voiceProfile.accent} accent in a ${voiceProfile.vocalTone} vocal tone (${voiceProfile.cadenceStyle}), maintaining ${agent.name}'s signature voice and a ${activeFacialExpression.replace(/_/g, ' ')} expression`;

  return {
    model: 'gemini-3.8-flash-lite-tts',
    contents: {
      parts: [
        {
          text: (textToSpeak || '').trim() || 'The corridor remains quiet.',
          speechMetadata: {
            style: styleDirective
          }
        }
      ]
    },
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceProfile.prebuiltVoiceName
          }
        }
      }
    },
    voiceProfile,
    activeFacialExpression
  };
}

// ============================================================================
// SINGLE & MULTI-ITEM COPY (CTRL+C) / PASTE (CTRL+V) & REUSABLE ASSET SETS

import { type MeshyCharacterAnimationClipSpec } from './keybindingsAndAnimation';
import { type GoogleAiCharacterAnimationClipSpec } from './catalogVoiceAndSets';
export type FloorId = 'basement' | 'lobby' | 'floor1' | 'floor2' | 'floor3' | string;

export const GRID_TILE_COUNT = 128; // 128x128 square tiles lot

export interface FloorLayer {
  id: FloorId;
  label: string;
  shortCode: string;
  elevation: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export type AssetCategory =
  | 'wall'
  | 'secret_wall'
  | 'floor_tile'
  | 'door'
  | 'window_wall'
  | 'furniture'
  | 'appliance'
  | 'lighting'
  | 'clue_prop'
  | 'custom_ai';

export type TexturePresetId =
  | 'nyc_old_brick'
  | 'plaster_cream'
  | 'wallpaper_damask'
  | 'oak_parquet'
  | 'checker_marble'
  | 'aged_brass'
  | 'velvet_crimson'
  | 'industrial_concrete'
  | 'custom_ai_tex';

export interface CompositeSubPart {
  id: string;
  shape: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'lathe';
  offset: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
}

export type HingeSwingMode = 'right_hinge' | 'left_hinge' | 'pocket_slide';

export type AssetConditionVariant = 'pristine' | 'unkempt' | 'updated';

export interface PlacedAsset {
  id: string;
  name: string;
  category: AssetCategory;
  subType: string;
  floor: FloorId;
  roomNumber?: string; // e.g., '101', '102', 'Lobby', 'Secret-1A'
  position: [number, number, number];
  dimensions: [number, number, number]; // width, height, depth
  rotationY: number; // radians
  color: string;
  textureId: TexturePresetId;
  customTextureUrl?: string;
  isSecretPassage?: boolean;
  isOpen?: boolean;
  isActivated?: boolean;
  interactionStateLabel?: string;
  openProgress?: number;
  hingeSwingMode?: HingeSwingMode;
  hingeTransitionStartMs?: number;
  hingeTransitionFrom?: number;
  hingeTransitionTo?: number;
  hingeDurationMs?: number;
  clueId?: string;
  inspectText?: string;
  collidable: boolean;
  compositeParts?: CompositeSubPart[];
  meshyTaskId?: string;
  tags?: string[];
  soundPresetId?: string;
  pairedVariantId?: string;
  conditionVariant?: AssetConditionVariant;
  era?: '1970s' | '1980s' | '1990s' | 'timeless';
  canUpdateInHotel?: boolean;
  structuralConstraint?: string;
  predecessor1978Id?: string;
  paired1990sId?: string;
  isInvisibleTrigger?: boolean;
  triggerEventType?: InvisibleTriggerEventType;
  triggerTargetId?: string;
  triggerPayload?: string;
  triggerRadius?: number;
  triggerOnce?: boolean;
  hasTriggered?: boolean;
  triggeredCount?: number;
  isLightEmitting?: boolean;
  emissionIntensity?: number;
  lightIntensity?: number;
  lightingPreset?: string;
  customAnimationFps?: number;
  customFlickerFps?: number;
  prevLightColorHex?: string;
  prevEmissionIntensity?: number;
  lightingTransitionStartMs?: number;
  isLocked?: boolean;
}

export type InvisibleTriggerEventType =
  | 'sound_ambience'
  | 'open_secret_passage'
  | 'sanity_shock'
  | 'lights_flicker'
  | 'npc_anomaly'
  | 'clue_reveal';

export type CharacterArchetype =
  | 'Detective Clerk'
  | 'Night Bellhop'
  | 'Occult Archivist'
  | ' eccentric Socialite'
  | 'Eccentric Socialite'
  | 'Elderly Matron'
  | 'Long-Term Resident';

export type BodyProportionStyle = 'proportional_human' | 'stylized_noir' | 'chibi_classic';

export type FacialExpressionType =
  | 'neutral'
  | 'suspicious'
  | 'weary'
  | 'alarmed'
  | 'smirk'
  | 'grimace'
  | 'shocked'
  | 'hollow_stare'
  | 'side_eye_glare'
  | 'paranoid_twitch'
  | 'cryptic_whisper';

export interface FacialRigParams {
  expression: FacialExpressionType;
  browFurrow: number; // -1 (arched) to 1 (furrowed glare)
  browHeight: number; // -0.05 to +0.08m
  browAsymmetry: number; // -0.5 to +0.5 (single eyebrow arch/raise)
  browInnerLiftL: number; // -0.025 to +0.035m (medial corrugator / frontalis lift)
  browInnerLiftR: number; // -0.025 to +0.035m
  browOuterLiftL: number; // -0.025 to +0.035m (lateral brow arch)
  browOuterLiftR: number; // -0.025 to +0.035m
  browRollL: number; // radians tilt of left brow
  browRollR: number; // radians tilt of right brow
  eyeAperture: number; // 0.3 (squint) to 1.5 (wide shock)
  blinkAmount: number; // 0 (open) to 1 (closed physiological blink)
  upperLidDroop: number; // -0.012 (retracted) to +0.016m (hooded/heavy lid)
  lowerLidSquint: number; // 0 to 1 (orbicularis oculi lower lid rise)
  eyeGazeX: number; // -0.025 (left glance) to +0.025 (right glance)
  eyeGazeY: number; // -0.015 (down) to +0.015 (up)
  pupilDilation: number; // 0.6 (pinpoint fear/focus) to 1.5 (dilated hollow trance)
  eyelidTremor: number; // 0 to 1 micro-twitch
  nostrilFlare: number; // 0 (relaxed) to 1 (flared alar wings)
  cheekSquintRaise: number; // 0 to 1 (zygomaticus cheek apple elevation)
  mouthCornerAngle: number; // radians (-0.25 frown to +0.25 smirk)
  mouthAsymmetry: number; // -0.15 to +0.15 crooked smirk/snarl
  mouthAperture: number; // 0 (closed) to 1 (wide agape)
  upperLipLift: number; // 0 to 1 (levator labii upper lip curl/part)
  lowerLipDepress: number; // 0 to 1 (depressor labii lower lip roll)
  lipPucker: number; // 0 (wide) to 1 (orbicularis oris rounded pucker/whisper)
  lipCornerPullL: number; // -0.015 (frown drop) to +0.018m (smile/smirk pull)
  lipCornerPullR: number; // -0.015 (frown drop) to +0.018m
  jawDrop: number; // 0 to 0.12m
  jawPitchRad: number; // 0 to 0.48 rad anatomical TMJ hinge rotation
  jawLateralShift: number; // -0.008 to +0.008m sideways mandible grind/shift
  tongueVisible: number; // 0 to 1 (visible during open-mouth speech/shock)
  headMicroNod: number; // radians subtle organic pitch
  headMicroTilt: number; // radians subtle organic roll
  cheekHollow: number; // 0 to 1 (sunken noir shadows)
  underEyeBags: boolean;
  ageWrinkles: boolean;
}

export interface NaturalCharacterAnatomySpec {
  headShape: CharacterAppearance['headShape'];
  craniumWidthRatio: number;
  craniumHeightRatio: number;
  craniumDepthRatio: number;
  jawTaperRatio: number;
  chinProminence: number;
  zygomaticWidthRatio: number;
  noseBridgeLength: number;
  noseTipProjection: number;
  upperLipCupidBowDepth: number;
  lowerLipFullness: number;
  earHelixScale: number;
  shoulderBreadthRatio: number;
  waistTaperRatio: number;
  hipFlareRatio: number;
  neckSlenderRatio: number;
}

export type ScheduledActivityGesture =
  | 'idle_observe'
  | 'inspect_ledger'
  | 'wall_listen'
  | 'pace_corridor'
  | 'parlor_social'
  | 'sleepwalk_trance'
  | 'sit_chair'
  | 'open_door'
  | 'press_button'
  | 'pickup_item'
  | 'lay_bed'
  | 'crawl'
  | 'run';

export interface SkeletonPoseEuler {
  pelvisY: number;
  spineLumbarX: number; // L1 lower back forward bend
  spineLumbarY: number; // twist
  spineLowerThoracicX: number; // T6 mid-spine kyphosis bend
  spineThoracicX: number; // T1 upper thoracic kyphosis forward tilt (bent spine)
  spineThoracicY: number;
  spineThoracicZ: number;
  neckX: number; // C4 cervical counter-pitch to level gaze
  neckY: number;
  headX: number;
  headY: number;
  headZ: number;
  leftClavicleZ: number;
  leftUpperArmX: number;
  leftUpperArmZ: number;
  leftForearmX: number;
  leftHandZ: number;
  rightClavicleZ: number;
  rightUpperArmX: number;
  rightUpperArmZ: number;
  rightForearmX: number;
  rightHandZ: number;
  leftThighX: number;
  leftCalfX: number;
  leftFootX: number;
  rightThighX: number;
  rightCalfX: number;
  rightFootX: number;
  caneGripActive: boolean;
}

export type GeminiPrebuiltVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export const GEMINI_PREBUILT_VOICES: readonly {
  voiceName: GeminiPrebuiltVoiceName;
  label: string;
  timbreSummary: string;
}[] = [
  { voiceName: 'Charon', label: 'Charon (Deep gravelly baritone)', timbreSummary: 'Measured, authoritative, noir concierge register' },
  { voiceName: 'Kore', label: 'Kore (Crisp mid-alto)', timbreSummary: 'Poised, aristocratic, sharp analytical articulation' },
  { voiceName: 'Fenrir', label: 'Fenrir (Resonant low bass)', timbreSummary: 'Weathered, intense, conspiratorial undertone' },
  { voiceName: 'Zephyr', label: 'Zephyr (Airy breathless contralto)', timbreSummary: 'Eerie, hushed, atmospheric whisper-ready timbre' },
  { voiceName: 'Puck', label: 'Puck (Nimble expressive tenor)', timbreSummary: 'Quick-witted, nervous, kinetic cadence' }
] as const;

export interface CharacterVoiceProfile {
  prebuiltVoiceName: GeminiPrebuiltVoiceName;
  vocalTone: string; // e.g., 'Hushed, gravel-edged, world-weary', 'Aristocratic, clipped, suspiciously polite'
  accent: string; // e.g., '1970s Old New York Mid-Atlantic', 'New England Brahmin', 'Eastern European Emigré'
  cadenceStyle: string; // e.g., 'Measured, deliberate pauses between clauses', 'Rapid, breathless, glancing over shoulder'
  pitchMultiplier: number; // 0.75 to 1.25 (locked for Web Speech fallback & DSP pitch consistency)
  speakingRate: number; // 0.80 to 1.20 (locked speaking tempo)
  baselineExpression: FacialExpressionType;
  persistAcrossPlaythrough: boolean;
}

export type CharacterClothingStyleId =
  | 'noir_trench_coat'
  | 'tailored_three_piece'
  | 'bellhop_brass_tunic'
  | 'ribbed_turtleneck_blazer'
  | 'velvet_evening_ensemble'
  | 'knitted_cardigan_shawl'
  | 'rolled_sleeve_waistcoat'
  | 'boiler_utility_jacket';

export type CharacterClothingPattern =
  | 'solid'
  | 'herringbone'
  | 'pinstripe'
  | 'plaid'
  | 'ribbed_knit';

export interface CharacterClothingChoiceSpec {
  id: string;
  title: string;
  subtitle: string;
  clothingStyle: CharacterClothingStyleId;
  clothingPattern: CharacterClothingPattern;
  outfitColor: string;
  secondaryClothingColor: string;
  accentColor: string;
  eraBadge: string;
}

export type CharacterHairStyleId =
  | 'swept_pompadour'
  | 'slicked_side_part'
  | 'messy_curls'
  | 'bob_cut'
  | 'feathered_shag_70s'
  | 'wavy_shoulder_cascade'
  | 'braided_crown_chignon'
  | 'silver_bun'
  | 'permed_silver'
  | 'cropped_buzz_fade'
  | 'bowler_hat'
  | 'noir_fedora';

export interface CharacterHairStyleMetadata {
  id: CharacterHairStyleId;
  label: string;
  shortLabel: string;
  category: 'short_tailored' | 'medium_textured' | 'updo_long' | 'vintage_headwear';
  description: string;
  defaultHairColor: string;
  icon: string;
}

export interface CharacterHairColorSwatch {
  id: string;
  label: string;
  hex: string;
}

export interface CharacterAppearance {
  archetype: CharacterArchetype;
  headShape: 'chibi_block' | 'rounded_toon' | 'tall_noir' | 'proportional_human';
  bodyProportionStyle?: BodyProportionStyle;
  spineCurvature?: number; // 0 by default (external rigging pipeline handles posture)
  hasWalkingCane?: boolean;
  hasSpectacles?: boolean;
  facialExpression?: FacialExpressionType;
  skinColor: string;
  eyeStyle: 'wide_amber' | 'narrow_suspicious' | 'hollow_glow' | 'button_dark';
  hairStyle: CharacterHairStyleId;
  hairColor: string;
  outfitColor: string;
  secondaryClothingColor?: string;
  accentColor: string;
  clothingStyle?: CharacterClothingStyleId;
  clothingPattern?: CharacterClothingPattern;
  customClothingLabel?: string;
  mouthStyle: 'slight_smirk' | 'nervous_frown' | 'stitched_grin' | 'calm_neutral';
  heightScale: number;
  widthScale: number;
  headScale: number;
  meshyRigTaskId?: string;
  meshyAnimations?: Partial<Record<ScheduledActivityGesture, MeshyCharacterAnimationClipSpec>>;
  googleAiAnimations?: Partial<Record<ScheduledActivityGesture, GoogleAiCharacterAnimationClipSpec>>;
  voiceProfile?: CharacterVoiceProfile;
  cameraZoom?: number;
  cameraTargetX?: number;
  cameraTargetY?: number;
}

export interface CharacterStats {
  physic: number;
  agility: number;
  mind: number;
  endurance: number;
  pointsRemaining: number;
}

export interface DerivedCharacterStats {
  maxHealth: number;
  maxSanity: number;
  insightRate: number;
  suspicionResistance: number;
  stealthRating: number;
  moveSpeedPct: number;
}

export interface TraitSkill {
  id: string;
  category: 'mind' | 'occult' | 'social' | 'stealth';
  name: string;
  description: string;
  icon: string;
}

export type TimeOfDayPhase = 'Morning' | 'Afternoon' | 'Evening' | 'Late Night';

export interface DailyActionEntry {
  phase: TimeOfDayPhase;
  timeRange: string;
  action: string;
  location: string;
  eventTrigger?: string;
  targetFloor?: FloorId;
  targetPosition?: [number, number, number];
  activityGesture?: ScheduledActivityGesture;
  randomEventsEnabled?: boolean;
  activeRandomEvent?: string | null;
}

export type TenantDisposition = 'hostile' | 'cold' | 'wary' | 'cordial' | 'confidant';

export interface PendingTenantQuestion {
  id: string;
  questionText: string;
  askedOnDay: number;
  askedAtTimeFormatted: string;
  expectedTopics: string[];
  resolved: boolean;
  resolvedOnDay?: number;
  resolvedByMessage?: string;
}

export interface SavedInteractionEntry {
  id: string;
  timestamp: string;
  gameTimeFormatted: string;
  phase: TimeOfDayPhase;
  timeOfDayEvent: string;
  dailyActionAtTime: string;
  characterName: string;
  userMessage: string;
  agentReply: string;
  gameDay?: number;
  trustDelta?: number;
  suspicionDelta?: number;
  resultingTrust?: number;
  resultingSuspicion?: number;
  resultingDisposition?: TenantDisposition;
  triggeredLikes?: string[];
  triggeredDislikes?: string[];
  answeredQuestionId?: string | null;
  answeredQuestionFromDay?: number | null;
  pendingQuestionAsked?: string | null;
  unansweredQuestionDaysWaiting?: number;
  gameplayInfluenceSummary?: string;
  unlockedClueId?: string | null;
}

export interface TimeOfDayEventLog {
  id: string;
  timestamp: string;
  gameTimeMinutes: number;
  formattedTime: string;
  phase: TimeOfDayPhase;
  eventTitle: string;
  eventDescription: string;
}

export interface NotebookMemoEntry {
  id: string;
  timestamp: string;
  gameDay: number;
  gameTimeFormatted: string;
  source: 'typed' | 'voice_dictaphone';
  title: string;
  content: string;
  tags: string[]; // e.g. ['Suspect Motive', 'Passkey Code', 'Secret Door', 'Contradiction', 'To Investigate']
  linkedRoom?: string; // e.g. 'Suite 202', 'Room 101'
  linkedAgentId?: string; // e.g. 'agent_vincent', 'agent_eleanor'
  linkedClueId?: string;
  isPinnedToBoard: boolean;
  boardX: number; // percentage or position on corkboard (0 to 100)
  boardY: number; // percentage or position on corkboard (0 to 100)
  audioDurationSec?: number;
  category?: 'field_note' | 'transcript' | 'clue' | 'suspect';
  agentId?: string;
  agentName?: string;
}

export interface CorkboardThreadLink {
  id: string;
  fromId: string;
  toId: string;
  threadColor: string; // e.g. '#dc2626' (crimson red yarn), '#eab308' (gold yarn)
  label?: string;
}

/**
 * Creates a new detective notebook memo entry, automatically extracting room numbers,
 * known clues, and suspect mentions for correlation.
 */
export function createNotebookMemo(
  contentOrOptions:
    | string
    | {
        content: string;
        title?: string;
        source?: 'typed' | 'voice_dictaphone';
        gameDay?: number;
        gameTimeFormatted?: string;
        tags?: string[];
        category?: 'field_note' | 'transcript' | 'clue' | 'suspect';
        agentId?: string;
        agentName?: string;
        roomLocation?: string;
        tapeRecorded?: boolean;
        audioDurationSec?: number;
      },
  source: 'typed' | 'voice_dictaphone' = 'typed',
  gameDay = 1,
  gameTimeFormatted = '07:30 PM',
  customTags: string[] = [],
  customTitle?: string
): NotebookMemoEntry {
  let content = '';
  let effSource: 'typed' | 'voice_dictaphone' = source;
  let effDay = gameDay;
  let effTime = gameTimeFormatted;
  let effTags: string[] = customTags;
  let effTitle = customTitle;
  let effCategory: 'field_note' | 'transcript' | 'clue' | 'suspect' = 'field_note';
  let effAgentId: string | undefined;
  let effAgentName: string | undefined;
  let effRoomLocation: string | undefined;
  let effAudioSec: number | undefined;

  if (typeof contentOrOptions === 'object' && contentOrOptions !== null) {
    content = contentOrOptions.content || '';
    effSource = contentOrOptions.source || (contentOrOptions.tapeRecorded ? 'voice_dictaphone' : 'typed');
    effDay = contentOrOptions.gameDay ?? 1;
    effTime = contentOrOptions.gameTimeFormatted || '07:30 PM';
    effTags = contentOrOptions.tags || [];
    effTitle = contentOrOptions.title;
    effCategory = contentOrOptions.category || 'field_note';
    effAgentId = contentOrOptions.agentId;
    effAgentName = contentOrOptions.agentName;
    effRoomLocation = contentOrOptions.roomLocation;
    effAudioSec = contentOrOptions.audioDurationSec;
  } else {
    content = String(contentOrOptions || '');
  }

  const clean = content.trim();
  const lower = clean.toLowerCase();

  const tags = new Set<string>(effTags);
  if (effSource === 'voice_dictaphone') tags.add('🎙️ Dictaphone Memo');

  // Auto-detect suspect motives, keys, secret passages, or rooms
  let linkedRoom: string | undefined = effRoomLocation;
  if (!linkedRoom) {
    if (lower.includes('202') || lower.includes('suite 202')) linkedRoom = 'Suite 202';
    else if (lower.includes('101') || lower.includes('room 101')) linkedRoom = 'Room 101';
    else if (lower.includes('102') || lower.includes('room 102')) linkedRoom = 'Room 102';
    else if (lower.includes('lobby') || lower.includes('front desk')) linkedRoom = 'Front Desk & Lobby';
    else if (lower.includes('boiler') || lower.includes('basement')) linkedRoom = 'Basement Boiler Room';
  }

  if (lower.includes('latch') || lower.includes('secret') || lower.includes('passage') || lower.includes('shaft')) {
    tags.add('Secret Passage');
  }
  if (lower.includes('key') || lower.includes('passkey') || lower.includes('skeleton')) {
    tags.add('Passkey Code');
  }
  if (lower.includes('liar') || lower.includes('suspect') || lower.includes('dislike') || lower.includes('alibi')) {
    tags.add('Suspect Motive');
  }
  if (lower.includes('remember') || lower.includes('check') || lower.includes('todo') || lower.includes('investigate')) {
    tags.add('To Investigate');
  }

  let title = effTitle?.trim();
  if (!title) {
    if (linkedRoom) {
      title = `${linkedRoom} Notes`;
    } else if (clean.length > 0) {
      const firstLine = clean.split('\n')[0].slice(0, 32);
      title = firstLine.length < clean.length ? `${firstLine}...` : firstLine;
    } else {
      title = effSource === 'voice_dictaphone' ? 'Audio Dictaphone Memo' : 'Field Note';
    }
  }

  return {
    id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    gameDay: Math.max(1, Math.round(effDay)),
    gameTimeFormatted: effTime,
    source: effSource,
    title,
    content: clean,
    tags: Array.from(tags),
    linkedRoom,
    isPinnedToBoard: true,
    boardX: Math.round(15 + Math.random() * 65),
    boardY: Math.round(15 + Math.random() * 65),
    audioDurationSec: effAudioSec !== undefined
      ? effAudioSec
      : effSource === 'voice_dictaphone'
        ? Math.max(3, Math.round(clean.length / 15))
        : undefined,
    category: effCategory,
    agentId: effAgentId,
    agentName: effAgentName
  };
}

/**
 * Filters notebook memos by search text or category tag.
 */
export function searchAndFilterNotebookMemos(
  memos: NotebookMemoEntry[],
  searchQuery: string,
  filterTag?: string,
  filterCategory?: string
): NotebookMemoEntry[] {
  const queryLower = (searchQuery || '').toLowerCase().trim();
  return memos.filter((m) => {
    if (filterTag && filterTag !== 'All' && filterTag !== 'all' && !m.tags.includes(filterTag)) {
      return false;
    }
    if (filterCategory && filterCategory !== 'All' && filterCategory !== 'all' && m.category !== filterCategory) {
      return false;
    }
    if (!queryLower) return true;
    return (
      m.title.toLowerCase().includes(queryLower) ||
      m.content.toLowerCase().includes(queryLower) ||
      (m.linkedRoom && m.linkedRoom.toLowerCase().includes(queryLower)) ||
      (m.agentName && m.agentName.toLowerCase().includes(queryLower)) ||
      m.tags.some((t) => t.toLowerCase().includes(queryLower))
    );
  });
}

export interface HotelAgentProfile {
  id: string;
  name: string;
  role: 'registrar' | 'helper_entity' | 'tenant';
  roomNumber: string;
  floor: FloorId;
  position: [number, number, number];
  status: 'present' | 'erratic' | 'vanished';
  occupation: string;
  personality: string;
  voiceStyle?: string;
  voiceProfile?: CharacterVoiceProfile;
  activeFacialExpression?: FacialExpressionType;
  activeInteractGesture?: ScheduledActivityGesture;
  demeanor?: string;
  likes?: string[];
  dislikes?: string[];
  personalInstructionSet?: string;
  dailySchedule?: DailyActionEntry[];
  interactionHistory?: SavedInteractionEntry[];
  pendingQuestions?: PendingTenantQuestion[];
  disposition?: TenantDisposition;
  lastInteractionDay?: number;
  secretTruth: string;
  knownFacts: string[];
  memories: string[];
  suspicionLevel: number; // 0 to 100
  trustLevel: number; // 0 to 100
  appearance: CharacterAppearance;
  stats: CharacterStats;
  assignedTraits: string[];
}

export interface ClueItem {
  id: string;
  title: string;
  floor: FloorId;
  roomNumber: string;
  description: string;
  sanityImpact: number; // negative depletes sanity, positive restores
  relatedAgentId: string;
   unlocksPassageId?: string;
}

export interface GameStateSnapshot {
  sanity: number;
  maxSanity: number;
  health: number;
  currentFloor: FloorId;
  currentRoomLabel: string;
  discoveredClues: string[];
  openedPassages: string[];
  shiftMinutesElapsed: number;
  vanishedCount: number;
}


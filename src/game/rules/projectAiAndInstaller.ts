import { type CharacterAppearance, type CharacterStats, type FloorId, type FloorLayer, GRID_TILE_COUNT, type HotelAgentProfile, INITIAL_FLOOR_LAYERS, type PlacedAsset, type SavedInteractionEntry, type TimeOfDayEventLog } from './coreTypesAndFloors';
import { INITIAL_ROOM_BLUEPRINTS, type RoomBlueprint } from './roomBlueprintsAndWindows';
import { DEFAULT_GLOBAL_INSTRUCTION_SET } from './scheduleAndCharacterRig';
import { INITIAL_ASSET_SETS } from './catalogVoiceAndSets';

// ============================================================================
// ENTIRE PROJECT SAVE & LOAD SYSTEM (Full Workspace State Serialization)
// ============================================================================

export interface ArchitectForgeProjectSettings {
  surfaceSnapEnabled: boolean;
  showTPoseMannequin: boolean;
  showExteriorWalls: boolean;
  customGeneratedTexUrl: string | null;
}

export interface ArchitectForgeProjectSnapshot {
  schemaVersion: '2.0.0';
  assetType: 'architectforge_full_project';
  id: string;
  name: string;
  description: string;
  savedAt: string;
  gridDimensions: [number, number];
  currentFloor: FloorId;
  floorLayers: FloorLayer[];
  assets: PlacedAsset[];
  catalogBlueprints: unknown[];
  roomBlueprints: RoomBlueprint[];
  characterRigs: HotelAgentProfile[];
  customAppearance: CharacterAppearance;
  customStats: CharacterStats;
  customTraits: string[];
  globalInstructionSet: string;
  gameTimeMinutes: number;
  savedInteractions: SavedInteractionEntry[];
  timeOfDayEvents: TimeOfDayEventLog[];
  settings: ArchitectForgeProjectSettings;
}

export const DEFAULT_CHARACTER_APPEARANCE: CharacterAppearance = {
  archetype: 'Detective Clerk',
  headShape: 'chibi_block',
  skinColor: '#f3d9c4',
  eyeStyle: 'wide_amber',
  hairStyle: 'swept_pompadour',
  hairColor: '#451a03',
  outfitColor: '#78350f',
  accentColor: '#eab308',
  mouthStyle: 'slight_smirk',
  heightScale: 1.0,
  widthScale: 1.0,
  headScale: 1.08
};

export const DEFAULT_CHARACTER_STATS: CharacterStats = {
  physic: 2,
  agility: 3,
  mind: 4,
  endurance: 3,
  pointsRemaining: 4
};

/**
 * Pure helper that serializes the entire ArchitectForge project state into an immutable snapshot.
 */
export function createProjectSnapshot(params: {
  id?: string;
  name: string;
  description: string;
  currentFloor: FloorId;
  floorLayers: FloorLayer[];
  assets: PlacedAsset[];
  catalogBlueprints?: unknown[];
  roomBlueprints: RoomBlueprint[];
  characterRigs: HotelAgentProfile[];
  customAppearance?: CharacterAppearance;
  customStats?: CharacterStats;
  customTraits?: string[];
  globalInstructionSet: string;
  gameTimeMinutes: number;
  savedInteractions: SavedInteractionEntry[];
  timeOfDayEvents: TimeOfDayEventLog[];
  settings?: Partial<ArchitectForgeProjectSettings>;
}): ArchitectForgeProjectSnapshot {
  const cleanName = params.name.trim() || 'Untitled ArchitectForge Project';
  const cleanDesc =
    params.description.trim() ||
    'Complete multi-floor 3D environment, room blueprints, and AI character rigs.';

  return {
    schemaVersion: '2.0.0',
    assetType: 'architectforge_full_project',
    id: params.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    description: cleanDesc,
    savedAt: new Date().toISOString(),
    gridDimensions: [GRID_TILE_COUNT, GRID_TILE_COUNT],
    currentFloor: params.currentFloor,
    floorLayers: params.floorLayers.map((l) => ({ ...l })),
    assets: params.assets.map((a) => ({
      ...a,
      position: [...a.position] as [number, number, number],
      dimensions: [...a.dimensions] as [number, number, number],
      compositeParts: a.compositeParts ? a.compositeParts.map((p) => ({ ...p })) : undefined
    })),
    catalogBlueprints: params.catalogBlueprints ? [...params.catalogBlueprints] : [],
    roomBlueprints: params.roomBlueprints.map((bp) => ({
      ...bp,
      boundingSize: [...bp.boundingSize] as [number, number],
      tags: [...bp.tags],
      items: bp.items.map((it) => ({
        ...it,
        relPosition: [...it.relPosition] as [number, number, number],
        dimensions: [...it.dimensions] as [number, number, number]
      }))
    })),
    characterRigs: params.characterRigs.map((rig) => ({
      ...rig,
      position: [...rig.position] as [number, number, number],
      knownFacts: [...rig.knownFacts],
      memories: [...rig.memories]
    })),
    customAppearance: { ...(params.customAppearance || DEFAULT_CHARACTER_APPEARANCE) },
    customStats: { ...(params.customStats || DEFAULT_CHARACTER_STATS) },
    customTraits: [...(params.customTraits || ['wax_memory', 'hollow_knock'])],
    globalInstructionSet: params.globalInstructionSet || DEFAULT_GLOBAL_INSTRUCTION_SET,
    gameTimeMinutes:
      typeof params.gameTimeMinutes === 'number' ? params.gameTimeMinutes : 19 * 60 + 30,
    savedInteractions: params.savedInteractions.map((entry) => ({ ...entry })),
    timeOfDayEvents: params.timeOfDayEvents.map((evt) => ({ ...evt })),
    settings: {
      surfaceSnapEnabled: params.settings?.surfaceSnapEnabled ?? true,
      showTPoseMannequin: params.settings?.showTPoseMannequin ?? false,
      showExteriorWalls: params.settings?.showExteriorWalls ?? false,
      customGeneratedTexUrl: params.settings?.customGeneratedTexUrl ?? null
    }
  };
}

/**
 * Pure helper to validate and normalize an imported JSON object (supports v2.0 full project files and v1.x asset packs).
 */
export function validateAndParseProjectSnapshot(raw: unknown): {
  valid: boolean;
  project: ArchitectForgeProjectSnapshot | null;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, project: null, error: 'Project data must be a JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const unwrapped =
    obj.project && typeof obj.project === 'object'
      ? (obj.project as Record<string, unknown>)
      : obj;

  const rawAssets = Array.isArray(unwrapped.assets)
    ? (unwrapped.assets as PlacedAsset[])
    : Array.isArray(unwrapped.environmentPlacements)
    ? (unwrapped.environmentPlacements as PlacedAsset[])
    : null;

  const rawLayers = Array.isArray(unwrapped.floorLayers)
    ? (unwrapped.floorLayers as FloorLayer[])
    : null;

  if (!rawAssets && !rawLayers && !Array.isArray(unwrapped.roomBlueprints)) {
    return {
      valid: false,
      project: null,
      error: 'JSON file does not contain valid ArchitectForge project data.'
    };
  }

  const floorLayers =
    rawLayers && rawLayers.length > 0 ? rawLayers : INITIAL_FLOOR_LAYERS;
  const currentFloor =
    typeof unwrapped.currentFloor === 'string' && unwrapped.currentFloor
      ? unwrapped.currentFloor
      : floorLayers[0]?.id || 'lobby';

  const clockObj =
    unwrapped.gameplayClock && typeof unwrapped.gameplayClock === 'object'
      ? (unwrapped.gameplayClock as Record<string, unknown>)
      : null;

  const gameTimeMinutes =
    typeof unwrapped.gameTimeMinutes === 'number'
      ? unwrapped.gameTimeMinutes
      : clockObj && typeof clockObj.gameTimeMinutes === 'number'
      ? clockObj.gameTimeMinutes
      : 19 * 60 + 30;

  const settingsObj =
    unwrapped.settings && typeof unwrapped.settings === 'object'
      ? (unwrapped.settings as Partial<ArchitectForgeProjectSettings>)
      : {};

  const snapshot = createProjectSnapshot({
    id: typeof unwrapped.id === 'string' ? unwrapped.id : undefined,
    name:
      typeof unwrapped.name === 'string' && unwrapped.name.trim()
        ? unwrapped.name
        : 'Imported Studio Project',
    description:
      typeof unwrapped.description === 'string' && unwrapped.description.trim()
        ? unwrapped.description
        : 'Imported from ArchitectForge project file.',
    currentFloor,
    floorLayers,
    assets: rawAssets || [],
    catalogBlueprints: Array.isArray(unwrapped.catalogBlueprints)
      ? unwrapped.catalogBlueprints
      : [],
    roomBlueprints: Array.isArray(unwrapped.roomBlueprints)
      ? (unwrapped.roomBlueprints as RoomBlueprint[])
      : INITIAL_ROOM_BLUEPRINTS,
    characterRigs: Array.isArray(unwrapped.characterRigs)
      ? (unwrapped.characterRigs as HotelAgentProfile[])
      : [],
    customAppearance:
      unwrapped.customAppearance && typeof unwrapped.customAppearance === 'object'
        ? (unwrapped.customAppearance as CharacterAppearance)
        : DEFAULT_CHARACTER_APPEARANCE,
    customStats:
      unwrapped.customStats && typeof unwrapped.customStats === 'object'
        ? (unwrapped.customStats as CharacterStats)
        : DEFAULT_CHARACTER_STATS,
    customTraits: Array.isArray(unwrapped.customTraits)
      ? (unwrapped.customTraits as string[])
      : ['wax_memory', 'hollow_knock'],
    globalInstructionSet:
      typeof unwrapped.globalInstructionSet === 'string'
        ? unwrapped.globalInstructionSet
        : DEFAULT_GLOBAL_INSTRUCTION_SET,
    gameTimeMinutes,
    savedInteractions: Array.isArray(unwrapped.savedInteractions)
      ? (unwrapped.savedInteractions as SavedInteractionEntry[])
      : [],
    timeOfDayEvents: Array.isArray(unwrapped.timeOfDayEvents)
      ? (unwrapped.timeOfDayEvents as TimeOfDayEventLog[])
      : [],
    settings: {
      surfaceSnapEnabled: settingsObj.surfaceSnapEnabled ?? true,
      showTPoseMannequin: settingsObj.showTPoseMannequin ?? false,
      showExteriorWalls: settingsObj.showExteriorWalls ?? false,
      customGeneratedTexUrl:
        settingsObj.customGeneratedTexUrl ??
        (typeof unwrapped.customSurfaceTextureUrl === 'string'
          ? unwrapped.customSurfaceTextureUrl
          : null)
    }
  });

  if (typeof unwrapped.savedAt === 'string') {
    snapshot.savedAt = unwrapped.savedAt;
  }

  return { valid: true, project: snapshot };
}

/**
 * Pure helper to insert or overwrite a project snapshot inside the saved project slots list.
 */
export function upsertProjectInSlotList(
  existingSlots: ArchitectForgeProjectSnapshot[],
  snapshot: ArchitectForgeProjectSnapshot,
  maxSlots = 25
): ArchitectForgeProjectSnapshot[] {
  const existingIdx = existingSlots.findIndex((s) => s.id === snapshot.id);
  if (existingIdx >= 0) {
    const next = [...existingSlots];
    next[existingIdx] = snapshot;
    return next;
  }
  const next = [snapshot, ...existingSlots];
  return next.length > maxSlots ? next.slice(0, maxSlots) : next;
}

// ============================================================================
// COST-OPTIMIZED AI MODEL REGISTRY (Google Gemini Flash-Lite + Meshy.ai 3D)
// ============================================================================

export type AiTaskKey =
  | 'character_chat'
  | 'persona_generator'
  | 'ambient_bark'
  | 'character_animation'
  | 'description_to_image'
  | 'composite_3d_spec'
  | 'meshy_image_to_3d'
  | 'texture_synthesis'
  | 'architectural_research'
  | 'voice_tts'
  | 'live_voice'
  | 'sfx_generator'
  | 'music_composer';

export interface AiModelRouteSpec {
  taskKey: AiTaskKey;
  taskLabel: string;
  modelId: string;
  provider: 'Google' | 'Meshy.ai';
  costTier:
    | 'Lowest-Cost Flash-Lite'
    | 'Lowest-Cost Flash (Low Thinking)'
    | 'Lowest-Cost Image Lite'
    | 'Meshy Image-to-3D';
  capabilitiesPreserved: string[];
}

export const AI_MODEL_REGISTRY: Record<AiTaskKey, AiModelRouteSpec> = {
  character_chat: {
    taskKey: 'character_chat',
    taskLabel: 'Sandboxed Character Dialogue & Memory',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Multi-turn conversation memory',
      'Offline lore sandbox enforcement',
      'Locked voice/tone/accent & facial expression continuity',
      'Time-of-day & daily schedule awareness'
    ]
  },
  persona_generator: {
    taskKey: 'persona_generator',
    taskLabel: 'AI Personality, Known Facts & 24h Schedule Generator',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Structured JSON schema output',
      'Voice, tone, accent, demeanor, likes/dislikes synthesis',
      '4-phase daily action schedule generation'
    ]
  },
  ambient_bark: {
    taskKey: 'ambient_bark',
    taskLabel: 'Fast Ambient Room Observation Bark',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: ['Sub-second low-latency atmospheric text']
  },
  character_animation: {
    taskKey: 'character_animation',
    taskLabel: 'Google AI Studio Low-Frame Character & Facial Animation Synthesizer',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Structured JSON low-frame skeletal Euler keyframe synthesis (6/8/12/24 FPS)',
      'Synchronized 3D facial expression & micro-expression trajectory curves',
      'Zero external rigging lock-in — compatible with external character rigs'
    ]
  },
  description_to_image: {
    taskKey: 'description_to_image',
    taskLabel: 'Asset Description-to-Image Concept Synthesizer (for Meshy.ai 3D)',
    modelId: 'gemini-3.1-flash-lite-image',
    provider: 'Google',
    costTier: 'Lowest-Cost Image Lite',
    capabilitiesPreserved: [
      'Cheapest model capable of turning detailed asset descriptions into 1:1 isolated reference images',
      'Direct upstream feed into Meshy.ai Image-to-3D (meshy-4-image-to-3d) & game catalog import'
    ]
  },
  composite_3d_spec: {
    taskKey: 'composite_3d_spec',
    taskLabel: '3D Multi-Part Composite Geometry Synthesizer',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Multimodal image + text to 3D sub-part JSON',
      'PBR roughness, metalness & color assignment'
    ]
  },
  meshy_image_to_3d: {
    taskKey: 'meshy_image_to_3d',
    taskLabel: 'Meshy.ai Image-to-3D Model Generation',
    modelId: 'meshy-4-image-to-3d',
    provider: 'Meshy.ai',
    costTier: 'Meshy Image-to-3D',
    capabilitiesPreserved: [
      'Image-to-3D mesh generation from reference image',
      'Paired with Google gemini-3.1-flash-lite 3D composite fallback'
    ]
  },
  texture_synthesis: {
    taskKey: 'texture_synthesis',
    taskLabel: 'Seamless Architectural Surface Texture Generator',
    modelId: 'gemini-3.1-flash-lite-image',
    provider: 'Google',
    costTier: 'Lowest-Cost Image Lite',
    capabilitiesPreserved: [
      '1:1 orthographic surface texture generation',
      'Image-to-image surface editing'
    ]
  },
  architectural_research: {
    taskKey: 'architectural_research',
    taskLabel: 'Grounded Architectural Scale & Proportion Fact-Check',
    modelId: 'gemini-3.8-flash',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash (Low Thinking)',
    capabilitiesPreserved: [
      'Google Search grounding (googleSearch tool)',
      'ThinkingLevel.LOW for minimal token overhead'
    ]
  },
  voice_tts: {
    taskKey: 'voice_tts',
    taskLabel: 'Character Voice Text-to-Speech (Locked Voice/Tone/Accent)',
    modelId: 'gemini-3.8-flash-lite-tts',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Low-cost 24kHz WAV voice synthesis via prebuiltVoiceConfig',
      'Style-prompted vocal tone, regional accent & cadence persistence across playthrough'
    ]
  },
  live_voice: {
    taskKey: 'live_voice',
    taskLabel: 'Real-Time Live Audio WebSocket Bridge',
    modelId: 'gemini-3.8-live',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash (Low Thinking)',
    capabilitiesPreserved: ['Bidirectional 16kHz/24kHz PCM voice streaming']
  },
  sfx_generator: {
    taskKey: 'sfx_generator',
    taskLabel: 'Parametric Game Sound Effect Foley Synthesizer',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Structured parametric sound envelope generation',
      'ADSR, frequency modulation, and noise mix synthesis'
    ]
  },
  music_composer: {
    taskKey: 'music_composer',
    taskLabel: 'Multi-Voice Background Music & Motif Composer',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google',
    costTier: 'Lowest-Cost Flash-Lite',
    capabilitiesPreserved: [
      'Polyphonic modal chord progressions',
      'Atmospheric drone & melody line sequencing'
    ]
  }
};

/**
 * Pure compliance verifier ensuring:
 * 1. Every AI model is Google software EXCEPT Meshy.ai for image-to-3d.
 * 2. Zero expensive Pro/Argon models (gemini-4-argon, gemini-3-pro-image, gemini-nano-banana-2.1) are used.
 */
export function verifyAiModelCompliance(
  registry: Record<AiTaskKey, AiModelRouteSpec> = AI_MODEL_REGISTRY
): {
  compliant: boolean;
  violations: string[];
  googleModelCount: number;
  meshyModelCount: number;
} {
  const expensiveProModels = new Set([
    'gemini-4-argon',
    'gemini-3-pro-image',
    'gemini-nano-banana-2.1',
    'lyria-3-pro-preview'
  ]);
  const allowedGoogleModels = new Set([
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-image',
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite-tts',
    'gemini-3.8-live'
  ]);

  const violations: string[] = [];
  let googleModelCount = 0;
  let meshyModelCount = 0;

  for (const spec of Object.values(registry)) {
    if (expensiveProModels.has(spec.modelId)) {
      violations.push(
        `Task "${spec.taskKey}" uses expensive model "${spec.modelId}" instead of cheapest Flash-Lite/Flash tier.`
      );
    }
    if (spec.taskKey === 'meshy_image_to_3d') {
      if (spec.provider !== 'Meshy.ai') {
        violations.push(`Task "meshy_image_to_3d" must use provider "Meshy.ai".`);
      } else {
        meshyModelCount += 1;
      }
    } else {
      if (spec.provider !== 'Google' || !allowedGoogleModels.has(spec.modelId)) {
        violations.push(
          `Task "${spec.taskKey}" must use an approved low-cost Google Gemini model (found ${spec.provider}: ${spec.modelId}).`
        );
      } else {
        googleModelCount += 1;
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    googleModelCount,
    meshyModelCount
  };
}

/**
 * Generates a deterministic, seamless SVG data-URL surface texture for any prompt,
 * used when offline or when free-tier fallback is triggered alongside gemini-3.1-flash-lite-image.
 */
export function generateSeamlessSvgTextureDataUrl(prompt: string): string {
  const lower = (prompt || '').toLowerCase();
  let bg = '#2e1612';
  let fg = '#4f241c';
  let accent = '#6e562f';

  if (lower.includes('marble') || lower.includes('tile') || lower.includes('check') || lower.includes('linoleum')) {
    bg = '#292623';
    fg = '#787163';
    accent = '#4a453d';
  } else if (lower.includes('carpet') || lower.includes('crimson') || lower.includes('velvet') || lower.includes('oxblood')) {
    bg = '#361214';
    fg = '#4f1b1e';
    accent = '#6b4f2a';
  } else if (lower.includes('wood') || lower.includes('oak') || lower.includes('mahogany') || lower.includes('walnut')) {
    bg = '#241409';
    fg = '#3b2212';
    accent = '#59371f';
  } else if (lower.includes('brass') || lower.includes('gold') || lower.includes('deco') || lower.includes('avocado')) {
    bg = '#2e3624';
    fg = '#4a5438';
    accent = '#6e562f';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="${bg}"/>
    <rect x="4" y="4" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.82"/>
    <rect x="68" y="4" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.78"/>
    <rect x="-24" y="36" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.82"/>
    <rect x="40" y="36" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.75"/>
    <rect x="104" y="36" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.82"/>
    <rect x="4" y="68" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.80"/>
    <rect x="68" y="68" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.74"/>
    <rect x="-24" y="100" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.82"/>
    <rect x="40" y="100" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.78"/>
    <rect x="104" y="100" width="56" height="24" rx="2" fill="${fg}" stroke="${accent}" stroke-width="1" opacity="0.82"/>
    <circle cx="34" cy="52" r="22" fill="#181512" opacity="0.28"/>
    <circle cx="96" cy="92" r="28" fill="#181512" opacity="0.24"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ============================================================================
// LOCAL COMPUTER WORKSPACE & DEDICATED FOLDER ARCHITECTURE
// ============================================================================

export type LocalFolderCategory =
  | 'asset_descriptions'
  | 'projects'
  | 'blueprints'
  | 'environment_3d'
  | 'catalog_blueprints'
  | 'textures'
  | 'room_blueprints'
  | 'character_rigs'
  | 'ai_instructions'
  | 'interactions'
  | 'time_events'
  | 'audio_sfx'
  | 'audio_music'
  | 'asset_sets';

export interface LocalFolderSpec {
  category: LocalFolderCategory;
  relativePath: string;
  label: string;
  dataTypeLabel: string;
  description: string;
  filePrefix: string;
  extension: string;
  autoSavesOn: string;
}

export const LOCAL_WORKSPACE_ROOT_NAME = 'ArchitectForge_Workspace';

export const LOCAL_WORKSPACE_FOLDERS: LocalFolderSpec[] = [
  {
    category: 'asset_descriptions',
    relativePath: 'assets/image_descriptions_import',
    label: 'Asset Image Descriptions Import Queue (.txt / .json)',
    dataTypeLabel: 'Detailed Asset Descriptions → Image → Meshy.ai 3D → Catalog',
    description:
      'Place or upload a file containing detailed image descriptions of assets here. Turns descriptions into images via gemini-3.1-flash-lite-image, passes them to Meshy.ai Image-to-3D, and imports the created 3D assets directly into the game catalog.',
    filePrefix: 'asset_descriptions',
    extension: '.descriptions.txt',
    autoSavesOn: 'Dropping/saving a description file or running the Image-to-3D Catalog Import pipeline'
  },
  {
    category: 'projects',
    relativePath: 'projects',
    label: 'Projects (Full Multi-Floor Saves)',
    dataTypeLabel: 'Project Archives',
    description: 'Complete multi-floor hotel builds, room blueprints, characters, and world logs.',
    filePrefix: 'project',
    extension: '.architectforge.json',
    autoSavesOn: 'Saving or exporting a full project slot'
  },
  {
    category: 'blueprints',
    relativePath: 'blueprints',
    label: 'Blueprints (Individual Room Layouts)',
    dataTypeLabel: 'Room Layout Blueprints',
    description: 'Distinct saved files for individual room layouts, modular furniture arrangements, and architectural structures.',
    filePrefix: 'blueprint',
    extension: '.blueprint.json',
    autoSavesOn: 'Saving an individual room layout or blueprint to disk'
  },
  {
    category: 'environment_3d',
    relativePath: 'assets/environment_3d',
    label: 'Newly Added 3D Environment Assets',
    dataTypeLabel: '3D Composite & Meshy.ai Objects',
    description: 'Newly forged AI 3D composite objects, Meshy.ai Image-to-3D meshes, and customized scene props.',
    filePrefix: 'asset3d',
    extension: '.asset3d.json',
    autoSavesOn: 'Forging a new AI 3D asset, duplicating, or customizing an object'
  },
  {
    category: 'asset_sets',
    relativePath: 'assets/asset_sets',
    label: 'Saved Multi-Item Asset Sets (Separate from Blueprints)',
    dataTypeLabel: 'Reusable Multi-Asset Sets (.assetset.json)',
    description: 'Groups of multiple selected items (or single items) saved as a portable "Set" separate from Room Blueprints.',
    filePrefix: 'assetset',
    extension: '.assetset.json',
    autoSavesOn: 'Saving a selected group of items as a Set'
  },
  {
    category: 'catalog_blueprints',
    relativePath: 'assets/catalog_blueprints',
    label: 'Visual Catalog Asset Blueprints',
    dataTypeLabel: 'Build Mode Catalog Items',
    description: 'Reusable catalog items saved from the 3D viewport or AI Forge for instant placement.',
    filePrefix: 'catalog_item',
    extension: '.catalog.json',
    autoSavesOn: 'Clicking "+ Catalog" or forging a new catalog item'
  },
  {
    category: 'textures',
    relativePath: 'assets/textures',
    label: 'Synthesized Surface Textures',
    dataTypeLabel: 'Orthographic Materials & SVG/PNG Maps',
    description: 'Newly generated wall, floor, carpet, and masonry textures with embedded data URLs.',
    filePrefix: 'texture',
    extension: '.texture.json',
    autoSavesOn: 'Synthesizing a new surface texture in Build Mode'
  },
  {
    category: 'room_blueprints',
    relativePath: 'room_blueprints',
    label: 'Modular Room Layout Blueprints',
    dataTypeLabel: 'Multi-Asset Room Collections',
    description: 'Saved collections of room furniture and architectural partitions with relative offsets.',
    filePrefix: 'room_blueprint',
    extension: '.blueprint.json',
    autoSavesOn: 'Capturing selected 3D objects into a Room Blueprint'
  },
  {
    category: 'character_rigs',
    relativePath: 'characters/rigs',
    label: 'Character 3D Rigs & Appearance',
    dataTypeLabel: '3D Humanoid Rigs & Traits',
    description: 'Custom character proportions, attire colors, archetypes, and starting known facts.',
    filePrefix: 'character_rig',
    extension: '.rig.json',
    autoSavesOn: 'Creating or updating a character in Create-A-Character'
  },
  {
    category: 'ai_instructions',
    relativePath: 'characters/ai_instructions',
    label: 'Offline AI Lore & Instruction Sets',
    dataTypeLabel: 'Sandboxed AI Persona Rules',
    description: 'Offline game-specific global rules and personal character AI instruction sets (no internet).',
    filePrefix: 'ai_instructions',
    extension: '.instructions.json',
    autoSavesOn: 'Generating an AI persona or editing global/personal sandbox instructions'
  },
  {
    category: 'interactions',
    relativePath: 'gameplay_logs/interactions',
    label: 'Character Dialogue & Action Logs',
    dataTypeLabel: 'Saved Conversations & Daily Actions',
    description: 'Chronological transcripts of player-character conversations, inspections, and daily routines.',
    filePrefix: 'interaction_log',
    extension: '.interactions.json',
    autoSavesOn: 'Speaking with residents or logging character interactions'
  },
  {
    category: 'time_events',
    relativePath: 'gameplay_logs/time_events',
    label: 'Gameplay Clock & Time-of-Day Events',
    dataTypeLabel: 'World Clock & Schedule Transitions',
    description: 'Recorded time-of-day shifts (Morning, Afternoon, Evening, Night) and scheduled world triggers.',
    filePrefix: 'time_events',
    extension: '.timeevents.json',
    autoSavesOn: 'Advancing the gameplay clock or triggering phase transitions'
  },
  {
    category: 'audio_sfx',
    relativePath: 'audio/sound_effects',
    label: 'Game Sound Effects (.wav / .json)',
    dataTypeLabel: 'Procedural & AI Foley Audio',
    description: 'Synthesized footsteps, door creaks, brass bells, microcassettes, and custom Foley effects.',
    filePrefix: 'sfx',
    extension: '.sfx.json',
    autoSavesOn: 'Forging a new sound effect or clicking Save to Local'
  },
  {
    category: 'audio_music',
    relativePath: 'audio/background_music',
    label: 'Background Music Tracks (.wav / .json)',
    dataTypeLabel: 'Multi-Track Ambient Music',
    description: 'Looping boutique hotel noir tracks and AI-composed musical sequences.',
    filePrefix: 'bgm',
    extension: '.track.json',
    autoSavesOn: 'Composing a new music track or clicking Save to Local'
  }
];

export function getLocalFolderSpec(category: LocalFolderCategory): LocalFolderSpec {
  const found = LOCAL_WORKSPACE_FOLDERS.find((f) => f.category === category);
  if (found) return found;
  if (category === 'room_blueprints') {
    const bp = LOCAL_WORKSPACE_FOLDERS.find((f) => f.category === 'blueprints');
    if (bp) return bp;
  }
  return LOCAL_WORKSPACE_FOLDERS[0];
}

export function buildLocalFolderItemFilename(
  category: LocalFolderCategory,
  itemName: string,
  uniqueSuffix?: string
): string {
  const spec = getLocalFolderSpec(category);
  const safeSlug =
    (itemName || spec.filePrefix)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || spec.filePrefix;
  const cleanSuffix = uniqueSuffix
    ? `_${uniqueSuffix.toLowerCase().replace(/[^a-z0-9-_]+/g, '').slice(0, 16)}`
    : '';
  return `${spec.filePrefix}_${safeSlug}${cleanSuffix}${spec.extension}`;
}

export function buildLocalSetupScripts(): {
  windowsBat: string;
  unixSh: string;
  readmeTxt: string;
} {
  const winDirs = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `mkdir "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}\\${f.relativePath.replace(/\//g, '\\')}" 2>nul`
  ).join('\r\n');

  const unixDirs = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `mkdir -p "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/${f.relativePath}"`
  ).join('\n');

  const windowsBat = `@echo off
setlocal EnableDelayedExpansion
echo ============================================================================
echo ArchitectForge: The House Suite — Full Local Device Installer (Windows)
echo ============================================================================
set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

echo [1/4] Preparing Local Workspace Directories...
mkdir "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}" 2>nul
${winDirs}

echo [2/4] Importing Initial Asset Catalog, Room Blueprints, Character Rigs ^& Description Queue...
(
echo # ArchitectForge Late-70s ^& 1990s Asset Import Queue
echo Brass Hotel Key Rack ^| furniture ^| 0.8x1.1x0.15 ^| #5e4c2e ^| aged_brass ^| Tarnished brass wall rack for room keys
echo Flickering Exit Sign ^| lighting ^| 0.6x0.3x0.12 ^| #7f1d1d ^| aged_brass ^| Cracked red glass exit sign
echo 1978 Velvet Tufted Sofa ^| furniture ^| 2.1x0.85x0.9 ^| #4a5438 ^| velvet_crimson ^| Late-70s parlor sofa
) > "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}\\assets\\image_descriptions_import\\late70s_hotel_asset_descriptions.descriptions.txt"

(
echo {"schemaVersion":"2.0.0","installedAt":"%DATE% %TIME%","workspaceRoot":"${LOCAL_WORKSPACE_ROOT_NAME}","foldersCount":${LOCAL_WORKSPACE_FOLDERS.length},"assetsImported":true,"offlineReady":true}
) > "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}\\projects\\saved_projects\\project_installed_default_seed.architectforge.json"

echo [3/4] Creating Local Desktop Shortcut ("Architect Forge.lnk")...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $desktop 'Architect Forge.lnk')); if (Test-Path (Join-Path '%INSTALL_DIR%' 'ArchitectForge_Standalone.html')) { $s.TargetPath = (Join-Path '%INSTALL_DIR%' 'ArchitectForge_Standalone.html') } else { $s.TargetPath = 'http://localhost:3000' }; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'Launch Architect Forge 3D Building, Character & Sound Studio Locally'; $s.Save()" 2>nul

echo [4/4] Verifying Offline Standalone Application ^& Local Dev Server...
echo.
echo Created all ${LOCAL_WORKSPACE_FOLDERS.length} dedicated data and newly-added asset folders inside .\\${LOCAL_WORKSPACE_ROOT_NAME}\\
echo Imported initial asset data and added "Architect Forge" shortcut to your Desktop!
echo Place any .txt or .json file of asset descriptions inside .\\${LOCAL_WORKSPACE_ROOT_NAME}\\assets\\image_descriptions_import\\
echo to batch-convert descriptions into images (gemini-3.1-flash-lite-image) -^> Meshy.ai 3D -^> Game Catalog!
if exist "%INSTALL_DIR%\\ArchitectForge_Standalone.html" (
  echo Launching ArchitectForge_Standalone.html...
  start "" "%INSTALL_DIR%\\ArchitectForge_Standalone.html"
) else if exist "%INSTALL_DIR%\\package.json" (
  echo Starting local ArchitectForge server on http://localhost:3000 ...
  call npm install
  start "" "http://localhost:3000"
  call npm run dev
)
pause
`;

  const unixSh = `#!/usr/bin/env bash
set -e
echo "============================================================================"
echo "ArchitectForge: The House Suite — Full Local Device Installer (macOS / Linux)"
echo "============================================================================"
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[1/4] Preparing Local Workspace Directories..."
mkdir -p "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}"
${unixDirs}

echo "[2/4] Importing Initial Asset Catalog, Room Blueprints, Character Rigs & Description Queue..."
cat << 'EOF' > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/assets/image_descriptions_import/late70s_hotel_asset_descriptions.descriptions.txt"
# ArchitectForge Late-70s & 1990s Asset Import Queue
Brass Hotel Key Rack | furniture | 0.8x1.1x0.15 | #5e4c2e | aged_brass | Tarnished brass wall rack for room keys
Flickering Exit Sign | lighting | 0.6x0.3x0.12 | #7f1d1d | aged_brass | Cracked red glass exit sign
1978 Velvet Tufted Sofa | furniture | 2.1x0.85x0.9 | #4a5438 | velvet_crimson | Late-70s parlor sofa
EOF

cat << 'EOF' > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/projects/saved_projects/project_installed_default_seed.architectforge.json"
{"schemaVersion":"2.0.0","workspaceRoot":"${LOCAL_WORKSPACE_ROOT_NAME}","foldersCount":11,"assetsImported":true,"offlineReady":true}
EOF

echo "[3/4] Creating Desktop Shortcut..."
DESKTOP_DIR="$HOME/Desktop"
if [ -d "$DESKTOP_DIR" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    SHORTCUT_PATH="$DESKTOP_DIR/Architect Forge.command"
    cat << EOF > "$SHORTCUT_PATH"
#!/usr/bin/env bash
cd "$INSTALL_DIR"
if [ -f "$INSTALL_DIR/ArchitectForge_Standalone.html" ]; then
  open "$INSTALL_DIR/ArchitectForge_Standalone.html"
else
  open "http://localhost:3000"
  npm run dev
fi
EOF
    chmod +x "$SHORTCUT_PATH"
  else
    SHORTCUT_PATH="$DESKTOP_DIR/ArchitectForge.desktop"
    TARGET_EXEC="xdg-open $INSTALL_DIR/ArchitectForge_Standalone.html"
    if [ ! -f "$INSTALL_DIR/ArchitectForge_Standalone.html" ]; then
      TARGET_EXEC="bash -c 'cd \"$INSTALL_DIR\" && (xdg-open http://localhost:3000 &) && npm run dev'"
    fi
    cat << EOF > "$SHORTCUT_PATH"
[Desktop Entry]
Version=1.0
Type=Application
Name=Architect Forge
Comment=Architect Forge 3D Building, Character & Sound Studio (100% Local)
Exec=$TARGET_EXEC
Path=$INSTALL_DIR
Terminal=false
Categories=Development;Graphics;Game;
EOF
    chmod +x "$SHORTCUT_PATH"
  fi
  echo "Created Desktop shortcut at: $SHORTCUT_PATH"
fi

echo "[4/4] Finalizing Local Installation..."
echo "Created all ${LOCAL_WORKSPACE_FOLDERS.length} dedicated data and newly-added asset folders inside ./${LOCAL_WORKSPACE_ROOT_NAME}/"
echo "Place any .txt or .json file of asset descriptions inside ./${LOCAL_WORKSPACE_ROOT_NAME}/assets/image_descriptions_import/"
echo "to batch-convert descriptions into images (gemini-3.1-flash-lite-image) -> Meshy.ai 3D -> Game Catalog!"
`;

  const folderTable = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `- ${LOCAL_WORKSPACE_ROOT_NAME}/${f.relativePath}/  -> ${f.label} (*${f.extension})\n    Auto-saves when: ${f.autoSavesOn}`
  ).join('\n');

  const readmeTxt = `ARCHITECTFORGE: THE HOUSE SUITE — 100% LOCAL COMPUTER INSTALLER & WORKSPACE
============================================================================

Dedicated Folder Structure (${LOCAL_WORKSPACE_ROOT_NAME}/):
${folderTable}

What the Local Device Installer Does:
1. Prepares all ${LOCAL_WORKSPACE_FOLDERS.length} dedicated folders under ./${LOCAL_WORKSPACE_ROOT_NAME}/.
2. Imports all initial 3D asset catalog blueprints, 1978 Pristine / 1970s Unkempt / 1990s Updated themes,
   Room Blueprints, Character Rigs, Audio Presets, and the Asset Description Queue onto local disk.
3. Creates a Desktop Shortcut ("Architect Forge.lnk" on Windows, "ArchitectForge.desktop" on Linux,
   or "Architect Forge.command" on macOS) so you can launch the app directly from your Desktop.
4. Unpacks "ArchitectForge_Standalone.html" for 100% offline local execution in any browser without
   requiring cloud dependencies.
`;

  return { windowsBat, unixSh, readmeTxt };
}

export interface FullLocalInstallerBundleSpec {
  installerWindowsBatFilename: string;
  installerWindowsBatContent: string;
  installerUnixShFilename: string;
  installerUnixShContent: string;
  foldersPrepared: string[];
  desktopShortcutName: string;
  importedCounts: {
    placedAssets: number;
    roomBlueprints: number;
    assetSets: number;
    characterRigs: number;
  };
}

/**
 * Builds a self-contained cross-platform local installer script bundle that:
 * 1. Creates all `ArchitectForge_Workspace` directories on the user's computer,
 * 2. Writes/imports the complete project snapshot & asset catalog JSON files into the local folders,
 * 3. Writes the standalone offline HTML app (`ArchitectForge_Standalone.html`) if provided,
 * 4. Creates a Desktop shortcut (`Architect Forge.lnk` / `.desktop` / `.command`) and launches the app locally.
 */
export function buildFullLocalDeviceInstallerBundle(
  projectSnapshot: ArchitectForgeProjectSnapshot,
  standaloneHtmlContent?: string
): FullLocalInstallerBundleSpec {
  const baseScripts = buildLocalSetupScripts();
  const foldersPrepared = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `${LOCAL_WORKSPACE_ROOT_NAME}/${f.relativePath}`
  );
  const projectJsonCompact = JSON.stringify(projectSnapshot);
  const projectBase64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(projectJsonCompact, 'utf-8').toString('base64')
      : typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(projectJsonCompact)))
      : '';

  const htmlBase64 =
    standaloneHtmlContent && typeof Buffer !== 'undefined'
      ? Buffer.from(standaloneHtmlContent, 'utf-8').toString('base64')
      : standaloneHtmlContent && typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(standaloneHtmlContent)))
      : '';

  const winHtmlExtractStep = htmlBase64
    ? `echo Extracting Offline Standalone App (ArchitectForge_Standalone.html)...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllBytes((Join-Path '%INSTALL_DIR%' 'ArchitectForge_Standalone.html'), [Convert]::FromBase64String('${htmlBase64}'))"\r\n`
    : '';

  const winProjectExtractStep = projectBase64
    ? `echo Importing Full Asset Catalog, Placed Objects, Room Blueprints ^& Character Rigs...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllBytes((Join-Path '%INSTALL_DIR%' '${LOCAL_WORKSPACE_ROOT_NAME}\\projects\\saved_projects\\project_full_local_install.architectforge.json'), [Convert]::FromBase64String('${projectBase64}'))"\r\n`
    : '';

  const installerWindowsBatContent = `${baseScripts.windowsBat.replace('pause\r\n', '')}${winProjectExtractStep}${winHtmlExtractStep}echo Full Local Installation Complete!
pause
`;

  const unixHtmlExtractStep = htmlBase64
    ? `echo "Extracting Offline Standalone App (ArchitectForge_Standalone.html)..."\necho "${htmlBase64}" | base64 -d > "$INSTALL_DIR/ArchitectForge_Standalone.html" 2>/dev/null || echo "${htmlBase64}" | base64 -D > "$INSTALL_DIR/ArchitectForge_Standalone.html"\n`
    : '';

  const unixProjectExtractStep = projectBase64
    ? `echo "Importing Full Asset Catalog, Placed Objects, Room Blueprints & Character Rigs..."\necho "${projectBase64}" | base64 -d > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/projects/saved_projects/project_full_local_install.architectforge.json" 2>/dev/null || echo "${projectBase64}" | base64 -D > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/projects/saved_projects/project_full_local_install.architectforge.json"\n`
    : '';

  const installerUnixShContent = `${baseScripts.unixSh}\n${unixProjectExtractStep}${unixHtmlExtractStep}echo "Full Local Installation Complete!"\n`;

  return {
    installerWindowsBatFilename: 'Install_ArchitectForge_Local.bat',
    installerWindowsBatContent,
    installerUnixShFilename: 'Install_ArchitectForge_Local.sh',
    installerUnixShContent,
    foldersPrepared,
    desktopShortcutName: 'Architect Forge',
    importedCounts: {
      placedAssets: projectSnapshot.assets?.length || 0,
      roomBlueprints: projectSnapshot.roomBlueprints?.length || 0,
      assetSets: INITIAL_ASSET_SETS.length,
      characterRigs: projectSnapshot.characterRigs?.length || 0
    }
  };
}


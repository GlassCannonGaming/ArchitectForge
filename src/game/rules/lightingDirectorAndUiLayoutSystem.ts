import { type AssetCategory, type AssetConditionVariant, type CompositeSubPart, type FloorId, type FloorLayer, type HotelAgentProfile, type InvisibleTriggerEventType, type PlacedAsset, type ScheduledActivityGesture } from './coreTypesAndFloors';
import { APARTMENT_1990S_HOTEL_CATALOG_BLUEPRINTS, APARTMENT_BUILDING_CATALOG_BLUEPRINTS, type EditorWorkspaceModeId, type SearchableBlueprintLike, downgradeAssetTo1978Version, getPredecessor1978Subtype, getUpdated1990sVariantSubtype, togglePlacedAssetConditionVariant, upgradeAssetTo1990sHotelVersion } from './catalogVoiceAndSets';
import { LIGHTING_PRESETS, weatherAssetToLate70sStyle, weatherAssetsListToLate70sStyle } from './buildAndPlacement';
import { type ProceduralSfxOutput, initiateAssetHingeToggle } from './lightingHingesAndAudio';
import { DEFAULT_GLOBAL_ANIMATION_FPS } from './keybindingsAndAnimation';
import { type StudioWindowId } from './roomBlueprintsAndWindows';
import { isTvOrCrtScreenAsset, isUnkemptOrAgedAsset } from './renovationAndTriggersSystem';
/**
 * ============================================================================
 * ADVANCED LIGHTING IMPROVEMENTS:
 * 1. WebGL PointLight Pool & Distance Culling (MAX_ACTIVE_DYNAMIC_POINT_LIGHTS)
 * 2. Smooth 250ms Color-Temperature & Intensity Crossfades
 * 3. AI Lighting Mood Auto-Director (gemini-3.1-flash-lite + deterministic fallback)
 * ============================================================================
 */
export const MAX_ACTIVE_DYNAMIC_POINT_LIGHTS = 10;
export const LIGHTING_CROSSFADE_DURATION_MS = 250;

export interface PointLightCullCandidate {
  id: string;
  position: readonly [number, number, number];
  priority?: number; // higher priority gives a virtual distance discount (e.g. selected or interactive asset)
}

/**
 * Ranks dynamic PointLight candidates by 3D distance to the active camera position and
 * selects up to `maxActiveLights` closest lights to emit real-time WebGL PointLight illumination,
 * preventing shader light uniform overflow or frame drops while emissive bulb/screen meshes remain visible.
 */
export function selectCulledPointLightIds(
  candidates: readonly PointLightCullCandidate[],
  cameraPosition: readonly [number, number, number],
  maxActiveLights: number = MAX_ACTIVE_DYNAMIC_POINT_LIGHTS
): {
  activeIds: Set<string>;
  culledIds: Set<string>;
  activeCount: number;
  totalCount: number;
} {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const cap = Math.max(1, Math.floor(maxActiveLights));
  const cx = Number(cameraPosition?.[0]) || 0;
  const cy = Number(cameraPosition?.[1]) || 0;
  const cz = Number(cameraPosition?.[2]) || 0;

  const scored = safeCandidates.map((cand) => {
    const px = Number(cand.position?.[0]) || 0;
    const py = Number(cand.position?.[1]) || 0;
    const pz = Number(cand.position?.[2]) || 0;
    const dx = px - cx;
    const dy = py - cy;
    const dz = pz - cz;
    const distSq = dx * dx + dy * dy + dz * dz;
    const priorityBonus = (Number(cand.priority) || 0) * 12.0;
    return {
      id: cand.id,
      effectiveScore: distSq - priorityBonus
    };
  });

  scored.sort((a, b) => a.effectiveScore - b.effectiveScore || a.id.localeCompare(b.id));

  const activeIds = new Set<string>();
  const culledIds = new Set<string>();

  for (let i = 0; i < scored.length; i++) {
    if (i < cap) {
      activeIds.add(scored[i].id);
    } else {
      culledIds.add(scored[i].id);
    }
  }

  return {
    activeIds,
    culledIds,
    activeCount: activeIds.size,
    totalCount: safeCandidates.length
  };
}

function parseHexToRgbTuple(hex: string): [number, number, number] {
  const cleaned = (hex || '#fde68a').replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (cleaned.length >= 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return [253, 230, 138];
}

/**
 * Smoothly interpolates between two hex colors (`#rrggbb`) using a cubic ease-out curve.
 */
export function interpolateHexColor(fromHex: string, toHex: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  if (clamped <= 0) return fromHex || '#fde68a';
  if (clamped >= 1) return toHex || '#fde68a';
  const eased = 1 - Math.pow(1 - clamped, 3);
  const [r1, g1, b1] = parseHexToRgbTuple(fromHex);
  const [r2, g2, b2] = parseHexToRgbTuple(toHex);
  const r = Math.round(r1 + (r2 - r1) * eased);
  const g = Math.round(g1 + (g2 - g1) * eased);
  const b = Math.round(b1 + (b2 - b1) * eased);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Computes the 250ms crossfade state between a previous light color/intensity and a new target color/intensity.
 */
export function computeLightingCrossfadeState(
  prev: { colorHex: string; intensity: number },
  target: { colorHex: string; intensity: number },
  elapsedMs: number,
  durationMs: number = LIGHTING_CROSSFADE_DURATION_MS
): {
  colorHex: string;
  intensity: number;
  alpha: number;
  isTransitioning: boolean;
} {
  const safeDuration = Math.max(1, Number(durationMs) || LIGHTING_CROSSFADE_DURATION_MS);
  const rawAlpha = Math.max(0, Math.min(1, (Number(elapsedMs) || 0) / safeDuration));
  const easedAlpha = 1 - Math.pow(1 - rawAlpha, 3);
  const fromInt = Number(prev?.intensity ?? target.intensity ?? 1.0);
  const toInt = Number(target?.intensity ?? 1.0);
  const intensity = Number((fromInt + (toInt - fromInt) * easedAlpha).toFixed(4));
  const colorHex = interpolateHexColor(
    prev?.colorHex || target.colorHex || '#fde68a',
    target?.colorHex || '#fde68a',
    rawAlpha
  );
  return {
    colorHex,
    intensity,
    alpha: Number(rawAlpha.toFixed(4)),
    isTransitioning: rawAlpha < 1
  };
}

export interface LightingMoodFixtureAssignment {
  assetId: string;
  lightingPreset: string;
  colorHex: string;
  emissionIntensity: number;
  customAnimationFps: number | null; // null = Global FPS
}

export interface LightingMoodDirective {
  moodTitle: string;
  moodPrompt: string;
  floor: FloorId;
  summary: string;
  defaultPresetId: string;
  defaultColorHex: string;
  defaultIntensity: number;
  defaultFps: number | null;
  assignments: LightingMoodFixtureAssignment[];
}

export const LIGHTING_MOOD_QUICK_PROMPTS: ReadonlyArray<{
  id: string;
  label: string;
  prompt: string;
}> = [
  {
    id: 'noir_interrogation',
    label: '🕵️ 1978 Noir Interrogation',
    prompt: '1978 Noir Detective Interrogation with warm dim tungsten desk pools and slow 12 FPS shadows'
  },
  {
    id: 'power_brownout',
    label: '⚡ Power Grid Brownout',
    prompt: 'Power Grid Brownout with stuttering 6 FPS amber bulbs and low-voltage corridor flicker'
  },
  {
    id: 'crimson_nightmare',
    label: '🩸 Crimson Nightmare',
    prompt: 'Eerie Crimson Nightmare occult darkroom glow with 6 FPS unsettling horror flicker'
  },
  {
    id: 'neon_arcade_90s',
    label: '🕹️ 90s Neon Lounge',
    prompt: '1993 Late-Night Neon Synthwave Lounge with magenta-cyan CRT glow at 24 FPS'
  },
  {
    id: 'bright_inspection',
    label: '☀️ Bright Inspection',
    prompt: 'Bright Clinical Forensic Inspection with crisp 60 FPS high-output overhead office lighting'
  }
];

/**
 * Deterministic scene lighting mood director that coordinates presets, colors, emission intensities,
 * and flicker FPS across all light-emitting or interactive screen assets on `floor` based on a natural-language mood.
 */
export function buildLightingMoodDirectiveFromPrompt(
  moodPrompt: string,
  floor: FloorId,
  assets: readonly PlacedAsset[]
): LightingMoodDirective {
  const cleanPrompt = (moodPrompt || '').trim() || '1978 Noir Detective Interrogation';
  const lower = cleanPrompt.toLowerCase();

  let moodTitle = '1978 Noir Detective Interrogation';
  let defaultPresetId = 'warm_vintage';
  let defaultColorHex = '#f59e0b';
  let defaultIntensity = 0.85;
  let defaultFps: number | null = 12;
  let summary =
    'Coordinated warm 1978 tungsten pools and subdued 12 FPS ballast hum across floor fixtures.';

  if (lower.includes('brownout') || lower.includes('stutter') || lower.includes('outage') || lower.includes('dying')) {
    moodTitle = 'Power Grid Brownout';
    defaultPresetId = 'atmospheric_dim';
    defaultColorHex = '#fde68a';
    defaultIntensity = 0.45;
    defaultFps = 6;
    summary = 'Low-voltage brownout with 0.45x dimmed filaments and erratic 6 FPS ballast stutter.';
  } else if (lower.includes('crimson') || lower.includes('blood') || lower.includes('nightmare') || lower.includes('horror') || lower.includes('occult')) {
    moodTitle = 'Crimson Occult Nightmare';
    defaultPresetId = 'horror_crimson';
    defaultColorHex = '#ef4444';
    defaultIntensity = 1.45;
    defaultFps = 6;
    summary = 'High-contrast crimson darkroom wash with 6 FPS psychological horror flicker.';
  } else if (lower.includes('neon') || lower.includes('90s') || lower.includes('cyber') || lower.includes('arcade') || lower.includes('synth')) {
    moodTitle = '1993 Neon Lounge';
    defaultPresetId = 'neon_cyber';
    defaultColorHex = '#ec4899';
    defaultIntensity = 1.85;
    defaultFps = 24;
    summary = 'Saturated 1990s neon magenta & cyan CRT phosphor accents running at 24 FPS.';
  } else if (lower.includes('bright') || lower.includes('office') || lower.includes('inspection') || lower.includes('clinical') || lower.includes('daylight')) {
    moodTitle = 'Bright Forensic Inspection';
    defaultPresetId = 'bright_office';
    defaultColorHex = '#ffffff';
    defaultIntensity = 2.1;
    defaultFps = 60;
    summary = 'Crisp 2.1x daylight-balanced inspection illumination locked at smooth 60 FPS.';
  } else if (lower.includes('flashlight') || lower.includes('beam') || lower.includes('search')) {
    moodTitle = 'Eerie Flashlight Search';
    defaultPresetId = 'eerie_flashlight';
    defaultColorHex = '#e0f2fe';
    defaultIntensity = 2.4;
    defaultFps = 12;
    summary = 'Cold high-beam halogen searchlight pools with 12 FPS atmospheric shimmer.';
  }

  const floorAssets = (Array.isArray(assets) ? assets : []).filter((a) => {
    if (!a || a.floor !== floor) return false;
    const text = `${a.name} ${a.subType} ${a.category}`.toLowerCase();
    return (
      Boolean(a.isLightEmitting) ||
      a.category === 'lighting' ||
      isTvOrCrtScreenAsset(a) ||
      /lamp|sconce|chandelier|light|exit_sign|crt|tv|terminal|computer|neon|fluorescent/i.test(text)
    );
  });

  const assignments: LightingMoodFixtureAssignment[] = floorAssets.map((asset, idx) => {
    const isScreen = isTvOrCrtScreenAsset(asset);
    const isCorridorFluorescent = /fluorescent|ceiling|corridor|exit_sign/i.test(
      `${asset.name} ${asset.subType}`
    );

    let preset = defaultPresetId;
    let colorHex = defaultColorHex;
    let intensity = defaultIntensity;
    let fps: number | null = defaultFps;

    if (isScreen && defaultPresetId === 'warm_vintage') {
      preset = 'eerie_flashlight';
      colorHex = '#bae6fd';
      intensity = Number((defaultIntensity * 1.15).toFixed(2));
    } else if (isScreen && defaultPresetId === 'neon_cyber') {
      colorHex = idx % 2 === 0 ? '#38bdf8' : '#ec4899';
    } else if (isCorridorFluorescent && defaultPresetId === 'atmospheric_dim') {
      fps = 6;
      intensity = 0.4;
    }

    return {
      assetId: asset.id,
      lightingPreset: preset,
      colorHex,
      emissionIntensity: Math.max(0.1, Math.min(3.0, Number(intensity.toFixed(2)))),
      customAnimationFps: fps
    };
  });

  return {
    moodTitle,
    moodPrompt: cleanPrompt,
    floor,
    summary,
    defaultPresetId,
    defaultColorHex,
    defaultIntensity,
    defaultFps,
    assignments
  };
}

/**
 * Applies a `LightingMoodDirective` across all matching light-emitting/screen assets on `floor`,
 * recording `prevLightColorHex`, `prevEmissionIntensity`, and `lightingTransitionStartMs` so the 3D viewport
 * smoothly crossfades every fixture over 250ms.
 */
export function applyLightingMoodDirectiveToAssets(
  assets: readonly PlacedAsset[],
  floor: FloorId,
  directive: LightingMoodDirective,
  nowMs: number = Date.now()
): {
  updatedAssets: PlacedAsset[];
  updatedCount: number;
  message: string;
} {
  const safeAssets = Array.isArray(assets) ? assets : [];
  const byId = new Map<string, LightingMoodFixtureAssignment>();
  for (const item of directive.assignments || []) {
    if (item && item.assetId) {
      byId.set(item.assetId, item);
    }
  }

  let updatedCount = 0;
  const updatedAssets = safeAssets.map((asset) => {
    if (!asset || asset.floor !== floor) return asset;
    const text = `${asset.name} ${asset.subType} ${asset.category}`.toLowerCase();
    const isEligible =
      byId.has(asset.id) ||
      Boolean(asset.isLightEmitting) ||
      asset.category === 'lighting' ||
      isTvOrCrtScreenAsset(asset) ||
      /lamp|sconce|chandelier|light|exit_sign|crt|tv|terminal|computer|neon|fluorescent/i.test(text);

    if (!isEligible) return asset;

    const assigned = byId.get(asset.id);
    const targetPreset = assigned?.lightingPreset || directive.defaultPresetId || 'warm_vintage';
    const targetColor = assigned?.colorHex || directive.defaultColorHex || '#f59e0b';
    const targetIntensity = Math.max(
      0.1,
      Math.min(3.0, Number(assigned?.emissionIntensity ?? directive.defaultIntensity ?? 1.0))
    );
    const targetFps =
      assigned !== undefined ? assigned.customAnimationFps : directive.defaultFps;

    updatedCount++;

    const updatedCompositeParts = Array.isArray(asset.compositeParts)
      ? asset.compositeParts.map((part: CompositeSubPart) => {
          const partIdLower = (part.id || '').toLowerCase();
          const isGlowingPart =
            Boolean(part.emissive && part.emissive !== '#000000') ||
            /bulb|shade|screen|crt|tube|glass|lamp|glow|neon/i.test(partIdLower);
          if (isGlowingPart) {
            return {
              ...part,
              emissive: targetColor
            };
          }
          return part;
        })
      : asset.compositeParts;

    return {
      ...asset,
      prevLightColorHex: asset.color || '#fde68a',
      prevEmissionIntensity: Number(asset.emissionIntensity ?? asset.lightIntensity ?? 1.0),
      lightingTransitionStartMs: nowMs,
      isActivated: true,
      isLightEmitting: true,
      lightingPreset: targetPreset,
      color: targetColor,
      emissionIntensity: targetIntensity,
      lightIntensity: targetIntensity,
      customAnimationFps: targetFps && targetFps > 0 ? targetFps : undefined,
      customFlickerFps: targetFps && targetFps > 0 ? targetFps : undefined,
      compositeParts: updatedCompositeParts
    };
  });

  return {
    updatedAssets,
    updatedCount,
    message: `🎬 AI Lighting Director applied "${directive.moodTitle}" across ${updatedCount} fixture(s) on ${floor.toUpperCase()} (250ms smooth crossfade).`
  };
}

/**
 * ============================================================================
 * ARCHITECT FORGE A–G UI LAYOUT & MODE-SPECIFIC FEATURE BUTTONS SPECIFICATION
 * ============================================================================
 * Matches the user's hand-drawn UI architecture (Sections A through G):
 * - A: Logo (Left circular badge in Title Section)
 * - B: App Name ("Architect Forge" centered in Title Section)
 * - C: Folder / Save/Load / Files / Projects / Key Binds (Right circular segmented hub in Title Section)
 * - D: Mode Selection ("Build Mode", "Char. Build", "Sound B" centered pill bar)
 * - E: Mode Specific Feature Buttons Section (dynamically changes depending on active mode;
 *      in Build Mode shows: "Asset Gen", "Search", "L/S BP", "First-Person")
 * - F: Floor Selection, ADD/Remove Window (UP/DOWN arrows + stacked diamond floor plates + ADD NEW / Remove,
 *      strictly visible ONLY during Build Mode)
 * - G: Working Canvas (Main 3D isometric/perspective grid viewport)
 */
export interface ModeSelectionPillItem {
  id: 'architect' | 'character' | 'soundboard';
  label: string;
  legacyLabel: string;
}

export const MODE_SELECTION_PILL_TABS: ReadonlyArray<ModeSelectionPillItem> = [
  { id: 'architect', label: 'Build Mode', legacyLabel: '1 · Build Mode' },
  { id: 'character', label: 'Char. Build', legacyLabel: '2 · Create-A-Character' },
  { id: 'soundboard', label: 'Sound B', legacyLabel: '3 · Sound Board' }
] as const;

export type ArchitectCatalogSubTab = 'catalog' | 'sets' | 'blueprints' | 'ai3d';

export interface ModeFeatureButtonSpec {
  id: string;
  label: string;
  mode: EditorWorkspaceModeId;
  targetArchitectTab?: ArchitectCatalogSubTab;
  targetWindowId?: StudioWindowId;
  targetMode?: EditorWorkspaceModeId;
  specialAction?: 'toggle_flashlight' | 'toggle_lighting' | 'toggle_crouch' | 'focus_search';
  description: string;
}

export const ARCHITECT_FORGE_UI_LAYOUT_SPEC = {
  sectionA: 'logo_left_circle' as const,
  sectionB: 'Architect Forge' as const,
  sectionC: ['local_fs', 'projects', 'keybindings'] as const,
  sectionD: MODE_SELECTION_PILL_TABS,
  sectionFVisibleOnlyInBuildMode: true as const,
  sectionG: 'working_canvas_3d' as const
} as const;

/**
 * Returns the mode-specific feature buttons for Section E depending on the active mode.
 * In Build Mode ('architect'), returns the exact 4 buttons from the user's drawing:
 * ["Asset Gen", "Search", "L/S BP", "First-Person"].
 */
export function getModeFeatureButtons(mode: EditorWorkspaceModeId): ModeFeatureButtonSpec[] {
  if (mode === 'architect') {
    return [
      {
        id: 'asset_gen',
        label: 'Asset Gen',
        mode: 'architect',
        targetArchitectTab: 'ai3d',
        targetWindowId: 'catalog',
        description: 'Open AI Asset Generator (Meshy Image-to-3D, Flash-Lite Texture & Scale Ref)'
      },
      {
        id: 'search',
        label: 'Search',
        mode: 'architect',
        targetArchitectTab: 'catalog',
        targetWindowId: 'catalog',
        specialAction: 'focus_search',
        description: 'Open & Search the 3D Asset Catalog and Saved Asset Sets'
      },
      {
        id: 'ls_bp',
        label: 'L/S BP',
        mode: 'architect',
        targetArchitectTab: 'blueprints',
        targetWindowId: 'catalog',
        description: 'Load / Save Room Blueprints Library'
      },
      {
        id: 'first_person',
        label: 'First-Person',
        mode: 'architect',
        targetMode: 'walkthrough',
        description: 'Enter First-Person Walk Mode on the Working Canvas'
      }
    ];
  }

  if (mode === 'character') {
    return [
      {
        id: 'char_rig',
        label: 'Rig & Look',
        mode: 'character',
        targetWindowId: 'char_appearance',
        description: 'Customize 3D Humanoid Skeleton Rig, Proportions & Attire'
      },
      {
        id: 'char_ai',
        label: 'AI & Schedule',
        mode: 'character',
        targetWindowId: 'char_ai',
        description: 'Configure Character Persona, Episodic Memory & Daily Schedule'
      },
      {
        id: 'char_anim',
        label: 'AI Anim Studio',
        mode: 'character',
        targetWindowId: 'char_appearance',
        description: 'Synthesize Low-Frame Character Animations & Facial Expressions'
      },
      {
        id: 'first_person',
        label: 'First-Person',
        mode: 'character',
        targetMode: 'walkthrough',
        description: 'Test Characters Live in First-Person Walk Mode'
      }
    ];
  }

  if (mode === 'soundboard') {
    return [
      {
        id: 'sound_synth',
        label: 'Sound Synth',
        mode: 'soundboard',
        targetWindowId: 'audio',
        description: 'Open Parametric Foley SFX & Multi-Voice Music Composer'
      },
      {
        id: 'asset_sound',
        label: 'Asset Audio',
        mode: 'soundboard',
        targetWindowId: 'audio',
        description: 'Assign Custom Sounds to Placed 3D Assets & Catalog Blueprints'
      },
      {
        id: 'ambience_loop',
        label: 'Ambience Loop',
        mode: 'soundboard',
        targetWindowId: 'audio',
        description: 'Configure High-Suspicion Room Ambience & Footstep Acoustics'
      },
      {
        id: 'first_person',
        label: 'First-Person',
        mode: 'soundboard',
        targetMode: 'walkthrough',
        description: 'Audition Spatial Audio in First-Person Walk Mode'
      }
    ];
  }

  // mode === 'walkthrough' (First-Person Mode)
  return [
    {
      id: 'return_build',
      label: 'Build Mode',
      mode: 'walkthrough',
      targetMode: 'architect',
      description: 'Exit First-Person Walk Mode and Return to Build Mode'
    },
    {
      id: 'flashlight_toggle',
      label: 'Flashlight [L]',
      mode: 'walkthrough',
      specialAction: 'toggle_flashlight',
      description: 'Toggle 1970s Chrome D-Cell / UV Inspection Flashlight'
    },
    {
      id: 'lighting_toggle',
      label: 'Scene Light',
      mode: 'walkthrough',
      specialAction: 'toggle_lighting',
      description: 'Toggle Dynamic Room Mood Lighting'
    },
    {
      id: 'first_person',
      label: 'First-Person (Exit)',
      mode: 'walkthrough',
      targetMode: 'architect',
      description: 'Exit First-Person Walk Mode'
    }
  ];
}

/**
 * Enforces that Section F (Floor Selection, ADD/Remove Window) is strictly visible ONLY during Build Mode ('architect').
 */
export function isFloorSelectionWidgetVisible(mode: EditorWorkspaceModeId): boolean {
  return mode === 'architect';
}

/**
 * Formats a floor layer short code to match the sketch's diamond labels (e.g., "F3", "F2", "F1", "L1", "B1").
 */
export function formatFloorDiamondCode(layer: Pick<FloorLayer, 'id' | 'shortCode' | 'elevation'>): string {
  const raw = (layer.shortCode || '').trim().toUpperCase();
  const matchNumF = raw.match(/^(\d+)F$/);
  if (matchNumF) {
    return `F${matchNumF[1]}`;
  }
  if (raw) return raw;
  if (layer.elevation < 0) return `B${Math.abs(layer.elevation)}`;
  if (layer.elevation === 0) return 'L1';
  return `F${layer.elevation}`;
}

/**
 * Steps the active floor selection UP (higher elevation) or DOWN (lower elevation)
 * through the top-down elevation-sorted floor stack.
 */
export function stepFloorSelection(
  layers: readonly FloorLayer[],
  currentFloor: FloorId,
  direction: 'up' | 'down'
): FloorId {
  if (!Array.isArray(layers) || layers.length === 0) return currentFloor;
  const sortedTopDown = [...layers].sort((a, b) => b.elevation - a.elevation);
  const idx = sortedTopDown.findIndex((l) => l.id === currentFloor);
  if (idx === -1) return sortedTopDown[0].id;
  if (direction === 'up') {
    return idx > 0 ? sortedTopDown[idx - 1].id : sortedTopDown[0].id;
  }
  return idx < sortedTopDown.length - 1
    ? sortedTopDown[idx + 1].id
    : sortedTopDown[sortedTopDown.length - 1].id;
}

/**
 * Removes a floor layer from the floor stack (while protecting at least 1 remaining floor layer)
 * and resolves the next active floor if the removed floor was currently selected.
 */
export function removeFloorLayer(
  layers: readonly FloorLayer[],
  floorIdToRemove: FloorId,
  currentFloor: FloorId
): {
  layers: FloorLayer[];
  nextCurrentFloor: FloorId;
  removedLayer: FloorLayer | null;
  removed: boolean;
} {
  const safeLayers = Array.isArray(layers) ? [...layers] : [];
  if (safeLayers.length <= 1) {
    return {
      layers: safeLayers,
      nextCurrentFloor: currentFloor,
      removedLayer: null,
      removed: false
    };
  }

  const sortedTopDown = [...safeLayers].sort((a, b) => b.elevation - a.elevation);
  const removeIdx = sortedTopDown.findIndex((l) => l.id === floorIdToRemove);
  if (removeIdx === -1) {
    return {
      layers: safeLayers,
      nextCurrentFloor: currentFloor,
      removedLayer: null,
      removed: false
    };
  }

  const removedLayer = sortedTopDown[removeIdx];
  const remaining = safeLayers.filter((l) => l.id !== floorIdToRemove);
  let nextCurrentFloor = currentFloor;
  if (currentFloor === floorIdToRemove) {
    const fallbackNeighbor =
      sortedTopDown[removeIdx + 1] || sortedTopDown[removeIdx - 1] || remaining[0];
    nextCurrentFloor = fallbackNeighbor ? fallbackNeighbor.id : remaining[0].id;
  }

  return {
    layers: remaining,
    nextCurrentFloor,
    removedLayer,
    removed: true
  };
}

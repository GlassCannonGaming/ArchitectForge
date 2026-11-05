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
import { normalizeBlueprintTag, parseBlueprintTagsInput } from './catalogAndTagSearchSystem';
// (Separate from Room Blueprints)
// ============================================================================

export interface AssetClipboardItem {
  name: string;
  category: AssetCategory;
  subType: string;
  relPosition: [number, number, number]; // [dx, y, dz] relative to selection centroid
  dimensions: [number, number, number];
  rotationY: number;
  color: string;
  textureId: TexturePresetId;
  isSecretPassage?: boolean;
  hingeSwingMode?: HingeSwingMode;
  isOpen?: boolean;
  isActivated?: boolean;
  interactionStateLabel?: string;
  collidable: boolean;
  compositeParts?: CompositeSubPart[];
  tags?: string[];
  soundPresetId?: string;
  pairedVariantId?: string;
  conditionVariant?: AssetConditionVariant;
  era?: '1970s' | '1980s' | '1990s' | 'timeless';
  predecessor1978Id?: string;
  paired1990sId?: string;
  isLightEmitting?: boolean;
  emissionIntensity?: number;
  lightIntensity?: number;
  lightingPreset?: string;
  customAnimationFps?: number;
}

export interface AssetClipboardPayload {
  copiedAt: string;
  sourceFloor: FloorId;
  originCenter: [number, number]; // [centerX, centerZ] of original selection
  boundingSize: [number, number]; // [spanX, spanZ]
  items: AssetClipboardItem[];
}

/**
 * Reusable "Set" of multiple (or single) assets saved together as a portable prop/furniture/fixture grouping,
 * completely separate from full-room `RoomBlueprint` definitions.
 */
export interface AssetSet {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  tags: string[];
  boundingSize: [number, number];
  items: AssetClipboardItem[];
}

export type { ApartmentAssetBlueprint } from '../apartmentImportData';
export {
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
};

export const INITIAL_ASSET_SETS: AssetSet[] = [
  ...APARTMENT_ROOM_ASSET_SETS,
  {
    id: 'set_concierge_station_1978',
    name: '1978 Concierge Desk & Banker Lamp Set',
    description: 'Multi-item lobby station set combining a scarred walnut concierge desk, tarnished brass banker lamp, and oxblood runner rug.',
    createdAt: '2026-10-31T10:00:00.000Z',
    tags: ['concierge', 'desk_set', 'lobby', 'late_70s'],
    boundingSize: [3.2, 2.8],
    items: [
      {
        name: 'Scarred Walnut Concierge Desk',
        category: 'furniture',
        subType: 'concierge_desk',
        relPosition: [0, 0.55, -0.5],
        dimensions: [2.6, 1.1, 0.9],
        rotationY: 0,
        color: '#3b2314',
        textureId: 'oak_parquet',
        collidable: true,
        tags: ['concierge', 'furniture']
      },
      {
        name: 'Tarnished Banker Desk Lamp',
        category: 'lighting',
        subType: 'brass_table_lamp',
        relPosition: [-0.9, 1.2, -0.5],
        dimensions: [0.4, 0.55, 0.4],
        rotationY: 0,
        color: '#5e4c2e',
        textureId: 'aged_brass',
        collidable: false,
        tags: ['lamp', 'lighting']
      },
      {
        name: 'Threadbare Oxblood Parlor Rug',
        category: 'floor_tile',
        subType: 'crimson_carpet_runner',
        relPosition: [0, 0.03, 0.5],
        dimensions: [3.2, 0.06, 2.0],
        rotationY: 0,
        color: '#4a181b',
        textureId: 'velvet_crimson',
        collidable: false,
        tags: ['rug', 'carpet']
      }
    ]
  },
  {
    id: 'set_investigator_evidence_table',
    name: 'Investigator Evidence & Dictaphone Set',
    description: 'Multi-item investigative prop set with corkboard evidence wall mount, leather notebook, and microcassette dictaphone.',
    createdAt: '2026-10-31T11:00:00.000Z',
    tags: ['investigation', 'clues', 'props_set', '1978'],
    boundingSize: [2.0, 1.5],
    items: [
      {
        name: "Investigator's Evidence Corkboard & Red Yarn",
        category: 'furniture',
        subType: 'evidence_corkboard_wall',
        relPosition: [0, 1.3, -0.4],
        dimensions: [1.5, 1.1, 0.15],
        rotationY: 0,
        color: '#713f12',
        textureId: 'oak_parquet',
        collidable: false,
        tags: ['corkboard', 'evidence', 'game_feature_item']
      },
      {
        name: "Investigator's Leather Notebook & Fountain Pen",
        category: 'furniture',
        subType: 'investigator_notebook_folio',
        relPosition: [-0.35, 0.5, 0.2],
        dimensions: [0.45, 0.12, 0.35],
        rotationY: 0,
        color: '#451a03',
        textureId: 'oak_parquet',
        collidable: false,
        tags: ['notebook', 'clues', 'game_feature_item']
      },
      {
        name: '1978 Microcassette Dictaphone & Tape Recorder',
        category: 'appliance',
        subType: 'microcassette_tape_player',
        relPosition: [0.35, 0.5, 0.2],
        dimensions: [0.4, 0.16, 0.3],
        rotationY: 0,
        color: '#27272a',
        textureId: 'aged_brass',
        collidable: false,
        tags: ['cassette', 'audio', 'game_feature_item'],
        soundPresetId: 'cassette_click'
      }
    ]
  },
  {
    id: 'set_corridor_steam_utility',
    name: 'Corridor Steam Radiator & Wardrobe Set',
    description: 'Hallway & suite utility set pairing a clanking cast-iron steam radiator with a weathered dark oak wardrobe.',
    createdAt: '2026-10-31T12:00:00.000Z',
    tags: ['corridor', 'radiator', 'furniture_set', 'utility'],
    boundingSize: [2.8, 1.2],
    items: [
      {
        name: 'Clawfoot Steam Radiator',
        category: 'appliance',
        subType: 'vintage_radiator',
        relPosition: [-0.8, 0.45, 0],
        dimensions: [1.2, 0.9, 0.4],
        rotationY: 0,
        color: '#6e5a38',
        textureId: 'aged_brass',
        collidable: true,
        tags: ['radiator', 'steam'],
        soundPresetId: 'radiator_hiss'
      },
      {
        name: 'Weathered Dark Oak Wardrobe',
        category: 'furniture',
        subType: 'oak_wardrobe',
        relPosition: [0.8, 1.1, 0],
        dimensions: [1.3, 2.2, 0.7],
        rotationY: 0,
        color: '#2b180a',
        textureId: 'oak_parquet',
        collidable: true,
        tags: ['wardrobe', 'storage']
      }
    ]
  }
];

/**
 * Pure helper to copy a single selected asset (`primaryId`) or a group of multiple selected assets (`selectedIds`)
 * into an `AssetClipboardPayload` (triggered by Ctrl+C or UI Copy button).
 */
export function copySelectedAssetsToClipboard(
  allAssets: PlacedAsset[],
  selectedIds: string[],
  primaryId: string | null
): AssetClipboardPayload | null {
  const effectiveIds =
    selectedIds.length > 0
      ? selectedIds
      : primaryId
      ? [primaryId]
      : [];
  if (effectiveIds.length === 0) return null;

  const idSet = new Set(effectiveIds);
  const selectedAssets = allAssets.filter((a) => idSet.has(a.id));
  if (selectedAssets.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const a of selectedAssets) {
    const [x, , z] = a.position;
    const [w, , d] = a.dimensions;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
  }

  const centerX = snapToGrid((minX + maxX) / 2, 0.5);
  const centerZ = snapToGrid((minZ + maxZ) / 2, 0.5);
  const spanX = Math.max(0.5, Math.round((maxX - minX) * 10) / 10);
  const spanZ = Math.max(0.5, Math.round((maxZ - minZ) * 10) / 10);

  const items: AssetClipboardItem[] = selectedAssets.map((a) => ({
    name: a.name,
    category: a.category,
    subType: a.subType,
    relPosition: [
      snapToGrid(a.position[0] - centerX, 0.5),
      a.position[1],
      snapToGrid(a.position[2] - centerZ, 0.5)
    ],
    dimensions: [...a.dimensions] as [number, number, number],
    rotationY: a.rotationY,
    color: a.color,
    textureId: a.textureId,
    isSecretPassage: a.isSecretPassage,
    hingeSwingMode: a.hingeSwingMode,
    isOpen: Boolean(a.isOpen),
    isActivated: Boolean(a.isActivated),
    collidable: a.collidable,
    compositeParts: a.compositeParts ? a.compositeParts.map((p) => ({ ...p })) : undefined,
    tags: a.tags ? [...a.tags] : undefined,
    soundPresetId: a.soundPresetId,
    pairedVariantId: a.pairedVariantId,
    conditionVariant: a.conditionVariant,
    isLightEmitting: a.isLightEmitting,
    emissionIntensity: a.emissionIntensity,
    lightIntensity: a.lightIntensity,
    lightingPreset: a.lightingPreset,
    customAnimationFps: a.customAnimationFps ?? a.customFlickerFps
  }));

  return {
    copiedAt: new Date().toISOString(),
    sourceFloor: selectedAssets[0].floor,
    originCenter: [centerX, centerZ],
    boundingSize: [spanX, spanZ],
    items
  };
}

/**
 * Pure helper to paste an `AssetClipboardPayload` (single item or multi-item group) onto `targetFloor`
 * (triggered by Ctrl+V or UI Paste button). Automatically offsets by `pasteStepCount * 1.0m` on X and Z
 * unless `targetCenterOverride` is supplied, and returns the newly created assets and their selection IDs.
 */
export function pasteAssetsFromClipboard(
  clipboard: AssetClipboardPayload | null,
  targetFloor: FloorId,
  pasteStepCount = 1,
  targetCenterOverride?: [number, number],
  roomNumber = 'Pasted Selection',
  halfGrid = GRID_TILE_COUNT / 2 - 0.5
): {
  pastedAssets: PlacedAsset[];
  pastedIds: string[];
  primaryId: string | null;
} {
  if (!clipboard || !Array.isArray(clipboard.items) || clipboard.items.length === 0) {
    return { pastedAssets: [], pastedIds: [], primaryId: null };
  }

  const stepDelta = Math.max(1, pasteStepCount) * 1.0;
  const baseCenterX = targetCenterOverride
    ? targetCenterOverride[0]
    : clipboard.originCenter[0] + stepDelta;
  const baseCenterZ = targetCenterOverride
    ? targetCenterOverride[1]
    : clipboard.originCenter[1] + stepDelta;

  const stamp = Date.now();
  const pastedAssets: PlacedAsset[] = clipboard.items.map((item, idx) => {
    const worldX = snapToGrid(
      Math.max(-halfGrid, Math.min(halfGrid, baseCenterX + item.relPosition[0])),
      0.5
    );
    const worldZ = snapToGrid(
      Math.max(-halfGrid, Math.min(halfGrid, baseCenterZ + item.relPosition[2])),
      0.5
    );
    const yPos =
      typeof item.relPosition[1] === 'number' && item.relPosition[1] > 0
        ? item.relPosition[1]
        : item.dimensions[1] / 2;

    return {
      id: `paste_${stamp}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      name: item.name,
      category: item.category,
      subType: item.subType,
      floor: targetFloor,
      roomNumber,
      position: [worldX, yPos, worldZ],
      dimensions: [...item.dimensions] as [number, number, number],
      rotationY: item.rotationY,
      color: item.color,
      textureId: item.textureId,
      isSecretPassage: item.isSecretPassage,
      hingeSwingMode: item.hingeSwingMode,
      isOpen: Boolean(item.isOpen),
      isActivated: Boolean(item.isActivated),
      collidable: item.collidable,
      compositeParts: item.compositeParts ? item.compositeParts.map((p) => ({ ...p })) : undefined,
      tags: item.tags ? [...item.tags] : undefined,
      soundPresetId: item.soundPresetId,
      pairedVariantId: item.pairedVariantId,
      conditionVariant: item.conditionVariant,
      isLightEmitting: item.isLightEmitting,
      emissionIntensity: item.emissionIntensity,
      lightIntensity: item.lightIntensity,
      lightingPreset: item.lightingPreset,
      customAnimationFps: item.customAnimationFps,
      customFlickerFps: item.customAnimationFps
    };
  });

  const pastedIds = pastedAssets.map((a) => a.id);
  const primaryId = pastedIds.length > 0 ? pastedIds[pastedIds.length - 1] : null;
  return { pastedAssets, pastedIds, primaryId };
}

/**
 * Pure helper to save the currently selected asset(s) (single or multi-selected group) as a reusable `AssetSet`,
 * completely separate from `RoomBlueprint`.
 */
export function createAssetSetFromSelection(params: {
  name: string;
  description?: string;
  tags?: string[];
  allAssets: PlacedAsset[];
  selectedIds: string[];
  primaryId: string | null;
}): AssetSet | null {
  const clipboard = copySelectedAssetsToClipboard(
    params.allAssets,
    params.selectedIds,
    params.primaryId
  );
  if (!clipboard || clipboard.items.length === 0) return null;

  const cleanName =
    (params.name || '').trim() ||
    (clipboard.items.length === 1
      ? `${clipboard.items[0].name} Set`
      : `Custom Multi-Item Set (${clipboard.items.length} items)`);

  const rawTags =
    params.tags && params.tags.length > 0
      ? params.tags
      : ['custom_set', clipboard.items.length > 1 ? 'multi_item' : 'single_item'];
  const normalizedTags = Array.from(
    new Set(rawTags.map((t) => normalizeBlueprintTag(t)).filter(Boolean))
  );

  const defaultDesc =
    (params.description || '').trim() ||
    `Saved Asset Set of ${clipboard.items.length} ${
      clipboard.items.length === 1 ? 'item' : 'grouped items'
    } (${clipboard.boundingSize[0]}m × ${clipboard.boundingSize[1]}m).`;

  return {
    id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName,
    description: defaultDesc,
    createdAt: new Date().toISOString(),
    tags: normalizedTags,
    boundingSize: clipboard.boundingSize,
    items: clipboard.items
  };
}

/**
 * Pure helper to spawn/place a saved `AssetSet` onto `targetFloor` at `(offsetX, offsetZ)` and select all spawned items as a group.
 */
export function instantiateAssetSetOnFloor(
  assetSet: AssetSet,
  targetFloor: FloorId,
  offsetX = 0,
  offsetZ = 0,
  halfGrid = GRID_TILE_COUNT / 2 - 0.5
): {
  spawnedAssets: PlacedAsset[];
  spawnedIds: string[];
  primaryId: string | null;
} {
  const pseudoClipboard: AssetClipboardPayload = {
    copiedAt: assetSet.createdAt,
    sourceFloor: targetFloor,
    originCenter: [offsetX, offsetZ],
    boundingSize: assetSet.boundingSize,
    items: assetSet.items
  };
  const { pastedAssets, pastedIds, primaryId } = pasteAssetsFromClipboard(
    pseudoClipboard,
    targetFloor,
    1,
    [offsetX, offsetZ],
    assetSet.name,
    halfGrid
  );
  return {
    spawnedAssets: pastedAssets,
    spawnedIds: pastedIds,
    primaryId
  };
}

/**
 * Pure search & tag filter for saved `AssetSet`s.
 */
export function searchAndFilterAssetSets(
  sets: AssetSet[],
  query: string,
  activeTags: string[] = []
): AssetSet[] {
  const cleanQuery = (query || '').trim().toLowerCase();
  const normalizedActiveTags = activeTags.map((t) => normalizeBlueprintTag(t)).filter(Boolean);

  return sets.filter((setItem) => {
    if (normalizedActiveTags.length > 0) {
      const setTagSet = new Set((setItem.tags || []).map((t) => normalizeBlueprintTag(t)));
      for (const reqTag of normalizedActiveTags) {
        if (!setTagSet.has(reqTag)) return false;
      }
    }
    if (!cleanQuery) return true;
    const haystack = [
      setItem.name,
      setItem.description,
      ...(setItem.tags || []),
      ...setItem.items.map((i) => `${i.name} ${i.category} ${i.subType}`)
    ]
      .join(' ')
      .toLowerCase();
    return cleanQuery
      .split(/\s+/)
      .filter(Boolean)
      .every((tok) => {
        const cleanTok = tok.startsWith('#') ? tok.slice(1) : tok;
        return haystack.includes(cleanTok);
      });
  });
}


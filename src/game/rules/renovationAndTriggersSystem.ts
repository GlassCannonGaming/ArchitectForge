import { type AssetCategory, type AssetConditionVariant, type CompositeSubPart, type FloorId, type FloorLayer, type HotelAgentProfile, type InvisibleTriggerEventType, type PlacedAsset, type ScheduledActivityGesture } from './coreTypesAndFloors';
import { APARTMENT_1990S_HOTEL_CATALOG_BLUEPRINTS, APARTMENT_BUILDING_CATALOG_BLUEPRINTS, type EditorWorkspaceModeId, type SearchableBlueprintLike, downgradeAssetTo1978Version, getPredecessor1978Subtype, getUpdated1990sVariantSubtype, togglePlacedAssetConditionVariant, upgradeAssetTo1990sHotelVersion } from './catalogVoiceAndSets';
import { LIGHTING_PRESETS, weatherAssetToLate70sStyle, weatherAssetsListToLate70sStyle } from './buildAndPlacement';
import { type ProceduralSfxOutput, initiateAssetHingeToggle } from './lightingHingesAndAudio';
import { DEFAULT_GLOBAL_ANIMATION_FPS } from './keybindingsAndAnimation';
import { type StudioWindowId } from './roomBlueprintsAndWindows';
// ============================================================================
// UNIFIED PRISTINE / UNKEMPT / UPDATED (90S) VARIANT SWAP & PROCEDURAL WEATHERING,
// FPS-KEYED UNKEMPT/AGED HORROR FLICKER, & INTERACTIVE ASSET STATE CHANGES
// ============================================================================

/**
 * Resolves the active condition variant ('pristine' | 'unkempt' | 'updated') for any placed asset or blueprint.
 */
export function resolveAssetConditionVariant(
  asset: Partial<PlacedAsset> | SearchableBlueprintLike | null | undefined
): AssetConditionVariant {
  if (!asset) return 'pristine';
  const cond = (asset as Partial<PlacedAsset>).conditionVariant;
  if (cond === 'updated' || cond === 'unkempt' || cond === 'pristine') {
    return cond;
  }
  const era = (asset as Partial<PlacedAsset>).era;
  const sub = (asset.subType || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  const tags = (asset.tags || []).map((t) => t.toLowerCase());

  if (
    era === '1990s' ||
    sub.endsWith('_90s') ||
    sub.includes('_90s_') ||
    tags.includes('1990s') ||
    tags.includes('hotel-updated') ||
    tags.includes('updated') ||
    name.includes('[updated')
  ) {
    return 'updated';
  }

  if (
    sub.endsWith('_unkempt') ||
    sub.includes('unkempt') ||
    tags.includes('unkempt') ||
    tags.includes('aged') ||
    name.includes('unkempt')
  ) {
    return 'unkempt';
  }

  return 'pristine';
}

/**
 * Swaps ANY asset's condition variant between 'pristine', 'unkempt', and 'updated' (the 1990s asset set)
 * based on its `conditionVariant` metadata, matching catalog blueprints if available, and triggers
 * procedural weathering re-texturing via `weatherAssetToLate70sStyle`.
 */
export function swapAssetConditionVariant(
  asset: PlacedAsset,
  targetVariant: AssetConditionVariant,
  allBlueprints: readonly SearchableBlueprintLike[] = []
): {
  swappedAsset: PlacedAsset;
  conditionVariant: AssetConditionVariant;
  retextured: boolean;
  message: string;
} {
  const safeVariant: AssetConditionVariant =
    targetVariant === 'unkempt' || targetVariant === 'updated' || targetVariant === 'pristine'
      ? targetVariant
      : 'pristine';

  if (!asset || typeof asset !== 'object') {
    const fallbackAsset: PlacedAsset = {
      id: 'fallback_asset',
      name: 'Fallback Hotel Asset',
      category: 'furniture',
      subType: 'fallback_asset',
      floor: 'lobby',
      position: [0, 0.5, 0],
      rotationY: 0,
      dimensions: [1, 1, 1],
      color: '#736555',
      textureId: 'aged_brass',
      collidable: true,
      conditionVariant: safeVariant
    };
    return {
      swappedAsset: fallbackAsset,
      conditionVariant: safeVariant,
      retextured: false,
      message: 'Skipped variant swap: asset reference was undefined.'
    };
  }

  const combinedBlueprints: SearchableBlueprintLike[] = [
    ...(Array.isArray(allBlueprints) ? allBlueprints.filter(Boolean) : []),
    ...APARTMENT_BUILDING_CATALOG_BLUEPRINTS,
    ...APARTMENT_1990S_HOTEL_CATALOG_BLUEPRINTS
  ];

  const safePos: [number, number, number] =
    Array.isArray(asset.position) && asset.position.length === 3
      ? [asset.position[0], asset.position[1], asset.position[2]]
      : [0, 0.5, 0];
  const safeDims: [number, number, number] =
    Array.isArray(asset.dimensions) && asset.dimensions.length === 3
      ? [asset.dimensions[0], asset.dimensions[1], asset.dimensions[2]]
      : [1, 1, 1];

  let working: PlacedAsset = {
    ...asset,
    subType: asset.subType || 'custom_asset',
    position: safePos,
    dimensions: safeDims,
    compositeParts: Array.isArray(asset.compositeParts)
      ? asset.compositeParts.filter(Boolean).map((p) => ({ ...p }))
      : undefined,
    tags: Array.isArray(asset.tags) ? [...asset.tags] : undefined
  };

  const currentVariant = resolveAssetConditionVariant(working);

  if (safeVariant === 'updated') {
    // If currently in 'unkempt', check if toggling to pristine first reveals a 1990s upgrade mapping
    let candidateFor90s = working;
    if (
      !getUpdated1990sVariantSubtype(candidateFor90s.subType, combinedBlueprints) &&
      !candidateFor90s.paired1990sId
    ) {
      const toggled = togglePlacedAssetConditionVariant(candidateFor90s, combinedBlueprints);
      if (toggled) {
        candidateFor90s = toggled;
      }
    }

    const upgradeRes = upgradeAssetTo1990sHotelVersion(candidateFor90s, combinedBlueprints);
    if (upgradeRes.success) {
      working = {
        ...upgradeRes.upgradedAsset,
        predecessor1978Id: candidateFor90s.predecessor1978Id || candidateFor90s.subType,
        conditionVariant: 'updated',
        era: '1990s'
      };
      const swappedAsset = weatherAssetToLate70sStyle(working, 'updated');
      return {
        swappedAsset,
        conditionVariant: 'updated',
        retextured: true,
        message: `Swapped "${asset.name}" to Updated (1990s Set): "${swappedAsset.name}" & procedurally re-textured.`
      };
    }

    // Fallback for any asset (including custom/architectural items without a separate 90s blueprint):
    // swap conditionVariant metadata and trigger procedural weathering re-texture for 'updated'
    const swappedAsset = weatherAssetToLate70sStyle(
      {
        ...working,
        predecessor1978Id: working.predecessor1978Id || working.subType,
        conditionVariant: 'updated',
        era: '1990s'
      },
      'updated'
    );
    return {
      swappedAsset,
      conditionVariant: 'updated',
      retextured: true,
      message: `Swapped "${asset.name}" to Updated (1990s Set) & procedurally re-textured.`
    };
  }

  // Target is 'pristine' or 'unkempt':
  // 1. If currently in 'updated' (1990s), downgrade to 1978 baseline first
  if (currentVariant === 'updated' || working.era === '1990s' || working.subType.endsWith('_90s')) {
    const downRes = downgradeAssetTo1978Version(working, combinedBlueprints);
    if (downRes.success) {
      working = downRes.downgradedAsset;
    } else {
      const fallbackPred =
        working.predecessor1978Id ||
        getPredecessor1978Subtype(working.subType, combinedBlueprints);
      if (fallbackPred) {
        working = {
          ...working,
          subType: fallbackPred,
          era: '1970s',
          conditionVariant: fallbackPred.endsWith('_unkempt') ? 'unkempt' : 'pristine'
        };
      }
    }
  }

  // 2. Check if we need to swap between 1978 _pristine and _unkempt paired blueprints
  const needsPairSwap =
    resolveAssetConditionVariant(working) !== safeVariant ||
    (safeVariant === 'unkempt' && working.subType.endsWith('_pristine')) ||
    (safeVariant === 'pristine' && working.subType.endsWith('_unkempt'));

  if (needsPairSwap) {
    const swappedPair = togglePlacedAssetConditionVariant(working, combinedBlueprints);
    if (
      swappedPair &&
      ((safeVariant === 'unkempt' && swappedPair.subType.endsWith('_unkempt')) ||
        (safeVariant === 'pristine' && swappedPair.subType.endsWith('_pristine')) ||
        resolveAssetConditionVariant(swappedPair) === safeVariant)
    ) {
      working = swappedPair;
    } else if (working.subType.endsWith('_pristine') && safeVariant === 'unkempt') {
      const unkSub = working.subType.replace(/_pristine$/, '_unkempt');
      const bp = combinedBlueprints.find((b) => b.subType === unkSub);
      if (bp) {
        working = {
          ...working,
          name: bp.name,
          subType: bp.subType,
          category: bp.category,
          color: bp.defaultColor,
          textureId: bp.defaultTexture,
          dimensions: [...bp.defaultDimensions] as [number, number, number],
          compositeParts: bp.compositeParts ? bp.compositeParts.map((p) => ({ ...p })) : working.compositeParts,
          pairedVariantId: working.subType,
          conditionVariant: 'unkempt',
          tags: bp.tags ? [...bp.tags] : working.tags
        };
      } else {
        working = {
          ...working,
          subType: unkSub,
          pairedVariantId: working.subType,
          conditionVariant: 'unkempt'
        };
      }
    } else if (working.subType.endsWith('_unkempt') && safeVariant === 'pristine') {
      const prisSub = working.subType.replace(/_unkempt$/, '_pristine');
      const bp = combinedBlueprints.find((b) => b.subType === prisSub);
      if (bp) {
        working = {
          ...working,
          name: bp.name,
          subType: bp.subType,
          category: bp.category,
          color: bp.defaultColor,
          textureId: bp.defaultTexture,
          dimensions: [...bp.defaultDimensions] as [number, number, number],
          compositeParts: bp.compositeParts ? bp.compositeParts.map((p) => ({ ...p })) : working.compositeParts,
          pairedVariantId: working.subType,
          conditionVariant: 'pristine',
          tags: bp.tags ? [...bp.tags] : working.tags
        };
      } else {
        working = {
          ...working,
          subType: prisSub,
          pairedVariantId: working.subType,
          conditionVariant: 'pristine'
        };
      }
    }
  }

  // 3. Always run the procedural weathering function to re-texture and normalize metadata for safeVariant
  const swappedAsset = weatherAssetToLate70sStyle(
    {
      ...working,
      conditionVariant: safeVariant,
      era: '1970s'
    },
    safeVariant
  );

  return {
    swappedAsset,
    conditionVariant: safeVariant,
    retextured: true,
    message:
      safeVariant === 'unkempt'
        ? `Swapped "${asset.name}" to Unkempt (1978 Grime + Flicker) & procedurally re-textured.`
        : `Swapped "${asset.name}" to Pristine (1978 Intact) & procedurally re-textured.`
  };
}

/**
 * Refactored single-pass batch condition variant updater.
 * Pre-merges catalog blueprints once and updates all target assets in a single atomic batch,
 * preventing multiple state re-renders and UI thrashing when switching conditions across
 * multiple selected assets or rapid condition toggling.
 */
export function batchSwapAssetsConditionVariant(
  assets: readonly PlacedAsset[],
  targetIds: readonly string[],
  targetVariant: AssetConditionVariant,
  allBlueprints: readonly SearchableBlueprintLike[] = []
): {
  updatedAssets: PlacedAsset[];
  swappedAssets: PlacedAsset[];
  swappedIds: string[];
  swappedCount: number;
  conditionVariant: AssetConditionVariant;
  message: string;
} {
  const safeVariant: AssetConditionVariant =
    targetVariant === 'unkempt' || targetVariant === 'updated' || targetVariant === 'pristine'
      ? targetVariant
      : 'pristine';

  const safeAssets = Array.isArray(assets) ? assets : [];
  const idSet = new Set((Array.isArray(targetIds) ? targetIds : []).filter(Boolean));

  if (idSet.size === 0 || safeAssets.length === 0) {
    return {
      updatedAssets: [...safeAssets],
      swappedAssets: [],
      swappedIds: [],
      swappedCount: 0,
      conditionVariant: safeVariant,
      message: 'No assets selected for batch condition variant swap.'
    };
  }

  // Pre-merge blueprints once for the entire batch instead of rebuilding per asset
  const preMergedBlueprints: SearchableBlueprintLike[] = [
    ...(Array.isArray(allBlueprints) ? allBlueprints.filter(Boolean) : []),
    ...APARTMENT_BUILDING_CATALOG_BLUEPRINTS,
    ...APARTMENT_1990S_HOTEL_CATALOG_BLUEPRINTS
  ];

  const swappedAssets: PlacedAsset[] = [];
  const swappedIds: string[] = [];

  const updatedAssets = safeAssets.map((item) => {
    if (!item || !idSet.has(item.id)) {
      return item;
    }
    const res = swapAssetConditionVariant(item, safeVariant, preMergedBlueprints);
    swappedAssets.push(res.swappedAsset);
    swappedIds.push(res.swappedAsset.id);
    return res.swappedAsset;
  });

  const variantLabel =
    safeVariant === 'updated'
      ? 'Updated (1990s Set)'
      : safeVariant === 'unkempt'
        ? 'Unkempt (1978 Grime + Flicker)'
        : 'Pristine (1978 Intact)';

  const message =
    swappedAssets.length === 1
      ? `Swapped "${swappedAssets[0].name}" to ${variantLabel}.`
      : `Batch-swapped ${swappedAssets.length} selected assets to ${variantLabel} in a single update.`;

  return {
    updatedAssets,
    swappedAssets,
    swappedIds,
    swappedCount: swappedAssets.length,
    conditionVariant: safeVariant,
    message
  };
}

export const RENOVATION_THEME_OPTIONS: ReadonlyArray<{
  id: AssetConditionVariant;
  label: "78's Pristine" | "70's Unkempt" | "90's Updated";
  era: '1970s' | '1990s';
  description: string;
}> = [
  {
    id: 'pristine',
    label: "78's Pristine",
    era: '1970s',
    description: 'Switches all assets to 1978 Pristine condition.'
  },
  {
    id: 'unkempt',
    label: "70's Unkempt",
    era: '1970s',
    description: 'Switches all assets to 1970s Unkempt weathered condition.'
  },
  {
    id: 'updated',
    label: "90's Updated",
    era: '1990s',
    description: 'Switches all assets to 1990s Updated hotel renovation condition.'
  }
] as const;

/**
 * Switches ALL placed assets across the scene/lot to the selected Renovation theme
 * ("78's Pristine" -> 'pristine', "70's Unkempt" -> 'unkempt', "90's Updated" -> 'updated')
 * in a single atomic batch operation.
 */
export function applyGlobalRenovationTheme(
  assets: readonly PlacedAsset[],
  targetTheme: AssetConditionVariant,
  allBlueprints: readonly SearchableBlueprintLike[] = []
): {
  updatedAssets: PlacedAsset[];
  swappedAssets: PlacedAsset[];
  swappedCount: number;
  theme: AssetConditionVariant;
  targetTheme: AssetConditionVariant;
  themeLabel: string;
  message: string;
} {
  const safeTheme: AssetConditionVariant =
    targetTheme === 'unkempt' || targetTheme === 'updated' || targetTheme === 'pristine'
      ? targetTheme
      : 'pristine';
  const themeMeta =
    RENOVATION_THEME_OPTIONS.find((opt) => opt.id === safeTheme) || RENOVATION_THEME_OPTIONS[0];
  const safeAssets = Array.isArray(assets) ? assets : [];
  const allIds = safeAssets.map((a) => a.id).filter(Boolean);
  const batchRes = batchSwapAssetsConditionVariant(safeAssets, allIds, safeTheme, allBlueprints);

  return {
    updatedAssets: batchRes.updatedAssets,
    swappedAssets: batchRes.swappedAssets,
    swappedCount: batchRes.swappedCount,
    theme: safeTheme,
    targetTheme: safeTheme,
    themeLabel: themeMeta.label,
    message: `Applied "${themeMeta.label}" Renovation theme — switched ${batchRes.swappedCount} asset(s) across the building.`
  };
}

/**
 * Resolves the shared character interaction animation gesture (`ScheduledActivityGesture`)
 * for any placed asset so all characters share the same basic rig movements:
 * - Chairs, armchairs, sofas, stools, benches -> 'sit_chair'
 * - Beds, mattresses, cots -> 'lay_bed'
 * - Doors, secret walls, hinged passages -> 'open_door'
 * - Button/switch activated assets (TVs, radios, phones, intercoms, lamps, elevators, appliances) -> 'press_button'
 * - Clues, notebooks, keys, trunks, props -> 'pickup_item'
 */
export function resolveAssetInteractionAnimationGesture(
  asset: Partial<PlacedAsset> | SearchableBlueprintLike | null | undefined
): ScheduledActivityGesture {
  if (!asset) return 'press_button';
  const sub = (asset.subType || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  const cat = asset.category;
  const combined = `${sub} ${name}`;

  if (
    cat === 'door' ||
    cat === 'secret_wall' ||
    Boolean((asset as Partial<PlacedAsset>).isSecretPassage) ||
    combined.includes('door') ||
    combined.includes('passage')
  ) {
    return 'open_door';
  }

  if (
    combined.includes('bed') ||
    combined.includes('mattress') ||
    combined.includes('cot') ||
    combined.includes('bunk')
  ) {
    return 'lay_bed';
  }

  if (
    combined.includes('chair') ||
    combined.includes('armchair') ||
    combined.includes('sofa') ||
    combined.includes('couch') ||
    combined.includes('stool') ||
    combined.includes('bench') ||
    combined.includes('recliner') ||
    combined.includes('loveseat')
  ) {
    return 'sit_chair';
  }

  if (
    cat === 'appliance' ||
    cat === 'lighting' ||
    isTvOrCrtScreenAsset(asset) ||
    combined.includes('button') ||
    combined.includes('switch') ||
    combined.includes('intercom') ||
    combined.includes('phone') ||
    combined.includes('radio') ||
    combined.includes('elevator') ||
    combined.includes('lamp') ||
    combined.includes('sconce') ||
    combined.includes('tv') ||
    combined.includes('computer') ||
    combined.includes('terminal') ||
    combined.includes('vending') ||
    combined.includes('cooler') ||
    combined.includes('radiator') ||
    combined.includes('clock') ||
    combined.includes('bell')
  ) {
    // Same reach out and touch animation for each button/switch activated asset
    return 'press_button';
  }

  if (
    cat === 'clue_prop' ||
    combined.includes('key') ||
    combined.includes('notebook') ||
    combined.includes('cassette') ||
    combined.includes('dictaphone') ||
    combined.includes('trunk') ||
    combined.includes('suitcase') ||
    combined.includes('item') ||
    combined.includes('prop') ||
    combined.includes('clue')
  ) {
    return 'pickup_item';
  }

  return 'press_button';
}

/**
 * Returns true if the given asset or blueprint is an Invisible Event Trigger volume.
 */
export function isInvisibleTriggerAsset(
  asset: Partial<PlacedAsset> | SearchableBlueprintLike | null | undefined
): boolean {
  if (!asset) return false;
  if ((asset as Partial<PlacedAsset>).isInvisibleTrigger) return true;
  const sub = (asset.subType || '').toLowerCase();
  const tags = (asset.tags || []).map((t) => t.toLowerCase());
  return (
    sub === 'invisible_event_trigger' ||
    sub.includes('invisible_trigger') ||
    tags.includes('invisible-trigger') ||
    tags.includes('event-trigger')
  );
}

export interface FiredInvisibleTriggerEvent {
  triggerId: string;
  triggerName: string;
  eventType: InvisibleTriggerEventType;
  message: string;
  soundPresetId?: string;
  targetAssetId?: string;
  sanityDelta: number;
}

/**
 * Evaluates all invisible event triggers on `currentFloor` against `playerPos` ([x, y, z]).
 * When the player steps inside an invisible trigger's bounding footprint (or `triggerRadius`),
 * activates the trigger and returns the fired in-game event(s) and updated assets.
 */
export function evaluateInvisibleTriggersAtPosition(
  playerPos: readonly [number, number, number],
  currentFloor: FloorId,
  assets: readonly PlacedAsset[]
): {
  activatedTriggers: PlacedAsset[];
  firedTriggers: PlacedAsset[];
  updatedAssets: PlacedAsset[];
  eventsFired: FiredInvisibleTriggerEvent[];
  triggeredEvents: FiredInvisibleTriggerEvent[];
  bannerMessage: string;
} {
  const safeAssets = Array.isArray(assets) ? assets : [];
  const px = Number(playerPos?.[0]) || 0;
  const pz = Number(playerPos?.[2]) || 0;

  const activatedTriggers: PlacedAsset[] = [];
  const eventsFired: FiredInvisibleTriggerEvent[] = [];
  const secretDoorsToOpen = new Set<string>();
  let anyChanged = false;

  const firstPassAssets = safeAssets.map((asset) => {
    if (!asset || asset.floor !== currentFloor || !isInvisibleTriggerAsset(asset)) {
      return asset;
    }

    const [ax, , az] = asset.position || [0, 0, 0];
    const [w, , d] = asset.dimensions || [2, 2, 2];
    const radius = typeof asset.triggerRadius === 'number' && asset.triggerRadius > 0
      ? asset.triggerRadius
      : Math.max(w, d) * 0.55;

    const dx = Math.abs(px - ax);
    const dz = Math.abs(pz - az);
    const dist = Math.hypot(px - ax, pz - az);
    const insideBox = dx <= w * 0.55 && dz <= d * 0.55;
    const insideRadius = dist <= radius;
    const isInside = insideBox || insideRadius;

    if (!isInside) {
      if (asset.isActivated) {
        anyChanged = true;
        return {
          ...asset,
          isActivated: false
        };
      }
      return asset;
    }

    const triggerOnce = asset.triggerOnce ?? false;
    if (triggerOnce && asset.hasTriggered) {
      return asset;
    }

    // Only fire on fresh entry into the trigger volume (`!asset.isActivated`)
    if (asset.isActivated) {
      return asset;
    }

    anyChanged = true;
    const eventType: InvisibleTriggerEventType = asset.triggerEventType || 'sound_ambience';
    const nextCount = (asset.triggeredCount || 0) + 1;
    const customNote = (asset.triggerPayload || asset.inspectText || '').trim();

    let message = `⚡ In-Game Event Triggered: "${asset.name}"`;
    let sanityDelta = 0;
    let soundPresetId = asset.soundPresetId || 'sfx_hotel_ambience_loop';

    if (eventType === 'sound_ambience') {
      message = customNote || `🔊 Invisible Trigger [${asset.name}]: Distant timber creaks and muffled whispers echo through the walls.`;
      soundPresetId = asset.soundPresetId || 'sfx_hotel_ambience_loop';
    } else if (eventType === 'open_secret_passage') {
      message = customNote || `🗝️ Invisible Trigger [${asset.name}]: A concealed mortise latch clicks—a nearby secret passage shifts open!`;
      soundPresetId = asset.soundPresetId || 'sfx_door_creak';
      if (asset.triggerTargetId) {
        secretDoorsToOpen.add(asset.triggerTargetId);
      } else {
        // Find nearest secret passage or door on the same floor
        const nearestPassage = safeAssets.find(
          (a) =>
            a.floor === currentFloor &&
            a.id !== asset.id &&
            (a.isSecretPassage || a.category === 'secret_wall' || a.category === 'door')
        );
        if (nearestPassage) {
          secretDoorsToOpen.add(nearestPassage.id);
        }
      }
    } else if (eventType === 'sanity_shock') {
      sanityDelta = -8;
      message = customNote || `🌀 Invisible Trigger [${asset.name}]: A sudden 33Hz sub-vault pressure wave chills the corridor (Sanity -8).`;
      soundPresetId = asset.soundPresetId || 'sfx_tape_recorder';
    } else if (eventType === 'lights_flicker') {
      message = customNote || `💡 Invisible Trigger [${asset.name}]: Fluorescent ballast tubes sputter and dip across ${currentFloor.toUpperCase()}!`;
      soundPresetId = asset.soundPresetId || 'sfx_door_latch';
    } else if (eventType === 'npc_anomaly') {
      message = customNote || `👁️ Invisible Trigger [${asset.name}]: Footsteps hurry behind the wainscoting as a tenant shifts schedule!`;
      soundPresetId = asset.soundPresetId || 'sfx_footstep_wood';
    } else if (eventType === 'clue_reveal') {
      sanityDelta = 4;
      message = customNote || `🔍 Invisible Trigger [${asset.name}]: You notice a concealed architectural anomaly here (+4 Sanity).`;
      soundPresetId = asset.soundPresetId || 'sfx_clue_discover';
    }

    const updatedTrigger: PlacedAsset = {
      ...asset,
      isInvisibleTrigger: true,
      isActivated: true,
      hasTriggered: true,
      triggeredCount: nextCount,
      interactionStateLabel: `TRIGGERED (#${nextCount})`
    };

    activatedTriggers.push(updatedTrigger);
    eventsFired.push({
      triggerId: asset.id,
      triggerName: asset.name,
      eventType,
      message,
      soundPresetId,
      targetAssetId: asset.triggerTargetId,
      sanityDelta
    });

    return updatedTrigger;
  });

  if (!anyChanged && secretDoorsToOpen.size === 0) {
    return {
      activatedTriggers: [],
      firedTriggers: [],
      updatedAssets: [...safeAssets],
      eventsFired: [],
      triggeredEvents: [],
      bannerMessage: ''
    };
  }

  const hasLightsFlickerEvent = eventsFired.some((e) => e.eventType === 'lights_flicker');
  const finalAssets =
    secretDoorsToOpen.size > 0 || hasLightsFlickerEvent
      ? firstPassAssets.map((a) => {
          if (secretDoorsToOpen.has(a.id)) {
            return { ...initiateAssetHingeToggle(a, Date.now()), isOpen: true };
          }
          if (
            hasLightsFlickerEvent &&
            a.floor === currentFloor &&
            !isInvisibleTriggerAsset(a) &&
            (a.category === 'lighting' ||
              Boolean(a.isLightEmitting) ||
              /lamp|sconce|chandelier|light|exit_sign|crt|tv|terminal/i.test(
                `${a.name} ${a.subType}`
              ))
          ) {
            return {
              ...a,
              isActivated: true,
              isLightEmitting: true,
              customAnimationFps: a.customAnimationFps || 6,
              customFlickerFps: a.customFlickerFps || 6
            };
          }
          return a;
        })
      : firstPassAssets;

  return {
    activatedTriggers,
    firedTriggers: activatedTriggers,
    updatedAssets: finalAssets,
    eventsFired,
    triggeredEvents: eventsFired,
    bannerMessage: eventsFired[0]?.message || ''
  };
}

/**
 * Determines whether an asset or blueprint is marked as 'unkempt' or 'aged'
 * for the horror/thriller subtle flicker animation effect.
 */
export function isUnkemptOrAgedAsset(
  asset: Partial<PlacedAsset> | SearchableBlueprintLike | null | undefined
): boolean {
  if (!asset) return false;
  const cond = (asset as Partial<PlacedAsset>).conditionVariant;
  if (cond === 'unkempt') return true;
  if (cond === 'pristine' || cond === 'updated') {
    // Only return true if explicitly tagged 'aged' or 'unkempt'
    const explicitTags = (asset.tags || []).map((t) => t.toLowerCase());
    if (explicitTags.includes('unkempt') || explicitTags.includes('aged')) {
      return true;
    }
    return false;
  }

  const sub = (asset.subType || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  const desc = (
    (asset as Partial<PlacedAsset>).inspectText ||
    (asset as SearchableBlueprintLike).description ||
    ''
  ).toLowerCase();
  const tags = (asset.tags || []).map((t) => t.toLowerCase());

  if (
    sub.includes('unkempt') ||
    sub.includes('aged') ||
    tags.includes('unkempt') ||
    tags.includes('aged') ||
    name.includes('unkempt') ||
    name.includes('aged') ||
    desc.includes('unkempt') ||
    desc.includes('aged')
  ) {
    return true;
  }

  return false;
}

/**
 * Computes the CSS animation properties for the subtle 'flicker' effect on 'unkempt' or 'aged'
 * assets, keyed directly to the global animation FPS state (`globalAnimationFps`).
 */
export function computeUnkemptFlickerCssSpec(
  globalFps: number,
  assetSeed = 'default'
): {
  isFlickering: boolean;
  fps: number;
  steps: number;
  stepCount: number;
  durationSec: number;
  delaySec: number;
  animationDurationSec: string;
  animationDelaySec: string;
  className: string;
  styleVars: Record<string, string>;
} {
  const safeFps = Math.max(0, Math.min(60, Math.round(globalFps || 0)));
  if (safeFps <= 0) {
    return {
      isFlickering: false,
      fps: 0,
      steps: 1,
      stepCount: 1,
      durationSec: 0,
      delaySec: 0,
      animationDurationSec: '0s',
      animationDelaySec: '0s',
      className: '',
      styleVars: {
        '--global-anim-fps': '0',
        '--flicker-steps': '1',
        '--flicker-duration': '0s',
        '--flicker-delay': '0s'
      }
    };
  }

  // Deterministic phase offset from assetSeed so multiple unkempt items don't flicker in unison
  let hash = 0;
  for (let i = 0; i < assetSeed.length; i++) {
    hash = (hash * 31 + assetSeed.charCodeAt(i)) >>> 0;
  }

  // Cycle duration and discrete step count both scale with globalFps
  const cycleSeconds = Number(Math.max(0.8, Math.min(3.2, 16 / safeFps)).toFixed(2));
  const steps = Math.max(4, Math.round(safeFps * 2));
  const delaySec = Number(((hash % 17) * 0.11).toFixed(2));
  const animationDurationSec = `${cycleSeconds}s`;
  const animationDelaySec = `-${delaySec}s`;

  return {
    isFlickering: true,
    fps: safeFps,
    steps,
    stepCount: steps,
    durationSec: cycleSeconds,
    delaySec,
    animationDurationSec,
    animationDelaySec,
    className: 'unkempt-aged-flicker',
    styleVars: {
      '--global-anim-fps': String(safeFps),
      '--flicker-steps': String(steps),
      '--flicker-duration': animationDurationSec,
      '--flicker-delay': animationDelaySec
    }
  };
}

/**
 * Samples the subtle horror/thriller 3D flicker intensity at a given continuous time (seconds),
 * quantized to discrete frames at `globalFps` so 3D meshes and lights of 'unkempt' / 'aged' assets
 * step in lockstep with the global animation FPS state.
 */
export function sampleUnkemptFlickerIntensity(
  timeSec: number,
  globalFps: number,
  assetSeed = 'default'
): {
  steppedTimeSec: number;
  stepIndex: number;
  intensityMultiplier: number;
  brightnessMultiplier: number;
  emissiveMultiplier: number;
  opacityMultiplier: number;
  opacity: number;
  isFlickerDip: boolean;
  isDip: boolean;
} {
  const safeFps = Math.max(1, Math.min(60, Math.round(globalFps || DEFAULT_GLOBAL_ANIMATION_FPS)));
  const stepIndex = Math.floor(Math.max(0, timeSec) * safeFps);
  const steppedTimeSec = stepIndex / safeFps;

  let seedHash = 2166136261;
  for (let i = 0; i < assetSeed.length; i++) {
    seedHash ^= assetSeed.charCodeAt(i);
    seedHash = Math.imul(seedHash, 16777619) >>> 0;
  }

  // Deterministic pseudo-random wave per quantized frame step
  const phase = (stepIndex + (seedHash % 97)) * 0.6180339887;
  const waveA = Math.sin(phase * 2.3);
  const waveB = Math.cos(phase * 5.7 + (seedHash % 13));
  const combined = waveA * 0.6 + waveB * 0.4;

  // Subtle horror micro-dip on ~15% of quantized steps
  const isFlickerDip = combined < -0.58;
  const rawIntensity = isFlickerDip
    ? Number((0.82 + (combined + 1) * 0.08).toFixed(3))
    : Number((0.94 + combined * 0.05).toFixed(3));
  const rawEmissive = isFlickerDip ? 0.62 : Number((0.92 + combined * 0.08).toFixed(3));
  const rawOpacity = isFlickerDip ? 0.88 : Number((0.96 + combined * 0.03).toFixed(3));

  const intensityMultiplier = Math.max(0.8, Math.min(1.05, rawIntensity));
  const emissiveMultiplier = Math.max(0.55, Math.min(1.1, rawEmissive));
  const opacityMultiplier = Math.max(0.84, Math.min(1.0, rawOpacity));

  return {
    steppedTimeSec,
    stepIndex,
    intensityMultiplier,
    brightnessMultiplier: intensityMultiplier,
    emissiveMultiplier,
    opacityMultiplier,
    opacity: opacityMultiplier,
    isFlickerDip,
    isDip: isFlickerDip
  };
}

/**
 * Computes a synchronized pulse or flicker animation for light-emitting assets (lamps, TVs, glowing screens)
 * keyed directly to the globalAnimationFps variable for consistent frame-stepped rendering.
 */
export function sampleLightEmittingPulseIntensity(
  timeSec: number,
  globalFps: number,
  assetSeed = 'default'
): {
  steppedTimeSec: number;
  stepIndex: number;
  pulseMultiplier: number;
  lightIntensityMultiplier: number;
  emissiveIntensityMultiplier: number;
} {
  const safeFps = Math.max(1, Math.min(60, Math.round(globalFps || DEFAULT_GLOBAL_ANIMATION_FPS)));
  const stepIndex = Math.floor(Math.max(0, timeSec) * safeFps);
  const steppedTimeSec = stepIndex / safeFps;

  let seedHash = 2166136261;
  for (let i = 0; i < assetSeed.length; i++) {
    seedHash ^= assetSeed.charCodeAt(i);
    seedHash = Math.imul(seedHash, 16777619) >>> 0;
  }

  // Smooth pulse wave combined with subtle frame-stepped flicker
  const phase = (steppedTimeSec * 3.14159 * 2.0) + ((seedHash % 99) * 0.1);
  const sinePulse = 0.9 + Math.sin(phase * 1.8) * 0.1;
  const flickerNoise = Math.sin(stepIndex * 2.1 + (seedHash % 31)) * 0.035;
  const combined = Math.max(0.75, Math.min(1.25, sinePulse + flickerNoise));

  return {
    steppedTimeSec,
    stepIndex,
    pulseMultiplier: combined,
    lightIntensityMultiplier: combined,
    emissiveIntensityMultiplier: combined
  };
}

/**
 * Returns true if the given asset is a Television / CRT TV / VCR combo unit.
 */
export function isTvOrCrtScreenAsset(
  asset: Partial<PlacedAsset> | SearchableBlueprintLike | null | undefined
): boolean {
  if (!asset) return false;
  const sub = (asset.subType || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  const tags = (asset.tags || []).map((t) => t.toLowerCase());

  if (
    sub.includes('television') ||
    sub.includes('crt_tv') ||
    sub.includes('tv_crt') ||
    sub === 'tv' ||
    sub.includes('_tv_') ||
    sub.endsWith('_tv') ||
    name.includes('television') ||
    name.includes('crt tv') ||
    name.includes('hotel tv') ||
    tags.includes('tv') ||
    tags.includes('television')
  ) {
    return true;
  }
  return false;
}

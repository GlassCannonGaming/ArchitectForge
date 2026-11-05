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

export type InteractiveAssetKind =
  | 'tv_screen'
  | 'computer_monitor'
  | 'lamp_light'
  | 'audio_device'
  | 'appliance'
  | 'plumbing_fixture'
  | 'door_passage'
  | 'general_prop';

export interface AssetInteractionVisualState {
  isInteractive: boolean;
  interactionKind: InteractiveAssetKind;
  isActivated: boolean;
  screenState: 'white_on' | 'amber_on' | 'off' | 'none';
  screenColorHex: string;
  screenEmissiveHex: string;
  screenEmissiveIntensity: number;
  emissiveIntensity: number;
  emitsLight: boolean;
  isLightEmitting: boolean;
  lightColorHex: string;
  lightIntensity: number;
  lightDistance: number;
  statusLabel: string;
  statusSummary: string;
  actionPromptLabel: string;
}

/**
 * Computes the visual & lighting state of an asset based on its interaction state (`isActivated` / `isOpen`).
 * Specifically, interacting with a TV turns its screen a bright white "on" (`#ffffff` + white static glow).
 */
export function computeAssetInteractionVisualState(
  asset: Partial<PlacedAsset> | null | undefined
): AssetInteractionVisualState {
  if (!asset) {
    return {
      isInteractive: false,
      interactionKind: 'general_prop',
      isActivated: false,
      screenState: 'none',
      screenColorHex: '#18221c',
      screenEmissiveHex: '#000000',
      screenEmissiveIntensity: 0,
      emissiveIntensity: 0,
      emitsLight: false,
      isLightEmitting: false,
      lightColorHex: '#ffffff',
      lightIntensity: 0,
      lightDistance: 0,
      statusLabel: 'IDLE',
      statusSummary: 'IDLE',
      actionPromptLabel: 'Interact [E]'
    };
  }

  const sub = (asset.subType || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  const cat = asset.category;
  const isActivated = Boolean(asset.isActivated);
  const presetMatch = asset.lightingPreset
    ? LIGHTING_PRESETS.find((p) => p.id === asset.lightingPreset)
    : undefined;
  const hasExplicitLightConfig =
    Boolean(asset.lightingPreset) ||
    typeof asset.emissionIntensity === 'number' ||
    typeof asset.lightIntensity === 'number';
  const intensityScale = Math.max(
    0.1,
    Math.min(3.0, Number(asset.emissionIntensity ?? asset.lightIntensity ?? presetMatch?.intensity ?? 1.0))
  );
  const customPresetColor = presetMatch
    ? presetMatch.color
    : hasExplicitLightConfig &&
      asset.color &&
      asset.color !== '#592820' &&
      asset.color !== '#3d2817' &&
      asset.color !== '#18221c'
    ? asset.color
    : undefined;

  if (asset.isSecretPassage || cat === 'door' || cat === 'secret_wall') {
    const isOpen = Boolean(asset.isOpen);
    const statusLabel = isOpen ? 'OPEN' : 'CLOSED';
    return {
      isInteractive: true,
      interactionKind: 'door_passage',
      isActivated: isOpen,
      screenState: 'none',
      screenColorHex: asset.color || '#3b2314',
      screenEmissiveHex: '#000000',
      screenEmissiveIntensity: 0,
      emissiveIntensity: 0,
      emitsLight: false,
      isLightEmitting: false,
      lightColorHex: '#f59e0b',
      lightIntensity: 0,
      lightDistance: 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isOpen ? 'Close Hinge [E]' : 'Open Hinge [E]'
    };
  }

  // 1. Television / CRT TV: Interacting turns the screen a glowing white "on" state (or custom preset glow)!
  if (isTvOrCrtScreenAsset(asset)) {
    const activeOrPreset = isActivated || hasExplicitLightConfig;
    const baseEmissive = isActivated ? 1.45 : hasExplicitLightConfig ? 0.85 : 0.06;
    const screenEmissiveIntensity = Number((baseEmissive * intensityScale).toFixed(2));
    const lightIntensity = activeOrPreset ? Number(((isActivated ? 1.35 : 0.9) * intensityScale).toFixed(2)) : 0;
    const activeGlowColor = isActivated ? (customPresetColor || '#ffffff') : (customPresetColor || '#4d8a68');
    const statusLabel = isActivated ? 'ON · WHITE SCREEN' : 'OFF · SCREEN DARK';
    return {
      isInteractive: true,
      interactionKind: 'tv_screen',
      isActivated,
      screenState: isActivated ? 'white_on' : 'off',
      screenColorHex: isActivated ? (customPresetColor || '#ffffff') : '#18221c',
      screenEmissiveHex: isActivated ? activeGlowColor : (customPresetColor || '#0a120d'),
      screenEmissiveIntensity,
      emissiveIntensity: screenEmissiveIntensity,
      emitsLight: lightIntensity > 0,
      isLightEmitting: lightIntensity > 0 || Boolean(asset.isLightEmitting),
      lightColorHex: activeGlowColor,
      lightIntensity,
      lightDistance: activeOrPreset ? 5.5 : 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isActivated ? '📺 Turn TV OFF [E]' : '📺 Turn TV ON (White Screen) [E]'
    };
  }

  // 2. Computer / Terminal / Video Game Console
  if (
    sub.includes('computer') ||
    sub.includes('terminal') ||
    sub.includes('monitor') ||
    sub.includes('console') ||
    name.includes('terminal') ||
    name.includes('computer') ||
    name.includes('console')
  ) {
    const activeOrPreset = isActivated || hasExplicitLightConfig;
    const baseEmissive = isActivated ? 1.15 : hasExplicitLightConfig ? 0.75 : 0.08;
    const screenEmissiveIntensity = Number((baseEmissive * intensityScale).toFixed(2));
    const lightIntensity = activeOrPreset ? Number(((isActivated ? 0.95 : 0.68) * intensityScale).toFixed(2)) : 0;
    const activeGlowColor = customPresetColor || '#e2e8f0';
    const statusLabel = isActivated ? 'POWERED ON' : 'STANDBY OFF';
    return {
      isInteractive: true,
      interactionKind: 'computer_monitor',
      isActivated,
      screenState: isActivated ? 'white_on' : 'off',
      screenColorHex: isActivated ? (customPresetColor || '#f8fafc') : '#1f2e23',
      screenEmissiveHex: isActivated ? activeGlowColor : (customPresetColor || '#0f172a'),
      screenEmissiveIntensity,
      emissiveIntensity: screenEmissiveIntensity,
      emitsLight: lightIntensity > 0,
      isLightEmitting: lightIntensity > 0 || Boolean(asset.isLightEmitting),
      lightColorHex: activeGlowColor,
      lightIntensity,
      lightDistance: activeOrPreset ? 4.2 : 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isActivated ? 'Power OFF [E]' : 'Power ON [E]'
    };
  }

  // 3. Lamps / Sconces / Ceiling Fixtures / Exit Signs
  if (
    cat === 'lighting' ||
    sub.includes('lamp') ||
    sub.includes('sconce') ||
    sub.includes('fixture') ||
    sub.includes('chandelier') ||
    sub.includes('exit_sign') ||
    sub.includes('flashlight')
  ) {
    const activeOrPreset = isActivated || hasExplicitLightConfig || Boolean(asset.isLightEmitting);
    const baseEmissive = isActivated ? 1.25 : activeOrPreset ? 0.85 : 0.05;
    const screenEmissiveIntensity = Number((baseEmissive * intensityScale).toFixed(2));
    const lightIntensity = activeOrPreset ? Number(((isActivated ? 1.4 : 1.12) * intensityScale).toFixed(2)) : 0;
    const activeGlowColor = customPresetColor || '#fde68a';
    const statusLabel = isActivated ? 'ILLUMINATED ON' : 'SWITCHED OFF';
    return {
      isInteractive: true,
      interactionKind: 'lamp_light',
      isActivated,
      screenState: 'none',
      screenColorHex: isActivated ? (customPresetColor || '#fef3c7') : '#574c3d',
      screenEmissiveHex: activeOrPreset ? (customPresetColor || '#fbbf24') : '#1c1917',
      screenEmissiveIntensity,
      emissiveIntensity: screenEmissiveIntensity,
      emitsLight: lightIntensity > 0,
      isLightEmitting: true,
      lightColorHex: activeGlowColor,
      lightIntensity,
      lightDistance: activeOrPreset ? 6.5 : 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isActivated ? '💡 Switch Light OFF [E]' : '💡 Switch Light ON [E]'
    };
  }

  // 4. Audio / Radio / Dictaphone / Record Player / Telephone / Intercom / Alarm Clock
  if (
    sub.includes('radio') ||
    sub.includes('record_player') ||
    sub.includes('phonograph') ||
    sub.includes('cassette') ||
    sub.includes('dictaphone') ||
    sub.includes('phone') ||
    sub.includes('intercom') ||
    sub.includes('alarm_clock')
  ) {
    const screenEmissiveIntensity = isActivated ? Number((0.85 * intensityScale).toFixed(2)) : 0;
    const lightIntensity = isActivated ? Number((0.55 * intensityScale).toFixed(2)) : 0;
    const statusLabel = isActivated ? 'ACTIVE · TRANSMITTING' : 'IDLE · SILENT';
    return {
      isInteractive: true,
      interactionKind: 'audio_device',
      isActivated,
      screenState: 'none',
      screenColorHex: isActivated ? (customPresetColor || '#fef08a') : asset.color || '#5e4c2e',
      screenEmissiveHex: isActivated ? (customPresetColor || '#f59e0b') : '#000000',
      screenEmissiveIntensity,
      emissiveIntensity: screenEmissiveIntensity,
      emitsLight: lightIntensity > 0,
      isLightEmitting: lightIntensity > 0 || Boolean(asset.isLightEmitting),
      lightColorHex: customPresetColor || '#f59e0b',
      lightIntensity,
      lightDistance: isActivated ? 2.8 : 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isActivated ? '📻 Stop / Mute [E]' : '📻 Activate Device [E]'
    };
  }

  // 5. Bathroom & Kitchen Plumbing (Sink, Bathtub, Shower, Toilet)
  if (
    sub.includes('sink') ||
    sub.includes('vanity') ||
    sub.includes('bathtub') ||
    sub.includes('tub') ||
    sub.includes('shower') ||
    sub.includes('toilet') ||
    sub.includes('faucet')
  ) {
    const screenEmissiveIntensity = isActivated ? Number((0.45 * intensityScale).toFixed(2)) : 0;
    const lightIntensity = isActivated ? Number((0.4 * intensityScale).toFixed(2)) : 0;
    const statusLabel = isActivated ? 'WATER RUNNING' : 'VALVE CLOSED';
    return {
      isInteractive: true,
      interactionKind: 'plumbing_fixture',
      isActivated,
      screenState: 'none',
      screenColorHex: isActivated ? '#bae6fd' : asset.color || '#877f70',
      screenEmissiveHex: isActivated ? '#38bdf8' : '#000000',
      screenEmissiveIntensity,
      emissiveIntensity: screenEmissiveIntensity,
      emitsLight: lightIntensity > 0,
      isLightEmitting: lightIntensity > 0 || Boolean(asset.isLightEmitting),
      lightColorHex: customPresetColor || '#bae6fd',
      lightIntensity,
      lightDistance: isActivated ? 2.5 : 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isActivated ? '🚰 Turn Water OFF [E]' : '🚰 Turn Water ON [E]'
    };
  }

  // 6. Kitchen & Building Appliances (Stove, Fridge, Microwave, Toaster, Coffee Maker, Radiator, AC, Washer/Dryer)
  if (
    cat === 'appliance' ||
    sub.includes('fridge') ||
    sub.includes('refrigerator') ||
    sub.includes('range') ||
    sub.includes('stove') ||
    sub.includes('oven') ||
    sub.includes('microwave') ||
    sub.includes('toaster') ||
    sub.includes('coffee') ||
    sub.includes('kettle') ||
    sub.includes('radiator') ||
    sub.includes('washer') ||
    sub.includes('dryer') ||
    sub.includes('ac') ||
    sub.includes('vending')
  ) {
    const activeOrPreset = isActivated || Boolean(asset.isLightEmitting) || hasExplicitLightConfig;
    const screenEmissiveIntensity = activeOrPreset ? Number(((isActivated ? 0.9 : 0.65) * intensityScale).toFixed(2)) : 0;
    const lightIntensity = activeOrPreset ? Number(((isActivated ? 0.85 : 0.6) * intensityScale).toFixed(2)) : 0;
    const statusLabel = isActivated ? 'RUNNING · ON' : 'OFF';
    return {
      isInteractive: true,
      interactionKind: 'appliance',
      isActivated,
      screenState: 'none',
      screenColorHex: isActivated ? (customPresetColor || '#fde68a') : asset.color || '#7d7559',
      screenEmissiveHex: activeOrPreset ? (customPresetColor || '#f97316') : '#000000',
      screenEmissiveIntensity,
      emissiveIntensity: screenEmissiveIntensity,
      emitsLight: lightIntensity > 0,
      isLightEmitting: lightIntensity > 0 || Boolean(asset.isLightEmitting),
      lightColorHex: customPresetColor || '#fdba74',
      lightIntensity,
      lightDistance: activeOrPreset ? 3.8 : 0,
      statusLabel,
      statusSummary: statusLabel,
      actionPromptLabel: isActivated ? '⚡ Turn Appliance OFF [E]' : '⚡ Turn Appliance ON [E]'
    };
  }

  const activeOrPreset = isActivated || Boolean(asset.isLightEmitting) || hasExplicitLightConfig;
  const screenEmissiveIntensity = activeOrPreset ? Number(((isActivated ? 0.35 : 0.6) * intensityScale).toFixed(2)) : 0;
  const lightIntensity = Boolean(asset.isLightEmitting) || hasExplicitLightConfig ? Number((0.8 * intensityScale).toFixed(2)) : 0;
  const statusLabel = isActivated ? 'INSPECTED · ACTIVE' : 'STANDBY';
  return {
    isInteractive: true,
    interactionKind: 'general_prop',
    isActivated,
    screenState: 'none',
    screenColorHex: isActivated ? (customPresetColor || '#fef3c7') : asset.color || '#8a8170',
    screenEmissiveHex: activeOrPreset ? (customPresetColor || '#d97706') : '#000000',
    screenEmissiveIntensity,
    emissiveIntensity: screenEmissiveIntensity,
    emitsLight: lightIntensity > 0,
    isLightEmitting: lightIntensity > 0 || Boolean(asset.isLightEmitting),
    lightColorHex: customPresetColor || '#fde68a',
    lightIntensity,
    lightDistance: lightIntensity > 0 ? 4.5 : 0,
    statusLabel,
    statusSummary: statusLabel,
    actionPromptLabel: isActivated ? 'Reset State [E]' : 'Interact [E]'
  };
}

/**
 * Pure helper that toggles an asset's interactive state (`isActivated`) when interacted with ([E] or click),
 * updating composite sub-parts (e.g., turning a TV's screen mesh bright white `#ffffff` "on") and returning
 * the updated asset + visual state + status banner message.
 */
export function toggleAssetInteractiveState(asset: PlacedAsset): {
  updatedAsset: PlacedAsset;
  visualState: AssetInteractionVisualState;
  bannerMessage: string;
  message: string;
} {
  const nextActivated = !asset.isActivated;
  const draft: PlacedAsset = {
    ...asset,
    isActivated: nextActivated
  };
  const visualState = computeAssetInteractionVisualState(draft);
  draft.interactionStateLabel = visualState.statusLabel;

  // Update compositeParts if present (e.g. phosphor_crt_screen, screen, shade, lens, coil, display)
  if (draft.compositeParts && draft.compositeParts.length > 0) {
    let matchedScreenOrBulb = false;
    draft.compositeParts = draft.compositeParts.map((part) => {
      const pid = (part.id || '').toLowerCase();
      if (
        visualState.interactionKind === 'tv_screen' &&
        (pid.includes('screen') || pid.includes('crt') || pid.includes('phosphor') || pid.includes('display'))
      ) {
        matchedScreenOrBulb = true;
        return {
          ...part,
          color: nextActivated ? '#ffffff' : '#18221c',
          emissive: nextActivated ? '#ffffff' : '#0a120d',
          roughness: nextActivated ? 0.1 : 0.28
        };
      }
      if (
        visualState.interactionKind === 'computer_monitor' &&
        (pid.includes('screen') || pid.includes('phosphor') || pid.includes('display'))
      ) {
        matchedScreenOrBulb = true;
        return {
          ...part,
          color: nextActivated ? '#f8fafc' : '#1f2e23',
          emissive: nextActivated ? '#e2e8f0' : '#0f172a'
        };
      }
      if (
        visualState.interactionKind === 'lamp_light' &&
        (pid.includes('shade') || pid.includes('bulb') || pid.includes('lens') || pid.includes('face') || pid.includes('globe'))
      ) {
        matchedScreenOrBulb = true;
        return {
          ...part,
          emissive: nextActivated ? '#fbbf24' : undefined
        };
      }
      if (
        visualState.interactionKind === 'appliance' &&
        (pid.includes('coil') || pid.includes('burner') || pid.includes('fascia') || pid.includes('display'))
      ) {
        matchedScreenOrBulb = true;
        return {
          ...part,
          emissive: nextActivated ? '#f97316' : undefined
        };
      }
      return part;
    });

    // If a TV had compositeParts without an explicit screen part, append a front white screen part
    if (visualState.interactionKind === 'tv_screen' && !matchedScreenOrBulb) {
      const [w, h, d] = draft.dimensions;
      draft.compositeParts = [
        ...draft.compositeParts,
        {
          id: 'phosphor_crt_screen',
          shape: 'box',
          offset: [0, h * 0.52, d * 0.48],
          size: [w * 0.68, h * 0.54, 0.04],
          color: nextActivated ? '#ffffff' : '#18221c',
          roughness: nextActivated ? 0.1 : 0.25,
          metalness: 0.2,
          emissive: nextActivated ? '#ffffff' : '#0a120d'
        }
      ];
    }
  }

  const bannerMessage =
    visualState.interactionKind === 'tv_screen'
      ? nextActivated
        ? `📺 Interacted [E] with "${asset.name}" — TV Screen turned white "ON" (${visualState.statusLabel})!`
        : `📺 Interacted [E] with "${asset.name}" — TV Screen turned OFF.`
      : `Interacted [E] with "${asset.name}" — State: ${visualState.statusLabel}!`;

  return {
    updatedAsset: draft,
    visualState,
    bannerMessage,
    message: bannerMessage
  };
}

export {
  ASSET_VISUAL_DESIGN_FAMILIES,
  getAssetVisualDesignVariants,
  swapAssetVisualDesign
} from '../apartmentUpdated1990sData';

/**
 * Error-handling wrapper for any UI button/select callback that interacts with `ASSET_CATALOG`
 * or individual asset variants (conditionVariant, 1978/1990s era swaps, visual design swaps).
 * Prevents UI crashes during rapid toggling or transient undefined state.
 */
export function safeExecuteCatalogOrVariantCallback<T>(
  callback: () => T,
  fallbackValue: T,
  contextLabel = 'AssetCatalogOrVariantAction',
  onErrorBanner?: (errorMessage: string) => void
): T {
  try {
    if (typeof callback !== 'function') {
      return fallbackValue;
    }
    return callback();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[SafeVariantGuard:${contextLabel}] Prevented UI crash during rapid toggle:`, detail);
    if (typeof onErrorBanner === 'function') {
      try {
        onErrorBanner(`Protected against rapid toggle error (${contextLabel}): ${detail}`);
      } catch {
        // Ignore nested banner errors
      }
    }
    return fallbackValue;
  }
}

/**
 * ============================================================================
 * HOTEL AMBIENCE & HIGH SUSPICION ROOM DETECTION SYSTEM
 * ============================================================================
 * Evaluates whether the player has entered a room containing high suspicionLevel
 * agents (e.g. >= 60%) to dynamically trigger the background loop of hotel
 * ambience (distant creaks, muffled footsteps, and faint whispering).
 */

export interface RoomSuspicionState {
  hasHighSuspicion: boolean;
  highestSuspicion: number;
  threshold: number;
  triggeringAgents: HotelAgentProfile[];
  allRoomAgents: HotelAgentProfile[];
  roomLabel: string;
  floor: FloorId;
  ambienceLoopActive: boolean;
  reason: string;
}

export function normalizeRoomString(room: string): string {
  if (!room) return '';
  return room
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates whether an agent belongs to a room based on roomNumber label match,
 * floor match, or proximity coordinates.
 */
export function isAgentInRoom(
  agent: HotelAgentProfile,
  roomLabel: string,
  floor: FloorId,
  playerPos?: [number, number, number]
): boolean {
  if (!agent || agent.role === 'helper_entity' || agent.status === 'vanished') {
    return false;
  }

  // Floor must match
  if (agent.floor !== floor) {
    return false;
  }

  const normTarget = normalizeRoomString(roomLabel);
  const normAgentRoom = normalizeRoomString(agent.roomNumber || '');

  // Direct label equality or bidirectional substring inclusion
  if (normAgentRoom && normTarget) {
    if (normAgentRoom === normTarget) return true;
    if (normTarget.includes(normAgentRoom) || normAgentRoom.includes(normTarget)) {
      return true;
    }
    // Room number digits match (e.g. '101' in 'Room 101' and 'Suite 101')
    const agentDigits = normAgentRoom.match(/\d{3}/)?.[0];
    const targetDigits = normTarget.match(/\d{3}/)?.[0];
    if (agentDigits && targetDigits && agentDigits === targetDigits) {
      return true;
    }
  }

  // Position proximity fallback if player position is provided
  if (playerPos && Array.isArray(agent.position) && agent.position.length >= 3) {
    const dist = Math.hypot(agent.position[0] - playerPos[0], agent.position[2] - playerPos[2]);
    if (dist <= 6.5) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates the suspicion level of all agents in a given room.
 * When one or more agents have suspicionLevel >= threshold, flags hasHighSuspicion: true.
 */
export function evaluateRoomSuspicionLevel(
  roomLabel: string,
  floor: FloorId,
  agents: HotelAgentProfile[],
  playerPos?: [number, number, number],
  threshold = 60
): RoomSuspicionState {
  const safeAgents = Array.isArray(agents) ? agents : [];
  const safeThreshold = Math.max(10, Math.min(100, threshold));

  const allRoomAgents = safeAgents.filter((agent) =>
    isAgentInRoom(agent, roomLabel, floor, playerPos)
  );

  const triggeringAgents = allRoomAgents
    .filter((agent) => (agent.suspicionLevel ?? 0) >= safeThreshold)
    .sort((a, b) => (b.suspicionLevel ?? 0) - (a.suspicionLevel ?? 0));

  const highestSuspicion = triggeringAgents.length > 0
    ? (triggeringAgents[0].suspicionLevel ?? 0)
    : (allRoomAgents.length > 0
        ? Math.max(...allRoomAgents.map((a) => a.suspicionLevel ?? 0))
        : 0);

  const hasHighSuspicion = triggeringAgents.length > 0;

  let reason = 'No agents present in room';
  if (allRoomAgents.length > 0) {
    if (hasHighSuspicion) {
      const names = triggeringAgents.map((a) => `${a.name} (${a.suspicionLevel}%)`).join(', ');
      reason = `High suspicion detected (${highestSuspicion}% >= ${safeThreshold}% threshold): ${names}`;
    } else {
      reason = `Room agents below threshold (${highestSuspicion}% < ${safeThreshold}%)`;
    }
  }

  return {
    hasHighSuspicion,
    highestSuspicion,
    threshold: safeThreshold,
    triggeringAgents,
    allRoomAgents,
    roomLabel,
    floor,
    ambienceLoopActive: hasHighSuspicion,
    reason
  };
}

/**
 * Procedural SFX output spec for the Hotel Paranormal Ambience loop
 * (distant timber creaks, muffled footsteps, and faint whispering).
 */
export function computeHotelAmbienceSpec(options?: {
  intensity?: number;
}): ProceduralSfxOutput {
  const intensity = Math.max(0.1, Math.min(1.0, options?.intensity ?? 0.6));
  const baseFreq = Math.round(48 + intensity * 6);
  const filterCutoff = Math.round(520 + intensity * 180);

  return {
    id: `sfx_hotel_ambience_loop_${Math.round(intensity * 100)}`,
    name: 'Hotel Ambience Loop (Creaks, Footsteps, Whispers)',
    type: 'custom',
    durationSeconds: 3.5,
    oscillatorType: 'sine',
    baseFrequency: baseFreq,
    pitchBend: 16,
    attack: 0.6,
    decay: 1.1,
    sustain: 0.75,
    release: 1.2,
    filterType: 'bandpass',
    filterCutoff,
    filterResonance: 3.4,
    noiseMix: 0.62,
    noiseColor: 'pink',
    fmRatio: 1.82,
    fmDepth: Math.round(42 * intensity),
    subOscMix: 0.52,
    distortion: 0.08,
    reverb: 0.72,
    reverbPreset: 'grand_lobby'
  };
}

export const ARCHITECTURAL_ASSET_CATEGORIES: AssetCategory[] = [
  'wall',
  'door',
  'window_wall',
  'secret_wall',
  'floor_tile'
];

export function isArchitecturalAssetCategory(category: AssetCategory): boolean {
  return ARCHITECTURAL_ASSET_CATEGORIES.includes(category);
}

/**
 * Generates or extracts the default architectural shell (walls, doors, windows, secret walls, floor tiles)
 * for a given floor layer. Restores the canonical 4-suite corridor & partition layout for residential floors
 * (including newly added floors like floor4+) and the canonical lobby/basement architecture.
 */
export function buildDefaultRoomArchitectureForFloor(
  floor: FloorId,
  initialCatalogAssets?: PlacedAsset[]
): PlacedAsset[] {
  const fromInitial = Array.isArray(initialCatalogAssets)
    ? initialCatalogAssets
        .filter((a) => a.floor === floor && isArchitecturalAssetCategory(a.category))
        .map((a) =>
          weatherAssetToLate70sStyle({
            ...a,
            position: [...a.position] as [number, number, number],
            dimensions: [...a.dimensions] as [number, number, number],
            isOpen: a.category === 'door' ? true : false,
            openProgress: a.category === 'door' ? 1 : 0,
            hingeTransitionStartMs: undefined,
            hingeTransitionFrom: undefined,
            hingeTransitionTo: undefined
          })
        )
    : [];

  if (floor === 'lobby') {
    const baseLobbyArch: PlacedAsset[] =
      fromInitial.length > 0
        ? [...fromInitial]
        : [
            weatherAssetToLate70sStyle({
              id: 'lobby_carpet_runner',
              name: 'Threadbare Oxblood Lobby Carpet',
              category: 'floor_tile',
              subType: 'floor_runner_slab',
              floor: 'lobby',
              roomNumber: 'Main Lobby',
              position: [0, 0.03, 0.5],
              dimensions: [5.5, 0.05, 9.0],
              rotationY: 0,
              color: '#4a181b',
              textureId: 'velvet_crimson',
              collidable: false
            }),
            weatherAssetToLate70sStyle({
              id: 'lobby_west_wall',
              name: 'Parlor Archway Brick Partition',
              category: 'wall',
              subType: 'brick_wall_segment',
              floor: 'lobby',
              roomNumber: 'West Parlor Lounge',
              position: [-5.5, 1.5, -1.5],
              dimensions: [4.2, 3.0, 0.35],
              rotationY: 0,
              color: '#592820',
              textureId: 'nyc_old_brick',
              collidable: true
            }),
            weatherAssetToLate70sStyle({
              id: 'secret_lobby_stair',
              name: 'Concealed Service Wainscoting',
              category: 'secret_wall',
              subType: 'secret_bookshelf_door',
              floor: 'lobby',
              roomNumber: 'Service Stairwell',
              position: [5.5, 1.45, -5.2],
              dimensions: [2.4, 2.9, 0.45],
              rotationY: 0,
              color: '#3b2314',
              textureId: 'oak_parquet',
              isSecretPassage: true,
              isOpen: false,
              collidable: true,
              inspectText:
                'A false dark-walnut key-cabinet behind the front desk concealing the chute to the Basement.'
            })
          ];
    return baseLobbyArch;
  }

  if (floor === 'basement') {
    const baseBasementArch: PlacedAsset[] =
      fromInitial.length > 0
        ? [...fromInitial]
        : [
            weatherAssetToLate70sStyle({
              id: 'secret_basement_vault',
              name: 'Brick Archway to Sub-Vault 00',
              category: 'secret_wall',
              subType: 'secret_bookshelf_door',
              floor: 'basement',
              roomNumber: 'Sub-Vault 00',
              position: [-4.5, 1.45, -2.5],
              dimensions: [2.6, 2.9, 0.45],
              rotationY: 0,
              color: '#4a2019',
              textureId: 'nyc_old_brick',
              isSecretPassage: true,
              isOpen: false,
              collidable: true
            })
          ];
    if (!baseBasementArch.some((a) => a.category === 'wall')) {
      baseBasementArch.push(
        weatherAssetToLate70sStyle({
          id: 'basement_boiler_partition_wall',
          name: 'Basement Boiler Brick Partition',
          category: 'wall',
          subType: 'brick_wall_segment',
          floor: 'basement',
          roomNumber: 'Boiler Room',
          position: [2.2, 1.5, -1.6],
          dimensions: [5.0, 3.0, 0.35],
          rotationY: 0,
          color: '#592820',
          textureId: 'nyc_old_brick',
          collidable: true
        })
      );
    }
    return baseBasementArch;
  }

  if (fromInitial.length > 0) {
    return fromInitial;
  }

  // Synthesize default 4-suite residential floor architecture for any floor (e.g., floor1, floor2, floor3, floor4+)
  const matchNum = String(floor).match(/(\d+)/);
  const floorNum = matchNum ? matchNum[1] : '1';
  const prefix = `${floorNum}0`;

  const synthesizedArch: PlacedAsset[] = [
    {
      id: `${floor}_wall_nw_s`,
      name: `Room ${prefix}1 South Wall`,
      category: 'wall',
      subType: 'interior_plaster_wall',
      floor,
      roomNumber: `Room ${prefix}1`,
      position: [-5.2, 1.5, -1.6],
      dimensions: [6.8, 3.0, 0.3],
      rotationY: 0,
      color: '#8a8170',
      textureId: 'plaster_cream',
      collidable: true
    },
    {
      id: `${floor}_wall_ne_s`,
      name: `Room ${prefix}2 South Wall`,
      category: 'wall',
      subType: 'interior_plaster_wall',
      floor,
      roomNumber: `Room ${prefix}2`,
      position: [5.2, 1.5, -1.6],
      dimensions: [6.8, 3.0, 0.3],
      rotationY: 0,
      color: '#8a8170',
      textureId: 'plaster_cream',
      collidable: true
    },
    {
      id: `${floor}_wall_sw_n`,
      name: `Room ${prefix}3 North Wall`,
      category: 'wall',
      subType: 'interior_plaster_wall',
      floor,
      roomNumber: `Room ${prefix}3`,
      position: [-5.2, 1.5, 1.6],
      dimensions: [6.8, 3.0, 0.3],
      rotationY: 0,
      color: '#8a8170',
      textureId: 'plaster_cream',
      collidable: true
    },
    {
      id: `${floor}_wall_se_n`,
      name: `Room ${prefix}4 North Wall`,
      category: 'wall',
      subType: 'interior_plaster_wall',
      floor,
      roomNumber: `Room ${prefix}4`,
      position: [5.2, 1.5, 1.6],
      dimensions: [6.8, 3.0, 0.3],
      rotationY: 0,
      color: '#8a8170',
      textureId: 'plaster_cream',
      collidable: true
    },
    {
      id: `${floor}_door_1`,
      name: `Suite ${prefix}1 Entry Door`,
      category: 'door',
      subType: 'suite_door',
      floor,
      roomNumber: `Room ${prefix}1`,
      position: [-2.6, 1.3, -1.6],
      dimensions: [1.4, 2.6, 0.32],
      rotationY: 0,
      color: '#422616',
      textureId: 'oak_parquet',
      isOpen: true,
      collidable: true,
      inspectText: `Tarnished brass plate reads: SUITE ${prefix}1.`
    },
    {
      id: `${floor}_door_2`,
      name: `Suite ${prefix}2 Entry Door`,
      category: 'door',
      subType: 'suite_door',
      floor,
      roomNumber: `Room ${prefix}2`,
      position: [2.6, 1.3, -1.6],
      dimensions: [1.4, 2.6, 0.32],
      rotationY: 0,
      color: '#422616',
      textureId: 'oak_parquet',
      isOpen: true,
      collidable: true,
      inspectText: `Tarnished brass plate reads: SUITE ${prefix}2.`
    },
    {
      id: `${floor}_door_3`,
      name: `Suite ${prefix}3 Entry Door`,
      category: 'door',
      subType: 'suite_door',
      floor,
      roomNumber: `Room ${prefix}3`,
      position: [-2.6, 1.3, 1.6],
      dimensions: [1.4, 2.6, 0.32],
      rotationY: 0,
      color: '#422616',
      textureId: 'oak_parquet',
      isOpen: true,
      collidable: true,
      inspectText: `Tarnished brass plate reads: SUITE ${prefix}3.`
    },
    {
      id: `${floor}_door_4`,
      name: `Suite ${prefix}4 Entry Door`,
      category: 'door',
      subType: 'suite_door',
      floor,
      roomNumber: `Room ${prefix}4`,
      position: [2.6, 1.3, 1.6],
      dimensions: [1.4, 2.6, 0.32],
      rotationY: 0,
      color: '#422616',
      textureId: 'oak_parquet',
      isOpen: true,
      collidable: true,
      inspectText: `Tarnished brass plate reads: SUITE ${prefix}4.`
    },
    {
      id: `${floor}_secret_n`,
      name: `Hidden Bookshelf Passage (${prefix}1 ↔ ${prefix}2)`,
      category: 'secret_wall',
      subType: 'secret_bookshelf_door',
      floor,
      roomNumber: `Room ${prefix}1`,
      position: [0, 1.45, -5.4],
      dimensions: [2.2, 2.9, 0.45],
      rotationY: Math.PI / 2,
      color: '#3b2314',
      textureId: 'oak_parquet',
      isSecretPassage: true,
      isOpen: false,
      collidable: true
    },
    {
      id: `${floor}_secret_s`,
      name: `Pivoting Brick Panel (${prefix}3 ↔ ${prefix}4)`,
      category: 'secret_wall',
      subType: 'secret_bookshelf_door',
      floor,
      roomNumber: `Room ${prefix}4`,
      position: [0, 1.45, 5.4],
      dimensions: [2.2, 2.9, 0.45],
      rotationY: Math.PI / 2,
      color: '#4a2019',
      textureId: 'nyc_old_brick',
      isSecretPassage: true,
      isOpen: false,
      collidable: true
    },
    {
      id: `${floor}_rug_center`,
      name: `Floor ${floorNum} Threadbare Corridor Runner`,
      category: 'floor_tile',
      subType: 'floor_runner_slab',
      floor,
      roomNumber: 'Corridor',
      position: [0, 0.03, 0],
      dimensions: [14.0, 0.05, 2.2],
      rotationY: 0,
      color: '#4a181b',
      textureId: 'velvet_crimson',
      collidable: false
    }
  ];

  return weatherAssetsListToLate70sStyle(synthesizedArch);
}

export interface ResetRoomResult {
  updatedAssets: PlacedAsset[];
  restoredArchitecture: PlacedAsset[];
  clearedCount: number;
  restoredCount: number;
  floor: FloorId;
  roomLabel: string;
  message: string;
}

/**
 * Pure helper for the 'Reset Room' button in UnifiedBottomDock:
 * Clears all assets currently placed in the active room/floor (furniture, appliances, props, lighting, custom objects,
 * and extra user-placed walls) and restores the default architecture (walls, doors, windows, secret passages, floor tiles).
 */
export function resetRoomToDefaultArchitecture(params: {
  allAssets: PlacedAsset[];
  currentFloor: FloorId;
  activeRoomLabel?: string | null;
  initialCatalogAssets?: PlacedAsset[];
  onlyTargetSubRoom?: boolean;
}): ResetRoomResult {
  const {
    allAssets,
    currentFloor,
    activeRoomLabel,
    initialCatalogAssets,
    onlyTargetSubRoom = false
  } = params;

  const safeAll = Array.isArray(allAssets) ? allAssets : [];
  const defaultFloorArch = buildDefaultRoomArchitectureForFloor(
    currentFloor,
    initialCatalogAssets
  );

  // If onlyTargetSubRoom is explicitly requested for a specific named room (e.g., "Room 101")
  const trimmedRoom = (activeRoomLabel || '').trim();
  const hasSpecificSubRoom =
    onlyTargetSubRoom &&
    trimmedRoom.length > 0 &&
    !trimmedRoom.includes('Layer') &&
    defaultFloorArch.some(
      (a) => (a.roomNumber || '').toLowerCase() === trimmedRoom.toLowerCase()
    );

  if (hasSpecificSubRoom) {
    const targetRoomLower = trimmedRoom.toLowerCase();
    const removedAssets = safeAll.filter(
      (a) =>
        a.floor === currentFloor &&
        (a.roomNumber || '').toLowerCase() === targetRoomLower
    );
    const remainingAssets = safeAll.filter(
      (a) =>
        !(
          a.floor === currentFloor &&
          (a.roomNumber || '').toLowerCase() === targetRoomLower
        )
    );
    const restoredArchitecture = defaultFloorArch.filter(
      (a) => (a.roomNumber || '').toLowerCase() === targetRoomLower
    );

    return {
      updatedAssets: [...remainingAssets, ...restoredArchitecture],
      restoredArchitecture,
      clearedCount: removedAssets.length,
      restoredCount: restoredArchitecture.length,
      floor: currentFloor,
      roomLabel: trimmedRoom,
      message: `🔄 Reset Room (${trimmedRoom}): Cleared ${removedAssets.length} placed asset(s) and restored ${restoredArchitecture.length} default architectural element(s).`
    };
  }

  // Standard Reset Room behavior: clears all currently placed assets on the active room/floor and restores default architecture
  const floorAssetsBefore = safeAll.filter((a) => a.floor === currentFloor);
  const nonArchitecturalOrCustomClearedCount = floorAssetsBefore.filter(
    (a) =>
      !isArchitecturalAssetCategory(a.category) ||
      a.id.startsWith('custom_') ||
      a.id.startsWith('ai3d_') ||
      a.id.startsWith('desc3d_') ||
      a.id.includes('_copy_') ||
      a.id.includes('_paste_')
  ).length;
  const clearedCount = Math.max(
    nonArchitecturalOrCustomClearedCount,
    floorAssetsBefore.length
  );

  const otherFloorsAssets = safeAll.filter((a) => a.floor !== currentFloor);
  const effectiveLabel =
    trimmedRoom && !trimmedRoom.includes('Layer')
      ? `${trimmedRoom} (${currentFloor.toUpperCase()})`
      : currentFloor.toUpperCase();

  return {
    updatedAssets: [...otherFloorsAssets, ...defaultFloorArch],
    restoredArchitecture: defaultFloorArch,
    clearedCount,
    restoredCount: defaultFloorArch.length,
    floor: currentFloor,
    roomLabel: effectiveLabel,
    message: `🔄 Reset Room (${effectiveLabel}): Cleared ${clearedCount} placed asset(s) and restored ${defaultFloorArch.length} default architectural element(s)!`
  };
}

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


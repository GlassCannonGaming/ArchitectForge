import { type AssetCategory, type AssetConditionVariant, type CompositeSubPart, type FloorId, type FloorLayer, type HotelAgentProfile, type InvisibleTriggerEventType, type PlacedAsset, type ScheduledActivityGesture } from './coreTypesAndFloors';
import { APARTMENT_1990S_HOTEL_CATALOG_BLUEPRINTS, APARTMENT_BUILDING_CATALOG_BLUEPRINTS, type EditorWorkspaceModeId, type SearchableBlueprintLike, downgradeAssetTo1978Version, getPredecessor1978Subtype, getUpdated1990sVariantSubtype, togglePlacedAssetConditionVariant, upgradeAssetTo1990sHotelVersion } from './catalogVoiceAndSets';
import { LIGHTING_PRESETS, weatherAssetToLate70sStyle, weatherAssetsListToLate70sStyle } from './buildAndPlacement';
import { type ProceduralSfxOutput, initiateAssetHingeToggle } from './lightingHingesAndAudio';
import { DEFAULT_GLOBAL_ANIMATION_FPS } from './keybindingsAndAnimation';
import { type StudioWindowId } from './roomBlueprintsAndWindows';
import { isTvOrCrtScreenAsset, isUnkemptOrAgedAsset, resolveAssetConditionVariant } from './renovationAndTriggersSystem';

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


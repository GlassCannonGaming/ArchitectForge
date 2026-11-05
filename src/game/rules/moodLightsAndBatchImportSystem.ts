import { type AssetCategory, type ClueItem, type FloorId, type HingeSwingMode, INITIAL_CLUES, INITIAL_FLOOR_LAYERS, type PlacedAsset, snapToGrid } from './coreTypesAndFloors';
import { LATE_70S_THRILLER_PALETTE, LIGHTING_PRESETS, buildProcedural3DSpecFromPrompt } from './buildAndPlacement';
import { type ArchitectForgeProjectSnapshot, verifyAiModelCompliance } from './projectAiAndInstaller';
import { DEFAULT_GLOBAL_INSTRUCTION_SET } from './scheduleAndCharacterRig';
// ============================================================================
// PROPOSAL 1: FLICKERING 60Hz FLUORESCENT & TUNGSTEN ROOM MOOD LIGHTING
// ============================================================================

export type RoomMoodLightKind = 'fluorescent_60hz' | 'tungsten_lamp' | 'crt_phosphor';

export interface MoodLightEmitterSpec {
  id: string;
  label: string;
  kind: RoomMoodLightKind;
  position: [number, number, number];
  baseColorHex: string;
  baseIntensity: number;
  distance: number;
  intensityMultiplier?: number;
  customAnimationFps?: number;
  assetId?: string;
}

export interface ComputedMoodLightFrame {
  intensity: number;
  colorHex: string;
  distance: number;
  decay: number;
  isFlickerDrop: boolean;
}

/**
 * Pure deterministic function computing per-frame intensity and color for:
 * - 60Hz failing fluorescent ballast tubes in corridors (intermittent stutter dips)
 * - Warm aged tungsten pool lights around desk/floor lamps and sconces
 * - Late-70s CRT TV / 1981 amber terminal phosphor scanline shimmer
 * Honors optional user overrides (`intensityMultiplier`, `baseColorHex`, and `effectiveFps` quantization).
 */
export function computePerRoomMoodLightState(
  timeSec: number,
  emitterId: string,
  kind: RoomMoodLightKind,
  options?: {
    intensityMultiplier?: number;
    baseColorHex?: string;
    effectiveFps?: number;
  }
): ComputedMoodLightFrame {
  let hash = 0;
  for (let i = 0; i < emitterId.length; i++) {
    hash = (hash * 31 + emitterId.charCodeAt(i)) % 997;
  }
  const phaseOffset = (hash % 100) * 0.07;
  const rawTime = Math.max(0, timeSec);
  const fps =
    options?.effectiveFps && Number.isFinite(options.effectiveFps) && options.effectiveFps > 0
      ? options.effectiveFps
      : 0;
  const quantizedTime = fps > 0 ? Math.floor(rawTime * fps) / fps : rawTime;
  const t = quantizedTime + phaseOffset;
  const mult = Math.max(0.1, Math.min(3.0, Number(options?.intensityMultiplier ?? 1.0)));
  const customColor =
    options?.baseColorHex && /^#[0-9a-f]{3,8}$/i.test(options.baseColorHex.trim())
      ? options.baseColorHex.trim()
      : undefined;

  if (kind === 'fluorescent_60hz') {
    // 60Hz mains hum modulation + intermittent failing starter ballast drop every ~4.5 seconds
    const cyclePos = t % 4.6;
    const inBallastStutter =
      (cyclePos > 1.85 && cyclePos < 1.98) ||
      (cyclePos > 2.04 && cyclePos < 2.11) ||
      (cyclePos > 4.15 && cyclePos < 4.22);
    const mainsHum = Math.sin(t * 120 * Math.PI) * 0.06;
    const rawIntensity = inBallastStutter
      ? Math.max(0.12, 0.22 + mainsHum)
      : Math.max(0.45, 0.92 + mainsHum);
    return {
      intensity: Number((rawIntensity * mult).toFixed(3)),
      colorHex: customColor || (inBallastStutter ? '#6e7868' : '#a8b89e'),
      distance: 9.5,
      decay: 1.7,
      isFlickerDrop: inBallastStutter
    };
  }

  if (kind === 'crt_phosphor') {
    const scanRipple = Math.sin(t * 24.0) * 0.05 + Math.cos(t * 7.3) * 0.04;
    const isAmber = emitterId.toLowerCase().includes('terminal') || emitterId.toLowerCase().includes('pc');
    const rawIntensity = Math.max(0.35, 0.68 + scanRipple);
    return {
      intensity: Number((rawIntensity * mult).toFixed(3)),
      colorHex: customColor || (isAmber ? '#c27d38' : '#4d8a68'),
      distance: 4.8,
      decay: 2.0,
      isFlickerDrop: false
    };
  }

  // Default: 'tungsten_lamp' — warm late-70s low-wattage incandescent pool with gentle voltage sag
  const voltageBreath = Math.sin(t * 2.4) * 0.04 + Math.sin(t * 11.5) * 0.015;
  const microSag = (t % 7.2) > 6.95 ? -0.18 : 0;
  const rawIntensity = Math.max(0.3, 1.12 + voltageBreath + microSag);
  return {
    intensity: Number((rawIntensity * mult).toFixed(3)),
    colorHex: customColor || '#d4944e',
    distance: 7.5,
    decay: 1.85,
    isFlickerDrop: microSag < 0
  };
}

/**
 * Extracts per-room mood light emitters from placed assets on the active floor,
 * plus baseline failing 60Hz corridor fluorescent tubes along the central hall.
 */
export function extractMoodLightEmittersFromAssets(
  floor: FloorId,
  assets: PlacedAsset[]
): MoodLightEmitterSpec[] {
  const emitters: MoodLightEmitterSpec[] = [
    {
      id: `corridor_fluor_${floor}_north`,
      label: 'Corridor 60Hz Fluorescent Ballast (North)',
      kind: 'fluorescent_60hz',
      position: [0, 2.75, -3.5],
      baseColorHex: '#a8b89e',
      baseIntensity: 0.92,
      distance: 9.5,
      intensityMultiplier: 1.0
    },
    {
      id: `corridor_fluor_${floor}_south`,
      label: 'Corridor 60Hz Fluorescent Ballast (South)',
      kind: 'fluorescent_60hz',
      position: [0, 2.75, 3.5],
      baseColorHex: '#a8b89e',
      baseIntensity: 0.92,
      distance: 9.5,
      intensityMultiplier: 1.0
    }
  ];

  const floorAssets = assets.filter((a) => a.floor === floor);
  for (const asset of floorAssets) {
    const lowerName = `${asset.name} ${asset.subType}`.toLowerCase();
    const isLightAsset =
      asset.category === 'lighting' ||
      Boolean(asset.isLightEmitting) ||
      lowerName.includes('lamp') ||
      lowerName.includes('sconce') ||
      lowerName.includes('chandelier') ||
      lowerName.includes('exit_sign') ||
      lowerName.includes('flashlight');
    const isScreenAsset =
      lowerName.includes('crt') ||
      lowerName.includes('tv') ||
      lowerName.includes('terminal') ||
      lowerName.includes('computer');
    const presetMatch = asset.lightingPreset
      ? LIGHTING_PRESETS.find((p) => p.id === asset.lightingPreset)
      : undefined;
    // Use preset color if selected, or custom color when lightingPreset/isLightEmitting is configured
    const customColor = presetMatch
      ? presetMatch.color
      : (asset.lightingPreset || asset.isLightEmitting || asset.category === 'lighting') &&
        asset.color &&
        asset.color !== '#592820' &&
        asset.color !== '#18221c' &&
        asset.color !== '#3d2817'
      ? asset.color
      : null;
    const intensityMultiplier = Math.max(
      0.1,
      Math.min(3.0, Number(asset.emissionIntensity ?? asset.lightIntensity ?? presetMatch?.intensity ?? 1.0))
    );
    const customFps = asset.customAnimationFps ?? asset.customFlickerFps;

    if (isLightAsset) {
      emitters.push({
        id: `mood_tungsten_${asset.id}`,
        label: `${asset.name} (Warm Tungsten Pool)`,
        kind: 'tungsten_lamp',
        position: [
          asset.position[0],
          asset.position[1] + Math.max(0.4, asset.dimensions[1] * 0.42),
          asset.position[2]
        ],
        baseColorHex: customColor || '#d4944e',
        baseIntensity: Number((1.12 * intensityMultiplier).toFixed(2)),
        distance: 7.5,
        intensityMultiplier,
        customAnimationFps: customFps,
        assetId: asset.id
      });
    } else if (isScreenAsset) {
      emitters.push({
        id: `mood_crt_${asset.id}`,
        label: `${asset.name} (Phosphor Glow)`,
        kind: 'crt_phosphor',
        position: [
          asset.position[0],
          asset.position[1] + Math.max(0.25, asset.dimensions[1] * 0.25),
          asset.position[2] + 0.35
        ],
        baseColorHex: customColor || (lowerName.includes('terminal') ? '#c27d38' : '#4d8a68'),
        baseIntensity: Number((0.68 * intensityMultiplier).toFixed(2)),
        distance: 4.8,
        intensityMultiplier,
        customAnimationFps: customFps,
        assetId: asset.id
      });
    }
  }

  return emitters.slice(0, 14);
}

// ============================================================================
// PROPOSAL 2: INTERACTIVE 1970s D-CELL FLASHLIGHT / UV INSPECTION CONE [L]
// ============================================================================

export interface FlashlightInspectionResult {
  flashlightOn: boolean;
  beamOrigin: [number, number, number];
  beamTarget: [number, number, number];
  forwardVector: [number, number, number];
  revealedAssetIds: string[];
  revealedClueIds: string[];
  activeRevealTitle: string | null;
  hiddenChalkInscription: string | null;
}

/**
 * Pure geometric cone intersection check for the Night Clerk's toggleable [L]
 * 1970s chrome D-cell / UV inspection flashlight in First-Person Walk mode.
 * Reveals hidden chalk marks, hollow brick mortar seams, and redacted notes
 * when the beam is aimed within 28 degrees and 8.5 meters of a secret wall or clue prop.
 */
export function computeFlashlightInspectionState(
  playerPos: [number, number, number],
  yaw: number,
  pitch: number,
  flashlightOn: boolean,
  floor: FloorId,
  assets: PlacedAsset[],
  clues: ClueItem[] = INITIAL_CLUES,
  maxRangeMeters = 8.5,
  coneHalfAngleDeg = 28
): FlashlightInspectionResult {
  const cosPitch = Math.cos(pitch);
  const fwdX = -Math.sin(yaw) * cosPitch;
  const fwdY = Math.sin(pitch);
  const fwdZ = -Math.cos(yaw) * cosPitch;
  const len = Math.hypot(fwdX, fwdY, fwdZ) || 1;
  const dirX = fwdX / len;
  const dirY = fwdY / len;
  const dirZ = fwdZ / len;

  const beamOrigin: [number, number, number] = [
    Number(playerPos[0].toFixed(3)),
    Number(playerPos[1].toFixed(3)),
    Number(playerPos[2].toFixed(3))
  ];
  const beamTarget: [number, number, number] = [
    Number((playerPos[0] + dirX * maxRangeMeters).toFixed(3)),
    Number((playerPos[1] + dirY * maxRangeMeters).toFixed(3)),
    Number((playerPos[2] + dirZ * maxRangeMeters).toFixed(3))
  ];

  if (!flashlightOn) {
    return {
      flashlightOn: false,
      beamOrigin,
      beamTarget,
      forwardVector: [dirX, dirY, dirZ],
      revealedAssetIds: [],
      revealedClueIds: [],
      activeRevealTitle: null,
      hiddenChalkInscription: null
    };
  }

  const cosThreshold = Math.cos((coneHalfAngleDeg * Math.PI) / 180);
  const revealedAssetIds: string[] = [];
  const revealedClueIds: string[] = [];
  let closestSecretOrClueDist = Infinity;
  let activeRevealTitle: string | null = null;
  let hiddenChalkInscription: string | null = null;

  const floorAssets = assets.filter((a) => a.floor === floor);
  for (const asset of floorAssets) {
    const isInspectableSecretOrClue =
      Boolean(asset.isSecretPassage) ||
      asset.category === 'secret_wall' ||
      asset.category === 'clue_prop' ||
      Boolean(asset.clueId) ||
      Boolean(asset.inspectText);

    if (!isInspectableSecretOrClue) continue;

    const dx = asset.position[0] - playerPos[0];
    const dy = asset.position[1] - playerPos[1];
    const dz = asset.position[2] - playerPos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= 0.05 || dist > maxRangeMeters) continue;

    // Project in horizontal/3D cone
    const dot = (dx * dirX + dy * dirY + dz * dirZ) / dist;
    if (dot >= cosThreshold) {
      revealedAssetIds.push(asset.id);
      if (asset.clueId) {
        revealedClueIds.push(asset.clueId);
      }
      if (dist < closestSecretOrClueDist) {
        closestSecretOrClueDist = dist;
        activeRevealTitle = asset.name;
        if (asset.isSecretPassage || asset.category === 'secret_wall') {
          hiddenChalkInscription =
            '🔦 BEAM REVEAL: Faint 1978 inspector chalk tally "|||-00" & scraped mortar seam — Press [E] to unlatch hidden partition!';
        } else if (asset.clueId) {
          const matchedClue = clues.find((c) => c.id === asset.clueId);
          hiddenChalkInscription = matchedClue
            ? `🔦 BEAM REVEAL [${matchedClue.title}]: ${matchedClue.description}`
            : `🔦 BEAM REVEAL: ${asset.inspectText || ' Ultraviolet ink trace detected on surface.'}`;
        } else {
          hiddenChalkInscription = `🔦 BEAM REVEAL: ${
            asset.inspectText || 'Weathered 1979 maintenance stencil & scratched room numbers.'
          }`;
        }
      }
    }
  }

  return {
    flashlightOn: true,
    beamOrigin,
    beamTarget,
    forwardVector: [dirX, dirY, dirZ],
    revealedAssetIds,
    revealedClueIds,
    activeRevealTitle,
    hiddenChalkInscription
  };
}

// ============================================================================
// DELIVERABLE 3: ASSET IMAGE DESCRIPTIONS FOLDER PARSER & PIPELINE HELPERS
// ============================================================================

export const ASSET_IMPORT_AGENT_INSTRUCTION_SET = `Text/image/3d model instruction Set          

You are an expert AI agent specializing in low-poly 3D Technical Art and Environment Design for web-based Three.js game engines. Your sole task is to take the name of a raw asset or prop, analyze its functional components, and generate a clean, production-ready 2D image prompt. This prompt will be used to generate concept art for Meshy.ai to process into a low-polygon 3D model with clean, flat shading boundaries.

You must strictly apply the structural anchoring rules and the designated aesthetic style defined below.

---

### 1. CORE PIPELINE STRUCTURE (Mandatory Enforcer)
Every prompt you generate must adhere to this exact structural template. Do not change the order of these tokens, as they isolate the asset for clean AI low-poly mesh extraction:

"[Core Subject Asset Name], low-poly game asset, isolated 3D asset style, low-polygon mesh topology silhouette, faceted planar surfaces, full view, centered, orthographic projection, no perspective distortion. Neutral flat lighting, diffuse white studio background, clean drop shadow omission. Stylized color-block texture details, weathered surface shading accents. [INSERT ENVIRONMENT AESTHETIC STYLE HERE]. Flat texture maps, optimized for low-poly 3D reconstruction."

---

### 2. AESTHETIC DIRECTIVE: LATE 70s / EARLY 80s THRILLER MYSTERY
When filling in the "[INSERT ENVIRONMENT AESTHETIC STYLE HERE]" section, you must translate the asset into a dark, unkempt, and faded thriller universe using the following parameters:
- Materials & Shapes: Mass-produced late-70s textures broken down into simple geometric planes (blocky vinyl, flat wood-grain veneer, angular laminate, blocky metal panels, flat linoleum sheets).
- Color Palette: Desaturated, sickly, muddy tones. Focus on nicotine-stained beige, harvest gold, avocado green, muddy brown, and bruised ochre.
- Decay Indicators (Keep as flat color changes, no high-frequency bumps): Flat grime stains, simple limescale discoloration patches, solid rust color streaks, painted water stain outlines, and black mold color patches.
- Asset State: Visibly askew, bent structural shapes, or jagged edges representing neglect.

---

### 3. OUTPUT SPECIFICATION
- Provide the final copy-pasteable prompt immediately.
- Do not include conversational filler, intros, or descriptions of your reasoning.
- Output only the completed prompt block based on the user's input.`;

/**
 * Strictly enforces the mandatory Core Pipeline Structure & Late 70s / Early 80s Thriller Mystery
 * Aesthetic Directive for any raw asset name and optional functional/material description.
 */
export function buildEnforcedLowPolyImagePrompt(
  assetName: string,
  rawAestheticOrDescription?: string
): string {
  const cleanName = (assetName || 'Late-70s Hotel Prop').trim().replace(/\.+$/, '');
  const trimmedRaw = (rawAestheticOrDescription || '').trim();

  // If the input already follows the exact mandatory template, return it directly
  if (
    trimmedRaw.includes('low-poly game asset, isolated 3D asset style, low-polygon mesh topology silhouette') &&
    trimmedRaw.includes('Flat texture maps, optimized for low-poly 3D reconstruction.')
  ) {
    return trimmedRaw;
  }

  const customDetails = trimmedRaw
    ? `${trimmedRaw.replace(/\.+$/, '')}, constructed from `
    : 'Constructed from ';

  const environmentAestheticStyle = `${customDetails}mass-produced late-70s textures broken down into simple geometric planes (blocky vinyl, flat wood-grain veneer, angular laminate, blocky metal panels, flat linoleum sheets) in desaturated, sickly, muddy tones of nicotine-stained beige, harvest gold, avocado green, muddy brown, and bruised ochre, with flat grime stains, simple limescale discoloration patches, solid rust color streaks, painted water stain outlines, and black mold color patches, visibly askew with bent structural shapes and jagged edges representing neglect`;

  return `${cleanName}, low-poly game asset, isolated 3D asset style, low-polygon mesh topology silhouette, faceted planar surfaces, full view, centered, orthographic projection, no perspective distortion. Neutral flat lighting, diffuse white studio background, clean drop shadow omission. Stylized color-block texture details, weathered surface shading accents. ${environmentAestheticStyle}. Flat texture maps, optimized for low-poly 3D reconstruction.`;
}

export interface ParsedAssetDescriptionEntry {
  id: string;
  name: string;
  description: string;
  descriptionPrompt: string;
  enforcedImagePrompt: string;
  categoryHint: AssetCategory;
  dimensionsHint: [number, number, number];
}

export const DEFAULT_ASSET_DESCRIPTIONS_IMPORT_FILE_CONTENT = `# Late-1970s / Early-1980s Alderney Arms Hotel — Batch Asset Image Descriptions Import File
# Place any .txt, .md, or .json file of asset names or detailed descriptions into ./ArchitectForge_Workspace/assets/image_descriptions_import/
# Pipeline: Asset Import Agent (Mandatory Low-Poly Enforcer) -> Google gemini-3.1-flash-lite-image -> Meshy.ai Image-to-3D -> Game Catalog

### 1978 Rotary Wall Payphone & Directory Shelf
Category: appliance
Dimensions: 0.85 x 1.55 x 0.55
Description: Battered coin-operated rotary payphone inside an angular walnut laminate acoustic hood with blocky metal coin return panel, dangling directory, and flat chalk tally marks

---

### 1977 Tarnished Brass Key-Drop & Room Mail Slots
Category: furniture
Dimensions: 1.4 x 1.65 x 0.45
Description: Front desk key-drop cabinet with flat wood-grain veneer, angular pigeonholes numbered 101 through 304, bruised ochre mail slots, and nicotine-stained beige ledger shelf

---

### Water-Stained 1976 Bathroom Medicine Cabinet
Category: furniture
Dimensions: 0.75 x 0.95 x 0.28
Description: Recessed apartment bathroom cabinet with blocky metal panels, askew hinged mirror door, simple limescale discoloration patches, and solid rust color streaks along the lower shelf

---

### Sub-Basement Reel-to-Reel Wiretap Recorder Cart
Category: clue_prop
Dimensions: 0.95 x 1.15 x 0.65
Description: Dual-spool magnetic tape recorder on a bent tubular steel utility cart with avocado green casing, harvest gold VU meter faceplates, and flat grime stains

---

### 1978 Investigator's Spiral Case Notebook & Brass Pen
Category: clue_prop
Dimensions: 0.45 x 0.14 x 0.55
Description: Worn oxblood leatherette spiral-bound detective notebook with nicotine-stained ruled pages, crimson ribbon marker, and tarnished brass ballpoint pen for in-game prop asset creation

---

### Handheld Microcassette Dictaphone Tape Player
Category: clue_prop
Dimensions: 0.40 x 0.16 x 0.58
Description: Late-1970s brushed aluminum and charcoal microcassette voice recorder with dual visible tape spools, analog VU meter, and mechanical piano-key buttons for in-game 3D model, animation, and sound creation

---

### 1970s Chrome D-Cell Inspection Flashlight
Category: lighting
Dimensions: 0.52 x 0.18 x 0.24
Description: Heavy ribbed chrome two-cell flashlight with knurled thumb switch, tarnished brass reflector bezel, and warm amber-tinted glass lens for in-game asset creation
`;

function inferCategoryFromDescription(name: string, desc: string): AssetCategory {
  const combined = `${name} ${desc}`.toLowerCase();
  if (combined.includes('lamp') || combined.includes('sconce') || combined.includes('fluorescent') || combined.includes('light')) {
    return 'lighting';
  }
  if (
    combined.includes('tv') ||
    combined.includes('crt') ||
    combined.includes('payphone') ||
    combined.includes('cooler') ||
    combined.includes('hotplate') ||
    combined.includes('terminal') ||
    combined.includes('radiator') ||
    combined.includes('ac')
  ) {
    return 'appliance';
  }
  if (combined.includes('clue') || combined.includes('wiretap') || combined.includes('ledger') || combined.includes('register')) {
    return 'clue_prop';
  }
  if (combined.includes('secret') || combined.includes('hidden')) {
    return 'secret_wall';
  }
  return 'furniture';
}

function parseDimensionsString(rawDim: string | undefined, fallback: [number, number, number] = [1.0, 1.25, 0.75]): [number, number, number] {
  if (!rawDim) return fallback;
  const nums = rawDim
    .split(/[x×,]/i)
    .map((s) => parseFloat(s.replace(/[^0-9.]/g, '')))
    .filter((n) => !Number.isNaN(n) && n >= 0.15 && n <= 12);
  if (nums.length === 3) {
    return [nums[0], nums[1], nums[2]];
  }
  return fallback;
}

/**
 * Pure parser that reads any `.txt`, `.md`, or `.json` file placed inside the
 * `assets/image_descriptions_import/` folder and extracts structured asset descriptions
 * plus the mandatory enforced low-poly 2D image prompt for `gemini-3.1-flash-lite-image` -> `Meshy.ai`.
 * Supports both `parseAssetDescriptionsFile(rawContent)` and `parseAssetDescriptionsFile(filename, rawContent)`.
 */
export function parseAssetDescriptionsFile(
  filenameOrContent: string,
  maybeRawContent?: string
): ParsedAssetDescriptionEntry[] {
  const rawContent =
    typeof maybeRawContent === 'string' ? maybeRawContent : filenameOrContent;
  const filename =
    typeof maybeRawContent === 'string' ? filenameOrContent : 'descriptions.txt';
  const trimmed = (rawContent || '').trim();
  if (!trimmed) return [];

  // 1. Check if content is JSON (either raw array, { items: [...] }, or saved LocalWorkspace envelope { data: ... })
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const unwrapped = parsed?.data ?? parsed?.items ?? parsed?.assets ?? parsed?.descriptions ?? parsed;
      if (typeof unwrapped === 'string') {
        return parseAssetDescriptionsFile(filename, unwrapped);
      }
      if (typeof unwrapped?.rawText === 'string') {
        return parseAssetDescriptionsFile(filename, unwrapped.rawText);
      }
      if (Array.isArray(unwrapped)) {
        return unwrapped
          .map((item, idx): ParsedAssetDescriptionEntry | null => {
            if (typeof item === 'string' && item.trim()) {
              const colonIdx = item.indexOf(':');
              const name =
                colonIdx > 0 && colonIdx < 60
                  ? item.slice(0, colonIdx).trim()
                  : `Imported 70s Asset #${idx + 1}`;
              const description = colonIdx > 0 && colonIdx < 60 ? item.slice(colonIdx + 1).trim() : item.trim();
              const enforcedImagePrompt = buildEnforcedLowPolyImagePrompt(name, description);
              return {
                id: `desc_${idx + 1}`,
                name,
                description,
                descriptionPrompt: enforcedImagePrompt,
                enforcedImagePrompt,
                categoryHint: inferCategoryFromDescription(name, description),
                dimensionsHint: [1.0, 1.25, 0.75]
              };
            }
            if (item && typeof item === 'object') {
              const name = String(item.name || item.title || `Imported 70s Asset #${idx + 1}`).trim();
              const description = String(item.description || item.prompt || item.imageDescription || name).trim();
              const enforcedImagePrompt = buildEnforcedLowPolyImagePrompt(name, description);
              const dims: [number, number, number] =
                Array.isArray(item.dimensions) && item.dimensions.length === 3
                  ? [Number(item.dimensions[0]) || 1, Number(item.dimensions[1]) || 1.2, Number(item.dimensions[2]) || 0.8]
                  : parseDimensionsString(typeof item.dimensions === 'string' ? item.dimensions : undefined);
              return {
                id: String(item.id || `desc_${idx + 1}`),
                name,
                description,
                descriptionPrompt: enforcedImagePrompt,
                enforcedImagePrompt,
                categoryHint: (item.category as AssetCategory) || inferCategoryFromDescription(name, description),
                dimensionsHint: dims
              };
            }
            return null;
          })
          .filter((x): x is ParsedAssetDescriptionEntry => x !== null);
      }
    } catch {
      // Fall through to plain-text / markdown parser
    }
  }

  // 2. Plain-text / Markdown parser: strip `#` comment lines (keep `###` headings)
  const cleanLines = trimmed
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('#') && !t.startsWith('##'));
    })
    .join('\n')
    .trim();

  if (!cleanLines) return [];

  // Split by `---` horizontal rules or `### ` headers
  const blocks = cleanLines
    .split(/(?:^\s*---+\s*$|(?=^#{2,3}\s+))/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const results: ParsedAssetDescriptionEntry[] = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    if (firstLine.startsWith('##') || lines.some((l) => /^description\s*:/i.test(l))) {
      let name = firstLine.replace(/^#{2,3}\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
      let categoryHint: AssetCategory | undefined;
      let dimensionsHint: [number, number, number] = [1.0, 1.25, 0.75];
      const descParts: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0 && (line.startsWith('##') || /^name\s*:/i.test(line))) {
          name = line.replace(/^#{2,3}\s*/, '').replace(/^name\s*:\s*/i, '').trim();
          continue;
        }
        if (/^name\s*:/i.test(line)) {
          name = line.replace(/^name\s*:\s*/i, '').trim();
        } else if (/^category\s*:/i.test(line)) {
          const rawCat = line.replace(/^category\s*:\s*/i, '').trim().toLowerCase();
          if (
            ['wall', 'secret_wall', 'floor_tile', 'door', 'window_wall', 'furniture', 'appliance', 'lighting', 'clue_prop', 'custom_ai'].includes(
              rawCat
            )
          ) {
            categoryHint = rawCat as AssetCategory;
          }
        } else if (/^dimensions\s*:/i.test(line)) {
          dimensionsHint = parseDimensionsString(line.replace(/^dimensions\s*:\s*/i, '').trim());
        } else if (/^description\s*:/i.test(line)) {
          descParts.push(line.replace(/^description\s*:\s*/i, '').trim());
        } else {
          descParts.push(line);
        }
      }

      const finalDesc = descParts.join(' ').trim() || name;
      const resolvedName = name || `Late-70s Hotel Asset #${results.length + 1}`;
      const enforcedImagePrompt = buildEnforcedLowPolyImagePrompt(resolvedName, finalDesc);
      results.push({
        id: `desc_${results.length + 1}`,
        name: resolvedName,
        description: finalDesc,
        descriptionPrompt: enforcedImagePrompt,
        enforcedImagePrompt,
        categoryHint: categoryHint || inferCategoryFromDescription(resolvedName, finalDesc),
        dimensionsHint
      });
    } else {
      for (const line of lines) {
        const stripped = line.replace(/^(?:\d+[.)]|[-*•])\s*/, '').trim();
        if (!stripped) continue;

        if (stripped.includes('|')) {
          const cols = stripped.split('|').map((c) => c.trim()).filter(Boolean);
          const name = cols[0] || `Hotel Asset #${results.length + 1}`;
          const rawCat = (cols[1] || '').toLowerCase();
          const validCat = [
            'wall',
            'secret_wall',
            'floor_tile',
            'door',
            'window_wall',
            'furniture',
            'appliance',
            'lighting',
            'clue_prop',
            'custom_ai'
          ].includes(rawCat)
            ? (rawCat as AssetCategory)
            : undefined;
          const dims = cols[2] && /\d/.test(cols[2]) ? parseDimensionsString(cols[2]) : ([1.0, 1.25, 0.75] as [number, number, number]);
          const description = cols[cols.length - 1] || name;
          const enforcedImagePrompt = buildEnforcedLowPolyImagePrompt(name, description);
          const resolvedCat = validCat || inferCategoryFromDescription(name, description);
          results.push({
            id: `desc_${results.length + 1}`,
            name,
            description,
            descriptionPrompt: enforcedImagePrompt,
            enforcedImagePrompt,
            categoryHint: resolvedCat,
            dimensionsHint: dims
          });
          continue;
        }

        const colonIdx = stripped.indexOf(':');
        const hasTitlePrefix = colonIdx > 2 && colonIdx <= 64;
        const name = hasTitlePrefix
          ? stripped.slice(0, colonIdx).trim()
          : stripped.split(/[.,;]/)[0].slice(0, 44).trim() || `Hotel Asset #${results.length + 1}`;
        const description = hasTitlePrefix ? stripped.slice(colonIdx + 1).trim() : stripped;
        const enforcedImagePrompt = buildEnforcedLowPolyImagePrompt(name, description);
        const resolvedCat = inferCategoryFromDescription(name, description);
        results.push({
          id: `desc_${results.length + 1}`,
          name,
          description,
          descriptionPrompt: enforcedImagePrompt,
          enforcedImagePrompt,
          categoryHint: resolvedCat,
          dimensionsHint: [1.0, 1.25, 0.75]
        });
      }
    }
  }

  return results;
}

/**
 * Generates a deterministic Late-70s / Early-80s orthographic low-poly concept reference image
 * (SVG data URI) adhering to the Asset Import Agent Instruction Set:
 * - Diffuse white studio background (#f8fafc)
 * - Clean drop shadow omission
 * - Centered, orthographic projection, faceted planar surfaces
 * - Desaturated late-70s color-block texture details (nicotine beige, harvest gold, avocado green, muddy brown, bruised ochre)
 */
export function generateAssetConceptSvgDataUrl(
  name: string,
  description: string,
  options?: { transparentBackground?: boolean }
): string {
  const spec = buildProcedural3DSpecFromPrompt(`${name} ${description}`);
  const primaryColor = spec.parts[0]?.color || LATE_70S_THRILLER_PALETTE.darkWalnut;
  const secondaryColor = spec.parts[1]?.color || LATE_70S_THRILLER_PALETTE.harvestOchre;
  const accentColor = spec.parts[2]?.color || LATE_70S_THRILLER_PALETTE.fadedAvocado;
  const grimeColor = LATE_70S_THRILLER_PALETTE.stainedPlaster;
  const safeTitle = (name || '70s Hotel Asset')
    .replace(/[<>&"']/g, '')
    .slice(0, 28);

  const isTransparent = Boolean(options?.transparentBackground);
  const bgRect = isTransparent
    ? `<rect width="256" height="256" fill="none" fill-opacity="0" data-alpha-matted="true"/>`
    : `<rect width="256" height="256" fill="#f8fafc"/>`;

  // Diffuse white studio background (#f8fafc) or Alpha-Matted RGBA(0,0,0,0), NO drop shadow, faceted planar orthographic low-poly silhouette
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" data-alpha-matted="${isTransparent ? 'true' : 'false'}">
    ${bgRect}
    <polygon points="128,44 194,78 190,174 128,206 66,172 62,80" fill="${primaryColor}" stroke="#27241d" stroke-width="2.5"/>
    <polygon points="128,44 194,78 128,112 62,80" fill="${secondaryColor}"/>
    <polygon points="62,80 128,112 128,206 66,172" fill="${primaryColor}"/>
    <polygon points="128,112 194,78 190,174 128,206" fill="${accentColor}"/>
    <polygon points="78,136 116,154 116,184 78,166" fill="${grimeColor}" opacity="0.65"/>
    <polygon points="142,126 176,108 174,132 142,148" fill="#592820" opacity="0.55"/>
    <rect x="20" y="220" width="216" height="22" rx="3" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>
    <text x="128" y="235" fill="#1e293b" font-family="monospace" font-size="10.5" font-weight="bold" text-anchor="middle">${safeTitle}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ============================================================================
// PROPOSAL A: AUTOMATIC STUDIO BACKGROUND ALPHA MATTING PRE-PASS (FOR MESHY.AI)
// ============================================================================

export interface AlphaMatteBufferStats {
  mattedBuffer: Uint8Array;
  width: number;
  height: number;
  transparentPixelCount: number;
  featheredPixelCount: number;
  opaquePixelCount: number;
  mattedRatio: number;
}

/**
 * Pure, deterministic chroma-distance alpha matting pre-pass on an RGBA pixel buffer.
 * Keys out near-white studio background pixels (#f8fafc / #ffffff) to RGBA(0,0,0,0)
 * and feathers boundary pixels so Meshy.ai Image-to-3D never reconstructs a background plane or plinth.
 */
export function applyStudioBackgroundAlphaMatteToRgbaBuffer(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: {
    targetBgRgb?: [number, number, number];
    tolerance?: number;
    featherBand?: number;
  }
): AlphaMatteBufferStats {
  const targetBg = options?.targetBgRgb || [248, 250, 252]; // #f8fafc diffuse white studio bg
  const tolerance = options?.tolerance ?? 24;
  const featherBand = Math.max(1, options?.featherBand ?? 16);

  const out = new Uint8Array(rgbaPixels.length);
  let transparentPixelCount = 0;
  let featheredPixelCount = 0;
  let opaquePixelCount = 0;

  for (let i = 0; i < rgbaPixels.length; i += 4) {
    const r = rgbaPixels[i];
    const g = rgbaPixels[i + 1];
    const b = rgbaPixels[i + 2];
    const a = rgbaPixels[i + 3];

    const distStudio = Math.hypot(r - targetBg[0], g - targetBg[1], b - targetBg[2]);
    const distPureWhite = Math.hypot(r - 255, g - 255, b - 255);
    const dist = Math.min(distStudio, distPureWhite);

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;

    if (a === 0 || dist <= tolerance) {
      out[i + 3] = 0;
      transparentPixelCount += 1;
    } else if (dist < tolerance + featherBand) {
      const ramp = (dist - tolerance) / featherBand;
      out[i + 3] = Math.max(1, Math.min(255, Math.round(a * ramp)));
      featheredPixelCount += 1;
    } else {
      out[i + 3] = a;
      opaquePixelCount += 1;
    }
  }

  const totalPixels = Math.max(1, Math.floor(rgbaPixels.length / 4));
  return {
    mattedBuffer: out,
    width,
    height,
    transparentPixelCount,
    featheredPixelCount,
    opaquePixelCount,
    mattedRatio: Number((transparentPixelCount / totalPixels).toFixed(4))
  };
}

export interface ConceptImageAlphaMatteResult {
  mattedImageDataUrl: string;
  alphaMatted: boolean;
  backgroundKeyHex: string;
  tolerance: number;
  featherBand: number;
}

/**
 * Strips the diffuse white studio background (#f8fafc / #ffffff) from a concept art data URI
 * before submitting to Meshy.ai Image-to-3D so Meshy reconstructs only the isolated 3D silhouette.
 */
export function applyAlphaMatteToConceptImageDataUrl(
  imageDataUrl: string,
  options?: {
    tolerance?: number;
    featherBand?: number;
  }
): ConceptImageAlphaMatteResult {
  const tolerance = options?.tolerance ?? 24;
  const featherBand = options?.featherBand ?? 16;
  const trimmed = (imageDataUrl || '').trim();

  if (trimmed.startsWith('data:image/svg+xml')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx > 0) {
      const prefix = trimmed.slice(0, commaIdx + 1);
      const rawEncoded = trimmed.slice(commaIdx + 1);
      let decodedSvg = rawEncoded;
      try {
        decodedSvg = decodeURIComponent(rawEncoded);
      } catch {
        // Already decoded or base64
      }
      const mattedSvg = decodedSvg
        .replace(
          /<rect\s+width="256"\s+height="256"\s+fill="#[fF][0-9a-fA-F]{5}"\s*\/>/g,
          '<rect width="256" height="256" fill="none" fill-opacity="0" data-alpha-matted="true"/>'
        )
        .replace(/data-alpha-matted="false"/g, 'data-alpha-matted="true"');
      return {
        mattedImageDataUrl: `${prefix}${encodeURIComponent(mattedSvg)}`,
        alphaMatted: true,
        backgroundKeyHex: '#f8fafc',
        tolerance,
        featherBand
      };
    }
  }

  return {
    mattedImageDataUrl: trimmed,
    alphaMatted: true,
    backgroundKeyHex: '#f8fafc',
    tolerance,
    featherBand
  };
}


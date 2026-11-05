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

// ============================================================================
// SMOOTH 500MS HINGE ROTATION ANIMATION & SYNCHRONIZED FOLEY (PROPOSALS 1 & 2)
// ============================================================================

export const HINGE_TRANSITION_DURATION_MS = 500;

export interface HingeSwingTransform {
  swingMode: HingeSwingMode;
  progress: number;
  easedProgress: number;
  angleRad: number;
  hingeEdgeX: number;
  slideOffsetX: number;
  panelOffsetX: number;
  panelOffsetZ: number;
  isAnimating: boolean;
}

/**
 * Pure helper that computes the smooth cubic ease-in-out hinge rotation angle (or pocket slide offset)
 * for a door or secret bookshelf passage of width `width` across `'right_hinge'`, `'left_hinge'`, or `'pocket_slide'`.
 */
export function computeHingeSwingTransform(
  width: number,
  openProgress: number,
  maxAngleRad = Math.PI / 2.4,
  isAnimating = false,
  swingMode: HingeSwingMode = 'right_hinge'
): HingeSwingTransform {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(openProgress) ? openProgress : 0));
  // Smooth cubic ease-in-out curve over [0, 1]
  const easedProgress =
    clamped < 0.5
      ? 4 * clamped * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 3) / 2;

  if (swingMode === 'pocket_slide') {
    const slideOffsetX = Number((easedProgress * width * 0.86).toFixed(4));
    return {
      swingMode,
      progress: Number(clamped.toFixed(4)),
      easedProgress: Number(easedProgress.toFixed(4)),
      angleRad: 0,
      hingeEdgeX: 0,
      slideOffsetX,
      panelOffsetX: slideOffsetX,
      panelOffsetZ: 0,
      isAnimating
    };
  }

  const sign = swingMode === 'left_hinge' ? -1 : 1;
  const angleRad = Number((sign * easedProgress * maxAngleRad).toFixed(5));
  const hingeEdgeX = Number((sign * width * 0.46).toFixed(4));
  const panelOffsetX = Number(
    (sign * (Math.abs(hingeEdgeX) * (1 - Math.cos(Math.abs(angleRad))) + width * 0.26 * easedProgress)).toFixed(4)
  );
  const panelOffsetZ = Number((- Math.abs(hingeEdgeX) * Math.sin(Math.abs(angleRad))).toFixed(4));

  return {
    swingMode,
    progress: Number(clamped.toFixed(4)),
    easedProgress: Number(easedProgress.toFixed(4)),
    angleRad,
    hingeEdgeX,
    slideOffsetX: 0,
    panelOffsetX,
    panelOffsetZ,
    isAnimating
  };
}

/**
 * Evaluates a PlacedAsset's live hinge animation state at timestamp `nowMs` over the 500ms window.
 */
export function computeAssetHingeAnimationState(
  asset: Pick<
    PlacedAsset,
    | 'dimensions'
    | 'isOpen'
    | 'openProgress'
    | 'hingeSwingMode'
    | 'hingeTransitionStartMs'
    | 'hingeTransitionFrom'
    | 'hingeTransitionTo'
    | 'hingeDurationMs'
  >,
  nowMs: number,
  maxAngleRad = Math.PI / 2.4
): HingeSwingTransform {
  const width = asset.dimensions?.[0] || 1.2;
  const targetOpen = asset.isOpen ? 1 : 0;
  const swingMode: HingeSwingMode = asset.hingeSwingMode || 'right_hinge';

  if (typeof asset.hingeTransitionStartMs === 'number' && Number.isFinite(asset.hingeTransitionStartMs)) {
    const durationMs = Math.max(1, asset.hingeDurationMs || HINGE_TRANSITION_DURATION_MS);
    const fromProgress =
      typeof asset.hingeTransitionFrom === 'number'
        ? asset.hingeTransitionFrom
        : asset.isOpen
          ? 0
          : 1;
    const toProgress =
      typeof asset.hingeTransitionTo === 'number' ? asset.hingeTransitionTo : targetOpen;
    const elapsed = Math.max(0, nowMs - asset.hingeTransitionStartMs);
    const rawT = Math.min(1, elapsed / durationMs);
    const interpolatedProgress = fromProgress + (toProgress - fromProgress) * rawT;
    return computeHingeSwingTransform(width, interpolatedProgress, maxAngleRad, rawT < 1, swingMode);
  }

  const staticProgress =
    typeof asset.openProgress === 'number' ? asset.openProgress : targetOpen;
  return computeHingeSwingTransform(width, staticProgress, maxAngleRad, false, swingMode);
}

/**
 * Pure state transition helper invoked by `handleToggleAssetOpen` to initiate a smooth
 * 500ms hinge rotation from the door/secret passage's current angle to the toggled state.
 */
export function initiateAssetHingeToggle(
  asset: PlacedAsset,
  nowMs = Date.now(),
  durationMs = HINGE_TRANSITION_DURATION_MS
): PlacedAsset {
  const currentAnim = computeAssetHingeAnimationState(asset, nowMs);
  const nextOpen = !asset.isOpen;
  return {
    ...asset,
    isOpen: nextOpen,
    openProgress: currentAnim.progress,
    hingeTransitionStartMs: nowMs,
    hingeTransitionFrom: currentAnim.progress,
    hingeTransitionTo: nextOpen ? 1 : 0,
    hingeDurationMs: durationMs
  };
}

export interface SynchronizedHingeFoleySpec {
  durationMs: number;
  swingPhaseEndSec: number;
  latchClickTimeSec: number;
  swingMode: HingeSwingMode;
  isOpening: boolean;
  isSecretPassage: boolean;
  oscillatorType: 'sawtooth' | 'triangle' | 'sine';
  sweepStartHz: number;
  sweepEndHz: number;
  filterType: 'lowpass' | 'bandpass';
  filterStartCutoffHz: number;
  filterPeakCutoffHz: number;
  latchClickFreqHz: number;
  latchClickDurationSec: number;
  descriptionLabel: string;
}

/**
 * Proposal 1: Computes the synchronized 500ms procedural Foley synthesis envelope
 * (0ms–460ms continuous creak/stone-scrape/pocket-rail sweep + 480ms brass latch-click transient).
 */
export function computeSynchronizedHingeFoleySpec(options?: {
  swingMode?: HingeSwingMode;
  isOpening?: boolean;
  isSecretPassage?: boolean;
  durationMs?: number;
}): SynchronizedHingeFoleySpec {
  const durationMs = Math.max(100, options?.durationMs ?? HINGE_TRANSITION_DURATION_MS);
  const durationSec = durationMs / 1000;
  const swingPhaseEndSec = Number((durationSec * 0.92).toFixed(3)); // 0.46s for 500ms
  const latchClickTimeSec = Number((durationSec * 0.96).toFixed(3)); // 0.48s for 500ms
  const swingMode: HingeSwingMode = options?.swingMode || 'right_hinge';
  const isOpening = options?.isOpening ?? true;
  const isSecretPassage = Boolean(options?.isSecretPassage);

  if (swingMode === 'pocket_slide') {
    return {
      durationMs,
      swingPhaseEndSec,
      latchClickTimeSec,
      swingMode,
      isOpening,
      isSecretPassage,
      oscillatorType: 'triangle',
      sweepStartHz: isOpening ? 112 : 164,
      sweepEndHz: isOpening ? 168 : 96,
      filterType: 'bandpass',
      filterStartCutoffHz: 380,
      filterPeakCutoffHz: 940,
      latchClickFreqHz: 1260,
      latchClickDurationSec: 0.045,
      descriptionLabel: `500ms Pocket-Rail Glide + 480ms Brass Stop Click`
    };
  }

  if (isSecretPassage) {
    return {
      durationMs,
      swingPhaseEndSec,
      latchClickTimeSec,
      swingMode,
      isOpening,
      isSecretPassage,
      oscillatorType: 'sawtooth',
      sweepStartHz: isOpening ? 64 : 46,
      sweepEndHz: isOpening ? 42 : 68,
      filterType: 'lowpass',
      filterStartCutoffHz: 160,
      filterPeakCutoffHz: 540,
      latchClickFreqHz: 980,
      latchClickDurationSec: 0.055,
      descriptionLabel: `500ms Secret Masonry Scrape (${swingMode}) + 480ms Mortise Latch`
    };
  }

  return {
    durationMs,
    swingPhaseEndSec,
    latchClickTimeSec,
    swingMode,
    isOpening,
    isSecretPassage,
    oscillatorType: 'sawtooth',
    sweepStartHz: isOpening ? 142 : 118,
    sweepEndHz: isOpening ? 90 : 76,
    filterType: 'bandpass',
    filterStartCutoffHz: 310,
    filterPeakCutoffHz: 790,
    latchClickFreqHz: 1420,
    latchClickDurationSec: 0.04,
    descriptionLabel: `500ms Aged Timber Hinge Creak (${swingMode}) + 480ms Brass Latch Click`
  };
}

// ============================================================================
// WALL ROW DRAG PLACEMENT CALCULATION
// ============================================================================

export interface WallRowPlacement {
  x: number;
  z: number;
  rotationY: number;
  dimensions: [number, number, number];
}

/**
 * Computes connected wall segment placements in a straight row
 * when clicking and dragging across the 128x128 lot canvas.
 * Automatically aligns to the dominant axis (X or Z) and snaps to grid.
 */
export function computeWallRowPlacements(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  wallDimensions: [number, number, number] = [3.0, 3.0, 0.35],
  gridStep = 0.5
): WallRowPlacement[] {
  const sx = snapToGrid(startX, gridStep);
  const sz = snapToGrid(startZ, gridStep);
  const ex = snapToGrid(endX, gridStep);
  const ez = snapToGrid(endZ, gridStep);

  const dx = ex - sx;
  const dz = ez - sz;
  const dist = Math.hypot(dx, dz);
  const segLength = Math.max(0.5, wallDimensions[0]);

  // If drag distance is very small (< 1.2m), return single segment at start position
  if (dist < 1.2) {
    return [
      {
        x: sx,
        z: sz,
        rotationY: 0,
        dimensions: [...wallDimensions] as [number, number, number]
      }
    ];
  }

  const isXDominant = Math.abs(dx) >= Math.abs(dz);

  if (isXDominant) {
    const totalDist = Math.abs(dx);
    const count = Math.max(1, Math.min(64, Math.round(totalDist / segLength)));
    const dir = dx >= 0 ? 1 : -1;
    const placements: WallRowPlacement[] = [];

    for (let i = 0; i < count; i++) {
      const centerX = sx + dir * (i * segLength + segLength / 2);
      placements.push({
        x: snapToGrid(centerX, gridStep),
        z: sz,
        rotationY: 0,
        dimensions: [...wallDimensions] as [number, number, number]
      });
    }
    return placements;
  } else {
    const totalDist = Math.abs(dz);
    const count = Math.max(1, Math.min(64, Math.round(totalDist / segLength)));
    const dir = dz >= 0 ? 1 : -1;
    const placements: WallRowPlacement[] = [];

    for (let i = 0; i < count; i++) {
      const centerZ = sz + dir * (i * segLength + segLength / 2);
      placements.push({
        x: sx,
        z: snapToGrid(centerZ, gridStep),
        rotationY: Math.PI / 2, // Rotate 90 deg along Z axis
        dimensions: [...wallDimensions] as [number, number, number]
      });
    }
    return placements;
  }
}

// ============================================================================
// FIRST-PERSON CAMERA CONTROLS & PAN DELTA CALCULATIONS
// ============================================================================

/**
 * Computes first-person camera translation relative to the camera's current horizontal yaw.
 * W moves forward in the view direction, S backwards, A strafes left, D strafes right,
 * Space/C move up/down.
 */
export function computeFirstPersonCameraDisplacement(
  theta: number,
  forwardInput: number,
  rightInput: number,
  upInput: number,
  moveSpeed: number
): { dx: number; dy: number; dz: number } {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Looking into the screen toward target:
  const forwardX = -sinT;
  const forwardZ = -cosT;
  const rightX = cosT;
  const rightZ = -sinT;

  const dx = (forwardX * forwardInput + rightX * rightInput) * moveSpeed;
  const dz = (forwardZ * forwardInput + rightZ * rightInput) * moveSpeed;
  const dy = upInput * moveSpeed;

  return { dx, dy, dz };
}

/**
 * Computes world-space camera pan offset from 2D pixel delta,
 * matching 1:1 screen grab motion for left-click empty space drag.
 */
export function computeCameraPanDelta(
  dxPixels: number,
  dyPixels: number,
  cameraFovDegrees: number,
  cameraDistance: number,
  viewportHeightPixels: number,
  cameraRight: [number, number, number],
  cameraUp: [number, number, number]
): { panX: number; panY: number; panZ: number } {
  const vh = Math.max(1, viewportHeightPixels);
  const fovRad = (cameraFovDegrees * Math.PI) / 180;
  const visibleHeightAtDist = 2 * cameraDistance * Math.tan(fovRad * 0.5);
  const unitsPerPixel = visibleHeightAtDist / vh;

  const panX = -cameraRight[0] * (dxPixels * unitsPerPixel) + cameraUp[0] * (dyPixels * unitsPerPixel);
  const panY = -cameraRight[1] * (dxPixels * unitsPerPixel) + cameraUp[1] * (dyPixels * unitsPerPixel);
  const panZ = -cameraRight[2] * (dxPixels * unitsPerPixel) + cameraUp[2] * (dyPixels * unitsPerPixel);

  return { panX, panY, panZ };
}

// ============================================================================
// PROCEDURAL & AI AUDIO SPEC GENERATORS (SOTA Multi-Stage DSP & Music Tracks)
// ============================================================================

export type SfxNoiseColor = 'white' | 'pink' | 'brown';
export type AcousticReverbPreset =
  | 'small_room'
  | 'tiled_bathroom'
  | 'grand_lobby'
  | 'sub_vault'
  | 'carpeted_corridor'
  | 'wooden_parlor';
export type MusicPadInstrument = 'warm_epiano' | 'vintage_pad' | 'noir_organ' | 'glass_marimba';

export interface ProceduralSfxOutput {
  id: string;
  name: string;
  type: string;
  durationSeconds: number;
  oscillatorType: 'sine' | 'square' | 'sawtooth' | 'triangle';
  baseFrequency: number;
  pitchBend: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterType: 'lowpass' | 'highpass' | 'bandpass';
  filterCutoff: number;
  filterResonance: number;
  noiseMix: number;
  noiseColor?: SfxNoiseColor;
  fmRatio?: number;
  fmDepth?: number;
  subOscMix?: number;
  distortion: number;
  reverb: number;
  reverbPreset?: AcousticReverbPreset;
}

export function buildProceduralSfxSpecFromPrompt(prompt: string): ProceduralSfxOutput {
  const p = (prompt || '').toLowerCase();
  const id = `sfx_${Date.now()}`;

  if (p.includes('vault') || p.includes('heavy') || p.includes('iron') || p.includes('metal') || p.includes('radiator')) {
    return {
      id,
      name: prompt.slice(0, 36) || 'Heavy Iron Door',
      type: 'custom',
      durationSeconds: 1.4,
      oscillatorType: 'sawtooth',
      baseFrequency: 68,
      pitchBend: -30,
      attack: 0.04,
      decay: 0.4,
      sustain: 0.5,
      release: 0.5,
      filterType: 'lowpass',
      filterCutoff: 420,
      filterResonance: 3.5,
      noiseMix: 0.35,
      noiseColor: 'brown',
      fmRatio: 1.414,
      fmDepth: 95,
      subOscMix: 0.45,
      distortion: 0.28,
      reverb: 0.5,
      reverbPreset: 'sub_vault'
    };
  }

  if (p.includes('whisper') || p.includes('ghost') || p.includes('wind') || p.includes('breeze') || p.includes('steam') || p.includes('shower')) {
    return {
      id,
      name: prompt.slice(0, 36) || 'Corridor Wind Whisper',
      type: 'custom',
      durationSeconds: 2.0,
      oscillatorType: 'sine',
      baseFrequency: 330,
      pitchBend: 120,
      attack: 0.4,
      decay: 0.6,
      sustain: 0.6,
      release: 0.6,
      filterType: 'bandpass',
      filterCutoff: 750,
      filterResonance: 4.5,
      noiseMix: 0.6,
      noiseColor: 'pink',
      fmRatio: 2.0,
      fmDepth: 25,
      subOscMix: 0.15,
      distortion: 0.05,
      reverb: 0.65,
      reverbPreset: p.includes('shower') ? 'tiled_bathroom' : 'grand_lobby'
    };
  }

  if (p.includes('bell') || p.includes('chime') || p.includes('ring') || p.includes('clock') || p.includes('elevator')) {
    return {
      id,
      name: prompt.slice(0, 36) || 'Crystalline Brass Bell',
      type: 'custom',
      durationSeconds: 1.6,
      oscillatorType: 'sine',
      baseFrequency: 1320,
      pitchBend: -10,
      attack: 0.003,
      decay: 0.4,
      sustain: 0.25,
      release: 0.9,
      filterType: 'bandpass',
      filterCutoff: 1900,
      filterResonance: 5.5,
      noiseMix: 0.04,
      noiseColor: 'white',
      fmRatio: 2.756,
      fmDepth: 240,
      subOscMix: 0.2,
      distortion: 0.0,
      reverb: 0.5,
      reverbPreset: 'grand_lobby'
    };
  }

  // Default atmospheric vintage hotel sound effect
  return {
    id,
    name: prompt.slice(0, 36) || 'Acoustic Partition Click',
    type: 'custom',
    durationSeconds: 0.85,
    oscillatorType: 'triangle',
    baseFrequency: 220,
    pitchBend: -50,
    attack: 0.02,
    decay: 0.2,
    sustain: 0.3,
    release: 0.3,
    filterType: 'lowpass',
    filterCutoff: 800,
    filterResonance: 2.5,
    noiseMix: 0.25,
    noiseColor: 'pink',
    fmRatio: 1.5,
    fmDepth: 45,
    subOscMix: 0.25,
    distortion: 0.1,
    reverb: 0.3,
    reverbPreset: 'small_room'
  };
}

/**
 * Pure chord parser that converts jazz/ambient chord symbols (e.g. "Dm7", "G7", "Bbmaj7", "A7b9")
 * into 3-4 polyphonic frequencies (Hz) around the 3rd-4th octave for warm harmonic pad synthesis.
 */
export function resolveChordVoicingFrequencies(chordSymbol: string): number[] {
  const raw = (chordSymbol || 'Dm7').trim();
  const match = raw.match(/^([A-G])(#|b)?(.*)$/);
  if (!match) {
    return [146.83, 174.61, 220.0, 261.63]; // Default Dm7
  }

  const letter = match[1];
  const accidental = match[2] || '';
  const quality = (match[3] || '').toLowerCase();

  const semitoneMap: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11
  };

  const rootSemi = semitoneMap[`${letter}${accidental}`] ?? 2;
  // Base C3 = 130.8128 Hz
  const rootFreq = 130.8128 * Math.pow(2, rootSemi / 12);

  let intervals = [0, 4, 7]; // Major triad default
  if (quality.includes('dim')) {
    intervals = [0, 3, 6, 9];
  } else if (quality.includes('m7b5') || quality.includes('ø')) {
    intervals = [0, 3, 6, 10];
  } else if (quality.includes('maj7') || quality.includes('maj9')) {
    intervals = [0, 4, 7, 11];
  } else if (quality.includes('m7') || quality.includes('min7') || quality.includes('m9')) {
    intervals = [0, 3, 7, 10];
  } else if (quality.includes('7b9')) {
    intervals = [0, 4, 7, 10, 13];
  } else if (quality.includes('7')) {
    intervals = [0, 4, 7, 10];
  } else if (quality.startsWith('m') && !quality.startsWith('maj')) {
    intervals = [0, 3, 7, 12];
  } else {
    intervals = [0, 4, 7, 12];
  }

  return intervals.map((semi) => Number((rootFreq * Math.pow(2, semi / 12)).toFixed(2)));
}

export interface ProceduralMusicOutput {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  scale: string;
  rootNote: string;
  chords: string[];
  droneFreq: number;
  reverbAmount: number;
  reverbPreset?: AcousticReverbPreset;
  padInstrument?: MusicPadInstrument;
  stereoWidth?: number;
  filterCutoff: number;
  melody: Array<{ note: string; freq: number; timeOffset: number; duration: number; velocity: number }>;
  bass: Array<{ note: string; freq: number; timeOffset: number; duration: number; velocity: number }>;
}

export function buildProceduralMusicSpecFromPrompt(prompt: string): ProceduralMusicOutput {
  const p = (prompt || '').toLowerCase();
  const id = `bgm_${Date.now()}`;

  if (p.includes('rain') || p.includes('sad') || p.includes('melancholy') || p.includes('waltz')) {
    return {
      id,
      title: prompt.slice(0, 40) || 'Rain on Casement Glass',
      mood: 'Melancholic boutique piano waltz',
      bpm: 80,
      scale: 'harmonic_minor',
      rootNote: 'A',
      chords: ['Am7', 'Dm7', 'E7b9', 'Am7'],
      droneFreq: 110.0,
      reverbAmount: 0.55,
      reverbPreset: 'grand_lobby',
      padInstrument: 'warm_epiano',
      stereoWidth: 0.75,
      filterCutoff: 780,
      melody: [
        { note: 'E4', freq: 329.63, timeOffset: 0, duration: 1.0, velocity: 0.7 },
        { note: 'A4', freq: 440.0, timeOffset: 1.0, duration: 1.0, velocity: 0.75 },
        { note: 'B4', freq: 493.88, timeOffset: 2.0, duration: 1.0, velocity: 0.8 },
        { note: 'C5', freq: 523.25, timeOffset: 3.0, duration: 1.5, velocity: 0.85 },
        { note: 'B4', freq: 493.88, timeOffset: 4.5, duration: 0.5, velocity: 0.7 },
        { note: 'A4', freq: 440.0, timeOffset: 5.0, duration: 2.0, velocity: 0.75 }
      ],
      bass: [
        { note: 'A2', freq: 110.0, timeOffset: 0, duration: 2.0, velocity: 0.8 },
        { note: 'D3', freq: 146.83, timeOffset: 2.0, duration: 2.0, velocity: 0.8 },
        { note: 'E2', freq: 82.41, timeOffset: 4.0, duration: 2.0, velocity: 0.85 },
        { note: 'A2', freq: 110.0, timeOffset: 6.0, duration: 2.0, velocity: 0.8 }
      ]
    };
  }

  if (p.includes('tense') || p.includes('vault') || p.includes('horror') || p.includes('creepy') || p.includes('basement')) {
    return {
      id,
      title: prompt.slice(0, 40) || 'Sub-Vault Frequency',
      mood: 'Suspenseful low-frequency acoustic drone',
      bpm: 54,
      scale: 'phrygian',
      rootNote: 'E',
      chords: ['Em7', 'Fmaj7', 'Dm7', 'Em7'],
      droneFreq: 41.2,
      reverbAmount: 0.7,
      reverbPreset: 'sub_vault',
      padInstrument: 'vintage_pad',
      stereoWidth: 0.85,
      filterCutoff: 520,
      melody: [
        { note: 'E3', freq: 164.81, timeOffset: 0, duration: 3.0, velocity: 0.65 },
        { note: 'F3', freq: 174.61, timeOffset: 3.0, duration: 1.0, velocity: 0.7 },
        { note: 'E3', freq: 164.81, timeOffset: 4.0, duration: 2.0, velocity: 0.6 },
        { note: 'B2', freq: 123.47, timeOffset: 6.0, duration: 2.0, velocity: 0.65 }
      ],
      bass: [
        { note: 'E2', freq: 82.41, timeOffset: 0, duration: 4.0, velocity: 0.95 },
        { note: 'F2', freq: 87.31, timeOffset: 4.0, duration: 2.0, velocity: 0.9 },
        { note: 'E2', freq: 82.41, timeOffset: 6.0, duration: 2.0, velocity: 0.95 }
      ]
    };
  }

  // Default Noir Lounge Mystery
  return {
    id,
    title: prompt.slice(0, 40) || 'Lobby Noir Theme',
    mood: 'Moody retro boutique hotel jazz',
    bpm: 72,
    scale: 'dorian',
    rootNote: 'D',
    chords: ['Dm7', 'G7', 'Bbmaj7', 'A7'],
    droneFreq: 73.42,
    reverbAmount: 0.45,
    reverbPreset: 'grand_lobby',
    padInstrument: 'warm_epiano',
    stereoWidth: 0.7,
    filterCutoff: 950,
    melody: [
      { note: 'D4', freq: 293.66, timeOffset: 0, duration: 1.5, velocity: 0.75 },
      { note: 'F4', freq: 349.23, timeOffset: 1.5, duration: 0.5, velocity: 0.7 },
      { note: 'A4', freq: 440.0, timeOffset: 2.0, duration: 1.0, velocity: 0.8 },
      { note: 'G4', freq: 392.0, timeOffset: 3.0, duration: 1.0, velocity: 0.65 },
      { note: 'F4', freq: 349.23, timeOffset: 4.0, duration: 1.5, velocity: 0.7 },
      { note: 'E4', freq: 329.63, timeOffset: 5.5, duration: 0.5, velocity: 0.6 },
      { note: 'D4', freq: 293.66, timeOffset: 6.0, duration: 2.0, velocity: 0.75 }
    ],
    bass: [
      { note: 'D2', freq: 73.42, timeOffset: 0, duration: 2.0, velocity: 0.85 },
      { note: 'G2', freq: 98.0, timeOffset: 2.0, duration: 2.0, velocity: 0.8 },
      { note: 'A#2', freq: 116.54, timeOffset: 4.0, duration: 2.0, velocity: 0.85 },
      { note: 'A2', freq: 110.0, timeOffset: 6.0, duration: 2.0, velocity: 0.8 }
    ]
  };
}

// ============================================================================
// FIREBASE BLUEPRINT VALIDATION & SANITIZATION SYNCHRONICITY
// ============================================================================

export const FIREBASE_BLUEPRINT_CONSTRAINTS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  ID_MIN_LENGTH: 1,
  ID_MAX_LENGTH: 128,
  DISPLAY_NAME_MIN_LENGTH: 1,
  DISPLAY_NAME_MAX_LENGTH: 80,
  PROJECT_NAME_MIN_LENGTH: 1,
  PROJECT_NAME_MAX_LENGTH: 120,
  PROJECT_DESC_MAX_LENGTH: 500,
  FLOOR_ID_MAX_LENGTH: 64,
  PRESET_NAME_MAX_LENGTH: 80,
  ALLOWED_AUDIO_MODEL: 'gemini-3.1-flash-lite' as const
} as const;

export function isValidFirestoreId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= FIREBASE_BLUEPRINT_CONSTRAINTS.ID_MIN_LENGTH &&
    id.length <= FIREBASE_BLUEPRINT_CONSTRAINTS.ID_MAX_LENGTH &&
    FIREBASE_BLUEPRINT_CONSTRAINTS.ID_PATTERN.test(id)
  );
}

export function sanitizeFirestoreId(rawId: string, fallbackPrefix = 'doc'): string {
  const cleaned = (rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, FIREBASE_BLUEPRINT_CONSTRAINTS.ID_MAX_LENGTH);
  if (cleaned.length >= FIREBASE_BLUEPRINT_CONSTRAINTS.ID_MIN_LENGTH && FIREBASE_BLUEPRINT_CONSTRAINTS.ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

/**
 * Recursively strips `undefined` properties so Firestore native Maps never throw on serialization.
 */
export function stripUndefinedDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return input;
}

export interface SanitizedCloudProjectFields {
  projectId: string;
  ownerId: string;
  name: string;
  description: string;
  currentFloor: string;
  gameTimeMinutes: number;
  floorsCount: number;
  assetsCount: number;
  blueprintsCount: number;
  charactersCount: number;
  workspaceState: Record<string, unknown>;
  status: 'active' | 'archived';
}

/**
 * Ensures outgoing CloudProject payloads strictly conform to `firebase-blueprint.json` volumetric and regex bounds.
 */
export function buildSanitizedCloudProjectFields(
  ownerUid: string,
  snapshot: ArchitectForgeProjectSnapshot,
  status: 'active' | 'archived' = 'active'
): SanitizedCloudProjectFields {
  const safeProjectId = sanitizeFirestoreId(snapshot.id, 'proj');
  const safeOwnerId = sanitizeFirestoreId(ownerUid, 'usr');
  const safeName = (snapshot.name || 'Untitled Hotel Project')
    .trim()
    .slice(0, FIREBASE_BLUEPRINT_CONSTRAINTS.PROJECT_NAME_MAX_LENGTH) || 'Untitled Hotel Project';
  const safeDescription = (snapshot.description || '')
    .trim()
    .slice(0, FIREBASE_BLUEPRINT_CONSTRAINTS.PROJECT_DESC_MAX_LENGTH);
  const safeFloor = (snapshot.currentFloor || 'lobby')
    .trim()
    .slice(0, FIREBASE_BLUEPRINT_CONSTRAINTS.FLOOR_ID_MAX_LENGTH) || 'lobby';
  const safeGameTime = Math.max(0, Math.min(1440, Math.round(Number(snapshot.gameTimeMinutes) || 0)));

  const floorLayers = Array.isArray(snapshot.floorLayers) ? snapshot.floorLayers.slice(0, 32) : INITIAL_FLOOR_LAYERS;
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.slice(0, 600) : [];
  const roomBlueprints = Array.isArray(snapshot.roomBlueprints) ? snapshot.roomBlueprints.slice(0, 100) : [];
  const characterRigs = Array.isArray(snapshot.characterRigs) ? snapshot.characterRigs.slice(0, 50) : [];

  const compliance = verifyAiModelCompliance();

  const workspaceState = stripUndefinedDeep({
    schemaVersion: snapshot.schemaVersion || '2.0.0',
    floorLayers,
    assets,
    roomBlueprints,
    characterRigs,
    customAppearance: snapshot.customAppearance || null,
    customStats: snapshot.customStats || null,
    customTraits: Array.isArray(snapshot.customTraits) ? snapshot.customTraits.slice(0, 12) : [],
    globalInstructionSet: (snapshot.globalInstructionSet || DEFAULT_GLOBAL_INSTRUCTION_SET).slice(0, 4000),
    settings: snapshot.settings || {
      surfaceSnapEnabled: true,
      showTPoseMannequin: false,
      showExteriorWalls: false,
      customGeneratedTexUrl: null
    },
    aiModelCompliance: {
      compliant: compliance.compliant,
      googleModelCount: compliance.googleModelCount,
      meshyModelCount: compliance.meshyModelCount
    }
  });

  return {
    projectId: safeProjectId,
    ownerId: safeOwnerId,
    name: safeName,
    description: safeDescription,
    currentFloor: safeFloor,
    gameTimeMinutes: safeGameTime,
    floorsCount: Math.max(1, Math.min(32, floorLayers.length)),
    assetsCount: Math.max(0, Math.min(5000, assets.length)),
    blueprintsCount: Math.max(0, Math.min(500, roomBlueprints.length)),
    charactersCount: Math.max(0, Math.min(200, characterRigs.length)),
    workspaceState,
    status
  };
}

/**
 * ============================================================================
 * SPATIAL FLOOR SURFACE RESOLVER & RANDOMIZED SURFACE FOOTSTEP SYNTHESIS
 * ============================================================================
 * Resolves the physical floor surface material ('carpet' | 'wood' | 'linoleum')
 * underneath any (x, z, floor) coordinate and generates randomized surface-specific
 * procedural Web Audio footstep specifications (with optional cane-ferrule taps).
 */
export type FloorSurfaceMaterial = 'carpet' | 'wood' | 'linoleum';

export function resolveFloorSurfaceMaterialAtPosition(
  x: number,
  z: number,
  floor: FloorId,
  assets: PlacedAsset[]
): FloorSurfaceMaterial {
  // 1. Check placed floor_tile / rug / runner assets on the active floor whose oriented 2D footprint contains (x, z)
  for (let i = assets.length - 1; i >= 0; i--) {
    const asset = assets[i];
    if (asset.floor !== floor) continue;
    const isFloorSurfaceAsset =
      asset.category === 'floor_tile' ||
      /carpet|rug|runner|parquet|linoleum|floor_tile/i.test(`${asset.subType} ${asset.name}`);
    if (!isFloorSurfaceAsset) continue;

    const dx = x - asset.position[0];
    const dz = z - asset.position[2];
    const cosR = Math.cos(-asset.rotationY);
    const sinR = Math.sin(-asset.rotationY);
    const localX = dx * cosR - dz * sinR;
    const localZ = dx * sinR + dz * cosR;
    const halfW = Math.max(0.4, asset.dimensions[0] * 0.5 + 0.15);
    const halfD = Math.max(0.4, asset.dimensions[2] * 0.5 + 0.15);

    if (Math.abs(localX) <= halfW && Math.abs(localZ) <= halfD) {
      const tag = `${asset.textureId} ${asset.subType} ${asset.name}`.toLowerCase();
      if (
        asset.textureId === 'velvet_crimson' ||
        /carpet|rug|runner|velvet|plush/i.test(tag)
      ) {
        return 'carpet';
      }
      if (
        asset.textureId === 'oak_parquet' ||
        /wood|parquet|oak|plank|timber|hardwood/i.test(tag)
      ) {
        return 'wood';
      }
      if (
        asset.textureId === 'checker_marble' ||
        asset.textureId === 'industrial_concrete' ||
        /linoleum|vinyl|tile|marble|checker|concrete/i.test(tag)
      ) {
        return 'linoleum';
      }
    }
  }

  // 2. Check proximity (<= 1.65m) to wet-wall kitchenette / bathroom / vending fixtures (always tiled/linoleum apron)
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (asset.floor !== floor) continue;
    if (
      /resident_kitchenette|porcelain_bathtub|marble_vanity_sink|suite_porcelain_toilet|soda_vending_machine|utility_sink/i.test(
        `${asset.subType} ${asset.name}`
      )
    ) {
      const dist = Math.hypot(x - asset.position[0], z - asset.position[2]);
      if (dist <= 1.65) {
        return 'linoleum';
      }
    }
  }

  // 3. Architectural room-zone fallback by floor & coordinates
  if (floor === 'basement') {
    return 'linoleum';
  }

  if (floor === 'lobby') {
    // Grand Lobby central crimson runner & West Parlor lounge rug
    if ((Math.abs(x) <= 2.2 && z >= -2.5 && z <= 6.5) || (x < -2.5 && Math.abs(z) <= 5.5)) {
      return 'carpet';
    }
    // East vending / luggage utility alcove
    if (x > 3.2 && z > -2.5) {
      return 'linoleum';
    }
    // Reception desk & main parquet hall
    return 'wood';
  }

  // Upper residential floors (floor1, floor2, floor3, etc.)
  // Central corridor velvet runner (x in [-1.6, 1.6])
  if (Math.abs(x) <= 1.6 && Math.abs(z) <= 6.8) {
    return 'carpet';
  }
  // En-suite bathroom & kitchenette wet-wall corners
  if (Math.abs(x) > 5.0 && Math.abs(z) > 4.0) {
    return 'linoleum';
  }
  // Suite living quarters oak parquet floorboards
  return 'wood';
}

export function computeSurfaceFootstepSpec(
  surface: FloorSurfaceMaterial,
  stepIndex = 0,
  jitterSeed = Math.random(),
  options?: { isCaneTap?: boolean; isNpc?: boolean }
): ProceduralSfxOutput & { surface: FloorSurfaceMaterial; isCaneTap: boolean } {
  const clampedSeed = Number.isFinite(jitterSeed)
    ? ((jitterSeed % 1) + 1) % 1
    : 0.5;
  // Bipolar [-1, 1] deterministic micro-variation from seed
  const bipolar = clampedSeed * 2 - 1;
  // Alternating left/right heel-toe slight pitch offset
  const lrSign = stepIndex % 2 === 0 ? -1 : 1;
  const freqMult = 1 + bipolar * 0.09 + lrSign * 0.035;
  const cutoffMult = 1 + bipolar * 0.12 - lrSign * 0.04;
  const isNpc = Boolean(options?.isNpc);
  const isCaneTap = Boolean(options?.isCaneTap);

  const stepId = `sfx_footstep_${surface}_${stepIndex}_${Math.round(clampedSeed * 1000)}`;

  if (isCaneTap) {
    // Sharp wooden cane ferrule tap for bent-spine elderly characters (e.g. Mrs. Eleanor Vance)
    const baseFreq = Math.round(290 * freqMult);
    const filterCutoff = Math.round(1420 * cutoffMult);
    return {
      id: `sfx_canetap_${surface}_${stepIndex}`,
      surface,
      isCaneTap: true,
      name: `Walking Cane Ferrule Tap (${surface})`,
      type: 'footstep',
      durationSeconds: 0.09,
      oscillatorType: 'triangle',
      baseFrequency: baseFreq,
      pitchBend: -110,
      attack: 0.002,
      decay: 0.035,
      sustain: 0.04,
      release: 0.05,
      filterType: 'bandpass',
      filterCutoff,
      filterResonance: 4.8,
      noiseMix: 0.35,
      noiseColor: 'white',
      fmRatio: 2.35,
      fmDepth: 48,
      subOscMix: 0.12,
      distortion: 0.08,
      reverb: surface === 'carpet' ? 0.12 : 0.28,
      reverbPreset: surface === 'linoleum' ? 'tiled_bathroom' : 'wooden_parlor'
    };
  }

  if (surface === 'carpet') {
    // Deep, muffled wool-runner thud with soft brown-noise fabric brush
    const baseFreq = Math.max(38, Math.round((isNpc ? 58 : 62) * freqMult));
    const filterCutoff = Math.max(140, Math.round(235 * cutoffMult));
    return {
      id: stepId,
      surface: 'carpet',
      isCaneTap: false,
      name: `Carpet Footstep #${(stepIndex % 8) + 1}`,
      type: 'footstep',
      durationSeconds: 0.14,
      oscillatorType: 'sine',
      baseFrequency: baseFreq,
      pitchBend: -28,
      attack: 0.008,
      decay: 0.055,
      sustain: 0.06,
      release: 0.07,
      filterType: 'lowpass',
      filterCutoff,
      filterResonance: 1.25,
      noiseMix: 0.58,
      noiseColor: 'brown',
      fmRatio: 1.15,
      fmDepth: 8,
      subOscMix: 0.56,
      distortion: 0.02,
      reverb: 0.09,
      reverbPreset: 'carpeted_corridor'
    };
  }

  if (surface === 'linoleum') {
    // Crisp late-70s vinyl-tile heel snap with bright slapback reflection
    const baseFreq = Math.max(85, Math.round((isNpc ? 138 : 148) * freqMult));
    const filterCutoff = Math.max(580, Math.round(1150 * cutoffMult));
    return {
      id: stepId,
      surface: 'linoleum',
      isCaneTap: false,
      name: `Linoleum Tile Footstep #${(stepIndex % 8) + 1}`,
      type: 'footstep',
      durationSeconds: 0.12,
      oscillatorType: 'triangle',
      baseFrequency: baseFreq,
      pitchBend: -68,
      attack: 0.002,
      decay: 0.042,
      sustain: 0.05,
      release: 0.07,
      filterType: 'bandpass',
      filterCutoff,
      filterResonance: 3.4,
      noiseMix: 0.66,
      noiseColor: 'white',
      fmRatio: 2.1,
      fmDepth: 36,
      subOscMix: 0.24,
      distortion: 0.12,
      reverb: 0.34,
      reverbPreset: 'tiled_bathroom'
    };
  }

  // Default: 'wood' — Hollow resonant oak parquet floorboard thump with subtle creak overtone
  const baseFreq = Math.max(55, Math.round((isNpc ? 90 : 96) * freqMult));
  const filterCutoff = Math.max(260, Math.round(460 * cutoffMult));
  const creakAccent = Math.abs(bipolar) > 0.55 ? 28 : 14;
  return {
    id: stepId,
    surface: 'wood',
    isCaneTap: false,
    name: `Wood Parquet Footstep #${(stepIndex % 8) + 1}`,
    type: 'footstep',
    durationSeconds: 0.15,
    oscillatorType: 'triangle',
    baseFrequency: baseFreq,
    pitchBend: -44,
    attack: 0.004,
    decay: 0.055,
    sustain: 0.08,
    release: 0.085,
    filterType: 'bandpass',
    filterCutoff,
    filterResonance: 2.45,
    noiseMix: 0.48,
    noiseColor: 'pink',
    fmRatio: 1.62,
    fmDepth: creakAccent,
    subOscMix: 0.44,
    distortion: 0.09,
    reverb: 0.22,
    reverbPreset: 'wooden_parlor'
  };
}

/**
 * Detects when a continuous stride / head-bob phase crosses a heel-strike boundary
 * (every PI radians = 1 half-cycle step, alternating Left and Right feet).
 */
export function didCrossStrideFootstepPhase(
  prevPhase: number,
  nextPhase: number,
  stepIntervalRad = Math.PI
): { triggered: boolean; stepIndex: number } {
  if (!Number.isFinite(prevPhase) || !Number.isFinite(nextPhase) || nextPhase <= prevPhase) {
    return { triggered: false, stepIndex: 0 };
  }
  const interval = Math.max(0.25, stepIntervalRad);
  const prevStep = Math.floor(prevPhase / interval);
  const nextStep = Math.floor(nextPhase / interval);
  if (nextStep > prevStep) {
    return { triggered: true, stepIndex: nextStep };
  }
  return { triggered: false, stepIndex: prevStep };
}


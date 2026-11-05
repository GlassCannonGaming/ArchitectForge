import { type AssetCategory, type ClueItem, type FloorId, type HingeSwingMode, INITIAL_CLUES, INITIAL_FLOOR_LAYERS, type PlacedAsset, snapToGrid } from './coreTypesAndFloors';
import { LATE_70S_THRILLER_PALETTE, LIGHTING_PRESETS, buildProcedural3DSpecFromPrompt } from './buildAndPlacement';
import { type ArchitectForgeProjectSnapshot, verifyAiModelCompliance } from './projectAiAndInstaller';
import { DEFAULT_GLOBAL_INSTRUCTION_SET } from './scheduleAndCharacterRig';
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


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

/**
 * ============================================================================
 * TOP EDITOR NAVIGATION & TITLE SECTION SPECIFICATION
 * ============================================================================
 * 1. Top 3 Editor Options: 1 · Build Mode, 2 · Create-A-Character, 3 · Sound Board
 *    (linking the Sound Creation System tools).
 * 2. Title Section: Left green circle badge, centered "ArchitectForge" with "Studio"
 *    centered underneath (no canvas size / object count text), and Right Eye button
 *    offsetting the green circle to toggle First-Person Walk mode.
 */
export type EditorWorkspaceModeId = 'architect' | 'character' | 'soundboard' | 'walkthrough';

export const TOP_EDITOR_MODE_TABS: ReadonlyArray<{
  id: 'architect' | 'character' | 'soundboard';
  label: string;
}> = [
  { id: 'architect', label: '1 · Build Mode' },
  { id: 'character', label: '2 · Create-A-Character' },
  { id: 'soundboard', label: '3 · Sound Board' }
] as const;

export const STUDIO_HEADER_BRAND_SPEC = {
  leftBadgeType: 'green_circle_emblem' as const,
  primaryTitle: 'ArchitectForge',
  centeredSubtitleUnderneath: 'Studio',
  showCanvasSizeReference: false,
  rightBadgeType: 'walkthrough_eye_button' as const,
  rightBadgeTargetMode: 'walkthrough' as const,
  showTopRightActionCluster: false as const
} as const;

export const STUDIO_AUDIO_POLICY_SPEC = {
  autoPlaySoundsInStudio: false as const,
  cameraMovementPlaysFootsteps: false as const,
  npcIdlePlaysFootsteps: false as const,
  walkthroughAutoPlaysBgm: false as const,
  soundSectionPurpose: 'assign_sounds_to_assets_and_create_new_sounds' as const
} as const;

export function assignSoundToAssetOrBlueprint<
  T extends { soundPresetId?: string; tags?: string[] }
>(target: T, soundPresetId: string | undefined): T {
  const cleanId = (soundPresetId || '').trim();
  if (!cleanId) {
    const nextTags = parseBlueprintTagsInput(target.tags).filter((t) => t !== 'audio-linked');
    const copy = { ...target, tags: nextTags };
    delete copy.soundPresetId;
    return copy;
  }
  const withTag = addTagToBlueprint(target, 'audio-linked');
  return {
    ...withTag,
    soundPresetId: cleanId
  };
}

export function getTaskbarWindowIdsForMode(mode: EditorWorkspaceModeId): StudioWindowId[] {
  if (mode === 'character') {
    return [
      'local_fs',
      'projects',
      'keybindings',
      'char_appearance',
      'char_ai',
      'layers'
    ];
  }
  if (mode === 'soundboard') {
    return ['local_fs', 'projects', 'keybindings', 'layers'];
  }
  return [
    'local_fs',
    'projects',
    'keybindings',
    'tools',
    'catalog',
    'inspector',
    'layers'
  ];
}

/**
 * ============================================================================
 * STUDIO DARK MODE UI & ARCHITECTURAL WHITE 3D CANVAS SPECIFICATION
 * ============================================================================
 * 1. Removes the small status bar under the WINDOWS taskbar ("Blank 128x128 Tile Canvas...").
 * 2. Turns the 128x128 3D viewport canvas crisp architectural white (#f8fafc / #ffffff)
 *    with subtle slate grid lines so 3D walls and furniture pop cleanly.
 * 3. Converts the Studio UI (top navigation pills, WINDOWS taskbar, and floating windows)
 *    into a dark obsidian/slate theme.
 */
export const STUDIO_DARK_UI_WHITE_CANVAS_SPEC = {
  showStatusBarUnderWindowsBar: false,
  uiTheme: 'dark' as const,
  canvasTheme: 'white' as const,
  canvasColors: {
    sceneBackgroundHex: 0xf8fafc,
    fogColorHex: 0xf8fafc,
    fogDensity: 0.0045,
    surroundGroundHex: 0xf1f5f9,
    tileBasePlaneHex: 0xffffff,
    fineGridCenterHex: 0x94a3b8,
    fineGridLineHex: 0xe2e8f0,
    majorGridCenterHex: 0x64748b,
    majorGridLineHex: 0xcbd5e1
  },
  uiColors: {
    windowBgClass: 'bg-slate-900/95',
    windowBorderClass: 'border-slate-700/90',
    windowHeaderClass: 'bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-slate-800',
    topPillClass: 'bg-slate-900/95 backdrop-blur-md border border-slate-700/90 text-slate-100'
  }
} as const;

/**
 * ============================================================================
 * IN-GAME FEATURE ITEMS AS STUDIO ASSET CREATION TEMPLATES
 * (Images -> 3D Models -> Low-Frame Animations -> Procedural Foley Sounds)
 * ============================================================================
 * Items such as the Investigator's Notebook, Microcassette Tape Player,
 * 1970s D-Cell Flashlight, Evidence Corkboard, and Master Skeleton Keyring
 * are represented purely as Studio Asset Creation Templates (for generating
 * reference images, 3D meshes, animations, and sounds to export to the game),
 * rather than embedded runtime game UI systems inside the studio.
 */
export interface InGameFeatureAssetTemplate {
  subType: string;
  name: string;
  category: AssetCategory;
  defaultDimensions: [number, number, number];
  defaultColor: string;
  defaultTexture: TexturePresetId;
  tags: string[];
  imagePromptDescription: string;
  animationSpec: string;
  soundPresetId: string;
  description: string;
}

export const IN_GAME_FEATURE_ASSET_TEMPLATES: readonly InGameFeatureAssetTemplate[] = [
  {
    subType: 'investigator_notebook_prop',
    name: "1978 Investigator's Spiral Case Notebook",
    category: 'clue_prop',
    defaultDimensions: [0.45, 0.14, 0.55],
    defaultColor: '#4a181b',
    defaultTexture: 'velvet_crimson',
    tags: ['game-item', 'investigation', 'notebook', 'clue', 'animated', 'audio-linked', 'late-70s'],
    imagePromptDescription:
      'Worn oxblood leatherette spiral-bound detective notebook with nicotine-stained ruled pages, crimson ribbon marker, and tarnished brass ballpoint pen',
    animationSpec: 'Low-frame spiral page-flip & brass pen scribble cycle (8 FPS)',
    soundPresetId: 'sfx_clue_discover',
    description:
      'In-game investigation prop asset: 1978 spiral-bound detective case folio with ruled pages and brass pen (for image, 3D model, animation & sound export).'
  },
  {
    subType: 'microcassette_player_prop',
    name: 'Handheld Microcassette Dictaphone Player',
    category: 'clue_prop',
    defaultDimensions: [0.40, 0.16, 0.58],
    defaultColor: '#242220',
    defaultTexture: 'aged_brass',
    tags: ['game-item', 'investigation', 'cassette-player', 'audio-prop', 'animated', 'audio-linked', 'late-70s'],
    imagePromptDescription:
      'Late-1970s brushed aluminum and charcoal microcassette voice recorder with dual visible tape spools, analog VU meter, and mechanical piano-key buttons',
    animationSpec: 'Low-frame dual cassette spool rotation & mechanical piano-key depress (8 FPS)',
    soundPresetId: 'sfx_tape_recorder',
    description:
      'In-game audio prop asset: handheld 1978 microcassette dictaphone player with spinning dual tape reels and piano-key buttons (for image, 3D model, animation & sound export).'
  },
  {
    subType: 'chrome_dcell_flashlight_prop',
    name: '1970s Chrome D-Cell Inspection Flashlight',
    category: 'lighting',
    defaultDimensions: [0.52, 0.18, 0.24],
    defaultColor: '#78705e',
    defaultTexture: 'aged_brass',
    tags: ['game-item', 'investigation', 'flashlight', 'lighting', 'animated', 'audio-linked', 'late-70s'],
    imagePromptDescription:
      'Heavy ribbed chrome two-cell flashlight with knurled thumb switch, tarnished brass reflector bezel, and warm amber-tinted glass lens',
    animationSpec: 'Thumb-slide switch toggle & tungsten/UV lens pulse (8 FPS)',
    soundPresetId: 'sfx_door_latch',
    description:
      'In-game lighting prop asset: ribbed chrome D-cell & UV inspection flashlight (for image, 3D model, animation & sound export).'
  },
  {
    subType: 'evidence_corkboard_prop',
    name: 'Detective Evidence Corkboard & Yarn Pinboard',
    category: 'clue_prop',
    defaultDimensions: [1.45, 1.05, 0.14],
    defaultColor: '#6e562f',
    defaultTexture: 'oak_parquet',
    tags: ['game-item', 'investigation', 'corkboard', 'wall-prop', 'clue', 'animated', 'late-70s'],
    imagePromptDescription:
      'Walnut-framed detective corkboard pinboard with pinned Polaroid photographs, yellowed index cards, brass thumbtacks, and crimson yarn links',
    animationSpec: 'Pinned Polaroid & red yarn tension sway (8 FPS)',
    soundPresetId: 'sfx_clue_discover',
    description:
      'In-game wall prop asset: walnut-framed corkboard with pinned index cards and crimson yarn threads (for image, 3D model, animation & sound export).'
  },
  {
    subType: 'master_skeleton_keyring_prop',
    name: 'Tarnished Brass Master Skeleton Keyring',
    category: 'clue_prop',
    defaultDimensions: [0.35, 0.10, 0.38],
    defaultColor: '#5e4c2e',
    defaultTexture: 'aged_brass',
    tags: ['game-item', 'investigation', 'keys', 'brass', 'animated', 'audio-linked', 'late-70s'],
    imagePromptDescription:
      'Heavy tarnished brass keyring holding numbered diamond-shaped hotel room fobs (#101-#304) and an ornate master skeleton key',
    animationSpec: 'Numbered brass room-tag & skeleton key jingle swing (8 FPS)',
    soundPresetId: 'sfx_key_turn',
    description:
      'In-game key prop asset: tarnished brass master passkey ring with stamped suite tags (for image, 3D model, animation & sound export).'
  }
] as const;

/**
 * ============================================================================
 * BLUEPRINT TAGGING & MULTI-FACETED ASSET SEARCH ENGINE
 * ============================================================================
 */

export function normalizeBlueprintTag(rawTag: string): string {
  return (rawTag || '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function parseBlueprintTagsInput(rawInput: string | readonly string[] | undefined): string[] {
  if (!rawInput) return [];
  const rawList = Array.isArray(rawInput)
    ? rawInput
    : String(rawInput).split(/[,;\n]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rawList) {
    const norm = normalizeBlueprintTag(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

export interface SearchableBlueprintLike {
  subType: string;
  name: string;
  category: AssetCategory;
  defaultDimensions: [number, number, number];
  defaultColor: string;
  defaultTexture: TexturePresetId;
  collidable: boolean;
  isSecretPassage?: boolean;
  description: string;
  isGenerated?: boolean;
  tags?: string[];
  animationSpec?: string;
  soundPresetId?: string;
  pairedVariantId?: string;
  conditionVariant?: AssetConditionVariant;
  compositeParts?: CompositeSubPart[];
  referenceImageUrl?: string;
  era?: '1970s' | '1980s' | '1990s' | 'timeless';
  canUpdateInHotel?: boolean;
  structuralConstraint?: string;
  predecessor1978Id?: string;
  paired1990sId?: string;
}

export function inferDefaultAssetBlueprintTags(bp: Partial<SearchableBlueprintLike>): string[] {
  const explicit = parseBlueprintTagsInput(bp.tags);
  const tagSet = new Set<string>(explicit);

  if (bp.conditionVariant) {
    tagSet.add(bp.conditionVariant);
  }

  const cat = bp.category;
  const sub = (bp.subType || '').toLowerCase();
  const name = (bp.name || '').toLowerCase();
  const desc = (bp.description || '').toLowerCase();
  const combined = `${sub} ${name} ${desc}`;

  if (cat) {
    tagSet.add(normalizeBlueprintTag(cat.replace(/_/g, '-')));
  }
  if (cat === 'wall' || cat === 'secret_wall' || cat === 'window_wall' || cat === 'door' || cat === 'floor_tile') {
    tagSet.add('architecture');
  }
  if (cat === 'door' || cat === 'secret_wall' || bp.isSecretPassage) {
    tagSet.add('hinged');
    tagSet.add('interactive');
  }
  if (cat === 'secret_wall' || bp.isSecretPassage || combined.includes('secret')) {
    tagSet.add('secret-passage');
  }
  if (bp.isGenerated || cat === 'custom_ai') {
    tagSet.add('ai-forged');
  }
  if (
    sub.includes('notebook') ||
    sub.includes('microcassette') ||
    sub.includes('flashlight') ||
    sub.includes('corkboard') ||
    sub.includes('keyring') ||
    cat === 'clue_prop'
  ) {
    tagSet.add('game-item');
    tagSet.add('investigation');
  }
  if (bp.animationSpec || combined.includes('animated') || combined.includes('spool') || combined.includes('page-flip')) {
    tagSet.add('animated');
  }
  if (bp.soundPresetId || combined.includes('dictaphone') || combined.includes('payphone') || combined.includes('radiator') || combined.includes('tv') || combined.includes('intercom')) {
    tagSet.add('audio-linked');
  }
  if (combined.includes('70s') || combined.includes('1978') || combined.includes('1979') || combined.includes('1981')) {
    tagSet.add('late-70s');
    tagSet.add('1970s');
  }
  if (combined.includes('apartment') || sub.startsWith('apt_')) {
    tagSet.add('apartment');
  }
  if (combined.includes('infrastructure') || sub.includes('intercom') || sub.includes('mailbox') || sub.includes('chute') || sub.includes('stairwell') || sub.includes('meter')) {
    tagSet.add('infrastructure');
  }
  if (combined.includes('brass')) tagSet.add('brass');
  if (combined.includes('walnut') || combined.includes('oak') || combined.includes('wood')) tagSet.add('wood');
  if (combined.includes('brick')) tagSet.add('brick');
  if (combined.includes('bathroom') || combined.includes('bathtub') || combined.includes('toilet') || combined.includes('vanity') || combined.includes('towel') || sub.includes('bath')) {
    tagSet.add('bathroom');
  }
  if (combined.includes('lobby') || combined.includes('registration') || combined.includes('switchboard') || combined.includes('payphone')) {
    tagSet.add('lobby');
  }
  if (combined.includes('kitchen') || sub.includes('kit_') || combined.includes('fridge') || combined.includes('stove') || combined.includes('range')) {
    tagSet.add('kitchen');
  }
  if (combined.includes('bedroom') || sub.includes('bed_') || combined.includes('dresser') || combined.includes('nightstand')) {
    tagSet.add('bedroom');
  }
  if (combined.includes('living') || sub.includes('lr_') || combined.includes('sofa') || combined.includes('couch')) {
    tagSet.add('living');
  }
  if (combined.includes('suite') || combined.includes('kitchenette') || combined.includes('trunk')) {
    tagSet.add('suite');
  }
  if (combined.includes('unkempt') || combined.includes('stained') || combined.includes('rusted') || combined.includes('weathered')) {
    tagSet.add('unkempt');
  }
  if (combined.includes('pristine')) {
    tagSet.add('pristine');
  }
  if (
    combined.includes('90s') ||
    combined.includes('1990s') ||
    combined.includes('1992') ||
    combined.includes('1995') ||
    bp.era === '1990s' ||
    sub.includes('90s')
  ) {
    tagSet.add('1990s');
    tagSet.add('hotel-updated');
    tagSet.add('1992-1995');
  }
  if (combined.includes('elevator') || sub.includes('elevator')) {
    tagSet.add('elevator');
  }
  if (
    bp.canUpdateInHotel !== true &&
    (
      bp.canUpdateInHotel === false ||
      Boolean(bp.structuralConstraint) ||
      sub.includes('stairwell') ||
      sub.includes('chute') ||
      sub === 'apt_elevator_sliding_doors' ||
      sub.includes('elevator_shaft') ||
      sub.includes('breaker_panel') ||
      cat === 'wall' ||
      cat === 'secret_wall'
    )
  ) {
    tagSet.add('structural_fixed');
    tagSet.add('structural');
  }

  return Array.from(tagSet);
}

export function addTagToBlueprint<T extends { tags?: string[] }>(
  blueprint: T,
  newTagInput: string
): T {
  const additions = parseBlueprintTagsInput(newTagInput);
  if (additions.length === 0) return blueprint;
  const existing = parseBlueprintTagsInput(blueprint.tags);
  const merged = Array.from(new Set([...existing, ...additions]));
  return {
    ...blueprint,
    tags: merged
  };
}

export function removeTagFromBlueprint<T extends { tags?: string[] }>(
  blueprint: T,
  tagToRemove: string
): T {
  const target = normalizeBlueprintTag(tagToRemove);
  const existing = parseBlueprintTagsInput(blueprint.tags);
  return {
    ...blueprint,
    tags: existing.filter((t) => t !== target)
  };
}

export function collectBlueprintTagCounts(
  blueprints: ReadonlyArray<Partial<SearchableBlueprintLike> & { tags?: string[] }>
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bp of blueprints) {
    const tags = bp.tags && bp.tags.length > 0 ? parseBlueprintTagsInput(bp.tags) : inferDefaultAssetBlueprintTags(bp);
    for (const t of tags) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));
}

export type CatalogCategoryFilter = 'all' | 'architecture' | 'furniture' | 'game_props' | 'ai';
export type CatalogCapabilityFilter =
  | 'all'
  | 'game_item'
  | 'interactive_hinged'
  | 'animated'
  | 'custom_ai';
export type CatalogSortOrder =
  | 'relevance'
  | 'name_asc'
  | 'category'
  | 'size_desc'
  | 'size_asc';

export interface CatalogSearchOptions {
  query?: string;
  categoryFilter?: CatalogCategoryFilter;
  capabilityFilter?: CatalogCapabilityFilter;
  activeTags?: string[];
  sortBy?: CatalogSortOrder;
}

/**
 * Computes a deterministic relevance score for a catalog blueprint against tokenized search terms.
 * Returns 0 if any required query token fails to match across name, tags, subType, category,
 * description, texture, or dimensions.
 */
export function scoreBlueprintSearchMatch(
  bp: SearchableBlueprintLike,
  rawQuery: string
): number {
  const trimmed = (rawQuery || '').trim().toLowerCase();
  if (!trimmed) return 1;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  const nameLower = (bp.name || '').toLowerCase();
  const nameWords = nameLower.split(/[^a-z0-9]+/).filter(Boolean);
  const subLower = (bp.subType || '').toLowerCase();
  const catLower = (bp.category || '').toLowerCase().replace(/_/g, ' ');
  const descLower = (bp.description || '').toLowerCase();
  const texLower = (bp.defaultTexture || '').toLowerCase().replace(/_/g, ' ');
  const animLower = (bp.animationSpec || '').toLowerCase();
  const tags = bp.tags && bp.tags.length > 0 ? parseBlueprintTagsInput(bp.tags) : inferDefaultAssetBlueprintTags(bp);
  const dims = bp.defaultDimensions || [1, 1, 1];
  const dimText = `${dims[0]}x${dims[1]}x${dims[2]} ${dims[0]}x${dims[1]} ${dims[0]}x${dims[2]} ${dims[0]}m ${dims[1]}m`;

  let totalScore = 0;

  for (const rawToken of tokens) {
    const isExplicitTag = rawToken.startsWith('#');
    const token = isExplicitTag ? normalizeBlueprintTag(rawToken) : rawToken;
    if (!token) continue;

    let tokenScore = 0;

    if (isExplicitTag) {
      if (tags.includes(token)) {
        tokenScore += 70;
      } else if (tags.some((t) => t.includes(token))) {
        tokenScore += 40;
      }
    } else {
      if (nameLower === token) {
        tokenScore += 80;
      } else if (nameWords.some((w) => w === token)) {
        tokenScore += 55;
      } else if (nameWords.some((w) => w.startsWith(token))) {
        tokenScore += 45;
      } else if (nameLower.includes(token)) {
        tokenScore += 32;
      }

      if (tags.includes(token)) {
        tokenScore += 50;
      } else if (tags.some((t) => t.includes(token))) {
        tokenScore += 28;
      }

      if (subLower.includes(token) || catLower.includes(token)) {
        tokenScore += 25;
      }

      if (descLower.includes(token) || animLower.includes(token)) {
        tokenScore += 14;
      }

      if (texLower.includes(token) || dimText.includes(token)) {
        tokenScore += 15;
      }
    }

    // Multi-token AND requirement: every token in the query must match at least one facet
    if (tokenScore === 0) {
      return 0;
    }
    totalScore += tokenScore;
  }

  return totalScore;
}

/**
 * Multi-faceted search, tag filter, capability filter, and sorter for the Visual Asset Catalog.
 */
export function searchAndFilterCatalogBlueprints<T extends SearchableBlueprintLike>(
  blueprints: readonly T[],
  options: CatalogSearchOptions = {}
): T[] {
  const {
    query = '',
    categoryFilter = 'all',
    capabilityFilter = 'all',
    activeTags = [],
    sortBy = 'relevance'
  } = options;

  const normalizedActiveTags = parseBlueprintTagsInput(activeTags);

  const scored: Array<{ bp: T; score: number; index: number }> = [];

  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i];
    const bpTags =
      bp.tags && bp.tags.length > 0
        ? parseBlueprintTagsInput(bp.tags)
        : inferDefaultAssetBlueprintTags(bp);

    // 1. Category Filter
    if (categoryFilter === 'architecture') {
      const isArch =
        bp.category === 'wall' ||
        bp.category === 'secret_wall' ||
        bp.category === 'window_wall' ||
        bp.category === 'door' ||
        bp.category === 'floor_tile';
      if (!isArch) continue;
    } else if (categoryFilter === 'furniture') {
      const isFurn =
        bp.category === 'furniture' ||
        bp.category === 'appliance' ||
        bp.category === 'lighting';
      if (!isFurn) continue;
    } else if (categoryFilter === 'game_props') {
      const isGameProp =
        bp.category === 'clue_prop' ||
        bpTags.includes('game-item') ||
        bpTags.includes('investigation');
      if (!isGameProp) continue;
    } else if (categoryFilter === 'ai') {
      const isAi = Boolean(bp.isGenerated || bp.category === 'custom_ai' || bpTags.includes('ai-forged'));
      if (!isAi) continue;
    }

    // 2. Capability Filter
    if (capabilityFilter === 'game_item') {
      if (!bpTags.includes('game-item') && bp.category !== 'clue_prop') continue;
    } else if (capabilityFilter === 'interactive_hinged') {
      const isHinged =
        bp.category === 'door' ||
        bp.category === 'secret_wall' ||
        Boolean(bp.isSecretPassage) ||
        bpTags.includes('hinged') ||
        bpTags.includes('interactive');
      if (!isHinged) continue;
    } else if (capabilityFilter === 'animated') {
      if (!bpTags.includes('animated') && !bp.animationSpec && bp.category !== 'door' && bp.category !== 'secret_wall') {
        continue;
      }
    } else if (capabilityFilter === 'custom_ai') {
      if (!bp.isGenerated && bp.category !== 'custom_ai') continue;
    }

    // 3. Active Tag Chips Filter (AND matching across selected tags)
    if (normalizedActiveTags.length > 0) {
      const hasAllTags = normalizedActiveTags.every((reqTag) => bpTags.includes(reqTag));
      if (!hasAllTags) continue;
    }

    // 4. Multi-token Search Query Score
    const score = scoreBlueprintSearchMatch(bp, query);
    if (score <= 0) continue;

    scored.push({ bp, score, index: i });
  }

  // 5. Sort Results
  scored.sort((a, b) => {
    if (sortBy === 'name_asc') {
      return a.bp.name.localeCompare(b.bp.name);
    }
    if (sortBy === 'category') {
      const catCmp = a.bp.category.localeCompare(b.bp.category);
      return catCmp !== 0 ? catCmp : a.bp.name.localeCompare(b.bp.name);
    }
    if (sortBy === 'size_desc' || sortBy === 'size_asc') {
      const volA =
        (a.bp.defaultDimensions[0] || 1) *
        (a.bp.defaultDimensions[1] || 1) *
        (a.bp.defaultDimensions[2] || 1);
      const volB =
        (b.bp.defaultDimensions[0] || 1) *
        (b.bp.defaultDimensions[1] || 1) *
        (b.bp.defaultDimensions[2] || 1);
      return sortBy === 'size_desc' ? volB - volA : volA - volB;
    }
    // Default: 'relevance'
    if (query.trim().length > 0 && b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  return scored.map((entry) => entry.bp);
}

export type CatalogSortMode = CatalogSortOrder;

export type RoomSizeFilterCategory = 'all' | 'compact' | 'small' | 'medium' | 'large';

/**
 * Multi-token search, tag filter, and room size filter for Room Layout Blueprints (`RoomBlueprint[]`).
 */
export function searchAndFilterRoomBlueprints(
  roomBlueprints: readonly RoomBlueprint[],
  query = '',
  activeTag: string | readonly string[] = 'all',
  roomSizeFilter: RoomSizeFilterCategory = 'all'
): RoomBlueprint[] {
  const requiredTags = Array.isArray(activeTag)
    ? parseBlueprintTagsInput(activeTag)
    : activeTag && activeTag !== 'all'
    ? [normalizeBlueprintTag(activeTag as string)]
    : [];
  const tokens = (query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return roomBlueprints.filter((bp) => {
    const bpTags = parseBlueprintTagsInput(bp.tags);
    if (requiredTags.length > 0 && !requiredTags.every((t) => bpTags.includes(t))) {
      return false;
    }

    if (roomSizeFilter && roomSizeFilter !== 'all') {
      const maxSpan = Math.max(bp.boundingSize?.[0] || 0, bp.boundingSize?.[1] || 0);
      if ((roomSizeFilter === 'compact' || roomSizeFilter === 'small') && maxSpan >= 5.0) return false;
      if (roomSizeFilter === 'medium' && (maxSpan < 5.0 || maxSpan >= 9.0)) return false;
      if (roomSizeFilter === 'large' && maxSpan < 9.0) return false;
    }

    if (tokens.length === 0) return true;

    const searchableText = [
      bp.name,
      bp.description,
      ...bpTags,
      ...bp.items.map((it) => `${it.name} ${it.category} ${it.subType}`)
    ]
      .join(' ')
      .toLowerCase();

    return tokens.every((tok) => {
      const cleanTok = tok.startsWith('#') ? normalizeBlueprintTag(tok) : tok;
      return searchableText.includes(cleanTok);
    });
  });
}


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

// ============================================================================
// GOOGLE AI STUDIO CHARACTER ANIMATION & FACIAL / VOICE IDENTITY SYSTEM
// (`gemini-3.1-flash-lite` Low-Frame Keyframe Synthesis + `gemini-3.8-flash-lite-tts`
//  Persistent Character Voice, Tone, Accent & Facial Expression Continuity)
// ============================================================================

export interface GoogleAiAnimationActionPreset {
  gesture: ScheduledActivityGesture;
  presetId: string;
  actionName: string;
  categoryLabel: string;
  cycleDurationSec: number;
  defaultFacialExpression: FacialExpressionType;
  motionPromptDirective: string;
  description: string;
}

export const GOOGLE_AI_ANIMATION_PRESETS: Record<ScheduledActivityGesture, GoogleAiAnimationActionPreset> = {
  idle_observe: {
    gesture: 'idle_observe',
    presetId: 'gai_anim_idle_observe',
    actionName: 'GoogleAI_Idle_Observe_Scan',
    categoryLabel: 'Daily · Watchful Idle Scan',
    cycleDurationSec: 2.5,
    defaultFacialExpression: 'suspicious',
    motionPromptDirective:
      'Subtle breathing chest rise, slow watchful head pan across the hotel corridor, micro-shifts in shoulder stance.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame watchful idle scan with synchronized suspicious eye-gaze micro-shifts.'
  },
  pace_corridor: {
    gesture: 'pace_corridor',
    presetId: 'gai_anim_pace_corridor',
    actionName: 'GoogleAI_Corridor_Patrol_Gait',
    categoryLabel: 'Locomotion · Measured Corridor Stride',
    cycleDurationSec: 1.5,
    defaultFacialExpression: 'weary',
    motionPromptDirective:
      'Measured bipedal hotel corridor walking stride with natural arm counter-swing and attentive head pitch.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame bipedal corridor walk cycle with synchronized facial focus.'
  },
  inspect_ledger: {
    gesture: 'inspect_ledger',
    presetId: 'gai_anim_inspect_ledger',
    actionName: 'GoogleAI_Inspect_Ledger_Audit',
    categoryLabel: 'Investigation · Inspect Guest Ledger',
    cycleDurationSec: 2.0,
    defaultFacialExpression: 'side_eye_glare',
    motionPromptDirective:
      'Attentive upper-body lean over desk register, right forearm tracing entries, subtle head nod and brow furrow.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame ledger inspection sequence with analytical brow furrow.'
  },
  wall_listen: {
    gesture: 'wall_listen',
    presetId: 'gai_anim_wall_listen',
    actionName: 'GoogleAI_Wall_Eavesdrop_Lean',
    categoryLabel: 'Stealth · Wainscoting Eavesdrop',
    cycleDurationSec: 2.5,
    defaultFacialExpression: 'paranoid_twitch',
    motionPromptDirective:
      'Conspiratorial lateral head tilt toward hollow brick partition, raised hand near ear, tense stillness.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame eavesdropping posture with paranoid eyelid micro-tremor.'
  },
  parlor_social: {
    gesture: 'parlor_social',
    presetId: 'gai_anim_parlor_social',
    actionName: 'GoogleAI_Parlor_Converse_Cadence',
    categoryLabel: 'Social · Parlor Conversation',
    cycleDurationSec: 2.0,
    defaultFacialExpression: 'smirk',
    motionPromptDirective:
      'Expressive conversational forearm and wrist gestures, poised head tilt, guarded parlor demeanor.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame social conversing cadence with expressive facial inflection.'
  },
  sleepwalk_trance: {
    gesture: 'sleepwalk_trance',
    presetId: 'gai_anim_sleepwalk_trance',
    actionName: 'GoogleAI_Sleepwalk_Somnambulist',
    categoryLabel: 'Occult · Somnambulist Drift',
    cycleDurationSec: 3.0,
    defaultFacialExpression: 'hollow_stare',
    motionPromptDirective:
      'Hypnotic swaying torso drift, partially raised forearms, entranced head pitch toward basement shaft.',
    description: 'Google AI Studio (gemini-3.1-flash-lite) low-frame somnambulist trance cycle with dilated hollow stare.'
  },
  sit_chair: {
    gesture: 'sit_chair',
    presetId: 'gai_anim_sit_chair',
    actionName: 'GoogleAI_Sit_In_Chair',
    categoryLabel: 'Interact · Sit in Chair',
    cycleDurationSec: 2.0,
    defaultFacialExpression: 'neutral',
    motionPromptDirective: 'Basic shared seated posture with 90-degree hip and knee bend and calm breathing.',
    description: 'Shared basic rig movement for sitting in chairs, armchairs, and parlor sofas.'
  },
  open_door: {
    gesture: 'open_door',
    presetId: 'gai_anim_open_door',
    actionName: 'GoogleAI_Open_Door',
    categoryLabel: 'Interact · Open Door',
    cycleDurationSec: 1.5,
    defaultFacialExpression: 'suspicious',
    motionPromptDirective: 'Basic shared right-hand reach, handle twist, and door swing pull/push.',
    description: 'Shared basic rig movement for opening suite doors and secret bookshelf passages.'
  },
  press_button: {
    gesture: 'press_button',
    presetId: 'gai_anim_press_button',
    actionName: 'GoogleAI_Press_Button_Touch',
    categoryLabel: 'Interact · Press Button / Touch',
    cycleDurationSec: 1.2,
    defaultFacialExpression: 'neutral',
    motionPromptDirective: 'Same shared reach-out-and-touch right-arm extension for all button-activated assets.',
    description: 'Shared basic reach-out-and-touch animation used across all button-activated assets (TVs, switches, intercoms, radios, elevators).'
  },
  pickup_item: {
    gesture: 'pickup_item',
    presetId: 'gai_anim_pickup_item',
    actionName: 'GoogleAI_Place_Pickup_Item',
    categoryLabel: 'Interact · Place / Pickup Item',
    cycleDurationSec: 1.6,
    defaultFacialExpression: 'suspicious',
    motionPromptDirective: 'Basic shared knee crouch and forward reach to pick up or place an item.',
    description: 'Shared basic rig movement for placing or picking up clues, keys, and props.'
  },
  lay_bed: {
    gesture: 'lay_bed',
    presetId: 'gai_anim_lay_bed',
    actionName: 'GoogleAI_Lay_In_Bed',
    categoryLabel: 'Interact · Lay in Bed',
    cycleDurationSec: 3.0,
    defaultFacialExpression: 'weary',
    motionPromptDirective: 'Basic shared horizontal reclining posture on a suite bed with slow breathing.',
    description: 'Shared basic rig movement for laying in a bed.'
  },
  crawl: {
    gesture: 'crawl',
    presetId: 'gai_anim_crawl',
    actionName: 'GoogleAI_Crawl',
    categoryLabel: 'Locomotion · Crawl',
    cycleDurationSec: 1.8,
    defaultFacialExpression: 'alarmed',
    motionPromptDirective: 'Basic shared low hands-and-knees crawl locomotion.',
    description: 'Shared basic rig movement for crawling through low passages.'
  },
  run: {
    gesture: 'run',
    presetId: 'gai_anim_run',
    actionName: 'GoogleAI_Run',
    categoryLabel: 'Locomotion · Run',
    cycleDurationSec: 1.0,
    defaultFacialExpression: 'alarmed',
    motionPromptDirective: 'Basic shared brisk running stride with reciprocal arm and knee drive.',
    description: 'Shared basic rig movement for running down corridors.'
  }
};

export interface GoogleAiAnimationKeyframe extends DecimatedPoseKeyframe {
  facialExpression?: FacialExpressionType;
  browFurrowOffset?: number;
  mouthApertureOffset?: number;
}

export interface GoogleAiCharacterAnimationClipSpec extends MeshyCharacterAnimationClipSpec {
  engine: 'google_ai_studio';
  modelId: 'gemini-3.1-flash-lite';
  presetId: string;
  motionPrompt: string;
  dominantExpression: FacialExpressionType;
  keyframes: GoogleAiAnimationKeyframe[];
}

export function buildGoogleAiAnimationPromptSpec(params: {
  characterName: string;
  archetype: string;
  gesture: ScheduledActivityGesture;
  globalFps?: GlobalAnimationFps;
  customMotionPrompt?: string;
  facialExpression?: FacialExpressionType;
  voiceProfile?: CharacterVoiceProfile;
}): {
  modelId: 'gemini-3.1-flash-lite';
  gesture: ScheduledActivityGesture;
  targetFps: GlobalAnimationFps;
  expectedKeyframeCount: number;
  cycleDurationSec: number;
  promptText: string;
} {
  const validFps = normalizeGlobalAnimationFps(params.globalFps);
  const preset = GOOGLE_AI_ANIMATION_PRESETS[params.gesture] || GOOGLE_AI_ANIMATION_PRESETS.idle_observe;
  const expectedKeyframeCount = Math.max(2, Math.round(preset.cycleDurationSec * validFps));
  const expr = params.facialExpression || preset.defaultFacialExpression;
  const customNote = (params.customMotionPrompt || '').trim();
  const voiceNote = params.voiceProfile
    ? `Locked Voice/Demeanor: ${params.voiceProfile.vocalTone} (${params.voiceProfile.accent} accent, ${params.voiceProfile.cadenceStyle}).`
    : '';

  const promptText = [
    `Synthesize a low-frame 3D humanoid skeletal animation clip for "${params.characterName}" (${params.archetype}) in a late-1970s mystery hotel.`,
    `Target Gesture: ${preset.actionName} (${preset.gesture}) · Cycle Duration: ${preset.cycleDurationSec}s · Step Rate: ${validFps} FPS (${expectedKeyframeCount} keyframes).`,
    `Motion Directive: ${customNote || preset.motionPromptDirective}`,
    `Synchronized 3D Facial Expression: ${expr}. ${voiceNote}`,
    `Output upright external-rig-compatible Euler angles (radians) for pelvis, lumbar/thoracic spine, neck, head, clavicles, upper arms, forearms, hands, thighs, calves, and feet.`
  ].join('\n');

  return {
    modelId: 'gemini-3.1-flash-lite',
    gesture: params.gesture,
    targetFps: validFps,
    expectedKeyframeCount,
    cycleDurationSec: preset.cycleDurationSec,
    promptText
  };
}

/**
 * Synthesizes a Google AI Studio (`gemini-3.1-flash-lite`) low-frame character animation clip
 * with optional AI-generated keyframe overrides and synchronized 3D facial expression tags.
 */
export function synthesizeGoogleAiCharacterAnimationClip(
  appearance: CharacterAppearance,
  gesture: ScheduledActivityGesture,
  globalFps: GlobalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS,
  options: {
    customMotionPrompt?: string;
    facialExpression?: FacialExpressionType;
    aiKeyframeModifiers?: Array<{
      headX?: number;
      headY?: number;
      headZ?: number;
      spineThoracicX?: number;
      spineLumbarY?: number;
      leftUpperArmX?: number;
      rightUpperArmX?: number;
      leftForearmX?: number;
      rightForearmX?: number;
      facialExpression?: FacialExpressionType;
    }>;
    taskId?: string;
  } = {}
): GoogleAiCharacterAnimationClipSpec {
  const validFps = normalizeGlobalAnimationFps(globalFps);
  const preset = GOOGLE_AI_ANIMATION_PRESETS[gesture] || GOOGLE_AI_ANIMATION_PRESETS.idle_observe;
  const dominantExpression =
    options.facialExpression ||
    appearance.facialExpression ||
    preset.defaultFacialExpression;

  // Always use upright external-rig-ready posture (spineCurvature = 0) unless explicitly set
  const cleanAppearance: CharacterAppearance = {
    ...appearance,
    spineCurvature: 0,
    hasWalkingCane: false
  };

  const taskId = options.taskId || `gai_anim_${gesture}_${validFps}fps`;
  const baseSpec = decimateAnimationKeyframes(
    cleanAppearance,
    gesture,
    validFps,
    `gai_rig_${gesture}`,
    taskId,
    60
  );

  const modifiers = Array.isArray(options.aiKeyframeModifiers) ? options.aiKeyframeModifiers : [];
  const keyframes: GoogleAiAnimationKeyframe[] = baseSpec.decimatedKeyframes.map((kf, idx) => {
    const mod = modifiers[idx % Math.max(1, modifiers.length)];
    const clampRad = (val: number | undefined, fallback: number, limit = 1.35) =>
      typeof val === 'number' && Number.isFinite(val)
        ? Math.max(-limit, Math.min(limit, Number(val.toFixed(4))))
        : fallback;

    const mergedPose: SkeletonPoseEuler = mod
      ? {
          ...kf.pose,
          headX: clampRad(mod.headX, kf.pose.headX, 0.65),
          headY: clampRad(mod.headY, kf.pose.headY, 0.85),
          headZ: clampRad(mod.headZ, kf.pose.headZ, 0.45),
          spineThoracicX: clampRad(mod.spineThoracicX, kf.pose.spineThoracicX, 0.55),
          spineLumbarY: clampRad(mod.spineLumbarY, kf.pose.spineLumbarY, 0.45),
          leftUpperArmX: clampRad(mod.leftUpperArmX, kf.pose.leftUpperArmX, 1.35),
          rightUpperArmX: clampRad(mod.rightUpperArmX, kf.pose.rightUpperArmX, 1.35),
          leftForearmX: clampRad(mod.leftForearmX, kf.pose.leftForearmX, 1.45),
          rightForearmX: clampRad(mod.rightForearmX, kf.pose.rightForearmX, 1.45),
          caneGripActive: false
        }
      : { ...kf.pose, caneGripActive: false };

    return {
      frameIndex: kf.frameIndex,
      timeSec: kf.timeSec,
      pose: mergedPose,
      facialExpression: mod?.facialExpression || dominantExpression
    };
  });

  return {
    ...baseSpec,
    engine: 'google_ai_studio',
    modelId: 'gemini-3.1-flash-lite',
    presetId: preset.presetId,
    actionName: preset.actionName,
    motionPrompt: (options.customMotionPrompt || '').trim() || preset.motionPromptDirective,
    dominantExpression,
    decimatedKeyframes: keyframes,
    keyframes
  };
}

/**
 * Canonical locked-in voice, vocal tone, regional accent, and baseline facial expression profiles
 * for all core characters in The Alderney Arms Hotel. Ensures every character has a distinct
 * voice/tone/accent maintained strictly throughout the entire playthrough.
 */
export const DEFAULT_CHARACTER_VOICE_PROFILES: Record<string, CharacterVoiceProfile> = {
  agent_arthur: {
    prebuiltVoiceName: 'Charon',
    vocalTone: 'Hushed, gravel-edged, world-weary front-desk baritone',
    accent: '1970s Old New York Mid-Atlantic',
    cadenceStyle: 'Measured, deliberate pauses while cross-checking ledger timestamps',
    pitchMultiplier: 0.88,
    speakingRate: 0.92,
    baselineExpression: 'weary',
    persistAcrossPlaythrough: true
  },
  agent_eleanor: {
    prebuiltVoiceName: 'Kore',
    vocalTone: 'Poised, aristocratic, sharply observant contralto',
    accent: 'New England Brahmin Transatlantic',
    cadenceStyle: 'Clipped, articulate phrasing with guarded upper-crust composure',
    pitchMultiplier: 1.06,
    speakingRate: 0.95,
    baselineExpression: 'suspicious',
    persistAcrossPlaythrough: true
  },
  agent_barnaby: {
    prebuiltVoiceName: 'Fenrir',
    vocalTone: 'Reverent, ink-stained, conspiratorial academic bass',
    accent: 'Oxford-Inflected Antiquarian',
    cadenceStyle: 'Rhythmic, scholarly cadence that drops to a whisper on occult masonry',
    pitchMultiplier: 0.84,
    speakingRate: 0.90,
    baselineExpression: 'paranoid_twitch',
    persistAcrossPlaythrough: true
  },
  agent_clara: {
    prebuiltVoiceName: 'Zephyr',
    vocalTone: 'Breathless, velvet-gloved, theatrical socialite mezzo',
    accent: 'Manhattan Upper East Side Vintage',
    cadenceStyle: 'Expressive, dramatic inflections punctuated by knowing sighs',
    pitchMultiplier: 1.12,
    speakingRate: 1.04,
    baselineExpression: 'smirk',
    persistAcrossPlaythrough: true
  },
  agent_marcus: {
    prebuiltVoiceName: 'Puck',
    vocalTone: 'Restless, analytical, sleep-deprived structural tenor',
    accent: 'Chicago Industrial Drafting-Room',
    cadenceStyle: 'Crisp, blueprint-precise technical phrasing with nervous urgency',
    pitchMultiplier: 0.96,
    speakingRate: 1.06,
    baselineExpression: 'side_eye_glare',
    persistAcrossPlaythrough: true
  },
  agent_helper: {
    prebuiltVoiceName: 'Zephyr',
    vocalTone: 'Metallic, brass-horn phonograph resonance with warm vacuum-tube hum',
    accent: '1920s Transatlantic Broadcast Modulation',
    cadenceStyle: 'Rhythmic turntable-locked cadence with subtle static pauses',
    pitchMultiplier: 0.92,
    speakingRate: 0.88,
    baselineExpression: 'cryptic_whisper',
    persistAcrossPlaythrough: true
  }
};

export function inferVoiceProfileFromArchetypeAndName(
  name: string,
  archetype: string,
  seedText = ''
): CharacterVoiceProfile {
  const lowerName = (name || '').toLowerCase();
  const lowerArch = (archetype || '').toLowerCase();
  const lowerSeed = (seedText || '').toLowerCase();

  if (lowerName.includes('arthur')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_arthur };
  if (lowerName.includes('eleanor')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_eleanor };
  if (lowerName.includes('barnaby') || lowerName.includes('finch')) {
    return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_barnaby };
  }
  if (lowerName.includes('clara')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_clara };
  if (lowerName.includes('marcus')) return { ...DEFAULT_CHARACTER_VOICE_PROFILES.agent_marcus };

  if (lowerArch.includes('archivist') || lowerSeed.includes('occult')) {
    return {
      prebuiltVoiceName: 'Fenrir',
      vocalTone: 'Hushed, resonant, scholarly baritone',
      accent: 'Old-World Antiquarian Mid-Atlantic',
      cadenceStyle: 'Measured, deliberate academic phrasing with conspiratorial pauses',
      pitchMultiplier: 0.86,
      speakingRate: 0.91,
      baselineExpression: 'suspicious',
      persistAcrossPlaythrough: true
    };
  }
  if (lowerArch.includes('socialite') || lowerArch.includes('matron')) {
    return {
      prebuiltVoiceName: 'Kore',
      vocalTone: 'Refined, velvet-edged, observant alto',
      accent: '1970s Manhattan Transatlantic',
      cadenceStyle: 'Poised, articulate, slightly theatrical delivery',
      pitchMultiplier: 1.08,
      speakingRate: 0.96,
      baselineExpression: 'smirk',
      persistAcrossPlaythrough: true
    };
  }
  if (lowerArch.includes('bellhop')) {
    return {
      prebuiltVoiceName: 'Puck',
      vocalTone: 'Quick-witted, watchful late-shift tenor',
      accent: '1970s Lower East Side New York',
      cadenceStyle: 'Brisk, street-smart, low-volume corridor delivery',
      pitchMultiplier: 1.02,
      speakingRate: 1.05,
      baselineExpression: 'alarmed',
      persistAcrossPlaythrough: true
    };
  }

  return {
    prebuiltVoiceName: 'Charon',
    vocalTone: 'Measured, smoky noir baritone',
    accent: '1970s Classic New York Noir',
    cadenceStyle: 'Calm, observant, unhurried detective cadence',
    pitchMultiplier: 0.90,
    speakingRate: 0.94,
    baselineExpression: 'neutral',
    persistAcrossPlaythrough: true
  };
}

/**
 * Returns a character's locked `CharacterVoiceProfile`, preserving any customized voice/tone/accent
 * across the entire playthrough.
 */
export function getOrCreateCharacterVoiceProfile(
  agent: Pick<HotelAgentProfile, 'id' | 'name' | 'occupation' | 'voiceStyle' | 'voiceProfile'> & {
    appearance?: Partial<CharacterAppearance>;
  }
): CharacterVoiceProfile {
  if (agent.voiceProfile && agent.voiceProfile.prebuiltVoiceName) {
    return {
      ...agent.voiceProfile,
      persistAcrossPlaythrough: true
    };
  }
  if (agent.appearance?.voiceProfile && agent.appearance.voiceProfile.prebuiltVoiceName) {
    return {
      ...agent.appearance.voiceProfile,
      persistAcrossPlaythrough: true
    };
  }
  if (agent.id && DEFAULT_CHARACTER_VOICE_PROFILES[agent.id]) {
    return { ...DEFAULT_CHARACTER_VOICE_PROFILES[agent.id] };
  }
  return inferVoiceProfileFromArchetypeAndName(
    agent.name || 'Tenant',
    agent.occupation || agent.appearance?.archetype || 'Detective Clerk',
    agent.voiceStyle || ''
  );
}

/**
 * Resolves the character's locked `CharacterVoiceProfile` and context-driven 3D `FacialExpressionType`
 * for a dialogue turn while strictly preserving the character's voice, vocal tone, and accent across the playthrough.
 */
export function resolveCharacterVoiceAndExpressionForTurn(
  agent: HotelAgentProfile,
  memoryEval?: Partial<InteractionMemoryEvaluation> | null,
  replyText = ''
): {
  voiceProfile: CharacterVoiceProfile;
  activeFacialExpression: FacialExpressionType;
  ttsStyleDirective: string;
} {
  const voiceProfile = getOrCreateCharacterVoiceProfile(agent);
  const lowerReply = (replyText || '').toLowerCase();
  let activeFacialExpression: FacialExpressionType =
    agent.activeFacialExpression ||
    agent.appearance?.facialExpression ||
    voiceProfile.baselineExpression ||
    'neutral';

  if (memoryEval) {
    if ((memoryEval.triggeredDislikes && memoryEval.triggeredDislikes.length > 0) || (memoryEval.trustDelta ?? 0) <= -10) {
      activeFacialExpression =
        memoryEval.resultingDisposition === 'hostile' ? 'grimace' : 'side_eye_glare';
    } else if (memoryEval.unansweredDaysWaiting && memoryEval.unansweredDaysWaiting >= 1) {
      activeFacialExpression = 'suspicious';
    } else if ((memoryEval.triggeredLikes && memoryEval.triggeredLikes.length > 0) || (memoryEval.trustDelta ?? 0) >= 8) {
      activeFacialExpression = 'smirk';
    }
  }

  if (lowerReply.includes('whisper') || lowerReply.includes('behind the wall') || lowerReply.includes('hush')) {
    activeFacialExpression = 'cryptic_whisper';
  } else if (lowerReply.includes('vanished') || lowerReply.includes('blood') || lowerReply.includes('scream')) {
    activeFacialExpression = 'shocked';
  } else if (lowerReply.includes('watch') || lowerReply.includes('careful') || lowerReply.includes('latch')) {
    if (activeFacialExpression === 'neutral') {
      activeFacialExpression = 'suspicious';
    }
  }

  const ttsStyleDirective = `Speak with a ${voiceProfile.accent} accent in a ${voiceProfile.vocalTone} tone (${voiceProfile.cadenceStyle}), conveying a ${activeFacialExpression.replace(/_/g, ' ')} facial expression`;

  return {
    voiceProfile,
    activeFacialExpression,
    ttsStyleDirective
  };
}

/**
 * Builds the official Google AI Studio `gemini-3.8-flash-lite-tts` request payload
 * using `prebuiltVoiceConfig.voiceName` and `speechMetadata.style` so the character's
 * voice, tone, and accent remain locked across the entire playthrough.
 */
export function buildGeminiTtsRequestPayload(
  agent: Pick<HotelAgentProfile, 'id' | 'name' | 'occupation' | 'voiceStyle' | 'voiceProfile' | 'activeFacialExpression'> & {
    appearance?: Partial<CharacterAppearance>;
  },
  textToSpeak: string,
  overrideExpression?: FacialExpressionType
): {
  model: 'gemini-3.8-flash-lite-tts';
  contents: {
    parts: Array<{
      text: string;
      speechMetadata: {
        style: string;
      };
    }>;
  };
  config: {
    responseModalities: ['AUDIO'];
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: GeminiPrebuiltVoiceName;
        };
      };
    };
  };
  voiceProfile: CharacterVoiceProfile;
  activeFacialExpression: FacialExpressionType;
} {
  const voiceProfile = getOrCreateCharacterVoiceProfile(agent);
  const activeFacialExpression: FacialExpressionType =
    overrideExpression ||
    agent.activeFacialExpression ||
    agent.appearance?.facialExpression ||
    voiceProfile.baselineExpression ||
    'neutral';

  const styleDirective = `Speak with a consistent ${voiceProfile.accent} accent in a ${voiceProfile.vocalTone} vocal tone (${voiceProfile.cadenceStyle}), maintaining ${agent.name}'s signature voice and a ${activeFacialExpression.replace(/_/g, ' ')} expression`;

  return {
    model: 'gemini-3.8-flash-lite-tts',
    contents: {
      parts: [
        {
          text: (textToSpeak || '').trim() || 'The corridor remains quiet.',
          speechMetadata: {
            style: styleDirective
          }
        }
      ]
    },
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceProfile.prebuiltVoiceName
          }
        }
      }
    },
    voiceProfile,
    activeFacialExpression
  };
}

// ============================================================================
// SINGLE & MULTI-ITEM COPY (CTRL+C) / PASTE (CTRL+V) & REUSABLE ASSET SETS
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


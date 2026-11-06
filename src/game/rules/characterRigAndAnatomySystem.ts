import {
  type CharacterAppearance,
  type CharacterArchetype,
  type CharacterClothingChoiceSpec,
  type CharacterClothingPattern,
  type CharacterClothingStyleId,
  type CharacterHairColorSwatch,
  type CharacterHairStyleId,
  type CharacterHairStyleMetadata,
  type CharacterVoiceProfile,
  type DailyActionEntry,
  type FacialExpressionType,
  type FacialRigParams,
  type FloorId,
  type HotelAgentProfile,
  INITIAL_CLUES,
  type NaturalCharacterAnatomySpec,
  type PendingTenantQuestion,
  type ScheduledActivityGesture,
  type SkeletonPoseEuler,
  type TenantDisposition,
  type TimeOfDayPhase
} from './coreTypesAndFloors';
import { getOrCreateCharacterVoiceProfile, inferVoiceProfileFromArchetypeAndName } from './catalogVoiceAndSets';
import { getActiveDailyAction } from './characterScheduleSystem';

export interface CharacterClothingStyleEntry {
  id: CharacterClothingStyleId;
  label: string;
  eraBadge: string;
  description: string;
  defaultPattern: CharacterClothingPattern;
  defaultOutfitColor: string;
  defaultSecondaryColor: string;
  defaultAccentColor: string;
  recommendedArchetypes: CharacterArchetype[];
}

export const CHARACTER_CLOTHING_STYLES: readonly CharacterClothingStyleEntry[] = [
  {
    id: 'noir_trench_coat',
    label: 'Belted Noir Trench Coat',
    eraBadge: '1932 Rainwear',
    description: 'Double-breasted storm-flap trench coat with buckled waist belt, shoulder epaulets, and upturned lapel collar.',
    defaultPattern: 'herringbone',
    defaultOutfitColor: '#5c4033',
    defaultSecondaryColor: '#262320',
    defaultAccentColor: '#d4af37',
    recommendedArchetypes: ['Detective Clerk', 'Long-Term Resident']
  },
  {
    id: 'tailored_three_piece',
    label: 'Savile Three-Piece Suit',
    eraBadge: 'Mayfair Bespoke',
    description: 'Contoured single-breasted jacket over a buttoned waistcoat, crisp dress shirt collar, and silk necktie.',
    defaultPattern: 'pinstripe',
    defaultOutfitColor: '#2b3442',
    defaultSecondaryColor: '#1f2631',
    defaultAccentColor: '#c59b27',
    recommendedArchetypes: ['Detective Clerk', 'Long-Term Resident', 'Occult Archivist']
  },
  {
    id: 'bellhop_brass_tunic',
    label: 'Grand Hotel Brass Tunic',
    eraBadge: 'Hospitality Uniform',
    description: 'Structured high-collar double-row brass button tunic with braided shoulder piping and pleated trousers.',
    defaultPattern: 'solid',
    defaultOutfitColor: '#7a1c33',
    defaultSecondaryColor: '#27141a',
    defaultAccentColor: '#fbbf24',
    recommendedArchetypes: ['Night Bellhop']
  },
  {
    id: 'ribbed_turtleneck_blazer',
    label: 'Archivist Turtleneck & Jacket',
    eraBadge: 'Scholarly Tweed',
    description: 'Tweed scholar jacket layered over a fine ribbed high-neck sweater with suede elbow patches.',
    defaultPattern: 'herringbone',
    defaultOutfitColor: '#312e58',
    defaultSecondaryColor: '#1e1b2e',
    defaultAccentColor: '#38bdf8',
    recommendedArchetypes: ['Occult Archivist', 'Long-Term Resident']
  },
  {
    id: 'velvet_evening_ensemble',
    label: 'Draped Velvet Evening Ensemble',
    eraBadge: 'Soirée Couture',
    description: 'Plush shawl-lapel velvet smoking jacket with silk cummerbund waist drape and jeweled lapel brooch.',
    defaultPattern: 'solid',
    defaultOutfitColor: '#631758',
    defaultSecondaryColor: '#211324',
    defaultAccentColor: '#facc15',
    recommendedArchetypes: ['Eccentric Socialite', 'Elderly Matron']
  },
  {
    id: 'knitted_cardigan_shawl',
    label: 'Cable-Knit Shawl Cardigan',
    eraBadge: 'Parlor Comfort',
    description: 'Thick cable-knit shawl-collar cardigan buttoned over a high pleated blouse and wool trousers.',
    defaultPattern: 'ribbed_knit',
    defaultOutfitColor: '#4b5563',
    defaultSecondaryColor: '#292e37',
    defaultAccentColor: '#d97706',
    recommendedArchetypes: ['Elderly Matron', 'Long-Term Resident']
  },
  {
    id: 'rolled_sleeve_waistcoat',
    label: 'Rolled-Sleeve Detective Vest',
    eraBadge: 'Late-Shift Desk',
    description: 'Tailored six-button waistcoat over rolled linen shirtsleeves exposing sculpted forearms and a vintage wristwatch.',
    defaultPattern: 'plaid',
    defaultOutfitColor: '#4a3525',
    defaultSecondaryColor: '#2b211a',
    defaultAccentColor: '#ca8a04',
    recommendedArchetypes: ['Detective Clerk', 'Night Bellhop']
  },
  {
    id: 'boiler_utility_jacket',
    label: 'Heavy Canvas Work Jacket',
    eraBadge: 'Basement Service',
    description: 'Rugged chore coat with riveted chest pockets, reinforced forearm cuffs, and heavy canvas work trousers.',
    defaultPattern: 'solid',
    defaultOutfitColor: '#36453b',
    defaultSecondaryColor: '#222925',
    defaultAccentColor: '#b45309',
    recommendedArchetypes: ['Long-Term Resident', 'Night Bellhop']
  }
] as const;

export const CHARACTER_CLOTHING_PATTERNS: readonly { id: CharacterClothingPattern; label: string }[] = [
  { id: 'solid', label: 'Fine Twill Weave' },
  { id: 'herringbone', label: 'Wool Herringbone' },
  { id: 'pinstripe', label: 'Chalk Pinstripe' },
  { id: 'plaid', label: 'Glen Tartan Check' },
  { id: 'ribbed_knit', label: 'Cable & Ribbed Knit' }
] as const;

export function resolveCharacterClothingStyle(
  appearance?: Partial<Pick<CharacterAppearance, 'clothingStyle' | 'archetype'>>
): CharacterClothingStyleId {
  if (appearance?.clothingStyle) {
    const valid = CHARACTER_CLOTHING_STYLES.some((s) => s.id === appearance.clothingStyle);
    if (valid) return appearance.clothingStyle;
  }
  switch (appearance?.archetype) {
    case 'Night Bellhop':
      return 'bellhop_brass_tunic';
    case 'Elderly Matron':
      return 'knitted_cardigan_shawl';
    case 'Occult Archivist':
      return 'ribbed_turtleneck_blazer';
    case 'Eccentric Socialite':
    case ' eccentric Socialite':
      return 'velvet_evening_ensemble';
    case 'Long-Term Resident':
      return 'tailored_three_piece';
    case 'Detective Clerk':
    default:
      return 'noir_trench_coat';
  }
}

export function resolveCharacterClothingPattern(
  appearance?: Partial<Pick<CharacterAppearance, 'clothingPattern' | 'clothingStyle' | 'archetype'>>
): CharacterClothingPattern {
  if (appearance?.clothingPattern) {
    const valid = CHARACTER_CLOTHING_PATTERNS.some((p) => p.id === appearance.clothingPattern);
    if (valid) return appearance.clothingPattern;
  }
  const styleId = resolveCharacterClothingStyle(appearance);
  const entry = CHARACTER_CLOTHING_STYLES.find((s) => s.id === styleId);
  return entry?.defaultPattern || 'herringbone';
}

export function resolveSecondaryClothingColor(
  appearance?: Partial<Pick<CharacterAppearance, 'secondaryClothingColor' | 'clothingStyle' | 'archetype'>>
): string {
  if (appearance?.secondaryClothingColor && /^#[0-9a-fA-F]{6}$/.test(appearance.secondaryClothingColor)) {
    return appearance.secondaryClothingColor;
  }
  const styleId = resolveCharacterClothingStyle(appearance);
  const entry = CHARACTER_CLOTHING_STYLES.find((s) => s.id === styleId);
  return entry?.defaultSecondaryColor || '#242220';
}

const CURATED_OUTFIT_CHOICE_POOL: readonly Omit<CharacterClothingChoiceSpec, 'id'>[] = [
  {
    title: 'Rain-Slicked Gumshoe Trench',
    subtitle: 'Espresso herringbone storm coat & brass buckle',
    clothingStyle: 'noir_trench_coat',
    clothingPattern: 'herringbone',
    outfitColor: '#5c4033',
    secondaryClothingColor: '#26211e',
    accentColor: '#eab308',
    eraBadge: '1932 Noir'
  },
  {
    title: 'Mayfair Chalk-Stripe Three-Piece',
    subtitle: 'Midnight navy pinstripe waistcoat & gold tie pin',
    clothingStyle: 'tailored_three_piece',
    clothingPattern: 'pinstripe',
    outfitColor: '#1e293b',
    secondaryClothingColor: '#0f172a',
    accentColor: '#fbbf24',
    eraBadge: 'Savile Bespoke'
  },
  {
    title: 'Grand Imperial Bellhop Tunic',
    subtitle: 'Oxblood wool uniform with twin brass button rows',
    clothingStyle: 'bellhop_brass_tunic',
    clothingPattern: 'solid',
    outfitColor: '#7f1d1d',
    secondaryClothingColor: '#281317',
    accentColor: '#facc15',
    eraBadge: 'Hotel Livery'
  },
  {
    title: 'Esoteric Scholar Tweed & Knit',
    subtitle: 'Indigo herringbone blazer over charcoal turtleneck',
    clothingStyle: 'ribbed_turtleneck_blazer',
    clothingPattern: 'herringbone',
    outfitColor: '#312e81',
    secondaryClothingColor: '#1e1b4b',
    accentColor: '#38bdf8',
    eraBadge: 'Archive Study'
  },
  {
    title: 'Cabaret Velvet Smoking Jacket',
    subtitle: 'Plum crushed velvet shawl collar & gilt brooch',
    clothingStyle: 'velvet_evening_ensemble',
    clothingPattern: 'solid',
    outfitColor: '#6b21a8',
    secondaryClothingColor: '#241434',
    accentColor: '#fde047',
    eraBadge: 'Gala Soirée'
  },
  {
    title: 'Hearthside Cable-Knit Shawl',
    subtitle: 'Heathered slate cardigan over pleated parlor trousers',
    clothingStyle: 'knitted_cardigan_shawl',
    clothingPattern: 'ribbed_knit',
    outfitColor: '#475569',
    secondaryClothingColor: '#1e293b',
    accentColor: '#d97706',
    eraBadge: 'Parlor Knit'
  },
  {
    title: 'After-Hours Rolled-Sleeve Vest',
    subtitle: 'Glen-plaid waistcoat, rolled linen cuffs & wristwatch',
    clothingStyle: 'rolled_sleeve_waistcoat',
    clothingPattern: 'plaid',
    outfitColor: '#573d28',
    secondaryClothingColor: '#292019',
    accentColor: '#ca8a04',
    eraBadge: 'Night Desk'
  },
  {
    title: 'Sub-Basement Engineer Coat',
    subtitle: 'Forest canvas utility coat with riveted pockets',
    clothingStyle: 'boiler_utility_jacket',
    clothingPattern: 'solid',
    outfitColor: '#2f4538',
    secondaryClothingColor: '#1b2620',
    accentColor: '#ea580c',
    eraBadge: 'Boiler Crew'
  },
  {
    title: 'Fogbank Slate Trench Coat',
    subtitle: 'Charcoal storm-flap trench with pewter trim',
    clothingStyle: 'noir_trench_coat',
    clothingPattern: 'solid',
    outfitColor: '#334155',
    secondaryClothingColor: '#1e293b',
    accentColor: '#94a3b8',
    eraBadge: 'Harbor Patrol'
  },
  {
    title: 'Highland Tartan Lounge Suit',
    subtitle: 'Auburn glen-check three-piece with amber silk tie',
    clothingStyle: 'tailored_three_piece',
    clothingPattern: 'plaid',
    outfitColor: '#653224',
    secondaryClothingColor: '#2d1a14',
    accentColor: '#f59e0b',
    eraBadge: 'Country Club'
  },
  {
    title: 'Emerald Absinthe Evening Coat',
    subtitle: 'Deep emerald velvet ensemble with champagne sash',
    clothingStyle: 'velvet_evening_ensemble',
    clothingPattern: 'solid',
    outfitColor: '#064e3b',
    secondaryClothingColor: '#042f2e',
    accentColor: '#fde68a',
    eraBadge: 'Salon Couture'
  },
  {
    title: 'Crimson Precinct Waistcoat',
    subtitle: 'Burgundy pinstripe vest with rolled ivory shirtsleeves',
    clothingStyle: 'rolled_sleeve_waistcoat',
    clothingPattern: 'pinstripe',
    outfitColor: '#691b2b',
    secondaryClothingColor: '#24171a',
    accentColor: '#fbbf24',
    eraBadge: 'Precinct File'
  }
];

/**
 * Generates `count` distinct, era-authentic clothing choices tailored to the character's archetype
 * and variation seed (`variationNonce`), ensuring varied styles, patterns, and palettes.
 */
export function generateCharacterClothingChoices(
  appearance?: Partial<CharacterAppearance>,
  count = 4,
  variationNonce = 0
): CharacterClothingChoiceSpec[] {
  const safeCount = Math.max(1, Math.min(8, Math.floor(count)));
  const currentStyle = resolveCharacterClothingStyle(appearance);
  const archetype = appearance?.archetype || 'Detective Clerk';

  // Score and rotate the pool deterministically using archetype + variationNonce
  const total = CURATED_OUTFIT_CHOICE_POOL.length;
  const archetypeSeed = archetype
    .split('')
    .reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 3), 0);
  const startIndex = Math.abs(archetypeSeed + variationNonce * 5) % total;

  const picked: CharacterClothingChoiceSpec[] = [];
  const usedStyles = new Set<CharacterClothingStyleId>();

  for (let pass = 0; pass < 2 && picked.length < safeCount; pass++) {
    for (let i = 0; i < total && picked.length < safeCount; i++) {
      const idx = (startIndex + i * 3 + pass) % total;
      const candidate = CURATED_OUTFIT_CHOICE_POOL[idx];
      if (pass === 0) {
        if (usedStyles.has(candidate.clothingStyle)) continue;
        if (variationNonce > 0 && picked.length === 0 && candidate.clothingStyle === currentStyle) {
          continue;
        }
      }
      usedStyles.add(candidate.clothingStyle);
      picked.push({
        id: `choice_${variationNonce}_${picked.length}_${candidate.clothingStyle}`,
        title: candidate.title,
        subtitle: candidate.subtitle,
        clothingStyle: candidate.clothingStyle,
        clothingPattern: candidate.clothingPattern,
        outfitColor: candidate.outfitColor,
        secondaryClothingColor: candidate.secondaryClothingColor,
        accentColor: candidate.accentColor,
        eraBadge: candidate.eraBadge
      });
    }
  }

  return picked;
}

/**
 * Applies a selected clothing choice specification to an existing `CharacterAppearance`.
 */
export function applyClothingChoiceToAppearance(
  appearance: CharacterAppearance,
  choice: CharacterClothingChoiceSpec
): CharacterAppearance {
  return {
    ...appearance,
    clothingStyle: choice.clothingStyle,
    clothingPattern: choice.clothingPattern,
    outfitColor: choice.outfitColor,
    secondaryClothingColor: choice.secondaryClothingColor,
    accentColor: choice.accentColor,
    customClothingLabel: choice.title
  };
}

export function computeNaturalCharacterAnatomySpec(
  appearance?: Partial<
    Pick<
      CharacterAppearance,
      'headShape' | 'archetype' | 'bodyProportionStyle' | 'spineCurvature' | 'mouthStyle'
    >
  >
): NaturalCharacterAnatomySpec {
  const safeApp = appearance || {};
  const isElderly =
    safeApp.archetype === 'Elderly Matron' ||
    (safeApp.spineCurvature !== undefined && safeApp.spineCurvature >= 20);
  const isSocialite =
    safeApp.archetype === 'Eccentric Socialite' ||
    safeApp.archetype === ' eccentric Socialite';

  let craniumWidthRatio = 0.96;
  let craniumHeightRatio = 1.12;
  let craniumDepthRatio = 1.04;
  let jawTaperRatio = 0.76;
  let chinProminence = 1.0;
  let zygomaticWidthRatio = 1.04;
  let noseBridgeLength = 1.0;
  let noseTipProjection = 1.0;

  switch (safeApp.headShape) {
    case 'tall_noir':
      craniumWidthRatio = 0.91;
      craniumHeightRatio = 1.18;
      craniumDepthRatio = 1.05;
      jawTaperRatio = 0.72;
      chinProminence = 1.12;
      zygomaticWidthRatio = 1.1;
      noseBridgeLength = 1.12;
      noseTipProjection = 1.08;
      break;
    case 'rounded_toon':
      craniumWidthRatio = 1.03;
      craniumHeightRatio = 1.05;
      craniumDepthRatio = 1.02;
      jawTaperRatio = 0.84;
      chinProminence = 0.92;
      zygomaticWidthRatio = 1.06;
      noseBridgeLength = 0.92;
      noseTipProjection = 0.96;
      break;
    case 'chibi_block':
      craniumWidthRatio = 1.06;
      craniumHeightRatio = 1.02;
      craniumDepthRatio = 1.0;
      jawTaperRatio = 0.88;
      chinProminence = 0.88;
      zygomaticWidthRatio = 1.02;
      noseBridgeLength = 0.88;
      noseTipProjection = 0.92;
      break;
    case 'proportional_human':
    default:
      craniumWidthRatio = 0.96;
      craniumHeightRatio = 1.12;
      craniumDepthRatio = 1.04;
      jawTaperRatio = 0.76;
      chinProminence = 1.0;
      zygomaticWidthRatio = 1.05;
      noseBridgeLength = 1.0;
      noseTipProjection = 1.0;
      break;
  }

  const upperLipCupidBowDepth = isSocialite ? 1.22 : isElderly ? 0.84 : 1.05;
  const lowerLipFullness = isSocialite ? 1.2 : isElderly ? 0.86 : 1.04;
  const earHelixScale = isElderly ? 1.08 : 1.0;

  const shoulderBreadthRatio = isSocialite ? 0.96 : isElderly ? 0.94 : 1.06;
  const waistTaperRatio = isSocialite ? 0.78 : isElderly ? 0.92 : 0.84;
  const hipFlareRatio = isSocialite ? 1.08 : isElderly ? 1.04 : 0.98;
  const neckSlenderRatio = isSocialite ? 0.9 : isElderly ? 0.94 : 1.0;

  return {
    headShape: safeApp.headShape || 'proportional_human',
    craniumWidthRatio,
    craniumHeightRatio,
    craniumDepthRatio,
    jawTaperRatio,
    chinProminence,
    zygomaticWidthRatio,
    noseBridgeLength,
    noseTipProjection,
    upperLipCupidBowDepth,
    lowerLipFullness,
    earHelixScale,
    shoulderBreadthRatio,
    waistTaperRatio,
    hipFlareRatio,
    neckSlenderRatio
  };
}

/**
 * Pure smooth C-infinity Gaussian & polynomial vertex displacement field for sculpting a single,
 * continuous, natural human craniofacial mesh from a unit sphere normal `(nx, ny, nz)`.
 * Eliminates harsh primitive intersection seams by organically blending the forehead, supraorbital brow arch,
 * recessed orbital eye sockets, continuous nasal bridge & tip, zygomatic cheekbones, sub-malar taper,
 * and philtrum dimple into one smooth surface.
 */
export function computeSmoothFacialVertexDisplacement(
  nx: number,
  ny: number,
  nz: number,
  anatomy: NaturalCharacterAnatomySpec
): [number, number, number] {
  const len = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const uz = nz / len;
  const absX = Math.abs(ux);

  // 1. Base ovoid human head radii (in meters, inside headGroup local space)
  const baseRx = 0.102 * anatomy.craniumWidthRatio;
  const baseRy = 0.124 * anatomy.craniumHeightRatio;
  const baseRz = 0.106 * anatomy.craniumDepthRatio;

  // 2. Natural human craniofacial envelope:
  // A sphere collapses too quickly in the lower hemisphere (uy < 0) where the human maxilla,
  // cheeks, jawline, and chin actually maintain forward projection and gentle V-line taper.
  const lowerHemi = uy < 0 ? Math.min(1, -uy) : 0;
  // Boost horizontal radius in the mid/lower face (-0.82 < uy < -0.10) so cheeks & jaw don't pinch inward
  const lowerJawFullness =
    uy < -0.05 && uy > -0.92
      ? Math.sin(Math.min(1, (-uy - 0.05) / 0.87) * Math.PI) * 0.24
      : 0;

  const parietalSpread = Math.exp(-Math.pow((uy - 0.28) / 0.36, 2)) * Math.max(0, -uz * 0.4 + 0.5) * 0.045;
  const templeIndent =
    Math.exp(-Math.pow((uy - 0.14) / 0.22, 2)) *
    Math.exp(-Math.pow((uz - 0.45) / 0.32, 2)) *
    Math.pow(absX, 1.5) *
    0.036;

  // Smooth V-taper from cheekbones down to the gonial jaw angle and chin
  const jawTaperFactor = Math.pow(lowerHemi, 1.15) * (1 - 0.72 * anatomy.jawTaperRatio);
  // Narrow the front chin gracefully so it forms an oval/heart contour rather than a wide box
  const chinFrontTaper =
    uy < -0.35 && uz > 0.25
      ? Math.pow((-uy - 0.35) / 0.65, 1.1) * Math.pow((uz - 0.25) / 0.75, 1.1) * 0.24
      : 0;

  // Tuck the back of the skull below the occiput (uy < -0.25, uz < 0.1) smoothly into the neck
  const occipitalNeckTuck =
    uy < -0.22 && uz < 0.15
      ? Math.pow((-uy - 0.22) / 0.78, 1.2) * Math.max(0, 0.15 - uz) * 0.32
      : 0;

  // Gentle anterior lower-face support so the maxilla and chin align naturally behind the nasal tip and vermilion lips
  const anteriorFacialPlaneBoost =
    uy < 0 && uz > 0
      ? Math.sin(Math.min(1, -uy / 0.92) * Math.PI) * Math.pow(uz, 0.95) * 0.0085
      : 0;

  let vx =
    ux *
    baseRx *
    (1 + parietalSpread - templeIndent + lowerJawFullness) *
    (1 - jawTaperFactor - chinFrontTaper);
  let vy = uy * baseRy;
  let vz = uz * baseRz * (1 - occipitalNeckTuck) + anteriorFacialPlaneBoost;

  // Sculpt anterior facial topography on the front hemisphere (uz > 0.05)
  if (uz > 0.05) {
    const frontWeight = Math.min(1, Math.pow(Math.max(0, (uz - 0.05) / 0.95), 1.15));

    // 3. Smooth Frontal Forehead & Supraorbital Brow Arch
    const foreheadFullness =
      Math.exp(-Math.pow((uy - 0.44) / 0.28, 2)) *
      Math.exp(-Math.pow(ux / 0.65, 2)) *
      0.0042 *
      frontWeight;
    const browArchY = 0.21 + 0.025 * Math.sin(Math.min(1, absX / 0.52) * Math.PI);
    const browRidgeWeight =
      Math.exp(-Math.pow((uy - browArchY) / 0.082, 2)) *
      Math.exp(-Math.pow(ux / 0.56, 2)) *
      (1 - 0.18 * Math.exp(-Math.pow(ux / 0.11, 2)));
    vz += (foreheadFullness + browRidgeWeight * 0.0045) * frontWeight;

    // 4. Deep Smooth Recessed Orbital Eye Sockets (centered at ux ≈ ±0.37, uy ≈ 0.025 -> x ≈ ±0.038, y ≈ 0.138)
    // Gives a clean recessed orbital pocket so the spherical sclera, iris, and eyelids never get clipped by cheek/socket skin
    const eyeSocketDx = (absX - 0.37) / 0.215;
    const eyeSocketDy = (uy - 0.025) / 0.165;
    const eyeSocketDist2 = eyeSocketDx * eyeSocketDx + eyeSocketDy * eyeSocketDy;
    const orbitalRecess = Math.exp(-eyeSocketDist2) * 0.0165 * frontWeight;
    vz -= orbitalRecess;

    // 5. Smooth Continuous Nasal Bridge, Dorsum & Rounded Nasal Tip (along central meridian ux ≈ 0)
    // Spans from glabella (uy = 0.15) down to nasal tip (uy = -0.25, corresponding to y ≈ 0.104)
    const noseWidthSigma = uy > -0.10 ? 0.095 : 0.122;
    const noseLateral = Math.exp(-Math.pow(ux / noseWidthSigma, 2));
    if (uy > -0.36 && uy < 0.18) {
      const tNose = (0.15 - uy) / (0.40 * Math.max(0.85, Math.min(1.18, anatomy.noseBridgeLength)));
      if (tNose > 0 && tNose < 1.15) {
        const bridgeProfile =
          tNose <= 0.85
            ? Math.sin((tNose / 0.85) * (Math.PI * 0.5)) * (0.38 + 0.62 * (tNose / 0.85))
            : Math.max(0, Math.cos(((tNose - 0.85) / 0.30) * (Math.PI * 0.5)));
        const noseProj = 0.0175 * anatomy.noseTipProjection * bridgeProfile * noseLateral * frontWeight;
        vz += noseProj;
        if (tNose > 0.65 && tNose < 1.05) {
          vy -= 0.0018 * bridgeProfile * noseLateral * frontWeight;
        }
      }
    }

    // 6. Smooth Zygomatic Cheekbone Fullness & Gentle Buccal Slope (below the orbital rim so it never encroaches on the eyes)
    const malarDx = (absX - 0.52) / 0.24;
    const malarDy = (uy - -0.22) / 0.19;
    const malarWeight = Math.exp(-(malarDx * malarDx + malarDy * malarDy)) * frontWeight;
    const zygomaticBoost = (anatomy.zygomaticWidthRatio - 0.92) * 0.020 + 0.0032;
    vx += Math.sign(ux) * malarWeight * zygomaticBoost * 0.55;
    vz += malarWeight * zygomaticBoost * 0.62;

    // 7. Subtle Maxillary Cushion & Vertical Philtrum Groove (uy ≈ -0.42 to -0.58)
    const maxillaWeight =
      Math.exp(-Math.pow((uy - -0.50) / 0.15, 2)) *
      Math.exp(-Math.pow(ux / 0.32, 2)) *
      frontWeight;
    const philtrumGroove =
      Math.exp(-Math.pow((uy - -0.40) / 0.085, 2)) *
      Math.exp(-Math.pow(ux / 0.045, 2)) *
      0.0024 *
      frontWeight;
    vz += maxillaWeight * 0.0022 - philtrumGroove;

    // 8. Smooth Integrated Mental Chin Prominence & Labiomental Crease (uy ≈ -0.68 to -0.88)
    const labiomentalCrease =
      Math.exp(-Math.pow((uy - -0.64) / 0.075, 2)) *
      Math.exp(-Math.pow(ux / 0.26, 2)) *
      0.0032 *
      frontWeight;
    const chinBoss =
      Math.exp(-Math.pow((uy - -0.78) / 0.14, 2)) *
      Math.exp(-Math.pow(ux / 0.26, 2)) *
      0.0062 *
      anatomy.chinProminence *
      frontWeight;
    vz += chinBoss - labiomentalCrease;
  }

  // Offset into headGroup local coordinates (centered at y = 0.135, z = 0.002)
  return [
    Number(vx.toFixed(5)),
    Number((vy + 0.135).toFixed(5)),
    Number((vz + 0.002).toFixed(5))
  ];
}

/**
 * Pure smooth vertex displacement field for the articulated TMJ mandible & chin (`jawPivot` local space).
 * Nests seamlessly inside the lower jaw contour at rest so there is zero external crease or bump,
 * and smoothly extends the chin when the jaw drops during speech or expressions.
 */
export function computeSmoothMandibleVertexDisplacement(
  nx: number,
  ny: number,
  nz: number,
  anatomy: NaturalCharacterAnatomySpec
): [number, number, number] {
  const len = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const uz = nz / len;

  // Compact, smooth lower-chin & mandible cushion in jawPivot space (jawPivot is at y = 0.052, z = 0.048 in headGroup)
  const jawRx = 0.048 * anatomy.jawTaperRatio;
  const jawRy = 0.022;
  const jawRz = 0.036;

  const frontChinNarrowing = uz > 0 ? 1 - 0.38 * Math.pow(uz, 1.35) : 1;
  let vx = ux * jawRx * frontChinNarrowing;
  let vy = uy * jawRy;
  let vz = uz * jawRz;

  // Smooth mental chin prominence at the anterior apex
  if (uz > 0.2) {
    const chinWeight =
      Math.exp(-Math.pow(ux / 0.34, 2)) *
      Math.exp(-Math.pow((uy - -0.25) / 0.42, 2)) *
      Math.pow(Math.max(0, (uz - 0.2) / 0.8), 1.3);
    vz += chinWeight * 0.0065 * anatomy.chinProminence;
    vy -= chinWeight * 0.0020 * anatomy.chinProminence;
  }

  if (uz < 0) {
    vz *= 0.42;
  }
  if (uy > 0.2) {
    vy = 0.2 * jawRy + (uy - 0.2) * jawRy * 0.32;
  }

  return [
    Number(vx.toFixed(5)),
    Number((vy - 0.006).toFixed(5)),
    Number((vz - 0.004).toFixed(5))
  ];
}

/**
 * Computes micro-articulated facial rig parameters (eyebrow furrow/height/asymmetry, 4-zone inner/outer brow lift,
 * eye aperture, physiological blink, lower lid squint, pupil dilation, darting gaze saccades, nostril flare,
 * cheek apple raise, anatomical TMJ jaw hinge pitch & drop, upper/lower lip curl & pucker, cheek hollows)
 * bound dynamically to expression presets, tenant disposition, and live speech cadence.
 */
export function computeFacialRigParams(
  expression: FacialExpressionType = 'neutral',
  disposition?: TenantDisposition,
  isSpeaking = false,
  speechCadencePhase = 0,
  hasUnansweredQuestions = false,
  isElderly = false
): FacialRigParams {
  let browFurrow = 0;
  let browHeight = 0;
  let browAsymmetry = 0;
  let eyeAperture = 1.0;
  let upperLidDroop = isElderly ? 0.0035 : 0;
  let lowerLidSquint = 0;
  let eyeGazeX = 0;
  let eyeGazeY = 0;
  let pupilDilation = 1.0;
  let eyelidTremor = 0;
  let nostrilFlare = 0.08;
  let cheekSquintRaise = 0.05;
  let mouthCornerAngle = 0;
  let mouthAsymmetry = 0;
  let mouthAperture = 0;
  let upperLipLift = 0;
  let lowerLipDepress = 0;
  let lipPucker = 0;
  let jawDrop = 0;
  let jawLateralShift = 0;
  let cheekHollow = isElderly ? 0.55 : 0.15;
  let underEyeBags = isElderly;
  const ageWrinkles = isElderly;

  switch (expression) {
    case 'suspicious':
      browFurrow = 0.68;
      browHeight = -0.022;
      browAsymmetry = 0.22;
      eyeAperture = 0.52;
      upperLidDroop = 0.008;
      lowerLidSquint = 0.58;
      eyeGazeX = Math.sin(speechCadencePhase * 0.25) * 0.014;
      pupilDilation = 0.78;
      nostrilFlare = 0.32;
      cheekSquintRaise = 0.35;
      mouthCornerAngle = -0.08;
      mouthAsymmetry = 0.06;
      mouthAperture = 0.04;
      lipPucker = 0.18;
      jawLateralShift = 0.0025;
      cheekHollow = Math.max(cheekHollow, 0.35);
      break;
    case 'weary':
      browFurrow = -0.35;
      browHeight = 0.025;
      eyeAperture = 0.65;
      upperLidDroop = 0.011;
      lowerLidSquint = 0.15;
      eyeGazeY = -0.008;
      pupilDilation = 0.92;
      nostrilFlare = 0.12;
      cheekSquintRaise = 0.04;
      mouthCornerAngle = -0.16;
      mouthAperture = 0.08;
      lowerLipDepress = 0.14;
      cheekHollow = Math.max(cheekHollow, 0.62);
      underEyeBags = true;
      break;
    case 'alarmed':
      browFurrow = -0.68;
      browHeight = 0.058;
      eyeAperture = 1.36;
      upperLidDroop = -0.008;
      lowerLidSquint = 0.12;
      pupilDilation = 0.72;
      nostrilFlare = 0.74;
      cheekSquintRaise = 0.22;
      mouthCornerAngle = -0.1;
      mouthAperture = 0.62;
      upperLipLift = 0.42;
      lowerLipDepress = 0.48;
      jawDrop = 0.048;
      break;
    case 'smirk':
      browFurrow = 0.24;
      browHeight = 0.012;
      browAsymmetry = -0.28;
      eyeAperture = 0.86;
      upperLidDroop = 0.004;
      lowerLidSquint = 0.44;
      nostrilFlare = 0.24;
      cheekSquintRaise = 0.68;
      mouthCornerAngle = 0.19;
      mouthAsymmetry = 0.14;
      mouthAperture = 0.06;
      upperLipLift = 0.18;
      jawLateralShift = 0.003;
      break;
    case 'grimace':
      browFurrow = 0.82;
      browHeight = -0.032;
      eyeAperture = 0.62;
      upperLidDroop = 0.007;
      lowerLidSquint = 0.72;
      nostrilFlare = 0.82;
      cheekSquintRaise = 0.64;
      mouthCornerAngle = -0.2;
      mouthAperture = 0.36;
      upperLipLift = 0.65;
      lowerLipDepress = 0.52;
      jawDrop = 0.025;
      jawLateralShift = -0.0035;
      cheekHollow = Math.max(cheekHollow, 0.5);
      break;
    case 'shocked':
      browFurrow = -0.88;
      browHeight = 0.078;
      eyeAperture = 1.48;
      upperLidDroop = -0.011;
      lowerLidSquint = 0.0;
      pupilDilation = 1.38;
      nostrilFlare = 0.92;
      cheekSquintRaise = 0.18;
      mouthCornerAngle = -0.14;
      mouthAperture = 0.86;
      upperLipLift = 0.55;
      lowerLipDepress = 0.75;
      lipPucker = 0.28;
      jawDrop = 0.082;
      break;
    case 'hollow_stare':
      // Uncanny thousand-yard trance stare with pinpoint pupils & gaunt sunken cheeks
      browFurrow = -0.42;
      browHeight = 0.035;
      eyeAperture = 1.32;
      upperLidDroop = -0.006;
      lowerLidSquint = 0.05;
      eyeGazeY = 0.006;
      pupilDilation = 0.62;
      nostrilFlare = 0.18;
      cheekSquintRaise = 0.0;
      mouthCornerAngle = -0.06;
      mouthAperture = 0.22;
      lowerLipDepress = 0.22;
      jawDrop = 0.018;
      cheekHollow = 0.88;
      underEyeBags = true;
      break;
    case 'side_eye_glare':
      // Furtive sideways glance with raised outer brow & tight lips
      browFurrow = 0.58;
      browHeight = -0.015;
      browAsymmetry = 0.42;
      eyeAperture = 0.58;
      upperLidDroop = 0.007;
      lowerLidSquint = 0.54;
      eyeGazeX = 0.022;
      pupilDilation = 0.76;
      nostrilFlare = 0.38;
      cheekSquintRaise = 0.36;
      mouthCornerAngle = -0.12;
      mouthAsymmetry = -0.1;
      mouthAperture = 0.02;
      lipPucker = 0.22;
      jawLateralShift = -0.003;
      cheekHollow = Math.max(cheekHollow, 0.45);
      break;
    case 'paranoid_twitch':
      // Trembling upper eyelids, darting pupils, nervous grimace
      browFurrow = 0.74;
      browHeight = 0.018;
      browAsymmetry = Math.sin(speechCadencePhase * 3.5) * 0.35;
      eyeAperture = 1.15;
      upperLidDroop = -0.003;
      lowerLidSquint = 0.48;
      eyeGazeX = Math.sin(speechCadencePhase * 2.2) * 0.019;
      eyeGazeY = Math.cos(speechCadencePhase * 1.7) * 0.01;
      pupilDilation = 0.68;
      eyelidTremor = 0.85;
      nostrilFlare = 0.58 + Math.sin(speechCadencePhase * 4.0) * 0.18;
      cheekSquintRaise = 0.42;
      mouthCornerAngle = -0.16;
      mouthAsymmetry = 0.09;
      mouthAperture = 0.18;
      upperLipLift = 0.32;
      jawLateralShift = Math.sin(speechCadencePhase * 2.8) * 0.004;
      underEyeBags = true;
      break;
    case 'cryptic_whisper':
      // Conspiratorial half-lidded gaze, subtle knowing smirk, slight whisper cadence
      browFurrow = 0.32;
      browHeight = 0.01;
      browAsymmetry = 0.25;
      eyeAperture = 0.64;
      upperLidDroop = 0.008;
      lowerLidSquint = 0.38;
      eyeGazeX = -0.012;
      pupilDilation = 1.18;
      nostrilFlare = 0.22;
      cheekSquintRaise = 0.46;
      mouthCornerAngle = 0.14;
      mouthAsymmetry = 0.11;
      mouthAperture = 0.26;
      lipPucker = 0.54;
      jawDrop = 0.015;
      break;
    case 'neutral':
    default:
      browFurrow = 0;
      browHeight = 0;
      eyeAperture = 1.0;
      mouthCornerAngle = 0;
      mouthAperture = 0;
      jawDrop = 0;
      break;
  }

  // Dynamic AI disposition binding (Proposal B)
  if (disposition === 'hostile') {
    browFurrow = Math.min(1.0, browFurrow + 0.35);
    eyeAperture = Math.min(eyeAperture, 0.5);
    lowerLidSquint = Math.min(1.0, lowerLidSquint + 0.35);
    pupilDilation = Math.min(pupilDilation, 0.75);
    nostrilFlare = Math.min(1.0, nostrilFlare + 0.35);
    upperLipLift = Math.min(1.0, upperLipLift + 0.25);
    mouthCornerAngle -= 0.12;
  } else if (disposition === 'cold') {
    browFurrow = Math.min(0.8, browFurrow + 0.2);
    eyeAperture = Math.min(eyeAperture, 0.65);
    lowerLidSquint = Math.min(1.0, lowerLidSquint + 0.2);
    eyeGazeX = eyeGazeX || 0.015;
    mouthCornerAngle -= 0.08;
  } else if (disposition === 'confidant') {
    browFurrow = Math.max(-0.2, browFurrow - 0.2);
    pupilDilation = Math.max(pupilDilation, 1.08);
    cheekSquintRaise = Math.min(1.0, cheekSquintRaise + 0.28);
    mouthCornerAngle += 0.14;
  }

  // Multi-day unanswered question effect (tenant looks troubled/weary while waiting)
  if (hasUnansweredQuestions) {
    underEyeBags = true;
    browFurrow = Math.max(-0.45, browFurrow - 0.18);
    upperLidDroop += 0.004;
    mouthCornerAngle -= 0.09;
  }

  // Live speaking multi-band viseme cadence (jaw syllable pulse + lip rounding + expressive brow sync)
  if (isSpeaking) {
    const syllableWave = Math.sin(speechCadencePhase * 14);
    const bilabialWave = Math.cos(speechCadencePhase * 9.5);
    const emphasisWave = Math.sin(speechCadencePhase * 3.8);

    const speechJaw = Math.max(0, syllableWave * 0.05 + 0.03);
    jawDrop = Math.max(jawDrop, speechJaw);
    mouthAperture = Math.max(mouthAperture, 0.4 + syllableWave * 0.2);
    upperLipLift = Math.max(upperLipLift, Math.max(0, syllableWave * 0.38 + 0.16));
    lowerLipDepress = Math.max(lowerLipDepress, Math.max(0, syllableWave * 0.46 + 0.2));
    lipPucker = Math.max(lipPucker, Math.max(0, bilabialWave * 0.42));
    nostrilFlare = Math.min(1.0, nostrilFlare + Math.max(0, emphasisWave * 0.18));
    cheekSquintRaise = Math.min(1.0, cheekSquintRaise + Math.max(0, syllableWave * 0.16));
    browHeight += Math.max(0, emphasisWave * 0.008);
  }

  // Periodic natural physiological blink & subtle ocular micro-saccades when animated (speechCadencePhase > 0)
  let blinkAmount = 0;
  let headMicroNod = 0;
  let headMicroTilt = 0;
  if (speechCadencePhase > 0) {
    // Physiological blink every ~4.2 seconds (speechCadencePhase advances at 12 * timeSec -> cycle period ~50.4 rad)
    const blinkCycle = ((speechCadencePhase % 50.4) + 50.4) % 50.4;
    if (blinkCycle > 47.8) {
      const t = (blinkCycle - 47.8) / 2.6; // 0..1 fast close and smooth open
      blinkAmount = Math.sin(t * Math.PI);
    }
    // Secondary double-blink on every 3rd cycle for lifelike realism
    const longCycle = ((speechCadencePhase % 151.2) + 151.2) % 151.2;
    if (longCycle > 144.0 && longCycle < 146.2) {
      const t2 = (longCycle - 144.0) / 2.2;
      blinkAmount = Math.max(blinkAmount, Math.sin(t2 * Math.PI) * 0.88);
    }

    // Subtle organic gaze micro-saccades when not locked in hollow_stare
    if (expression !== 'hollow_stare') {
      eyeGazeX += Math.sin(speechCadencePhase * 0.42) * 0.0032;
      eyeGazeY += Math.cos(speechCadencePhase * 0.31) * 0.0022;
    }

    headMicroNod = Math.sin(speechCadencePhase * (isSpeaking ? 1.8 : 0.35)) * (isSpeaking ? 0.028 : 0.008);
    headMicroTilt = Math.cos(speechCadencePhase * (isSpeaking ? 1.1 : 0.24)) * (isSpeaking ? 0.022 : 0.006);
  }

  // 4-Zone Independent Medial (Inner) & Lateral (Outer) Eyebrow Articulation
  // Negative browFurrow = worried/surprised arch (inner brow lifts strongly); Positive browFurrow = angry/suspicious scowl (inner brow pulls down, outer arches)
  const innerFurrowOffset = -browFurrow * 0.014;
  const outerFurrowOffset = browFurrow > 0 ? browFurrow * 0.006 : -browFurrow * 0.008;
  const browInnerLiftL = browHeight + innerFurrowOffset;
  const browInnerLiftR = browHeight + innerFurrowOffset + browAsymmetry * 0.018;
  const browOuterLiftL = browHeight + outerFurrowOffset - browAsymmetry * 0.008;
  const browOuterLiftR = browHeight + outerFurrowOffset + browAsymmetry * 0.032;

  const browRollL = -browFurrow * 0.28;
  const browRollR = browFurrow * 0.28 + browAsymmetry * 0.45;

  // Independent Left & Right Lip Corner Pulls (Zygomaticus major vs Depressor anguli oris)
  const lipCornerPullL = mouthCornerAngle * 0.035 - mouthAsymmetry * 0.038;
  const lipCornerPullR = mouthCornerAngle * 0.035 + mouthAsymmetry * 0.038;

  // Anatomical TMJ Jaw Pitch Rotation (hinges backward and downward around condyle)
  const jawPitchRad = Math.min(0.52, jawDrop * 4.2 + mouthAperture * 0.14);
  const tongueVisible = mouthAperture > 0.28 || jawDrop > 0.025 ? Math.min(1, (mouthAperture - 0.15) * 1.15) : 0;

  return {
    expression,
    browFurrow,
    browHeight,
    browAsymmetry,
    browInnerLiftL,
    browInnerLiftR,
    browOuterLiftL,
    browOuterLiftR,
    browRollL,
    browRollR,
    eyeAperture,
    blinkAmount,
    upperLidDroop,
    lowerLidSquint,
    eyeGazeX,
    eyeGazeY,
    pupilDilation,
    eyelidTremor,
    nostrilFlare,
    cheekSquintRaise,
    mouthCornerAngle,
    mouthAsymmetry,
    mouthAperture,
    upperLipLift,
    lowerLipDepress,
    lipPucker,
    lipCornerPullL,
    lipCornerPullR,
    jawDrop,
    jawPitchRad,
    jawLateralShift,
    tongueVisible,
    headMicroNod,
    headMicroTilt,
    cheekHollow,
    underEyeBags,
    ageWrinkles
  };
}

/**
 * Computes forward kinematic skeletal angles (Euler radians) for hierarchical bone movement:
 * Pelvis -> L1 Lumbar Spine -> T6 Lower Thoracic -> T1 Upper Thoracic (with bent spine kyphosis)
 * -> C4 Cervical Neck -> Head, symmetrically articulated arms/wrists, and walking strides or activity gestures.
 */
export function computeSkeletonPose(
  timeSec: number,
  isWalking = false,
  spineCurvatureDeg = 0,
  hasWalkingCane = false,
  isSpeaking = false,
  activityGesture: ScheduledActivityGesture = 'idle_observe'
): SkeletonPoseEuler {
  const safeCurvature = Math.max(0, Math.min(48, spineCurvatureDeg));
  const kyphosisRad = (safeCurvature * Math.PI) / 180;

  // Multi-vertebrae spine posture: L1 lumbar, T6 lower thoracic, T1 upper thoracic curve progressively forward;
  // C4 cervical neck counter-pitches so gaze stays level despite the hunched back
  let lumbarX = -kyphosisRad * 0.18;
  let lowerThoracicX = -kyphosisRad * 0.36;
  let thoracicX = -kyphosisRad * 0.48;
  let neckX = kyphosisRad * 0.76; // counter-pitch so gaze stays level
  let headX = kyphosisRad * 0.09;
  let headZ = 0;

  let pelvisY = 0.90;
  let lumbarY = 0;
  let thoracicY = 0;
  let thoracicZ = 0;
  let neckY = 0;
  let headY = 0;

  let leftClavicleZ = 0;
  let leftUpperArmX = 0.03;
  let leftUpperArmZ = -0.07;
  let leftForearmX = -0.14;
  let leftHandZ = 0.05;

  let rightClavicleZ = 0;
  let rightUpperArmX = 0.03;
  let rightUpperArmZ = 0.07;
  let rightForearmX = -0.14;
  let rightHandZ = -0.05;

  let leftThighX = 0;
  let leftCalfX = 0;
  let leftFootX = 0;

  let rightThighX = 0;
  let rightCalfX = 0;
  let rightFootX = 0;

  // Bent spine elderly stance slightly flexes knees & ankles to balance center of mass over the cane
  if (safeCurvature > 12) {
    const crouchFactor = (safeCurvature / 48) * 0.16;
    leftThighX += crouchFactor;
    leftCalfX -= crouchFactor * 1.25;
    leftFootX += crouchFactor * 0.35;
    rightThighX += crouchFactor;
    rightCalfX -= crouchFactor * 1.25;
    rightFootX += crouchFactor * 0.35;
    pelvisY -= crouchFactor * 0.28;
  }

  const effectiveWalking = isWalking || activityGesture === 'pace_corridor';

  if (activityGesture === 'run') {
    const runFreq = 7.8;
    const phase = timeSec * runFreq;
    const strideSwing = 0.78;

    pelvisY += Math.abs(Math.sin(phase)) * 0.055 - 0.04;
    lumbarX -= 0.16;
    thoracicX -= 0.14;
    neckX += 0.22;
    lumbarY = Math.sin(phase) * 0.14;
    thoracicY = -lumbarY * 0.8;

    leftThighX = Math.sin(phase) * strideSwing + 0.12;
    leftCalfX = -Math.max(0.15, -Math.sin(phase) * 0.95);
    leftFootX = Math.cos(phase) * 0.28;

    rightThighX = -Math.sin(phase) * strideSwing + 0.12;
    rightCalfX = -Math.max(0.15, Math.sin(phase) * 0.95);
    rightFootX = -Math.cos(phase) * 0.28;

    leftUpperArmX = -Math.sin(phase) * 0.68;
    leftForearmX = -1.15;
    rightUpperArmX = Math.sin(phase) * 0.68;
    rightForearmX = -1.15;
  } else if (activityGesture === 'crawl') {
    const crawlFreq = 4.2;
    const phase = timeSec * crawlFreq;
    pelvisY = 0.36 + Math.sin(phase * 2) * 0.018;
    lumbarX = -1.15;
    lowerThoracicX = -0.25;
    thoracicX = -0.15;
    neckX = 1.15;
    headX = 0.18;

    leftUpperArmX = 1.25 + Math.sin(phase) * 0.38;
    leftForearmX = -0.45;
    rightUpperArmX = 1.25 - Math.sin(phase) * 0.38;
    rightForearmX = -0.45;

    leftThighX = 1.15 - Math.sin(phase) * 0.35;
    leftCalfX = -1.35;
    rightThighX = 1.15 + Math.sin(phase) * 0.35;
    rightCalfX = -1.35;
  } else if (activityGesture === 'sit_chair') {
    const breathPhase = timeSec * 1.2;
    pelvisY = 0.54;
    lumbarX = -0.05;
    thoracicX = -0.04 + Math.sin(breathPhase) * 0.015;
    headY = Math.sin(timeSec * 0.6) * 0.06;

    // 90-degree seated hip and knee bend
    leftThighX = 1.48;
    leftCalfX = -1.48;
    leftFootX = 0.04;
    rightThighX = 1.48;
    rightCalfX = -1.48;
    rightFootX = 0.04;

    // Hands resting on armrests / lap
    leftUpperArmX = 0.24;
    leftUpperArmZ = 0.14;
    leftForearmX = -0.92;
    rightUpperArmX = 0.24;
    rightUpperArmZ = -0.14;
    rightForearmX = -0.92;
  } else if (activityGesture === 'lay_bed') {
    const breathPhase = timeSec * 0.95;
    pelvisY = 0.56;
    lumbarX = 1.42;
    lowerThoracicX = 0.08;
    thoracicX = 0.05 + Math.sin(breathPhase) * 0.018;
    neckX = -0.18;
    headY = Math.sin(breathPhase * 0.5) * 0.04;

    leftThighX = -1.38;
    leftCalfX = -0.08;
    rightThighX = -1.38;
    rightCalfX = -0.08;

    leftUpperArmX = -0.12;
    leftUpperArmZ = 0.18;
    leftForearmX = -0.35;
    rightUpperArmX = -0.12;
    rightUpperArmZ = -0.18;
    rightForearmX = -0.35;
  } else if (activityGesture === 'press_button') {
    // Shared reach out and touch animation for every button-activated asset
    const reachPulse = Math.sin(timeSec * 3.2) * 0.5 + 0.5;
    lumbarX -= 0.08 * reachPulse;
    thoracicX -= 0.1 * reachPulse;
    thoracicY = -0.12 * reachPulse;
    headX -= 0.06;

    rightClavicleZ = -0.08 * reachPulse;
    rightUpperArmX = 1.12 + 0.22 * reachPulse;
    rightUpperArmZ = -0.04;
    rightForearmX = -0.32 + 0.18 * reachPulse;
    rightHandZ = -0.12;

    leftUpperArmX = 0.12;
    leftForearmX = -0.38;
  } else if (activityGesture === 'open_door') {
    // Reach out, twist brass handle, and pull/push door swing
    const swingPhase = Math.sin(timeSec * 2.4);
    lumbarY = -0.18 * swingPhase;
    thoracicX -= 0.12;
    rightUpperArmX = 1.05 + swingPhase * 0.28;
    rightForearmX = -0.58 + swingPhase * 0.2;
    rightHandZ = swingPhase * 0.35; // handle turn twist
    leftUpperArmX = 0.18;
    leftForearmX = -0.42;
  } else if (activityGesture === 'pickup_item') {
    // Squat/bend down and reach with both hands to place/pickup an item
    const dip = Math.sin(timeSec * 2.2) * 0.5 + 0.5;
    pelvisY -= 0.24 * dip;
    lumbarX -= 0.38 * dip;
    thoracicX -= 0.28 * dip;
    neckX += 0.42 * dip;

    leftThighX += 0.62 * dip;
    leftCalfX -= 1.08 * dip;
    rightThighX += 0.62 * dip;
    rightCalfX -= 1.08 * dip;

    leftUpperArmX = 0.95 * dip;
    leftForearmX = -0.42 * dip;
    rightUpperArmX = 1.05 * dip;
    rightForearmX = -0.45 * dip;
  } else if (effectiveWalking) {
    const strideFreq = safeCurvature > 20 ? 3.6 : 4.8;
    const phase = timeSec * strideFreq;
    const strideSwing = safeCurvature > 20 ? 0.32 : 0.44;

    pelvisY += Math.sin(phase * 2) * 0.022;
    lumbarY = Math.sin(phase) * 0.08;
    thoracicY = -lumbarY * 0.65;

    // Reciprocal leg kinematics
    leftThighX += Math.sin(phase) * strideSwing;
    leftCalfX += Math.max(0, -Math.sin(phase)) * 0.58;
    leftFootX += Math.cos(phase) * 0.18;

    rightThighX += -Math.sin(phase) * strideSwing;
    rightCalfX += Math.max(0, Math.sin(phase)) * 0.58;
    rightFootX += -Math.cos(phase) * 0.18;

    // Reciprocal arm kinematics
    leftUpperArmX += -Math.sin(phase) * (strideSwing * 0.75);
    leftForearmX = -0.25 - Math.max(0, -Math.sin(phase)) * 0.22;

    if (hasWalkingCane) {
      // Right arm holds cane and plants it forward synchronously with left leg / right stride
      const caneSwing = Math.sin(phase) * 0.2 + 0.34;
      rightUpperArmX = caneSwing;
      rightForearmX = -0.48;
      rightHandZ = -0.08;
    } else {
      rightUpperArmX += Math.sin(phase) * (strideSwing * 0.75);
      rightForearmX = -0.25 - Math.max(0, Math.sin(phase)) * 0.22;
    }
  } else {
    // Idle breathing & gentle postural weight-shifting + scheduled activity gestures
    const breathPhase = timeSec * 1.35;
    const breathExpansion = Math.sin(breathPhase) * 0.018;
    lowerThoracicX += breathExpansion * 0.5;
    thoracicX += breathExpansion;
    pelvisY += breathExpansion * 0.12;

    const swayPhase = timeSec * 0.7;
    headY = Math.sin(swayPhase) * 0.05;
    lumbarY = Math.sin(swayPhase * 0.5) * 0.028;

    if (activityGesture === 'wall_listen') {
      // Leaning sideways with ear tilted toward the wall / wainscot
      thoracicZ = 0.14;
      headZ = 0.24;
      headY = 0.36;
      leftUpperArmX = 0.45;
      leftForearmX = -0.85;
    } else if (activityGesture === 'inspect_ledger') {
      // Looking down at ledger/notes with left hand raised holding a folio
      neckX -= 0.18;
      headX -= 0.12;
      leftUpperArmX = 0.52;
      leftForearmX = -0.95;
      leftHandZ = 0.25;
    } else if (activityGesture === 'parlor_social') {
      // Expressive parlor conversation posture
      headY = Math.sin(timeSec * 1.1) * 0.12;
      leftUpperArmX = 0.22 + Math.sin(timeSec * 1.5) * 0.08;
      leftForearmX = -0.55;
    } else if (activityGesture === 'sleepwalk_trance') {
      // Eerie swaying trance with outstretched arms
      thoracicZ = Math.sin(timeSec * 0.9) * 0.06;
      headX += 0.12;
      leftUpperArmX = 1.15;
      rightUpperArmX = 1.15;
    }

    if (hasWalkingCane) {
      // Right hand rest-grips cane at side
      rightUpperArmX = 0.28;
      rightUpperArmZ = -0.12;
      rightForearmX = -0.52;
      rightHandZ = -0.06;
    }
  }

  if (isSpeaking) {
    headX += Math.sin(timeSec * 8) * 0.028;
    headZ += Math.cos(timeSec * 5) * 0.018;
    leftForearmX -= Math.abs(Math.sin(timeSec * 4)) * 0.12;
  }

  return {
    pelvisY,
    spineLumbarX: lumbarX,
    spineLumbarY: lumbarY,
    spineLowerThoracicX: lowerThoracicX,
    spineThoracicX: thoracicX,
    spineThoracicY: thoracicY,
    spineThoracicZ: thoracicZ,
    neckX,
    neckY,
    headX,
    headY,
    headZ,
    leftClavicleZ,
    leftUpperArmX,
    leftUpperArmZ,
    leftForearmX,
    leftHandZ,
    rightClavicleZ,
    rightUpperArmX,
    rightUpperArmZ,
    rightForearmX,
    rightHandZ,
    leftThighX,
    leftCalfX,
    leftFootX,
    rightThighX,
    rightCalfX,
    rightFootX,
    caneGripActive: hasWalkingCane
  };
}

/**
 * Returns preset defaults for archetypes, such as the stooped 'Elderly Matron' with bent spine and walking cane.
 */
export function getArchetypeDefaults(archetype: CharacterArchetype): Partial<CharacterAppearance> {
  switch (archetype) {
    case 'Elderly Matron':
      return {
        archetype: 'Elderly Matron',
        headShape: 'proportional_human',
        bodyProportionStyle: 'proportional_human',
        spineCurvature: 34,
        hasWalkingCane: true,
        hasSpectacles: true,
        facialExpression: 'weary',
        hairStyle: 'silver_bun',
        hairColor: '#d1d5db',
        skinColor: '#eed8c7',
        outfitColor: '#4b5563',
        secondaryClothingColor: '#292e37',
        accentColor: '#b45309',
        clothingStyle: 'knitted_cardigan_shawl',
        clothingPattern: 'ribbed_knit',
        heightScale: 0.94,
        widthScale: 0.98,
        headScale: 1.0
      };
    case 'Long-Term Resident':
      return {
        archetype: 'Long-Term Resident',
        headShape: 'proportional_human',
        bodyProportionStyle: 'proportional_human',
        spineCurvature: 18,
        hasWalkingCane: false,
        hasSpectacles: true,
        facialExpression: 'suspicious',
        hairStyle: 'messy_curls',
        hairColor: '#6b7280',
        skinColor: '#ebd5c1',
        outfitColor: '#374151',
        secondaryClothingColor: '#1f2631',
        accentColor: '#eab308',
        clothingStyle: 'tailored_three_piece',
        clothingPattern: 'pinstripe',
        heightScale: 1.0,
        widthScale: 1.0,
        headScale: 1.0
      };
    case 'Night Bellhop':
      return {
        archetype: 'Night Bellhop',
        headShape: 'proportional_human',
        bodyProportionStyle: 'proportional_human',
        spineCurvature: 0,
        hasWalkingCane: false,
        hasSpectacles: false,
        facialExpression: 'alarmed',
        hairStyle: 'bowler_hat',
        hairColor: '#1f2937',
        skinColor: '#f5d0b5',
        outfitColor: '#831843',
        secondaryClothingColor: '#27141a',
        accentColor: '#fbbf24',
        clothingStyle: 'bellhop_brass_tunic',
        clothingPattern: 'solid',
        heightScale: 1.04,
        widthScale: 0.96,
        headScale: 1.0
      };
    case 'Occult Archivist':
      return {
        archetype: 'Occult Archivist',
        headShape: 'proportional_human',
        bodyProportionStyle: 'proportional_human',
        spineCurvature: 12,
        hasWalkingCane: false,
        hasSpectacles: true,
        facialExpression: 'grimace',
        hairStyle: 'bob_cut',
        hairColor: '#1e293b',
        skinColor: '#f1dcd0',
        outfitColor: '#312e81',
        secondaryClothingColor: '#1e1b2e',
        accentColor: '#38bdf8',
        clothingStyle: 'ribbed_turtleneck_blazer',
        clothingPattern: 'herringbone',
        heightScale: 0.98,
        widthScale: 0.95,
        headScale: 1.0
      };
    case ' eccentric Socialite':
    case 'Eccentric Socialite':
      return {
        archetype: 'Eccentric Socialite',
        headShape: 'proportional_human',
        bodyProportionStyle: 'proportional_human',
        spineCurvature: 0,
        hasWalkingCane: false,
        hasSpectacles: true,
        facialExpression: 'smirk',
        hairStyle: 'swept_pompadour',
        hairColor: '#b45309',
        skinColor: '#fce7f3',
        outfitColor: '#701a75',
        secondaryClothingColor: '#211324',
        accentColor: '#facc15',
        clothingStyle: 'velvet_evening_ensemble',
        clothingPattern: 'solid',
        heightScale: 1.02,
        widthScale: 0.96,
        headScale: 1.0
      };
    case 'Detective Clerk':
    default:
      return {
        archetype: 'Detective Clerk',
        headShape: 'proportional_human',
        bodyProportionStyle: 'proportional_human',
        spineCurvature: 0,
        hasWalkingCane: false,
        hasSpectacles: false,
        facialExpression: 'neutral',
        hairStyle: 'swept_pompadour',
        hairColor: '#451a03',
        skinColor: '#f3d9c4',
        outfitColor: '#78350f',
        secondaryClothingColor: '#262320',
        accentColor: '#eab308',
        clothingStyle: 'noir_trench_coat',
        clothingPattern: 'herringbone',
        heightScale: 1.0,
        widthScale: 1.0,
        headScale: 1.0
      };
  }
}

/**
 * Pure smooth anatomical torso & pelvis cross-section sculptor.
 * Given circumferential angle `thetaRad` (0 = +Z front, PI/2 = +X right, PI = -Z back)
 * and vertical normalized height `vNorm` in [0, 1] for either `'pelvis'`, `'abdomen'`, or `'thorax'`,
 * returns `[x, yOffset, z]` in character meters so the torso has organic human pectoral/clavicle
 * contours, sternum valley, latissimus V-taper, scapular back fullness, and natural garment drape
 * instead of cylindrical tubes with stuck-on spheres.
 */
export function computeSmoothTorsoVertexDisplacement(
  thetaRad: number,
  vNorm: number,
  segmentKind: 'pelvis' | 'abdomen' | 'thorax',
  anatomy: NaturalCharacterAnatomySpec,
  clothingStyle: CharacterClothingStyleId = 'noir_trench_coat'
): [number, number, number] {
  const v = Math.max(0, Math.min(1, vNorm));
  const sinT = Math.sin(thetaRad); // +X lateral
  const cosT = Math.cos(thetaRad); // +Z anterior (+1 front, -1 back)
  const absSin = Math.abs(sinT);

  // Coat fullness modifier based on garment weight
  const coatBulk =
    clothingStyle === 'noir_trench_coat' || clothingStyle === 'boiler_utility_jacket'
      ? 1.045
      : clothingStyle === 'knitted_cardigan_shawl' || clothingStyle === 'velvet_evening_ensemble'
      ? 1.03
      : clothingStyle === 'rolled_sleeve_waistcoat'
      ? 0.975
      : 1.0;

  if (segmentKind === 'pelvis') {
    // Pelvis / hip block: wider laterally (iliac crest), natural gluteal fullness in back (-Z), flatter lower abdomen in front (+Z)
    const hipCurve = Math.sin(v * Math.PI);
    const widthRx = (0.146 + 0.018 * hipCurve) * anatomy.hipFlareRatio * coatBulk;
    const depthRz = (0.102 + 0.014 * hipCurve) * anatomy.hipFlareRatio * coatBulk;

    const gluteBulge =
      cosT < 0
        ? Math.pow(-cosT, 1.6) * Math.exp(-Math.pow((v - 0.48) / 0.34, 2)) * 0.022 * anatomy.hipFlareRatio
        : 0;
    const gluteCleft =
      cosT < -0.7
        ? -Math.exp(-Math.pow(sinT / 0.14, 2)) *
          Math.exp(-Math.pow((v - 0.42) / 0.3, 2)) *
          0.008
        : 0;
    const anteriorFlat =
      cosT > 0 ? -Math.pow(cosT, 1.5) * (1 - v * 0.35) * 0.007 : 0;

    // Subtle fabric vertical pleat ripple
    const fabricDrape = Math.sin(thetaRad * 6) * 0.0018 * (1 - v * 0.5);

    const x = sinT * (widthRx + fabricDrape);
    const z = cosT * (depthRz + fabricDrape) - gluteBulge - gluteCleft + anteriorFlat;
    return [x, 0, z];
  }

  if (segmentKind === 'abdomen') {
    // Waist to lower ribcage transition: smooth anatomical taper from waist (v=0.35) up to lower ribs (v=1.0)
    const waistDip = Math.exp(-Math.pow((v - 0.32) / 0.38, 2));
    const ribFlare = Math.pow(v, 1.35);

    const baseRx =
      (0.145 * (1 - 0.14 * waistDip) + 0.022 * ribFlare) *
      anatomy.waistTaperRatio *
      coatBulk;
    const baseRz =
      (0.104 * (1 - 0.12 * waistDip) + 0.014 * ribFlare) *
      anatomy.waistTaperRatio *
      coatBulk;

    // Lumbar lordosis curve (slight inward curve at lower back, slight abdominal contour in front)
    const lumbarShiftZ = Math.sin(v * Math.PI) * 0.006;
    // Oblique lateral muscle contour
    const obliqueContour = Math.pow(absSin, 2.2) * Math.sin(v * Math.PI) * 0.007;
    // Natural garment gather near waist belt line
    const beltGather = Math.cos(thetaRad * 8) * Math.exp(-Math.pow((v - 0.25) / 0.22, 2)) * 0.0024;

    const x = sinT * (baseRx + obliqueContour + beltGather);
    const z = cosT * (baseRz + beltGather) + lumbarShiftZ;
    return [x, 0, z];
  }

  // 'thorax' — Upper torso, ribcage, pectorals, sternum valley, scapula, and sloped clavicular/deltoid shoulders
  const vClamped = Math.max(0, Math.min(1, v));
  // Smooth V-taper from lower ribs (v=0) up to broad shoulders (v=0.78), then gentle slope into neck base (v=1.0)
  const shoulderEnvelope =
    vClamped < 0.82
      ? Math.sin((vClamped / 0.82) * (Math.PI * 0.5))
      : 1.0 - Math.pow((vClamped - 0.82) / 0.18, 1.6) * 0.36;

  const widthRx =
    (0.142 + 0.064 * shoulderEnvelope) * anatomy.shoulderBreadthRatio * coatBulk;
  const depthRz =
    (0.104 + 0.024 * Math.sin(vClamped * Math.PI * 0.78)) * coatBulk;

  // Integrated smooth pectoral contour on anterior chest (+Z, v around 0.45..0.76, lateral |sinT| around 0.28..0.68)
  const isFront = cosT > 0;
  const pecHeightEnv = Math.exp(-Math.pow((vClamped - 0.58) / 0.23, 2));
  const pecLatEnv = Math.exp(-Math.pow((absSin - 0.44) / 0.24, 2));
  const sternumDepression =
    isFront && absSin < 0.22
      ? -Math.exp(-Math.pow(absSin / 0.13, 2)) * pecHeightEnv * 0.008
      : 0;
  const pectoralProjection =
    isFront ? Math.pow(cosT, 1.25) * pecHeightEnv * pecLatEnv * 0.018 : 0;

  // Clavicle ridge near top front (v around 0.84)
  const clavicleRidge =
    isFront && vClamped > 0.72
      ? Math.exp(-Math.pow((vClamped - 0.84) / 0.08, 2)) *
        Math.exp(-Math.pow((absSin - 0.48) / 0.28, 2)) *
        0.007
      : 0;

  // Scapular / upper trapezius fullness on posterior back (-Z, v around 0.52..0.82)
  const isBack = cosT < 0;
  const scapulaEnv =
    isBack
      ? Math.pow(-cosT, 1.3) *
        Math.exp(-Math.pow((vClamped - 0.64) / 0.25, 2)) *
        Math.exp(-Math.pow((absSin - 0.42) / 0.26, 2)) *
        0.014
      : 0;
  const thoracicSpineGroove =
    isBack && absSin < 0.18
      ? -Math.exp(-Math.pow(absSin / 0.1, 2)) *
        Math.exp(-Math.pow((vClamped - 0.55) / 0.35, 2)) *
        0.006
      : 0;

  // Natural sloped trapezius/shoulder height drop at outer lateral edges near top of thorax
  const shoulderSlopeY =
    vClamped > 0.72 ? -Math.pow(absSin, 1.6) * ((vClamped - 0.72) / 0.28) * 0.018 : 0;

  // Subtle vertical tailored seam & drape micro-contour
  const tailoredDrape = Math.cos(thetaRad * 4) * 0.0022 * Math.sin(vClamped * Math.PI);

  const x = sinT * (widthRx + tailoredDrape);
  const z =
    cosT * (depthRz + tailoredDrape) +
    pectoralProjection +
    sternumDepression +
    clavicleRidge -
    scapulaEnv -
    thoracicSpineGroove;

  return [x, shoulderSlopeY, z];
}

/**
 * Complete catalog of 12 period-authentic 3D Character Hair Styles & Headwear.
 */
export const CHARACTER_HAIR_STYLES: readonly CharacterHairStyleMetadata[] = [
  {
    id: 'swept_pompadour',
    label: 'Swept Noir Pompadour',
    shortLabel: 'Noir Pompadour',
    category: 'short_tailored',
    description: 'Voluminous side-swept crest above the forehead hairline with tapered temple sideburns.',
    defaultHairColor: '#451a03',
    icon: '💈'
  },
  {
    id: 'slicked_side_part',
    label: 'Slicked Executive Side-Part',
    shortLabel: 'Slicked Side-Part',
    category: 'short_tailored',
    description: 'Razor-parted 1970s comb-over with smooth pomade sheen and neat temple taper.',
    defaultHairColor: '#27170c',
    icon: '🪮'
  },
  {
    id: 'messy_curls',
    label: 'Tousled Bohemian Curls',
    shortLabel: 'Bohemian Curls',
    category: 'medium_textured',
    description: 'Layered organic ringlets and textured curls framing the crown and temples.',
    defaultHairColor: '#5c2d16',
    icon: '🌀'
  },
  {
    id: 'bob_cut',
    label: 'Chin-Length Pageboy Bob',
    shortLabel: 'Pageboy Bob',
    category: 'medium_textured',
    description: 'Sculpted symmetrical jaw-length bob with a soft feathered upper brow fringe.',
    defaultHairColor: '#1f2937',
    icon: '💇'
  },
  {
    id: 'feathered_shag_70s',
    label: '1978 Feathered Curtain Shag',
    shortLabel: '78 Feathered Shag',
    category: 'medium_textured',
    description: 'Iconic late-1970s center-parted feathered wings with layered shoulder-grazing locks.',
    defaultHairColor: '#92400e',
    icon: '✨'
  },
  {
    id: 'wavy_shoulder_cascade',
    label: 'Sculpted Veronica Waves',
    shortLabel: 'Veronica Waves',
    category: 'updo_long',
    description: 'Flowing S-wave cinema glamour locks cascading smoothly past the collarbones.',
    defaultHairColor: '#b45309',
    icon: '🌊'
  },
  {
    id: 'braided_crown_chignon',
    label: 'Braided Low Chignon & Pin',
    shortLabel: 'Braided Chignon',
    category: 'updo_long',
    description: 'Woven crown braid gathered into a low sculptural nape chignon secured with a brass pin.',
    defaultHairColor: '#3f2314',
    icon: '🎀'
  },
  {
    id: 'silver_bun',
    label: 'Matron High Chignon Bun',
    shortLabel: 'High Chignon Bun',
    category: 'updo_long',
    description: 'Dignified high occipital bun with swept temple waves and ornamental hairpin.',
    defaultHairColor: '#cbd5e1',
    icon: '👑'
  },
  {
    id: 'permed_silver',
    label: 'Bouffant Salon Perm',
    shortLabel: 'Salon Bouffant',
    category: 'medium_textured',
    description: 'Voluminous curled salon bouffant halo with lifted crown silhouette.',
    defaultHairColor: '#d1d5db',
    icon: '☁️'
  },
  {
    id: 'cropped_buzz_fade',
    label: 'Close-Cropped Taper Fade',
    shortLabel: 'Cropped Fade',
    category: 'short_tailored',
    description: 'Clean close-shorn crown with crisp hairline contour and subtle temple fade.',
    defaultHairColor: '#1c1917',
    icon: '✂️'
  },
  {
    id: 'bowler_hat',
    label: 'Tarnished Bowler & Hatband',
    shortLabel: 'Bowler Derby',
    category: 'vintage_headwear',
    description: 'Classic rounded felt bowler derby hat accented with a brass-trimmed grosgrain ribbon.',
    defaultHairColor: '#3b2314',
    icon: '🎩'
  },
  {
    id: 'noir_fedora',
    label: 'Tilted Detective Fedora',
    shortLabel: 'Noir Fedora',
    category: 'vintage_headwear',
    description: 'Pinched-crown 1970s investigative fedora with angled wide brim and silk band.',
    defaultHairColor: '#3b2314',
    icon: '🕵️'
  }
];

export const CHARACTER_HAIR_COLOR_SWATCHES: readonly CharacterHairColorSwatch[] = [
  { id: 'raven_black', label: 'Raven Black', hex: '#18181b' },
  { id: 'espresso_umber', label: 'Espresso Umber', hex: '#3b1d0e' },
  { id: 'warm_chestnut', label: 'Warm Chestnut', hex: '#78350f' },
  { id: 'auburn_copper', label: 'Auburn Copper', hex: '#9a3412' },
  { id: 'honey_blonde', label: 'Honey Blonde', hex: '#d97706' },
  { id: 'champagne_ash', label: 'Champagne Ash', hex: '#fde68a' },
  { id: 'salt_and_pepper', label: 'Salt & Pepper', hex: '#64748b' },
  { id: 'silver_frost', label: 'Silver Frost', hex: '#cbd5e1' }
];

const VALID_HAIR_STYLE_IDS = new Set<CharacterHairStyleId>(
  CHARACTER_HAIR_STYLES.map((s) => s.id)
);

export function resolveCharacterHairStyle(
  appearance?: Partial<CharacterAppearance> | null
): CharacterHairStyleId {
  const candidate = appearance?.hairStyle;
  if (candidate && VALID_HAIR_STYLE_IDS.has(candidate)) {
    return candidate;
  }
  if (appearance?.archetype === 'Elderly Matron') return 'silver_bun';
  if (appearance?.archetype === 'Night Bellhop') return 'bowler_hat';
  if (appearance?.archetype === 'Occult Archivist') return 'bob_cut';
  if (appearance?.archetype === 'Long-Term Resident') return 'messy_curls';
  return 'swept_pompadour';
}

export function getCharacterHairStyleMeta(
  styleId?: CharacterHairStyleId | string | null
): CharacterHairStyleMetadata {
  const found = CHARACTER_HAIR_STYLES.find((s) => s.id === styleId);
  return found || CHARACTER_HAIR_STYLES[0];
}

/**
 * Pure helper to step forward ('next') or backward ('prev') through CHARACTER_HAIR_STYLES.
 */
export function cycleCharacterHairStyle(
  currentStyle?: CharacterHairStyleId | string | null,
  direction: 'next' | 'prev' = 'next'
): CharacterHairStyleMetadata {
  const styles = CHARACTER_HAIR_STYLES;
  const currentIdx = styles.findIndex((s) => s.id === currentStyle);
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;
  const delta = direction === 'prev' ? -1 : 1;
  const nextIdx = (safeIdx + delta + styles.length) % styles.length;
  return styles[nextIdx];
}

/**
 * Applies a selected hairStyle (and optional hairColor) to a CharacterAppearance object.
 */
export function applyCharacterHairStyleSwitch<T extends Partial<CharacterAppearance>>(
  appearance: T,
  nextHairStyle: CharacterHairStyleId,
  options?: { syncRecommendedColor?: boolean; customHairColor?: string }
): T & { hairStyle: CharacterHairStyleId; hairColor: string } {
  const meta = getCharacterHairStyleMeta(nextHairStyle);
  const nextColor =
    options?.customHairColor ||
    (options?.syncRecommendedColor
      ? meta.defaultHairColor
      : appearance.hairColor || meta.defaultHairColor);
  return {
    ...appearance,
    hairStyle: meta.id,
    hairColor: nextColor
  };
}




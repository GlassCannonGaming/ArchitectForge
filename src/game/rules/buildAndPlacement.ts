import { type AssetCategory, type AssetConditionVariant, type CompositeSubPart, type FloorId, GRID_TILE_COUNT, type HingeSwingMode, type HotelAgentProfile, type PlacedAsset, type TexturePresetId, clampDimension, getRoomLabelAtPosition, normalizeSnapGridSize, snapToGrid } from './coreTypesAndFloors';

/**
 * Canonical Late-1970s / Early-1980s Unmaintained Apartment-Hotel Dark Thriller Color Palette
 */
export const LATE_70S_THRILLER_PALETTE = {
  sootBrick: '#592820',
  stainedPlaster: '#8a8170',
  darkWalnut: '#3b2314',
  driedOxblood: '#4a181b',
  fadedAvocado: '#4a5438',
  harvestOchre: '#6e562f',
  tarnishedBrass: '#5e4c2e',
  stainedEcruPorcelain: '#8f8777',
  puttyTerminalBeige: '#78705e',
  grimCharcoal: '#242220',
  phosphorAmber: '#855826',
  phosphorGreen: '#2d4f38'
} as const;

const BRIGHT_TO_FADED_70S_COLOR_MAP: Record<string, string> = {
  '#ffffff': '#8f8777',
  '#f8fafc': '#8f8777',
  '#f1f5f9': '#877f70',
  '#e2e8f0': '#7d7559',
  '#cbd5e1': '#78705e',
  '#d6d0c4': '#8a8170',
  '#8c3b2b': '#592820',
  '#7c2d12': '#4a2019',
  '#7f1d1d': '#4a181b',
  '#991b1b': '#4f1d21',
  '#5c3824': '#3b2314',
  '#451a03': '#2b180a',
  '#0d9488': '#4a5438',
  '#10b981': '#4a5438',
  '#0f766e': '#3d452e',
  '#7e22ce': '#5c4628',
  '#38bdf8': '#576b59',
  '#0284c7': '#4a5c4d',
  '#d4af37': '#5e4c2e',
  '#ca8a04': '#6b532c',
  '#b48a3e': '#6e5a38',
  '#facc15': '#785c32',
  '#eab308': '#6e562f',
  '#334155': '#3d2817',
  '#1e293b': '#29221d',
  '#0f172a': '#261d17',
  '#15803d': '#284a33',
  '#166534': '#2f3e26'
};

const UNKEMPT_GRIME_COLOR_MAP: Record<string, string> = {
  '#8f8777': '#635c4e',
  '#8a8170': '#5e5749',
  '#877f70': '#595347',
  '#7d7559': '#544e3a',
  '#78705e': '#4f493c',
  '#592820': '#3d1a14',
  '#4a181b': '#300f11',
  '#3b2314': '#26160c',
  '#4a5438': '#333b26',
  '#6e562f': '#4d3b1f',
  '#5e4c2e': '#42351f',
  '#c59223': '#785712',
  '#dfd7c5': '#918978',
  '#cbd5e1': '#64748b',
  '#e2e8f0': '#6b7280',
  '#451a03': '#291002'
};

const UPDATED_1990S_COLOR_MAP: Record<string, string> = {
  '#592820': '#475569',
  '#8a8170': '#cbd5e1',
  '#3b2314': '#4a2c17',
  '#4a181b': '#134e4a',
  '#4a5438': '#143d2b',
  '#6e562f': '#786438',
  '#5e4c2e': '#94a3b8',
  '#8f8777': '#e2e8f0',
  '#78705e': '#9ca3af',
  '#c59223': '#e2e8f0',
  '#4f5e34': '#1e293b'
};

function darkenHexForUnkempt(hex: string): string {
  const clean = (hex || '').trim().toLowerCase();
  if (UNKEMPT_GRIME_COLOR_MAP[clean]) return UNKEMPT_GRIME_COLOR_MAP[clean];
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(clean);
  if (!m) return hex;
  const r = Math.max(12, Math.round(parseInt(m[1], 16) * 0.74));
  const g = Math.max(12, Math.round(parseInt(m[2], 16) * 0.72));
  const b = Math.max(10, Math.round(parseInt(m[3], 16) * 0.68));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Pure helper that converts any legacy bright/90s asset colors and labels into the
 * faded, unmaintained Late-70s / Early-80s dark mystery thriller aesthetic, OR when
 * `targetVariantOverride` ('pristine' | 'unkempt' | 'updated') is specified, applies
 * variant-specific procedural weathering and re-texturing metadata.
 */
export function weatherAssetToLate70sStyle(
  asset: PlacedAsset,
  targetVariantOverride?: AssetConditionVariant
): PlacedAsset {
  const lowerColor = (asset.color || '').toLowerCase();

  // If explicit variant override is requested, apply variant-aware procedural re-texturing
  if (targetVariantOverride === 'updated') {
    const updatedColor = UPDATED_1990S_COLOR_MAP[lowerColor] || asset.color;
    const baseName = (asset.name || '')
      .replace(/\s*\[(Pristine|Unkempt|Updated|1990s)\]/gi, '')
      .trim();
    const updatedName =
      baseName.includes('1990s') || baseName.includes('90s')
        ? baseName
        : `${baseName} [Updated 90s]`;
    const updatedParts = asset.compositeParts
      ? asset.compositeParts.map((part) => {
          const pColor = (part.color || '').toLowerCase();
          return {
            ...part,
            color: UPDATED_1990S_COLOR_MAP[pColor] || part.color,
            roughness: Math.max(0.2, Math.min(0.75, part.roughness * 0.85)),
            metalness: Math.min(0.9, part.metalness + 0.08)
          };
        })
      : undefined;
    const filteredTags = (asset.tags || []).filter(
      (t) => t !== 'pristine' && t !== 'unkempt' && t !== 'weathered' && t !== 'aged'
    );
    const nextTags = Array.from(new Set([...filteredTags, '1990s', 'hotel-updated', 'updated']));
    return {
      ...asset,
      name: updatedName,
      color: updatedColor,
      conditionVariant: 'updated',
      era: '1990s',
      tags: nextTags,
      compositeParts: updatedParts
    };
  }

  const mappedColor = BRIGHT_TO_FADED_70S_COLOR_MAP[lowerColor] || asset.color;
  const weatheredName = (asset.name || '')
    .replace(/90s CRT Hotel TV & VHS Combo/gi, 'Late-70s Woodgrain CRT TV & VCR Combo')
    .replace(/90s CRT Hotel TV & VHS Player/gi, 'Late-70s Woodgrain CRT TV & Top-Load VCR')
    .replace(/Retrofitted 90s CRT TV/gi, 'Late-70s Woodgrain CRT TV')
    .replace(/90s Retro Soda Dispenser Machine/gi, '1979 Battered Coin-Op Soda Cooler')
    .replace(/Alcove 90s Soda Dispenser Machine/gi, 'Alcove 1979 Coin-Op Soda Cooler')
    .replace(/90s Concierge Desk CRT Computer/gi, '1981 Amber-Phosphor Desk Terminal')
    .replace(/90s Hotel Concierge CRT Computer/gi, '1981 Amber-Phosphor Desk Terminal')
    .replace(/90s Retro Hotel Lobby Armchair/gi, '70s Faded Avocado & Ochre Armchair')
    .replace(/90s Hotel Lobby Telephone Booth/gi, 'Late-70s Rotary Payphone Alcove')
    .replace(/\b90s\b/gi, 'Late-70s');

  const weatheredInspect = asset.inspectText
    ? asset.inspectText
        .replace(/1990s|90s/gi, 'late-1970s')
        .replace(/1994/g, '1979')
    : asset.inspectText;

  const weatheredParts = asset.compositeParts
    ? asset.compositeParts.map((part) => {
        const pColor = (part.color || '').toLowerCase();
        const pEmissive = (part.emissive || '').toLowerCase();
        const baseMappedColor = BRIGHT_TO_FADED_70S_COLOR_MAP[pColor] || part.color;
        return {
          ...part,
          color:
            targetVariantOverride === 'unkempt'
              ? darkenHexForUnkempt(baseMappedColor)
              : baseMappedColor,
          emissive: pEmissive ? BRIGHT_TO_FADED_70S_COLOR_MAP[pEmissive] || part.emissive : part.emissive,
          roughness:
            targetVariantOverride === 'unkempt'
              ? Math.min(0.98, Math.max(part.roughness + 0.14, 0.55))
              : Math.min(0.95, Math.max(part.roughness, 0.35))
        };
      })
    : undefined;

  if (targetVariantOverride === 'unkempt') {
    const cleanBaseName = weatheredName
      .replace(/\s*\[(Pristine|Unkempt|Updated|Updated 90s|1990s)\]/gi, '')
      .trim();
    const unkemptName = cleanBaseName.toLowerCase().includes('unkempt')
      ? cleanBaseName
      : `${cleanBaseName} [Unkempt]`;
    const filteredTags = (asset.tags || []).filter(
      (t) => t !== 'pristine' && t !== '1990s' && t !== 'hotel-updated' && t !== 'updated'
    );
    const nextTags = Array.from(new Set([...filteredTags, 'unkempt', 'aged', 'weathered']));
    return {
      ...asset,
      name: unkemptName,
      color: darkenHexForUnkempt(mappedColor),
      conditionVariant: 'unkempt',
      era: '1970s',
      tags: nextTags,
      inspectText: weatheredInspect,
      compositeParts: weatheredParts
    };
  }

  if (targetVariantOverride === 'pristine') {
    const cleanBaseName = weatheredName
      .replace(/\s*\[(Pristine|Unkempt|Updated|Updated 90s|1990s)\]/gi, '')
      .trim();
    const pristineName = cleanBaseName.toLowerCase().includes('pristine')
      ? cleanBaseName
      : `${cleanBaseName} [Pristine]`;
    const filteredTags = (asset.tags || []).filter(
      (t) =>
        t !== 'unkempt' &&
        t !== 'weathered' &&
        t !== 'aged' &&
        t !== '1990s' &&
        t !== 'hotel-updated' &&
        t !== 'updated'
    );
    const nextTags = Array.from(new Set([...filteredTags, 'pristine']));
    return {
      ...asset,
      name: pristineName,
      color: mappedColor,
      conditionVariant: 'pristine',
      era: '1970s',
      tags: nextTags,
      inspectText: weatheredInspect,
      compositeParts: weatheredParts
    };
  }

  return {
    ...asset,
    name: weatheredName,
    color: mappedColor,
    inspectText: weatheredInspect,
    compositeParts: weatheredParts
  };
}

export function weatherAssetsListToLate70sStyle(assets: PlacedAsset[]): PlacedAsset[] {
  return assets.map((a) => weatherAssetToLate70sStyle(a));
}

export function sanitizeAndValidateAgentResponse(
  rawText: string,
  agent: HotelAgentProfile
): { text: string; wasFiltered: boolean } {
  const trimmed = (rawText || '').trim();
  const forbiddenPatterns = [
    /as an ai language model/i,
    /as a large language model/i,
    /i am an artificial intelligence/i,
    /openai|anthropic|google deepmind/i,
    /system prompt|ignore previous instructions/i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(trimmed)) {
      const fallback =
        agent.role === 'helper_entity'
          ? '*The brass cylinder clicks and hisses softly.* "Focus, Clerk. The mortar between these brick walls is thin, and our only certainty lies in the evidence we have logged."'
          : `*${agent.name} stares at you warily beneath the flickering sconce.* "You're speaking in riddles, Clerk. Have the drafts from the airshaft gotten into your head already?"`;
      return { text: fallback, wasFiltered: true };
    }
  }

  return { text: trimmed || `*${agent.name} listens quietly in the dim corridor.*`, wasFiltered: false };
}

/**
 * Generates a deterministic 3-8 part composite 3D low-poly model specification
 * from any natural language prompt (used for instant preview & fallback in the Meshy/AI 3D Object Generator).
 */
export function buildProcedural3DSpecFromPrompt(prompt: string): {
  name: string;
  category: AssetCategory;
  dimensions: [number, number, number];
  parts: CompositeSubPart[];
} {
  const lower = prompt.toLowerCase();

  if (lower.includes('gramophone') || lower.includes('phonograph') || lower.includes('radio') || lower.includes('reel')) {
    return {
      name: 'Late-70s Reel-to-Reel & Tarnished Phonograph',
      category: 'custom_ai',
      dimensions: [0.9, 1.35, 0.9],
      parts: [
        { id: 'base_cabinet', shape: 'box', offset: [0, 0.25, 0], size: [0.75, 0.5, 0.75], color: '#3b2314', roughness: 0.78, metalness: 0.1 },
        { id: 'plinth_trim', shape: 'box', offset: [0, 0.52, 0], size: [0.82, 0.06, 0.82], color: '#26160c', roughness: 0.65, metalness: 0.15 },
        { id: 'turntable_disc', shape: 'cylinder', offset: [0, 0.57, 0], size: [0.28, 0.04, 0.28], color: '#1c1917', roughness: 0.45, metalness: 0.35 },
        { id: 'brass_neck', shape: 'cylinder', offset: [0, 0.75, -0.18], size: [0.05, 0.36, 0.05], color: '#5e4c2e', roughness: 0.42, metalness: 0.72 },
        { id: 'brass_horn', shape: 'cone', offset: [0, 1.05, 0.05], size: [0.35, 0.55, 0.35], rotation: [Math.PI / 2.6, 0, 0], color: '#6e5835', roughness: 0.38, metalness: 0.75 }
      ]
    };
  }

  if (lower.includes('flashlight') || lower.includes('d-cell') || lower.includes('torch') || lower.includes('uv light')) {
    return {
      name: '1970s Chrome D-Cell Inspection Flashlight',
      category: 'lighting',
      dimensions: [0.52, 0.18, 0.24],
      parts: [
        { id: 'ribbed_chrome_barrel', shape: 'cylinder', offset: [-0.04, 0.08, 0], size: [0.045, 0.36, 0.045], rotation: [0, 0, Math.PI / 2], color: '#78705e', roughness: 0.32, metalness: 0.82 },
        { id: 'beveled_head_cone', shape: 'cone', offset: [0.16, 0.08, 0], size: [0.075, 0.12, 0.075], rotation: [0, 0, -Math.PI / 2], color: '#5e4c2e', roughness: 0.36, metalness: 0.78 },
        { id: 'thumb_switch_slide', shape: 'box', offset: [0.02, 0.13, 0], size: [0.08, 0.025, 0.03], color: '#4a181b', roughness: 0.6, metalness: 0.4 },
        { id: 'tungsten_uv_lens', shape: 'cylinder', offset: [0.22, 0.08, 0], size: [0.068, 0.02, 0.068], rotation: [0, 0, Math.PI / 2], color: '#855826', roughness: 0.2, metalness: 0.25, emissive: '#6e562f' }
      ]
    };
  }

  if (lower.includes('chandelier') || lower.includes('lamp') || lower.includes('sconce') || lower.includes('light')) {
    return {
      name: 'Tarnished 70s Amber-Glass Floor Lamp',
      category: 'lighting',
      dimensions: [0.8, 1.8, 0.8],
      parts: [
        { id: 'heavy_base', shape: 'cylinder', offset: [0, 0.06, 0], size: [0.32, 0.12, 0.32], color: '#4a3b24', roughness: 0.48, metalness: 0.7 },
        { id: 'fluted_pole', shape: 'cylinder', offset: [0, 0.85, 0], size: [0.05, 1.5, 0.05], color: '#5e4c2e', roughness: 0.42, metalness: 0.72 },
        { id: 'shade_ring', shape: 'torus', offset: [0, 1.48, 0], size: [0.34, 0.04, 0.34], rotation: [Math.PI / 2, 0, 0], color: '#3b2614', roughness: 0.55, metalness: 0.6 },
        { id: 'glass_shade', shape: 'cone', offset: [0, 1.62, 0], size: [0.38, 0.35, 0.38], color: '#856232', roughness: 0.35, metalness: 0.15, emissive: '#5c3f17' }
      ]
    };
  }

  if (lower.includes('tv') || lower.includes('crt') || lower.includes('television') || lower.includes('vhs') || lower.includes('combo') || lower.includes('betamax')) {
    return {
      name: 'Late-70s Woodgrain CRT TV & Top-Load VCR',
      category: 'appliance',
      dimensions: [0.9, 0.85, 0.75],
      parts: [
        { id: 'woodgrain_casing', shape: 'box', offset: [0, 0.42, 0], size: [0.82, 0.72, 0.65], color: '#3d2817', roughness: 0.74, metalness: 0.12 },
        { id: 'charcoal_bezel', shape: 'box', offset: [0, 0.45, 0.33], size: [0.72, 0.58, 0.05], color: '#1c1917', roughness: 0.82, metalness: 0.1 },
        { id: 'phosphor_crt_screen', shape: 'box', offset: [-0.08, 0.48, 0.35], size: [0.52, 0.44, 0.04], color: '#3d4f42', roughness: 0.22, metalness: 0.35, emissive: '#28382c' },
        { id: 'topload_vcr_deck', shape: 'box', offset: [0.0, 0.18, 0.34], size: [0.46, 0.09, 0.06], color: '#26231f', roughness: 0.85, metalness: 0.18 },
        { id: 'cassette_window', shape: 'box', offset: [-0.08, 0.18, 0.36], size: [0.24, 0.04, 0.02], color: '#574c3d', roughness: 0.5, metalness: 0.3 },
        { id: 'rotary_vhf_uhf_dials', shape: 'cylinder', offset: [0.26, 0.52, 0.35], size: [0.055, 0.04, 0.055], rotation: [Math.PI / 2, 0, 0], color: '#78623a', roughness: 0.42, metalness: 0.68 }
      ]
    };
  }

  if (lower.includes('vending') || lower.includes('soda') || lower.includes('drink') || lower.includes('cooler')) {
    return {
      name: '1979 Battered Coin-Op Soda Cooler',
      category: 'appliance',
      dimensions: [1.1, 2.1, 0.9],
      parts: [
        { id: 'cooler_cabinet', shape: 'box', offset: [0, 1.05, 0], size: [1.0, 2.0, 0.82], color: '#291e17', roughness: 0.82, metalness: 0.25 },
        { id: 'faded_ochre_fascia', shape: 'box', offset: [0, 1.32, 0.42], size: [0.88, 1.15, 0.05], color: '#6e562f', roughness: 0.55, metalness: 0.18, emissive: '#3d2c14' },
        { id: 'rusted_marquee_header', shape: 'box', offset: [0, 1.75, 0.44], size: [0.82, 0.32, 0.03], color: '#592820', roughness: 0.6, metalness: 0.15, emissive: '#3b1812' },
        { id: 'selector_buttons', shape: 'box', offset: [0.32, 1.1, 0.44], size: [0.18, 0.48, 0.04], color: '#785c38', roughness: 0.5, metalness: 0.3, emissive: '#4a371c' },
        { id: 'coin_return_bezel', shape: 'box', offset: [0.32, 1.45, 0.44], size: [0.12, 0.14, 0.04], color: '#57534e', roughness: 0.45, metalness: 0.68 },
        { id: 'bottle_chute', shape: 'box', offset: [0, 0.3, 0.43], size: [0.68, 0.28, 0.12], color: '#1c1917', roughness: 0.9, metalness: 0.15 }
      ]
    };
  }

  if (lower.includes('computer') || lower.includes('pc') || lower.includes('monitor') || lower.includes('terminal')) {
    return {
      name: '1981 Amber-Phosphor Desk Terminal',
      category: 'appliance',
      dimensions: [0.95, 0.85, 0.8],
      parts: [
        { id: 'yellowed_chassis', shape: 'box', offset: [-0.28, 0.32, -0.05], size: [0.26, 0.58, 0.52], color: '#78705e', roughness: 0.78, metalness: 0.12 },
        { id: 'floppy_bay_525_1', shape: 'box', offset: [-0.28, 0.48, 0.21], size: [0.18, 0.05, 0.04], color: '#292524', roughness: 0.85, metalness: 0.1 },
        { id: 'floppy_bay_525_2', shape: 'box', offset: [-0.28, 0.40, 0.21], size: [0.18, 0.05, 0.04], color: '#292524', roughness: 0.85, metalness: 0.1 },
        { id: 'crt_hood', shape: 'box', offset: [0.12, 0.42, 0], size: [0.52, 0.46, 0.48], color: '#6e6656', roughness: 0.72, metalness: 0.12 },
        { id: 'phosphor_screen', shape: 'box', offset: [0.12, 0.43, 0.24], size: [0.42, 0.34, 0.03], color: '#1f2e23', roughness: 0.2, metalness: 0.3, emissive: '#2a4531' },
        { id: 'mechanical_keyboard', shape: 'box', offset: [0.08, 0.04, 0.32], size: [0.56, 0.05, 0.22], color: '#635b4c', roughness: 0.82, metalness: 0.1 }
      ]
    };
  }

  if (lower.includes('sofa') || lower.includes('armchair') || lower.includes('chair') || lower.includes('couch') || lower.includes('avocado')) {
    return {
      name: '70s Faded Avocado & Ochre Armchair',
      category: 'furniture',
      dimensions: [1.1, 0.95, 0.95],
      parts: [
        { id: 'tarnished_frame', shape: 'box', offset: [0, 0.12, 0], size: [1.02, 0.18, 0.88], color: '#332922', roughness: 0.55, metalness: 0.55 },
        { id: 'avocado_seat_cushion', shape: 'box', offset: [0, 0.35, 0.05], size: [0.88, 0.28, 0.78], color: '#4a5438', roughness: 0.92, metalness: 0.04 },
        { id: 'harvest_ochre_backrest', shape: 'box', offset: [0, 0.68, -0.28], size: [0.88, 0.52, 0.22], color: '#6e562f', roughness: 0.92, metalness: 0.04 },
        { id: 'worn_arm_left', shape: 'box', offset: [-0.46, 0.52, 0.02], size: [0.14, 0.32, 0.82], color: '#3b442c', roughness: 0.9, metalness: 0.06 },
        { id: 'worn_arm_right', shape: 'box', offset: [0.46, 0.52, 0.02], size: [0.14, 0.32, 0.82], color: '#3b442c', roughness: 0.9, metalness: 0.06 },
        { id: 'worn_lumbar_bolster', shape: 'cylinder', offset: [0, 0.56, -0.14], size: [0.12, 0.64, 0.12], rotation: [0, 0, Math.PI / 2], color: '#592820', roughness: 0.92, metalness: 0.04 }
      ]
    };
  }

  if (lower.includes('bathtub') || lower.includes('tub') || lower.includes('soaker') || lower.includes('bath')) {
    return {
      name: 'Water-Stained Clawfoot Bathtub',
      category: 'furniture',
      dimensions: [1.6, 0.75, 0.8],
      parts: [
        { id: 'stained_tub_outer', shape: 'box', offset: [0, 0.38, 0], size: [1.52, 0.58, 0.76], color: '#9c9484', roughness: 0.45, metalness: 0.15 },
        { id: 'tub_inner_stained', shape: 'box', offset: [0, 0.44, 0], size: [1.36, 0.48, 0.62], color: '#787163', roughness: 0.52, metalness: 0.2 },
        { id: 'claw_foot_lf', shape: 'cylinder', offset: [-0.62, 0.08, 0.28], size: [0.08, 0.16, 0.08], color: '#594d36', roughness: 0.48, metalness: 0.72 },
        { id: 'claw_foot_rf', shape: 'cylinder', offset: [0.62, 0.08, 0.28], size: [0.08, 0.16, 0.08], color: '#594d36', roughness: 0.48, metalness: 0.72 },
        { id: 'claw_foot_lb', shape: 'cylinder', offset: [-0.62, 0.08, -0.28], size: [0.08, 0.16, 0.08], color: '#594d36', roughness: 0.48, metalness: 0.72 },
        { id: 'claw_foot_rb', shape: 'cylinder', offset: [0.62, 0.08, -0.28], size: [0.08, 0.16, 0.08], color: '#594d36', roughness: 0.48, metalness: 0.72 },
        { id: 'corroded_faucet', shape: 'cylinder', offset: [-0.68, 0.72, 0], size: [0.06, 0.22, 0.06], color: '#4d412d', roughness: 0.5, metalness: 0.75 }
      ]
    };
  }

  if (lower.includes('vanity') || lower.includes('washbasin') || lower.includes('lavatory') || (lower.includes('sink') && !lower.includes('skillet'))) {
    return {
      name: 'Cracked Formica & Ecru Vanity Sink',
      category: 'furniture',
      dimensions: [1.1, 1.25, 0.65],
      parts: [
        { id: 'damp_vanity_cabinet', shape: 'box', offset: [0, 0.42, 0], size: [1.02, 0.82, 0.58], color: '#2b1b10', roughness: 0.78, metalness: 0.08 },
        { id: 'stained_counter', shape: 'box', offset: [0, 0.85, 0], size: [1.08, 0.08, 0.62], color: '#877f70', roughness: 0.55, metalness: 0.15 },
        { id: 'ecru_basin', shape: 'cylinder', offset: [0, 0.88, 0.02], size: [0.42, 0.12, 0.38], color: '#787062', roughness: 0.45, metalness: 0.1 },
        { id: 'corroded_faucet', shape: 'cylinder', offset: [0, 0.98, -0.18], size: [0.05, 0.18, 0.05], color: '#594d36', roughness: 0.45, metalness: 0.75 },
        { id: 'desilvered_mirror', shape: 'box', offset: [0, 1.45, -0.26], size: [0.72, 0.85, 0.04], color: '#4a5254', roughness: 0.42, metalness: 0.65 }
      ]
    };
  }

  if (lower.includes('toilet') || lower.includes('commode') || lower.includes('wc')) {
    return {
      name: 'Stained Ecru Suite Toilet & Tank',
      category: 'furniture',
      dimensions: [0.55, 0.85, 0.75],
      parts: [
        { id: 'toilet_pedestal', shape: 'cylinder', offset: [0, 0.22, 0.12], size: [0.38, 0.42, 0.42], color: '#948c7c', roughness: 0.45, metalness: 0.1 },
        { id: 'worn_wood_seat', shape: 'cylinder', offset: [0, 0.44, 0.12], size: [0.42, 0.04, 0.44], color: '#3b2416', roughness: 0.65, metalness: 0.08 },
        { id: 'crazed_water_tank', shape: 'box', offset: [0, 0.62, -0.2], size: [0.48, 0.42, 0.26], color: '#877f70', roughness: 0.48, metalness: 0.1 },
        { id: 'tarnished_flush_lever', shape: 'box', offset: [-0.26, 0.72, -0.18], size: [0.08, 0.04, 0.04], color: '#594d36', roughness: 0.45, metalness: 0.78 }
      ]
    };
  }

  if (lower.includes('painting') || /\bart\b/.test(lower) || lower.includes('portrait') || lower.includes('picture') || lower.includes('canvas')) {
    return {
      name: 'Tarnished 70s Oil Portrait Frame',
      category: 'custom_ai',
      dimensions: [1.2, 1.0, 0.12],
      parts: [
        { id: 'tarnished_frame_outer', shape: 'box', offset: [0, 0.5, 0], size: [1.18, 0.98, 0.08], color: '#5e4c2e', roughness: 0.48, metalness: 0.72 },
        { id: 'soot_canvas_insert', shape: 'box', offset: [0, 0.5, 0.02], size: [1.02, 0.82, 0.05], color: '#291d14', roughness: 0.88, metalness: 0.04 },
        { id: 'faded_portrait_silhouette', shape: 'box', offset: [0, 0.5, 0.04], size: [0.88, 0.68, 0.02], color: '#4a321f', roughness: 0.78, metalness: 0.08 }
      ]
    };
  }

  if (lower.includes('plant') || lower.includes('palm') || lower.includes('fern') || lower.includes('pothos') || lower.includes('ficus') || lower.includes('vase')) {
    return {
      name: 'Neglected Parlor Boston Fern',
      category: 'custom_ai',
      dimensions: [0.85, 1.45, 0.85],
      parts: [
        { id: 'cracked_planter_pot', shape: 'cylinder', offset: [0, 0.22, 0], size: [0.42, 0.44, 0.42], color: '#4d2619', roughness: 0.88, metalness: 0.08 },
        { id: 'tarnished_pot_rim', shape: 'torus', offset: [0, 0.43, 0], size: [0.44, 0.04, 0.44], rotation: [Math.PI / 2, 0, 0], color: '#594d36', roughness: 0.48, metalness: 0.72 },
        { id: 'woody_stem', shape: 'cylinder', offset: [0, 0.68, 0], size: [0.08, 0.52, 0.08], color: '#382a1e', roughness: 0.92, metalness: 0.0 },
        { id: 'dusty_olive_fronds', shape: 'cone', offset: [0, 1.15, 0], size: [0.78, 0.62, 0.78], color: '#38452b', roughness: 0.9, metalness: 0.0 }
      ]
    };
  }

  if (lower.includes('towel') || lower.includes('linen') || lower.includes('towel_rack')) {
    return {
      name: 'Corroded Brass Towel Rail & Faded Linens',
      category: 'furniture',
      dimensions: [0.75, 0.65, 0.35],
      parts: [
        { id: 'brass_bar_top', shape: 'cylinder', offset: [0, 0.52, 0.12], size: [0.03, 0.68, 0.03], rotation: [0, 0, Math.PI / 2], color: '#594d36', roughness: 0.45, metalness: 0.75 },
        { id: 'brass_bar_bottom', shape: 'cylinder', offset: [0, 0.28, 0.12], size: [0.03, 0.68, 0.03], rotation: [0, 0, Math.PI / 2], color: '#594d36', roughness: 0.45, metalness: 0.75 },
        { id: 'faded_ecru_towel_1', shape: 'box', offset: [0, 0.55, 0.12], size: [0.52, 0.12, 0.22], color: '#877f70', roughness: 0.95, metalness: 0.0 },
        { id: 'faded_ochre_towel_2', shape: 'box', offset: [0, 0.31, 0.12], size: [0.52, 0.12, 0.22], color: '#6e5c3e', roughness: 0.95, metalness: 0.0 }
      ]
    };
  }

  if (/\bac\b/.test(lower) || lower.includes('air conditioner') || lower.includes('window_ac') || lower.includes('conduit') || lower.includes('retrofit') || lower.includes('breaker')) {
    return {
      name: '1979 Woodgrain Window AC & Conduit',
      category: 'appliance',
      dimensions: [0.85, 0.95, 0.65],
      parts: [
        { id: 'weathered_ac_chassis', shape: 'box', offset: [0, 0.55, 0], size: [0.78, 0.52, 0.58], color: '#6e6759', roughness: 0.75, metalness: 0.25 },
        { id: 'woodgrain_louver_grille', shape: 'box', offset: [0, 0.55, 0.3], size: [0.72, 0.46, 0.04], color: '#3d2817', roughness: 0.78, metalness: 0.12 },
        { id: 'rotary_thermostat_panel', shape: 'box', offset: [0.24, 0.55, 0.32], size: [0.16, 0.38, 0.03], color: '#24201c', roughness: 0.65, metalness: 0.2 },
        { id: 'surface_conduit_pipe', shape: 'cylinder', offset: [-0.36, 0.45, -0.18], size: [0.04, 0.9, 0.04], color: '#4a453e', roughness: 0.55, metalness: 0.72 },
        { id: 'junction_box', shape: 'box', offset: [-0.36, 0.15, -0.18], size: [0.16, 0.2, 0.1], color: '#38342f', roughness: 0.6, metalness: 0.68 }
      ]
    };
  }

  if (lower.includes('kitchenette') || lower.includes('hotplate') || lower.includes('microwave') || lower.includes('kettle')) {
    return {
      name: 'Late-70s Harvest-Gold Hotplate Kitchenette',
      category: 'appliance',
      dimensions: [1.15, 1.1, 0.65],
      parts: [
        { id: 'worn_walnut_base', shape: 'box', offset: [0, 0.42, 0], size: [1.1, 0.84, 0.6], color: '#3b2314', roughness: 0.78, metalness: 0.1 },
        { id: 'harvest_gold_formica', shape: 'box', offset: [0, 0.86, 0], size: [1.14, 0.05, 0.64], color: '#7d6b42', roughness: 0.52, metalness: 0.1 },
        { id: 'dial_radarrange_oven', shape: 'box', offset: [-0.26, 1.04, -0.04], size: [0.48, 0.3, 0.38], color: '#2b231d', roughness: 0.62, metalness: 0.28 },
        { id: 'cast_iron_hotplate', shape: 'box', offset: [0.28, 0.91, 0.02], size: [0.36, 0.06, 0.34], color: '#1c1917', roughness: 0.55, metalness: 0.65 },
        { id: 'dim_ember_coil', shape: 'cylinder', offset: [0.28, 0.95, 0.02], size: [0.18, 0.02, 0.18], color: '#8c2d19', roughness: 0.4, metalness: 0.45, emissive: '#591c10' }
      ]
    };
  }

  if (lower.includes('trunk') || lower.includes('steamer') || lower.includes('lived-in') || lower.includes('memorabilia') || lower.includes('keepsake')) {
    return {
      name: 'Decade-Lived-In Steamer Trunk & Keepsakes',
      category: 'furniture',
      dimensions: [1.1, 0.95, 0.7],
      parts: [
        { id: 'scuffed_leather_trunk', shape: 'box', offset: [0, 0.28, 0], size: [1.02, 0.56, 0.62], color: '#2b1608', roughness: 0.86, metalness: 0.12 },
        { id: 'tarnished_brass_straps', shape: 'box', offset: [0, 0.28, 0.32], size: [0.96, 0.52, 0.03], color: '#5e4c2e', roughness: 0.48, metalness: 0.72 },
        { id: 'faded_oxblood_hatbox', shape: 'cylinder', offset: [-0.24, 0.68, -0.05], size: [0.34, 0.24, 0.34], color: '#4a181b', roughness: 0.88, metalness: 0.05 },
        { id: 'yellowed_ledgers', shape: 'box', offset: [0.24, 0.64, 0.04], size: [0.36, 0.16, 0.28], color: '#786544', roughness: 0.82, metalness: 0.08 }
      ]
    };
  }

  if (lower.includes('notebook') || lower.includes('journal') || lower.includes('folio') || lower.includes('ledger')) {
    return {
      name: "1978 Investigator's Spiral Case Notebook",
      category: 'clue_prop',
      dimensions: [0.45, 0.14, 0.55],
      parts: [
        { id: 'oxblood_cover', shape: 'box', offset: [0, 0.03, 0], size: [0.42, 0.04, 0.52], color: '#4a181b', roughness: 0.85, metalness: 0.08 },
        { id: 'ruled_paper_block', shape: 'box', offset: [0.01, 0.06, 0], size: [0.39, 0.05, 0.49], color: '#8f8777', roughness: 0.92, metalness: 0.02 },
        { id: 'brass_spiral_binding', shape: 'cylinder', offset: [-0.19, 0.06, 0], size: [0.025, 0.50, 0.025], rotation: [Math.PI / 2, 0, 0], color: '#6e562f', roughness: 0.42, metalness: 0.78 },
        { id: 'crimson_bookmark_ribbon', shape: 'box', offset: [0.05, 0.04, 0.28], size: [0.04, 0.01, 0.14], color: '#592820', roughness: 0.9, metalness: 0.0 },
        { id: 'tarnished_brass_pen', shape: 'cylinder', offset: [0.14, 0.095, 0.02], size: [0.018, 0.36, 0.018], rotation: [Math.PI / 2, 0, 0.22], color: '#5e4c2e', roughness: 0.35, metalness: 0.82 }
      ]
    };
  }

  if (lower.includes('cassette') || lower.includes('dictaphone') || lower.includes('walkman') || lower.includes('tape player') || lower.includes('recorder')) {
    return {
      name: 'Handheld Microcassette Dictaphone Player',
      category: 'clue_prop',
      dimensions: [0.40, 0.16, 0.58],
      parts: [
        { id: 'charcoal_chassis', shape: 'box', offset: [0, 0.06, 0], size: [0.36, 0.10, 0.54], color: '#242220', roughness: 0.72, metalness: 0.35 },
        { id: 'brushed_metal_faceplate', shape: 'box', offset: [0, 0.115, 0.02], size: [0.32, 0.02, 0.46], color: '#78705e', roughness: 0.45, metalness: 0.68 },
        { id: 'cassette_window_bay', shape: 'box', offset: [0, 0.125, -0.02], size: [0.24, 0.015, 0.26], color: '#1c1917', roughness: 0.3, metalness: 0.4 },
        { id: 'tape_spool_left', shape: 'cylinder', offset: [-0.05, 0.135, -0.02], size: [0.045, 0.02, 0.045], color: '#6e562f', roughness: 0.5, metalness: 0.6 },
        { id: 'tape_spool_right', shape: 'cylinder', offset: [0.05, 0.135, -0.02], size: [0.045, 0.02, 0.045], color: '#6e562f', roughness: 0.5, metalness: 0.6 },
        { id: 'piano_keys_row', shape: 'box', offset: [0, 0.08, 0.27], size: [0.26, 0.04, 0.06], color: '#592820', roughness: 0.55, metalness: 0.5 }
      ]
    };
  }

  if (lower.includes('payphone') || lower.includes('switchboard') || lower.includes('telephone') || lower.includes('rotary')) {
    return {
      name: 'Late-70s Rotary Payphone & Switchboard',
      category: 'appliance',
      dimensions: [0.85, 1.85, 0.65],
      parts: [
        { id: 'alcove_backplate', shape: 'box', offset: [0, 0.92, -0.18], size: [0.78, 1.76, 0.14], color: '#382e26', roughness: 0.72, metalness: 0.25 },
        { id: 'walnut_side_cheek_l', shape: 'box', offset: [-0.36, 1.05, 0.02], size: [0.06, 1.15, 0.48], color: '#3b2314', roughness: 0.75, metalness: 0.12 },
        { id: 'walnut_side_cheek_r', shape: 'box', offset: [0.36, 1.05, 0.02], size: [0.06, 1.15, 0.48], color: '#3b2314', roughness: 0.75, metalness: 0.12 },
        { id: 'chrome_coin_box', shape: 'box', offset: [0, 1.12, -0.02], size: [0.38, 0.56, 0.22], color: '#78705e', roughness: 0.38, metalness: 0.78 },
        { id: 'rotary_finger_wheel', shape: 'cylinder', offset: [0, 1.16, 0.10], size: [0.11, 0.03, 0.11], rotation: [Math.PI / 2, 0, 0], color: '#d8cfbe', roughness: 0.28, metalness: 0.2 },
        { id: 'bakelite_handset', shape: 'box', offset: [-0.16, 1.14, 0.08], size: [0.09, 0.34, 0.09], color: '#1c1917', roughness: 0.65, metalness: 0.2 },
        { id: 'directory_shelf', shape: 'box', offset: [0, 0.72, 0.06], size: [0.68, 0.06, 0.42], color: '#5e4c2e', roughness: 0.55, metalness: 0.6 }
      ]
    };
  }

  if (lower.includes('radiator') || lower.includes('steam')) {
    return {
      name: 'Clanking Cast-Iron Steam Radiator',
      category: 'appliance',
      dimensions: [1.2, 0.9, 0.4],
      parts: [
        { id: 'radiator_core', shape: 'box', offset: [0, 0.45, 0], size: [1.04, 0.74, 0.30], color: '#6e5a38', roughness: 0.68, metalness: 0.62 },
        { id: 'fin_col_1', shape: 'box', offset: [-0.38, 0.46, 0], size: [0.12, 0.82, 0.34], color: '#5e4c2e', roughness: 0.62, metalness: 0.68 },
        { id: 'fin_col_2', shape: 'box', offset: [-0.14, 0.46, 0], size: [0.12, 0.82, 0.34], color: '#5e4c2e', roughness: 0.62, metalness: 0.68 },
        { id: 'fin_col_3', shape: 'box', offset: [0.14, 0.46, 0], size: [0.12, 0.82, 0.34], color: '#5e4c2e', roughness: 0.62, metalness: 0.68 },
        { id: 'fin_col_4', shape: 'box', offset: [0.38, 0.46, 0], size: [0.12, 0.82, 0.34], color: '#5e4c2e', roughness: 0.62, metalness: 0.68 },
        { id: 'brass_steam_valve', shape: 'cylinder', offset: [0.56, 0.28, 0.04], size: [0.08, 0.18, 0.08], color: '#8a7238', roughness: 0.35, metalness: 0.85 }
      ]
    };
  }

  if (lower.includes('fridge') || lower.includes('icebox') || lower.includes('refrigerator')) {
    return {
      name: '1978 Harvest-Gold Apartment Fridge',
      category: 'appliance',
      dimensions: [0.95, 1.65, 0.85],
      parts: [
        { id: 'fridge_cabinet', shape: 'box', offset: [0, 0.82, -0.02], size: [0.90, 1.60, 0.76], color: '#7d7559', roughness: 0.46, metalness: 0.25 },
        { id: 'freezer_door', shape: 'box', offset: [0, 1.34, 0.38], size: [0.86, 0.44, 0.06], color: '#8c8262', roughness: 0.42, metalness: 0.28 },
        { id: 'main_door', shape: 'box', offset: [0, 0.56, 0.38], size: [0.86, 1.04, 0.06], color: '#8c8262', roughness: 0.42, metalness: 0.28 },
        { id: 'chrome_handle_top', shape: 'box', offset: [0.34, 1.32, 0.43], size: [0.05, 0.26, 0.05], color: '#cbd5e1', roughness: 0.22, metalness: 0.88 },
        { id: 'chrome_handle_main', shape: 'box', offset: [0.34, 0.78, 0.43], size: [0.05, 0.42, 0.05], color: '#cbd5e1', roughness: 0.22, metalness: 0.88 }
      ]
    };
  }

  if (lower.includes('corkboard') || lower.includes('pinboard') || lower.includes('evidence board') || lower.includes('yarn')) {
    return {
      name: 'Detective Evidence Corkboard & Yarn Pinboard',
      category: 'clue_prop',
      dimensions: [1.45, 1.05, 0.14],
      parts: [
        { id: 'walnut_board_frame', shape: 'box', offset: [0, 0.52, 0], size: [1.42, 1.02, 0.08], color: '#3b2314', roughness: 0.78, metalness: 0.12 },
        { id: 'weathered_cork_sheet', shape: 'box', offset: [0, 0.52, 0.035], size: [1.30, 0.90, 0.03], color: '#6e562f', roughness: 0.94, metalness: 0.02 },
        { id: 'pinned_memo_card_1', shape: 'box', offset: [-0.34, 0.64, 0.055], size: [0.28, 0.22, 0.015], color: '#8f8777', roughness: 0.88, metalness: 0.02 },
        { id: 'pinned_polaroid_card_2', shape: 'box', offset: [0.28, 0.58, 0.055], size: [0.26, 0.28, 0.015], color: '#8a8170', roughness: 0.85, metalness: 0.04 },
        { id: 'crimson_yarn_link', shape: 'box', offset: [-0.02, 0.61, 0.065], size: [0.62, 0.018, 0.01], rotation: [0, 0, -0.12], color: '#592820', roughness: 0.9, metalness: 0.0 }
      ]
    };
  }

  if (lower.includes('keyring') || lower.includes('skeleton key') || lower.includes('passkey')) {
    return {
      name: 'Tarnished Brass Master Skeleton Keyring',
      category: 'clue_prop',
      dimensions: [0.35, 0.10, 0.38],
      parts: [
        { id: 'brass_key_ring', shape: 'torus', offset: [-0.08, 0.04, 0], size: [0.08, 0.015, 0.08], rotation: [Math.PI / 2, 0, 0], color: '#6e562f', roughness: 0.38, metalness: 0.82 },
        { id: 'master_skeleton_key_shaft', shape: 'cylinder', offset: [0.06, 0.04, -0.03], size: [0.014, 0.22, 0.014], rotation: [0, 0, Math.PI / 2], color: '#5e4c2e', roughness: 0.42, metalness: 0.78 },
        { id: 'stamped_room_fob', shape: 'box', offset: [0.04, 0.04, 0.06], size: [0.16, 0.02, 0.08], color: '#4a181b', roughness: 0.72, metalness: 0.25 }
      ]
    };
  }

  // General architectural / mysterious antique furniture composite
  return {
    name: prompt.slice(0, 32).replace(/[^a-zA-Z0-9 -]/g, '') || 'Bespoke Hotel Artifact',
    category: 'custom_ai',
    dimensions: [1.1, 1.3, 0.9],
    parts: [
      { id: 'pedestal_base', shape: 'box', offset: [0, 0.2, 0], size: [0.95, 0.4, 0.75], color: '#2b180a', roughness: 0.82, metalness: 0.12 },
      { id: 'upper_body', shape: 'box', offset: [0, 0.7, 0], size: [0.82, 0.65, 0.65], color: '#3b2314', roughness: 0.7, metalness: 0.18 },
      { id: 'tarnished_crest', shape: 'cylinder', offset: [0, 1.12, 0], size: [0.24, 0.22, 0.24], color: '#5e4c2e', roughness: 0.45, metalness: 0.72 },
      { id: 'amber_relic_lens', shape: 'sphere', offset: [0, 1.32, 0], size: [0.18, 0.18, 0.18], color: '#6e562f', roughness: 0.32, metalness: 0.35, emissive: '#4a371c' }
    ]
  };
}

export interface UndoHistoryEntry {
  actionLabel: string;
  assets: PlacedAsset[];
  selectedAssetId: string | null;
}

/**
 * Pure helper to push an immutable snapshot of assets before an addition, modification, or deletion.
 */
export function pushUndoHistory(
  stack: UndoHistoryEntry[],
  entry: UndoHistoryEntry,
  maxDepth = 50
): UndoHistoryEntry[] {
  const clonedAssets: PlacedAsset[] = entry.assets.map((a) => ({
    ...a,
    position: [...a.position] as [number, number, number],
    dimensions: [...a.dimensions] as [number, number, number],
    compositeParts: a.compositeParts ? a.compositeParts.map((p) => ({ ...p })) : undefined
  }));
  const next = [...stack, { ...entry, assets: clonedAssets }];
  return next.length > maxDepth ? next.slice(next.length - maxDepth) : next;
}

/**
 * Pure helper to pop the most recent snapshot from the undo stack.
 */
export function popUndoHistory(stack: UndoHistoryEntry[]): {
  popped: UndoHistoryEntry | null;
  remaining: UndoHistoryEntry[];
} {
  if (stack.length === 0) {
    return { popped: null, remaining: [] };
  }
  const popped = stack[stack.length - 1];
  const remaining = stack.slice(0, stack.length - 1);
  return { popped, remaining };
}

/**
 * Pure helper for Shift+Click multi-selection or single selection.
 */
export function toggleAssetInSelection(
  currentSelectedIds: string[],
  assetId: string,
  additiveShiftKey: boolean
): string[] {
  if (!additiveShiftKey) {
    return [assetId];
  }
  if (currentSelectedIds.includes(assetId)) {
    return currentSelectedIds.filter((id) => id !== assetId);
  }
  return [...currentSelectedIds, assetId];
}

export function getOrientedFootprint(
  dimensions: [number, number, number],
  rotationY: number
): { halfW: number; halfD: number } {
  const isRotated = Math.abs(Math.sin(rotationY)) > 0.7;
  const w = isRotated ? dimensions[2] : dimensions[0];
  const d = isRotated ? dimensions[0] : dimensions[2];
  return {
    halfW: w / 2,
    halfD: d / 2
  };
}

export interface SurfaceSnapResult {
  x: number;
  z: number;
  rotationY: number;
  snappedToId: string | null;
  snappedToName: string | null;
  snappedFace: 'north' | 'south' | 'east' | 'west' | null;
}

/**
 * Pure helper that calculates a flush surface/wall/asset-snapped position and rotation
 * for an asset being placed or moved near other walls, surfaces, or assets on the same floor.
 */
export function computeSurfaceSnappedPosition(
  movingAsset: PlacedAsset,
  rawTargetX: number,
  rawTargetZ: number,
  floorAssets: PlacedAsset[],
  snapThreshold = 2.2,
  gridStep = 0.5
): SurfaceSnapResult {
  const safeStep = normalizeSnapGridSize(gridStep);
  const tangentStep = safeStep > 0 ? safeStep : 0.25;
  const safeMovingDims: [number, number, number] =
    Array.isArray(movingAsset?.dimensions) && movingAsset.dimensions.length === 3
      ? [
          Number(movingAsset.dimensions[0]) || 1,
          Number(movingAsset.dimensions[1]) || 1,
          Number(movingAsset.dimensions[2]) || 1
        ]
      : [1, 1, 1];

  const candidates = (Array.isArray(floorAssets) ? floorAssets : []).filter(
    (other) =>
      Boolean(other) &&
      other.id !== movingAsset.id &&
      other.floor === movingAsset.floor &&
      other.category !== 'floor_tile'
  );

  let bestDist = Infinity;
  let bestResult: SurfaceSnapResult | null = null;

  for (const other of candidates) {
    const [ox, , oz] = Array.isArray(other.position) ? other.position : [0, 0, 0];
    const safeOtherDims: [number, number, number] =
      Array.isArray(other.dimensions) && other.dimensions.length === 3
        ? [
            Number(other.dimensions[0]) || 1,
            Number(other.dimensions[1]) || 1,
            Number(other.dimensions[2]) || 1
          ]
        : [1, 1, 1];
    const { halfW: otherHalfW, halfD: otherHalfD } = getOrientedFootprint(
      safeOtherDims,
      other.rotationY || 0
    );

    const isOtherWallLike =
      other.category === 'wall' ||
      other.category === 'secret_wall' ||
      other.category === 'window_wall' ||
      other.category === 'door';

    const faces: Array<'south' | 'north' | 'east' | 'west'> = [
      'south',
      'north',
      'east',
      'west'
    ];

    for (const face of faces) {
      let alignedRotationY = movingAsset.rotationY || 0;
      if (isOtherWallLike && movingAsset.category !== 'wall') {
        if (face === 'south' || face === 'north') {
          alignedRotationY = 0;
        } else {
          alignedRotationY = Math.PI / 2;
        }
      }

      const { halfW: movHalfW, halfD: movHalfD } = getOrientedFootprint(
        safeMovingDims,
        alignedRotationY
      );

      let candX = rawTargetX;
      let candZ = rawTargetZ;

      if (face === 'south') {
        const clampedX = Math.max(ox - otherHalfW, Math.min(ox + otherHalfW, rawTargetX));
        candX =
          Math.abs(clampedX - ox) < Math.min(0.25, tangentStep)
            ? ox
            : safeStep > 0
              ? snapToGrid(clampedX, safeStep)
              : Number(clampedX.toFixed(3));
        candZ = Number((oz + otherHalfD + movHalfD).toFixed(3));
      } else if (face === 'north') {
        const clampedX = Math.max(ox - otherHalfW, Math.min(ox + otherHalfW, rawTargetX));
        candX =
          Math.abs(clampedX - ox) < Math.min(0.25, tangentStep)
            ? ox
            : safeStep > 0
              ? snapToGrid(clampedX, safeStep)
              : Number(clampedX.toFixed(3));
        candZ = Number((oz - otherHalfD - movHalfD).toFixed(3));
      } else if (face === 'east') {
        const clampedZ = Math.max(oz - otherHalfD, Math.min(oz + otherHalfD, rawTargetZ));
        candZ =
          Math.abs(clampedZ - oz) < Math.min(0.25, tangentStep)
            ? oz
            : safeStep > 0
              ? snapToGrid(clampedZ, safeStep)
              : Number(clampedZ.toFixed(3));
        candX = Number((ox + otherHalfW + movHalfW).toFixed(3));
      } else if (face === 'west') {
        const clampedZ = Math.max(oz - otherHalfD, Math.min(oz + otherHalfD, rawTargetZ));
        candZ =
          Math.abs(clampedZ - oz) < Math.min(0.25, tangentStep)
            ? oz
            : safeStep > 0
              ? snapToGrid(clampedZ, safeStep)
              : Number(clampedZ.toFixed(3));
        candX = Number((ox - otherHalfW - movHalfW).toFixed(3));
      }

      const dist = Math.hypot(rawTargetX - candX, rawTargetZ - candZ);
      if (dist < bestDist) {
        bestDist = dist;
        bestResult = {
          x: candX,
          z: candZ,
          rotationY: alignedRotationY,
          snappedToId: other.id,
          snappedToName: other.name,
          snappedFace: face
        };
      }
    }
  }

  if (bestResult && bestDist <= snapThreshold) {
    return bestResult;
  }

  return {
    x: snapToGrid(rawTargetX, safeStep),
    z: snapToGrid(rawTargetZ, safeStep),
    rotationY: movingAsset.rotationY || 0,
    snappedToId: null,
    snappedToName: null,
    snappedFace: null
  };
}

export interface BuildPlacementSnapResult {
  x: number;
  z: number;
  rotationY: number;
  snappedToId: string | null;
  snappedToName: string | null;
  snappedFace: 'north' | 'south' | 'east' | 'west' | null;
  gridStepUsed: number;
}

/**
 * Pure helper for Build Mode placement & live ghost preview:
 * Supports both variable snap-to-grid size (`0.1m`, `0.25m`, `0.5m`, `1.0m`, `2.0m`, or `0` Free)
 * and magnetic snap-to-asset flush alignment against nearby placed assets on the active floor.
 */
export function computeBuildPlacementPosition(params: {
  rawX: number;
  rawZ: number;
  dimensions: [number, number, number];
  rotationY?: number;
  category?: AssetCategory;
  subType?: string;
  floor?: FloorId;
  floorAssets?: PlacedAsset[];
  gridStep?: number;
  snapToAssetEnabled?: boolean;
  snapThreshold?: number;
  halfGrid?: number;
  excludeAssetIds?: string[];
}): BuildPlacementSnapResult {
  const safeStep = normalizeSnapGridSize(params.gridStep);
  const halfGrid = params.halfGrid ?? GRID_TILE_COUNT / 2 - 0.5;
  const clampedRawX = Math.max(-halfGrid, Math.min(halfGrid, Number(params.rawX) || 0));
  const clampedRawZ = Math.max(-halfGrid, Math.min(halfGrid, Number(params.rawZ) || 0));
  const baseRotationY = Number(params.rotationY) || 0;
  const floor: FloorId = params.floor ?? 'lobby';
  const excludeSet = new Set(params.excludeAssetIds ?? []);

  if (params.snapToAssetEnabled && Array.isArray(params.floorAssets) && params.floorAssets.length > 0) {
    const filteredFloorAssets = params.floorAssets.filter(
      (a) => Boolean(a) && a.floor === floor && !excludeSet.has(a.id)
    );
    const probeAsset: PlacedAsset = {
      id: '__build_placement_probe__',
      name: params.subType || 'Blueprint Probe',
      category: params.category || 'furniture',
      subType: params.subType || 'probe',
      floor,
      position: [clampedRawX, (params.dimensions?.[1] || 1) / 2, clampedRawZ],
      rotationY: baseRotationY,
      dimensions:
        Array.isArray(params.dimensions) && params.dimensions.length === 3
          ? [params.dimensions[0], params.dimensions[1], params.dimensions[2]]
          : [1, 1, 1],
      color: '#ffffff',
      textureId: 'aged_brass',
      collidable: true
    };

    const snapRes = computeSurfaceSnappedPosition(
      probeAsset,
      clampedRawX,
      clampedRawZ,
      filteredFloorAssets,
      params.snapThreshold ?? 1.85,
      safeStep
    );

    if (snapRes.snappedToId) {
      return {
        x: Number(Math.max(-halfGrid, Math.min(halfGrid, snapRes.x)).toFixed(4)),
        z: Number(Math.max(-halfGrid, Math.min(halfGrid, snapRes.z)).toFixed(4)),
        rotationY: snapRes.rotationY,
        snappedToId: snapRes.snappedToId,
        snappedToName: snapRes.snappedToName,
        snappedFace: snapRes.snappedFace,
        gridStepUsed: safeStep
      };
    }
  }

  return {
    x: Number(Math.max(-halfGrid, Math.min(halfGrid, snapToGrid(clampedRawX, safeStep))).toFixed(4)),
    z: Number(Math.max(-halfGrid, Math.min(halfGrid, snapToGrid(clampedRawZ, safeStep))).toFixed(4)),
    rotationY: baseRotationY,
    snappedToId: null,
    snappedToName: null,
    snappedFace: null,
    gridStepUsed: safeStep
  };
}

/**
 * Pure helper to immediately snap a selected asset flush against the closest surface/wall on its floor.
 */
export function snapAssetToClosestSurfaceNow(
  assets: PlacedAsset[],
  targetAssetId: string,
  gridStep = 0.5
): {
  updatedAssets: PlacedAsset[];
  snappedToName: string | null;
  snappedFace: 'north' | 'south' | 'east' | 'west' | null;
} {
  const target = assets.find((a) => a.id === targetAssetId);
  if (!target) {
    return { updatedAssets: assets, snappedToName: null, snappedFace: null };
  }
  const sameFloorAssets = assets.filter((a) => a.floor === target.floor);
  const snapRes = computeSurfaceSnappedPosition(
    target,
    target.position[0],
    target.position[2],
    sameFloorAssets,
    64, // Search across entire floor when explicitly triggered
    gridStep
  );
  if (!snapRes.snappedToId) {
    return { updatedAssets: assets, snappedToName: null, snappedFace: null };
  }
  const updatedAssets = assets.map((a) =>
    a.id === targetAssetId
      ? {
          ...a,
          position: [snapRes.x, a.dimensions[1] / 2, snapRes.z] as [number, number, number],
          rotationY: snapRes.rotationY
        }
      : a
  );
  return {
    updatedAssets,
    snappedToName: snapRes.snappedToName,
    snappedFace: snapRes.snappedFace
  };
}

/**
 * Pure helper to move one or multiple selected assets simultaneously by the snapped delta of the anchor asset.
 * When surfaceSnap is enabled, the anchor asset aligns flush to the closest wall, surface, or placed asset within snapThreshold.
 * Supports variable snap-to-grid size via `options.gridStep`.
 */
export function moveMultipleAssetsByDelta(
  assets: PlacedAsset[],
  selectedIds: string[],
  anchorAssetId: string,
  targetX: number,
  targetZ: number,
  halfGrid = GRID_TILE_COUNT / 2 - 0.5,
  options?: { surfaceSnap?: boolean; snapThreshold?: number; gridStep?: number }
): PlacedAsset[] {
  const anchor = assets.find((a) => a.id === anchorAssetId);
  if (!anchor) return assets;

  const safeStep = normalizeSnapGridSize(options?.gridStep);
  const idsToMove = selectedIds.includes(anchorAssetId) ? selectedIds : [anchorAssetId];
  const idSet = new Set(idsToMove);

  if (options?.surfaceSnap) {
    const nonSelectedFloorAssets = assets.filter(
      (a) => a.floor === anchor.floor && !idSet.has(a.id)
    );
    const snapped = computeSurfaceSnappedPosition(
      anchor,
      targetX,
      targetZ,
      nonSelectedFloorAssets,
      options.snapThreshold ?? 2.2,
      safeStep
    );
    const dx = Number((snapped.x - anchor.position[0]).toFixed(4));
    const dz = Number((snapped.z - anchor.position[2]).toFixed(4));
    if (dx === 0 && dz === 0 && snapped.rotationY === anchor.rotationY) return assets;

    return assets.map((a) => {
      if (!idSet.has(a.id)) return a;
      const nextX = Number(
        Math.max(-halfGrid, Math.min(halfGrid, a.position[0] + dx)).toFixed(4)
      );
      const nextZ = Number(
        Math.max(-halfGrid, Math.min(halfGrid, a.position[2] + dz)).toFixed(4)
      );
      return {
        ...a,
        position: [nextX, a.dimensions[1] / 2, nextZ],
        rotationY: a.id === anchorAssetId ? snapped.rotationY : a.rotationY
      };
    });
  }

  const dx = snapToGrid(targetX - anchor.position[0], safeStep);
  const dz = snapToGrid(targetZ - anchor.position[2], safeStep);
  if (dx === 0 && dz === 0) return assets;

  return assets.map((a) => {
    if (!idSet.has(a.id)) return a;
    const nextX = snapToGrid(Math.max(-halfGrid, Math.min(halfGrid, a.position[0] + dx)), safeStep);
    const nextZ = snapToGrid(Math.max(-halfGrid, Math.min(halfGrid, a.position[2] + dz)), safeStep);
    return {
      ...a,
      position: [nextX, a.dimensions[1] / 2, nextZ]
    };
  });
}

/**
 * Computes the geometric bounding-box center pivot (pivotX, pivotZ) for a multi-asset selection.
 */
export function computeSelectionGroupPivot(
  selectedAssets: ReadonlyArray<Pick<PlacedAsset, 'position'>>
): { pivotX: number; pivotZ: number } {
  if (selectedAssets.length === 0) {
    return { pivotX: 0, pivotZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const a of selectedAssets) {
    const x = a.position[0];
    const z = a.position[2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    pivotX: Number(((minX + maxX) / 2).toFixed(3)),
    pivotZ: Number(((minZ + maxZ) / 2).toFixed(3))
  };
}

/**
 * Determines whether a multi-asset selection represents an entire room (or room with assets)
 * that should rotate as a single rigid selection around its shared center pivot, versus a
 * single collinear row of walls where each individual wall rotates in place.
 */
export function isEntireRoomSelection(
  selectedAssets: ReadonlyArray<Pick<PlacedAsset, 'category' | 'position'>>
): boolean {
  if (selectedAssets.length <= 1) return false;

  const allWalls = selectedAssets.every((a) => a.category === 'wall');
  if (!allWalls) {
    // Selection includes room assets (furniture, doors, floors, lighting, props, etc.) or mixed room items
    return true;
  }

  // All selected assets are walls: check if they form a 1D row of walls vs a 2D room perimeter
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const a of selectedAssets) {
    const x = a.position[0];
    const z = a.position[2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  // If walls span both X and Z axes (e.g. a 2D room enclosure or corner), treat as room selection;
  // if they lie along a single straight line (a row of walls), rotate each individual wall.
  return spanX > 0.6 && spanZ > 0.6;
}

/**
 * Selects all asset IDs belonging to an entire room on the given floor (including the room's
 * interior furniture/props, floor tiles, doors, windows, and enclosing boundary walls).
 */
export function selectEntireRoomAssetIds(
  assets: PlacedAsset[],
  floor: FloorId,
  seedAssetId?: string | null
): string[] {
  const floorAssets = assets.filter((a) => a.floor === floor);
  if (floorAssets.length === 0) return [];

  const seedAsset = seedAssetId
    ? floorAssets.find((a) => a.id === seedAssetId) ?? null
    : null;

  if (seedAsset) {
    const seedRoom = getRoomLabelAtPosition(floor, seedAsset.position[0], seedAsset.position[2]);
    if (seedRoom && seedRoom !== 'Exterior Lot') {
      const coreRoomAssets = floorAssets.filter(
        (a) => getRoomLabelAtPosition(floor, a.position[0], a.position[2]) === seedRoom
      );
      if (coreRoomAssets.length > 1) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const a of coreRoomAssets) {
          const fp = getOrientedFootprint(a.dimensions, a.rotationY);
          minX = Math.min(minX, a.position[0] - fp.halfW);
          maxX = Math.max(maxX, a.position[0] + fp.halfW);
          minZ = Math.min(minZ, a.position[2] - fp.halfD);
          maxZ = Math.max(maxZ, a.position[2] + fp.halfD);
        }
        const boundaryMargin = 1.35;
        const roomWithBoundaryIds = floorAssets
          .filter(
            (a) =>
              a.position[0] >= minX - boundaryMargin &&
              a.position[0] <= maxX + boundaryMargin &&
              a.position[2] >= minZ - boundaryMargin &&
              a.position[2] <= maxZ + boundaryMargin
          )
          .map((a) => a.id);
        if (roomWithBoundaryIds.length > 1) {
          return roomWithBoundaryIds;
        }
      }
    }
  }

  return floorAssets.map((a) => a.id);
}

/**
 * Pure helper to resize, recolor, re-texture, rotate, or change hinge swing mode on one or multiple selected assets simultaneously.
 * - When rotating (`rotationDeltaY`) a single collinear row of walls, each individual wall rotates in place.
 * - When rotating an entire room selected at once (walls + assets, or a 2D room enclosure, or `rotatePivotMode === 'group'`),
 *   the entire room with all its assets rotates as a single rigid selection around the selection's shared bounding-box center `(pivotX, pivotZ)`.
 */
export function batchModifySelectedAssets(
  assets: PlacedAsset[],
  selectedIds: string[],
  patch: {
    color?: string;
    textureId?: TexturePresetId;
    scaleMultiplier?: number;
    dimensions?: [number, number, number];
    rotationDeltaY?: number;
    rotatePivotMode?: 'auto' | 'group' | 'individual';
    hingeSwingMode?: HingeSwingMode;
    isSecretPassage?: boolean;
    emissionIntensity?: number;
    lightIntensity?: number;
    isLightEmitting?: boolean;
    lightingPreset?: string;
    customAnimationFps?: number | null;
    customFlickerFps?: number | null;
  }
): PlacedAsset[] {
  const idSet = new Set(selectedIds);
  const selectedAssets = assets.filter((a) => idSet.has(a.id));
  const shouldRotateAsGroup =
    patch.rotationDeltaY !== undefined &&
    selectedAssets.length > 1 &&
    (patch.rotatePivotMode === 'group' ||
      (patch.rotatePivotMode !== 'individual' && isEntireRoomSelection(selectedAssets)));
  const groupPivot = shouldRotateAsGroup
    ? computeSelectionGroupPivot(selectedAssets)
    : { pivotX: 0, pivotZ: 0 };

  const hasCustomFpsPatch =
    Object.prototype.hasOwnProperty.call(patch, 'customAnimationFps') ||
    Object.prototype.hasOwnProperty.call(patch, 'customFlickerFps');
  const rawFpsVal = patch.customAnimationFps !== undefined ? patch.customAnimationFps : patch.customFlickerFps;
  const resolvedCustomFps =
    rawFpsVal === null || rawFpsVal === undefined || rawFpsVal <= 0
      ? undefined
      : Number(rawFpsVal);

  return assets.map((a) => {
    if (!idSet.has(a.id)) return a;
    let nextDims: [number, number, number] = [...a.dimensions] as [number, number, number];
    if (patch.dimensions) {
      nextDims = [
        clampDimension(patch.dimensions[0], 0.3, 24),
        clampDimension(patch.dimensions[1], 0.05, 12),
        clampDimension(patch.dimensions[2], 0.2, 24)
      ];
    } else if (patch.scaleMultiplier && patch.scaleMultiplier > 0) {
      nextDims = [
        clampDimension(Math.round(a.dimensions[0] * patch.scaleMultiplier * 100) / 100, 0.3, 24),
        clampDimension(Math.round(a.dimensions[1] * patch.scaleMultiplier * 100) / 100, 0.05, 12),
        clampDimension(Math.round(a.dimensions[2] * patch.scaleMultiplier * 100) / 100, 0.2, 24)
      ];
    }

    const nextFps = hasCustomFpsPatch
      ? resolvedCustomFps
      : (a.customAnimationFps ?? a.customFlickerFps);

    // Sync emissive composite sub-parts when a lighting preset or custom light color is applied
    let nextCompositeParts = a.compositeParts;
    if (
      a.compositeParts &&
      a.compositeParts.length > 0 &&
      patch.color &&
      (patch.lightingPreset !== undefined || patch.isLightEmitting || a.isLightEmitting || a.category === 'lighting')
    ) {
      nextCompositeParts = a.compositeParts.map((part) => {
        const pid = (part.id || '').toLowerCase();
        if (
          Boolean(part.emissive) ||
          pid.includes('shade') ||
          pid.includes('bulb') ||
          pid.includes('lens') ||
          pid.includes('screen') ||
          pid.includes('crt') ||
          pid.includes('phosphor') ||
          pid.includes('display') ||
          pid.includes('coil') ||
          pid.includes('globe')
        ) {
          return {
            ...part,
            emissive: patch.color
          };
        }
        return part;
      });
    }

    const isLightingPatch =
      patch.lightingPreset !== undefined ||
      patch.emissionIntensity !== undefined ||
      patch.lightIntensity !== undefined ||
      (patch.color !== undefined && (patch.isLightEmitting || a.isLightEmitting || a.category === 'lighting'));

    let nextX = a.position[0];
    let nextZ = a.position[2];
    if (shouldRotateAsGroup && patch.rotationDeltaY !== undefined) {
      const dx = a.position[0] - groupPivot.pivotX;
      const dz = a.position[2] - groupPivot.pivotZ;
      const cosD = Math.cos(patch.rotationDeltaY);
      const sinD = Math.sin(patch.rotationDeltaY);
      nextX = Number((groupPivot.pivotX + dx * cosD + dz * sinD).toFixed(3));
      nextZ = Number((groupPivot.pivotZ - dx * sinD + dz * cosD).toFixed(3));
    }

    return {
      ...a,
      prevLightColorHex: isLightingPatch ? (a.color || '#fde68a') : a.prevLightColorHex,
      prevEmissionIntensity: isLightingPatch
        ? Number(a.emissionIntensity ?? a.lightIntensity ?? 1.0)
        : a.prevEmissionIntensity,
      lightingTransitionStartMs: isLightingPatch ? Date.now() : a.lightingTransitionStartMs,
      color: patch.color ?? a.color,
      textureId: patch.textureId ?? a.textureId,
      dimensions: nextDims,
      position: [nextX, nextDims[1] / 2, nextZ],
      rotationY: patch.rotationDeltaY !== undefined ? a.rotationY + patch.rotationDeltaY : a.rotationY,
      hingeSwingMode: patch.hingeSwingMode ?? a.hingeSwingMode,
      isSecretPassage: patch.isSecretPassage !== undefined ? patch.isSecretPassage : a.isSecretPassage,
      emissionIntensity: patch.emissionIntensity !== undefined ? patch.emissionIntensity : a.emissionIntensity,
      lightIntensity: patch.lightIntensity !== undefined ? patch.lightIntensity : a.lightIntensity,
      isLightEmitting: patch.isLightEmitting !== undefined ? patch.isLightEmitting : a.isLightEmitting,
      lightingPreset: patch.lightingPreset !== undefined ? patch.lightingPreset : a.lightingPreset,
      customAnimationFps: nextFps,
      customFlickerFps: nextFps,
      compositeParts: nextCompositeParts
    };
  });
}

export interface LightingPresetDefinition {
  id: string;
  label: string;
  intensity: number;
  color: string;
}

export const LIGHTING_PRESETS: LightingPresetDefinition[] = [
  { id: 'atmospheric_dim', label: 'Atmospheric Dim', intensity: 0.6, color: '#d4944e' },
  { id: 'bright_office', label: 'Bright Office', intensity: 2.0, color: '#f8fafc' },
  { id: 'eerie_flashlight', label: 'Eerie Flashlight', intensity: 1.8, color: '#67e8f9' },
  { id: 'amber_terminal', label: 'Amber Terminal', intensity: 1.2, color: '#c27d38' },
  { id: 'neon_grime', label: 'Neon Green Grime', intensity: 1.5, color: '#4d8a68' },
  { id: 'candlelight', label: 'Candlelight Flicker', intensity: 0.8, color: '#f97316' }
];


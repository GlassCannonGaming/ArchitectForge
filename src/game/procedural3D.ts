import * as THREE from 'three';
import {
  PlacedAsset,
  TexturePresetId,
  AssetConditionVariant,
  CharacterAppearance,
  CharacterClothingStyleId,
  CharacterClothingPattern,
  resolveCharacterClothingStyle,
  resolveCharacterClothingPattern,
  resolveSecondaryClothingColor,
  resolveCharacterHairStyle,
  computeSmoothTorsoVertexDisplacement,
  buildProcedural3DSpecFromPrompt,
  weatherAssetToLate70sStyle,
  resolveAssetConditionVariant,
  isUnkemptOrAgedAsset,
  computeAssetInteractionVisualState,
  computeAssetHingeAnimationState,
  SkeletonPoseEuler,
  FacialRigParams,
  computeFacialRigParams,
  computeNaturalCharacterAnatomySpec,
  NaturalCharacterAnatomySpec,
  computeSmoothFacialVertexDisplacement,
  computeSmoothMandibleVertexDisplacement,
  isInvisibleTriggerAsset,
  CompositeSubPart,
  APARTMENT_BUILDING_CATALOG_BLUEPRINTS,
  computeCompositePartsVerticalShift
} from './rules';

const textureCache = new Map<string, { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }>();
const faceSkinTextureCache = new Map<string, { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }>();
const irisTextureCache = new Map<string, THREE.CanvasTexture>();
const clothingFabricTextureCache = new Map<string, { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }>();

export function getProceduralFaceSkinTextures(
  skinColorHex: string,
  isElderly: boolean
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `smooth_v4__${skinColorHex}__${isElderly ? 'elderly' : 'adult'}`;
  if (faceSkinTextureCache.has(cacheKey)) {
    return faceSkinTextureCache.get(cacheKey)!;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const baseColor = new THREE.Color(skinColorHex || '#f3d9c4');
  const rBase = Math.round(baseColor.r * 255);
  const gBase = Math.round(baseColor.g * 255);
  const bBase = Math.round(baseColor.b * 255);

  // 1. Smooth warm complexion fill calibrated for the 2.17 studio lighting rig
  ctx.fillStyle = `rgb(${rBase}, ${gBase}, ${bBase})`;
  ctx.fillRect(0, 0, size, size);

  // 2. Vertical anatomical complexion temperature zones:
  // Warm golden-ivory forehead -> warm rose-peach mid-face -> soft natural neutral-warm lower jaw
  const vertZoneGrad = ctx.createLinearGradient(0, 0, 0, size);
  vertZoneGrad.addColorStop(0.0, 'rgba(255, 249, 240, 0.08)');
  vertZoneGrad.addColorStop(0.32, 'rgba(255, 244, 232, 0.06)');
  vertZoneGrad.addColorStop(0.55, 'rgba(232, 118, 104, 0.09)');
  vertZoneGrad.addColorStop(0.82, 'rgba(185, 138, 122, 0.05)');
  vertZoneGrad.addColorStop(1.0, 'rgba(145, 108, 96, 0.08)');
  ctx.fillStyle = vertZoneGrad;
  ctx.fillRect(0, 0, size, size);

  // 3. Soft subsurface microvascular cheek & malar warmth (smooth feathered radial gradients)
  const cheekGradL = ctx.createRadialGradient(168, 276, 12, 168, 276, 118);
  cheekGradL.addColorStop(0, 'rgba(224, 102, 92, 0.14)');
  cheekGradL.addColorStop(0.55, 'rgba(224, 102, 92, 0.06)');
  cheekGradL.addColorStop(1, 'rgba(224, 102, 92, 0)');
  ctx.fillStyle = cheekGradL;
  ctx.fillRect(0, 0, size, size);

  const cheekGradR = ctx.createRadialGradient(344, 276, 12, 344, 276, 118);
  cheekGradR.addColorStop(0, 'rgba(224, 102, 92, 0.14)');
  cheekGradR.addColorStop(0.55, 'rgba(224, 102, 92, 0.06)');
  cheekGradR.addColorStop(1, 'rgba(224, 102, 92, 0)');
  ctx.fillStyle = cheekGradR;
  ctx.fillRect(0, 0, size, size);

  // 4. Soft nasal tip warmth & forehead/bridge highlight
  const noseTipWarmth = ctx.createRadialGradient(256, 286, 6, 256, 286, 58);
  noseTipWarmth.addColorStop(0, 'rgba(228, 112, 102, 0.12)');
  noseTipWarmth.addColorStop(1, 'rgba(228, 112, 102, 0)');
  ctx.fillStyle = noseTipWarmth;
  ctx.fillRect(0, 0, size, size);

  const bridgeHighlight = ctx.createRadialGradient(256, 196, 8, 256, 196, 110);
  bridgeHighlight.addColorStop(0, 'rgba(255, 250, 244, 0.14)');
  bridgeHighlight.addColorStop(0.6, 'rgba(255, 250, 244, 0.05)');
  bridgeHighlight.addColorStop(1, 'rgba(255, 250, 244, 0)');
  ctx.fillStyle = bridgeHighlight;
  ctx.fillRect(0, 0, size, size);

  // 5. Ultra-smooth silk-finish normal/bump map (no blocky pixel rectangles!)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, size, size);

  // Soft anatomical elevation contour on bump map (smooth radial gradients only)
  const bumpForehead = bumpCtx.createRadialGradient(256, 180, 10, 256, 180, 140);
  bumpForehead.addColorStop(0, 'rgba(136, 136, 136, 0.35)');
  bumpForehead.addColorStop(1, 'rgba(128, 128, 128, 0)');
  bumpCtx.fillStyle = bumpForehead;
  bumpCtx.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.needsUpdate = true;

  const result = { map, bumpMap };
  faceSkinTextureCache.set(cacheKey, result);
  return result;
}

/**
 * Builds a high-resolution (64x48) continuous, smoothly sculpted human craniofacial BufferGeometry
 * using `computeSmoothFacialVertexDisplacement` and recomputed smooth vertex normals.
 */
export function buildSmoothSculptedHeadGeometry(
  anatomy: NaturalCharacterAnatomySpec,
  widthSegments = 64,
  heightSegments = 48
): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const posAttr = geom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const nx = posAttr.getX(i);
    const ny = posAttr.getY(i);
    const nz = posAttr.getZ(i);
    const [vx, vy, vz] = computeSmoothFacialVertexDisplacement(nx, ny, nz, anatomy);
    posAttr.setXYZ(i, vx, vy, vz);
  }
  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a high-resolution (48x32) continuous, smoothly sculpted human mandible & chin BufferGeometry
 * in `jawPivot` local space with recomputed smooth vertex normals.
 */
export function buildSmoothSculptedMandibleGeometry(
  anatomy: NaturalCharacterAnatomySpec,
  widthSegments = 48,
  heightSegments = 32
): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const posAttr = geom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const nx = posAttr.getX(i);
    const ny = posAttr.getY(i);
    const nz = posAttr.getZ(i);
    const [vx, vy, vz] = computeSmoothMandibleVertexDisplacement(nx, ny, nz, anatomy);
    posAttr.setXYZ(i, vx, vy, vz);
  }
  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export function getProceduralIrisTexture(
  eyeStyle: CharacterAppearance['eyeStyle'] = 'wide_amber'
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `smooth_iris_v2__${eyeStyle || 'wide_amber'}`;
  if (irisTextureCache.has(cacheKey)) {
    return irisTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = 128;
  const cy = 128;
  const outerR = 120;

  let outerHex = '#1e293b';
  let midHex = '#b45309';
  let innerHex = '#f59e0b';
  if (eyeStyle === 'hollow_glow') {
    outerHex = '#0369a1';
    midHex = '#38bdf8';
    innerHex = '#bae6fd';
  } else if (eyeStyle === 'narrow_suspicious') {
    outerHex = '#1f2937';
    midHex = '#4b5563';
    innerHex = '#9ca3af';
  } else if (eyeStyle === 'button_dark') {
    outerHex = '#1c1917';
    midHex = '#44403c';
    innerHex = '#78350f';
  }

  // Soft dark limbal ring -> rich stromal iris gradient -> warm collarette ring
  const grad = ctx.createRadialGradient(cx, cy, 22, cx, cy, outerR);
  grad.addColorStop(0, innerHex);
  grad.addColorStop(0.36, innerHex);
  grad.addColorStop(0.72, midHex);
  grad.addColorStop(0.90, outerHex);
  grad.addColorStop(1.0, '#09090b');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Delicate, smooth radial iris stromal fibers
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.11)' : 'rgba(15,23,42,0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
    ctx.lineTo(Math.cos(angle) * 110, Math.sin(angle) * 110);
    ctx.stroke();
  }
  ctx.restore();

  // Soft upper-lid ambient shadow across top of iris for natural depth
  const lidShadow = ctx.createLinearGradient(0, 0, 0, 256);
  lidShadow.addColorStop(0, 'rgba(10, 10, 16, 0.32)');
  lidShadow.addColorStop(0.35, 'rgba(10, 10, 16, 0.06)');
  lidShadow.addColorStop(1, 'rgba(10, 10, 16, 0)');
  ctx.fillStyle = lidShadow;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  irisTextureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Generates procedural 256x256 woven textile color & bump maps for character clothing
 * supporting 'solid' (fine twill), 'herringbone', 'pinstripe', 'plaid', and 'ribbed_knit'.
 */
export function getProceduralClothingFabricTextures(
  primaryHex: string,
  secondaryHex: string,
  pattern: CharacterClothingPattern = 'herringbone'
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `fabric_v2__${primaryHex}__${secondaryHex}__${pattern}`;
  if (clothingFabricTextureCache.has(cacheKey)) {
    return clothingFabricTextureCache.get(cacheKey)!;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!ctx || !bCtx) return null;

  const baseCol = new THREE.Color(primaryHex || '#5c4033');
  const secCol = new THREE.Color(secondaryHex || '#262320');
  const lightThread = baseCol.clone().offsetHSL(0, -0.02, 0.08);
  const darkThread = baseCol.clone().offsetHSL(0, 0.02, -0.08);
  const stripeCol = baseCol.clone().lerp(new THREE.Color('#f8fafc'), 0.35);

  ctx.fillStyle = `#${baseCol.getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = 'rgb(128, 128, 128)';
  bCtx.fillRect(0, 0, size, size);

  if (pattern === 'pinstripe') {
    // Fine wool twill background + vertical chalk pinstripes
    ctx.strokeStyle = `#${darkThread.getHexString()}`;
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.strokeStyle = `#${stripeCol.getHexString()}`;
    ctx.lineWidth = 2;
    bCtx.strokeStyle = 'rgb(168, 168, 168)';
    bCtx.lineWidth = 2;
    for (let x = 8; x < size; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(x, 0);
      bCtx.lineTo(x, size);
      bCtx.stroke();
    }
  } else if (pattern === 'herringbone') {
    // Classic V-chevron wool herringbone weave
    const stepX = 16;
    const stepY = 8;
    for (let y = -stepY; y < size + stepY; y += stepY) {
      for (let x = 0; x < size; x += stepX * 2) {
        ctx.strokeStyle = `#${lightThread.getHexString()}`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + stepX, y + stepY);
        ctx.lineTo(x + stepX * 2, y);
        ctx.stroke();

        ctx.strokeStyle = `#${darkThread.getHexString()}`;
        ctx.beginPath();
        ctx.moveTo(x, y + stepY * 0.5);
        ctx.lineTo(x + stepX, y + stepY * 1.5);
        ctx.lineTo(x + stepX * 2, y + stepY * 0.5);
        ctx.stroke();

        bCtx.strokeStyle = 'rgb(172, 172, 172)';
        bCtx.lineWidth = 2;
        bCtx.beginPath();
        bCtx.moveTo(x, y);
        bCtx.lineTo(x + stepX, y + stepY);
        bCtx.lineTo(x + stepX * 2, y);
        bCtx.stroke();
      }
    }
  } else if (pattern === 'plaid') {
    // Glen tartan check weave combining primary, secondary, and warm highlight threads
    const tartanBand = secCol.clone().lerp(baseCol, 0.35);
    ctx.fillStyle = `rgba(${Math.round(tartanBand.r * 255)}, ${Math.round(tartanBand.g * 255)}, ${Math.round(tartanBand.b * 255)}, 0.42)`;
    for (let i = 0; i < size; i += 48) {
      ctx.fillRect(i, 0, 18, size);
      ctx.fillRect(0, i, size, 18);
    }
    ctx.strokeStyle = `#${lightThread.clone().offsetHSL(0.03, 0.12, 0.1).getHexString()}`;
    ctx.lineWidth = 1.6;
    for (let i = 24; i < size; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    bCtx.strokeStyle = 'rgb(160, 160, 160)';
    bCtx.lineWidth = 1.5;
    for (let i = 0; i < size; i += 8) {
      bCtx.beginPath();
      bCtx.moveTo(i, 0);
      bCtx.lineTo(i, size);
      bCtx.moveTo(0, i);
      bCtx.lineTo(size, i);
      bCtx.stroke();
    }
  } else if (pattern === 'ribbed_knit') {
    // Thick vertical cable & ribbed knit columns
    for (let x = 0; x < size; x += 12) {
      ctx.fillStyle = `#${darkThread.getHexString()}`;
      ctx.fillRect(x, 0, 4, size);
      ctx.fillStyle = `#${lightThread.getHexString()}`;
      ctx.fillRect(x + 4, 0, 5, size);

      bCtx.fillStyle = 'rgb(92, 92, 92)';
      bCtx.fillRect(x, 0, 4, size);
      bCtx.fillStyle = 'rgb(185, 185, 185)';
      bCtx.fillRect(x + 4, 0, 6, size);

      // Cable stitch diagonal ticks
      for (let y = 0; y < size; y += 10) {
        ctx.strokeStyle = `#${darkThread.getHexString()}`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + 10, y + 6);
        ctx.stroke();
      }
    }
  } else {
    // 'solid' — fine diagonal gabardine/twill micro-weave so cloth never looks like flat plastic
    ctx.strokeStyle = `#${lightThread.getHexString()}`;
    ctx.lineWidth = 1;
    bCtx.strokeStyle = 'rgb(148, 148, 148)';
    bCtx.lineWidth = 1;
    for (let i = -size; i < size * 2; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(i, 0);
      bCtx.lineTo(i + size, size);
      bCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.needsUpdate = true;

  const result = { map, bumpMap };
  clothingFabricTextureCache.set(cacheKey, result);
  return result;
}

/**
 * Builds a continuous, vertex-sculpted anatomical torso segment ('pelvis' | 'abdomen' | 'thorax')
 * using `computeSmoothTorsoVertexDisplacement` so the character's chest, waist, shoulders, back,
 * and hips have organic human curves without spherical balls stuck onto cylindrical tubes.
 */
function buildSmoothSculptedTorsoSegmentGeometry(
  segmentKind: 'pelvis' | 'abdomen' | 'thorax',
  height: number,
  yBottomOffset: number,
  anatomy: NaturalCharacterAnatomySpec,
  clothingStyle: CharacterClothingStyleId,
  radialSegs = 40,
  heightSegs = 18
): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(1, 1, height, radialSegs, heightSegs, false);
  const pos = geom.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const vNorm = Math.max(0, Math.min(1, (vy + height * 0.5) / Math.max(0.0001, height)));
    const rHoriz = Math.hypot(vx, vz);

    if (rHoriz < 0.0001) {
      // Top or bottom cap center vertex
      pos.setXYZ(i, 0, vy + height * 0.5 + yBottomOffset, 0);
      continue;
    }

    const theta = Math.atan2(vx, vz);
    const [dx, dyOff, dz] = computeSmoothTorsoVertexDisplacement(
      theta,
      vNorm,
      segmentKind,
      anatomy,
      clothingStyle
    );
    pos.setXYZ(
      i,
      dx * Math.min(1, rHoriz),
      vy + height * 0.5 + yBottomOffset + dyOff * Math.min(1, rHoriz),
      dz * Math.min(1, rHoriz)
    );
  }

  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}


const SPECIALIZED_70S_SUBTYPES = new Set<string>([
  'vintage_radiator',
  'icebox_fridge',
  'rotary_wall_phone',
  'crt_tv_vhs_combo',
  'soda_vending_machine',
  'concierge_crt_computer',
  'retro_teal_armchair',
  'lobby_payphone_booth',
  'porcelain_bathtub',
  'marble_vanity_sink',
  'suite_porcelain_toilet',
  'gilded_wall_painting',
  'potted_lobby_palm',
  'brass_towel_rack',
  'retrofit_window_ac',
  'resident_kitchenette',
  'resident_steamer_trunk',
  'investigator_notebook_prop',
  'microcassette_player_prop',
  'chrome_dcell_flashlight_prop',
  'evidence_corkboard_prop',
  'master_skeleton_keyring_prop'
]);

const CATALOG_BLUEPRINT_BY_SUBTYPE = new Map(
  APARTMENT_BUILDING_CATALOG_BLUEPRINTS.map((bp) => [bp.subType, bp])
);

export function resolveCatalogCompositeParts(
  subType: string,
  name: string,
  explicitParts?: CompositeSubPart[]
): CompositeSubPart[] | undefined {
  if (explicitParts && explicitParts.length > 0) {
    return explicitParts;
  }
  const catalogBp = CATALOG_BLUEPRINT_BY_SUBTYPE.get(subType);
  if (catalogBp?.compositeParts && catalogBp.compositeParts.length > 0) {
    return catalogBp.compositeParts;
  }
  if (SPECIALIZED_70S_SUBTYPES.has(subType)) {
    return buildProcedural3DSpecFromPrompt(name || subType).parts;
  }
  return undefined;
}

export function getBlueprint3DPreviewParts(blueprint: {
  subType: string;
  name: string;
  category: string;
  defaultDimensions: [number, number, number];
  defaultColor: string;
  defaultTexture?: TexturePresetId;
  isSecretPassage?: boolean;
  isInvisibleTrigger?: boolean;
  conditionVariant?: AssetConditionVariant;
  compositeParts?: CompositeSubPart[];
}): CompositeSubPart[] {
  const resolved = resolveCatalogCompositeParts(
    blueprint.subType || '',
    blueprint.name || '',
    blueprint.compositeParts
  );
  if (resolved && resolved.length > 0) {
    return resolved;
  }

  const [w, h, d] =
    Array.isArray(blueprint.defaultDimensions) && blueprint.defaultDimensions.length === 3
      ? [
          Number(blueprint.defaultDimensions[0]) || 1,
          Number(blueprint.defaultDimensions[1]) || 1,
          Number(blueprint.defaultDimensions[2]) || 1
        ]
      : [1, 1, 1];
  const primaryColor = blueprint.defaultColor || '#8a8170';
  const isUpdated = blueprint.conditionVariant === 'updated' || (blueprint.subType || '').endsWith('_90s');
  const trimWoodColor = isUpdated ? '#1e242b' : '#26160c';
  const brassAccentColor = isUpdated ? '#64748b' : '#6b5634';

  if (blueprint.isInvisibleTrigger || blueprint.subType === 'invisible_event_trigger') {
    return [
      { id: 'trigger_floor_ring', shape: 'torus', offset: [0, 0.04, 0], size: [Math.min(w, d) * 0.36, 0.05, Math.min(w, d) * 0.36], rotation: [Math.PI / 2, 0, 0], color: '#06b6d4', roughness: 0.2, metalness: 0.4, emissive: '#0891b2' },
      { id: 'trigger_core_diamond', shape: 'sphere', offset: [0, h * 0.5, 0], size: [0.28, 0.28, 0.28], color: '#22d3ee', roughness: 0.15, metalness: 0.3, emissive: '#06b6d4' },
      { id: 'trigger_post_nw', shape: 'cylinder', offset: [-w * 0.45, h * 0.5, -d * 0.45], size: [0.03, h, 0.03], color: '#06b6d4', roughness: 0.3, metalness: 0.5 },
      { id: 'trigger_post_ne', shape: 'cylinder', offset: [w * 0.45, h * 0.5, -d * 0.45], size: [0.03, h, 0.03], color: '#06b6d4', roughness: 0.3, metalness: 0.5 },
      { id: 'trigger_post_sw', shape: 'cylinder', offset: [-w * 0.45, h * 0.5, d * 0.45], size: [0.03, h, 0.03], color: '#06b6d4', roughness: 0.3, metalness: 0.5 },
      { id: 'trigger_post_se', shape: 'cylinder', offset: [w * 0.45, h * 0.5, d * 0.45], size: [0.03, h, 0.03], color: '#06b6d4', roughness: 0.3, metalness: 0.5 }
    ];
  }

  if (blueprint.category === 'wall' || blueprint.category === 'window_wall') {
    const parts: CompositeSubPart[] = [
      { id: 'wall_body', shape: 'box', offset: [0, h * 0.5, 0], size: [w, h * 0.88, d], color: primaryColor, roughness: 0.82, metalness: 0.1 },
      { id: 'baseboard_plinth', shape: 'box', offset: [0, h * 0.05, 0], size: [w + 0.04, h * 0.1, d + 0.05], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'crown_cornice', shape: 'box', offset: [0, h * 0.965, 0], size: [w + 0.04, h * 0.07, d + 0.06], color: trimWoodColor, roughness: 0.68, metalness: 0.12 }
    ];
    if (blueprint.subType === 'interior_plaster_wall' || blueprint.defaultTexture === 'plaster_cream') {
      parts.push({
        id: 'wainscot_lower_band',
        shape: 'box',
        offset: [0, h * 0.22, 0.01],
        size: [w + 0.01, h * 0.26, d + 0.02],
        color: '#3b2314',
        roughness: 0.72,
        metalness: 0.1
      });
    }
    if (blueprint.category === 'window_wall') {
      parts.push(
        { id: 'window_sill', shape: 'box', offset: [0, h * 0.30, 0], size: [w * 0.62, 0.08, d + 0.08], color: trimWoodColor, roughness: 0.65, metalness: 0.15 },
        { id: 'casement_pane', shape: 'box', offset: [0, h * 0.56, 0.01], size: [w * 0.55, h * 0.48, d + 0.04], color: '#2b353b', roughness: 0.32, metalness: 0.45, emissive: '#4a351d' }
      );
    }
    return parts;
  }

  if (blueprint.category === 'secret_wall' || blueprint.category === 'door' || blueprint.isSecretPassage) {
    return [
      { id: 'left_jamb', shape: 'box', offset: [-w * 0.46, h * 0.5, 0], size: [w * 0.08, h, d * 1.15], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'right_jamb', shape: 'box', offset: [w * 0.46, h * 0.5, 0], size: [w * 0.08, h, d * 1.15], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'door_panel', shape: 'box', offset: [0, h * 0.5, 0], size: [w * 0.92, h * 0.94, d * 0.75], color: primaryColor, roughness: 0.75, metalness: 0.1 },
      { id: 'shelf_bottom', shape: 'box', offset: [0, h * 0.25, 0.02], size: [w * 0.84, 0.07, d * 0.95], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'shelf_mid', shape: 'box', offset: [0, h * 0.50, 0.02], size: [w * 0.84, 0.07, d * 0.95], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'shelf_top', shape: 'box', offset: [0, h * 0.75, 0.02], size: [w * 0.84, 0.07, d * 0.95], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'brass_latch', shape: 'cylinder', offset: [-w * 0.32, h * 0.5, 0.04], size: [0.06, d + 0.12, 0.06], rotation: [Math.PI / 2, 0, 0], color: brassAccentColor, roughness: 0.38, metalness: 0.75 }
    ];
  }

  if (blueprint.subType === 'four_poster_bed') {
    return [
      { id: 'bed_frame', shape: 'box', offset: [0, h * 0.18, 0], size: [w, h * 0.28, d], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'mattress', shape: 'box', offset: [0, h * 0.38, 0], size: [w * 0.92, h * 0.24, d * 0.9], color: primaryColor, roughness: 0.82, metalness: 0.08 },
      { id: 'pillow', shape: 'box', offset: [0, h * 0.55, -d * 0.32], size: [w * 0.75, h * 0.14, d * 0.22], color: '#968d7b', roughness: 0.9, metalness: 0.02 },
      { id: 'headboard', shape: 'box', offset: [0, h * 0.56, -d * 0.46], size: [w, h * 0.85, 0.14], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'post_nw', shape: 'cylinder', offset: [-w * 0.46, h * 0.5, -d * 0.46], size: [0.05, h, 0.05], color: brassAccentColor, roughness: 0.38, metalness: 0.75 },
      { id: 'post_ne', shape: 'cylinder', offset: [w * 0.46, h * 0.5, -d * 0.46], size: [0.05, h, 0.05], color: brassAccentColor, roughness: 0.38, metalness: 0.75 },
      { id: 'post_sw', shape: 'cylinder', offset: [-w * 0.46, h * 0.5, d * 0.46], size: [0.05, h, 0.05], color: brassAccentColor, roughness: 0.38, metalness: 0.75 },
      { id: 'post_se', shape: 'cylinder', offset: [w * 0.46, h * 0.5, d * 0.46], size: [0.05, h, 0.05], color: brassAccentColor, roughness: 0.38, metalness: 0.75 }
    ];
  }

  if (blueprint.subType === 'reception_desk') {
    return [
      { id: 'counter_hull', shape: 'box', offset: [0, h * 0.44, 0], size: [w, h * 0.88, d * 0.88], color: primaryColor, roughness: 0.78, metalness: 0.1 },
      { id: 'top_slab', shape: 'box', offset: [0, h * 0.94, 0], size: [w + 0.12, h * 0.12, d + 0.1], color: trimWoodColor, roughness: 0.65, metalness: 0.12 },
      { id: 'guest_ledger', shape: 'box', offset: [-0.35, h * 1.02, 0.1], size: [0.55, 0.08, 0.42], color: '#4a181b', roughness: 0.78, metalness: 0.1 },
      { id: 'call_bell', shape: 'sphere', offset: [0.45, h * 1.04, 0.15], size: [0.11, 0.11, 0.11], color: brassAccentColor, roughness: 0.35, metalness: 0.8 }
    ];
  }

  if (blueprint.category === 'lighting') {
    return [
      { id: 'desk_top', shape: 'box', offset: [0, h * 0.60, 0], size: [w, h * 0.12, d], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'left_pedestal', shape: 'box', offset: [-w * 0.36, h * 0.32, 0], size: [w * 0.24, h * 0.65, d * 0.88], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'right_pedestal', shape: 'box', offset: [w * 0.36, h * 0.32, 0], size: [w * 0.24, h * 0.65, d * 0.88], color: trimWoodColor, roughness: 0.68, metalness: 0.12 },
      { id: 'lamp_stem', shape: 'cylinder', offset: [0, h * 0.82, -0.1], size: [0.06, 0.36, 0.06], color: brassAccentColor, roughness: 0.38, metalness: 0.75 },
      { id: 'lamp_shade', shape: 'cone', offset: [0, h * 0.98, -0.1], size: [0.24, 0.18, 0.24], color: primaryColor, roughness: 0.35, metalness: 0.25, emissive: '#fde68a' }
    ];
  }

  if (blueprint.category === 'floor_tile') {
    const tileH = Math.max(0.05, h);
    return [
      { id: 'rug_border', shape: 'box', offset: [0, tileH * 0.3, 0], size: [w + 0.08, Math.max(0.03, tileH * 0.6), d + 0.08], color: brassAccentColor, roughness: 0.45, metalness: 0.65 },
      { id: 'rug_surface', shape: 'box', offset: [0, tileH * 0.55, 0], size: [w, tileH, d], color: primaryColor, roughness: 0.88, metalness: 0.05 }
    ];
  }

  return [
    { id: 'hull', shape: 'box', offset: [0, h * 0.44, 0], size: [w * 0.92, h * 0.88, d * 0.9], color: primaryColor, roughness: 0.78, metalness: 0.12 },
    { id: 'cap', shape: 'box', offset: [0, h * 0.94, 0], size: [w, h * 0.1, d], color: brassAccentColor, roughness: 0.38, metalness: 0.75 },
    { id: 'dial', shape: 'cylinder', offset: [w * 0.28, h * 0.68, d * 0.46], size: [0.1, 0.08, 0.1], rotation: [Math.PI / 2, 0, 0], color: brassAccentColor, roughness: 0.38, metalness: 0.75 }
  ];
}

export function getProceduralMaterialTextures(
  preset: TexturePresetId,
  maxAnisotropy = 4,
  conditionVariant: AssetConditionVariant = 'pristine'
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const cacheKey = `${preset}__${conditionVariant}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base fill
  bCtx.fillStyle = '#707070';
  bCtx.fillRect(0, 0, 256, 256);

  if (preset === 'nyc_old_brick') {
    ctx.fillStyle = '#241b17'; // Cracked dark soot mortar
    ctx.fillRect(0, 0, 256, 256);
    bCtx.fillStyle = '#242424';
    bCtx.fillRect(0, 0, 256, 256);

    const rows = 8;
    const cols = 4;
    const brickH = 256 / rows;
    const brickW = 256 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (brickW / 2);
      for (let c = -1; c <= cols; c++) {
        const x = c * brickW + offset;
        const y = r * brickH;
        const shade = ((r * 7 + c * 13) % 22) - 11;
        const red = Math.min(255, Math.max(55, 92 + shade));
        const green = Math.min(255, Math.max(22, 40 + Math.floor(shade * 0.45)));
        const blue = Math.min(255, Math.max(18, 32 + Math.floor(shade * 0.35)));
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(x + 3, y + 3, brickW - 6, brickH - 6);

        bCtx.fillStyle = '#c4c4c4';
        bCtx.fillRect(x + 3, y + 3, brickW - 6, brickH - 6);
      }
    }
    // Soot & damp water-damage vertical streaks
    ctx.fillStyle = 'rgba(15, 12, 10, 0.28)';
    ctx.fillRect(28, 0, 36, 256);
    ctx.fillRect(156, 40, 44, 216);
  } else if (preset === 'checker_marble') {
    const tiles = 4;
    const size = 256 / tiles;
    for (let r = 0; r < tiles; r++) {
      for (let c = 0; c < tiles; c++) {
        const isDark = (r + c) % 2 === 0;
        // Yellowed 1970s ecru linoleum & scuffed charcoal-slate tile
        ctx.fillStyle = isDark ? '#26231f' : '#8f8776';
        ctx.fillRect(c * size, r * size, size, size);
        bCtx.fillStyle = isDark ? '#787878' : '#9c9c9c';
        bCtx.fillRect(c * size + 1, r * size + 1, size - 2, size - 2);
      }
    }
    // Scuff & grime overlay
    ctx.fillStyle = 'rgba(28, 24, 18, 0.22)';
    ctx.fillRect(0, 96, 256, 48);
  } else if (preset === 'oak_parquet') {
    ctx.fillStyle = '#331d10';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) {
      const y = i * 16;
      ctx.fillStyle = i % 2 === 0 ? '#3d2415' : '#2b180d';
      ctx.fillRect(0, y, 256, 14);
      bCtx.fillStyle = '#9a9a9a';
      bCtx.fillRect(0, y, 256, 14);
    }
  } else if (preset === 'wallpaper_damask') {
    // Faded late-70s avocado-olive & harvest-ochre peeling wallpaper
    ctx.fillStyle = '#262e22';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#4d4329';
    ctx.lineWidth = 3;
    for (let x = 32; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    // Water stain patch near top and bottom
    ctx.fillStyle = 'rgba(24, 20, 14, 0.34)';
    ctx.fillRect(0, 0, 256, 38);
    ctx.fillRect(80, 175, 110, 81);
  } else if (preset === 'velvet_crimson') {
    // Threadbare dried-oxblood corridor runner
    ctx.fillStyle = '#3d1417';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#5c3b1e';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 232, 232);
  } else if (preset === 'aged_brass') {
    // Tarnished antique brass / oxidized bronze
    ctx.fillStyle = '#473820';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#635030';
    ctx.fillRect(8, 8, 240, 240);
  } else {
    // plaster_cream (nicotine-stained beige plaster) or industrial_concrete (damp cellar slate)
    ctx.fillStyle = preset === 'industrial_concrete' ? '#36383b' : '#8f8777';
    ctx.fillRect(0, 0, 256, 256);
    // Damp water stain band
    ctx.fillStyle = 'rgba(38, 32, 24, 0.18)';
    ctx.fillRect(0, 0, 256, 36);
    ctx.fillStyle = '#2e1b0f';
    ctx.fillRect(0, 196, 256, 60); // Dark walnut wainscoting band at bottom
  }

  // Condition Variant Procedural Weathering Re-Texture Pass ('pristine' | 'unkempt' | 'updated')
  if (conditionVariant === 'unkempt') {
    // Heavy grime, soot streaks, damp water rings & pitted surface relief
    ctx.fillStyle = 'rgba(18, 14, 10, 0.32)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(10, 8, 6, 0.38)';
    ctx.fillRect(18, 0, 28, 256);
    ctx.fillRect(112, 34, 46, 222);
    ctx.fillRect(198, 0, 24, 190);
    ctx.strokeStyle = 'rgba(8, 6, 4, 0.48)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(42, 16);
    ctx.lineTo(68, 95);
    ctx.lineTo(54, 188);
    ctx.stroke();

    bCtx.fillStyle = '#383838';
    bCtx.fillRect(18, 24, 44, 96);
    bCtx.fillRect(134, 88, 68, 114);
  } else if (conditionVariant === 'updated') {
    // 1990s Hotel Commercial Renovation: cleaner satin finish, muted cool-teal/mauve hospitality sheen
    ctx.fillStyle = 'rgba(220, 232, 236, 0.14)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(42, 107, 108, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, 244, 244);

    bCtx.fillStyle = '#888888';
    bCtx.fillRect(8, 8, 240, 240);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  const entry = { map, bumpMap };
  textureCache.set(cacheKey, entry);
  return entry;
}

/**
 * Creates a soft radial contact shadow plane placed at bottom-center (y = 0.015)
 */
export function createContactShadowDisc(radiusX: number, radiusZ: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(0.5, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x050505,
    transparent: true,
    opacity: 0.52,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(radiusX * 1.9, 1, radiusZ * 1.9);
  mesh.position.y = 0.015;
  return mesh;
}

/**
 * Builds a composite 3-12 part procedural 3D Group for any hotel architectural or furniture asset.
 * Pivoted cleanly so the group's position matches its world placement while parts have distinct roughness/metalness.
 */
export function buildAssetMeshGroup(
  rawAsset: PlacedAsset,
  maxAnisotropy = 4,
  isSelected = false
): THREE.Group {
  const conditionVariant = resolveAssetConditionVariant(rawAsset);
  const asset = weatherAssetToLate70sStyle(rawAsset, rawAsset.conditionVariant);
  const interactionState = computeAssetInteractionVisualState(asset);
  const unkemptAged = isUnkemptOrAgedAsset(asset);

  const isTrigger = isInvisibleTriggerAsset(rawAsset);

  const group = new THREE.Group();
  group.userData = {
    assetId: asset.id,
    asset,
    conditionVariant,
    isUnkemptOrAged: unkemptAged,
    interactionState,
    isInvisibleTrigger: isTrigger
  };

  const [w, h, d] = asset.dimensions;
  const { map, bumpMap } = getProceduralMaterialTextures(
    asset.textureId,
    maxAnisotropy,
    conditionVariant
  );

  const baseRoughness =
    conditionVariant === 'unkempt'
      ? 0.94
      : conditionVariant === 'updated'
      ? 0.54
      : asset.textureId === 'aged_brass'
      ? 0.42
      : 0.82;

  const baseMetalness =
    conditionVariant === 'unkempt'
      ? 0.06
      : conditionVariant === 'updated'
      ? 0.24
      : asset.textureId === 'aged_brass'
      ? 0.68
      : 0.1;

  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(asset.color || '#8a8170'),
    map,
    bumpMap,
    bumpScale: conditionVariant === 'unkempt' ? 0.055 : conditionVariant === 'updated' ? 0.018 : 0.035,
    roughness: baseRoughness,
    metalness: baseMetalness
  });

  const trimWoodMat = new THREE.MeshStandardMaterial({
    color: conditionVariant === 'updated' ? 0x1e242b : 0x26160c,
    roughness: conditionVariant === 'unkempt' ? 0.85 : 0.68,
    metalness: 0.12
  });

  const brassAccentMat = new THREE.MeshStandardMaterial({
    color: conditionVariant === 'updated' ? 0x64748b : 0x6b5634,
    roughness: conditionVariant === 'unkempt' ? 0.62 : 0.38,
    metalness: 0.75
  });

  // Automatically synthesize multi-part 3D geometry for specialized late-70s/early-80s and catalog fixtures
  const resolvedCompositeParts = resolveCatalogCompositeParts(
    asset.subType,
    asset.name,
    asset.compositeParts
  );

  let hasDedicatedScreenPart = false;

  // Custom AI / Meshy / Resolved Late-70s Composite Parts
  if (resolvedCompositeParts && resolvedCompositeParts.length > 0) {
    const yShift = computeCompositePartsVerticalShift(resolvedCompositeParts, h);
    const isCompositeDoor =
      asset.category === 'door' || asset.category === 'secret_wall' || Boolean(asset.isSecretPassage);
    let compositeHingePivot: THREE.Group | null = null;
    let compositeHingeX = 0;

    if (isCompositeDoor) {
      const hingeState = computeAssetHingeAnimationState(asset, Date.now());
      compositeHingeX = hingeState.hingeEdgeX;
      compositeHingePivot = new THREE.Group();
      compositeHingePivot.name = 'hingePivot';
      compositeHingePivot.position.set(compositeHingeX + hingeState.slideOffsetX, 0, 0);
      compositeHingePivot.rotation.y = hingeState.angleRad;
      group.add(compositeHingePivot);
      group.userData.hingePivot = compositeHingePivot;
      group.userData.assetWidth = w;
    }

    resolvedCompositeParts.forEach((part) => {
      let geo: THREE.BufferGeometry;
      const [sx, sy, sz] = part.size;
      if (part.shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(sx, sx, sy, 16);
      } else if (part.shape === 'sphere') {
        geo = new THREE.SphereGeometry(sx, 16, 12);
      } else if (part.shape === 'cone') {
        geo = new THREE.ConeGeometry(sx, sy, 16);
      } else if (part.shape === 'torus') {
        geo = new THREE.TorusGeometry(sx, sy, 10, 20);
      } else {
        geo = new THREE.BoxGeometry(sx, sy, sz);
      }

      const partNameLower = (part.id || '').toLowerCase();
      const isScreenPart =
        partNameLower.includes('screen') ||
        partNameLower.includes('crt') ||
        partNameLower.includes('tube') ||
        partNameLower.includes('display') ||
        partNameLower.includes('glass');

      const userEmissionMult = Math.max(0.1, Number(asset.emissionIntensity ?? asset.lightIntensity ?? 1.0));
      let partColorHex = part.color;
      let partEmissiveHex = part.emissive || '#000000';
      let partEmissiveIntensity = part.emissive ? 0.45 * userEmissionMult : 0;

      if (interactionState.interactionKind === 'tv_screen' && isScreenPart) {
        hasDedicatedScreenPart = true;
        if (interactionState.isActivated) {
          partColorHex = interactionState.screenColorHex || '#ffffff';
          partEmissiveHex = interactionState.screenEmissiveHex || '#ffffff';
          partEmissiveIntensity = interactionState.screenEmissiveIntensity || 1.45 * userEmissionMult;
        }
      } else if (interactionState.isActivated && part.emissive) {
        partEmissiveHex = interactionState.screenEmissiveHex;
        partEmissiveIntensity = interactionState.emissiveIntensity;
      }

      const pMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(partColorHex),
        roughness: part.roughness,
        metalness: part.metalness,
        emissive: new THREE.Color(partEmissiveHex),
        emissiveIntensity: partEmissiveIntensity
      });
      const mesh = new THREE.Mesh(geo, pMat);
      mesh.userData = {
        isTvScreen: isScreenPart && interactionState.interactionKind === 'tv_screen',
        baseEmissiveIntensity: partEmissiveIntensity
      };
      if (part.rotation) {
        mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const isStationaryDoorFramePart =
        partNameLower.includes('frame') ||
        partNameLower.includes('jamb') ||
        partNameLower.includes('track');

      if (compositeHingePivot && !isStationaryDoorFramePart) {
        mesh.position.set(part.offset[0] - compositeHingeX, part.offset[1] + yShift, part.offset[2]);
        compositeHingePivot.add(mesh);
      } else {
        mesh.position.set(part.offset[0], part.offset[1] + yShift, part.offset[2]);
        group.add(mesh);
      }
    });
  } else if (isTrigger) {
    // Invisible Event Trigger Volume (Visible in Build Mode as translucent cyan wireframe + beacon, invisible in Walk Mode)
    const volMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(asset.color || '#06b6d4'),
      transparent: true,
      opacity: isSelected ? 0.28 : 0.16,
      depthWrite: false
    });
    const volMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), volMat);
    const wireMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0xf59e0b : 0x06b6d4,
      wireframe: true
    });
    const wireMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wireMat);
    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(Math.min(w, d) * 0.28, Math.min(w, d) * 0.45, 24),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75
      })
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = -h / 2 + 0.03;
    const coreDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    group.add(volMesh, wireMesh, floorRing, coreDiamond);
  } else if (asset.category === 'wall' || asset.category === 'window_wall') {
    // 1. Main wall body
    const bodyGeo = new THREE.BoxGeometry(w, h * 0.88, d);
    const bodyMesh = new THREE.Mesh(bodyGeo, primaryMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // 2. Baseboard plinth (secondary silhouette)
    const baseGeo = new THREE.BoxGeometry(w + 0.04, h * 0.1, d + 0.05);
    const baseMesh = new THREE.Mesh(baseGeo, trimWoodMat);
    baseMesh.position.y = -h / 2 + (h * 0.1) / 2;
    group.add(baseMesh);

    // 3. Crown cornice molding (top accent)
    const crownGeo = new THREE.BoxGeometry(w + 0.04, h * 0.07, d + 0.06);
    const crownMesh = new THREE.Mesh(crownGeo, trimWoodMat);
    crownMesh.position.y = h / 2 - (h * 0.07) / 2;
    group.add(crownMesh);

    // 4. Grimy nocturnal casement window frame with dim sodium-vapor amber streetlight glow
    if (asset.category === 'window_wall') {
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x2b353b,
        roughness: 0.32,
        metalness: 0.45,
        emissive: 0x4a351d,
        emissiveIntensity: 0.28
      });
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.48, d + 0.04), glassMat);
      pane.position.y = h * 0.06;
      group.add(pane);
    }
  } else if (asset.category === 'secret_wall' || asset.category === 'door' || asset.isSecretPassage) {
    // Left & Right Stationary Jambs
    const jambGeo = new THREE.BoxGeometry(w * 0.08, h, d * 1.15);
    const leftJamb = new THREE.Mesh(jambGeo, trimWoodMat);
    leftJamb.position.x = -w * 0.46;
    const rightJamb = new THREE.Mesh(jambGeo, trimWoodMat);
    rightJamb.position.x = w * 0.46;
    group.add(leftJamb, rightJamb);

    // Proposal 2: Apply initial or in-flight 500ms hinge/pocket-slide state ('right_hinge' | 'left_hinge' | 'pocket_slide')
    const hingeState = computeAssetHingeAnimationState(asset, Date.now());
    const hingeX = hingeState.hingeEdgeX;

    const hingePivot = new THREE.Group();
    hingePivot.name = 'hingePivot';
    hingePivot.position.set(hingeX + hingeState.slideOffsetX, 0, 0);

    // Swinging or pocket-sliding door / secret bookshelf panel
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, h * 0.94, d * 0.75),
      primaryMat
    );
    doorPanel.position.x = -hingeX;
    doorPanel.castShadow = true;
    hingePivot.add(doorPanel);

    // Bookshelf ledges or door molding + brass handle mounted to the swinging/sliding assembly
    const shelves: THREE.Mesh[] = [];
    for (let s = -1; s <= 1; s++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.07, d * 0.95), trimWoodMat);
      shelf.position.set(-hingeX, s * (h * 0.25), 0);
      hingePivot.add(shelf);
      shelves.push(shelf);
    }
    const latch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, d + 0.12, 12),
      brassAccentMat
    );
    latch.rotation.x = Math.PI / 2;
    const latchOffsetFromCenter = hingeState.swingMode === 'left_hinge' ? w * 0.32 : -w * 0.32;
    latch.position.set(-hingeX + latchOffsetFromCenter, 0, 0);
    hingePivot.add(latch);

    hingePivot.rotation.y = hingeState.angleRad;

    group.add(hingePivot);
    group.userData.hingePivot = hingePivot;
    group.userData.doorPanel = doorPanel;
    group.userData.shelves = shelves;
    group.userData.latch = latch;
    group.userData.assetWidth = w;
  } else if (asset.subType === 'four_poster_bed') {
    // 5-part composite late-70s weathered apartment bed
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.28, d), trimWoodMat);
    frame.position.y = -h * 0.32;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.24, d * 0.9), primaryMat);
    mattress.position.y = -h * 0.12;
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.75, h * 0.14, d * 0.22),
      new THREE.MeshStandardMaterial({ color: 0x968d7b, roughness: 0.9, metalness: 0.02 })
    );
    pillow.position.set(0, h * 0.05, -d * 0.32);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.85, 0.14), trimWoodMat);
    headboard.position.set(0, h * 0.06, -d * 0.46);
    group.add(frame, mattress, pillow, headboard);

    // 4 Tarnished Corner Posts
    [
      [-w * 0.46, -d * 0.46],
      [w * 0.46, -d * 0.46],
      [-w * 0.46, d * 0.46],
      [w * 0.46, d * 0.46]
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 10), brassAccentMat);
      post.position.set(px, 0, pz);
      group.add(post);
    });
  } else if (asset.subType === 'reception_desk') {
    // Multi-part night clerk desk with counter, tarnished bell, worn oxblood ledger book, and key rack
    const counterHull = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.88, d * 0.88), primaryMat);
    counterHull.position.y = -h * 0.06;
    const topSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h * 0.12, d + 0.1), trimWoodMat);
    topSlab.position.y = h * 0.44;
    const ledger = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.08, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x4a181b, roughness: 0.78, metalness: 0.1 })
    );
    ledger.position.set(-0.35, h * 0.52, 0.1);
    const callBell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), brassAccentMat);
    callBell.position.set(0.45, h * 0.54, 0.15);
    group.add(counterHull, topSlab, ledger, callBell);
  } else if (asset.category === 'lighting') {
    // Detective's Desk & Faded Avocado Banker's Lamp
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.12, d), trimWoodMat);
    deskTop.position.y = h * 0.1;
    const leftPedestal = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h * 0.65, d * 0.88), trimWoodMat);
    leftPedestal.position.set(-w * 0.36, -h * 0.18, 0);
    const rightPedestal = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h * 0.65, d * 0.88), trimWoodMat);
    rightPedestal.position.set(w * 0.36, -h * 0.18, 0);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.36, 10), brassAccentMat);
    lampStem.position.set(0, h * 0.32, -0.1);
    const isLampOn = asset.isActivated !== false;
    const lampEmissionMult = Math.max(0.1, Number(asset.emissionIntensity ?? asset.lightIntensity ?? 1.0));
    const lampBaseEmissive = isLampOn ? 1.15 * lampEmissionMult : 0.15;
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.18, 14),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(isLampOn ? interactionState.lightColorHex || '#fef3c7' : asset.color),
        emissive: new THREE.Color(isLampOn ? interactionState.lightColorHex || '#fde68a' : '#2a2214'),
        emissiveIntensity: lampBaseEmissive,
        roughness: 0.35,
        metalness: 0.25
      })
    );
    lampShade.userData = { baseEmissiveIntensity: lampBaseEmissive };
    lampShade.position.set(0, h * 0.48, -0.1);
    group.add(deskTop, leftPedestal, rightPedestal, lampStem, lampShade);
  } else if (asset.category === 'floor_tile') {
    // Threadbare carpet/floor tile with tarnished border
    const rugMesh = new THREE.Mesh(new THREE.BoxGeometry(w, Math.max(0.04, h), d), primaryMat);
    const borderMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, Math.max(0.02, h * 0.6), d + 0.08), brassAccentMat);
    borderMesh.position.y = -0.008;
    group.add(borderMesh, rugMesh);
  } else {
    // Appliances (TVs, Radiator, Icebox, Switchboard) with multi-part silhouettes
    const hull = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.88, d * 0.9), primaryMat);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.1, d), brassAccentMat);
    cap.position.y = h * 0.44;
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), brassAccentMat);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(w * 0.28, h * 0.18, d * 0.46);
    group.add(hull, cap, dial);
  }

  // Dedicated Front Screen Glass Panel for TV / Monitor Assets (Turns bright white "ON" when interacted with!)
  if (
    (interactionState.interactionKind === 'tv_screen' ||
      interactionState.interactionKind === 'computer_monitor') &&
    !hasDedicatedScreenPart
  ) {
    const isTv = interactionState.interactionKind === 'tv_screen';
    const screenColor = interactionState.isActivated
      ? isTv
        ? '#ffffff'
        : '#34d399'
      : '#111827';
    const screenEmissive = interactionState.isActivated
      ? isTv
        ? '#ffffff'
        : '#10b981'
      : '#000000';
    const screenBaseEmissive = interactionState.isActivated
      ? interactionState.screenEmissiveIntensity || 1.45
      : 0.05;
    const screenMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(screenColor),
      emissive: new THREE.Color(screenEmissive),
      emissiveIntensity: screenBaseEmissive,
      roughness: 0.16,
      metalness: 0.22
    });
    const screenPanel = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.24, w * 0.72), Math.max(0.2, h * 0.58), 0.04),
      screenMat
    );
    screenPanel.name = 'interactiveScreenPanel';
    screenPanel.userData = { isTvScreen: true, baseEmissiveIntensity: screenBaseEmissive };
    screenPanel.position.set(-w * 0.05, h * 0.04, d * 0.46);
    group.add(screenPanel);
  }

  // Emit interactive PointLight glow when a TV ("white on"), lamp, computer, or appliance is activated
  if (interactionState.isActivated && interactionState.emitsLight) {
    const resolvedLightInt =
      interactionState.lightIntensity > 0
        ? interactionState.lightIntensity
        : interactionState.interactionKind === 'tv_screen'
        ? 1.35
        : 0.9;
    const activeLight = new THREE.PointLight(
      new THREE.Color(interactionState.lightColorHex),
      resolvedLightInt,
      interactionState.lightDistance || (interactionState.interactionKind === 'tv_screen' ? 5.5 : 4.2),
      1.6
    );
    activeLight.position.set(0, h * 0.15, d * 0.65);
    activeLight.name = 'interactiveStateLight';
    activeLight.userData = { baseIntensity: resolvedLightInt };
    group.add(activeLight);
  }

  // Selection outline wireframe box in ArchitectForge mode
  if (isSelected) {
    const selBox = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.12, h + 0.12, d + 0.12),
      new THREE.MeshBasicMaterial({
        color: rawAsset.isLocked ? 0xe11d48 : 0xd97706,
        wireframe: true
      })
    );
    group.add(selBox);
  }

  group.position.set(asset.position[0], asset.position[1], asset.position[2]);
  group.rotation.y = asset.rotationY;

  return group;
}

/**
 * Builds the blocky-headed low-poly Chibi Character Mesh (matching toonbuilder_af91be6a.jpeg)
 * with 8+ composite parts: head, hair/hat, left/right eyes, ears, mouth, torso, limbs, and optional pedestal base.
 */
/**
 * Builds the Anatomical Human Skeleton Rig with period-accurate 1970s styling,
 * articulated bone hierarchy (Pelvis -> Lumbar -> Thoracic -> Neck -> Head, arms, legs),
 * configurable kyphosis/bent spine for elderly characters (e.g. old lady with dowager's hump),
 * wooden walking cane accessory, and dynamic facial expression rig.
 */
export function buildCharacterToonGroup(
  appearance: CharacterAppearance,
  includePedestal = false
): THREE.Group {
  const root = new THREE.Group();

  const isElderly =
    appearance.archetype === 'Elderly Matron' ||
    (appearance.spineCurvature !== undefined && appearance.spineCurvature >= 20);

  const anatomy = computeNaturalCharacterAnatomySpec(appearance);
  const baseSkinHex = appearance.skinColor || (isElderly ? '#eed8c7' : '#f3d9c4');
  const skinTextures = getProceduralFaceSkinTextures(baseSkinHex, isElderly);
  const baseSkinColor = new THREE.Color(baseSkinHex);
  const sheenSkinColor = new THREE.Color(baseSkinHex).offsetHSL(-0.02, 0.18, 0.08);

  // Smooth subsurface-scattering-inspired natural skin material with soft peach-rose dermal sheen
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: baseSkinColor,
    map: skinTextures?.map || null,
    bumpMap: skinTextures?.bumpMap || null,
    bumpScale: isElderly ? 0.0005 : 0.0002,
    roughness: isElderly ? 0.48 : 0.40,
    metalness: 0.01,
    sheen: 0.52,
    sheenRoughness: 0.46,
    sheenColor: sheenSkinColor,
    clearcoat: 0.09,
    clearcoatRoughness: 0.42
  });

  // Seamless, closely matched skin contour material (within 2% lightness of skinMat so eyelids and ears blend organically without dark blotches)
  const contourSkinMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(baseSkinHex).offsetHSL(-0.005, 0.04, -0.02),
    map: skinTextures?.map || null,
    roughness: isElderly ? 0.46 : 0.38,
    metalness: 0.01,
    sheen: 0.48,
    sheenRoughness: 0.48,
    sheenColor: sheenSkinColor,
    clearcoat: 0.08,
    clearcoatRoughness: 0.44
  });

  // Soft translucent crease shadow material for subtle tear-trough / expression lines
  const shadowSkinMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(baseSkinHex).offsetHSL(-0.008, 0.06, -0.045),
    roughness: 0.52,
    metalness: 0.01,
    transparent: true,
    opacity: isElderly ? 0.36 : 0.16,
    depthWrite: false
  });

  // Natural hydrated rose-terracotta vermilion lip material calibrated for the studio lighting rig
  const lipColor = new THREE.Color(baseSkinHex).multiply(new THREE.Color('#9e4246'));
  const mouthMat = new THREE.MeshStandardMaterial({
    color: lipColor,
    roughness: 0.66,
    metalness: 0.0
  });
  const lipSeamMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseSkinHex).multiply(new THREE.Color('#421318')),
    roughness: 0.78,
    metalness: 0.0
  });

  const resolvedClothingStyle = resolveCharacterClothingStyle(appearance);
  const resolvedClothingPattern = resolveCharacterClothingPattern(appearance);
  const primaryOutfitHex = appearance.outfitColor || (isElderly ? '#4b5563' : '#78350f');
  const secondaryOutfitHex = resolveSecondaryClothingColor(appearance);
  const accentHex = appearance.accentColor || '#b45309';

  const primaryFabricTex = getProceduralClothingFabricTextures(
    primaryOutfitHex,
    secondaryOutfitHex,
    resolvedClothingPattern
  );
  const secondaryFabricTex = getProceduralClothingFabricTextures(
    secondaryOutfitHex,
    primaryOutfitHex,
    resolvedClothingPattern === 'pinstripe' ? 'pinstripe' : 'solid'
  );
  const knitFabricTex = getProceduralClothingFabricTextures(
    secondaryOutfitHex,
    primaryOutfitHex,
    'ribbed_knit'
  );

  const isVelvet = resolvedClothingStyle === 'velvet_evening_ensemble';
  const isKnit = resolvedClothingStyle === 'knitted_cardigan_shawl';

  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.hairColor || (isElderly ? '#d1d5db' : '#451a03')),
    roughness: 0.62,
    metalness: 0.08
  });

  // Rich woven fabric material with subtle cloth sheen & micro-weave bump
  const outfitMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(primaryOutfitHex),
    map: primaryFabricTex?.map || null,
    bumpMap: primaryFabricTex?.bumpMap || null,
    bumpScale: isKnit ? 0.0032 : 0.0016,
    roughness: isVelvet ? 0.52 : isKnit ? 0.82 : 0.66,
    metalness: 0.04,
    sheen: isVelvet ? 0.88 : 0.42,
    sheenRoughness: isVelvet ? 0.35 : 0.68,
    sheenColor: new THREE.Color(primaryOutfitHex).offsetHSL(0, 0.05, 0.14)
  });

  // Contoured lapel & collar trim material (harmonized shade of outfit fabric, never flat yellow blocks)
  const lapelTrimMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(primaryOutfitHex).offsetHSL(0, 0.02, isVelvet ? -0.06 : 0.045),
    map: primaryFabricTex?.map || null,
    bumpMap: primaryFabricTex?.bumpMap || null,
    bumpScale: 0.0014,
    roughness: isVelvet ? 0.38 : 0.58,
    metalness: 0.05,
    sheen: isVelvet ? 0.92 : 0.48,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(primaryOutfitHex).offsetHSL(0, 0.06, 0.18)
  });

  // Secondary garment / tailored trousers / waistcoat material
  const trouserMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(secondaryOutfitHex),
    map: secondaryFabricTex?.map || null,
    bumpMap: secondaryFabricTex?.bumpMap || null,
    bumpScale: 0.0014,
    roughness: 0.7,
    metalness: 0.04,
    sheen: 0.32,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(secondaryOutfitHex).offsetHSL(0, 0, 0.1)
  });

  // Layered knit / inner vest material
  const innerLayerMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(secondaryOutfitHex).offsetHSL(0, 0.04, 0.05),
    map: knitFabricTex?.map || null,
    bumpMap: knitFabricTex?.bumpMap || null,
    bumpScale: 0.0024,
    roughness: 0.76,
    metalness: 0.02,
    sheen: 0.36,
    sheenRoughness: 0.68
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.32,
    metalness: 0.72
  });
  const silkTieMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.36,
    metalness: 0.12,
    sheen: 0.75,
    sheenRoughness: 0.32,
    clearcoat: 0.12
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x221c18,
    roughness: 0.38,
    metalness: 0.22
  });
  const bootSoleMat = new THREE.MeshStandardMaterial({
    color: 0x120f0d,
    roughness: 0.75,
    metalness: 0.08
  });
  const suedePatchMat = new THREE.MeshStandardMaterial({
    color: 0x4a2f1d,
    roughness: 0.86,
    metalness: 0.02
  });
  const caneWoodMat = new THREE.MeshStandardMaterial({
    color: 0x3d2010,
    roughness: 0.42,
    metalness: 0.15
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.25,
    metalness: 0.86
  });
  const shawlMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(primaryOutfitHex).offsetHSL(0, -0.05, 0.08),
    map: knitFabricTex?.map || null,
    bumpMap: knitFabricTex?.bumpMap || null,
    bumpScale: 0.0025,
    roughness: 0.82,
    metalness: 0.02,
    sheen: 0.35
  });
  const shirtLinenMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f1ea,
    roughness: 0.62,
    metalness: 0.01,
    sheen: 0.28,
    sheenRoughness: 0.75
  });

  const actorGroup = new THREE.Group();
  actorGroup.name = 'actorGroup';
  actorGroup.scale.set(
    appearance.widthScale || 1,
    appearance.heightScale || 1,
    appearance.widthScale || 1
  );

  // 1. Contact shadow disc
  actorGroup.add(createContactShadowDisc(0.48, 0.48));

  // 2. Natural Anatomical Skeleton Hierarchy (Multi-Vertebrae Articulated Spine & Vertex-Sculpted Body):
  // Root Pelvis (y = 0.88m)
  const pelvisBone = new THREE.Group();
  pelvisBone.name = 'pelvisBone';
  pelvisBone.position.set(0, 0.88, 0);

  // Sculpted Iliac Pelvis, Gluteal Curve & Hip Flare (40x16 continuous vertex-sculpted pelvis mesh)
  const pelvisGeom = buildSmoothSculptedTorsoSegmentGeometry(
    'pelvis',
    0.175,
    -0.088,
    anatomy,
    resolvedClothingStyle,
    40,
    16
  );
  const pelvisMesh = new THREE.Mesh(pelvisGeom, trouserMat);
  pelvisMesh.name = 'sculptedPelvisMesh';
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  pelvisBone.add(pelvisMesh);

  // Style-specific Lower Garment Hem / Peplum / Trench Skirt / Cummerbund
  const isLongCoatStyle =
    resolvedClothingStyle === 'noir_trench_coat' ||
    resolvedClothingStyle === 'boiler_utility_jacket' ||
    resolvedClothingStyle === 'knitted_cardigan_shawl';
  const isWaistcoatOnly = resolvedClothingStyle === 'rolled_sleeve_waistcoat';

  if (!isWaistcoatOnly) {
    const skirtHeight = resolvedClothingStyle === 'noir_trench_coat' ? 0.165 : isLongCoatStyle ? 0.135 : 0.095;
    const skirtFlare = resolvedClothingStyle === 'noir_trench_coat' ? 0.184 : 0.166;
    const coatHemGeom = new THREE.CylinderGeometry(
      0.148 * anatomy.waistTaperRatio,
      skirtFlare * anatomy.hipFlareRatio,
      skirtHeight,
      36,
      6
    );
    coatHemGeom.scale(1.06, 1.0, 0.78);
    const coatHemMesh = new THREE.Mesh(coatHemGeom, outfitMat);
    coatHemMesh.name = 'clothingCoatSkirtMesh';
    coatHemMesh.position.set(0, 0.088 - skirtHeight * 0.45, 0);
    coatHemMesh.castShadow = true;
    pelvisBone.add(coatHemMesh);
  }

  // Waist Belt / Silk Cummerbund / Tailored Waistband
  if (resolvedClothingStyle === 'velvet_evening_ensemble') {
    // Pleated Silk Cummerbund Sash
    const sashGeom = new THREE.CylinderGeometry(
      0.149 * anatomy.waistTaperRatio,
      0.153 * anatomy.hipFlareRatio,
      0.056,
      32
    );
    sashGeom.scale(1.07, 1.0, 0.79);
    const sashMesh = new THREE.Mesh(sashGeom, silkTieMat);
    sashMesh.position.set(0, 0.072, 0);
    pelvisBone.add(sashMesh);
  } else {
    const beltMatToUse = resolvedClothingStyle === 'noir_trench_coat' ? lapelTrimMat : bootMat;
    const beltGeom = new THREE.CylinderGeometry(
      0.15 * anatomy.waistTaperRatio,
      0.154 * anatomy.hipFlareRatio,
      0.036,
      32
    );
    beltGeom.scale(1.07, 1.0, 0.79);
    const beltMesh = new THREE.Mesh(beltGeom, beltMatToUse);
    beltMesh.position.set(0, 0.068, 0);
    const buckleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.042, 0.018), brassMat);
    buckleMesh.position.set(0, 0.068, 0.132 * anatomy.waistTaperRatio);
    pelvisBone.add(beltMesh, buckleMesh);
  }

  // L1 Lumbar Spine (Lower Back & Natural Tapered Waist)
  const lumbarSpineBone = new THREE.Group();
  lumbarSpineBone.name = 'lumbarSpineBone';
  lumbarSpineBone.position.set(0, 0.085, 0);

  const lumbarGeom = buildSmoothSculptedTorsoSegmentGeometry(
    'abdomen',
    0.142,
    0.0,
    anatomy,
    resolvedClothingStyle,
    40,
    14
  );
  const lumbarMesh = new THREE.Mesh(lumbarGeom, outfitMat);
  lumbarMesh.name = 'sculptedLumbarMesh';
  lumbarMesh.castShadow = true;
  lumbarMesh.receiveShadow = true;
  lumbarSpineBone.add(lumbarMesh);

  // T6 Lower Thoracic Spine (Mid-Back & Lower Ribcage — key pivot for natural kyphosis / bent spine)
  const lowerThoracicBone = new THREE.Group();
  lowerThoracicBone.name = 'lowerThoracicBone';
  lowerThoracicBone.position.set(0, 0.125, 0);

  const lowerThoracicGeom = buildSmoothSculptedTorsoSegmentGeometry(
    'abdomen',
    0.148,
    0.0,
    anatomy,
    resolvedClothingStyle,
    40,
    14
  );
  lowerThoracicGeom.scale(1.04, 1.0, 1.03);
  const lowerThoracicMesh = new THREE.Mesh(lowerThoracicGeom, outfitMat);
  lowerThoracicMesh.name = 'sculptedLowerThoracicMesh';
  lowerThoracicMesh.castShadow = true;
  lowerThoracicMesh.receiveShadow = true;
  lowerThoracicBone.add(lowerThoracicMesh);

  // T1 Upper Thoracic Spine (Upper Ribcage, Integrated Pectorals, Clavicles, Scapula & Sloped Shoulders)
  const thoracicSpineBone = new THREE.Group();
  thoracicSpineBone.name = 'thoracicSpineBone';
  thoracicSpineBone.position.set(0, 0.135, 0);

  const chestGeom = buildSmoothSculptedTorsoSegmentGeometry(
    'thorax',
    0.228,
    0.0,
    anatomy,
    resolvedClothingStyle,
    44,
    20
  );
  const chestBaseMat = isWaistcoatOnly ? outfitMat : outfitMat;
  const chestMesh = new THREE.Mesh(chestGeom, chestBaseMat);
  chestMesh.name = 'sculptedThoraxMesh';
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  thoracicSpineBone.add(chestMesh);

  // ============================================================================
  // 2B. BESPOKE 3D CLOTHING ENSEMBLE ASSEMBLIES (8 DISTINCT ERA GARMENTS)
  // ============================================================================
  const clothingEnsembleGroup = new THREE.Group();
  clothingEnsembleGroup.name = `clothingEnsemble_${resolvedClothingStyle}`;
  clothingEnsembleGroup.position.set(0, 0, 0.022);
  thoracicSpineBone.add(clothingEnsembleGroup);

  // Helper for contoured body-hugging lapel strips (replaces the old flat yellow BoxGeometry blocks)
  const addContouredNotchedLapels = (lapelMat: THREE.Material, width = 0.036, flareX = 0.048) => {
    for (const side of [-1, 1] as const) {
      const lapelStrip = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.55, width * 0.32, 0.185, 14),
        lapelMat
      );
      lapelStrip.scale.set(1.0, 1.0, 0.28);
      lapelStrip.position.set(side * flareX, 0.124, 0.122);
      lapelStrip.rotation.z = side * 0.24;
      lapelStrip.rotation.x = -0.11;
      lapelStrip.castShadow = true;
      clothingEnsembleGroup.add(lapelStrip);
    }
  };

  // Helper for V-neck dress shirt plastron + knotted silk tie
  const addDressShirtAndSilkTie = (withTieBar = false) => {
    const shirtPlastron = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.022, 0.175, 16),
      shirtLinenMat
    );
    shirtPlastron.scale.set(1.05, 1.0, 0.34);
    shirtPlastron.position.set(0, 0.136, 0.114);
    clothingEnsembleGroup.add(shirtPlastron);

    // Crisp turn-down shirt collar points
    for (const side of [-1, 1] as const) {
      const collarWing = new THREE.Mesh(
        new THREE.BoxGeometry(0.034, 0.024, 0.012),
        shirtLinenMat
      );
      collarWing.position.set(side * 0.024, 0.206, 0.106);
      collarWing.rotation.z = side * -0.35;
      collarWing.rotation.y = side * 0.28;
      clothingEnsembleGroup.add(collarWing);
    }

    // Silk tie knot + tapered blade
    const tieKnot = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), silkTieMat);
    tieKnot.scale.set(1.1, 0.95, 0.65);
    tieKnot.position.set(0, 0.194, 0.118);

    const tieBlade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.017, 0.132, 12),
      silkTieMat
    );
    tieBlade.scale.set(1.0, 1.0, 0.28);
    tieBlade.position.set(0, 0.126, 0.124);
    tieBlade.rotation.x = -0.06;
    clothingEnsembleGroup.add(tieKnot, tieBlade);

    if (withTieBar) {
      const tieBar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0045, 0.008), brassMat);
      tieBar.position.set(0, 0.142, 0.129);
      clothingEnsembleGroup.add(tieBar);
    }
  };

  // Wrap-around sculpted garment collar at base of neck
  const collarRingMat =
    resolvedClothingStyle === 'ribbed_turtleneck_blazer'
      ? innerLayerMat
      : resolvedClothingStyle === 'rolled_sleeve_waistcoat'
      ? shirtLinenMat
      : lapelTrimMat;
  const coatCollarGeom = new THREE.TorusGeometry(
    0.072 * anatomy.neckSlenderRatio,
    resolvedClothingStyle === 'noir_trench_coat' ? 0.019 : 0.015,
    12,
    24,
    Math.PI * 1.42
  );
  const coatCollar = new THREE.Mesh(coatCollarGeom, collarRingMat);
  coatCollar.rotation.x = Math.PI / 2 + 0.16;
  coatCollar.rotation.z = Math.PI * 0.79;
  coatCollar.position.set(0, 0.214, -0.004);
  clothingEnsembleGroup.add(coatCollar);

  if (resolvedClothingStyle === 'noir_trench_coat') {
    addDressShirtAndSilkTie(false);
    addContouredNotchedLapels(lapelTrimMat, 0.044, 0.054);

    // Double-breasted storm flaps on upper chest
    for (const side of [-1, 1] as const) {
      const stormFlap = new THREE.Mesh(
        new THREE.SphereGeometry(0.064, 16, 12),
        lapelTrimMat
      );
      stormFlap.scale.set(1.15, 0.92, 0.22);
      stormFlap.position.set(side * 0.062, 0.146, 0.118);
      stormFlap.rotation.z = side * 0.15;
      clothingEnsembleGroup.add(stormFlap);

      // Shoulder epaulets + brass button
      const epaulet = new THREE.Mesh(
        new THREE.BoxGeometry(0.072, 0.01, 0.028),
        lapelTrimMat
      );
      epaulet.position.set(side * 0.132 * anatomy.shoulderBreadthRatio, 0.204, 0.0);
      epaulet.rotation.z = side * -0.22;
      const epBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 10), brassMat);
      epBtn.position.set(side * 0.105 * anatomy.shoulderBreadthRatio, 0.211, 0.0);
      clothingEnsembleGroup.add(epaulet, epBtn);
    }

    // Double-breasted 2x3 brass buttons
    for (let row = 0; row < 3; row++) {
      for (const side of [-1, 1] as const) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12), brassMat);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(side * 0.036, 0.082 - row * 0.044, 0.128 - row * 0.003);
        clothingEnsembleGroup.add(btn);
      }
    }
  } else if (resolvedClothingStyle === 'tailored_three_piece') {
    addDressShirtAndSilkTie(true);
    addContouredNotchedLapels(lapelTrimMat, 0.038, 0.052);

    // Contrasting bespoke waistcoat visible in the V-opening
    const waistcoatFront = new THREE.Mesh(
      new THREE.CylinderGeometry(0.074, 0.058, 0.165, 18),
      innerLayerMat
    );
    waistcoatFront.scale.set(1.06, 1.0, 0.38);
    waistcoatFront.position.set(0, 0.078, 0.108);
    clothingEnsembleGroup.add(waistcoatFront);

    // Silk pocket square in left breast welt pocket
    const pocketWelt = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.008, 0.008), lapelTrimMat);
    pocketWelt.position.set(-0.074, 0.138, 0.118);
    pocketWelt.rotation.y = -0.28;
    const pocketSquare = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.024, 4), silkTieMat);
    pocketSquare.position.set(-0.074, 0.148, 0.119);
    pocketSquare.rotation.z = 0.18;
    clothingEnsembleGroup.add(pocketWelt, pocketSquare);

    for (let bIdx = 0; bIdx < 4; bIdx++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 10), brassMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.095 - bIdx * 0.032, 0.128);
      clothingEnsembleGroup.add(btn);
    }
  } else if (resolvedClothingStyle === 'bellhop_brass_tunic') {
    // High-collar Mandarin standing collar with gold braid trim
    const mandarinCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.068 * anatomy.neckSlenderRatio,
        0.074 * anatomy.neckSlenderRatio,
        0.036,
        24
      ),
      accentMat
    );
    mandarinCollar.position.set(0, 0.222, 0.002);
    clothingEnsembleGroup.add(mandarinCollar);

    // Angled double-row of 5 brass livery buttons + horizontal gold braid piping across chest
    for (let row = 0; row < 5; row++) {
      const yPos = 0.175 - row * 0.038;
      const spreadX = 0.064 - row * 0.0065;
      const zPos = 0.124 - Math.abs(row - 2) * 0.003;

      const braidCord = new THREE.Mesh(
        new THREE.BoxGeometry(spreadX * 2, 0.0055, 0.008),
        accentMat
      );
      braidCord.position.set(0, yPos, zPos);
      clothingEnsembleGroup.add(braidCord);

      for (const side of [-1, 1] as const) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 10), brassMat);
        btn.position.set(side * spreadX, yPos, zPos + 0.004);
        clothingEnsembleGroup.add(btn);
      }
    }

    // Gold braided shoulder boards
    for (const side of [-1, 1] as const) {
      const shoulderBraid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.072, 12),
        accentMat
      );
      shoulderBraid.rotation.z = Math.PI / 2 + side * -0.22;
      shoulderBraid.position.set(side * 0.138 * anatomy.shoulderBreadthRatio, 0.204, 0);
      clothingEnsembleGroup.add(shoulderBraid);
    }
  } else if (resolvedClothingStyle === 'ribbed_turtleneck_blazer') {
    // High ribbed turtleneck collar + chest panel under open tweed scholar blazer
    const turtleneckCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.064 * anatomy.neckSlenderRatio,
        0.072 * anatomy.neckSlenderRatio,
        0.056,
        24
      ),
      innerLayerMat
    );
    turtleneckCollar.position.set(0, 0.226, 0.002);

    const sweaterChest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.052, 0.205, 18),
      innerLayerMat
    );
    sweaterChest.scale.set(1.08, 1.0, 0.42);
    sweaterChest.position.set(0, 0.112, 0.106);
    clothingEnsembleGroup.add(turtleneckCollar, sweaterChest);

    addContouredNotchedLapels(lapelTrimMat, 0.038, 0.056);

    // Scholar breast pocket + brass fountain pen clip
    const penClip = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.028, 0.006), brassMat);
    penClip.position.set(-0.076, 0.142, 0.121);
    clothingEnsembleGroup.add(penClip);
  } else if (resolvedClothingStyle === 'velvet_evening_ensemble') {
    addDressShirtAndSilkTie(false);
    // Plush curved shawl lapels
    addContouredNotchedLapels(lapelTrimMat, 0.048, 0.048);

    // Ornate gilt & cabochon evening brooch at lapel crossover
    const broochFrame = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 12), brassMat);
    broochFrame.scale.set(1.15, 1.35, 0.45);
    broochFrame.position.set(-0.042, 0.158, 0.128);
    const broochGem = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 10), silkTieMat);
    broochGem.scale.set(1.0, 1.2, 0.5);
    broochGem.position.set(-0.042, 0.158, 0.133);
    clothingEnsembleGroup.add(broochFrame, broochGem);
  } else if (resolvedClothingStyle === 'knitted_cardigan_shawl') {
    // High pleated parlor blouse front + cameo brooch at throat
    const blouseFront = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.038, 0.165, 16),
      shirtLinenMat
    );
    blouseFront.scale.set(1.08, 1.0, 0.35);
    blouseFront.position.set(0, 0.138, 0.112);

    const cameoRim = new THREE.Mesh(new THREE.SphereGeometry(0.015, 14, 12), brassMat);
    cameoRim.scale.set(1.1, 1.35, 0.42);
    cameoRim.position.set(0, 0.194, 0.118);
    clothingEnsembleGroup.add(blouseFront, cameoRim);

    // Thick rolled cable-knit shawl collar lapels
    addContouredNotchedLapels(shawlMat, 0.052, 0.05);

    // 4 horn cardigan buttons
    for (let bIdx = 0; bIdx < 4; bIdx++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12), suedePatchMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.088 - bIdx * 0.036, 0.128);
      clothingEnsembleGroup.add(btn);
    }
  } else if (resolvedClothingStyle === 'rolled_sleeve_waistcoat') {
    addDressShirtAndSilkTie(true);

    // Crisp linen shirt shoulders peaking out at upper deltoid/clavicle above the tailored waistcoat
    for (const side of [-1, 1] as const) {
      const shirtYoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.058, 16, 12),
        shirtLinenMat
      );
      shirtYoke.scale.set(1.15, 0.65, 0.92);
      shirtYoke.position.set(side * 0.132 * anatomy.shoulderBreadthRatio, 0.192, 0);
      clothingEnsembleGroup.add(shirtYoke);
    }

    // 5 waistcoat buttons + draped brass pocket-watch chain across lower waistcoat
    for (let bIdx = 0; bIdx < 5; bIdx++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 10), brassMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.105 - bIdx * 0.028, 0.126);
      clothingEnsembleGroup.add(btn);
    }

    const watchChain = new THREE.Mesh(
      new THREE.TorusGeometry(0.044, 0.0028, 8, 20, Math.PI * 0.85),
      brassMat
    );
    watchChain.position.set(0.038, 0.052, 0.122);
    watchChain.rotation.z = Math.PI * 1.08;
    clothingEnsembleGroup.add(watchChain);
  } else if (resolvedClothingStyle === 'boiler_utility_jacket') {
    // Work undershirt + riveted chest patch pockets
    const workShirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.036, 0.145, 14),
      innerLayerMat
    );
    workShirt.scale.set(1.06, 1.0, 0.34);
    workShirt.position.set(0, 0.148, 0.112);
    clothingEnsembleGroup.add(workShirt);

    for (const side of [-1, 1] as const) {
      const patchPocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.046, 0.052, 0.012),
        lapelTrimMat
      );
      patchPocket.position.set(side * 0.068, 0.125, 0.118);
      patchPocket.rotation.y = side * 0.22;

      const pocketRivet = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 8), brassMat);
      pocketRivet.position.set(side * 0.068, 0.142, 0.125);
      clothingEnsembleGroup.add(patchPocket, pocketRivet);
    }

    for (let bIdx = 0; bIdx < 4; bIdx++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 10), brassMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.112 - bIdx * 0.038, 0.127);
      clothingEnsembleGroup.add(btn);
    }
  }

  // Subtle kyphosis / draped shawl curvature for elderly / bent-spine characters
  const curvatureDeg = appearance.spineCurvature !== undefined ? appearance.spineCurvature : (isElderly ? 38 : 0);
  if (curvatureDeg > 8 || isElderly) {
    const shawlGeom = new THREE.CylinderGeometry(0.195, 0.228, 0.175, 28);
    shawlGeom.scale(1.08, 1.0, 0.84);
    const shawlMesh = new THREE.Mesh(shawlGeom, shawlMat);
    shawlMesh.position.set(0, 0.135, -0.012);
    shawlMesh.castShadow = true;
    thoracicSpineBone.add(shawlMesh);
  }

  // C4 Cervical Neck Joint with Smooth Trapezius Base, Sternocleidomastoid Taper & Submental Integration
  const neckBone = new THREE.Group();
  neckBone.name = 'neckBone';
  neckBone.position.set(0, 0.212, 0);
  const neckPoints = [
    new THREE.Vector2(0.072 * anatomy.neckSlenderRatio, -0.022),
    new THREE.Vector2(0.055 * anatomy.neckSlenderRatio, 0.032),
    new THREE.Vector2(0.053 * anatomy.neckSlenderRatio, 0.078),
    new THREE.Vector2(0.061 * anatomy.neckSlenderRatio, 0.125)
  ];
  const neckGeom = new THREE.LatheGeometry(neckPoints, 28);
  neckGeom.scale(0.95, 1.0, 0.94);
  const neckMesh = new THREE.Mesh(neckGeom, skinMat);
  neckBone.add(neckMesh);

  // ============================================================================
  // 3. SMOOTH, CONTINUOUS SCULPTED & RIGGED HUMAN HEAD & FACIAL ANATOMY
  // ============================================================================
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, 0.078, 0);
  const hs = appearance.headScale || 1.0;
  headGroup.scale.set(hs, hs, hs);

  // 3A. Single Continuous 64x48 Vertex-Sculpted Human Craniofacial Surface
  // Organically integrates the cranium, forehead, supraorbital brow arch, recessed orbital eye sockets,
  // nasal bridge & dorsum, zygomatic cheekbones, jawline, and chin into one seamless mesh.
  const faceSkullGeom = buildSmoothSculptedHeadGeometry(anatomy, 64, 48);
  const faceSkullMesh = new THREE.Mesh(faceSkullGeom, skinMat);
  faceSkullMesh.name = 'smoothSculptedHeadMesh';
  faceSkullMesh.castShadow = true;
  faceSkullMesh.receiveShadow = true;
  headGroup.add(faceSkullMesh);

  // Compact, Sub-Surface Flush Zygomatic Cheek & Sub-Malar Rig Nodes
  // Nested inside the continuous sculpted cheek contour so they never protrude out of the silhouette as separate spheres
  const cheekAppleGeom = new THREE.SphereGeometry(0.015, 16, 12);
  cheekAppleGeom.scale(1.05, 0.82, 0.55);
  const cheekAppleL = new THREE.Mesh(cheekAppleGeom, skinMat);
  cheekAppleL.name = 'cheekAppleL';
  cheekAppleL.position.set(-0.036 * anatomy.zygomaticWidthRatio, 0.106, 0.074);
  const cheekAppleR = new THREE.Mesh(cheekAppleGeom, skinMat);
  cheekAppleR.name = 'cheekAppleR';
  cheekAppleR.position.set(0.036 * anatomy.zygomaticWidthRatio, 0.106, 0.074);
  headGroup.add(cheekAppleL, cheekAppleR);

  const hollowGeom = new THREE.SphereGeometry(0.010, 12, 10);
  hollowGeom.scale(0.85, 0.95, 0.30);
  const cheekHollowL = new THREE.Mesh(hollowGeom, skinMat);
  cheekHollowL.name = 'cheekHollowL';
  cheekHollowL.position.set(-0.036 * anatomy.zygomaticWidthRatio, 0.082, 0.062);
  const cheekHollowR = new THREE.Mesh(hollowGeom, skinMat);
  cheekHollowR.name = 'cheekHollowR';
  cheekHollowR.position.set(0.036 * anatomy.zygomaticWidthRatio, 0.082, 0.062);
  headGroup.add(cheekHollowL, cheekHollowR);

  // 3B. Smooth Blended Nasal Apex, Columella & Articulated Alar Nostril Wings
  const noseGroup = new THREE.Group();
  noseGroup.name = 'noseGroup';

  // Softly blended nasal tip cushion (merges seamlessly into the vertex-sculpted nasal bridge)
  const noseDepthScale = anatomy.noseTipProjection * anatomy.craniumDepthRatio;
  const noseTipGeom = new THREE.SphereGeometry(0.0114 * anatomy.noseTipProjection, 24, 20);
  noseTipGeom.scale(1.02, 0.92, 1.06);
  const noseTip = new THREE.Mesh(noseTipGeom, skinMat);
  noseTip.position.set(0, 0.104, 0.116 * noseDepthScale);

  // Smooth nasal columella septum bridge
  const columellaGeom = new THREE.CapsuleGeometry(0.0040, 0.0085, 8, 12);
  const columella = new THREE.Mesh(columellaGeom, skinMat);
  columella.rotation.x = Math.PI / 2 - 0.22;
  columella.position.set(0, 0.096, 0.109 * noseDepthScale);

  // Rigged Left & Right Alar Nostril Wings + Soft Recessed Nostril Apertures
  const nostrilWingGeom = new THREE.SphereGeometry(0.0080, 20, 16);
  nostrilWingGeom.scale(1.02, 0.82, 1.05);
  const nostrilApertureMat = new THREE.MeshBasicMaterial({ color: 0x3b1f1a });
  const nostrilHoleGeom = new THREE.SphereGeometry(0.0030, 12, 10);
  nostrilHoleGeom.scale(0.76, 0.32, 0.95);

  const nostrilWingL = new THREE.Group();
  nostrilWingL.name = 'nostrilWingL';
  nostrilWingL.position.set(-0.0110, 0.099, 0.107 * noseDepthScale);
  const wingMeshL = new THREE.Mesh(nostrilWingGeom, skinMat);
  const holeMeshL = new THREE.Mesh(nostrilHoleGeom, nostrilApertureMat);
  holeMeshL.position.set(0.0016, -0.0042, 0.0006);
  nostrilWingL.add(wingMeshL, holeMeshL);

  const nostrilWingR = new THREE.Group();
  nostrilWingR.name = 'nostrilWingR';
  nostrilWingR.position.set(0.0110, 0.099, 0.107 * noseDepthScale);
  const wingMeshR = new THREE.Mesh(nostrilWingGeom, skinMat);
  const holeMeshR = new THREE.Mesh(nostrilHoleGeom, nostrilApertureMat);
  holeMeshR.position.set(-0.0016, -0.0042, 0.0006);
  nostrilWingR.add(wingMeshR, holeMeshR);

  noseGroup.add(noseTip, columella, nostrilWingL, nostrilWingR);
  headGroup.add(noseGroup);

  // 3C. Smooth Sculpted Anatomical Ears (Outer Helix Rim, Concha Bowl & Soft Earlobe)
  const buildSculptedEar = (side: -1 | 1): THREE.Group => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.098 * anatomy.craniumWidthRatio, 0.128, -0.006);
    earGroup.rotation.y = side * -0.22;
    earGroup.rotation.z = side * -0.05;
    earGroup.scale.setScalar(anatomy.earHelixScale);

    const conchaGeom = new THREE.SphereGeometry(0.022, 18, 14);
    conchaGeom.scale(0.34, 1.15, 0.72);
    const conchaMesh = new THREE.Mesh(conchaGeom, contourSkinMat);

    const helixGeom = new THREE.TorusGeometry(0.0185, 0.0048, 14, 24, Math.PI * 1.35);
    helixGeom.scale(0.80, 1.22, 0.72);
    const helixMesh = new THREE.Mesh(helixGeom, skinMat);
    helixMesh.rotation.y = Math.PI / 2;
    helixMesh.rotation.x = side === 1 ? -0.35 : Math.PI + 0.35;
    helixMesh.position.set(side * 0.0022, 0.0035, -0.002);

    const lobeGeom = new THREE.SphereGeometry(0.0085, 14, 12);
    lobeGeom.scale(0.60, 1.12, 0.82);
    const lobeMesh = new THREE.Mesh(lobeGeom, skinMat);
    lobeMesh.position.set(side * 0.0018, -0.020, 0.0025);

    earGroup.add(conchaMesh, helixMesh, lobeMesh);
    return earGroup;
  };
  headGroup.add(buildSculptedEar(-1), buildSculptedEar(1));

  // 3D. Layered Volumetric Hairstyles (tilted backward so the front hairline frames the top of the forehead and never covers the eyebrows/eyes)
  const hairStyle = resolveCharacterHairStyle(appearance);
  const hairStyleGroup = new THREE.Group();
  hairStyleGroup.name = `hairStyle_${hairStyle}`;
  headGroup.add(hairStyleGroup);

  const isCroppedBuzz = hairStyle === 'cropped_buzz_fade';
  const hairCapGeom = new THREE.SphereGeometry(
    isCroppedBuzz ? 0.104 : 0.108,
    32,
    24,
    0,
    Math.PI * 2,
    0,
    Math.PI * (isCroppedBuzz ? 0.49 : 0.54)
  );
  hairCapGeom.scale(
    0.99 * anatomy.craniumWidthRatio,
    (isCroppedBuzz ? 1.07 : 1.12) * anatomy.craniumHeightRatio,
    1.04 * anatomy.craniumDepthRatio
  );
  const hairCap = new THREE.Mesh(hairCapGeom, hairMat);
  hairCap.position.set(0, 0.154, -0.012);
  hairCap.rotation.x = -0.68; // Tilts cap backward so front rim sits high at the forehead hairline (y ~ 0.218m) while back covers the occiput
  hairStyleGroup.add(hairCap);

  // Smooth Nape & Temple Sideburn Hair Volumes (positioned behind the temples at z = -0.002 so the face stays open)
  const napeHairGeom = new THREE.SphereGeometry(isCroppedBuzz ? 0.075 : 0.082, 20, 16);
  napeHairGeom.scale(1.04, 0.90, 0.82);
  const napeHair = new THREE.Mesh(napeHairGeom, hairMat);
  napeHair.position.set(0, 0.118, -0.052);
  const sideburnGeom = new THREE.SphereGeometry(isCroppedBuzz ? 0.017 : 0.022, 14, 12);
  sideburnGeom.scale(0.34, 1.32, 0.76);
  const sideburnL = new THREE.Mesh(sideburnGeom, hairMat);
  sideburnL.position.set(-0.095 * anatomy.craniumWidthRatio, 0.148, -0.002);
  const sideburnR = new THREE.Mesh(sideburnGeom, hairMat);
  sideburnR.position.set(0.095 * anatomy.craniumWidthRatio, 0.148, -0.002);
  hairStyleGroup.add(napeHair, sideburnL, sideburnR);

  if (hairStyle === 'silver_bun') {
    const bunGeom = new THREE.SphereGeometry(0.068, 20, 18);
    const bunMesh = new THREE.Mesh(bunGeom, hairMat);
    bunMesh.position.set(0, 0.212, -0.114);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 10), accentMat);
    pin.position.set(0, 0.216, -0.116);
    pin.rotation.z = 0.55;
    const templeSweepL = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 14), hairMat);
    templeSweepL.scale.set(0.42, 0.85, 1.12);
    templeSweepL.position.set(-0.084, 0.194, 0.018);
    templeSweepL.rotation.z = -0.25;
    const templeSweepR = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 14), hairMat);
    templeSweepR.scale.set(0.42, 0.85, 1.12);
    templeSweepR.position.set(0.084, 0.194, 0.018);
    templeSweepR.rotation.z = 0.25;
    hairStyleGroup.add(bunMesh, pin, templeSweepL, templeSweepR);
  } else if (hairStyle === 'braided_crown_chignon') {
    // Woven crown braid arc + low nape chignon with brass pin
    const lowChignon = new THREE.Mesh(new THREE.SphereGeometry(0.062, 20, 18), hairMat);
    lowChignon.scale.set(1.18, 0.82, 0.94);
    lowChignon.position.set(0, 0.122, -0.112);
    const crownBraid = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.018, 12, 28, Math.PI * 1.15), hairMat);
    crownBraid.position.set(0, 0.218, -0.008);
    crownBraid.rotation.set(Math.PI * 0.42, 0, -Math.PI * 0.08);
    const brassPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.15, 10), accentMat);
    brassPin.position.set(0, 0.126, -0.116);
    brassPin.rotation.z = -0.48;
    hairStyleGroup.add(lowChignon, crownBraid, brassPin);
  } else if (hairStyle === 'permed_silver' || hairStyle === 'messy_curls') {
    const isBouffant = hairStyle === 'permed_silver';
    const curlPositions = [
      [-0.064, 0.238, 0.034, isBouffant ? 0.050 : 0.044],
      [-0.022, 0.252, 0.048, isBouffant ? 0.054 : 0.048],
      [0.022, 0.254, 0.046, isBouffant ? 0.056 : 0.050],
      [0.064, 0.238, 0.032, isBouffant ? 0.050 : 0.044],
      [-0.050, 0.252, -0.014, 0.050],
      [0.0, 0.264, -0.012, isBouffant ? 0.060 : 0.054],
      [0.050, 0.252, -0.014, 0.050],
      [-0.078, 0.208, 0.022, 0.038],
      [0.078, 0.208, 0.022, 0.038]
    ];
    for (const [cx, cy, cz, cr] of curlPositions) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(cr, 16, 14), hairMat);
      curl.position.set(cx, cy, cz);
      hairStyleGroup.add(curl);
    }
  } else if (hairStyle === 'bob_cut') {
    const bobSideGeom = new THREE.SphereGeometry(0.052, 18, 16);
    bobSideGeom.scale(0.38, 1.35, 1.05);
    const bobL = new THREE.Mesh(bobSideGeom, hairMat);
    bobL.position.set(-0.096, 0.132, -0.008);
    bobL.rotation.z = 0.10;
    const bobR = new THREE.Mesh(bobSideGeom, hairMat);
    bobR.position.set(0.096, 0.132, -0.008);
    bobR.rotation.z = -0.10;
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.056, 18, 14), hairMat);
    fringe.scale.set(1.38, 0.36, 0.56);
    fringe.position.set(0, 0.224, 0.072);
    hairStyleGroup.add(bobL, bobR, fringe);
  } else if (hairStyle === 'feathered_shag_70s') {
    // 1978 center-parted feathered curtain wings + shoulder-grazing shag layers
    const wingGeom = new THREE.SphereGeometry(0.054, 18, 16);
    wingGeom.scale(0.46, 1.28, 1.12);
    const wingL = new THREE.Mesh(wingGeom, hairMat);
    wingL.position.set(-0.098, 0.156, 0.014);
    wingL.rotation.set(-0.18, 0.22, 0.24);
    const wingR = new THREE.Mesh(wingGeom, hairMat);
    wingR.position.set(0.098, 0.156, 0.014);
    wingR.rotation.set(-0.18, -0.22, -0.24);
    const curtainL = new THREE.Mesh(new THREE.SphereGeometry(0.044, 16, 14), hairMat);
    curtainL.scale.set(1.05, 0.44, 0.72);
    curtainL.position.set(-0.038, 0.228, 0.068);
    curtainL.rotation.z = 0.32;
    const curtainR = new THREE.Mesh(new THREE.SphereGeometry(0.044, 16, 14), hairMat);
    curtainR.scale.set(1.05, 0.44, 0.72);
    curtainR.position.set(0.038, 0.228, 0.068);
    curtainR.rotation.z = -0.32;
    const backShag = new THREE.Mesh(new THREE.SphereGeometry(0.078, 18, 16), hairMat);
    backShag.scale.set(1.16, 1.25, 0.74);
    backShag.position.set(0, 0.078, -0.068);
    hairStyleGroup.add(wingL, wingR, curtainL, curtainR, backShag);
  } else if (hairStyle === 'wavy_shoulder_cascade') {
    // Flowing S-wave glamour locks cascading down both sides of the neck/collarbone
    const cascadeGeom = new THREE.SphereGeometry(0.056, 18, 16);
    cascadeGeom.scale(0.48, 1.75, 0.92);
    const cascadeL = new THREE.Mesh(cascadeGeom, hairMat);
    cascadeL.position.set(-0.098, 0.088, 0.008);
    cascadeL.rotation.z = 0.08;
    const cascadeR = new THREE.Mesh(cascadeGeom, hairMat);
    cascadeR.position.set(0.098, 0.088, 0.008);
    cascadeR.rotation.z = -0.08;
    const glamourCrest = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 16), hairMat);
    glamourCrest.scale.set(1.28, 0.52, 0.84);
    glamourCrest.position.set(0.024, 0.236, 0.058);
    glamourCrest.rotation.z = -0.18;
    const backDrape = new THREE.Mesh(new THREE.SphereGeometry(0.086, 18, 16), hairMat);
    backDrape.scale.set(1.14, 1.48, 0.76);
    backDrape.position.set(0, 0.064, -0.066);
    hairStyleGroup.add(cascadeL, cascadeR, glamourCrest, backDrape);
  } else if (hairStyle === 'slicked_side_part') {
    // Sharp razor-parted comb-over sweep
    const combSweep = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 16), hairMat);
    combSweep.scale.set(1.42, 0.36, 0.94);
    combSweep.position.set(0.016, 0.228, 0.044);
    combSweep.rotation.z = -0.16;
    const partLineAccent = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.11), skinMat);
    partLineAccent.position.set(-0.046, 0.236, 0.024);
    partLineAccent.rotation.x = -0.25;
    hairStyleGroup.add(combSweep, partLineAccent);
  } else if (hairStyle === 'cropped_buzz_fade') {
    // Close-cropped hairline contour band
    const fadeContour = new THREE.Mesh(new THREE.SphereGeometry(0.048, 18, 14), hairMat);
    fadeContour.scale.set(1.38, 0.24, 0.62);
    fadeContour.position.set(0, 0.224, 0.056);
    hairStyleGroup.add(fadeContour);
  } else if (hairStyle === 'bowler_hat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.018, 28), bootMat);
    brim.position.set(0, 0.238, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 18), bootMat);
    dome.position.set(0, 0.285, 0);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.024, 24), accentMat);
    ribbon.position.set(0, 0.252, 0);
    hairStyleGroup.add(brim, dome, ribbon);
  } else if (hairStyle === 'noir_fedora') {
    // Wide-brimmed tilted detective fedora with pinched crown & silk band
    const fedoraBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.234, 0.014, 32), bootMat);
    fedoraBrim.scale.set(0.94, 1.0, 1.12);
    fedoraBrim.position.set(0, 0.236, 0.008);
    fedoraBrim.rotation.set(0.06, 0, -0.05);
    const fedoraCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.122, 0.095, 24), bootMat);
    fedoraCrown.scale.set(0.92, 1.0, 1.14);
    fedoraCrown.position.set(0, 0.284, 0.004);
    fedoraCrown.rotation.set(0.06, 0, -0.05);
    const fedoraBand = new THREE.Mesh(new THREE.CylinderGeometry(0.120, 0.123, 0.022, 24), accentMat);
    fedoraBand.scale.set(0.92, 1.0, 1.14);
    fedoraBand.position.set(0, 0.248, 0.006);
    fedoraBand.rotation.set(0.06, 0, -0.05);
    hairStyleGroup.add(fedoraBrim, fedoraCrown, fedoraBand);
  } else {
    // Swept Noir Pompadour with smooth sculpted crest above the forehead hairline
    const pompMain = new THREE.Mesh(new THREE.SphereGeometry(0.062, 22, 18), hairMat);
    pompMain.scale.set(1.36, 0.52, 0.86);
    pompMain.position.set(0.010, 0.236, 0.062);
    pompMain.rotation.z = -0.12;
    pompMain.rotation.x = -0.16;
    const pompWave = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 16), hairMat);
    pompWave.scale.set(1.22, 0.48, 0.90);
    pompWave.position.set(-0.036, 0.230, 0.048);
    pompWave.rotation.z = 0.20;
    hairStyleGroup.add(pompMain, pompWave);
  }

  // Spectacles / Wire-Frame Glasses (elderly or scholar/watchmaker)
  const hasGlasses = appearance.hasSpectacles ?? (isElderly || appearance.archetype === 'Occult Archivist');
  if (hasGlasses) {
    const specMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.18 });
    const lensGlassMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.18,
      roughness: 0.08,
      metalness: 0.25,
      depthWrite: false
    });
    const lensL = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0028, 12, 28), specMat);
    lensL.position.set(-0.037 * anatomy.craniumWidthRatio, 0.138, 0.114 * anatomy.craniumDepthRatio);
    const glassL = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), lensGlassMat);
    glassL.position.set(-0.037 * anatomy.craniumWidthRatio, 0.138, 0.115 * anatomy.craniumDepthRatio);

    const lensR = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0028, 12, 28), specMat);
    lensR.position.set(0.037 * anatomy.craniumWidthRatio, 0.138, 0.114 * anatomy.craniumDepthRatio);
    const glassR = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), lensGlassMat);
    glassR.position.set(0.037 * anatomy.craniumWidthRatio, 0.138, 0.115 * anatomy.craniumDepthRatio);

    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.030, 10), specMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.140, 0.114 * anatomy.craniumDepthRatio);
    headGroup.add(lensL, glassL, lensR, glassR, bridge);
  }

  // Soft, Flush Tear-Trough Contours (`underEyeBags`)
  const underEyeBags = new THREE.Group();
  underEyeBags.name = 'underEyeBags';
  const tearTroughGeom = new THREE.TorusGeometry(0.015, 0.0014, 10, 20, Math.PI * 0.70);
  tearTroughGeom.scale(1.12, 0.62, 0.42);
  const bagL = new THREE.Mesh(tearTroughGeom, shadowSkinMat);
  bagL.rotation.z = Math.PI + 0.35;
  bagL.position.set(-0.037 * anatomy.craniumWidthRatio, 0.126, 0.098 * anatomy.craniumDepthRatio);
  const bagR = new THREE.Mesh(tearTroughGeom, shadowSkinMat);
  bagR.rotation.z = Math.PI + 0.35;
  bagR.position.set(0.037 * anatomy.craniumWidthRatio, 0.126, 0.098 * anatomy.craniumDepthRatio);

  underEyeBags.add(bagL, bagR);
  underEyeBags.visible = isElderly || curvatureDeg > 12;
  headGroup.add(underEyeBags);

  // Compute initial Facial Rig Parameters
  const facialRigParams = computeFacialRigParams(
    appearance.facialExpression || 'neutral',
    undefined,
    false,
    0,
    false,
    isElderly
  );

  // 3E. Smooth 4-Zone Articulated Eyebrows (Softly Contoured Capsule Medial Brow & Tapered Lateral Arch)
  const browArchGeom = new THREE.CapsuleGeometry(0.0040, 0.017, 12, 16);
  browArchGeom.rotateZ(Math.PI / 2);
  browArchGeom.scale(1.0, 0.85, 0.88);
  const browTailGeom = new THREE.CapsuleGeometry(0.0033, 0.015, 12, 16);
  browTailGeom.rotateZ(Math.PI / 2);
  browTailGeom.scale(1.0, 0.80, 0.84);

  const browPivotL = new THREE.Group();
  browPivotL.name = 'browPivotL';
  browPivotL.position.set(
    -0.037 * anatomy.craniumWidthRatio,
    0.161 + facialRigParams.browHeight * 0.16,
    0.105 * anatomy.craniumDepthRatio
  );
  const browInnerL = new THREE.Mesh(browArchGeom, hairMat);
  browInnerL.name = 'browInnerL';
  browInnerL.position.set(0.0085, facialRigParams.browInnerLiftL * 0.18, 0.0025);
  browInnerL.rotation.z = -0.05;
  browInnerL.rotation.y = -0.14;
  const browOuterL = new THREE.Mesh(browTailGeom, hairMat);
  browOuterL.name = 'browOuterL';
  browOuterL.position.set(-0.0105, -0.0010 + facialRigParams.browOuterLiftL * 0.18, -0.0020);
  browOuterL.rotation.z = 0.16;
  browOuterL.rotation.y = -0.26;
  browPivotL.add(browInnerL, browOuterL);
  browPivotL.rotation.z = facialRigParams.browRollL * 0.45;

  const browPivotR = new THREE.Group();
  browPivotR.name = 'browPivotR';
  browPivotR.position.set(
    0.037 * anatomy.craniumWidthRatio,
    0.161 + (facialRigParams.browHeight + facialRigParams.browAsymmetry * 0.04) * 0.16,
    0.105 * anatomy.craniumDepthRatio
  );
  const browInnerR = new THREE.Mesh(browArchGeom, hairMat);
  browInnerR.name = 'browInnerR';
  browInnerR.position.set(-0.0085, facialRigParams.browInnerLiftR * 0.18, 0.0025);
  browInnerR.rotation.z = 0.05;
  browInnerR.rotation.y = 0.14;
  const browOuterR = new THREE.Mesh(browTailGeom, hairMat);
  browOuterR.name = 'browOuterR';
  browOuterR.position.set(0.0105, -0.0010 + facialRigParams.browOuterLiftR * 0.18, -0.0020);
  browOuterR.rotation.z = -0.16;
  browOuterR.rotation.y = 0.26;
  browPivotR.add(browInnerR, browOuterR);
  browPivotR.rotation.z = facialRigParams.browRollR * 0.45;

  headGroup.add(browPivotL, browPivotR);

  // 3F. Deep Lifelike Eyes: Wet-Cornea Sclera, High-Res Fibrous Iris, Dilating Pupil, Corneal Specular Catchlights & Smooth Skin-Matched Eyelids
  const scleraMat = new THREE.MeshPhysicalMaterial({
    color: 0xfcfaf7,
    roughness: 0.08,
    metalness: 0.01,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    sheen: 0.15,
    sheenColor: new THREE.Color(0xfecdd3)
  });
  const irisTex = getProceduralIrisTexture(appearance.eyeStyle);
  const irisColor =
    appearance.eyeStyle === 'hollow_glow'
      ? 0x38bdf8
      : appearance.eyeStyle === 'wide_amber'
      ? 0xd97706
      : 0x52525b;
  const irisMat = new THREE.MeshPhysicalMaterial({
    color: irisTex ? 0xffffff : irisColor,
    map: irisTex,
    emissive: appearance.eyeStyle === 'hollow_glow' ? 0x0284c7 : 0x000000,
    emissiveIntensity: appearance.eyeStyle === 'hollow_glow' ? 0.55 : 0.0,
    roughness: 0.10,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050507 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const caruncleMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97772,
    roughness: 0.28,
    clearcoat: 0.65
  });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.55 });

  // Delicate, High-Segment Curved Upper & Lower Eyelid Folds (wrap top/bottom sclera rims cleanly without covering the iris)
  const upperLidGeom = new THREE.SphereGeometry(0.0168, 24, 16, 0, Math.PI, 0, Math.PI * 0.34);
  upperLidGeom.scale(1.14, 0.96, 0.82);
  const lowerLidGeom = new THREE.SphereGeometry(0.0164, 24, 16, 0, Math.PI, Math.PI * 0.76, Math.PI * 0.24);
  lowerLidGeom.scale(1.12, 0.94, 0.80);
  const eyelashGeom = new THREE.TorusGeometry(0.0165, 0.0012, 8, 24, Math.PI * 0.72);
  eyelashGeom.scale(1.14, 0.68, 0.78);

  const buildLifelikeEye = (
    side: -1 | 1,
    eyeName: string,
    irisName: string,
    pupilName: string,
    upperLidName: string,
    lowerLidName: string,
    lashName: string,
    glintName: string
  ) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.name = eyeName;
    eyeGroup.position.set(
      side * 0.037 * anatomy.craniumWidthRatio,
      0.138,
      0.096 * anatomy.craniumDepthRatio
    );

    // Medial Lacrimal Caruncle (subtle tear-duct corner)
    const caruncle = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 12, 10), caruncleMat);
    caruncle.position.set(side * -0.0148, -0.0006, 0.0082);
    eyeGroup.add(caruncle);

    // Smooth High-Segment Spherical Eyeball Sclera
    const scleraMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0158, 28, 22), scleraMat);
    scleraMesh.scale.set(1.12, 0.98, 0.80);

    // Articulated Iris + Dilating Pupil + Dual Corneal Catchlight Glints
    const clampedGazeX = Math.max(-0.0036, Math.min(0.0036, facialRigParams.eyeGazeX * 0.24));
    const clampedGazeY = Math.max(-0.0022, Math.min(0.0022, facialRigParams.eyeGazeY * 0.24));
    const irisGroup = new THREE.Group();
    irisGroup.name = irisName;
    irisGroup.position.set(clampedGazeX, clampedGazeY, 0.0128);

    const irisMesh = new THREE.Mesh(new THREE.CircleGeometry(0.0082, 28), irisMat);
    const pupilMesh = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 24), pupilMat);
    pupilMesh.name = pupilName;
    pupilMesh.position.set(0, 0, 0.0005);
    pupilMesh.scale.setScalar(facialRigParams.pupilDilation);

    const glintGroup = new THREE.Group();
    glintGroup.name = glintName;
    const primaryGlint = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 14), glintMat);
    primaryGlint.position.set(0.0026, 0.0028, 0.0010);
    const secondaryGlint = new THREE.Mesh(new THREE.CircleGeometry(0.0009, 12), glintMat);
    secondaryGlint.position.set(-0.0024, -0.0022, 0.0010);
    glintGroup.add(primaryGlint, secondaryGlint);

    irisGroup.add(irisMesh, pupilMesh, glintGroup);

    // Smooth Skin-Matched Upper Eyelid & Delicate Eyelash Line
    const upperLid = new THREE.Mesh(upperLidGeom, contourSkinMat);
    upperLid.name = upperLidName;
    upperLid.rotation.x = 0.04;
    upperLid.position.set(0, 0.0025 - facialRigParams.upperLidDroop * 0.25, 0.0012);

    const eyelash = new THREE.Mesh(eyelashGeom, lashMat);
    eyelash.name = lashName;
    eyelash.rotation.z = Math.PI * 0.14;
    eyelash.position.set(0, 0.0056, 0.0108);
    upperLid.add(eyelash);

    // Smooth Skin-Matched Lower Eyelid
    const lowerLid = new THREE.Mesh(lowerLidGeom, skinMat);
    lowerLid.name = lowerLidName;
    lowerLid.rotation.x = -0.10;
    lowerLid.position.set(0, -0.0025 + facialRigParams.lowerLidSquint * 0.0022, 0.0012);

    eyeGroup.add(scleraMesh, irisGroup, upperLid, lowerLid);
    const naturalEyeScaleY =
      Math.max(0.76, Math.min(1.06, 0.72 + facialRigParams.eyeAperture * 0.28)) *
      (1 - facialRigParams.blinkAmount * 0.85);
    eyeGroup.scale.y = Math.max(0.18, naturalEyeScaleY);

    return { eyeGroup, irisGroup, pupilMesh, upperLid, lowerLid, eyelash, glintGroup };
  };

  const leftEyeNodes = buildLifelikeEye(
    -1,
    'eyeL',
    'irisGroupL',
    'pupilMeshL',
    'upperLidL',
    'lowerLidL',
    'eyelashL',
    'corneaGlintL'
  );
  const rightEyeNodes = buildLifelikeEye(
    1,
    'eyeR',
    'irisGroupR',
    'pupilMeshR',
    'upperLidR',
    'lowerLidR',
    'eyelashR',
    'corneaGlintR'
  );

  const eyeL = leftEyeNodes.eyeGroup;
  const eyeR = rightEyeNodes.eyeGroup;
  const irisGroupL = leftEyeNodes.irisGroup;
  const irisGroupR = rightEyeNodes.irisGroup;
  const pupilMeshL = leftEyeNodes.pupilMesh;
  const pupilMeshR = rightEyeNodes.pupilMesh;
  const upperLidL = leftEyeNodes.upperLid;
  const upperLidR = rightEyeNodes.upperLid;
  const lowerLidL = leftEyeNodes.lowerLid;
  const lowerLidR = rightEyeNodes.lowerLid;
  const eyelashL = leftEyeNodes.eyelash;
  const eyelashR = rightEyeNodes.eyelash;
  const corneaGlintL = leftEyeNodes.glintGroup;
  const corneaGlintR = rightEyeNodes.glintGroup;

  headGroup.add(eyeL, eyeR);

  // 3G. Smooth Contoured Upper Lip (Cupid's Bow Vermilion), Oral Cavity, Teeth, Tongue & Continuous Sculpted Mandible (`jawPivot`)
  const upperLipGroup = new THREE.Group();
  upperLipGroup.name = 'upperLipGroup';
  upperLipGroup.position.set(
    0,
    0.071 + facialRigParams.upperLipLift * 0.003,
    0.1035 * anatomy.craniumDepthRatio
  );

  // Smoothly blended Cupid's Bow Upper Vermilion Cushion
  const tubercleGeom = new THREE.SphereGeometry(0.0058 * anatomy.upperLipCupidBowDepth, 20, 16);
  tubercleGeom.scale(1.38, 0.72, 0.88);
  const tubercleMesh = new THREE.Mesh(tubercleGeom, mouthMat);
  tubercleMesh.position.set(0, -0.0004, 0.0012);

  const upperWingGeom = new THREE.CapsuleGeometry(0.0044 * anatomy.upperLipCupidBowDepth, 0.017, 12, 16);
  upperWingGeom.rotateZ(Math.PI / 2);
  upperWingGeom.scale(1.0, 0.78, 0.92);
  const upperLipWingL = new THREE.Mesh(upperWingGeom, mouthMat);
  upperLipWingL.position.set(-0.0094, 0.0002, -0.0006);
  upperLipWingL.rotation.z = 0.09;
  upperLipWingL.rotation.y = -0.14;

  const upperLipWingR = new THREE.Mesh(upperWingGeom, mouthMat);
  upperLipWingR.position.set(0.0094, 0.0002, -0.0006);
  upperLipWingR.rotation.z = -0.09;
  upperLipWingR.rotation.y = 0.14;

  upperLipGroup.add(tubercleMesh, upperLipWingL, upperLipWingR);
  headGroup.add(upperLipGroup);

  // Articulated TMJ Mandible & Continuous Sculpted Lower Face Rig (`jawPivot`)
  const jawPivot = new THREE.Group();
  jawPivot.name = 'jawPivot';
  jawPivot.position.set(0, 0.052 - facialRigParams.jawDrop * 0.35, 0.048 * anatomy.craniumDepthRatio);
  jawPivot.rotation.x = facialRigParams.jawPitchRad * 0.35;

  // Single Continuous 48x32 Sculpted Mandible & Chin Surface (nested smoothly inside the lower jaw contour)
  const mandibleGeom = buildSmoothSculptedMandibleGeometry(anatomy, 48, 32);
  const mandibleMesh = new THREE.Mesh(mandibleGeom, skinMat);
  mandibleMesh.name = 'smoothSculptedMandibleMesh';
  mandibleMesh.castShadow = true;
  mandibleMesh.receiveShadow = true;
  jawPivot.add(mandibleMesh);

  // Smooth Contoured Lower Lip Vermilion Cushion
  const lowerLipGroup = new THREE.Group();
  lowerLipGroup.name = 'lowerLipGroup';
  lowerLipGroup.position.set(
    0,
    0.012 - facialRigParams.lowerLipDepress * 0.003,
    0.0555 * anatomy.craniumDepthRatio
  );

  const lowerLipCenterGeom = new THREE.SphereGeometry(0.0068 * anatomy.lowerLipFullness, 20, 16);
  lowerLipCenterGeom.scale(1.85, 0.68, 0.88);
  const lowerLipCenter = new THREE.Mesh(lowerLipCenterGeom, mouthMat);
  const lowerWingGeom = new THREE.CapsuleGeometry(0.0040 * anatomy.lowerLipFullness, 0.014, 10, 14);
  lowerWingGeom.rotateZ(Math.PI / 2);
  lowerWingGeom.scale(1.0, 0.78, 0.90);
  const lowerWingL = new THREE.Mesh(lowerWingGeom, mouthMat);
  lowerWingL.position.set(-0.0108, 0.0008, -0.0010);
  lowerWingL.rotation.z = -0.11;
  lowerWingL.rotation.y = -0.14;
  const lowerWingR = new THREE.Mesh(lowerWingGeom, mouthMat);
  lowerWingR.position.set(0.0108, 0.0008, -0.0010);
  lowerWingR.rotation.z = 0.11;
  lowerWingR.rotation.y = 0.14;
  lowerLipGroup.add(lowerLipCenter, lowerWingL, lowerWingR);
  jawPivot.add(lowerLipGroup);

  // Natural Dark Rose-Plum Central Lip Parting Line (`mouthMesh` preserved for rig compatibility)
  const mouthSeamGeom = new THREE.CapsuleGeometry(0.0016, 0.032, 10, 14);
  mouthSeamGeom.rotateZ(Math.PI / 2);
  const mouthMesh = new THREE.Mesh(mouthSeamGeom, lipSeamMat);
  mouthMesh.name = 'mouthMesh';
  mouthMesh.position.set(0, 0.0158, 0.0572 * anatomy.craniumDepthRatio);
  mouthMesh.rotation.z = (facialRigParams.mouthCornerAngle + facialRigParams.mouthAsymmetry) * 0.45;
  jawPivot.add(mouthMesh);

  // Smooth Articulated Left & Right Lip Commissure Corners
  const lipCornerL = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 14, 12), mouthMat);
  lipCornerL.name = 'lipCornerL';
  lipCornerL.position.set(-0.0188, 0.0158 + facialRigParams.lipCornerPullL * 0.35, 0.0525 * anatomy.craniumDepthRatio);
  const lipCornerR = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 14, 12), mouthMat);
  lipCornerR.name = 'lipCornerR';
  lipCornerR.position.set(0.0188, 0.0158 + facialRigParams.lipCornerPullR * 0.35, 0.0525 * anatomy.craniumDepthRatio);
  jawPivot.add(lipCornerL, lipCornerR);

  // Recessed Oral Cavity, Dental Arches (Teeth) & Tongue (strictly recessed behind lips and only visible when mouth opens)
  const mouthOpening = new THREE.Group();
  mouthOpening.name = 'mouthOpening';
  mouthOpening.position.set(0, 0.015, 0.036 * anatomy.craniumDepthRatio);

  const cavityBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.017, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x1a0908 })
  );
  cavityBack.scale.set(1.08, 0.52, 0.32);

  const teethMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8f7f2,
    roughness: 0.18,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12
  });
  const upperTeethMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0135, 0.0135, 0.0046, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
    teethMat
  );
  upperTeethMesh.name = 'upperTeethMesh';
  upperTeethMesh.position.set(0, 0.0042, -0.006);

  const lowerTeethMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0128, 0.0128, 0.0042, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
    teethMat
  );
  lowerTeethMesh.name = 'lowerTeethMesh';
  lowerTeethMesh.position.set(0, -0.0042, -0.006);

  const tongueMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.0095, 14, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xc95b63, roughness: 0.38, clearcoat: 0.45 })
  );
  tongueMesh.name = 'tongueMesh';
  tongueMesh.scale.set(1.12, 0.45, 1.05);
  tongueMesh.position.set(0, -0.003, -0.002);
  tongueMesh.visible = facialRigParams.tongueVisible > 0.05;

  mouthOpening.add(cavityBack, upperTeethMesh, lowerTeethMesh, tongueMesh);
  mouthOpening.scale.set(1 - facialRigParams.lipPucker * 0.28, Math.max(0.05, facialRigParams.mouthAperture), 1);
  mouthOpening.visible = facialRigParams.mouthAperture > 0.08;
  jawPivot.add(mouthOpening);

  headGroup.add(jawPivot);
  neckBone.add(headGroup);
  thoracicSpineBone.add(neckBone);

  // ============================================================================
  // 4. CONTOURED DELTOIDS, ARMS, ARTICULATED HANDS, LEGS & WELTED FOOTWEAR
  // ============================================================================
  const buildArmChain = (side: -1 | 1) => {
    const isLeft = side === -1;
    const clavicleBone = new THREE.Group();
    clavicleBone.name = isLeft ? 'leftClavicleBone' : 'rightClavicleBone';
    // Tucked smoothly into the sloped anatomical deltoid/clavicle contour
    clavicleBone.position.set(side * 0.172 * anatomy.shoulderBreadthRatio, 0.172, 0);

    const upperSleeveMat = isWaistcoatOnly ? shirtLinenMat : outfitMat;

    // Smooth sloped deltoid sleeve head
    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 16), upperSleeveMat);
    shoulderCap.scale.set(1.08, 0.84, 0.94);
    shoulderCap.rotation.z = side * -0.25;
    clavicleBone.add(shoulderCap);

    const upperArmBone = new THREE.Group();
    upperArmBone.name = isLeft ? 'leftUpperArmBone' : 'rightUpperArmBone';
    // Anatomical bicep/tricep sleeve profile
    const upperArmPoints = [
      new THREE.Vector2(0.038, -0.22),
      new THREE.Vector2(0.044, -0.15),
      new THREE.Vector2(0.047, -0.07),
      new THREE.Vector2(0.049, 0.0)
    ];
    const upperArmGeom = new THREE.LatheGeometry(upperArmPoints, 24);
    upperArmGeom.scale(0.96, 1.0, 1.04);
    const upperArmMesh = new THREE.Mesh(upperArmGeom, upperSleeveMat);
    upperArmMesh.castShadow = true;
    upperArmBone.add(upperArmMesh);

    const elbowBone = new THREE.Group();
    elbowBone.name = isLeft ? 'leftElbowBone' : 'rightElbowBone';
    elbowBone.position.set(0, -0.22, 0);
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.037, 16, 14), upperSleeveMat);
    elbowBone.add(elbowJoint);

    // Optional suede elbow patch for scholarly blazer or rolled linen cuff for rolled_sleeve_waistcoat
    if (resolvedClothingStyle === 'ribbed_turtleneck_blazer') {
      const elbowPatch = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), suedePatchMat);
      elbowPatch.scale.set(0.75, 1.15, 0.55);
      elbowPatch.position.set(0, 0.0, -0.018);
      elbowBone.add(elbowPatch);
    } else if (isWaistcoatOnly) {
      // Rolled linen shirtsleeve fold just below the elbow
      const rolledCuff = new THREE.Mesh(
        new THREE.TorusGeometry(0.038, 0.01, 12, 22),
        shirtLinenMat
      );
      rolledCuff.rotation.x = Math.PI / 2;
      rolledCuff.position.set(0, -0.014, 0);
      elbowBone.add(rolledCuff);
    }

    const forearmBone = new THREE.Group();
    forearmBone.name = isLeft ? 'leftForearmBone' : 'rightForearmBone';
    // Natural brachioradialis muscle swell near upper forearm tapering cleanly to anatomical wrist
    const forearmPoints = [
      new THREE.Vector2(0.025, -0.195),
      new THREE.Vector2(0.031, -0.135),
      new THREE.Vector2(0.039, -0.055),
      new THREE.Vector2(0.037, 0.0)
    ];
    const forearmGeom = new THREE.LatheGeometry(forearmPoints, 24);
    forearmGeom.scale(1.04, 1.0, 0.92);
    const forearmMatToUse = isWaistcoatOnly ? skinMat : outfitMat;
    const forearmMesh = new THREE.Mesh(forearmGeom, forearmMatToUse);
    forearmMesh.castShadow = true;
    forearmBone.add(forearmMesh);

    if (isWaistcoatOnly) {
      // Vintage leather & brass wristwatch on left bare forearm
      if (isLeft) {
        const watchStrap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.027, 0.027, 0.014, 18),
          bootMat
        );
        watchStrap.position.set(0, -0.172, 0);
        const watchCase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.011, 0.006, 14),
          brassMat
        );
        watchCase.rotation.z = Math.PI / 2;
        watchCase.position.set(-0.026, -0.172, 0.003);
        forearmBone.add(watchStrap, watchCase);
      }
    } else {
      // Tailored coat sleeve cuff + crisp linen dress cuff + brass cufflink
      const coatSleeveCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.034, 0.028, 20),
        lapelTrimMat
      );
      coatSleeveCuff.position.set(0, -0.174, 0);
      const wristCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.029, 0.022, 20),
        shirtLinenMat
      );
      wristCuff.position.set(0, -0.19, 0);
      const cuffBtn = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), brassMat);
      cuffBtn.position.set(side * 0.029, -0.174, -0.006);
      forearmBone.add(coatSleeveCuff, wristCuff, cuffBtn);
    }

    const handBone = new THREE.Group();
    handBone.name = isLeft ? 'leftHandBone' : 'rightHandBone';
    handBone.position.set(0, -0.205, 0);

    // Sculpted Organic Hand: Metacarpal Palm, Thenar Thumb Mound, 4 Multi-Knuckle Curved Fingers & Thumb
    const palmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.029, 18, 14), skinMat);
    palmMesh.scale.set(0.58, 1.15, 0.96);
    palmMesh.position.set(0, -0.012, 0);

    const thenarMound = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), contourSkinMat);
    thenarMound.scale.set(0.85, 1.2, 0.95);
    thenarMound.position.set(side * -0.008, -0.01, 0.016);
    handBone.add(palmMesh, thenarMound);

    const fingerLengths = [0.032, 0.037, 0.035, 0.028];
    for (let f = 0; f < 4; f++) {
      const zOff = (1.5 - f) * 0.0105;
      const totalLen = fingerLengths[f];
      const proxLen = totalLen * 0.56;
      const distLen = totalLen * 0.48;

      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(side * -0.002, -0.034, zOff);
      // Natural relaxed curl inward toward the palm
      fingerGroup.rotation.z = side * 0.14;

      const proxPhalanx = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0046, proxLen * 0.65, 6, 10),
        skinMat
      );
      proxPhalanx.position.set(0, -proxLen * 0.45, 0);
      fingerGroup.add(proxPhalanx);

      const distPhalanx = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.004, distLen * 0.65, 6, 10),
        contourSkinMat
      );
      distPhalanx.position.set(side * 0.003, -proxLen * 0.9 - distLen * 0.35, 0);
      distPhalanx.rotation.z = side * 0.22;
      fingerGroup.add(distPhalanx);

      handBone.add(fingerGroup);
    }

    const thumbProx = new THREE.Mesh(new THREE.CapsuleGeometry(0.0056, 0.016, 6, 10), skinMat);
    thumbProx.position.set(side * -0.009, -0.018, 0.024);
    thumbProx.rotation.x = 0.52;
    thumbProx.rotation.z = side * -0.22;
    handBone.add(thumbProx);

    forearmBone.add(handBone);
    elbowBone.add(forearmBone);
    upperArmBone.add(elbowBone);
    clavicleBone.add(upperArmBone);
    thoracicSpineBone.add(clavicleBone);

    return { clavicleBone, upperArmBone, elbowBone, forearmBone, handBone };
  };

  const leftArm = buildArmChain(-1);
  const rightArm = buildArmChain(1);

  const leftClavicleBone = leftArm.clavicleBone;
  const leftUpperArmBone = leftArm.upperArmBone;
  const leftElbowBone = leftArm.elbowBone;
  const leftForearmBone = leftArm.forearmBone;
  const leftHandBone = leftArm.handBone;

  const rightClavicleBone = rightArm.clavicleBone;
  const rightUpperArmBone = rightArm.upperArmBone;
  const rightElbowBone = rightArm.elbowBone;
  const rightForearmBone = rightArm.forearmBone;
  const rightHandBone = rightArm.handBone;

  // Walking cane accessory (grip in right hand for elderly / bent spine character)
  const hasCane = appearance.hasWalkingCane ?? isElderly;
  const caneGroup = new THREE.Group();
  caneGroup.name = 'caneGroup';
  caneGroup.visible = hasCane;

  const caneShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.011, 0.84, 12), caneWoodMat);
  caneShaft.position.set(0, -0.39, 0);
  caneShaft.castShadow = true;
  const crookGeom = new THREE.TorusGeometry(0.048, 0.015, 10, 18, Math.PI);
  const crookMesh = new THREE.Mesh(crookGeom, brassMat);
  crookMesh.position.set(0.038, 0.038, 0);
  crookMesh.rotation.z = Math.PI / 2;
  const brassCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.028, 12), brassMat);
  brassCollar.position.set(0, 0.01, 0);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.055, 12), bootMat);
  ferrule.position.set(0, -0.80, 0);
  caneGroup.add(caneShaft, crookMesh, brassCollar, ferrule);
  rightHandBone.add(caneGroup);

  // Assemble Multi-Segment Spine Hierarchy: Pelvis -> L1 Lumbar -> T6 Lower Thoracic -> T1 Upper Thoracic
  lowerThoracicBone.add(thoracicSpineBone);
  lumbarSpineBone.add(lowerThoracicBone);
  pelvisBone.add(lumbarSpineBone);

  // Contoured Quadriceps/Gastrocnemius Trousers & Detailed Welted Leather Footwear
  const buildLegChain = (side: -1 | 1) => {
    const isLeft = side === -1;
    const hipBone = new THREE.Group();
    hipBone.name = isLeft ? 'leftHipBone' : 'rightHipBone';
    hipBone.position.set(side * 0.098 * anatomy.hipFlareRatio, -0.055, 0);
    const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 14), trouserMat);
    hipBone.add(hipJoint);

    const thighBone = new THREE.Group();
    thighBone.name = isLeft ? 'leftThighBone' : 'rightThighBone';
    const thighPoints = [
      new THREE.Vector2(0.051, -0.38),
      new THREE.Vector2(0.059, -0.26),
      new THREE.Vector2(0.066, -0.13),
      new THREE.Vector2(0.068, 0.0)
    ];
    const thighGeom = new THREE.LatheGeometry(thighPoints, 24);
    thighGeom.scale(0.96, 1.0, 1.06);
    const thighMesh = new THREE.Mesh(thighGeom, trouserMat);
    thighMesh.castShadow = true;
    thighBone.add(thighMesh);

    const kneeBone = new THREE.Group();
    kneeBone.name = isLeft ? 'leftKneeBone' : 'rightKneeBone';
    kneeBone.position.set(0, -0.38, 0);
    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.049, 16, 14), trouserMat);
    kneeBone.add(kneeJoint);

    const calfBone = new THREE.Group();
    calfBone.name = isLeft ? 'leftCalfBone' : 'rightCalfBone';
    // Natural gastrocnemius calf contour + tailored trouser ankle cuff
    const calfPoints = [
      new THREE.Vector2(0.041, -0.35),
      new THREE.Vector2(0.046, -0.24),
      new THREE.Vector2(0.055, -0.11),
      new THREE.Vector2(0.05, 0.0)
    ];
    const calfGeom = new THREE.LatheGeometry(calfPoints, 24);
    const calfMesh = new THREE.Mesh(calfGeom, trouserMat);
    calfMesh.castShadow = true;

    // Tailored trouser turn-up cuff at the bottom of the leg
    const trouserCuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.045, 0.028, 22),
      trouserMat
    );
    trouserCuff.position.set(0, -0.338, 0);
    calfBone.add(calfMesh, trouserCuff);

    const footBone = new THREE.Group();
    footBone.name = isLeft ? 'leftFootBone' : 'rightFootBone';
    footBone.position.set(0, -0.36, 0);

    // Sculpted Welted Oxford / Brogue Footwear: Ankle Quarter, Vamp, Cap Toe, Goodyear Welt & Stacked Heel
    const ankleQuarter = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.052, 18), bootMat);
    ankleQuarter.position.set(0, -0.01, -0.004);

    const shoeVamp = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.045, 0.165, 18), bootMat);
    shoeVamp.rotation.x = Math.PI / 2;
    shoeVamp.scale.set(1.04, 1.0, 0.68);
    shoeVamp.position.set(0, -0.032, 0.036);
    shoeVamp.castShadow = true;

    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.041, 16, 12), bootMat);
    toeCap.scale.set(1.02, 0.64, 1.12);
    toeCap.position.set(0, -0.035, 0.112);

    const weltSole = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.012, 0.215), bootSoleMat);
    weltSole.position.set(0, -0.052, 0.042);

    const shoeHeel = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.026, 0.064), bootSoleMat);
    shoeHeel.position.set(0, -0.055, -0.018);

    footBone.add(ankleQuarter, shoeVamp, toeCap, weltSole, shoeHeel);

    calfBone.add(footBone);
    kneeBone.add(calfBone);
    thighBone.add(kneeBone);
    hipBone.add(thighBone);
    pelvisBone.add(hipBone);

    return { hipBone, thighBone, kneeBone, calfBone, footBone };
  };

  const leftLeg = buildLegChain(-1);
  const rightLeg = buildLegChain(1);

  const leftHipBone = leftLeg.hipBone;
  const leftThighBone = leftLeg.thighBone;
  const leftKneeBone = leftLeg.kneeBone;
  const leftCalfBone = leftLeg.calfBone;
  const leftFootBone = leftLeg.footBone;

  const rightHipBone = rightLeg.hipBone;
  const rightThighBone = rightLeg.thighBone;
  const rightKneeBone = rightLeg.kneeBone;
  const rightCalfBone = rightLeg.calfBone;
  const rightFootBone = rightLeg.footBone;

  actorGroup.add(pelvisBone);

  // Initial Multi-Vertebrae Spine Posture Setup (distributes kyphosis across L1, T6, T1, and C4)
  const kyphosisRad = (Math.max(0, Math.min(48, curvatureDeg)) * Math.PI) / 180;
  lumbarSpineBone.rotation.x = -kyphosisRad * 0.22;
  lowerThoracicBone.rotation.x = -kyphosisRad * 0.36;
  thoracicSpineBone.rotation.x = -kyphosisRad * 0.48;
  neckBone.rotation.x = kyphosisRad * 0.78; // Counter-pitch to keep eyes looking forward

  if (hasCane) {
    rightUpperArmBone.rotation.x = 0.28;
    rightUpperArmBone.rotation.z = -0.12;
    rightForearmBone.rotation.x = -0.52;
  }

  // Store bone handles and full articulated facial rig references on root for 60fps kinematic animation loops
  root.userData = {
    isCharacterRig: true,
    appearance,
    anatomy,
    bones: {
      pelvisBone,
      lumbarSpineBone,
      lowerThoracicBone,
      thoracicSpineBone,
      neckBone,
      headGroup,
      leftClavicleBone,
      leftUpperArmBone,
      leftElbowBone,
      leftForearmBone,
      leftHandBone,
      rightClavicleBone,
      rightUpperArmBone,
      rightElbowBone,
      rightForearmBone,
      rightHandBone,
      leftHipBone,
      leftThighBone,
      leftKneeBone,
      leftCalfBone,
      leftFootBone,
      rightHipBone,
      rightThighBone,
      rightKneeBone,
      rightCalfBone,
      rightFootBone,
      caneGroup
    },
    facial: {
      browPivotL,
      browPivotR,
      browInnerL,
      browInnerR,
      browOuterL,
      browOuterR,
      eyeL,
      eyeR,
      irisGroupL,
      irisGroupR,
      pupilMeshL,
      pupilMeshR,
      corneaGlintL,
      corneaGlintR,
      upperLidL,
      upperLidR,
      lowerLidL,
      lowerLidR,
      eyelashL,
      eyelashR,
      nostrilWingL,
      nostrilWingR,
      cheekAppleL,
      cheekAppleR,
      upperLipGroup,
      lowerLipGroup,
      jawPivot,
      mouthMesh,
      lipCornerL,
      lipCornerR,
      mouthOpening,
      upperTeethMesh,
      lowerTeethMesh,
      tongueMesh,
      underEyeBags,
      cheekHollowL,
      cheekHollowR
    }
  };

  if (includePedestal) {
    const pedBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.26, 1.55),
      new THREE.MeshStandardMaterial({ color: 0x5c3824, roughness: 0.75, metalness: 0.15 })
    );
    pedBase.position.y = -0.21;
    const pedSoil = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.14, 1.48),
      new THREE.MeshStandardMaterial({ color: 0xa1885c, roughness: 0.85, metalness: 0.05 })
    );
    pedSoil.position.y = -0.05;

    const sproutMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.6 });
    const sprout1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), sproutMat);
    sprout1.position.set(-0.52, 0.11, -0.45);
    const sprout2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), sproutMat);
    sprout2.position.set(0.48, 0.09, 0.46);
    const pebble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.09, 0),
      new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.8 })
    );
    pebble.position.set(0.52, 0.05, -0.38);

    root.add(pedBase, pedSoil, sprout1, sprout2, pebble);
  }

  root.add(actorGroup);
  return root;
}

/**
 * Applies forward kinematic bone rotations and articulated human facial micro-expression parameters to a character rig.
 */
export function applySkeletonPoseToRig(
  rigGroup: THREE.Group,
  pose: SkeletonPoseEuler,
  facialParams?: FacialRigParams,
  options?: { updateBody?: boolean; updateFace?: boolean }
): void {
  const bones = rigGroup.userData?.bones;
  const facial = rigGroup.userData?.facial;
  if (!bones) return;

  const shouldUpdateBody = options?.updateBody ?? true;
  const shouldUpdateFace = options?.updateFace ?? true;

  if (shouldUpdateBody && pose) {
    // 1. Pelvis & Multi-Vertebrae Spine Kinematics (L1 Lumbar -> T6 Lower Thoracic -> T1 Upper Thoracic -> C4 Neck)
    if (bones.pelvisBone) {
      bones.pelvisBone.position.y = pose.pelvisY;
    }
    if (bones.lumbarSpineBone) {
      bones.lumbarSpineBone.rotation.x = pose.spineLumbarX;
      bones.lumbarSpineBone.rotation.y = pose.spineLumbarY;
    }
    if (bones.lowerThoracicBone) {
      bones.lowerThoracicBone.rotation.x = pose.spineLowerThoracicX;
      bones.lowerThoracicBone.rotation.y = pose.spineLumbarY * 0.6;
    }
    if (bones.thoracicSpineBone) {
      bones.thoracicSpineBone.rotation.x = pose.spineThoracicX;
      bones.thoracicSpineBone.rotation.y = pose.spineThoracicY;
      bones.thoracicSpineBone.rotation.z = pose.spineThoracicZ;
    }
    if (bones.neckBone) {
      bones.neckBone.rotation.x = pose.neckX;
      bones.neckBone.rotation.y = pose.neckY;
    }
    if (bones.headGroup) {
      bones.headGroup.rotation.x = pose.headX + (facialParams?.headMicroNod || 0);
      bones.headGroup.rotation.y = pose.headY;
      bones.headGroup.rotation.z = (pose.headZ || 0) + (facialParams?.headMicroTilt || 0);
    }

    // 2. Arms & Wrist/Hand Kinematics
    if (bones.leftClavicleBone) bones.leftClavicleBone.rotation.z = pose.leftClavicleZ;
    if (bones.leftUpperArmBone) {
      bones.leftUpperArmBone.rotation.x = pose.leftUpperArmX;
      bones.leftUpperArmBone.rotation.z = pose.leftUpperArmZ;
    }
    if (bones.leftForearmBone) bones.leftForearmBone.rotation.x = pose.leftForearmX;
    if (bones.leftHandBone && pose.leftHandZ !== undefined) {
      bones.leftHandBone.rotation.z = pose.leftHandZ;
    }

    if (bones.rightClavicleBone) bones.rightClavicleBone.rotation.z = pose.rightClavicleZ;
    if (bones.rightUpperArmBone) {
      bones.rightUpperArmBone.rotation.x = pose.rightUpperArmX;
      bones.rightUpperArmBone.rotation.z = pose.rightUpperArmZ;
    }
    if (bones.rightForearmBone) bones.rightForearmBone.rotation.x = pose.rightForearmX;
    if (bones.rightHandBone && pose.rightHandZ !== undefined) {
      bones.rightHandBone.rotation.z = pose.rightHandZ;
    }

    if (bones.caneGroup) {
      bones.caneGroup.visible = pose.caneGripActive;
    }

    // 3. Legs Kinematics
    if (bones.leftThighBone) bones.leftThighBone.rotation.x = pose.leftThighX;
    if (bones.leftCalfBone) bones.leftCalfBone.rotation.x = pose.leftCalfX;
    if (bones.leftFootBone) bones.leftFootBone.rotation.x = pose.leftFootX;

    if (bones.rightThighBone) bones.rightThighBone.rotation.x = pose.rightThighX;
    if (bones.rightCalfBone) bones.rightCalfBone.rotation.x = pose.rightCalfX;
    if (bones.rightFootBone) bones.rightFootBone.rotation.x = pose.rightFootX;
  }

  // 4. Articulated Human Facial Micro-Expressions (4-Zone Brows, Blink/Squint Eyelids, Saccades, Nostril Flare, Cheek Raise, TMJ Jaw & Lips)
  if (shouldUpdateFace && facial && facialParams) {
    // 4A. 4-Zone Independent Medial & Lateral Eyebrows
    if (facial.browPivotL) {
      facial.browPivotL.position.y = 0.161 + facialParams.browHeight * 0.16;
      facial.browPivotL.rotation.z =
        (facialParams.browRollL ?? -facialParams.browFurrow * 0.28) * 0.45;
    }
    if (facial.browPivotR) {
      facial.browPivotR.position.y =
        0.161 + (facialParams.browHeight + (facialParams.browAsymmetry || 0) * 0.04) * 0.16;
      facial.browPivotR.rotation.z =
        (facialParams.browRollR ??
          facialParams.browFurrow * 0.28 + (facialParams.browAsymmetry || 0) * 0.45) * 0.45;
    }
    if (facial.browInnerL && facialParams.browInnerLiftL !== undefined) {
      facial.browInnerL.position.y = facialParams.browInnerLiftL * 0.18;
    }
    if (facial.browInnerR && facialParams.browInnerLiftR !== undefined) {
      facial.browInnerR.position.y = facialParams.browInnerLiftR * 0.18;
    }
    if (facial.browOuterL && facialParams.browOuterLiftL !== undefined) {
      facial.browOuterL.position.y = -0.0010 + facialParams.browOuterLiftL * 0.18;
    }
    if (facial.browOuterR && facialParams.browOuterLiftR !== undefined) {
      facial.browOuterR.position.y = -0.0010 + facialParams.browOuterLiftR * 0.18;
    }

    // 4B. Eyes, Physiological Blink, Upper Lid Droop, Lower Lid Squint, Saccades & Pupil Dilation
    const blinkFactor = 1 - (facialParams.blinkAmount || 0) * 0.85;
    if (facial.eyeL) {
      const baseScaleL = Math.max(
        0.76,
        Math.min(1.06, 0.72 + (facialParams.eyeAperture + (facialParams.eyelidTremor || 0) * 0.06) * 0.28)
      );
      facial.eyeL.scale.y = Math.max(0.18, baseScaleL * blinkFactor);
    }
    if (facial.eyeR) {
      const baseScaleR = Math.max(
        0.76,
        Math.min(1.06, 0.72 + (facialParams.eyeAperture - (facialParams.eyelidTremor || 0) * 0.04) * 0.28)
      );
      facial.eyeR.scale.y = Math.max(0.18, baseScaleR * blinkFactor);
    }
    if (facial.upperLidL) {
      facial.upperLidL.position.y =
        0.0025 - (facialParams.upperLidDroop || 0) * 0.25 - (facialParams.blinkAmount || 0) * 0.004;
    }
    if (facial.upperLidR) {
      facial.upperLidR.position.y =
        0.0025 - (facialParams.upperLidDroop || 0) * 0.25 - (facialParams.blinkAmount || 0) * 0.004;
    }
    if (facial.lowerLidL) {
      facial.lowerLidL.position.y = -0.0025 + (facialParams.lowerLidSquint || 0) * 0.0022;
    }
    if (facial.lowerLidR) {
      facial.lowerLidR.position.y = -0.0025 + (facialParams.lowerLidSquint || 0) * 0.0022;
    }
    const clampedGazeX = Math.max(-0.0036, Math.min(0.0036, (facialParams.eyeGazeX || 0) * 0.24));
    const clampedGazeY = Math.max(-0.0022, Math.min(0.0022, (facialParams.eyeGazeY || 0) * 0.24));
    if (facial.irisGroupL) {
      facial.irisGroupL.position.x = clampedGazeX;
      facial.irisGroupL.position.y = clampedGazeY;
    }
    if (facial.irisGroupR) {
      facial.irisGroupR.position.x = clampedGazeX;
      facial.irisGroupR.position.y = clampedGazeY;
    }
    if (facial.pupilMeshL && facialParams.pupilDilation !== undefined) {
      facial.pupilMeshL.scale.setScalar(facialParams.pupilDilation);
    }
    if (facial.pupilMeshR && facialParams.pupilDilation !== undefined) {
      facial.pupilMeshR.scale.setScalar(facialParams.pupilDilation);
    }

    // 4C. Nostril Alar Wing Flare & Zygomatic Cheek Apple Squint Elevation
    if (facial.nostrilWingL && facial.nostrilWingR) {
      const flare = facialParams.nostrilFlare || 0;
      facial.nostrilWingL.position.x = -0.0110 - flare * 0.0022;
      facial.nostrilWingR.position.x = 0.0110 + flare * 0.0022;
      const wingScale = 1 + flare * 0.18;
      facial.nostrilWingL.scale.set(wingScale, 1, wingScale);
      facial.nostrilWingR.scale.set(wingScale, 1, wingScale);
    }
    if (facial.cheekAppleL && facial.cheekAppleR) {
      const raise = facialParams.cheekSquintRaise || 0;
      facial.cheekAppleL.position.y = 0.106 + raise * 0.005;
      facial.cheekAppleR.position.y = 0.106 + raise * 0.005;
    }

    // 4D. TMJ Mandible Hinge, Cupid's Bow Upper/Lower Lips, Lip Corners & Oral Cavity
    const puckerScaleX = 1 - (facialParams.lipPucker || 0) * 0.24;
    if (facial.upperLipGroup) {
      facial.upperLipGroup.position.y = 0.071 + (facialParams.upperLipLift || 0) * 0.003;
      facial.upperLipGroup.scale.x = puckerScaleX;
    }
    if (facial.jawPivot) {
      facial.jawPivot.position.y = 0.052 - facialParams.jawDrop * 0.35;
      facial.jawPivot.position.x = (facialParams.jawLateralShift || 0) * 0.5;
      facial.jawPivot.rotation.x = (facialParams.jawPitchRad || 0) * 0.35;
    }
    if (facial.lowerLipGroup) {
      facial.lowerLipGroup.position.y = 0.012 - (facialParams.lowerLipDepress || 0) * 0.003;
      facial.lowerLipGroup.scale.x = puckerScaleX;
    }
    if (facial.mouthMesh) {
      facial.mouthMesh.rotation.z =
        (facialParams.mouthCornerAngle + (facialParams.mouthAsymmetry || 0)) * 0.45;
      facial.mouthMesh.scale.x = puckerScaleX;
    }
    if (facial.lipCornerL) {
      facial.lipCornerL.position.x = -0.0195 * puckerScaleX;
      facial.lipCornerL.position.y =
        0.016 + (facialParams.lipCornerPullL ?? -(facialParams.mouthAsymmetry || 0) * 0.04) * 0.35;
    }
    if (facial.lipCornerR) {
      facial.lipCornerR.position.x = 0.0195 * puckerScaleX;
      facial.lipCornerR.position.y =
        0.016 + (facialParams.lipCornerPullR ?? (facialParams.mouthAsymmetry || 0) * 0.04) * 0.35;
    }
    if (facial.mouthOpening) {
      facial.mouthOpening.scale.x = puckerScaleX;
      facial.mouthOpening.scale.y = Math.max(0.05, facialParams.mouthAperture);
      facial.mouthOpening.visible = (facialParams.mouthAperture || 0) > 0.08;
    }
    if (facial.tongueMesh && facialParams.tongueVisible !== undefined) {
      facial.tongueMesh.visible = facialParams.tongueVisible > 0.05;
    }
    if (facial.underEyeBags) {
      facial.underEyeBags.visible = facialParams.underEyeBags;
    }
    if (facial.cheekHollowL && facial.cheekHollowR) {
      const hollowScale = 0.65 + (facialParams.cheekHollow || 0.2) * 0.75;
      facial.cheekHollowL.scale.set(0.88 * hollowScale, 1.05 * hollowScale, 0.32);
      facial.cheekHollowR.scale.set(0.88 * hollowScale, 1.05 * hollowScale, 0.32);
    }
  }
}

/**
 * Builds the T-Pose Architectural Scale Reference Mannequin (matching w_alls_with_t-pose_-modular-environments-03_a620f39c.jpg)
 */
export function buildTPoseScaleMannequin(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.45,
    metalness: 0.25
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.6,
    metalness: 0.4
  });

  // Legs
  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.85, 10), mat);
  leftLeg.position.set(-0.14, 0.42, 0);
  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.85, 10), mat);
  rightLeg.position.set(0.14, 0.42, 0);
  // Pelvis & Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.62, 0.22), mat);
  torso.position.set(0, 1.15, 0);
  // Outstretched T-Pose Arms
  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.48, 10), mat);
  arms.rotation.z = Math.PI / 2;
  arms.position.set(0, 1.38, 0);
  // Shoulder joints
  const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), jointMat);
  leftShoulder.position.set(-0.24, 1.38, 0);
  const rightShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), jointMat);
  rightShoulder.position.set(0.24, 1.38, 0);
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), mat);
  head.scale.set(0.85, 1.1, 0.9);
  head.position.set(0, 1.66, 0);

  group.add(createContactShadowDisc(0.4, 0.4), leftLeg, rightLeg, torso, arms, leftShoulder, rightShoulder, head);
  return group;
}

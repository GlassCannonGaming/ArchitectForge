import * as THREE from 'three';
import {
  PlacedAsset,
  TexturePresetId,
  AssetConditionVariant,
  CharacterAppearance,
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
  isInvisibleTriggerAsset
} from './rules';

const textureCache = new Map<string, { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }>();
const faceSkinTextureCache = new Map<string, { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }>();
const irisTextureCache = new Map<string, THREE.CanvasTexture>();

export function getProceduralFaceSkinTextures(
  skinColorHex: string,
  isElderly: boolean
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `${skinColorHex}__${isElderly ? 'elderly' : 'adult'}`;
  if (faceSkinTextureCache.has(cacheKey)) {
    return faceSkinTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const baseColor = new THREE.Color(skinColorHex || '#f3d9c4');
  const rBase = Math.round(baseColor.r * 255);
  const gBase = Math.round(baseColor.g * 255);
  const bBase = Math.round(baseColor.b * 255);

  ctx.fillStyle = `rgb(${rBase}, ${gBase}, ${bBase})`;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle warm subsurface scattering gradient (warmer mid-face blush & cooler lower jaw contour)
  const cheekGradL = ctx.createRadialGradient(82, 136, 6, 82, 136, 54);
  cheekGradL.addColorStop(0, 'rgba(218, 92, 82, 0.16)');
  cheekGradL.addColorStop(1, 'rgba(218, 92, 82, 0)');
  ctx.fillStyle = cheekGradL;
  ctx.fillRect(0, 0, 256, 256);

  const cheekGradR = ctx.createRadialGradient(174, 136, 6, 174, 136, 54);
  cheekGradR.addColorStop(0, 'rgba(218, 92, 82, 0.16)');
  cheekGradR.addColorStop(1, 'rgba(218, 92, 82, 0)');
  ctx.fillStyle = cheekGradR;
  ctx.fillRect(0, 0, 256, 256);

  // Soft forehead & nasal bridge highlight
  const bridgeGrad = ctx.createRadialGradient(128, 102, 4, 128, 102, 46);
  bridgeGrad.addColorStop(0, 'rgba(255, 248, 240, 0.14)');
  bridgeGrad.addColorStop(1, 'rgba(255, 248, 240, 0)');
  ctx.fillStyle = bridgeGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Micro-pore organic skin grain & bump map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1800; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const delta = (i % 5) - 2;
    ctx.fillStyle = delta > 0 ? 'rgba(255,245,238,0.025)' : 'rgba(120,75,60,0.025)';
    ctx.fillRect(x, y, 2, 2);
    const bVal = 128 + delta * (isElderly ? 6 : 3);
    bumpCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bumpCtx.fillRect(x, y, 2, 2);
  }

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

export function getProceduralIrisTexture(
  eyeStyle: CharacterAppearance['eyeStyle'] = 'wide_amber'
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = eyeStyle || 'wide_amber';
  if (irisTextureCache.has(cacheKey)) {
    return irisTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = 64;
  const cy = 64;
  const outerR = 60;

  let outerHex = '#1e293b';
  let midHex = '#d97706';
  let innerHex = '#fbbf24';
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

  // Dark limbal ring -> rich stromal iris gradient -> warm collarette ring
  const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, outerR);
  grad.addColorStop(0, innerHex);
  grad.addColorStop(0.38, innerHex);
  grad.addColorStop(0.75, midHex);
  grad.addColorStop(0.92, outerHex);
  grad.addColorStop(1.0, '#09090b');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Radial iris stromal fibers
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.24)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
    ctx.lineTo(Math.cos(angle) * 55, Math.sin(angle) * 55);
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  irisTextureCache.set(cacheKey, tex);
  return tex;
}

const SPECIALIZED_70S_SUBTYPES = new Set<string>([
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

  // Automatically synthesize multi-part 3D geometry for specialized late-70s/early-80s catalog fixtures
  const resolvedCompositeParts =
    asset.compositeParts && asset.compositeParts.length > 0
      ? asset.compositeParts
      : SPECIALIZED_70S_SUBTYPES.has(asset.subType)
      ? buildProcedural3DSpecFromPrompt(asset.name || asset.subType).parts
      : undefined;

  let hasDedicatedScreenPart = false;

  // Custom AI / Meshy / Resolved Late-70s Composite Parts
  if (resolvedCompositeParts && resolvedCompositeParts.length > 0) {
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

      let partColorHex = part.color;
      let partEmissiveHex = part.emissive || '#000000';
      let partEmissiveIntensity = part.emissive ? 0.45 : 0;

      if (interactionState.interactionKind === 'tv_screen' && isScreenPart) {
        hasDedicatedScreenPart = true;
        if (interactionState.isActivated) {
          partColorHex = '#ffffff';
          partEmissiveHex = '#ffffff';
          partEmissiveIntensity = 1.45;
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
      mesh.userData = { isTvScreen: isScreenPart && interactionState.interactionKind === 'tv_screen' };
      mesh.position.set(part.offset[0], part.offset[1] - h / 2, part.offset[2]);
      if (part.rotation) {
        mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
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
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.18, 14),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(isLampOn ? '#fef3c7' : asset.color),
        emissive: new THREE.Color(isLampOn ? '#fde68a' : '#2a2214'),
        emissiveIntensity: isLampOn ? 1.15 : 0.15,
        roughness: 0.35,
        metalness: 0.25
      })
    );
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
    const screenMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(screenColor),
      emissive: new THREE.Color(screenEmissive),
      emissiveIntensity: interactionState.isActivated ? 1.45 : 0.05,
      roughness: 0.16,
      metalness: 0.22
    });
    const screenPanel = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.24, w * 0.72), Math.max(0.2, h * 0.58), 0.04),
      screenMat
    );
    screenPanel.name = 'interactiveScreenPanel';
    screenPanel.userData = { isTvScreen: true };
    screenPanel.position.set(-w * 0.05, h * 0.04, d * 0.46);
    group.add(screenPanel);
  }

  // Emit interactive PointLight glow when a TV ("white on"), lamp, computer, or appliance is activated
  if (interactionState.isActivated && interactionState.emitsLight) {
    const activeLight = new THREE.PointLight(
      new THREE.Color(interactionState.lightColorHex),
      interactionState.interactionKind === 'tv_screen' ? 1.35 : 0.9,
      interactionState.interactionKind === 'tv_screen' ? 5.5 : 4.2,
      1.6
    );
    activeLight.position.set(0, h * 0.15, d * 0.65);
    activeLight.name = 'interactiveStateLight';
    group.add(activeLight);
  }

  // Selection outline wireframe box in ArchitectForge mode
  if (isSelected) {
    const selBox = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.12, h + 0.12, d + 0.12),
      new THREE.MeshBasicMaterial({
        color: 0xd97706,
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

  // Subsurface-like warm natural skin material with peach/rose velvet sheen & micro-pore texture
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: baseSkinColor,
    map: skinTextures?.map || null,
    bumpMap: skinTextures?.bumpMap || null,
    bumpScale: isElderly ? 0.0025 : 0.0012,
    roughness: isElderly ? 0.64 : 0.52,
    metalness: 0.02,
    sheen: 0.38,
    sheenRoughness: 0.68,
    sheenColor: sheenSkinColor,
    clearcoat: 0.06,
    clearcoatRoughness: 0.55
  });

  // Soft natural contour material for subtle sub-malar hollows, philtrum, and eyelids (avoids harsh dark blobs)
  const contourSkinMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(baseSkinHex).offsetHSL(-0.01, 0.08, -0.055),
    roughness: 0.62,
    metalness: 0.02,
    sheen: 0.25,
    sheenRoughness: 0.72,
    sheenColor: sheenSkinColor
  });

  // Deeper crease shadow material for recessed orbital sockets, nostril openings & age folds
  const shadowSkinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseSkinHex).offsetHSL(0, 0.08, -0.11),
    roughness: 0.78,
    metalness: 0.02
  });

  // Warm rose-coral lip material with natural hydrated gloss
  const lipColor = new THREE.Color(baseSkinHex).lerp(new THREE.Color(0xb84a49), 0.52);
  const mouthMat = new THREE.MeshPhysicalMaterial({
    color: lipColor,
    roughness: 0.36,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.35,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xfda4af)
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.hairColor || (isElderly ? '#d1d5db' : '#451a03')),
    roughness: 0.68,
    metalness: 0.08
  });
  const outfitMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.outfitColor || (isElderly ? '#4b5563' : '#78350f')),
    roughness: 0.68,
    metalness: 0.1
  });
  const trouserMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.outfitColor || (isElderly ? '#374151' : '#5c280b')).offsetHSL(0, -0.04, -0.06),
    roughness: 0.74,
    metalness: 0.08
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.accentColor || '#b45309'),
    roughness: 0.35,
    metalness: 0.75
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x221f1d,
    roughness: 0.45,
    metalness: 0.24
  });
  const caneWoodMat = new THREE.MeshStandardMaterial({
    color: 0x3d2010,
    roughness: 0.42,
    metalness: 0.15
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.28,
    metalness: 0.85
  });
  const shawlMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.outfitColor ? appearance.outfitColor : '#52525b').offsetHSL(0, -0.05, 0.08),
    roughness: 0.84,
    metalness: 0.02
  });
  const shirtLinenMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f4,
    roughness: 0.65,
    metalness: 0.02
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

  // 2. Natural Anatomical Skeleton Hierarchy (Multi-Vertebrae Articulated Spine & Contoured Organic Body):
  // Root Pelvis (y = 0.88m)
  const pelvisBone = new THREE.Group();
  pelvisBone.name = 'pelvisBone';
  pelvisBone.position.set(0, 0.88, 0);

  // Sculpted Iliac Pelvis, Gluteal Curve & Hip Flare (organic contoured Lathe profile)
  const pelvisPoints = [
    new THREE.Vector2(0.118 * anatomy.hipFlareRatio, -0.088),
    new THREE.Vector2(0.154 * anatomy.hipFlareRatio, -0.035),
    new THREE.Vector2(0.158 * anatomy.hipFlareRatio, 0.02),
    new THREE.Vector2(0.144 * anatomy.waistTaperRatio, 0.085)
  ];
  const pelvisGeom = new THREE.LatheGeometry(pelvisPoints, 20);
  pelvisGeom.scale(1.14, 1.0, 0.82);
  const pelvisMesh = new THREE.Mesh(pelvisGeom, trouserMat);
  pelvisMesh.castShadow = true;
  pelvisBone.add(pelvisMesh);

  // Tailored Coat Peplum / Hem Flare overlapping upper hips for natural silhouette continuity
  const coatHemGeom = new THREE.CylinderGeometry(
    0.148 * anatomy.waistTaperRatio,
    0.168 * anatomy.hipFlareRatio,
    0.11,
    20
  );
  coatHemGeom.scale(1.15, 1.0, 0.84);
  const coatHemMesh = new THREE.Mesh(coatHemGeom, outfitMat);
  coatHemMesh.position.set(0, 0.048, 0);
  coatHemMesh.castShadow = true;
  pelvisBone.add(coatHemMesh);

  // Contoured Leather Belt & Tarnished Brass Buckle
  const beltGeom = new THREE.CylinderGeometry(0.152 * anatomy.waistTaperRatio, 0.156 * anatomy.hipFlareRatio, 0.038, 20);
  beltGeom.scale(1.16, 1.0, 0.85);
  const beltMesh = new THREE.Mesh(beltGeom, bootMat);
  beltMesh.position.set(0, 0.068, 0);
  const buckleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.046, 0.022), accentMat);
  buckleMesh.position.set(0, 0.068, 0.128 * anatomy.waistTaperRatio);
  pelvisBone.add(beltMesh, buckleMesh);

  // L1 Lumbar Spine (Lower Back & Natural Tapered Waist)
  const lumbarSpineBone = new THREE.Group();
  lumbarSpineBone.name = 'lumbarSpineBone';
  lumbarSpineBone.position.set(0, 0.085, 0);

  const lumbarPoints = [
    new THREE.Vector2(0.146 * anatomy.waistTaperRatio, 0.0),
    new THREE.Vector2(0.138 * anatomy.waistTaperRatio, 0.065),
    new THREE.Vector2(0.148 * anatomy.waistTaperRatio, 0.138)
  ];
  const lumbarGeom = new THREE.LatheGeometry(lumbarPoints, 20);
  lumbarGeom.scale(1.14, 1.0, 0.80);
  const lumbarMesh = new THREE.Mesh(lumbarGeom, outfitMat);
  lumbarMesh.castShadow = true;
  lumbarSpineBone.add(lumbarMesh);

  // T6 Lower Thoracic Spine (Mid-Back & Lower Ribcage — key pivot for natural kyphosis / bent spine)
  const lowerThoracicBone = new THREE.Group();
  lowerThoracicBone.name = 'lowerThoracicBone';
  lowerThoracicBone.position.set(0, 0.125, 0);

  const lowerThoracicPoints = [
    new THREE.Vector2(0.146 * anatomy.waistTaperRatio, 0.0),
    new THREE.Vector2(0.158, 0.075),
    new THREE.Vector2(0.168 * anatomy.shoulderBreadthRatio, 0.148)
  ];
  const lowerThoracicGeom = new THREE.LatheGeometry(lowerThoracicPoints, 20);
  lowerThoracicGeom.scale(1.15, 1.0, 0.82);
  const lowerThoracicMesh = new THREE.Mesh(lowerThoracicGeom, outfitMat);
  lowerThoracicMesh.castShadow = true;
  lowerThoracicBone.add(lowerThoracicMesh);

  // T1 Upper Thoracic Spine (Upper Ribcage, Pectorals, Trapezius Slope & Scapular Girdle)
  const thoracicSpineBone = new THREE.Group();
  thoracicSpineBone.name = 'thoracicSpineBone';
  thoracicSpineBone.position.set(0, 0.135, 0);

  // Sculpted Anatomical Ribcage / Tailored Coat Torso
  const chestPoints = [
    new THREE.Vector2(0.164 * anatomy.shoulderBreadthRatio, 0.0),
    new THREE.Vector2(0.178 * anatomy.shoulderBreadthRatio, 0.095),
    new THREE.Vector2(0.184 * anatomy.shoulderBreadthRatio, 0.175),
    new THREE.Vector2(0.138 * anatomy.shoulderBreadthRatio, 0.222)
  ];
  const chestGeom = new THREE.LatheGeometry(chestPoints, 22);
  chestGeom.scale(1.16, 1.0, 0.84);
  const chestMesh = new THREE.Mesh(chestGeom, outfitMat);
  chestMesh.castShadow = true;
  thoracicSpineBone.add(chestMesh);

  // Subtle Pectoral / Bust Anatomical Volume for natural anterior torso contour
  const pecGeom = new THREE.SphereGeometry(0.082, 14, 12);
  pecGeom.scale(1.18, 0.88, 0.62);
  const pecL = new THREE.Mesh(pecGeom, outfitMat);
  pecL.position.set(-0.068, 0.128, 0.105);
  const pecR = new THREE.Mesh(pecGeom, outfitMat);
  pecR.position.set(0.068, 0.128, 0.105);
  thoracicSpineBone.add(pecL, pecR);

  // Sloped Trapezius Shoulder Bridges (smoothly connects neck base to clavicles/shoulders)
  const trapGeom = new THREE.SphereGeometry(0.072, 12, 10);
  trapGeom.scale(1.45, 0.58, 0.88);
  const trapL = new THREE.Mesh(trapGeom, outfitMat);
  trapL.position.set(-0.115, 0.205, -0.008);
  trapL.rotation.z = 0.28;
  const trapR = new THREE.Mesh(trapGeom, outfitMat);
  trapR.position.set(0.115, 0.205, -0.008);
  trapR.rotation.z = -0.28;
  thoracicSpineBone.add(trapL, trapR);

  // Tailored Collar, V-Neck Shirt Front, Cravat/Tie & Brass Coat Buttons
  const shirtFront = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.036, 0.195, 12),
    shirtLinenMat
  );
  shirtFront.scale.set(1.12, 1.0, 0.36);
  shirtFront.position.set(0, 0.132, 0.142);
  thoracicSpineBone.add(shirtFront);

  // Silk Tie / Cravat Accent
  const cravatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.135, 0.014), accentMat);
  cravatMesh.position.set(0, 0.122, 0.156);
  thoracicSpineBone.add(cravatMesh);

  // Wrap-around Coat Collar Ring
  const coatCollarGeom = new THREE.TorusGeometry(0.078, 0.018, 10, 18, Math.PI * 1.35);
  const coatCollar = new THREE.Mesh(coatCollarGeom, outfitMat);
  coatCollar.rotation.x = Math.PI / 2 + 0.18;
  coatCollar.rotation.z = Math.PI * 0.825;
  coatCollar.position.set(0, 0.214, -0.004);
  thoracicSpineBone.add(coatCollar);

  const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.21, 0.02), accentMat);
  lapelL.position.set(-0.05, 0.122, 0.148);
  lapelL.rotation.z = -0.2;
  const lapelR = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.21, 0.02), accentMat);
  lapelR.position.set(0.05, 0.122, 0.148);
  lapelR.rotation.z = 0.2;
  thoracicSpineBone.add(lapelL, lapelR);

  for (let bIdx = 0; bIdx < 3; bIdx++) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10), brassMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, 0.028 - bIdx * 0.048, 0.152);
    thoracicSpineBone.add(btn);
  }

  // Bent spine kyphosis / dowager's hump mesh & draped wool shawl for elderly / bent-spine characters
  const curvatureDeg = appearance.spineCurvature !== undefined ? appearance.spineCurvature : (isElderly ? 38 : 0);
  if (curvatureDeg > 8 || isElderly) {
    const humpGeom = new THREE.SphereGeometry(0.145, 16, 12);
    humpGeom.scale(1.22, 0.95, 1.38);
    const humpMesh = new THREE.Mesh(humpGeom, shawlMat);
    humpMesh.position.set(0, 0.14, -0.075);
    humpMesh.castShadow = true;
    thoracicSpineBone.add(humpMesh);

    const shawlGeom = new THREE.CylinderGeometry(0.21, 0.25, 0.19, 20);
    shawlGeom.scale(1.12, 1.0, 0.88);
    const shawlMesh = new THREE.Mesh(shawlGeom, shawlMat);
    shawlMesh.position.set(0, 0.13, -0.01);
    shawlMesh.castShadow = true;
    thoracicSpineBone.add(shawlMesh);

    const brooch = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 12), brassMat);
    brooch.scale.set(1.2, 1.4, 0.5);
    brooch.position.set(0, 0.18, 0.16);
    thoracicSpineBone.add(brooch);
  }

  // C4 Cervical Neck Joint with Anatomical Sternocleidomastoid Taper & Clavicular Hollow
  const neckBone = new THREE.Group();
  neckBone.name = 'neckBone';
  neckBone.position.set(0, 0.215, 0);
  const neckPoints = [
    new THREE.Vector2(0.066 * anatomy.neckSlenderRatio, -0.012),
    new THREE.Vector2(0.055 * anatomy.neckSlenderRatio, 0.045),
    new THREE.Vector2(0.058 * anatomy.neckSlenderRatio, 0.105)
  ];
  const neckGeom = new THREE.LatheGeometry(neckPoints, 18);
  neckGeom.scale(0.96, 1.0, 0.94);
  const neckMesh = new THREE.Mesh(neckGeom, skinMat);
  neckBone.add(neckMesh);

  // ============================================================================
  // 3. NATURAL SCULPTED & RIGGED HUMAN HEAD & FACIAL ANATOMY
  // ============================================================================
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, 0.095, 0);
  const hs = appearance.headScale || 1.0;
  headGroup.scale.set(hs, hs, hs);

  // 3A. Organic Contoured Cranium & Upper Facial Skull (smooth Lathe profile from upper maxilla to crown)
  const skullProfilePoints = [
    new THREE.Vector2(0.012, 0.015),
    new THREE.Vector2(0.068 * anatomy.jawTaperRatio, 0.032),
    new THREE.Vector2(0.088 * anatomy.jawTaperRatio, 0.062),
    new THREE.Vector2(0.102 * anatomy.craniumWidthRatio, 0.098),
    new THREE.Vector2(0.108 * anatomy.craniumWidthRatio, 0.135),
    new THREE.Vector2(0.112 * anatomy.craniumWidthRatio, 0.172),
    new THREE.Vector2(0.102 * anatomy.craniumWidthRatio, 0.212 * anatomy.craniumHeightRatio),
    new THREE.Vector2(0.072 * anatomy.craniumWidthRatio, 0.242 * anatomy.craniumHeightRatio),
    new THREE.Vector2(0.0, 0.256 * anatomy.craniumHeightRatio)
  ];
  const faceSkullGeom = new THREE.LatheGeometry(skullProfilePoints, 28);
  faceSkullGeom.scale(1.0, 1.0, 1.05 * anatomy.craniumDepthRatio);
  const faceSkullMesh = new THREE.Mesh(faceSkullGeom, skinMat);
  faceSkullMesh.position.set(0, 0.0, 0.008);
  faceSkullMesh.castShadow = true;
  headGroup.add(faceSkullMesh);

  // Posterior Occipital Cranial Dome for natural back-of-head curvature
  const craniumGeom = new THREE.SphereGeometry(0.114, 24, 20);
  craniumGeom.scale(
    0.95 * anatomy.craniumWidthRatio,
    1.08 * anatomy.craniumHeightRatio,
    1.06 * anatomy.craniumDepthRatio
  );
  const skullMesh = new THREE.Mesh(craniumGeom, skinMat);
  skullMesh.position.set(0, 0.148, -0.012);
  skullMesh.castShadow = true;
  headGroup.add(skullMesh);

  // Smooth Forehead & Glabella Frontal Eminence
  const foreheadGeom = new THREE.SphereGeometry(0.086, 20, 16);
  foreheadGeom.scale(1.08 * anatomy.craniumWidthRatio, 0.78, 0.62);
  const foreheadMesh = new THREE.Mesh(foreheadGeom, skinMat);
  foreheadMesh.position.set(0, 0.176, 0.068);
  headGroup.add(foreheadMesh);

  // Sculpted Zygomatic Cheekbone Arches & Articulated Cheek Apples (elevate with cheekSquintRaise)
  const cheekAppleGeom = new THREE.SphereGeometry(0.042, 16, 14);
  cheekAppleGeom.scale(1.18 * anatomy.zygomaticWidthRatio, 0.86, 0.82);
  const cheekAppleL = new THREE.Mesh(cheekAppleGeom, skinMat);
  cheekAppleL.name = 'cheekAppleL';
  cheekAppleL.position.set(-0.056 * anatomy.zygomaticWidthRatio, 0.106, 0.082);
  const cheekAppleR = new THREE.Mesh(cheekAppleGeom, skinMat);
  cheekAppleR.name = 'cheekAppleR';
  cheekAppleR.position.set(0.056 * anatomy.zygomaticWidthRatio, 0.106, 0.082);
  headGroup.add(cheekAppleL, cheekAppleR);

  // Subtle Sub-Malar Cheek Contour (replaces harsh brown spheres with soft flush contour planes)
  const hollowGeom = new THREE.SphereGeometry(0.032, 14, 12);
  hollowGeom.scale(0.88, 1.05, 0.32);
  const cheekHollowL = new THREE.Mesh(hollowGeom, contourSkinMat);
  cheekHollowL.name = 'cheekHollowL';
  cheekHollowL.position.set(-0.064 * anatomy.zygomaticWidthRatio, 0.076, 0.072);
  cheekHollowL.rotation.y = -0.38;
  const cheekHollowR = new THREE.Mesh(hollowGeom, contourSkinMat);
  cheekHollowR.name = 'cheekHollowR';
  cheekHollowR.position.set(0.064 * anatomy.zygomaticWidthRatio, 0.076, 0.072);
  cheekHollowR.rotation.y = 0.38;
  headGroup.add(cheekHollowL, cheekHollowR);

  // Supraorbital Brow Ridge & Softly Contoured Orbital Eye Sockets
  const browRidgeGeom = new THREE.SphereGeometry(0.058, 18, 12);
  browRidgeGeom.scale(1.62, 0.36, 0.65);
  const browRidge = new THREE.Mesh(browRidgeGeom, skinMat);
  browRidge.position.set(0, 0.162, 0.082);
  headGroup.add(browRidge);

  const socketGeom = new THREE.SphereGeometry(0.029, 16, 12);
  socketGeom.scale(1.22, 0.94, 0.38);
  const socketL = new THREE.Mesh(socketGeom, contourSkinMat);
  socketL.position.set(-0.044, 0.135, 0.098);
  const socketR = new THREE.Mesh(socketGeom, contourSkinMat);
  socketR.position.set(0.044, 0.135, 0.098);
  headGroup.add(socketL, socketR);

  // 3B. Multi-Part Sculpted Anatomical Nose (Glabella Root, Nasal Dorsum Bridge, Tip, Columella, Philtrum & Rigged Alar Wings)
  const noseGroup = new THREE.Group();
  noseGroup.name = 'noseGroup';

  const noseBridgeGeom = new THREE.CylinderGeometry(0.0085, 0.0155, 0.054 * anatomy.noseBridgeLength, 14);
  noseBridgeGeom.scale(0.82, 1.0, 1.18);
  const noseBridge = new THREE.Mesh(noseBridgeGeom, skinMat);
  noseBridge.position.set(0, 0.125, 0.114);
  noseBridge.rotation.x = -0.26;

  // Rounded Nasal Tip (Apex nasi)
  const noseTipGeom = new THREE.SphereGeometry(0.0155 * anatomy.noseTipProjection, 16, 14);
  noseTipGeom.scale(1.06, 0.92, 1.12);
  const noseTip = new THREE.Mesh(noseTipGeom, skinMat);
  noseTip.position.set(0, 0.099, 0.129 * anatomy.noseTipProjection);

  // Nasal Columella (central septum bridge between nostrils)
  const columellaGeom = new THREE.CylinderGeometry(0.0055, 0.0065, 0.018, 10);
  const columella = new THREE.Mesh(columellaGeom, skinMat);
  columella.rotation.x = Math.PI / 2 - 0.25;
  columella.position.set(0, 0.091, 0.121);

  // Upper Lip Philtrum Groove (vertical anatomical dimple below nose)
  const philtrumGeom = new THREE.CylinderGeometry(0.0045, 0.0055, 0.018, 10);
  philtrumGeom.scale(1.1, 1.0, 0.45);
  const philtrum = new THREE.Mesh(philtrumGeom, contourSkinMat);
  philtrum.position.set(0, 0.079, 0.115);

  // Rigged Left & Right Alar Nostril Wings + Recessed Dark Nostril Apertures
  const nostrilWingGeom = new THREE.SphereGeometry(0.0108, 12, 10);
  nostrilWingGeom.scale(1.05, 0.85, 1.12);
  const nostrilApertureMat = new THREE.MeshBasicMaterial({ color: 0x291510 });
  const nostrilHoleGeom = new THREE.SphereGeometry(0.0048, 8, 8);
  nostrilHoleGeom.scale(0.85, 0.45, 1.1);

  const nostrilWingL = new THREE.Group();
  nostrilWingL.name = 'nostrilWingL';
  nostrilWingL.position.set(-0.0125, 0.095, 0.12);
  const wingMeshL = new THREE.Mesh(nostrilWingGeom, skinMat);
  const holeMeshL = new THREE.Mesh(nostrilHoleGeom, nostrilApertureMat);
  holeMeshL.position.set(0.002, -0.0055, 0.002);
  nostrilWingL.add(wingMeshL, holeMeshL);

  const nostrilWingR = new THREE.Group();
  nostrilWingR.name = 'nostrilWingR';
  nostrilWingR.position.set(0.0125, 0.095, 0.12);
  const wingMeshR = new THREE.Mesh(nostrilWingGeom, skinMat);
  const holeMeshR = new THREE.Mesh(nostrilHoleGeom, nostrilApertureMat);
  holeMeshR.position.set(-0.002, -0.0055, 0.002);
  nostrilWingR.add(wingMeshR, holeMeshR);

  noseGroup.add(noseBridge, noseTip, columella, philtrum, nostrilWingL, nostrilWingR);
  headGroup.add(noseGroup);

  // 3C. Multi-Part Sculpted Anatomical Ears (Outer Helix Rim, Concha Bowl, Tragus & Soft Earlobe)
  const buildSculptedEar = (side: -1 | 1): THREE.Group => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.104 * anatomy.craniumWidthRatio, 0.122, -0.006);
    earGroup.rotation.y = side * -0.24;
    earGroup.rotation.z = side * -0.06;
    earGroup.scale.setScalar(anatomy.earHelixScale);

    // Concha bowl base
    const conchaGeom = new THREE.SphereGeometry(0.026, 12, 10);
    conchaGeom.scale(0.38, 1.18, 0.76);
    const conchaMesh = new THREE.Mesh(conchaGeom, contourSkinMat);

    // Outer C-shaped Helix Rim
    const helixGeom = new THREE.TorusGeometry(0.021, 0.0058, 10, 18, Math.PI * 1.35);
    helixGeom.scale(0.82, 1.25, 0.75);
    const helixMesh = new THREE.Mesh(helixGeom, skinMat);
    helixMesh.rotation.y = Math.PI / 2;
    helixMesh.rotation.x = side === 1 ? -0.35 : Math.PI + 0.35;
    helixMesh.position.set(side * 0.003, 0.004, -0.002);

    // Soft Earlobe (Lobule)
    const lobeGeom = new THREE.SphereGeometry(0.0095, 10, 8);
    lobeGeom.scale(0.65, 1.15, 0.85);
    const lobeMesh = new THREE.Mesh(lobeGeom, skinMat);
    lobeMesh.position.set(side * 0.002, -0.024, 0.003);

    earGroup.add(conchaMesh, helixMesh, lobeMesh);
    return earGroup;
  };
  headGroup.add(buildSculptedEar(-1), buildSculptedEar(1));

  // 3D. Layered Volumetric Hairstyles (natural hairline, temple sweeps, nape volume & style silhouette)
  const hairStyle = appearance.hairStyle || (isElderly ? 'silver_bun' : 'swept_pompadour');
  const hairCapGeom = new THREE.SphereGeometry(0.119, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hairCapGeom.scale(
    0.98 * anatomy.craniumWidthRatio,
    1.09 * anatomy.craniumHeightRatio,
    1.08 * anatomy.craniumDepthRatio
  );
  const hairCap = new THREE.Mesh(hairCapGeom, hairMat);
  hairCap.position.set(0, 0.152, -0.012);
  headGroup.add(hairCap);

  // Nape & Sideburn Hair Volumes (frames the face naturally)
  const napeHairGeom = new THREE.SphereGeometry(0.088, 16, 12);
  napeHairGeom.scale(1.08, 0.92, 0.85);
  const napeHair = new THREE.Mesh(napeHairGeom, hairMat);
  napeHair.position.set(0, 0.112, -0.055);
  const sideburnGeom = new THREE.SphereGeometry(0.028, 10, 10);
  sideburnGeom.scale(0.42, 1.45, 0.88);
  const sideburnL = new THREE.Mesh(sideburnGeom, hairMat);
  sideburnL.position.set(-0.096 * anatomy.craniumWidthRatio, 0.145, 0.032);
  const sideburnR = new THREE.Mesh(sideburnGeom, hairMat);
  sideburnR.position.set(0.096 * anatomy.craniumWidthRatio, 0.145, 0.032);
  headGroup.add(napeHair, sideburnL, sideburnR);

  if (hairStyle === 'silver_bun') {
    const bunGeom = new THREE.SphereGeometry(0.074, 16, 14);
    const bunMesh = new THREE.Mesh(bunGeom, hairMat);
    bunMesh.position.set(0, 0.21, -0.118);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.185, 8), accentMat);
    pin.position.set(0, 0.215, -0.12);
    pin.rotation.z = 0.55;
    const templeSweepL = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 10), hairMat);
    templeSweepL.scale.set(0.48, 0.92, 1.25);
    templeSweepL.position.set(-0.088, 0.172, 0.032);
    templeSweepL.rotation.z = -0.25;
    const templeSweepR = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 10), hairMat);
    templeSweepR.scale.set(0.48, 0.92, 1.25);
    templeSweepR.position.set(0.088, 0.172, 0.032);
    templeSweepR.rotation.z = 0.25;
    headGroup.add(bunMesh, pin, templeSweepL, templeSweepR);
  } else if (hairStyle === 'permed_silver' || hairStyle === 'messy_curls') {
    const curlPositions = [
      [-0.068, 0.232, 0.045, 0.048],
      [-0.025, 0.246, 0.062, 0.052],
      [0.025, 0.248, 0.058, 0.054],
      [0.068, 0.232, 0.042, 0.048],
      [-0.052, 0.248, -0.015, 0.054],
      [0.0, 0.258, -0.012, 0.058],
      [0.052, 0.248, -0.015, 0.054],
      [-0.078, 0.195, 0.052, 0.042],
      [0.078, 0.195, 0.052, 0.042]
    ];
    for (const [cx, cy, cz, cr] of curlPositions) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 10), hairMat);
      curl.position.set(cx, cy, cz);
      headGroup.add(curl);
    }
  } else if (hairStyle === 'bob_cut') {
    const bobSideGeom = new THREE.SphereGeometry(0.058, 14, 12);
    bobSideGeom.scale(0.48, 1.38, 1.12);
    const bobL = new THREE.Mesh(bobSideGeom, hairMat);
    bobL.position.set(-0.095, 0.128, 0.018);
    bobL.rotation.z = 0.12;
    const bobR = new THREE.Mesh(bobSideGeom, hairMat);
    bobR.position.set(0.095, 0.128, 0.018);
    bobR.rotation.z = -0.12;
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.064, 14, 10), hairMat);
    fringe.scale.set(1.42, 0.45, 0.65);
    fringe.position.set(0, 0.208, 0.088);
    headGroup.add(bobL, bobR, fringe);
  } else if (hairStyle === 'bowler_hat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.018, 24), bootMat);
    brim.position.set(0, 0.238, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 14), bootMat);
    dome.position.set(0, 0.285, 0);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.024, 20), accentMat);
    ribbon.position.set(0, 0.252, 0);
    headGroup.add(brim, dome, ribbon);
  } else {
    // Swept Noir Pompadour with multi-wave sculpted crest
    const pompMain = new THREE.Mesh(new THREE.SphereGeometry(0.066, 16, 12), hairMat);
    pompMain.scale.set(1.38, 0.56, 0.85);
    pompMain.position.set(0.012, 0.224, 0.078);
    pompMain.rotation.z = -0.14;
    pompMain.rotation.x = -0.18;
    const pompWave = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), hairMat);
    pompWave.scale.set(1.25, 0.52, 0.95);
    pompWave.position.set(-0.038, 0.218, 0.058);
    pompWave.rotation.z = 0.22;
    headGroup.add(pompMain, pompWave);
  }

  // Spectacles / Wire-Frame Glasses (elderly or scholar/watchmaker)
  const hasGlasses = appearance.hasSpectacles ?? (isElderly || appearance.archetype === 'Occult Archivist');
  if (hasGlasses) {
    const specMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.18 });
    const lensGlassMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.3
    });
    const lensL = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.004, 10, 22), specMat);
    lensL.position.set(-0.044, 0.135, 0.122);
    const glassL = new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), lensGlassMat);
    glassL.position.set(-0.044, 0.135, 0.123);

    const lensR = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.004, 10, 22), specMat);
    lensR.position.set(0.044, 0.135, 0.122);
    const glassR = new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), lensGlassMat);
    glassR.position.set(0.044, 0.135, 0.123);

    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.034, 8), specMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.138, 0.122);
    headGroup.add(lensL, glassL, lensR, glassR, bridge);
  }

  // Subtle Weathered Noir Age Folds, Under-Eye Bags, Nasolabial Creases & Forehead Lines
  const underEyeBags = new THREE.Group();
  underEyeBags.name = 'underEyeBags';
  const bagL = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.034, 8), contourSkinMat);
  bagL.rotation.z = Math.PI / 2 + 0.12;
  bagL.position.set(-0.044, 0.114, 0.109);
  const bagR = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.034, 8), contourSkinMat);
  bagR.rotation.z = Math.PI / 2 - 0.12;
  bagR.position.set(0.044, 0.114, 0.109);

  const nasoL = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.002, 0.042, 8), contourSkinMat);
  nasoL.position.set(-0.031, 0.078, 0.112);
  nasoL.rotation.z = -0.42;
  const nasoR = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.002, 0.042, 8), contourSkinMat);
  nasoR.position.set(0.031, 0.078, 0.112);
  nasoR.rotation.z = 0.42;

  const worryCrease1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.068, 8), contourSkinMat);
  worryCrease1.rotation.z = Math.PI / 2;
  worryCrease1.position.set(0, 0.186, 0.106);
  const worryCrease2 = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.056, 8), contourSkinMat);
  worryCrease2.rotation.z = Math.PI / 2;
  worryCrease2.position.set(0, 0.196, 0.103);

  underEyeBags.add(bagL, bagR, nasoL, nasoR, worryCrease1, worryCrease2);
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

  // 3E. 4-Zone Articulated Eyebrows (Sculpted Medial Head, Arch & Tapered Lateral Tail)
  const browArchGeom = new THREE.CylinderGeometry(0.0042, 0.0055, 0.025, 10);
  browArchGeom.rotateZ(Math.PI / 2);
  browArchGeom.scale(1.0, 0.85, 0.72);
  const browTailGeom = new THREE.ConeGeometry(0.0046, 0.024, 10);
  browTailGeom.scale(1.0, 1.0, 0.72);

  const browPivotL = new THREE.Group();
  browPivotL.name = 'browPivotL';
  browPivotL.position.set(-0.044, 0.163 + facialRigParams.browHeight, 0.112);
  const browInnerL = new THREE.Mesh(browArchGeom, hairMat);
  browInnerL.name = 'browInnerL';
  browInnerL.position.set(0.010, facialRigParams.browInnerLiftL * 0.35, 0.002);
  browInnerL.rotation.z = -0.08;
  const browOuterL = new THREE.Mesh(browTailGeom, hairMat);
  browOuterL.name = 'browOuterL';
  browOuterL.position.set(-0.012, -0.002 + facialRigParams.browOuterLiftL * 0.35, -0.002);
  browOuterL.rotation.z = Math.PI / 2 + 0.22;
  browPivotL.add(browInnerL, browOuterL);
  browPivotL.rotation.z = facialRigParams.browRollL;

  const browPivotR = new THREE.Group();
  browPivotR.name = 'browPivotR';
  browPivotR.position.set(0.044, 0.163 + facialRigParams.browHeight + facialRigParams.browAsymmetry, 0.112);
  const browInnerR = new THREE.Mesh(browArchGeom, hairMat);
  browInnerR.name = 'browInnerR';
  browInnerR.position.set(-0.010, facialRigParams.browInnerLiftR * 0.35, 0.002);
  browInnerR.rotation.z = 0.08;
  const browOuterR = new THREE.Mesh(browTailGeom, hairMat);
  browOuterR.name = 'browOuterR';
  browOuterR.position.set(0.012, -0.002 + facialRigParams.browOuterLiftR * 0.35, -0.002);
  browOuterR.rotation.z = -Math.PI / 2 - 0.22;
  browPivotR.add(browInnerR, browOuterR);
  browPivotR.rotation.z = facialRigParams.browRollR;

  headGroup.add(browPivotL, browPivotR);

  // 3F. Deep Lifelike Eyes: Glossy Sclera, Procedural Fibrous Iris, Dilating Pupil, Corneal Specular Glints, Curved Upper/Lower Eyelids & Eyelashes
  const scleraMat = new THREE.MeshPhysicalMaterial({
    color: 0xfafaf9,
    roughness: 0.12,
    metalness: 0.02,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08
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
    emissiveIntensity: appearance.eyeStyle === 'hollow_glow' ? 0.65 : 0.0,
    roughness: 0.14,
    clearcoat: 0.92,
    clearcoatRoughness: 0.06
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050507 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const caruncleMat = new THREE.MeshStandardMaterial({ color: 0xe17c76, roughness: 0.38 });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x181311, roughness: 0.65 });

  // Curved Hemispherical Upper & Lower Eyelid Geometries (hug the spherical eyeball organically)
  const upperLidGeom = new THREE.SphereGeometry(0.0205, 16, 10, 0, Math.PI, 0, Math.PI * 0.46);
  upperLidGeom.scale(1.18, 0.95, 0.68);
  const lowerLidGeom = new THREE.SphereGeometry(0.0202, 16, 10, 0, Math.PI, Math.PI * 0.62, Math.PI * 0.38);
  lowerLidGeom.scale(1.16, 0.92, 0.66);
  const eyelashGeom = new THREE.TorusGeometry(0.0195, 0.0022, 6, 16, Math.PI * 0.78);
  eyelashGeom.scale(1.16, 0.72, 0.68);

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
    eyeGroup.position.set(side * 0.044, 0.135, 0.104);

    // Medial Lacrimal Caruncle (pink tear-duct corner)
    const caruncle = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 8, 8), caruncleMat);
    caruncle.position.set(side * -0.018, -0.001, 0.006);
    eyeGroup.add(caruncle);

    // Spherical Eyeball Sclera
    const scleraMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0185, 18, 16), scleraMat);
    scleraMesh.scale.set(1.14, 0.96, 0.64);

    // Articulated Iris + Dilating Pupil + Dual Corneal Catchlight Glints
    const irisGroup = new THREE.Group();
    irisGroup.name = irisName;
    irisGroup.position.set(facialRigParams.eyeGazeX, facialRigParams.eyeGazeY, 0.0112);

    const irisMesh = new THREE.Mesh(new THREE.CircleGeometry(0.0102, 20), irisMat);
    const pupilMesh = new THREE.Mesh(new THREE.CircleGeometry(0.0046, 16), pupilMat);
    pupilMesh.name = pupilName;
    pupilMesh.position.set(0, 0, 0.0006);
    pupilMesh.scale.setScalar(facialRigParams.pupilDilation);

    const glintGroup = new THREE.Group();
    glintGroup.name = glintName;
    const primaryGlint = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 10), glintMat);
    primaryGlint.position.set(0.0032, 0.0034, 0.0012);
    const secondaryGlint = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 8), glintMat);
    secondaryGlint.position.set(-0.0034, -0.0028, 0.0012);
    glintGroup.add(primaryGlint, secondaryGlint);

    irisGroup.add(irisMesh, pupilMesh, glintGroup);

    // Curved Upper Eyelid & Tapered Eyelash Fringe
    const upperLid = new THREE.Mesh(upperLidGeom, contourSkinMat);
    upperLid.name = upperLidName;
    upperLid.position.set(0, 0.002 - facialRigParams.upperLidDroop, 0.001);

    const eyelash = new THREE.Mesh(eyelashGeom, lashMat);
    eyelash.name = lashName;
    eyelash.rotation.z = Math.PI * 0.11;
    eyelash.position.set(0, 0.005, 0.011);
    upperLid.add(eyelash);

    // Curved Lower Eyelid (rises with lowerLidSquint)
    const lowerLid = new THREE.Mesh(lowerLidGeom, skinMat);
    lowerLid.name = lowerLidName;
    lowerLid.position.set(0, -0.002 + facialRigParams.lowerLidSquint * 0.004, 0.001);

    eyeGroup.add(scleraMesh, irisGroup, upperLid, lowerLid);
    eyeGroup.scale.y = Math.max(0.18, facialRigParams.eyeAperture * (1 - facialRigParams.blinkAmount * 0.88));

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

  // 3G. Sculpted Upper Lip (Cupid's Bow Vermilion), Oral Cavity, Teeth, Tongue & Articulated TMJ Mandible (`jawPivot`)
  // Upper Lip Group sits on the maxillary upper face (lifts with upperLipLift and narrows with lipPucker)
  const upperLipGroup = new THREE.Group();
  upperLipGroup.name = 'upperLipGroup';
  upperLipGroup.position.set(0, 0.068 + facialRigParams.upperLipLift * 0.005, 0.114);

  // Central Cupid's Bow Tubercle + Left/Right Vermilion Wings
  const tubercleGeom = new THREE.SphereGeometry(0.0068 * anatomy.upperLipCupidBowDepth, 12, 10);
  tubercleGeom.scale(1.15, 0.78, 0.92);
  const tubercleMesh = new THREE.Mesh(tubercleGeom, mouthMat);
  tubercleMesh.position.set(0, -0.0008, 0.003);

  const upperWingGeom = new THREE.CylinderGeometry(0.0032, 0.0058 * anatomy.upperLipCupidBowDepth, 0.025, 12);
  upperWingGeom.rotateZ(Math.PI / 2);
  upperWingGeom.scale(1.0, 0.82, 0.85);
  const upperLipWingL = new THREE.Mesh(upperWingGeom, mouthMat);
  upperLipWingL.position.set(-0.012, 0.0008, 0.0005);
  upperLipWingL.rotation.z = 0.14;
  upperLipWingL.rotation.y = -0.22;

  const upperLipWingR = new THREE.Mesh(upperWingGeom, mouthMat);
  upperLipWingR.position.set(0.012, 0.0008, 0.0005);
  upperLipWingR.rotation.z = -0.14;
  upperLipWingR.rotation.y = 0.22;

  upperLipGroup.add(tubercleMesh, upperLipWingL, upperLipWingR);
  headGroup.add(upperLipGroup);

  // Articulated TMJ Mandible & Lower Face Rig (`jawPivot`)
  const jawPivot = new THREE.Group();
  jawPivot.name = 'jawPivot';
  jawPivot.position.set(0, 0.052 - facialRigParams.jawDrop, 0.048);
  jawPivot.rotation.x = facialRigParams.jawPitchRad * 0.35;

  // Sculpted Mandibular Jawline Rami (Left & Right) + Contoured Chin Boss (Mental Protuberance)
  const jawRamusGeom = new THREE.CylinderGeometry(0.024, 0.032, 0.072, 12);
  jawRamusGeom.scale(0.68, 1.0, 0.88);
  const jawlineL = new THREE.Mesh(jawRamusGeom, skinMat);
  jawlineL.position.set(-0.042 * anatomy.jawTaperRatio, -0.008, 0.018);
  jawlineL.rotation.z = -0.58;
  jawlineL.rotation.x = 0.42;
  const jawlineR = new THREE.Mesh(jawRamusGeom, skinMat);
  jawlineR.position.set(0.042 * anatomy.jawTaperRatio, -0.008, 0.018);
  jawlineR.rotation.z = 0.58;
  jawlineR.rotation.x = 0.42;

  const chinGeom = new THREE.SphereGeometry(0.029 * anatomy.chinProminence, 16, 14);
  chinGeom.scale(1.18, 0.88, 1.02);
  const chinMesh = new THREE.Mesh(chinGeom, skinMat);
  chinMesh.position.set(0, -0.019, 0.052);
  jawPivot.add(jawlineL, jawlineR, chinMesh);

  // Sculpted Lower Lip Group (full vermilion cushion attached to mandible)
  const lowerLipGroup = new THREE.Group();
  lowerLipGroup.name = 'lowerLipGroup';
  lowerLipGroup.position.set(0, 0.008 - facialRigParams.lowerLipDepress * 0.005, 0.065);

  const lowerLipCenterGeom = new THREE.SphereGeometry(0.0082 * anatomy.lowerLipFullness, 14, 12);
  lowerLipCenterGeom.scale(1.75, 0.72, 0.88);
  const lowerLipCenter = new THREE.Mesh(lowerLipCenterGeom, mouthMat);
  const lowerWingGeom = new THREE.CylinderGeometry(0.0028, 0.0052 * anatomy.lowerLipFullness, 0.018, 10);
  lowerWingGeom.rotateZ(Math.PI / 2);
  const lowerWingL = new THREE.Mesh(lowerWingGeom, mouthMat);
  lowerWingL.position.set(-0.015, 0.0015, -0.002);
  lowerWingL.rotation.z = -0.18;
  const lowerWingR = new THREE.Mesh(lowerWingGeom, mouthMat);
  lowerWingR.position.set(0.015, 0.0015, -0.002);
  lowerWingR.rotation.z = 0.18;
  lowerLipGroup.add(lowerLipCenter, lowerWingL, lowerWingR);
  jawPivot.add(lowerLipGroup);

  // Central Lip Seam / Expression Line (`mouthMesh` preserved for rig compatibility)
  const mouthMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.048, 12), mouthMat);
  mouthMesh.name = 'mouthMesh';
  mouthMesh.geometry.rotateZ(Math.PI / 2);
  mouthMesh.position.set(0, 0.012, 0.065);
  mouthMesh.rotation.z = facialRigParams.mouthCornerAngle + facialRigParams.mouthAsymmetry;
  jawPivot.add(mouthMesh);

  // Articulated Left & Right Lip Commissure Corners
  const lipCornerL = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 10, 10), mouthMat);
  lipCornerL.name = 'lipCornerL';
  lipCornerL.position.set(-0.025, 0.012 + facialRigParams.lipCornerPullL, 0.061);
  const lipCornerR = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 10, 10), mouthMat);
  lipCornerR.name = 'lipCornerR';
  lipCornerR.position.set(0.025, 0.012 + facialRigParams.lipCornerPullR, 0.061);
  jawPivot.add(lipCornerL, lipCornerR);

  // Recessed Oral Cavity, Dental Arches (Teeth) & Tongue (visible when speaking or jaw drops)
  const mouthOpening = new THREE.Group();
  mouthOpening.name = 'mouthOpening';
  mouthOpening.position.set(0, 0.012, 0.059);

  const cavityBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x1a0908 })
  );
  cavityBack.scale.set(1.12, 0.55, 0.35);

  const teethMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.25 });
  const upperTeethMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, 0.006, 12, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    teethMat
  );
  upperTeethMesh.name = 'upperTeethMesh';
  upperTeethMesh.position.set(0, 0.0055, -0.011);

  const lowerTeethMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.0055, 12, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    teethMat
  );
  lowerTeethMesh.name = 'lowerTeethMesh';
  lowerTeethMesh.position.set(0, -0.0055, -0.011);

  const tongueMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.011, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc95b63, roughness: 0.45 })
  );
  tongueMesh.name = 'tongueMesh';
  tongueMesh.scale.set(1.15, 0.48, 1.1);
  tongueMesh.position.set(0, -0.0035, -0.002);
  tongueMesh.visible = facialRigParams.tongueVisible > 0.05;

  mouthOpening.add(cavityBack, upperTeethMesh, lowerTeethMesh, tongueMesh);
  mouthOpening.scale.set(1 - facialRigParams.lipPucker * 0.28, Math.max(0.05, facialRigParams.mouthAperture), 1);
  jawPivot.add(mouthOpening);

  headGroup.add(jawPivot);
  neckBone.add(headGroup);
  thoracicSpineBone.add(neckBone);

  // ============================================================================
  // 4. CONTOURED ARMS, HANDS, LEGS & SHOES
  // ============================================================================
  const buildArmChain = (side: -1 | 1) => {
    const isLeft = side === -1;
    const clavicleBone = new THREE.Group();
    clavicleBone.name = isLeft ? 'leftClavicleBone' : 'rightClavicleBone';
    clavicleBone.position.set(side * 0.198 * anatomy.shoulderBreadthRatio, 0.185, 0);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), outfitMat);
    shoulderCap.scale.set(1.04, 1.14, 0.96);
    clavicleBone.add(shoulderCap);

    const upperArmBone = new THREE.Group();
    upperArmBone.name = isLeft ? 'leftUpperArmBone' : 'rightUpperArmBone';
    const upperArmPoints = [
      new THREE.Vector2(0.039, -0.22),
      new THREE.Vector2(0.045, -0.11),
      new THREE.Vector2(0.049, 0.0)
    ];
    const upperArmMesh = new THREE.Mesh(new THREE.LatheGeometry(upperArmPoints, 14), outfitMat);
    upperArmMesh.castShadow = true;
    upperArmBone.add(upperArmMesh);

    const elbowBone = new THREE.Group();
    elbowBone.name = isLeft ? 'leftElbowBone' : 'rightElbowBone';
    elbowBone.position.set(0, -0.22, 0);
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), outfitMat);
    elbowBone.add(elbowJoint);

    const forearmBone = new THREE.Group();
    forearmBone.name = isLeft ? 'leftForearmBone' : 'rightForearmBone';
    const forearmPoints = [
      new THREE.Vector2(0.031, -0.195),
      new THREE.Vector2(0.039, -0.085),
      new THREE.Vector2(0.041, 0.0)
    ];
    const forearmMesh = new THREE.Mesh(new THREE.LatheGeometry(forearmPoints, 14), outfitMat);
    forearmMesh.castShadow = true;
    const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.035, 0.026, 14), shirtLinenMat);
    wristCuff.position.set(0, -0.188, 0);
    forearmBone.add(forearmMesh, wristCuff);

    const handBone = new THREE.Group();
    handBone.name = isLeft ? 'leftHandBone' : 'rightHandBone';
    handBone.position.set(0, -0.205, 0);

    // Sculpted Organic Hand: Rounded Palm, Individual Tapered Fingers & Opposable Thumb
    const palmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), skinMat);
    palmMesh.scale.set(0.68, 1.12, 0.96);
    handBone.add(palmMesh);

    for (let f = 0; f < 4; f++) {
      const zOff = (f - 1.5) * 0.011;
      const len = f === 1 || f === 2 ? 0.038 : 0.033;
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0042, len, 8), skinMat);
      finger.position.set(side * -0.003, -0.028 - len * 0.35, zOff);
      finger.rotation.z = side * 0.08;
      handBone.add(finger);
    }

    const thumbMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0055, 0.03, 8), skinMat);
    thumbMesh.position.set(side * -0.012, -0.012, 0.022);
    thumbMesh.rotation.x = 0.48;
    thumbMesh.rotation.z = side * -0.25;
    handBone.add(thumbMesh);

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

  const caneShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.011, 0.84, 10), caneWoodMat);
  caneShaft.position.set(0, -0.39, 0);
  caneShaft.castShadow = true;
  const crookGeom = new THREE.TorusGeometry(0.048, 0.015, 10, 18, Math.PI);
  const crookMesh = new THREE.Mesh(crookGeom, brassMat);
  crookMesh.position.set(0.038, 0.038, 0);
  crookMesh.rotation.z = Math.PI / 2;
  const brassCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.028, 10), brassMat);
  brassCollar.position.set(0, 0.01, 0);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.055, 10), bootMat);
  ferrule.position.set(0, -0.80, 0);
  caneGroup.add(caneShaft, crookMesh, brassCollar, ferrule);
  rightHandBone.add(caneGroup);

  // Assemble Multi-Segment Spine Hierarchy: Pelvis -> L1 Lumbar -> T6 Lower Thoracic -> T1 Upper Thoracic
  lowerThoracicBone.add(thoracicSpineBone);
  lumbarSpineBone.add(lowerThoracicBone);
  pelvisBone.add(lumbarSpineBone);

  // Contoured Legs & Sculpted Oxford Shoes
  const buildLegChain = (side: -1 | 1) => {
    const isLeft = side === -1;
    const hipBone = new THREE.Group();
    hipBone.name = isLeft ? 'leftHipBone' : 'rightHipBone';
    hipBone.position.set(side * 0.102 * anatomy.hipFlareRatio, -0.055, 0);
    const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), trouserMat);
    hipBone.add(hipJoint);

    const thighBone = new THREE.Group();
    thighBone.name = isLeft ? 'leftThighBone' : 'rightThighBone';
    const thighPoints = [
      new THREE.Vector2(0.052, -0.38),
      new THREE.Vector2(0.064, -0.18),
      new THREE.Vector2(0.069, 0.0)
    ];
    const thighMesh = new THREE.Mesh(new THREE.LatheGeometry(thighPoints, 16), trouserMat);
    thighMesh.castShadow = true;
    thighBone.add(thighMesh);

    const kneeBone = new THREE.Group();
    kneeBone.name = isLeft ? 'leftKneeBone' : 'rightKneeBone';
    kneeBone.position.set(0, -0.38, 0);
    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), trouserMat);
    kneeBone.add(kneeJoint);

    const calfBone = new THREE.Group();
    calfBone.name = isLeft ? 'leftCalfBone' : 'rightCalfBone';
    const calfPoints = [
      new THREE.Vector2(0.037, -0.36),
      new THREE.Vector2(0.054, -0.14),
      new THREE.Vector2(0.051, 0.0)
    ];
    const calfMesh = new THREE.Mesh(new THREE.LatheGeometry(calfPoints, 16), trouserMat);
    calfMesh.castShadow = true;
    calfBone.add(calfMesh);

    const footBone = new THREE.Group();
    footBone.name = isLeft ? 'leftFootBone' : 'rightFootBone';
    footBone.position.set(0, -0.36, 0);

    // Sculpted Oxford Shoe: Ankle Collar, Contoured Vamp, Rounded Toe Box & Heel
    const shoeVamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.165, 14), bootMat);
    shoeVamp.rotation.x = Math.PI / 2;
    shoeVamp.scale.set(1.06, 1.0, 0.72);
    shoeVamp.position.set(0, -0.032, 0.036);
    shoeVamp.castShadow = true;

    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), bootMat);
    toeCap.scale.set(1.04, 0.68, 1.12);
    toeCap.position.set(0, -0.035, 0.112);

    const shoeHeel = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.028, 0.062), bootMat);
    shoeHeel.position.set(0, -0.052, -0.016);
    footBone.add(shoeVamp, toeCap, shoeHeel);

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
      facial.browPivotL.position.y = 0.163 + facialParams.browHeight;
      facial.browPivotL.rotation.z = facialParams.browRollL ?? -facialParams.browFurrow * 0.28;
    }
    if (facial.browPivotR) {
      facial.browPivotR.position.y = 0.163 + facialParams.browHeight + (facialParams.browAsymmetry || 0) * 0.04;
      facial.browPivotR.rotation.z =
        facialParams.browRollR ?? facialParams.browFurrow * 0.28 + (facialParams.browAsymmetry || 0) * 0.45;
    }
    if (facial.browInnerL && facialParams.browInnerLiftL !== undefined) {
      facial.browInnerL.position.y = facialParams.browInnerLiftL * 0.35;
    }
    if (facial.browInnerR && facialParams.browInnerLiftR !== undefined) {
      facial.browInnerR.position.y = facialParams.browInnerLiftR * 0.35;
    }
    if (facial.browOuterL && facialParams.browOuterLiftL !== undefined) {
      facial.browOuterL.position.y = -0.002 + facialParams.browOuterLiftL * 0.35;
    }
    if (facial.browOuterR && facialParams.browOuterLiftR !== undefined) {
      facial.browOuterR.position.y = -0.002 + facialParams.browOuterLiftR * 0.35;
    }

    // 4B. Eyes, Physiological Blink, Upper Lid Droop, Lower Lid Squint, Saccades & Pupil Dilation
    const blinkFactor = 1 - (facialParams.blinkAmount || 0) * 0.88;
    if (facial.eyeL) {
      facial.eyeL.scale.y = Math.max(0.12, (facialParams.eyeAperture + (facialParams.eyelidTremor || 0) * 0.08) * blinkFactor);
    }
    if (facial.eyeR) {
      facial.eyeR.scale.y = Math.max(0.12, (facialParams.eyeAperture - (facialParams.eyelidTremor || 0) * 0.05) * blinkFactor);
    }
    if (facial.upperLidL) {
      facial.upperLidL.position.y = 0.002 - (facialParams.upperLidDroop || 0) - (facialParams.blinkAmount || 0) * 0.006;
    }
    if (facial.upperLidR) {
      facial.upperLidR.position.y = 0.002 - (facialParams.upperLidDroop || 0) - (facialParams.blinkAmount || 0) * 0.006;
    }
    if (facial.lowerLidL) {
      facial.lowerLidL.position.y = -0.002 + (facialParams.lowerLidSquint || 0) * 0.0045;
    }
    if (facial.lowerLidR) {
      facial.lowerLidR.position.y = -0.002 + (facialParams.lowerLidSquint || 0) * 0.0045;
    }
    if (facial.irisGroupL) {
      facial.irisGroupL.position.x = facialParams.eyeGazeX || 0;
      facial.irisGroupL.position.y = facialParams.eyeGazeY || 0;
    }
    if (facial.irisGroupR) {
      facial.irisGroupR.position.x = facialParams.eyeGazeX || 0;
      facial.irisGroupR.position.y = facialParams.eyeGazeY || 0;
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
      facial.nostrilWingL.position.x = -0.0125 - flare * 0.0028;
      facial.nostrilWingR.position.x = 0.0125 + flare * 0.0028;
      const wingScale = 1 + flare * 0.22;
      facial.nostrilWingL.scale.set(wingScale, 1, wingScale);
      facial.nostrilWingR.scale.set(wingScale, 1, wingScale);
    }
    if (facial.cheekAppleL && facial.cheekAppleR) {
      const raise = facialParams.cheekSquintRaise || 0;
      facial.cheekAppleL.position.y = 0.106 + raise * 0.0065;
      facial.cheekAppleR.position.y = 0.106 + raise * 0.0065;
    }

    // 4D. TMJ Mandible Hinge, Cupid's Bow Upper/Lower Lips, Lip Corners & Oral Cavity
    const puckerScaleX = 1 - (facialParams.lipPucker || 0) * 0.28;
    if (facial.upperLipGroup) {
      facial.upperLipGroup.position.y = 0.068 + (facialParams.upperLipLift || 0) * 0.005;
      facial.upperLipGroup.scale.x = puckerScaleX;
    }
    if (facial.jawPivot) {
      facial.jawPivot.position.y = 0.052 - facialParams.jawDrop;
      facial.jawPivot.position.x = facialParams.jawLateralShift || 0;
      facial.jawPivot.rotation.x = (facialParams.jawPitchRad || 0) * 0.35;
    }
    if (facial.lowerLipGroup) {
      facial.lowerLipGroup.position.y = 0.008 - (facialParams.lowerLipDepress || 0) * 0.005;
      facial.lowerLipGroup.scale.x = puckerScaleX;
    }
    if (facial.mouthMesh) {
      facial.mouthMesh.rotation.z = facialParams.mouthCornerAngle + (facialParams.mouthAsymmetry || 0);
      facial.mouthMesh.scale.x = puckerScaleX;
    }
    if (facial.lipCornerL) {
      facial.lipCornerL.position.x = -0.025 * puckerScaleX;
      facial.lipCornerL.position.y =
        0.012 + (facialParams.lipCornerPullL ?? -(facialParams.mouthAsymmetry || 0) * 0.04);
    }
    if (facial.lipCornerR) {
      facial.lipCornerR.position.x = 0.025 * puckerScaleX;
      facial.lipCornerR.position.y =
        0.012 + (facialParams.lipCornerPullR ?? (facialParams.mouthAsymmetry || 0) * 0.04);
    }
    if (facial.mouthOpening) {
      facial.mouthOpening.scale.x = puckerScaleX;
      facial.mouthOpening.scale.y = Math.max(0.05, facialParams.mouthAperture);
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

import { type AssetCategory, type CompositeSubPart, type FloorId, GRID_TILE_COUNT, type PlacedAsset, type TexturePresetId, snapToGrid } from './coreTypesAndFloors';
import { type EditorWorkspaceModeId, getTaskbarWindowIdsForMode } from './catalogVoiceAndSets';

/**
 * ============================================================================
 * ROOM BLUEPRINT LIBRARY SYSTEM (Save & Load Entire Room Layouts as JSON)
 * ============================================================================
 */
export interface RoomBlueprintItem {
  name: string;
  category: AssetCategory;
  subType: string;
  relPosition: [number, number, number]; // [dx, y, dz] relative to room blueprint center
  dimensions: [number, number, number];
  rotationY: number;
  color: string;
  textureId: TexturePresetId;
  isSecretPassage?: boolean;
  isOpen?: boolean;
  isActivated?: boolean;
  collidable: boolean;
  compositeParts?: CompositeSubPart[];
  isLightEmitting?: boolean;
  emissionIntensity?: number;
  lightIntensity?: number;
  lightingPreset?: string;
  customAnimationFps?: number;
}

export interface TopDownRoomPreviewItem {
  name: string;
  category: AssetCategory;
  cx: number;
  cy: number;
  width: number;
  depth: number;
  rotationDeg: number;
  fillColor: string;
  strokeColor: string;
  isWall: boolean;
  isDoor: boolean;
  isSecretPassage: boolean;
  zOrder: number;
}

export interface TopDownRoomPreviewSpec {
  viewBoxWidth: number;
  viewBoxHeight: number;
  roomSpanX: number;
  roomSpanZ: number;
  items: TopDownRoomPreviewItem[];
  svgMarkup: string;
  dataUrl: string;
}

export interface RoomBlueprint {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  tags: string[];
  boundingSize: [number, number]; // [widthSpanX, depthSpanZ]
  items: RoomBlueprintItem[];
  previewThumbnailUrl?: string;
  topDownPreview?: TopDownRoomPreviewSpec;
}

/**
 * Pure helper for Character Creator mouse scroll wheel zoom:
 * - Scroll forward (deltaY < 0) = Zoom In (camera moves closer, smaller distance down to 1.2m)
 * - Scroll backward (deltaY > 0) = Zoom Out (camera moves farther, larger distance up to 7.0m)
 */
export function computeCharacterCreatorWheelZoom(
  currentZoom: number | undefined,
  deltaY: number,
  deltaMode = 0
): number {
  const baseZoom =
    typeof currentZoom === 'number' && Number.isFinite(currentZoom) ? currentZoom : 3.45;
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return Number(Math.max(1.2, Math.min(7.0, baseZoom)).toFixed(2));
  }
  const sign = deltaY > 0 ? 1 : -1;
  // Normalize across pixel (0), line (1), and page (2) wheel delta modes
  const normalizedPixels =
    deltaMode === 1 ? Math.abs(deltaY) * 36 : deltaMode === 2 ? Math.abs(deltaY) * 320 : Math.abs(deltaY);
  const magnitude = Math.max(0.2, Math.min(0.85, normalizedPixels * 0.0032));
  const nextZoom = Math.max(1.2, Math.min(7.0, baseZoom + sign * magnitude));
  return Number(nextZoom.toFixed(2));
}

export interface CharacterCreatorCursorZoomState {
  cameraZoom: number;
  cameraTargetX: number;
  cameraTargetY: number;
  cursorWorldX: number;
  cursorWorldY: number;
}

/**
 * Pure helper for Character Creator mouse-cursor-relative scroll wheel zoom:
 * - Computes `cameraZoom` from `deltaY` and `deltaMode`.
 * - Unprojects `(cursorNdcX, cursorNdcY)` onto the `z = 0` character focal plane using the
 *   viewport camera's exact vertical FOV (`fovDeg = 55` deg) and aspect ratio (`aspect`),
 *   keeping the 3D world point `(cursorWorldX, cursorWorldY)` pinned directly beneath the
 *   mouse cursor when zooming in, and smoothly re-centering toward `(0, 0.68)` when zooming out.
 */
export function computeCharacterCreatorCursorZoomState(
  current: {
    cameraZoom?: number;
    cameraTargetX?: number;
    cameraTargetY?: number;
  },
  deltaY: number,
  deltaMode = 0,
  cursorNdcX = 0,
  cursorNdcY = 0,
  aspect = 1.6,
  fovDeg = 55
): CharacterCreatorCursorZoomState {
  const prevZoom =
    typeof current.cameraZoom === 'number' && Number.isFinite(current.cameraZoom)
      ? Math.max(1.2, Math.min(7.0, current.cameraZoom))
      : 3.45;
  const prevTargetX =
    typeof current.cameraTargetX === 'number' && Number.isFinite(current.cameraTargetX)
      ? current.cameraTargetX
      : 0;
  const prevTargetY =
    typeof current.cameraTargetY === 'number' && Number.isFinite(current.cameraTargetY)
      ? current.cameraTargetY
      : 0.68;

  const nextZoom = computeCharacterCreatorWheelZoom(prevZoom, deltaY, deltaMode);
  const clampedNdcX = Math.max(-1, Math.min(1, Number.isFinite(cursorNdcX) ? cursorNdcX : 0));
  const clampedNdcY = Math.max(-1, Math.min(1, Number.isFinite(cursorNdcY) ? cursorNdcY : 0));
  const safeAspect = Math.max(0.5, Math.min(3.5, Number.isFinite(aspect) && aspect > 0 ? aspect : 1.6));
  const safeFovDeg = Math.max(20, Math.min(110, Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : 55));

  // Perspective camera half-frustum tangent for 55 deg FOV: tan(27.5 deg) ≈ 0.520567
  const tanHalfFov = Math.tan((safeFovDeg * 0.5 * Math.PI) / 180);

  // Exact 3D world point on the z = 0 character plane directly under the mouse cursor before zoom step
  const cursorWorldX = Number(
    (prevTargetX + clampedNdcX * prevZoom * tanHalfFov * safeAspect).toFixed(4)
  );
  const cursorWorldY = Number(
    (prevTargetY + clampedNdcY * prevZoom * tanHalfFov).toFixed(4)
  );

  if (nextZoom < prevZoom) {
    // Zooming IN: solve nextTarget so (cursorWorldX, cursorWorldY) remains at exact (clampedNdcX, clampedNdcY)
    const exactTargetX = cursorWorldX - clampedNdcX * nextZoom * tanHalfFov * safeAspect;
    const exactTargetY = cursorWorldY - clampedNdcY * nextZoom * tanHalfFov;
    const nextTargetX = Math.max(-3.2, Math.min(3.2, Number(exactTargetX.toFixed(4))));
    const nextTargetY = Math.max(-1.2, Math.min(2.8, Number(exactTargetY.toFixed(4))));
    return {
      cameraZoom: nextZoom,
      cameraTargetX: nextTargetX,
      cameraTargetY: nextTargetY,
      cursorWorldX,
      cursorWorldY
    };
  }

  if (nextZoom > prevZoom) {
    // Zooming OUT: anchor around cursor while smoothly blending back toward default center (0, 0.68)
    const cursorOutX = cursorWorldX - clampedNdcX * nextZoom * tanHalfFov * safeAspect;
    const cursorOutY = cursorWorldY - clampedNdcY * nextZoom * tanHalfFov;
    const tCenter = Math.min(1, (nextZoom - prevZoom) / Math.max(0.35, 3.45 - prevZoom));
    const blend = Math.min(1, tCenter * 0.55);
    const blendedX = cursorOutX * (1 - blend);
    const blendedY = cursorOutY + (0.68 - cursorOutY) * blend;
    return {
      cameraZoom: nextZoom,
      cameraTargetX: Math.max(-3.2, Math.min(3.2, Number(blendedX.toFixed(4)))),
      cameraTargetY: Math.max(-1.2, Math.min(2.8, Number(blendedY.toFixed(4)))),
      cursorWorldX,
      cursorWorldY
    };
  }

  return {
    cameraZoom: nextZoom,
    cameraTargetX: Number(prevTargetX.toFixed(4)),
    cameraTargetY: Number(prevTargetY.toFixed(4)),
    cursorWorldX,
    cursorWorldY
  };
}

function escapeXmlAttr(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a top-down 2D architectural floorplan visual preview (SVG markup + data URL)
 * capturing the exact spatial layout ([x, z], dimensions, rotation, walls, doors, secret passages, and furniture)
 * of a RoomBlueprint when saved or displayed in the 'Recent' & Room Blueprints Library.
 */
export function generateTopDownRoomBlueprintPreview(
  itemsOrBlueprint: RoomBlueprintItem[] | RoomBlueprint,
  boundingSize?: [number, number],
  title?: string
): TopDownRoomPreviewSpec {
  const viewBoxWidth = 160;
  const viewBoxHeight = 112;
  const pad = 14;
  const isBlueprintObj =
    Boolean(itemsOrBlueprint) &&
    !Array.isArray(itemsOrBlueprint) &&
    typeof itemsOrBlueprint === 'object' &&
    Array.isArray((itemsOrBlueprint as RoomBlueprint).items);
  const safeItems = Array.isArray(itemsOrBlueprint)
    ? itemsOrBlueprint
    : isBlueprintObj
    ? (itemsOrBlueprint as RoomBlueprint).items
    : [];
  const resolvedBoundingSize = isBlueprintObj
    ? (itemsOrBlueprint as RoomBlueprint).boundingSize
    : boundingSize;
  const resolvedTitle =
    typeof title === 'string'
      ? title
      : isBlueprintObj
      ? (itemsOrBlueprint as RoomBlueprint).name
      : 'TOP-DOWN PLAN';

  let minX = -2.5;
  let maxX = 2.5;
  let minZ = -2.5;
  let maxZ = 2.5;

  if (safeItems.length > 0) {
    minX = Infinity;
    maxX = -Infinity;
    minZ = Infinity;
    maxZ = -Infinity;
    for (const it of safeItems) {
      const rx = Number(it.relPosition?.[0]) || 0;
      const rz = Number(it.relPosition?.[2]) || 0;
      const w = Math.max(0.2, Number(it.dimensions?.[0]) || 1);
      const d = Math.max(0.2, Number(it.dimensions?.[2]) || 1);
      const rot = Number(it.rotationY) || 0;
      const cos = Math.abs(Math.cos(rot));
      const sin = Math.abs(Math.sin(rot));
      const extX = (w * cos + d * sin) * 0.5;
      const extZ = (w * sin + d * cos) * 0.5;
      minX = Math.min(minX, rx - extX);
      maxX = Math.max(maxX, rx + extX);
      minZ = Math.min(minZ, rz - extZ);
      maxZ = Math.max(maxZ, rz + extZ);
    }
  } else if (Array.isArray(resolvedBoundingSize) && resolvedBoundingSize.length === 2) {
    const sx = Math.max(2, Number(resolvedBoundingSize[0]) || 4);
    const sz = Math.max(2, Number(resolvedBoundingSize[1]) || 4);
    minX = -sx / 2;
    maxX = sx / 2;
    minZ = -sz / 2;
    maxZ = sz / 2;
  }

  const rawSpanX = Math.max(1.5, maxX - minX);
  const rawSpanZ = Math.max(1.5, maxZ - minZ);
  const roomSpanX = Math.round((resolvedBoundingSize?.[0] || rawSpanX) * 10) / 10;
  const roomSpanZ = Math.round((resolvedBoundingSize?.[1] || rawSpanZ) * 10) / 10;
  const centerWorldX = (minX + maxX) * 0.5;
  const centerWorldZ = (minZ + maxZ) * 0.5;

  const usableW = viewBoxWidth - pad * 2;
  const usableH = viewBoxHeight - pad * 2 - 10;
  const scale = Math.min(usableW / Math.max(rawSpanX, 2.2), usableH / Math.max(rawSpanZ, 2.2));
  const svgCenterX = viewBoxWidth * 0.5;
  const svgCenterY = (viewBoxHeight - 8) * 0.5;

  const previewItems: TopDownRoomPreviewItem[] = safeItems.map((it) => {
    const rx = Number(it.relPosition?.[0]) || 0;
    const rz = Number(it.relPosition?.[2]) || 0;
    const w = Math.max(0.25, Number(it.dimensions?.[0]) || 0.8);
    const d = Math.max(0.22, Number(it.dimensions?.[2]) || 0.8);
    const rotRad = Number(it.rotationY) || 0;
    const rotationDeg = Number(((rotRad * 180) / Math.PI).toFixed(1));

    const cx = Number((svgCenterX + (rx - centerWorldX) * scale).toFixed(2));
    const cy = Number((svgCenterY + (rz - centerWorldZ) * scale).toFixed(2));
    const width = Number(Math.max(3.5, w * scale).toFixed(2));
    const depth = Number(Math.max(3.2, d * scale).toFixed(2));

    const isWall =
      it.category === 'wall' || it.category === 'window_wall' || it.category === 'secret_wall';
    const isDoor = it.category === 'door';
    const isSecretPassage = Boolean(it.isSecretPassage || it.category === 'secret_wall');

    let zOrder = 1;
    if (it.category === 'floor_tile') zOrder = 0;
    else if (it.category === 'lighting') zOrder = 2;
    else if (isWall || isDoor) zOrder = 3;

    const fillColor = it.color || (isWall ? '#8a8170' : '#5e4c2e');
    const strokeColor = isSecretPassage
      ? '#f59e0b'
      : isDoor
      ? '#38bdf8'
      : isWall
      ? '#e2e8f0'
      : '#cbd5e1';

    return {
      name: it.name || it.subType || 'Object',
      category: it.category,
      cx,
      cy,
      width,
      depth,
      rotationDeg,
      fillColor,
      strokeColor,
      isWall,
      isDoor,
      isSecretPassage,
      zOrder
    };
  });

  previewItems.sort((a, b) => a.zOrder - b.zOrder);

  // Room footprint boundary in SVG space
  const roomRectW = Number(Math.min(viewBoxWidth - 10, Math.max(36, rawSpanX * scale + 8)).toFixed(1));
  const roomRectH = Number(Math.min(viewBoxHeight - 18, Math.max(28, rawSpanZ * scale + 8)).toFixed(1));
  const roomRectX = Number((svgCenterX - roomRectW * 0.5).toFixed(1));
  const roomRectY = Number((svgCenterY - roomRectH * 0.5).toFixed(1));

  const gridLines: string[] = [];
  const stepPx = Math.max(10, Math.round(scale));
  for (let gx = stepPx; gx < viewBoxWidth; gx += stepPx) {
    gridLines.push(
      `<line x1="${gx}" y1="0" x2="${gx}" y2="${viewBoxHeight}" stroke="#1e293b" stroke-width="0.6" />`
    );
  }
  for (let gy = stepPx; gy < viewBoxHeight; gy += stepPx) {
    gridLines.push(
      `<line x1="0" y1="${gy}" x2="${viewBoxWidth}" y2="${gy}" stroke="#1e293b" stroke-width="0.6" />`
    );
  }

  const shapesSvg = previewItems
    .map((p) => {
      const hw = Number((p.width * 0.5).toFixed(2));
      const hd = Number((p.depth * 0.5).toFixed(2));
      const dash = p.isSecretPassage ? ' stroke-dasharray="2.5,1.5"' : '';
      const opacity = p.category === 'floor_tile' ? '0.52' : p.isWall ? '0.96' : '0.88';
      const innerDetail = p.isDoor
        ? `<path d="M ${-hw} ${hd} A ${p.width} ${p.width} 0 0 1 ${hw} ${hd - p.width * 0.65}" fill="none" stroke="#38bdf8" stroke-width="0.9" stroke-dasharray="2,1.5" />`
        : p.category === 'lighting'
        ? `<circle cx="0" cy="0" r="${Math.max(3.5, Math.min(hw, hd) * 1.35).toFixed(1)}" fill="#fbbf24" fill-opacity="0.28" stroke="#fde68a" stroke-width="0.7" />`
        : !p.isWall && p.category !== 'floor_tile'
        ? `<rect x="${(-hw * 0.72).toFixed(2)}" y="${(-hd * 0.72).toFixed(2)}" width="${(p.width * 0.72).toFixed(2)}" height="${(p.depth * 0.72).toFixed(2)}" rx="1" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="0.6" />`
        : '';

      return `<g transform="translate(${p.cx},${p.cy}) rotate(${p.rotationDeg})"><title>${escapeXmlAttr(p.name)}</title><rect x="${-hw}" y="${-hd}" width="${p.width}" height="${p.depth}" rx="${p.isWall ? 0.8 : 1.6}" fill="${escapeXmlAttr(p.fillColor)}" fill-opacity="${opacity}" stroke="${escapeXmlAttr(p.strokeColor)}" stroke-width="${p.isWall ? 1.2 : 0.85}"${dash} />${innerDetail}</g>`;
    })
    .join('');

  const cleanTitle = escapeXmlAttr(String(resolvedTitle || 'TOP-DOWN PLAN').slice(0, 22));
  const dimsLabel = `${roomSpanX}×${roomSpanZ}m · ${safeItems.length} obj`;

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" width="${viewBoxWidth}" height="${viewBoxHeight}"><rect width="${viewBoxWidth}" height="${viewBoxHeight}" rx="8" fill="#091326" />${gridLines.join('')}<rect x="${roomRectX}" y="${roomRectY}" width="${roomRectW}" height="${roomRectH}" rx="2" fill="#0f2342" fill-opacity="0.55" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="0.9" stroke-dasharray="3,2" />${shapesSvg}<rect x="0" y="${viewBoxHeight - 15}" width="${viewBoxWidth}" height="15" fill="#020617" fill-opacity="0.82" /><text x="6" y="${viewBoxHeight - 4.5}" fill="#7dd3fc" font-family="monospace" font-size="7.5" font-weight="bold">TOP-DOWN · ${cleanTitle}</text><text x="${viewBoxWidth - 5}" y="${viewBoxHeight - 4.5}" text-anchor="end" fill="#fbbf24" font-family="monospace" font-size="7.2" font-weight="bold">${escapeXmlAttr(dimsLabel)}</text></svg>`;

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;

  return {
    viewBoxWidth,
    viewBoxHeight,
    roomSpanX,
    roomSpanZ,
    items: previewItems,
    svgMarkup,
    dataUrl
  };
}

const RAW_INITIAL_ROOM_BLUEPRINTS: RoomBlueprint[] = [
  {
    id: 'bp_room_lobby_registry',
    name: 'Front Desk & Registry Alcove',
    description: 'Shadowy late-70s hotel reception layout with soot-stained brick wall, dark walnut front desk, tarnished banker lamp, and threadbare oxblood runner.',
    createdAt: '2026-10-30T08:00:00.000Z',
    tags: ['lobby', 'reception', 'starter', 'late_70s'],
    boundingSize: [6.0, 5.0],
    items: [
      {
        name: 'Soot-Stained Brick Wall',
        category: 'wall',
        subType: 'wall_brick_standard',
        relPosition: [0, 1.5, -2.0],
        dimensions: [4.5, 3.0, 0.3],
        rotationY: 0,
        color: '#592820',
        textureId: 'nyc_old_brick',
        collidable: true
      },
      {
        name: 'Scarred Walnut Concierge Desk',
        category: 'furniture',
        subType: 'concierge_desk',
        relPosition: [0, 0.55, -0.5],
        dimensions: [2.6, 1.1, 0.9],
        rotationY: 0,
        color: '#3b2314',
        textureId: 'oak_parquet',
        collidable: true
      },
      {
        name: 'Threadbare Oxblood Parlor Rug',
        category: 'floor_tile',
        subType: 'crimson_carpet_runner',
        relPosition: [0, 0.03, 1.2],
        dimensions: [3.2, 0.06, 2.4],
        rotationY: 0,
        color: '#4a181b',
        textureId: 'velvet_crimson',
        collidable: false
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
        collidable: false
      }
    ]
  },
  {
    id: 'bp_room_secret_study',
    name: 'Suite 202 Secret Partition Study',
    description: 'Dark mystery suite featuring water-stained wainscoted walls, a pivoting secret walnut bookcase door, and a weathered wardrobe.',
    createdAt: '2026-10-30T08:30:00.000Z',
    tags: ['suite', 'secret_passage', 'mystery', 'thriller'],
    boundingSize: [5.5, 5.0],
    items: [
      {
        name: 'Water-Stained Wainscot Wall',
        category: 'wall',
        subType: 'wall_plaster_wainscot',
        relPosition: [-2.0, 1.5, -1.5],
        dimensions: [3.0, 3.0, 0.3],
        rotationY: 0,
        color: '#8a8170',
        textureId: 'plaster_cream',
        collidable: true
      },
      {
        name: 'Secret Pivoting Bookcase Wall',
        category: 'secret_wall',
        subType: 'secret_bookshelf_door',
        relPosition: [0.8, 1.45, -1.5],
        dimensions: [2.2, 2.9, 0.45],
        rotationY: 0,
        color: '#3b2314',
        textureId: 'oak_parquet',
        isSecretPassage: true,
        isOpen: false,
        collidable: true
      },
      {
        name: 'Weathered Dark Oak Wardrobe',
        category: 'furniture',
        subType: 'oak_wardrobe',
        relPosition: [-1.8, 1.1, 0.5],
        dimensions: [1.3, 2.2, 0.7],
        rotationY: Math.PI / 2,
        color: '#2b180a',
        textureId: 'oak_parquet',
        collidable: true
      }
    ]
  },
  {
    id: 'bp_room_corner_bedroom',
    name: 'Unmaintained 1978 Corner Tenant Suite',
    description: 'Faded corner apartment with rain-streaked casement window wall, scarred transom door, and worn oxblood bed.',
    createdAt: '2026-10-30T09:00:00.000Z',
    tags: ['bedroom', 'guest_room', 'suite', 'late_70s'],
    boundingSize: [6.0, 6.0],
    items: [
      {
        name: 'Rain-Streaked Casement Window Wall',
        category: 'window_wall',
        subType: 'wall_window_casement',
        relPosition: [0, 1.5, -2.5],
        dimensions: [3.0, 3.0, 0.3],
        rotationY: 0,
        color: '#4a2019',
        textureId: 'nyc_old_brick',
        collidable: true
      },
      {
        name: 'Numbered Transom Suite Door',
        category: 'door',
        subType: 'transom_hotel_door',
        relPosition: [-2.2, 1.3, 0],
        dimensions: [1.4, 2.6, 0.25],
        rotationY: Math.PI / 2,
        color: '#3b2314',
        textureId: 'oak_parquet',
        isOpen: false,
        collidable: true
      },
      {
        name: 'Faded Burgundy & Brass Suite Bed',
        category: 'furniture',
        subType: 'hotel_bed_double',
        relPosition: [0.5, 0.55, -0.6],
        dimensions: [1.8, 1.1, 2.2],
        rotationY: 0,
        color: '#4a181b',
        textureId: 'velvet_crimson',
        collidable: true
      }
    ]
  },
  {
    id: 'bp_room_longterm_resident',
    name: 'Long-Term Resident Suite (Late-70s / Early-80s Decay)',
    description: 'Permanent multi-decade tenant apartment mixing stained wainscoting & clanking steam radiator with a 1978 woodgrain CRT TV, harvest-gold hotplate kitchenette, and scuffed steamer trunk.',
    createdAt: '2026-10-30T10:00:00.000Z',
    tags: ['resident', 'piecemeal_upgrade', 'long_term', 'late_70s'],
    boundingSize: [6.0, 6.0],
    items: [
      {
        name: 'Water-Stained Wainscot Wall',
        category: 'wall',
        subType: 'wall_plaster_wainscot',
        relPosition: [0, 1.5, -2.5],
        dimensions: [4.5, 3.0, 0.3],
        rotationY: 0,
        color: '#8a8170',
        textureId: 'plaster_cream',
        collidable: true
      },
      {
        name: 'Clawfoot Steam Radiator',
        category: 'appliance',
        subType: 'vintage_radiator',
        relPosition: [-1.6, 0.45, -2.1],
        dimensions: [1.2, 0.9, 0.4],
        rotationY: 0,
        color: '#6e5a38',
        textureId: 'aged_brass',
        collidable: true
      },
      {
        name: 'Late-70s Woodgrain CRT TV & VCR Combo',
        category: 'appliance',
        subType: 'crt_tv_vhs_combo',
        relPosition: [1.4, 0.42, -1.8],
        dimensions: [0.9, 0.85, 0.75],
        rotationY: 0,
        color: '#3d2817',
        textureId: 'oak_parquet',
        collidable: true
      },
      {
        name: 'Late-70s Harvest-Gold Hotplate Kitchenette',
        category: 'appliance',
        subType: 'resident_kitchenette',
        relPosition: [-1.8, 0.55, 0.6],
        dimensions: [1.15, 1.1, 0.65],
        rotationY: Math.PI / 2,
        color: '#4a321f',
        textureId: 'oak_parquet',
        collidable: true
      },
      {
        name: 'Decade-Lived-In Steamer Trunk & Keepsakes',
        category: 'furniture',
        subType: 'resident_steamer_trunk',
        relPosition: [1.5, 0.48, 1.2],
        dimensions: [1.1, 0.95, 0.7],
        rotationY: Math.PI,
        color: '#2b180a',
        textureId: 'oak_parquet',
        collidable: true
      }
    ]
  }
];

export const INITIAL_ROOM_BLUEPRINTS: RoomBlueprint[] = RAW_INITIAL_ROOM_BLUEPRINTS.map((bp) => {
  const preview = generateTopDownRoomBlueprintPreview(bp.items, bp.boundingSize, bp.name);
  return {
    ...bp,
    previewThumbnailUrl: preview.dataUrl,
    topDownPreview: preview
  };
});

/**
 * Pure helper to save a collection of placed assets as a centered, reusable RoomBlueprint
 * with an automatically captured top-down visual floorplan preview.
 */
export function createRoomBlueprintFromAssets(
  name: string,
  description: string,
  sourceAssets: PlacedAsset[],
  tags: string[] = ['custom_room']
): RoomBlueprint {
  const cleanName = name.trim() || `Custom Room Blueprint (${sourceAssets.length} objs)`;
  if (sourceAssets.length === 0) {
    const emptyPreview = generateTopDownRoomBlueprintPreview([], [4, 4], cleanName);
    return {
      id: `bp_room_${Date.now()}`,
      name: cleanName,
      description: description.trim() || 'Empty room blueprint template.',
      createdAt: new Date().toISOString(),
      tags,
      boundingSize: [4, 4],
      items: [],
      previewThumbnailUrl: emptyPreview.dataUrl,
      topDownPreview: emptyPreview
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const a of sourceAssets) {
    const [x, , z] = a.position;
    const [w, , d] = a.dimensions;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
  }

  const centerX = snapToGrid((minX + maxX) / 2, 0.5);
  const centerZ = snapToGrid((minZ + maxZ) / 2, 0.5);
  const spanX = Math.max(1, Math.round((maxX - minX) * 10) / 10);
  const spanZ = Math.max(1, Math.round((maxZ - minZ) * 10) / 10);

  const items: RoomBlueprintItem[] = sourceAssets.map((a) => ({
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
    isOpen: Boolean(a.isOpen),
    isActivated: Boolean(a.isActivated),
    collidable: a.collidable,
    compositeParts: a.compositeParts ? a.compositeParts.map((p) => ({ ...p })) : undefined,
    isLightEmitting: a.isLightEmitting,
    emissionIntensity: a.emissionIntensity,
    lightIntensity: a.lightIntensity,
    lightingPreset: a.lightingPreset,
    customAnimationFps: a.customAnimationFps ?? a.customFlickerFps
  }));

  const topDownPreview = generateTopDownRoomBlueprintPreview(items, [spanX, spanZ], cleanName);

  return {
    id: `bp_room_${Date.now()}`,
    name: cleanName,
    description:
      description.trim() ||
      `Saved layout of ${items.length} ${items.length === 1 ? 'asset' : 'assets'} (${spanX}m × ${spanZ}m).`,
    createdAt: new Date().toISOString(),
    tags,
    boundingSize: [spanX, spanZ],
    items,
    previewThumbnailUrl: topDownPreview.dataUrl,
    topDownPreview
  };
}

/**
 * Pure helper to instantiate a RoomBlueprint onto a target floor layer at a given (offsetX, offsetZ) center.
 */
export function instantiateRoomBlueprintOnFloor(
  blueprint: RoomBlueprint,
  targetFloor: FloorId,
  offsetX = 0,
  offsetZ = 0,
  halfGrid = GRID_TILE_COUNT / 2 - 0.5
): PlacedAsset[] {
  const stampId = Date.now();
  return blueprint.items.map((item, idx) => {
    const worldX = snapToGrid(
      Math.max(-halfGrid, Math.min(halfGrid, offsetX + item.relPosition[0])),
      0.5
    );
    const worldZ = snapToGrid(
      Math.max(-halfGrid, Math.min(halfGrid, offsetZ + item.relPosition[2])),
      0.5
    );
    return {
      id: `bp_inst_${stampId}_${idx}`,
      name: item.name,
      category: item.category,
      subType: item.subType,
      floor: targetFloor,
      roomNumber: blueprint.name,
      position: [worldX, item.dimensions[1] / 2, worldZ],
      dimensions: [...item.dimensions] as [number, number, number],
      rotationY: item.rotationY,
      color: item.color,
      textureId: item.textureId,
      isSecretPassage: item.isSecretPassage,
      isOpen: Boolean(item.isOpen),
      isActivated: Boolean(item.isActivated),
      collidable: item.collidable,
      compositeParts: item.compositeParts ? item.compositeParts.map((p) => ({ ...p })) : undefined,
      isLightEmitting: item.isLightEmitting,
      emissionIntensity: item.emissionIntensity,
      lightIntensity: item.lightIntensity,
      lightingPreset: item.lightingPreset,
      customAnimationFps: item.customAnimationFps,
      customFlickerFps: item.customAnimationFps
    };
  });
}

/**
 * ============================================================================
 * FLOATING WINDOW MANAGER SYSTEM (Movable, Minimizable, Maximizable, Closable)
 * ============================================================================
 */
export type StudioWindowId =
  | 'tools'
  | 'catalog'
  | 'inspector'
  | 'blueprints'
  | 'layers'
  | 'char_appearance'
  | 'char_ai'
  | 'projects'
  | 'local_fs'
  | 'audio'
  | 'notebook'
  | 'keybindings';

export interface StudioWindowState {
  id: StudioWindowId;
  title: string;
  shortTitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}

export function createDefaultStudioWindows(): Record<StudioWindowId, StudioWindowState> {
  return {
    tools: {
      id: 'tools',
      title: 'Build Mode Tools',
      shortTitle: '🛠 Tools',
      x: 12,
      y: 438,
      width: 255,
      height: 274,
      minWidth: 220,
      minHeight: 190,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: 25
    },
    catalog: {
      id: 'catalog',
      title: 'Visual Asset Catalog & AI Forge',
      shortTitle: '📦 Asset Catalog',
      x: 275,
      y: 438,
      width: 475,
      height: 274,
      minWidth: 320,
      minHeight: 200,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: 22
    },
    inspector: {
      id: 'inspector',
      title: '3D Object Inspector',
      shortTitle: '🔍 Inspector',
      x: 758,
      y: 438,
      width: 335,
      height: 274,
      minWidth: 260,
      minHeight: 200,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: 23
    },
    blueprints: {
      id: 'blueprints',
      title: 'Room Blueprints Library (.json)',
      shortTitle: '📐 Room Blueprints',
      x: 12,
      y: 74,
      width: 325,
      height: 356,
      minWidth: 270,
      minHeight: 230,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      zIndex: 24
    },
    layers: {
      id: 'layers',
      title: 'Floor Selection',
      shortTitle: '🏢 Floors',
      x: 1048,
      y: 124,
      width: 218,
      height: 336,
      minWidth: 190,
      minHeight: 210,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: 21
    },
    char_appearance: {
      id: 'char_appearance',
      title: 'Create-A-Character Rig',
      shortTitle: '👤 Rig Mesh',
      x: 14,
      y: 136,
      width: 315,
      height: 585,
      minWidth: 260,
      minHeight: 280,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: 26
    },
    char_ai: {
      id: 'char_ai',
      title: 'AI Mind, Lore Sandbox & Schedule',
      shortTitle: '🧠 AI Mind & Lore',
      x: 960,
      y: 136,
      width: 425,
      height: 580,
      minWidth: 330,
      minHeight: 300,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: 27
    },
    projects: {
      id: 'projects',
      title: 'Project Save & Load Manager',
      shortTitle: '💾 Projects',
      x: 345,
      y: 136,
      width: 395,
      height: 390,
      minWidth: 320,
      minHeight: 250,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      zIndex: 28
    },
    local_fs: {
      id: 'local_fs',
      title: 'Local Computer Workspace & Dedicated Asset Folders',
      shortTitle: '📁 Local Folders',
      x: 260,
      y: 136,
      width: 760,
      height: 530,
      minWidth: 480,
      minHeight: 340,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      zIndex: 29
    },
    audio: {
      id: 'audio',
      title: 'Audio Synthesizer & Music Studio',
      shortTitle: '🎵 Sound Board',
      x: 18,
      y: 136,
      width: 610,
      height: 575,
      minWidth: 420,
      minHeight: 320,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      zIndex: 30
    },
    notebook: {
      id: 'notebook',
      title: "1978 Detective's Case Folio & Microcassette Dictaphone",
      shortTitle: '📓 Notebook [J]',
      x: 230,
      y: 136,
      width: 720,
      height: 530,
      minWidth: 480,
      minHeight: 360,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      zIndex: 31
    },
    keybindings: {
      id: 'keybindings',
      title: 'Keybindings & Control Mapping Studio',
      shortTitle: '⌨️ Keys [K]',
      x: 290,
      y: 136,
      width: 680,
      height: 540,
      minWidth: 460,
      minHeight: 360,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      zIndex: 32
    }
  };
}

export function focusStudioWindow(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId
): Record<StudioWindowId, StudioWindowState> {
  const maxZ = Object.values(windows).reduce((acc, w) => Math.max(acc, w.zIndex), 20);
  const target = windows[id];
  if (!target) return windows;
  return {
    ...windows,
    [id]: {
      ...target,
      zIndex: maxZ + 1
    }
  };
}

export function updateStudioWindowPosition(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId,
  nextX: number,
  nextY: number,
  viewportW = 1280,
  viewportH = 800
): Record<StudioWindowId, StudioWindowState> {
  const target = windows[id];
  if (!target) return windows;
  const clampedX = Math.max(4, Math.min(viewportW - 120, Math.round(nextX)));
  const clampedY = Math.max(48, Math.min(viewportH - 52, Math.round(nextY)));
  return {
    ...windows,
    [id]: {
      ...target,
      x: clampedX,
      y: clampedY,
      isMaximized: false
    }
  };
}

export function updateStudioWindowSize(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId,
  nextWidth: number,
  nextHeight: number,
  viewportW = 1280,
  viewportH = 800
): Record<StudioWindowId, StudioWindowState> {
  const target = windows[id];
  if (!target) return windows;
  const clampedW = Math.max(target.minWidth, Math.min(viewportW - 24, Math.round(nextWidth)));
  const clampedH = Math.max(target.minHeight, Math.min(viewportH - 80, Math.round(nextHeight)));
  return {
    ...windows,
    [id]: {
      ...target,
      width: clampedW,
      height: clampedH,
      isMaximized: false
    }
  };
}

export function toggleStudioWindowMinimize(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId
): Record<StudioWindowId, StudioWindowState> {
  const defaults = createDefaultStudioWindows();
  const target = windows[id] || defaults[id];
  if (!target) return windows;
  const maxZ = Object.values(windows).reduce((acc, w) => Math.max(acc, w.zIndex), 20);
  return {
    ...windows,
    [id]: {
      ...target,
      isOpen: true,
      isMinimized: !target.isMinimized,
      isMaximized: false,
      zIndex: maxZ + 1
    }
  };
}

export function toggleStudioWindowMaximize(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId
): Record<StudioWindowId, StudioWindowState> {
  const defaults = createDefaultStudioWindows();
  const target = windows[id] || defaults[id];
  if (!target) return windows;
  const maxZ = Object.values(windows).reduce((acc, w) => Math.max(acc, w.zIndex), 20);
  return {
    ...windows,
    [id]: {
      ...target,
      isOpen: true,
      isMaximized: !target.isMaximized,
      isMinimized: false,
      zIndex: maxZ + 1
    }
  };
}

export function toggleStudioWindowOpen(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId,
  forceOpen?: boolean,
  viewportW = 1280,
  viewportH = 800
): Record<StudioWindowId, StudioWindowState> {
  const defaults = createDefaultStudioWindows();
  const target = windows[id] || defaults[id];
  if (!target) return windows;
  const maxZ = Object.values(windows).reduce((acc, w) => Math.max(acc, w.zIndex), 20);
  const nextOpen = forceOpen !== undefined ? forceOpen : !target.isOpen;

  const defaultSpec = defaults[id] || target;
  const safeW = Math.max(target.minWidth || 200, target.width || defaultSpec.width);
  const safeH = Math.max(target.minHeight || 150, target.height || defaultSpec.height);
  const rawX = typeof target.x === 'number' && isFinite(target.x) && target.x > -100 && target.x < 2500 ? target.x : defaultSpec.x;
  const rawY = typeof target.y === 'number' && isFinite(target.y) && target.y > -50 && target.y < 1800 ? target.y : defaultSpec.y;
  const safeX = nextOpen
    ? Math.max(8, Math.min(Math.max(8, viewportW - Math.min(safeW, viewportW - 16)), Math.round(rawX)))
    : rawX;
  const safeY = nextOpen
    ? Math.max(52, Math.min(Math.max(52, viewportH - Math.min(safeH, viewportH - 64)), Math.round(rawY)))
    : rawY;

  return {
    ...windows,
    [id]: {
      ...defaultSpec,
      ...target,
      id,
      title: defaultSpec.title,
      shortTitle: defaultSpec.shortTitle,
      x: safeX,
      y: safeY,
      width: safeW,
      height: safeH,
      isOpen: nextOpen,
      isMinimized: nextOpen ? false : target.isMinimized,
      zIndex: nextOpen ? maxZ + 1 : target.zIndex
    }
  };
}

export function normalizeStudioWindowsState(
  saved: Partial<Record<StudioWindowId, Partial<StudioWindowState>>> | null | undefined,
  viewportW = 1280,
  viewportH = 800
): Record<StudioWindowId, StudioWindowState> {
  const defaults = createDefaultStudioWindows();
  if (!saved || typeof saved !== 'object') {
    return defaults;
  }
  const normalized = { ...defaults };
  for (const id of Object.keys(defaults) as StudioWindowId[]) {
    const def = defaults[id];
    const raw = saved[id];
    if (!raw || typeof raw !== 'object') {
      normalized[id] = def;
      continue;
    }
    const width =
      typeof raw.width === 'number' && isFinite(raw.width)
        ? Math.max(def.minWidth, Math.min(viewportW - 16, Math.round(raw.width)))
        : def.width;
    const height =
      typeof raw.height === 'number' && isFinite(raw.height)
        ? Math.max(def.minHeight, Math.min(viewportH - 64, Math.round(raw.height)))
        : def.height;
    const rawX = typeof raw.x === 'number' && isFinite(raw.x) ? raw.x : def.x;
    const rawY = typeof raw.y === 'number' && isFinite(raw.y) ? raw.y : def.y;
    const x = Math.max(8, Math.min(Math.max(8, viewportW - Math.min(width, viewportW - 16)), Math.round(rawX)));
    const y = Math.max(52, Math.min(Math.max(52, viewportH - Math.min(height, viewportH - 64)), Math.round(rawY)));

    normalized[id] = {
      ...def,
      ...raw,
      id,
      title: def.title,
      shortTitle: def.shortTitle,
      minWidth: def.minWidth,
      minHeight: def.minHeight,
      x,
      y,
      width,
      height,
      isOpen: typeof raw.isOpen === 'boolean' ? raw.isOpen : def.isOpen,
      isMinimized: typeof raw.isMinimized === 'boolean' ? raw.isMinimized : def.isMinimized,
      isMaximized: typeof raw.isMaximized === 'boolean' ? raw.isMaximized : def.isMaximized,
      zIndex: typeof raw.zIndex === 'number' && isFinite(raw.zIndex) ? raw.zIndex : def.zIndex
    };
  }
  return normalized;
}

export type TaskbarWindowAction = 'opened' | 'restored' | 'focused' | 'closed';

export interface TaskbarWindowClickResult {
  windows: Record<StudioWindowId, StudioWindowState>;
  action: TaskbarWindowAction;
  windowState: StudioWindowState;
}

export function handleTaskbarWindowButtonClick(
  windows: Record<StudioWindowId, StudioWindowState>,
  id: StudioWindowId,
  mode: EditorWorkspaceModeId = 'architect',
  viewportW = 1280,
  viewportH = 800
): TaskbarWindowClickResult {
  const defaults = createDefaultStudioWindows();
  const def = defaults[id];
  const target = windows[id] ? { ...def, ...windows[id] } : def;
  const maxZ = Object.values(windows).reduce((acc, w) => Math.max(acc, w?.zIndex || 20), 20);

  const safeW = Math.max(def.minWidth || 200, target.width || def.width);
  const safeH = Math.max(def.minHeight || 150, target.height || def.height);
  const clampedX = Math.max(
    8,
    Math.min(Math.max(8, viewportW - Math.min(safeW, viewportW - 16)), Math.round(target.x ?? def.x))
  );
  const clampedY = Math.max(
    52,
    Math.min(Math.max(52, viewportH - Math.min(safeH, viewportH - 64)), Math.round(target.y ?? def.y))
  );

  // 1. Closed -> open, clamp into viewport, and bring to front
  if (!target.isOpen) {
    const nextWin: StudioWindowState = {
      ...target,
      id,
      title: def.title,
      shortTitle: def.shortTitle,
      x: clampedX,
      y: clampedY,
      width: safeW,
      height: safeH,
      isOpen: true,
      isMinimized: false,
      zIndex: maxZ + 1
    };
    return {
      windows: { ...windows, [id]: nextWin },
      action: 'opened',
      windowState: nextWin
    };
  }

  // 2. Minimized -> unminimize, clamp into viewport, and bring to front
  if (target.isMinimized) {
    const nextWin: StudioWindowState = {
      ...target,
      id,
      title: def.title,
      shortTitle: def.shortTitle,
      x: clampedX,
      y: clampedY,
      width: safeW,
      height: safeH,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      zIndex: maxZ + 1
    };
    return {
      windows: { ...windows, [id]: nextWin },
      action: 'restored',
      windowState: nextWin
    };
  }

  // 3. Open & unminimized: check if another visible window in this mode has a strictly higher zIndex or if off-screen
  const modeWinIds = getTaskbarWindowIdsForMode(mode);
  const otherVisibleMaxZ = modeWinIds.reduce((acc, wId) => {
    if (wId === id) return acc;
    const w = windows[wId] || defaults[wId];
    if (w && w.isOpen && !w.isMinimized) {
      return Math.max(acc, w.zIndex || 20);
    }
    return acc;
  }, 0);

  const isOffScreen =
    Math.abs((target.x ?? def.x) - clampedX) > 12 || Math.abs((target.y ?? def.y) - clampedY) > 12;

  if (target.zIndex < otherVisibleMaxZ || isOffScreen) {
    const nextWin: StudioWindowState = {
      ...target,
      id,
      title: def.title,
      shortTitle: def.shortTitle,
      x: clampedX,
      y: clampedY,
      width: safeW,
      height: safeH,
      isOpen: true,
      isMinimized: false,
      zIndex: maxZ + 1
    };
    return {
      windows: { ...windows, [id]: nextWin },
      action: 'focused',
      windowState: nextWin
    };
  }

  // 4. Already top-most visible window on screen -> toggle closed
  const nextWin: StudioWindowState = {
    ...target,
    id,
    title: def.title,
    shortTitle: def.shortTitle,
    isOpen: false
  };
  return {
    windows: { ...windows, [id]: nextWin },
    action: 'closed',
    windowState: nextWin
  };
}


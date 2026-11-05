import { type AssetCategory, type CompositeSubPart, type FloorId, GRID_TILE_COUNT, type PlacedAsset, type TexturePresetId, snapToGrid } from './coreTypesAndFloors';
import { type EditorWorkspaceModeId, getTaskbarWindowIdsForMode } from './catalogVoiceAndSets';
import { DEFAULT_KEYBINDINGS, isActionKeyHeld, type KeybindingsMap } from './keybindingsAndAnimation';
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
 * - Scroll forward (deltaY < 0) = Zoom In (camera moves closer, smaller distance down to 0.55m for close-up inspection)
 * - Scroll backward (deltaY > 0) = Zoom Out (camera moves farther, larger distance up to 7.0m)
 */
export function computeCharacterCreatorWheelZoom(
  currentZoom: number | undefined,
  deltaY: number,
  deltaMode = 0,
  minZoom = 1.2
): number {
  const safeMin = Math.max(0.4, Math.min(2.0, Number.isFinite(minZoom) ? minZoom : 1.2));
  const baseZoom =
    typeof currentZoom === 'number' && Number.isFinite(currentZoom) ? currentZoom : 3.45;
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return Number(Math.max(safeMin, Math.min(7.0, baseZoom)).toFixed(2));
  }
  const sign = deltaY > 0 ? 1 : -1;
  // Normalize across pixel (0), line (1), and page (2) wheel delta modes
  const normalizedPixels =
    deltaMode === 1 ? Math.abs(deltaY) * 36 : deltaMode === 2 ? Math.abs(deltaY) * 320 : Math.abs(deltaY);
  const magnitude = Math.max(0.2, Math.min(0.85, normalizedPixels * 0.0032));
  const nextZoom = Math.max(safeMin, Math.min(7.0, baseZoom + sign * magnitude));
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
 * - Computes `cameraZoom` from `deltaY` and `deltaMode` (down to 0.55m for close-up inspection).
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
      ? Math.max(0.55, Math.min(7.0, current.cameraZoom))
      : 3.45;
  const prevTargetX =
    typeof current.cameraTargetX === 'number' && Number.isFinite(current.cameraTargetX)
      ? current.cameraTargetX
      : 0;
  const prevTargetY =
    typeof current.cameraTargetY === 'number' && Number.isFinite(current.cameraTargetY)
      ? current.cameraTargetY
      : 0.68;

  const nextZoom = computeCharacterCreatorWheelZoom(prevZoom, deltaY, deltaMode, 0.55);
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

/**
 * Pure helper for mouse drag camera panning in Character Creator (`Char. Build`):
 * Converts screen pixel deltas `(dxPx, dyPx)` into exact 1:1 focal-plane world translation
 * `(cameraTargetX, cameraTargetY)` scaled by current `cameraZoom` and vertical `fovDeg`.
 */
export function computeCharacterCreatorCameraPan(
  current: {
    cameraZoom?: number;
    cameraTargetX?: number;
    cameraTargetY?: number;
  },
  dxPx: number,
  dyPx: number,
  viewportHeightPx = 900,
  fovDeg = 55
): { cameraTargetX: number; cameraTargetY: number } {
  const prevZoom =
    typeof current.cameraZoom === 'number' && Number.isFinite(current.cameraZoom)
      ? Math.max(0.55, Math.min(7.0, current.cameraZoom))
      : 3.45;
  const prevTargetX =
    typeof current.cameraTargetX === 'number' && Number.isFinite(current.cameraTargetX)
      ? current.cameraTargetX
      : 0;
  const prevTargetY =
    typeof current.cameraTargetY === 'number' && Number.isFinite(current.cameraTargetY)
      ? current.cameraTargetY
      : 0.68;

  const safeH = Math.max(120, Number.isFinite(viewportHeightPx) && viewportHeightPx > 0 ? viewportHeightPx : 900);
  const safeFovDeg = Math.max(20, Math.min(110, Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : 55));
  const tanHalfFov = Math.tan((safeFovDeg * 0.5 * Math.PI) / 180);
  const worldPerPixel = (2 * prevZoom * tanHalfFov) / safeH;

  const nextTargetX = Math.max(
    -3.2,
    Math.min(3.2, Number((prevTargetX - dxPx * worldPerPixel).toFixed(4)))
  );
  const nextTargetY = Math.max(
    -1.2,
    Math.min(2.8, Number((prevTargetY + dyPx * worldPerPixel).toFixed(4)))
  );

  return {
    cameraTargetX: nextTargetX,
    cameraTargetY: nextTargetY
  };
}

/**
 * Pure helper for keyboard camera movement (WASD / Arrow keys / Space / C) in Character Creator (`Char. Build`):
 * Allows moving the camera target up/down/left/right smoothly, scaled by the current zoom distance
 * so close-up focus areas pan with fine precision.
 */
export function computeCharacterCreatorKeyboardPanStep(params: {
  current: {
    cameraZoom?: number;
    cameraTargetX?: number;
    cameraTargetY?: number;
  };
  dt: number;
  keysHeld: ReadonlySet<string>;
  bindings?: KeybindingsMap;
}): {
  cameraTargetX: number;
  cameraTargetY: number;
  cameraZoom: number;
  moved: boolean;
} {
  const { current, dt, keysHeld, bindings = DEFAULT_KEYBINDINGS } = params;
  const prevZoom =
    typeof current.cameraZoom === 'number' && Number.isFinite(current.cameraZoom)
      ? Math.max(0.55, Math.min(7.0, current.cameraZoom))
      : 3.45;
  const prevTargetX =
    typeof current.cameraTargetX === 'number' && Number.isFinite(current.cameraTargetX)
      ? current.cameraTargetX
      : 0;
  const prevTargetY =
    typeof current.cameraTargetY === 'number' && Number.isFinite(current.cameraTargetY)
      ? current.cameraTargetY
      : 0.68;

  if (!Number.isFinite(dt) || dt <= 0 || keysHeld.size === 0) {
    return {
      cameraTargetX: prevTargetX,
      cameraTargetY: prevTargetY,
      cameraZoom: prevZoom,
      moved: false
    };
  }

  const sprintMult = isActionKeyHeld('sprint_camera', keysHeld, bindings) ? 1.85 : 1.0;
  const zoomScale = Math.max(0.25, prevZoom / 3.45);
  const panSpeed = 1.45 * zoomScale * sprintMult;

  let dirX = 0;
  let dirY = 0;

  if (isActionKeyHeld('move_left', keysHeld, bindings)) dirX -= 1;
  if (isActionKeyHeld('move_right', keysHeld, bindings)) dirX += 1;
  if (
    isActionKeyHeld('move_forward', keysHeld, bindings) ||
    isActionKeyHeld('camera_up', keysHeld, bindings)
  ) {
    dirY += 1;
  }
  if (
    isActionKeyHeld('move_backward', keysHeld, bindings) ||
    isActionKeyHeld('camera_down', keysHeld, bindings)
  ) {
    dirY -= 1;
  }

  if (dirX === 0 && dirY === 0) {
    return {
      cameraTargetX: prevTargetX,
      cameraTargetY: prevTargetY,
      cameraZoom: prevZoom,
      moved: false
    };
  }

  const len = Math.hypot(dirX, dirY) || 1;
  const nextTargetX = Math.max(
    -3.2,
    Math.min(3.2, Number((prevTargetX + (dirX / len) * panSpeed * dt).toFixed(4)))
  );
  const nextTargetY = Math.max(
    -1.2,
    Math.min(2.8, Number((prevTargetY + (dirY / len) * panSpeed * dt).toFixed(4)))
  );

  return {
    cameraTargetX: nextTargetX,
    cameraTargetY: nextTargetY,
    cameraZoom: prevZoom,
    moved: nextTargetX !== prevTargetX || nextTargetY !== prevTargetY
  };
}

export interface CharacterCreatorFocusPreset {
  id: 'full_body' | 'face_head' | 'upper_torso' | 'hands_props' | 'legs_footwear';
  label: string;
  cameraZoom: number;
  cameraTargetX: number;
  cameraTargetY: number;
}

export const CHARACTER_CREATOR_FOCUS_PRESETS: readonly CharacterCreatorFocusPreset[] = [
  { id: 'full_body', label: '🧍 Full Body', cameraZoom: 3.45, cameraTargetX: 0, cameraTargetY: 0.68 },
  { id: 'face_head', label: '👁️ Face & Eyes', cameraZoom: 1.05, cameraTargetX: 0, cameraTargetY: 1.48 },
  { id: 'upper_torso', label: '🧥 Upper Torso', cameraZoom: 1.65, cameraTargetX: 0, cameraTargetY: 1.12 },
  { id: 'hands_props', label: '🤚 Hands / Cane', cameraZoom: 1.35, cameraTargetX: 0.28, cameraTargetY: 0.78 },
  { id: 'legs_footwear', label: '👞 Legs & Shoes', cameraZoom: 1.55, cameraTargetX: 0, cameraTargetY: 0.22 }
] as const;

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

export const RAW_INITIAL_ROOM_BLUEPRINTS: RoomBlueprint[] = [
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


import { type AssetCategory, type AssetConditionVariant, type CompositeSubPart, type FloorId, GRID_TILE_COUNT, type HingeSwingMode, type HotelAgentProfile, type PlacedAsset, type TexturePresetId, clampDimension, getRoomLabelAtPosition, normalizeSnapGridSize, snapToGrid } from './coreTypesAndFloors';
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

/**
 * Computes the vertical half-height of a single CompositeSubPart along the local Y axis,
 * accounting for sphere/torus radius conventions and Euler X/Z rotations (e.g., horizontal cylinders).
 */
export function computeCompositePartHalfHeight(part: CompositeSubPart): number {
  const sx = Math.max(0.005, Math.abs(Number(part.size?.[0]) || 0.05));
  const sy = Math.max(0.005, Math.abs(Number(part.size?.[1]) || 0.05));
  const sz = Math.max(0.005, Math.abs(Number(part.size?.[2]) || 0.05));

  let localHx = sx * 0.5;
  let localHy = sy * 0.5;
  let localHz = sz * 0.5;

  if (part.shape === 'sphere') {
    localHx = sx;
    localHy = sx;
    localHz = sx;
  } else if (part.shape === 'cylinder' || part.shape === 'cone') {
    localHx = sx;
    localHy = sy * 0.5;
    localHz = sx;
  } else if (part.shape === 'torus') {
    // THREE.TorusGeometry(sx, sy) lies in the local XY plane with outer radius sx + sy and Z thickness sy
    localHx = sx + sy;
    localHy = sx + sy;
    localHz = sy;
  }

  if (!part.rotation || (part.rotation[0] === 0 && part.rotation[2] === 0)) {
    return localHy;
  }

  const [rx, ry, rz] = part.rotation;
  const cx = Math.cos(rx);
  const sxRot = Math.sin(rx);
  const cy = Math.cos(ry);
  const syRot = Math.sin(ry);
  const cz = Math.cos(rz);
  const szRot = Math.sin(rz);

  let maxAbsY = 0;
  const signs = [-1, 1];
  for (const dx of signs) {
    for (const dy of signs) {
      for (const dz of signs) {
        let x = dx * localHx;
        let y = dy * localHy;
        let z = dz * localHz;
        // Apply Euler XYZ matching THREE.Mesh default rotation order
        if (rx !== 0) {
          const ny = y * cx - z * sxRot;
          const nz = y * sxRot + z * cx;
          y = ny;
          z = nz;
        }
        if (ry !== 0) {
          const nx = x * cy + z * syRot;
          const nz = -x * syRot + z * cy;
          x = nx;
          z = nz;
        }
        if (rz !== 0) {
          const ny = x * szRot + y * cz;
          y = ny;
        }
        if (Math.abs(y) > maxAbsY) {
          maxAbsY = Math.abs(y);
        }
      }
    }
  }
  return maxAbsY;
}

/**
 * Pure helper that normalizes composite part Y offsets so the lowest point of any composite asset
 * sits exactly at local `y = -assetHeight / 2` (which corresponds to `world Y = 0` when `group.position.y = assetHeight / 2`).
 * Fixes the bug where composite assets authored in center-origin coordinates (`[-h/2, +h/2]`, such as
 * `apt_elevator_cab_sliding_doors`, `apt_elevator_sliding_doors`, and `apt_elevator_cab_wall_solid`)
 * had `-h / 2` subtracted a second time and spawned halfway through the floor.
 */
export function computeCompositePartsVerticalShift(
  parts: readonly CompositeSubPart[] | undefined | null,
  assetHeight: number
): number {
  const safeH = Math.max(0.04, Number(assetHeight) || 1);
  if (!parts || parts.length === 0) {
    return -safeH / 2;
  }
  let rawMinY = Infinity;
  for (const part of parts) {
    if (!part || !Array.isArray(part.offset)) continue;
    const oy = Number(part.offset[1]) || 0;
    const halfH = computeCompositePartHalfHeight(part);
    const partMinY = oy - halfH;
    if (partMinY < rawMinY) {
      rawMinY = partMinY;
    }
  }
  if (!Number.isFinite(rawMinY)) {
    return -safeH / 2;
  }
  return Number((-safeH / 2 - rawMinY).toFixed(4));
}

/**
 * Resolves the world Y center for a placed asset so floor-resting assets always sit flush on the floor
 * (`y = assetHeight / 2`), while intentionally elevated assets (such as ceiling panels or upper wall fixtures)
 * preserve their elevated Y coordinate and never sink below `assetHeight / 2`.
 */
export function resolvePlacedAssetElevationY(
  assetHeight: number,
  existingOrRelY?: number
): number {
  const floorRestY = Math.max(0.02, (Number(assetHeight) || 1) / 2);
  if (typeof existingOrRelY === 'number' && Number.isFinite(existingOrRelY) && existingOrRelY > floorRestY + 0.001) {
    return Number(existingOrRelY.toFixed(4));
  }
  return Number(floorRestY.toFixed(4));
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

  const movingSubLower = (movingAsset.subType || '').toLowerCase();
  const isMovingDoorOrSlidingDoor =
    movingAsset.category === 'door' || movingSubLower.includes('sliding_door');
  const isMovingWallLike =
    movingAsset.category === 'wall' ||
    movingAsset.category === 'secret_wall' ||
    movingAsset.category === 'window_wall' ||
    movingAsset.category === 'door';

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

    const otherSubLower = (other.subType || '').toLowerCase();
    const isOtherPortalWall = otherSubLower.includes('portal_wall');

    // Special architectural snap: Elevator sliding doors / doors snap directly into the central portal opening of an Elevator Portal Wall
    if (isMovingDoorOrSlidingDoor && isOtherPortalWall) {
      const portalCenterDist = Math.hypot(rawTargetX - ox, rawTargetZ - oz);
      if (portalCenterDist <= snapThreshold && portalCenterDist < bestDist) {
        bestDist = portalCenterDist;
        bestResult = {
          x: Number(ox.toFixed(3)),
          z: Number(oz.toFixed(3)),
          rotationY: other.rotationY || 0,
          snappedToId: other.id,
          snappedToName: other.name,
          snappedFace: 'south'
        };
      }
      continue;
    }

    const isOtherWallLike =
      other.category === 'wall' ||
      other.category === 'secret_wall' ||
      other.category === 'window_wall' ||
      other.category === 'door';

    const isOtherRotated90 = Math.abs(Math.sin(other.rotationY || 0)) > 0.7;

    const faces: Array<'south' | 'north' | 'east' | 'west'> = [
      'south',
      'north',
      'east',
      'west'
    ];

    for (const face of faces) {
      let alignedRotationY = movingAsset.rotationY || 0;
      if (isOtherWallLike) {
        if (isMovingWallLike) {
          // When snapping a wall, door, window_wall, or secret_wall to the collinear end cap of another wall,
          // keep it inline with the target wall rather than twisting 90 degrees perpendicular.
          const isEndCapFace = isOtherRotated90
            ? face === 'south' || face === 'north'
            : face === 'east' || face === 'west';
          if (isEndCapFace) {
            alignedRotationY = other.rotationY || 0;
          }
        } else {
          // Non-wall furniture/appliances align flush against the wall face
          if (face === 'south' || face === 'north') {
            alignedRotationY = 0;
          } else {
            alignedRotationY = Math.PI / 2;
          }
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
          position: [
            snapRes.x,
            resolvePlacedAssetElevationY(a.dimensions[1], a.position[1]),
            snapRes.z
          ] as [number, number, number],
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
        position: [nextX, resolvePlacedAssetElevationY(a.dimensions[1], a.position[1]), nextZ],
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
      position: [nextX, resolvePlacedAssetElevationY(a.dimensions[1], a.position[1]), nextZ]
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


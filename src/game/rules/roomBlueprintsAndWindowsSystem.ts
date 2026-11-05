import { type AssetCategory, type CompositeSubPart, type FloorId, GRID_TILE_COUNT, type PlacedAsset, type TexturePresetId, snapToGrid } from './coreTypesAndFloors';
import { type EditorWorkspaceModeId, getTaskbarWindowIdsForMode } from './catalogVoiceAndSets';
import { DEFAULT_KEYBINDINGS, isActionKeyHeld, type KeybindingsMap } from './keybindingsAndAnimation';
import { type RoomBlueprint, type RoomBlueprintItem, RAW_INITIAL_ROOM_BLUEPRINTS, generateTopDownRoomBlueprintPreview } from './characterCameraAndPreviewSystem';
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
      position: [
        worldX,
        Math.max(item.dimensions[1] / 2, Number(item.relPosition?.[1]) || item.dimensions[1] / 2),
        worldZ
      ],
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
      width: 252,
      height: 402,
      minWidth: 210,
      minHeight: 240,
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


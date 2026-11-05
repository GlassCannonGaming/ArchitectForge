import { computeFirstPersonCameraDisplacement } from './lightingHingesAndAudio';
import { type CharacterAppearance, type FacialRigParams, type FloorId, type ScheduledActivityGesture, type SkeletonPoseEuler, type TenantDisposition } from './coreTypesAndFloors';
import { computeFacialRigParams, computeSkeletonPose } from './scheduleAndCharacterRig';

/**
 * ============================================================================
 * USER-DEFINED KEYBINDING & CONTROL MAPPING SYSTEM
 * ============================================================================
 * Preserves all existing assigned keys by default while allowing users to
 * rebind primary/secondary keys, add additional key codes, detect conflicts,
 * and persist custom control layouts across Build, Character, and Walk modes.
 */
export type KeybindActionId =
  | 'move_forward'
  | 'move_backward'
  | 'move_left'
  | 'move_right'
  | 'turn_left'
  | 'turn_right'
  | 'camera_up'
  | 'camera_down'
  | 'stealth_crouch'
  | 'sprint_camera'
  | 'interact'
  | 'toggle_flashlight'
  | 'push_to_talk'
  | 'quick_edit'
  | 'rotate_asset'
  | 'delete_asset'
  | 'wall_tool'
  | 'toggle_notebook'
  | 'toggle_keybindings'
  | 'reset_windows'
  | 'toggle_mute'
  | 'mode_build'
  | 'mode_character'
  | 'mode_walkthrough'
  | 'clear_selection';

export type KeybindCategory =
  | 'movement_stealth'
  | 'investigation'
  | 'build_tools'
  | 'system_modes';

export type KeybindModeScope = 'global' | 'architect' | 'walkthrough';

export interface KeybindActionSpec {
  id: KeybindActionId;
  label: string;
  description: string;
  category: KeybindCategory;
  modeScope: KeybindModeScope;
  isHoldAction: boolean;
  defaultKeys: string[];
}

export type KeybindingsMap = Record<KeybindActionId, string[]>;

export interface KeybindingConflictWarning {
  keyCode: string;
  keyLabel: string;
  actions: KeybindActionId[];
  actionLabels: string[];
  scopeNote: string;
}

export const DEFAULT_KEYBIND_SPECS: KeybindActionSpec[] = [
  {
    id: 'move_forward',
    label: 'Move Forward / Camera Forward',
    description: 'Walk forward in 1st-Person Walk Mode or pan camera forward in Build Mode.',
    category: 'movement_stealth',
    modeScope: 'global',
    isHoldAction: true,
    defaultKeys: ['KeyW', 'ArrowUp']
  },
  {
    id: 'move_backward',
    label: 'Move Backward / Camera Back',
    description: 'Walk backward in 1st-Person Walk Mode or pan camera backward in Build Mode.',
    category: 'movement_stealth',
    modeScope: 'global',
    isHoldAction: true,
    defaultKeys: ['KeyS', 'ArrowDown']
  },
  {
    id: 'move_left',
    label: 'Strafe Left / Camera Left',
    description: 'Strafe left in Walk Mode or pan camera left in Build Mode.',
    category: 'movement_stealth',
    modeScope: 'global',
    isHoldAction: true,
    defaultKeys: ['KeyA', 'ArrowLeft']
  },
  {
    id: 'move_right',
    label: 'Strafe Right / Camera Right',
    description: 'Strafe right in Walk Mode or pan camera right in Build Mode.',
    category: 'movement_stealth',
    modeScope: 'global',
    isHoldAction: true,
    defaultKeys: ['KeyD', 'ArrowRight']
  },
  {
    id: 'turn_left',
    label: 'Turn Camera Left (Walk Mode)',
    description: 'Rotate first-person gaze left during corridor exploration.',
    category: 'movement_stealth',
    modeScope: 'walkthrough',
    isHoldAction: true,
    defaultKeys: ['KeyQ', 'ArrowLeft']
  },
  {
    id: 'turn_right',
    label: 'Turn Camera Right (Walk Mode)',
    description: 'Rotate first-person gaze right during corridor exploration.',
    category: 'movement_stealth',
    modeScope: 'walkthrough',
    isHoldAction: true,
    defaultKeys: ['ArrowRight']
  },
  {
    id: 'stealth_crouch',
    label: 'Stealth Crouch (Silent Footsteps)',
    description: 'Hold to lower stance to 1.02m and completely silence floor footsteps.',
    category: 'movement_stealth',
    modeScope: 'global',
    isHoldAction: true,
    defaultKeys: ['KeyC', 'ControlLeft', 'ControlRight']
  },
  {
    id: 'camera_up',
    label: 'Elevate Camera Up (Build Mode)',
    description: 'Raise orbit target elevation in Build Mode.',
    category: 'movement_stealth',
    modeScope: 'architect',
    isHoldAction: true,
    defaultKeys: ['Space', 'PageUp']
  },
  {
    id: 'camera_down',
    label: 'Lower Camera Down (Build Mode)',
    description: 'Lower orbit target elevation in Build Mode.',
    category: 'movement_stealth',
    modeScope: 'architect',
    isHoldAction: true,
    defaultKeys: ['KeyC', 'PageDown']
  },
  {
    id: 'sprint_camera',
    label: 'Fast Camera / Multi-Select Modifier',
    description: 'Hold to double camera speed in Build Mode or add to multi-selection.',
    category: 'movement_stealth',
    modeScope: 'architect',
    isHoldAction: true,
    defaultKeys: ['ShiftLeft', 'ShiftRight']
  },
  {
    id: 'interact',
    label: 'Interact / Open Door / Inspect Clue',
    description: 'Open or close doors and secret passages, or inspect nearby evidence.',
    category: 'investigation',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['KeyE']
  },
  {
    id: 'toggle_flashlight',
    label: 'Toggle 1970s D-Cell / UV Flashlight',
    description: 'Switch the inspection flashlight beam ON/OFF to reveal hidden wall clues.',
    category: 'investigation',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['KeyL']
  },
  {
    id: 'push_to_talk',
    label: 'Hold to Speak Live to Tenant (Mic)',
    description: 'Hold key to speak directly into the Walkman lapel microphone to nearby AI residents.',
    category: 'investigation',
    modeScope: 'walkthrough',
    isHoldAction: true,
    defaultKeys: ['KeyV']
  },
  {
    id: 'toggle_notebook',
    label: "Toggle 1978 Case Folio & Walkman",
    description: "Open or close the Investigator's Notebook, Cassette Walkman & Corkboard.",
    category: 'investigation',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['KeyJ']
  },
  {
    id: 'quick_edit',
    label: 'Toggle Quick Edit Popup Window',
    description: 'Open or close the floating Quick Edit popup next to the selected 3D object.',
    category: 'build_tools',
    modeScope: 'architect',
    isHoldAction: false,
    defaultKeys: ['KeyF']
  },
  {
    id: 'rotate_asset',
    label: 'Rotate Selected Object 90°',
    description: 'Rotate all currently selected 3D objects by 90 degrees on the Y axis.',
    category: 'build_tools',
    modeScope: 'architect',
    isHoldAction: false,
    defaultKeys: ['KeyR']
  },
  {
    id: 'delete_asset',
    label: 'Delete Selected Object(s)',
    description: 'Remove selected 3D objects from the active floor (Undoable via Ctrl+Z).',
    category: 'build_tools',
    modeScope: 'architect',
    isHoldAction: false,
    defaultKeys: ['Delete', 'Backspace']
  },
  {
    id: 'wall_tool',
    label: 'Equip Seamless Wall Drag Tool',
    description: 'Activate the Wall blueprint tool to click and drag connected wall rows.',
    category: 'build_tools',
    modeScope: 'architect',
    isHoldAction: false,
    defaultKeys: ['KeyB']
  },
  {
    id: 'clear_selection',
    label: 'Clear Selection / Cancel Tool',
    description: 'Deselect active objects, cancel active blueprint placement, or blur inputs.',
    category: 'build_tools',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['Escape']
  },
  {
    id: 'toggle_keybindings',
    label: 'Toggle Keybindings Selection Window',
    description: 'Open or close the User-Defined Keybindings & Control Mapping window.',
    category: 'system_modes',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['KeyK']
  },
  {
    id: 'reset_windows',
    label: 'Reset Floating Studio Windows Layout',
    description: 'Restore all floating studio windows to their default coordinates and sizes.',
    category: 'system_modes',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['KeyH']
  },
  {
    id: 'toggle_mute',
    label: 'Toggle Master UI Audio Mute',
    description: 'Mute or unmute studio sound effects.',
    category: 'system_modes',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['KeyM']
  },
  {
    id: 'mode_build',
    label: 'Switch to 1 · Build Mode',
    description: 'Switch workspace directly to 3D Architectural Build Mode.',
    category: 'system_modes',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['Digit1']
  },
  {
    id: 'mode_character',
    label: 'Switch to 2 · Create-A-Character',
    description: 'Switch workspace directly to 3D Skeleton & AI Character Studio.',
    category: 'system_modes',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['Digit2']
  },
  {
    id: 'mode_walkthrough',
    label: 'Switch to 3 · First-Person Walk',
    description: 'Switch workspace directly to First-Person Mystery Walkthrough Mode.',
    category: 'system_modes',
    modeScope: 'global',
    isHoldAction: false,
    defaultKeys: ['Digit3']
  }
];

export const DEFAULT_KEYBINDINGS: KeybindingsMap = DEFAULT_KEYBIND_SPECS.reduce((acc, spec) => {
  acc[spec.id] = [...spec.defaultKeys];
  return acc;
}, {} as KeybindingsMap);

const HUMAN_KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑ Up',
  ArrowDown: '↓ Down',
  ArrowLeft: '← Left',
  ArrowRight: '→ Right',
  Space: 'Space',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
  Delete: 'Del',
  Backspace: 'Backspace',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/'
};

export function formatKeyCodeLabel(code: string): string {
  if (!code) return 'Unbound';
  if (HUMAN_KEY_LABELS[code]) return HUMAN_KEY_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return `Num ${code.slice(6)}`;
  }
  return code;
}

export function formatActionKeysSummary(
  actionId: KeybindActionId,
  bindings: KeybindingsMap = DEFAULT_KEYBINDINGS
): string {
  const codes = bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || [];
  if (codes.length === 0) return 'Unbound';
  return codes.map(formatKeyCodeLabel).join(' / ');
}

export function getPrimaryActionKeyLabel(
  actionId: KeybindActionId,
  bindings: KeybindingsMap = DEFAULT_KEYBINDINGS
): string {
  const codes = bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || [];
  return codes.length > 0 ? formatKeyCodeLabel(codes[0]) : 'Unbound';
}

/**
 * Normalizes and merges a partial or saved keybindings object with DEFAULT_KEYBINDINGS,
 * guaranteeing that every action has its existing default keys unless customized.
 */
export function normalizeAndMergeKeybindings(
  raw?: Partial<Record<string, unknown>> | null
): KeybindingsMap {
  const merged: KeybindingsMap = {} as KeybindingsMap;
  for (const spec of DEFAULT_KEYBIND_SPECS) {
    const candidate = raw?.[spec.id];
    if (Array.isArray(candidate)) {
      const cleaned = Array.from(
        new Set(
          candidate
            .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            .map((k) => k.trim())
        )
      );
      merged[spec.id] = cleaned.length > 0 ? cleaned : [...spec.defaultKeys];
    } else {
      merged[spec.id] = [...spec.defaultKeys];
    }
  }
  return merged;
}

/**
 * Updates a specific key slot (`slotIndex`) or appends a new key (`slotIndex === -1` or `>= length`)
 * for an action while preserving all other bound keys on that action.
 */
export function updateActionKeybinding(
  bindings: KeybindingsMap,
  actionId: KeybindActionId,
  newKeyCode: string,
  slotIndex?: number
): KeybindingsMap {
  const trimmed = (newKeyCode || '').trim();
  if (!trimmed) return bindings;

  const current = [...(bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || [])];
  let nextKeys: string[];

  if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < current.length) {
    nextKeys = [...current];
    nextKeys[slotIndex] = trimmed;
  } else {
    nextKeys = [...current, trimmed];
  }

  // Deduplicate while preserving order
  const deduped = Array.from(new Set(nextKeys));
  return {
    ...bindings,
    [actionId]: deduped
  };
}

/**
 * Removes a specific bound key code from an action, ensuring at least 1 key remains bound
 * (falls back to the action's primary default key if the last key is removed).
 */
export function removeActionKeyCode(
  bindings: KeybindingsMap,
  actionId: KeybindActionId,
  keyCodeToRemove: string
): KeybindingsMap {
  const current = bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || [];
  const filtered = current.filter((k) => k !== keyCodeToRemove);
  const fallback = DEFAULT_KEYBINDINGS[actionId] || ['KeyE'];
  return {
    ...bindings,
    [actionId]: filtered.length > 0 ? filtered : [fallback[0]]
  };
}

/**
 * Resets a single action back to its original default keybindings.
 */
export function resetActionKeybinding(
  bindings: KeybindingsMap,
  actionId: KeybindActionId
): KeybindingsMap {
  return {
    ...bindings,
    [actionId]: [...(DEFAULT_KEYBINDINGS[actionId] || [])]
  };
}

// Pairs of actions that intentionally share a secondary/context key in default controls
const INTENTIONAL_SHARED_KEY_PAIRS = new Set([
  'move_left|turn_left',
  'move_right|turn_right',
  'camera_down|stealth_crouch'
]);

/**
 * Detects non-intentional keybinding conflicts across overlapping mode scopes.
 */
export function detectKeybindingConflicts(
  bindings: KeybindingsMap
): KeybindingConflictWarning[] {
  const keyToSpecs = new Map<string, KeybindActionSpec[]>();

  for (const spec of DEFAULT_KEYBIND_SPECS) {
    const codes = bindings[spec.id] || [];
    for (const code of codes) {
      const list = keyToSpecs.get(code) || [];
      list.push(spec);
      keyToSpecs.set(code, list);
    }
  }

  const warnings: KeybindingConflictWarning[] = [];

  for (const [keyCode, specs] of keyToSpecs.entries()) {
    if (specs.length < 2) continue;

    // Check if any pair of specs overlaps in modeScope and is not an intentional default shared pair
    const conflictingSpecs: KeybindActionSpec[] = [];
    for (let i = 0; i < specs.length; i++) {
      for (let j = i + 1; j < specs.length; j++) {
        const a = specs[i];
        const b = specs[j];
        const scopesOverlap =
          a.modeScope === 'global' ||
          b.modeScope === 'global' ||
          a.modeScope === b.modeScope;
        const pairKey = [a.id, b.id].sort().join('|');
        const isIntentionalDefault = INTENTIONAL_SHARED_KEY_PAIRS.has(pairKey);

        if (scopesOverlap && !isIntentionalDefault) {
          if (!conflictingSpecs.some((s) => s.id === a.id)) conflictingSpecs.push(a);
          if (!conflictingSpecs.some((s) => s.id === b.id)) conflictingSpecs.push(b);
        }
      }
    }

    if (conflictingSpecs.length >= 2) {
      warnings.push({
        keyCode,
        keyLabel: formatKeyCodeLabel(keyCode),
        actions: conflictingSpecs.map((s) => s.id),
        actionLabels: conflictingSpecs.map((s) => s.label),
        scopeNote: `Key [${formatKeyCodeLabel(keyCode)}] is assigned to ${conflictingSpecs
          .map((s) => `"${s.label}"`)
          .join(' and ')}.`
      });
    }
  }

  return warnings;
}

/**
 * Checks if a single KeyboardEvent.code matches any bound key for `actionId`.
 */
export function isActionKeyPressed(
  actionId: KeybindActionId,
  eventCode: string,
  bindings: KeybindingsMap = DEFAULT_KEYBINDINGS
): boolean {
  if (!eventCode) return false;
  const codes = bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || [];
  return codes.includes(eventCode);
}

/**
 * Checks if any bound key for `actionId` is currently held down in `keysHeld`.
 */
export function isActionKeyHeld(
  actionId: KeybindActionId,
  keysHeld: ReadonlySet<string>,
  bindings: KeybindingsMap = DEFAULT_KEYBINDINGS
): boolean {
  const codes = bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || [];
  for (let i = 0; i < codes.length; i++) {
    if (keysHeld.has(codes[i])) return true;
  }
  return false;
}

export interface BuildCameraMovementStep {
  forwardInput: number;
  rightInput: number;
  upInput: number;
  isSprinting: boolean;
  moveSpeed: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Computes 3D Build / Camera Mode ('architect' | 'soundboard') movement where keyboard keys
 * control the camera position and elevation:
 * - W/S or ArrowUp/ArrowDown pan camera forward/backward along camera yaw (`theta`)
 * - A/D or ArrowLeft/ArrowRight pan camera left/right
 * - Space / PageUp (`camera_up`) elevates camera vertically up
 * - Ctrl (`ControlLeft`/`ControlRight`) / C / PageDown (`camera_down`) lowers camera vertically down
 *   (automatically suppressed during Ctrl+C, Ctrl+V, Ctrl+Z editor shortcut chords)
 * - Shift (`sprint_camera`) doubles camera translation speed
 */
export function computeBuildCameraMovementStep(params: {
  theta: number;
  dt: number;
  keysHeld: ReadonlySet<string>;
  bindings?: KeybindingsMap;
}): BuildCameraMovementStep {
  const kb = params.bindings || DEFAULT_KEYBINDINGS;
  const { keysHeld, theta, dt } = params;

  const isCtrlHeld = keysHeld.has('ControlLeft') || keysHeld.has('ControlRight');
  const isEditorShortcutChord =
    isCtrlHeld &&
    (keysHeld.has('KeyC') ||
      keysHeld.has('KeyV') ||
      keysHeld.has('KeyZ') ||
      keysHeld.has('KeyY') ||
      keysHeld.has('KeyX'));

  let forwardInput = 0;
  let rightInput = 0;
  let upInput = 0;

  if (!isEditorShortcutChord) {
    if (isActionKeyHeld('move_forward', keysHeld, kb)) forwardInput += 1;
    if (isActionKeyHeld('move_backward', keysHeld, kb)) forwardInput -= 1;
    if (isActionKeyHeld('move_right', keysHeld, kb)) rightInput += 1;
    if (isActionKeyHeld('move_left', keysHeld, kb)) rightInput -= 1;

    if (isActionKeyHeld('camera_up', keysHeld, kb) || keysHeld.has('Space')) {
      upInput += 1;
    }
    if (isActionKeyHeld('camera_down', keysHeld, kb) || isCtrlHeld) {
      upInput -= 1;
    }
  }

  const isSprinting = isActionKeyHeld('sprint_camera', keysHeld, kb);
  const moveSpeed = (isSprinting ? 24.0 : 12.0) * dt;
  const { dx, dy, dz } =
    forwardInput !== 0 || rightInput !== 0 || upInput !== 0
      ? computeFirstPersonCameraDisplacement(theta, forwardInput, rightInput, upInput, moveSpeed)
      : { dx: 0, dy: 0, dz: 0 };

  return {
    forwardInput,
    rightInput,
    upInput,
    isSprinting,
    moveSpeed,
    dx,
    dy,
    dz
  };
}

export interface FirstPersonCharacterMovementStep {
  forwardInput: number;
  strafeInput: number;
  turnDelta: number;
  isCrouching: boolean;
  isSprinting: boolean;
  speedMetersPerSec: number;
  dx: number;
  dz: number;
  nextYaw: number;
  targetEyeHeight: number;
  nextEyeHeight: number;
  nextY: number;
  nextVy: number;
  isGrounded: boolean;
  didJump: boolean;
}

/**
 * Computes standard First-Person Mode ('walkthrough') character movement where keyboard keys
 * move the physical character along the floor rather than free-flying the camera:
 * - W/S or ArrowUp/ArrowDown walk the character forward/backward
 * - A/D strafe the character left/right
 * - Q / ArrowLeft / ArrowRight rotate character yaw
 * - Ctrl (`ControlLeft`/`ControlRight`) or C (`stealth_crouch`) crouches the character
 *   (smoothly lowering eyeHeight from 1.62m to 1.02m, slowing to 2.45m/s stealth speed, silencing footsteps)
 * - Space triggers a grounded character jump (`vy = 3.8` m/s) with gravity (`12.5` m/s²) returning `y` to `0` on the floor
 * - Shift (`sprint_camera`) when standing increases character movement speed to a brisk walk/sprint (`6.4` m/s)
 */
export function computeFirstPersonCharacterMovementStep(params: {
  yaw: number;
  eyeHeight: number;
  y: number;
  vy: number;
  dt: number;
  keysHeld: ReadonlySet<string>;
  crouchToggled?: boolean;
  bindings?: KeybindingsMap;
}): FirstPersonCharacterMovementStep {
  const kb = params.bindings || DEFAULT_KEYBINDINGS;
  const { keysHeld, dt } = params;

  const turnSpeed = 1.95 * dt;
  let turnDelta = 0;
  if (isActionKeyHeld('turn_left', keysHeld, kb)) turnDelta += turnSpeed;
  if (isActionKeyHeld('turn_right', keysHeld, kb)) turnDelta -= turnSpeed;
  const nextYaw = params.yaw + turnDelta;

  const isCrouching =
    Boolean(params.crouchToggled) ||
    isActionKeyHeld('stealth_crouch', keysHeld, kb) ||
    keysHeld.has('ControlLeft') ||
    keysHeld.has('ControlRight');

  const isSprinting = !isCrouching && isActionKeyHeld('sprint_camera', keysHeld, kb);

  const targetEyeHeight = isCrouching ? 1.02 : 1.62;
  const nextEyeHeight =
    params.eyeHeight + (targetEyeHeight - params.eyeHeight) * Math.min(1, 12 * dt);

  let forwardInput = 0;
  let strafeInput = 0;
  if (isActionKeyHeld('move_forward', keysHeld, kb)) forwardInput += 1;
  if (isActionKeyHeld('move_backward', keysHeld, kb)) forwardInput -= 1;

  // In Walk mode, ArrowLeft/ArrowRight default to turning unless explicitly only bound to strafing
  const strafeLeftHeld = (kb.move_left || []).some(
    (code) => keysHeld.has(code) && !(kb.turn_left || []).includes(code)
  );
  const strafeRightHeld = (kb.move_right || []).some(
    (code) => keysHeld.has(code) && !(kb.turn_right || []).includes(code)
  );
  if (strafeLeftHeld) strafeInput -= 1;
  if (strafeRightHeld) strafeInput += 1;

  const speedMetersPerSec = isCrouching ? 2.45 : isSprinting ? 6.4 : 4.5;
  const stepDist = speedMetersPerSec * dt;

  // Normalize diagonal input so diagonal walking doesn't exceed straight speed
  const inputMag = Math.hypot(forwardInput, strafeInput);
  const normForward = inputMag > 1 ? forwardInput / inputMag : forwardInput;
  const normStrafe = inputMag > 1 ? strafeInput / inputMag : strafeInput;

  const forwardX = -Math.sin(nextYaw);
  const forwardZ = -Math.cos(nextYaw);
  const rightX = Math.cos(nextYaw);
  const rightZ = -Math.sin(nextYaw);

  const dx = (forwardX * normForward + rightX * normStrafe) * stepDist;
  const dz = (forwardZ * normForward + rightZ * normStrafe) * stepDist;

  // Grounded First-Person Jump & Gravity (Space jumps from floor y=0; never flies infinitely)
  let nextY = Math.max(0, Number.isFinite(params.y) ? params.y : 0);
  let nextVy = Number.isFinite(params.vy) ? params.vy : 0;
  let didJump = false;

  const wasGrounded = nextY <= 0.001;
  if (wasGrounded && keysHeld.has('Space') && !isCrouching) {
    nextVy = 3.8;
    didJump = true;
  }

  if (nextY > 0 || nextVy > 0) {
    nextY += nextVy * dt;
    nextVy -= 12.5 * dt;
    if (nextY <= 0) {
      nextY = 0;
      nextVy = 0;
    }
  } else {
    nextY = 0;
    nextVy = 0;
  }

  const isGrounded = nextY <= 0.001;

  return {
    forwardInput,
    strafeInput,
    turnDelta,
    isCrouching,
    isSprinting,
    speedMetersPerSec,
    dx,
    dz,
    nextYaw,
    targetEyeHeight,
    nextEyeHeight,
    nextY,
    nextVy,
    isGrounded,
    didJump
  };
}


// ============================================================================
// MESHY.AI AUTO-RIGGING & LOW-FRAME CHARACTER ANIMATION ENGINE
// (Alterations 1, 2, and 3 — Global FPS Stepper, Keyframe Decimation,
//  Full-Rate 3D Facial Rig Overlay, and Distance/Off-Floor LOD Throttling)
// ============================================================================

export type GlobalAnimationFps = 6 | 8 | 12 | 24;

export const ALLOWED_GLOBAL_ANIMATION_FPS: readonly GlobalAnimationFps[] = [6, 8, 12, 24] as const;

export const DEFAULT_GLOBAL_ANIMATION_FPS: GlobalAnimationFps = 8;

export interface MeshyAnimationActionPreset {
  gesture: ScheduledActivityGesture;
  actionId: number;
  actionName: string;
  categoryLabel: string;
  cycleDurationSec: number;
  description: string;
}

/**
 * Maps each scheduled tenant/character activity gesture to Meshy.ai's
 * `/openapi/v1/animations` library `action_id` preset.
 */
export const MESHY_ANIMATION_PRESETS: Record<ScheduledActivityGesture, MeshyAnimationActionPreset> = {
  idle_observe: {
    gesture: 'idle_observe',
    actionId: 0,
    actionName: 'Idle_Observe_Breathing',
    categoryLabel: 'Daily · Idle Observe',
    cycleDurationSec: 2.5,
    description: 'Low-frame subtle weight shift and watchful corridor scan (Meshy Action #0).'
  },
  pace_corridor: {
    gesture: 'pace_corridor',
    actionId: 1,
    actionName: 'Walk_Corridor_Patrol',
    categoryLabel: 'Locomotion · Corridor Stride',
    cycleDurationSec: 1.5,
    description: 'Measured bipedal walking gait with cane/arm swing synchronization (Meshy Action #1).'
  },
  inspect_ledger: {
    gesture: 'inspect_ledger',
    actionId: 22,
    actionName: 'Inspect_Desk_Ledger',
    categoryLabel: 'Investigation · Inspect Ledger',
    cycleDurationSec: 2.0,
    description: 'Forward thoracic lean with raised right forearm examining registry notes (Meshy Action #22).'
  },
  wall_listen: {
    gesture: 'wall_listen',
    actionId: 45,
    actionName: 'Eavesdrop_Wall_Lean',
    categoryLabel: 'Stealth · Wall Listen',
    cycleDurationSec: 2.5,
    description: 'Conspiratorial ear-to-wainscoting tilt with cupped hand posture (Meshy Action #45).'
  },
  parlor_social: {
    gesture: 'parlor_social',
    actionId: 92,
    actionName: 'Parlor_Converse_Gesture',
    categoryLabel: 'Social · Parlor Converse',
    cycleDurationSec: 2.0,
    description: 'Expressive wrist and shoulder cadence for lobby social hour (Meshy Action #92).'
  },
  sleepwalk_trance: {
    gesture: 'sleepwalk_trance',
    actionId: 118,
    actionName: 'Sleepwalk_Hollow_Trance',
    categoryLabel: 'Occult · Sleepwalk Trance',
    cycleDurationSec: 3.0,
    description: 'Somnambulist swaying drift with outstretched forearms and hollow head pitch (Meshy Action #118).'
  },
  sit_chair: {
    gesture: 'sit_chair',
    actionId: 132,
    actionName: 'Sit_In_Chair_Shared',
    categoryLabel: 'Interact · Sit in Chair',
    cycleDurationSec: 2.0,
    description: 'Shared basic seated posture with 90-degree hip/knee bend and hands resting on armrests (Meshy Action #132).'
  },
  open_door: {
    gesture: 'open_door',
    actionId: 145,
    actionName: 'Open_Door_Handle_Shared',
    categoryLabel: 'Interact · Open Door',
    cycleDurationSec: 1.5,
    description: 'Shared basic door handle reach, brass latch turn, and pull/push swing motion (Meshy Action #145).'
  },
  press_button: {
    gesture: 'press_button',
    actionId: 152,
    actionName: 'Reach_Touch_Button_Shared',
    categoryLabel: 'Interact · Press Button / Switch',
    cycleDurationSec: 1.2,
    description: 'Shared basic reach-out-and-touch right-hand button press animation for all button-activated assets (Meshy Action #152).'
  },
  pickup_item: {
    gesture: 'pickup_item',
    actionId: 164,
    actionName: 'Place_Pickup_Item_Shared',
    categoryLabel: 'Interact · Place / Pickup Item',
    cycleDurationSec: 1.6,
    description: 'Shared basic knee-bend and two-handed reach to place or pick up items (Meshy Action #164).'
  },
  lay_bed: {
    gesture: 'lay_bed',
    actionId: 178,
    actionName: 'Lay_In_Bed_Shared',
    categoryLabel: 'Interact · Lay in Bed',
    cycleDurationSec: 3.0,
    description: 'Shared basic horizontal reclining posture for beds and cots (Meshy Action #178).'
  },
  crawl: {
    gesture: 'crawl',
    actionId: 186,
    actionName: 'Low_Crawl_Shared',
    categoryLabel: 'Locomotion · Crawl',
    cycleDurationSec: 1.8,
    description: 'Shared basic hands-and-knees low crawl cycle for crawlspaces and shafts (Meshy Action #186).'
  },
  run: {
    gesture: 'run',
    actionId: 194,
    actionName: 'Brisk_Run_Shared',
    categoryLabel: 'Locomotion · Run',
    cycleDurationSec: 1.0,
    description: 'Shared basic rapid bipedal run cycle with high knee drive and pumped forearms (Meshy Action #194).'
  }
};

export interface DecimatedPoseKeyframe {
  frameIndex: number;
  timeSec: number;
  pose: SkeletonPoseEuler;
}

export interface MeshyCharacterAnimationClipSpec {
  rigTaskId: string;
  animationTaskId: string;
  gesture: ScheduledActivityGesture;
  actionId: number;
  actionName: string;
  sourceFps: number;
  bakedFps: GlobalAnimationFps;
  cycleDurationSec: number;
  originalFrameCount: number;
  decimatedFrameCount: number;
  keyframeReductionPct: number;
  postProcessOperation: 'change_fps';
  status: 'SUCCEEDED' | 'SYNTHESIZED_LOW_FRAME';
  riggedGlbUrl?: string;
  animationGlbUrl?: string;
  bakedAtIso: string;
  decimatedKeyframes: DecimatedPoseKeyframe[];
}

export interface MeshyRiggingApiPayload {
  model_url: string;
  height_meters: number;
}

export interface MeshyAnimationApiPayload {
  rig_task_id: string;
  action_id: number;
  post_process: {
    operation_type: 'change_fps';
    fps: GlobalAnimationFps;
  };
}

/**
 * Normalizes any numeric FPS input to one of the global low-frame step rates (6, 8, 12, 24).
 */
export function normalizeGlobalAnimationFps(fps?: number): GlobalAnimationFps {
  if (fps === 6 || fps === 8 || fps === 12 || fps === 24) {
    return fps;
  }
  if (typeof fps === 'number' && Number.isFinite(fps)) {
    if (fps <= 7) return 6;
    if (fps <= 10) return 8;
    if (fps <= 18) return 12;
    return 24;
  }
  return DEFAULT_GLOBAL_ANIMATION_FPS;
}

/**
 * Builds the official Meshy.ai `/openapi/v1/rigging` request payload.
 */
export function buildMeshyRiggingRequestPayload(
  modelUrl: string,
  appearance?: Partial<CharacterAppearance>
): MeshyRiggingApiPayload {
  const scale = appearance?.heightScale ?? 1.0;
  const heightMeters = Number(Math.max(1.2, Math.min(2.2, 1.75 * scale)).toFixed(2));
  return {
    model_url: modelUrl.trim() || 'https://assets.meshy.ai/alderney/default_humanoid_hull.glb',
    height_meters: heightMeters
  };
}

/**
 * Builds the official Meshy.ai `/openapi/v1/animations` request payload with
 * `post_process: { operation_type: "change_fps", fps }` to minimize frame density at source.
 */
export function buildMeshyAnimateRequestPayload(
  rigTaskId: string,
  gesture: ScheduledActivityGesture,
  globalFps: GlobalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS
): MeshyAnimationApiPayload {
  const preset = MESHY_ANIMATION_PRESETS[gesture] || MESHY_ANIMATION_PRESETS.idle_observe;
  const validFps = normalizeGlobalAnimationFps(globalFps);
  return {
    rig_task_id: rigTaskId.trim() || 'meshy_rig_default',
    action_id: preset.actionId,
    post_process: {
      operation_type: 'change_fps',
      fps: validFps
    }
  };
}

/**
 * Alteration 1: Quantizes continuous elapsed seconds into discrete low-frame time steps
 * (`stepInterval = 1 / effectiveFps`), creating a deliberate stop-motion / low-frame step clock.
 */
export function quantizeAnimationTimeToStep(
  continuousTimeSec: number,
  effectiveFps: number = DEFAULT_GLOBAL_ANIMATION_FPS
): {
  steppedTimeSec: number;
  stepIndex: number;
  stepIntervalSec: number;
} {
  const safeFps = Math.max(1, Math.min(60, effectiveFps || DEFAULT_GLOBAL_ANIMATION_FPS));
  const stepIntervalSec = 1 / safeFps;
  const safeTime = Math.max(0, Number.isFinite(continuousTimeSec) ? continuousTimeSec : 0);
  const stepIndex = Math.floor(safeTime * safeFps + 1e-7);
  const steppedTimeSec = Number((stepIndex * stepIntervalSec).toFixed(5));
  return {
    steppedTimeSec,
    stepIndex,
    stepIntervalSec
  };
}

/**
 * Alteration 1: Client-side / Server-side keyframe decimation & baking for a character rig.
 * Samples dense 60 FPS skeletal motion down to `globalFps` discrete keyframes and computes
 * exact keyframe reduction savings.
 */
export function decimateAnimationKeyframes(
  appearance: CharacterAppearance,
  gesture: ScheduledActivityGesture,
  globalFps: GlobalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS,
  rigTaskId = 'meshy_rig_local',
  animationTaskId = 'meshy_anim_local',
  sourceFps = 60
): MeshyCharacterAnimationClipSpec {
  const validFps = normalizeGlobalAnimationFps(globalFps);
  const preset = MESHY_ANIMATION_PRESETS[gesture] || MESHY_ANIMATION_PRESETS.idle_observe;
  const cycleDurationSec = preset.cycleDurationSec;
  const originalFrameCount = Math.max(1, Math.round(cycleDurationSec * sourceFps));
  const decimatedFrameCount = Math.max(2, Math.round(cycleDurationSec * validFps));
  const isMoving = gesture === 'pace_corridor' || gesture === 'sleepwalk_trance';

  const decimatedKeyframes: DecimatedPoseKeyframe[] = [];
  for (let i = 0; i < decimatedFrameCount; i++) {
    const timeSec = Number(((i / validFps) % cycleDurationSec).toFixed(4));
    const pose = computeSkeletonPose(
      timeSec,
      isMoving,
      appearance.spineCurvature ?? 0,
      appearance.hasWalkingCane ?? false,
      false,
      gesture
    );
    decimatedKeyframes.push({
      frameIndex: i,
      timeSec,
      pose
    });
  }

  const keyframeReductionPct = Math.max(
    0,
    Math.min(95, Math.round(((originalFrameCount - decimatedFrameCount) / originalFrameCount) * 100))
  );

  return {
    rigTaskId,
    animationTaskId,
    gesture,
    actionId: preset.actionId,
    actionName: preset.actionName,
    sourceFps,
    bakedFps: validFps,
    cycleDurationSec,
    originalFrameCount,
    decimatedFrameCount,
    keyframeReductionPct,
    postProcessOperation: 'change_fps',
    status: rigTaskId.startsWith('meshy_live_') ? 'SUCCEEDED' : 'SYNTHESIZED_LOW_FRAME',
    bakedAtIso: new Date().toISOString(),
    decimatedKeyframes
  };
}

/**
 * Samples a pre-baked `MeshyCharacterAnimationClipSpec` at a stepped timestamp, or falls back
 * to stepped procedural evaluation if no clip is baked for the active gesture.
 */
export function sampleDecimatedClipPose(
  appearance: CharacterAppearance,
  gesture: ScheduledActivityGesture,
  steppedTimeSec: number,
  isMoving: boolean,
  isSpeaking = false
): SkeletonPoseEuler {
  const clip = appearance.googleAiAnimations?.[gesture] || appearance.meshyAnimations?.[gesture];
  if (clip && Array.isArray(clip.decimatedKeyframes) && clip.decimatedKeyframes.length > 0 && !isMoving && !isSpeaking) {
    const cycle = Math.max(0.25, clip.cycleDurationSec || 2.0);
    const wrapped = ((steppedTimeSec % cycle) + cycle) % cycle;
    const idx = Math.min(
      clip.decimatedKeyframes.length - 1,
      Math.floor((wrapped / cycle) * clip.decimatedKeyframes.length)
    );
    return clip.decimatedKeyframes[idx].pose;
  }
  return computeSkeletonPose(
    steppedTimeSec,
    isMoving,
    appearance.spineCurvature ?? 0,
    appearance.hasWalkingCane ?? false,
    isSpeaking,
    gesture
  );
}

export type CharacterAnimationLodTier =
  | 'full_stepped'
  | 'half_stepped'
  | 'minimal_stepped'
  | 'culled';

export interface CharacterAnimationLodState {
  tier: CharacterAnimationLodTier;
  effectiveBodyFps: number;
  steppedTimeSec: number;
  stepIndex: number;
  shouldUpdateBody: boolean;
  shouldUpdateFace: boolean;
  distanceMeters: number;
  cpuSavingsEstimatePct: number;
}

/**
 * Alteration 3: Distance and off-floor animation LOD throttling.
 * - Off-floor or > 35m: `'culled'` (0 FPS body & face updates, 100% CPU saved)
 * - 24m to 35m: `'minimal_stepped'` (2 FPS body updates, face updates paused)
 * - 12m to 24m: `'half_stepped'` (`Math.max(4, Math.floor(globalFps / 2))` FPS body updates, active face)
 * - 0m to 12m: `'full_stepped'` (`globalFps` body updates, full 60Hz facial expressions & lip-sync)
 */
export function computeCharacterAnimationLodState(params: {
  characterFloor: FloorId;
  activeFloor: FloorId;
  isFloorVisible?: boolean;
  distanceMeters: number;
  continuousTimeSec: number;
  lastUpdatedStepIndex?: number;
  globalFps?: GlobalAnimationFps;
}): CharacterAnimationLodState {
  const {
    characterFloor,
    activeFloor,
    isFloorVisible = characterFloor === activeFloor,
    distanceMeters,
    continuousTimeSec,
    lastUpdatedStepIndex,
    globalFps = DEFAULT_GLOBAL_ANIMATION_FPS
  } = params;

  const validGlobalFps = normalizeGlobalAnimationFps(globalFps);
  const safeDist = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0);

  if (!isFloorVisible || safeDist > 35) {
    return {
      tier: 'culled',
      effectiveBodyFps: 0,
      steppedTimeSec: 0,
      stepIndex: -1,
      shouldUpdateBody: false,
      shouldUpdateFace: false,
      distanceMeters: Number(safeDist.toFixed(2)),
      cpuSavingsEstimatePct: 100
    };
  }

  let tier: CharacterAnimationLodTier = 'full_stepped';
  let effectiveBodyFps: number = validGlobalFps;
  let shouldUpdateFace = true;

  if (safeDist > 24) {
    tier = 'minimal_stepped';
    effectiveBodyFps = 2;
    shouldUpdateFace = false;
  } else if (safeDist > 12) {
    tier = 'half_stepped';
    effectiveBodyFps = Math.max(4, Math.floor(validGlobalFps / 2));
    shouldUpdateFace = true;
  }

  const { steppedTimeSec, stepIndex } = quantizeAnimationTimeToStep(
    continuousTimeSec,
    effectiveBodyFps
  );

  const shouldUpdateBody =
    lastUpdatedStepIndex === undefined || lastUpdatedStepIndex !== stepIndex;

  const cpuSavingsEstimatePct = Math.max(
    0,
    Math.min(98, Math.round(((60 - effectiveBodyFps) / 60) * 100))
  );

  return {
    tier,
    effectiveBodyFps,
    steppedTimeSec,
    stepIndex,
    shouldUpdateBody,
    shouldUpdateFace,
    distanceMeters: Number(safeDist.toFixed(2)),
    cpuSavingsEstimatePct
  };
}

/**
 * Alteration 2: Evaluates the hybrid low-frame character rig state where:
 * - Body skeleton joints (`bodyPose`) are evaluated ONLY on discrete low-frame stepped ticks (`steppedTimeSec`)
 * - 3D facial expression & speech lip-sync (`facialRig`) remain active at full continuous frame rate (`continuousTimeSec`)
 */
export function evaluateHybridLowFrameRigState(params: {
  appearance: CharacterAppearance;
  gesture: ScheduledActivityGesture;
  isMoving: boolean;
  isSpeaking: boolean;
  continuousTimeSec: number;
  effectiveFps?: number;
  disposition?: TenantDisposition;
  hasUnansweredQuestions?: boolean;
  cachedBodyPose?: SkeletonPoseEuler;
  lastStepIndex?: number;
}): {
  bodyPose: SkeletonPoseEuler;
  facialRig: FacialRigParams;
  steppedTimeSec: number;
  stepIndex: number;
  bodyPoseRecomputed: boolean;
} {
  const {
    appearance,
    gesture,
    isMoving,
    isSpeaking,
    continuousTimeSec,
    effectiveFps = DEFAULT_GLOBAL_ANIMATION_FPS,
    disposition,
    hasUnansweredQuestions = false,
    cachedBodyPose,
    lastStepIndex
  } = params;

  const safeFps = Math.max(1, Math.min(60, effectiveFps || DEFAULT_GLOBAL_ANIMATION_FPS));
  const { steppedTimeSec, stepIndex } = quantizeAnimationTimeToStep(continuousTimeSec, safeFps);

  const shouldRecomputeBody =
    !cachedBodyPose || lastStepIndex === undefined || lastStepIndex !== stepIndex;

  const bodyPose = shouldRecomputeBody
    ? sampleDecimatedClipPose(appearance, gesture, steppedTimeSec, isMoving, isSpeaking)
    : cachedBodyPose;

  // Alteration 2: Full-rate 3D facial expression & lip-sync rig on top of low-frame body
  const isElderly =
    appearance.archetype === 'Elderly Matron' || (appearance.spineCurvature ?? 0) >= 20;
  const facialRig = computeFacialRigParams(
    appearance.facialExpression || 'neutral',
    disposition,
    isSpeaking,
    continuousTimeSec * 12,
    hasUnansweredQuestions,
    isElderly
  );

  return {
    bodyPose,
    facialRig,
    steppedTimeSec,
    stepIndex,
    bodyPoseRecomputed: shouldRecomputeBody
  };
}


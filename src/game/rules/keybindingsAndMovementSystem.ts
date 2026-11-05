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


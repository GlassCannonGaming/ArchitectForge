import { type CharacterAppearance, type CharacterArchetype, type CharacterVoiceProfile, type DailyActionEntry, type FacialExpressionType, type FacialRigParams, type FloorId, type HotelAgentProfile, INITIAL_CLUES, type NaturalCharacterAnatomySpec, type PendingTenantQuestion, type ScheduledActivityGesture, type SkeletonPoseEuler, type TenantDisposition, type TimeOfDayPhase } from './coreTypesAndFloors';
import { getOrCreateCharacterVoiceProfile, inferVoiceProfileFromArchetypeAndName } from './catalogVoiceAndSets';

export const DEFAULT_GLOBAL_INSTRUCTION_SET =
  'STRICT OFFLINE GAME-WORLD SANDBOX (NO INTERNET ACCESS): All characters operate strictly within The Alderney Arms Mystery Hotel universe—an unmaintained, faded red-brick residential apartment-hotel frozen in the late 1970s and early 1980s (peeling damask wallpaper, water-stained plaster, surface-mounted electrical conduits, woodgrain 1978 CRT TVs with rotary dials, a battered 1979 coin-op soda cooler, and faded avocado/harvest-gold suite kitchenettes alongside original dark walnut wainscoting and clanking steam radiators), where the tenants are permanent residents, some of whom have lived in their shadowy suites for decades. Characters have ZERO internet access or external web knowledge. Never reference real-world cities, money, finance, stocks, modern smartphones, modern internet, AI models, or out-of-universe facts. Characters may ONLY know and discuss: (1) their Starting Known Information (knownFacts), (2) their Personal Instruction Set & Personality (voice, demeanor, likes, dislikes), (3) their Saved Interaction & Dialogue History, and (4) the active Gameplay Time-of-Day Event & Daily Action Schedule.';

export const DEFAULT_DAILY_SCHEDULE: DailyActionEntry[] = [
  {
    phase: 'Morning',
    timeRange: '06:00 – 11:59',
    action: 'Inspecting brass room keys and reviewing the morning guest ledger.',
    location: 'Main Lobby & Corridor',
    eventTrigger: 'Morning Bell & Ledger Audit',
    targetFloor: 'lobby',
    targetPosition: [0, 0, -2.8],
    activityGesture: 'inspect_ledger',
    randomEventsEnabled: true,
    activeRandomEvent: null
  },
  {
    phase: 'Afternoon',
    timeRange: '12:00 – 16:59',
    action: 'Pacing near the wainscoting and sorting trunks in the suite.',
    location: 'Assigned Suite / Parlor',
    eventTrigger: 'Afternoon Check-In & Corridor Inspection',
    targetFloor: 'floor1',
    targetPosition: [-4.5, 0, -4.2],
    activityGesture: 'pace_corridor',
    randomEventsEnabled: true,
    activeRandomEvent: null
  },
  {
    phase: 'Evening',
    timeRange: '17:00 – 21:59',
    action: 'Listening to the cassette tape player and watching who enters the service stairwell.',
    location: 'West Parlor Lounge',
    eventTrigger: 'Lobby Lights Dimming & Parlor Social Hour',
    targetFloor: 'lobby',
    targetPosition: [-4.8, 0, 2.2],
    activityGesture: 'parlor_social',
    randomEventsEnabled: true,
    activeRandomEvent: null
  },
  {
    phase: 'Late Night',
    timeRange: '22:00 – 05:59',
    action: 'Checking hollow brick partitions and guarding personal notes behind locked doors.',
    location: 'Hidden Crawlspace / Suite Threshold',
    eventTrigger: 'Midnight Curfew & Hidden Passageway Activity',
    targetFloor: 'floor1',
    targetPosition: [-4.5, 0, -4.2],
    activityGesture: 'wall_listen',
    randomEventsEnabled: true,
    activeRandomEvent: null
  }
];

export const RANDOM_AI_SCHEDULE_EVENTS_POOL: Array<{
  title: string;
  action: string;
  location: string;
  targetFloor: FloorId;
  targetPosition: [number, number, number];
  gesture: ScheduledActivityGesture;
}> = [
  {
    title: 'Anomalous Stethoscope Wall-Listening',
    action: 'Pressing a brass ear-trumpet against the hollow brick partition behind Room 101.',
    location: 'Room 101 North Partition',
    targetFloor: 'floor1',
    targetPosition: [-4.2, 0, -4.5],
    gesture: 'wall_listen'
  },
  {
    title: 'Midnight Switchboard Interception',
    action: 'Secretly listening to cross-patched rotary phone lines at the Lobby Switchboard.',
    location: 'Main Lobby & Corridor',
    targetFloor: 'lobby',
    targetPosition: [-3.2, 0, -4.2],
    gesture: 'inspect_ledger'
  },
  {
    title: 'Parlor Cassette Rewind Ritual',
    action: 'Playing a 1979 Walkman cassette tape in reverse beside the flickering parlor lamp.',
    location: 'West Parlor Lounge',
    targetFloor: 'lobby',
    targetPosition: [-5.4, 0, 2.6],
    gesture: 'parlor_social'
  },
  {
    title: 'Service Dumbwaiter Inspection',
    action: 'Peering down the drafty service shaft between Suite 201 and Suite 202.',
    location: 'Suite 202 Corridor',
    targetFloor: 'floor2',
    targetPosition: [0.5, 0, -3.5],
    gesture: 'wall_listen'
  },
  {
    title: 'Sub-Vault Sleepwalk Trance',
    action: 'Standing motionless in a hollow-eyed trance near the Basement boiler room threshold.',
    location: 'Basement Boiler Room',
    targetFloor: 'basement',
    targetPosition: [0, 0, -2.5],
    gesture: 'sleepwalk_trance'
  }
];

/**
 * Resolves a human-readable hotel location label or room number into a concrete 3D FloorId and [x, y, z] coordinates.
 */
export function resolveDailyLocationCoords(
  locationLabel: string,
  fallbackFloor: FloorId = 'floor1',
  fallbackPos: [number, number, number] = [0, 0, 0],
  agentIndex = 0
): { floor: FloorId; position: [number, number, number]; defaultGesture: ScheduledActivityGesture } {
  const loc = (locationLabel || '').toLowerCase();
  const offsetAngle = (agentIndex * 1.57) % (Math.PI * 2);
  const spreadX = Math.round(Math.cos(offsetAngle) * 1.1 * 10) / 10;
  const spreadZ = Math.round(Math.sin(offsetAngle) * 0.9 * 10) / 10;

  if (loc.includes('parlor') || loc.includes('social')) {
    return {
      floor: 'lobby',
      position: [-4.6 + spreadX, 0, 2.2 + spreadZ],
      defaultGesture: 'parlor_social'
    };
  }
  if (loc.includes('lobby') || loc.includes('front desk') || loc.includes('switchboard') || loc.includes('registration')) {
    return {
      floor: 'lobby',
      position: [spreadX * 1.6, 0, -2.8 + spreadZ * 0.6],
      defaultGesture: 'inspect_ledger'
    };
  }
  if (loc.includes('basement') || loc.includes('boiler') || loc.includes('vault')) {
    return {
      floor: 'basement',
      position: [spreadX, 0, -2.2 + spreadZ],
      defaultGesture: 'sleepwalk_trance'
    };
  }
  if (loc.includes('304') || loc.includes('floor 3') || loc.includes('3rd')) {
    return {
      floor: 'floor3',
      position: [4.2 + spreadX * 0.4, 0, 3.2 + spreadZ * 0.4],
      defaultGesture: 'inspect_ledger'
    };
  }
  if (loc.includes('201') || loc.includes('202') || loc.includes('204') || loc.includes('floor 2') || loc.includes('2nd')) {
    const isEast = loc.includes('202') || loc.includes('204');
    return {
      floor: 'floor2',
      position: [isEast ? 4.2 : -4.5, 0, -4.0 + spreadZ * 0.4],
      defaultGesture: loc.includes('wall') || loc.includes('shaft') ? 'wall_listen' : 'pace_corridor'
    };
  }
  if (loc.includes('101') || loc.includes('102')) {
    return {
      floor: 'floor1',
      position: [-4.5 + spreadX * 0.3, 0, -4.2 + spreadZ * 0.3],
      defaultGesture: 'wall_listen'
    };
  }
  if (loc.includes('104') || loc.includes('103')) {
    return {
      floor: 'floor1',
      position: [4.5 + spreadX * 0.3, 0, 4.2 + spreadZ * 0.3],
      defaultGesture: 'pace_corridor'
    };
  }
  if (loc.includes('crawlspace') || loc.includes('hidden') || loc.includes('threshold')) {
    return {
      floor: fallbackFloor,
      position: [fallbackPos[0], 0, fallbackPos[2]],
      defaultGesture: 'wall_listen'
    };
  }
  return {
    floor: fallbackFloor,
    position: [fallbackPos[0], 0, fallbackPos[2]],
    defaultGesture: 'idle_observe'
  };
}

export function getTimeOfDayInfo(gameTimeMinutes: number): {
  phase: TimeOfDayPhase;
  formattedTime: string;
  activeWorldEvent: string;
} {
  const normalized = ((Math.round(gameTimeMinutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const formattedTime = `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`;

  if (normalized >= 360 && normalized < 720) {
    return {
      phase: 'Morning',
      formattedTime,
      activeWorldEvent: 'Morning Bell & Ledger Audit (Steam radiators warming across floors)'
    };
  }
  if (normalized >= 720 && normalized < 1020) {
    return {
      phase: 'Afternoon',
      formattedTime,
      activeWorldEvent: 'Afternoon Check-In & Corridor Inspection (Service dumbwaiter active)'
    };
  }
  if (normalized >= 1020 && normalized < 1320) {
    return {
      phase: 'Evening',
      formattedTime,
      activeWorldEvent: 'Lobby Lights Dimming & Parlor Social Hour (Wall sconces flickering)'
    };
  }
  return {
    phase: 'Late Night',
    formattedTime,
    activeWorldEvent: 'Midnight Curfew & Hidden Passageway Activity (Hollow masonry echoes)'
  };
}

export function getActiveDailyAction(
  schedule: DailyActionEntry[] | undefined,
  gameTimeMinutes: number
): DailyActionEntry {
  const { phase } = getTimeOfDayInfo(gameTimeMinutes);
  const list = schedule && schedule.length > 0 ? schedule : DEFAULT_DAILY_SCHEDULE;
  return list.find((entry) => entry.phase === phase) || list[0];
}

/**
 * Pure Daily Schedule Manager:
 * Evaluates all AI tenants against `gameTimeMinutes` and returns updated agent profiles
 * whose `floor`, `position`, and active gesture reflect their current time-of-day schedule
 * (e.g. gathering in the Lobby / West Parlor during Evening social hour, returning to their suites at Late Night),
 * with optional deterministic or AI-triggered random anomaly overrides.
 */
export function computeScheduledAgentsForTime(
  agents: HotelAgentProfile[],
  gameTimeMinutes: number,
  triggerRandomAnomalies = false,
  randomSeed = 0
): HotelAgentProfile[] {
  const { phase, formattedTime } = getTimeOfDayInfo(gameTimeMinutes);

  return agents.map((agent, idx) => {
    if (agent.role === 'helper_entity') {
      return agent;
    }

    const schedule =
      agent.dailySchedule && agent.dailySchedule.length > 0
        ? agent.dailySchedule
        : DEFAULT_DAILY_SCHEDULE;
    const entry = schedule.find((s) => s.phase === phase) || schedule[0];

    let nextFloor: FloorId = entry.targetFloor || agent.floor;
    let nextPos: [number, number, number] = entry.targetPosition
      ? ([...entry.targetPosition] as [number, number, number])
      : ([...agent.position] as [number, number, number]);

    // If entry doesn't have explicit targetFloor/targetPosition, resolve from location string or agent's roomNumber
    if (!entry.targetFloor || !entry.targetPosition) {
      const effectiveLoc =
        entry.location.includes('Assigned Suite') || entry.location.includes('Suite Threshold')
          ? agent.roomNumber || entry.location
          : entry.location;
      const resolved = resolveDailyLocationCoords(effectiveLoc, agent.floor, agent.position, idx);
      nextFloor = entry.targetFloor || resolved.floor;
      nextPos = entry.targetPosition ? [...entry.targetPosition] : resolved.position;
    }

    let nextAction = entry.action;
    let nextLocation = entry.location;
    let nextGesture: ScheduledActivityGesture =
      entry.activityGesture ||
      resolveDailyLocationCoords(entry.location, nextFloor, nextPos, idx).defaultGesture;
    let activeRandomEvent = entry.activeRandomEvent || null;
    const nextMemories = Array.isArray(agent.memories) ? [...agent.memories] : [];

    if (triggerRandomAnomalies && entry.randomEventsEnabled !== false) {
      const poolIdx =
        Math.abs(Math.round(gameTimeMinutes + idx * 17 + randomSeed * 31)) %
        RANDOM_AI_SCHEDULE_EVENTS_POOL.length;
      const anomaly = RANDOM_AI_SCHEDULE_EVENTS_POOL[poolIdx];
      nextFloor = anomaly.targetFloor;
      nextPos = [
        anomaly.targetPosition[0] + (idx % 2 === 0 ? 0.4 : -0.4),
        0,
        anomaly.targetPosition[2]
      ];
      nextAction = `[⚡ AI Event: ${anomaly.title}] ${anomaly.action}`;
      nextLocation = anomaly.location;
      nextGesture = anomaly.gesture;
      activeRandomEvent = anomaly.title;
      const eventMem = `[${formattedTime}] Random AI Event: ${anomaly.title} — ${anomaly.action} (@ ${anomaly.location})`;
      if (!nextMemories.includes(eventMem)) {
        nextMemories.push(eventMem);
      }
    }

    const updatedSchedule = schedule.map((s) =>
      s.phase === phase
        ? {
            ...s,
            targetFloor: nextFloor,
            targetPosition: nextPos,
            activityGesture: nextGesture,
            activeRandomEvent
          }
        : s
    );

    return {
      ...agent,
      floor: nextFloor,
      position: nextPos,
      status:
        triggerRandomAnomalies && entry.randomEventsEnabled !== false
          ? ('erratic' as const)
          : agent.status,
      memories: nextMemories,
      dailySchedule: updatedSchedule
    };
  });
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
  let leftUpperArmX = 0;
  let leftUpperArmZ = 0.06;
  let leftForearmX = -0.18;
  let leftHandZ = 0;

  let rightClavicleZ = 0;
  let rightUpperArmX = 0;
  let rightUpperArmZ = -0.06;
  let rightForearmX = -0.18;
  let rightHandZ = 0;

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
        accentColor: '#b45309',
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
        accentColor: '#eab308',
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
        accentColor: '#fbbf24',
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
        accentColor: '#38bdf8',
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
        accentColor: '#facc15',
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
        accentColor: '#eab308',
        heightScale: 1.0,
        widthScale: 1.0,
        headScale: 1.0
      };
  }
}

/**
 * Resolves a tenant's categorical attitude / disposition toward the player from trust & suspicion levels.
 */
export function resolveTenantDisposition(
  trustLevel: number,
  suspicionLevel: number
): TenantDisposition {
  if (trustLevel <= 25 || suspicionLevel >= 80) return 'hostile';
  if (trustLevel <= 42 || suspicionLevel >= 65) return 'cold';
  if (trustLevel >= 78 && suspicionLevel <= 38) return 'confidant';
  if (trustLevel >= 60) return 'cordial';
  return 'wary';
}

/**
 * Generates or attaches a character-specific pending question that the tenant is waiting for the player to answer.
 */
export function posePendingQuestionFromAgent(
  agent: HotelAgentProfile,
  gameTimeMinutes: number,
  currentGameDay = 1,
  customQuestionText?: string
): { updatedAgent: HotelAgentProfile; question: PendingTenantQuestion } {
  const timeInfo = getTimeOfDayInfo(gameTimeMinutes);
  const existing = Array.isArray(agent.pendingQuestions) ? [...agent.pendingQuestions] : [];

  const defaultQuestionByRoom =
    agent.id === 'agent_arthur'
      ? {
          text: 'Did you verify whose handwriting signed Room 202 into the Front Desk register before midnight?',
          topics: ['register', 'handwriting', '202', 'signature', 'arthur', 'ledger', 'yes', 'checked']
        }
      : agent.id === 'agent_eleanor'
        ? {
            text: 'Have you checked behind the wardrobe in Room 101 to see if the brass latch into Room 102 is unbolted?',
            topics: ['wardrobe', '101', '102', 'latch', 'brick', 'unbolted', 'bolted', 'checked', 'yes']
          }
        : agent.id === 'agent_julian'
          ? {
              text: 'Did you listen to the reversed microcassette tape near the Room 202 fireplace wall?',
              topics: ['tape', 'cassette', 'fireplace', '202', '204', 'footsteps', 'listened', 'yes']
            }
          : {
              text: `Did you inspect the hollow partition wall behind ${agent.roomNumber || 'Room 304'} for the missing brass passkey?`,
              topics: ['partition', 'wall', 'passkey', 'key', 'shaft', '304', 'basement', 'vault', 'yes', 'found']
            };

  const qText = (customQuestionText || '').trim() || defaultQuestionByRoom.text;
  const newQuestion: PendingTenantQuestion = {
    id: `pq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    questionText: qText,
    askedOnDay: Math.max(1, Math.round(currentGameDay)),
    askedAtTimeFormatted: timeInfo.formattedTime,
    expectedTopics: defaultQuestionByRoom.topics,
    resolved: false
  };

  const updatedAgent: HotelAgentProfile = {
    ...agent,
    pendingQuestions: [...existing, newQuestion],
    lastInteractionDay: Math.max(1, Math.round(currentGameDay))
  };

  return { updatedAgent, question: newQuestion };
}

export interface InteractionMemoryEvaluation {
  updatedAgent: HotelAgentProfile;
  trustDelta: number;
  suspicionDelta: number;
  resultingTrust: number;
  resultingSuspicion: number;
  resultingDisposition: TenantDisposition;
  triggeredLikes: string[];
  triggeredDislikes: string[];
  answeredQuestion: PendingTenantQuestion | null;
  daysWaitedForAnswer: number;
  oldestUnansweredQuestion: PendingTenantQuestion | null;
  unansweredDaysWaiting: number;
  newlyAskedQuestion: PendingTenantQuestion | null;
  unlockedClueId: string | null;
  sanityDelta: number;
  gameplayInfluenceSummary: string;
  memoryDirectiveForPrompt: string;
}

/**
 * Pure Episodic & Relational Memory Engine:
 * Evaluates every player interaction with a tenant/character, updating:
 * 1) Affinity / Trust & Suspicion ("tenant not liking the user" when dislikes or hostile tone are triggered vs. warming up on likes).
 * 2) Multi-day unanswered questions ("waiting for the answer for a question asked days ago" or rewarding a delayed answer).
 * 3) Concrete gameplay consequences (clue locks/unlocks, sanity impact, and disposition shifts).
 */
export function evaluateCharacterInteractionMemory(
  agent: HotelAgentProfile,
  userMessage: string,
  gameTimeMinutes: number,
  currentGameDay = 1
): InteractionMemoryEvaluation {
  const msgLower = (userMessage || '').toLowerCase();
  const safeDay = Math.max(1, Math.round(currentGameDay));
  const timeInfo = getTimeOfDayInfo(gameTimeMinutes);

  const likesList =
    agent.likes && agent.likes.length > 0
      ? agent.likes
      : ['brass keys', 'classic jazz', 'orderly ledgers', 'warm radiator steam'];
  const dislikesList =
    agent.dislikes && agent.dislikes.length > 0
      ? agent.dislikes
      : ['drafty brickwork', 'locked transoms', 'nosy questions', 'missing room keys'];

  const triggeredLikes: string[] = [];
  const triggeredDislikes: string[] = [];

  function matchesPreferenceItem(item: string, text: string): boolean {
    const clean = item.toLowerCase().trim();
    if (!clean) return false;
    if (text.includes(clean)) return true;
    const parts = clean.split(/\s+/).filter((p) => p.length >= 3);
    if (parts.length > 1) {
      // Require all significant words from the multi-word phrase to appear
      return parts.every((p) => text.includes(p));
    } else if (parts.length === 1) {
      // Exact single word boundary match to avoid substring false positives
      const escaped = parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    }
    return false;
  }

  for (const likeItem of likesList) {
    if (matchesPreferenceItem(likeItem, msgLower)) {
      triggeredLikes.push(likeItem);
    }
  }

  for (const dislikeItem of dislikesList) {
    if (matchesPreferenceItem(dislikeItem, msgLower)) {
      triggeredDislikes.push(dislikeItem);
    }
  }

  const hostileMarkers = [
    'liar',
    'lying',
    'guilty',
    'suspect',
    'accuse',
    'threat',
    'force',
    'shut up',
    'arrest',
    'confess',
    'steal',
    'stole',
    'hate',
    'useless',
    'pathetic',
    'demand'
  ];
  for (const hm of hostileMarkers) {
    if (msgLower.includes(hm) && !triggeredDislikes.includes(`hostile tone ("${hm}")`)) {
      triggeredDislikes.push(`hostile tone ("${hm}")`);
    }
  }

  const politeMarkers = ['please', 'thank', 'appreciate', 'help you', 'respect', 'pardon', 'tea', 'jazz'];
  for (const pm of politeMarkers) {
    if (msgLower.includes(pm) && triggeredLikes.length === 0) {
      triggeredLikes.push(`courteous demeanor ("${pm}")`);
    }
  }

  let trustDelta = 0;
  let suspicionDelta = 0;
  let sanityDelta = 0;

  if (triggeredLikes.length > 0) {
    trustDelta += Math.min(18, triggeredLikes.length * 10);
    suspicionDelta -= Math.min(12, triggeredLikes.length * 6);
    sanityDelta += 2;
  }

  if (triggeredDislikes.length > 0) {
    trustDelta -= Math.min(28, triggeredDislikes.length * 15);
    suspicionDelta += Math.min(24, triggeredDislikes.length * 13);
    sanityDelta -= 5;
  }

  // Evaluate pending questions from earlier turns or earlier days
  const existingQuestions: PendingTenantQuestion[] = Array.isArray(agent.pendingQuestions)
    ? agent.pendingQuestions.map((q) => ({ ...q }))
    : [];

  let answeredQuestion: PendingTenantQuestion | null = null;
  let daysWaitedForAnswer = 0;

  const explicitAnswerIndicators = [
    'answer',
    'you asked',
    'about your question',
    'i checked',
    'i found',
    'i verified',
    'i looked',
    'yes,',
    'yes i',
    'it was',
    'arthur',
    'signature',
    'unbolted',
    'bolted',
    'latch',
    'wardrobe',
    'register',
    'handwriting',
    'cassette',
    'fireplace',
    'passkey'
  ];

  for (let i = 0; i < existingQuestions.length; i++) {
    const q = existingQuestions[i];
    if (q.resolved) continue;

    const matchesTopic = (q.expectedTopics || []).some(
      (t) => t.length >= 3 && msgLower.includes(t.toLowerCase())
    );
    const matchesExplicitAnswer = explicitAnswerIndicators.some((ind) => msgLower.includes(ind));

    // Only resolve if the player isn't being hostile and provides a matching topic or answer indicator
    if ((matchesTopic || matchesExplicitAnswer) && triggeredDislikes.length === 0) {
      q.resolved = true;
      q.resolvedOnDay = safeDay;
      q.resolvedByMessage = userMessage.slice(0, 160);
      answeredQuestion = { ...q };
      daysWaitedForAnswer = Math.max(0, safeDay - q.askedOnDay);
      trustDelta += daysWaitedForAnswer >= 1 ? 22 : 14;
      suspicionDelta -= 10;
      sanityDelta += 5;
      break;
    }
  }

  // Check if there is still an oldest unresolved question waiting for an answer
  const remainingUnresolved = existingQuestions.filter((q) => !q.resolved);
  const oldestUnansweredQuestion =
    remainingUnresolved.length > 0 ? remainingUnresolved[0] : null;
  const unansweredDaysWaiting = oldestUnansweredQuestion
    ? Math.max(0, safeDay - oldestUnansweredQuestion.askedOnDay)
    : 0;

  if (oldestUnansweredQuestion && !answeredQuestion && unansweredDaysWaiting >= 1) {
    // Tenant grows impatient waiting days for their answer
    trustDelta -= Math.min(12, 4 + unansweredDaysWaiting * 2);
    suspicionDelta += Math.min(14, 5 + unansweredDaysWaiting * 2);
  }

  // If the tenant had no unresolved questions and didn't just resolve one on this turn,
  // or if the conversation is neutral, pose a pending question so future interactions track it
  let newlyAskedQuestion: PendingTenantQuestion | null = null;
  if (!oldestUnansweredQuestion && !answeredQuestion && existingQuestions.length === 0) {
    const posed = posePendingQuestionFromAgent(agent, gameTimeMinutes, safeDay);
    newlyAskedQuestion = posed.question;
    existingQuestions.push(newlyAskedQuestion);
  }

  const baseTrust = typeof agent.trustLevel === 'number' ? agent.trustLevel : 50;
  const baseSuspicion = typeof agent.suspicionLevel === 'number' ? agent.suspicionLevel : 25;

  const resultingTrust = Math.max(0, Math.min(100, Math.round(baseTrust + trustDelta)));
  const resultingSuspicion = Math.max(
    0,
    Math.min(100, Math.round(baseSuspicion + suspicionDelta))
  );
  const resultingDisposition = resolveTenantDisposition(resultingTrust, resultingSuspicion);

  // Determine if a clue is unlocked by high trust or answering a multi-day question
  let unlockedClueId: string | null = null;
  if (
    (answeredQuestion && (daysWaitedForAnswer >= 1 || resultingTrust >= 58)) ||
    resultingDisposition === 'confidant'
  ) {
    const matchedClue = INITIAL_CLUES.find((c) => c.relatedAgentId === agent.id);
    unlockedClueId = matchedClue ? matchedClue.id : 'clue_hollow_brick_101';
  }

  // Build human-readable gameplay consequence summary
  const influenceParts: string[] = [];
  if (answeredQuestion) {
    influenceParts.push(
      daysWaitedForAnswer >= 1
        ? `Answered question from ${daysWaitedForAnswer} day(s) ago ("${answeredQuestion.questionText.slice(0, 48)}...") → Trust +${trustDelta}`
        : `Answered tenant's pending question → Trust +${trustDelta}`
    );
  } else if (oldestUnansweredQuestion && unansweredDaysWaiting >= 1) {
    influenceParts.push(
      `Tenant is still waiting ${unansweredDaysWaiting} day(s) for an answer to: "${oldestUnansweredQuestion.questionText.slice(0, 56)}..."`
    );
  } else if (newlyAskedQuestion) {
    influenceParts.push(
      `Tenant asked a new pending question on Day ${safeDay} (${timeInfo.formattedTime}): "${newlyAskedQuestion.questionText.slice(0, 56)}..."`
    );
  }

  if (triggeredDislikes.length > 0) {
    influenceParts.push(
      `Triggered dislike (${triggeredDislikes.join(', ')}) → Tenant attitude shifted to ${resultingDisposition.toUpperCase()} (Trust ${resultingTrust}/100)`
    );
  } else if (triggeredLikes.length > 0) {
    influenceParts.push(
      `Mentioned liked topic (${triggeredLikes.join(', ')}) → Tenant warmed up to ${resultingDisposition.toUpperCase()} (Trust ${resultingTrust}/100)`
    );
  }

  if (resultingDisposition === 'hostile' || resultingDisposition === 'cold') {
    influenceParts.push(
      `Gameplay Effect: ${agent.name} dislikes you and locks secret passage hints until trust recovers.`
    );
  } else if (unlockedClueId) {
    influenceParts.push(
      `Gameplay Effect: ${agent.name} trusts you enough to reveal clue [${unlockedClueId}]!`
    );
  }

  const gameplayInfluenceSummary =
    influenceParts.length > 0
      ? influenceParts.join(' | ')
      : `Saved to memory (Day ${safeDay}, Disposition: ${resultingDisposition.toUpperCase()}, Trust ${resultingTrust}/100).`;

  // Build directive for the LLM prompt
  const directiveLines: string[] = [
    `Current Game Day: Day ${safeDay} (${timeInfo.formattedTime})`,
    `Your Current Attitude / Disposition toward the Clerk: ${resultingDisposition.toUpperCase()} (Trust: ${resultingTrust}/100, Suspicion: ${resultingSuspicion}/100).`
  ];

  if (resultingDisposition === 'hostile' || resultingDisposition === 'cold' || triggeredDislikes.length > 0) {
    directiveLines.push(
      `CRITICAL MEMORY CONSEQUENCE (DISLIKE / LOW TRUST): You currently DISLIKE or DISTRUST the Night Clerk${
        triggeredDislikes.length > 0 ? ` because they brought up or exhibited [${triggeredDislikes.join(', ')}]` : ''
      }. Respond coldly, guardedly, and refuse to share any secrets about ${agent.roomNumber} or the hidden passages.`
    );
  } else if (resultingDisposition === 'confidant' || resultingDisposition === 'cordial') {
    directiveLines.push(
      `CRITICAL MEMORY CONSEQUENCE (HIGH TRUST): You like and trust the Night Clerk. Be cooperative and share your secret observation: "${agent.secretTruth}".`
    );
  }

  if (answeredQuestion) {
    directiveLines.push(
      `CRITICAL MULTI-DAY QUESTION RESOLVED: The Clerk just answered the question you asked ${
        daysWaitedForAnswer >= 1 ? `${daysWaitedForAnswer} day(s) ago (on Day ${answeredQuestion.askedOnDay})` : `earlier today`
      } ("${answeredQuestion.questionText}"). Acknowledge that you have been waiting for their answer, express relief, and share a concrete clue about ${agent.roomNumber}!`
    );
  } else if (oldestUnansweredQuestion && unansweredDaysWaiting >= 1) {
    directiveLines.push(
      `CRITICAL UNANSWERED QUESTION FROM ${unansweredDaysWaiting} DAY(S) AGO: On Day ${oldestUnansweredQuestion.askedOnDay} at ${oldestUnansweredQuestion.askedAtTimeFormatted}, you asked the Clerk: "${oldestUnansweredQuestion.questionText}". It is now Day ${safeDay} (${unansweredDaysWaiting} day(s) later) and the Clerk STILL hasn't answered you! Explicitly remind them in-character that you have been waiting ${unansweredDaysWaiting} day(s) for their answer before you tell them anything else.`
    );
  } else if (newlyAskedQuestion) {
    directiveLines.push(
      `FOLLOW-UP QUESTION TO ASK THE CLERK: End your response by asking the Clerk this specific question so you can wait for their answer: "${newlyAskedQuestion.questionText}"`
    );
  }

  const updatedMemories = [...(agent.memories || [])];
  const memoryEntryText = `[Day ${safeDay} ${timeInfo.formattedTime}] Clerk said "${userMessage.slice(0, 70)}" -> ${gameplayInfluenceSummary}`;
  if (!updatedMemories.includes(memoryEntryText)) {
    updatedMemories.push(memoryEntryText);
  }

  const updatedAgent: HotelAgentProfile = {
    ...agent,
    trustLevel: resultingTrust,
    suspicionLevel: resultingSuspicion,
    disposition: resultingDisposition,
    pendingQuestions: existingQuestions,
    lastInteractionDay: safeDay,
    memories: updatedMemories.slice(-15)
  };

  return {
    updatedAgent,
    trustDelta,
    suspicionDelta,
    resultingTrust,
    resultingSuspicion,
    resultingDisposition,
    triggeredLikes,
    triggeredDislikes,
    answeredQuestion,
    daysWaitedForAnswer,
    oldestUnansweredQuestion: answeredQuestion ? null : oldestUnansweredQuestion,
    unansweredDaysWaiting: answeredQuestion ? 0 : unansweredDaysWaiting,
    newlyAskedQuestion,
    unlockedClueId,
    sanityDelta,
    gameplayInfluenceSummary,
    memoryDirectiveForPrompt: directiveLines.join('\n')
  };
}

export function buildSandboxedCharacterSystemPrompt(
  agent: HotelAgentProfile,
  globalInstructionSet: string,
  gameTimeMinutes: number,
  currentGameDay = 1,
  memoryEval?: InteractionMemoryEvaluation
): string {
  const timeInfo = getTimeOfDayInfo(gameTimeMinutes);
  const currentDaily = getActiveDailyAction(agent.dailySchedule, gameTimeMinutes);
  const voice = agent.voiceStyle || 'Mid-Atlantic theatrical cadence, hushed and deliberate';
  const demeanor = agent.demeanor || 'Observant, guarded, polite yet uneasy';
  const likes = (agent.likes && agent.likes.length > 0 ? agent.likes : ['brass keys', 'classic jazz', 'orderly ledgers']).join(', ');
  const dislikes = (agent.dislikes && agent.dislikes.length > 0 ? agent.dislikes : ['drafty brickwork', 'locked transoms', 'nosy questions']).join(', ');
  const personalRules =
    agent.personalInstructionSet ||
    `Speak only as ${agent.name} (${agent.occupation} in ${agent.roomNumber}). Never volunteer information outside your Starting Known Information.`;
  const knownFactsList =
    agent.knownFacts && agent.knownFacts.length > 0
      ? agent.knownFacts.map((f) => `- ${f}`).join('\n')
      : `- Assigned to ${agent.roomNumber} on ${agent.floor}.`;
  const historyList =
    agent.interactionHistory && agent.interactionHistory.length > 0
      ? agent.interactionHistory
          .slice(-6)
          .map(
            (h) =>
              `- [Day ${h.gameDay ?? 1} · ${h.gameTimeFormatted} | ${h.phase}] Player: "${h.userMessage}" -> ${agent.name}: "${h.agentReply}"${
                h.gameplayInfluenceSummary ? ` (${h.gameplayInfluenceSummary})` : ''
              }`
          )
          .join('\n')
      : 'No prior recorded interactions yet.';

  const disposition =
    memoryEval?.resultingDisposition ||
    agent.disposition ||
    resolveTenantDisposition(agent.trustLevel ?? 50, agent.suspicionLevel ?? 25);

  const unresolvedQuestions = (agent.pendingQuestions || []).filter((q) => !q.resolved);
  const pendingQuestionsSummary =
    unresolvedQuestions.length > 0
      ? unresolvedQuestions
          .map((q) => {
            const daysAgo = Math.max(0, currentGameDay - q.askedOnDay);
            return `- Asked on Day ${q.askedOnDay} (${q.askedAtTimeFormatted}, ${daysAgo} day(s) ago): "${q.questionText}"`;
          })
          .join('\n')
      : 'No unanswered questions currently pending.';

  const lockedVoice = getOrCreateCharacterVoiceProfile(agent);
  const activeExpr =
    agent.activeFacialExpression ||
    agent.appearance?.facialExpression ||
    lockedVoice.baselineExpression ||
    'neutral';

  return [
    `=== GLOBAL INSTRUCTION SET (GAME-SPECIFIC SANDBOX / NO INTERNET ACCESS) ===`,
    globalInstructionSet || DEFAULT_GLOBAL_INSTRUCTION_SET,
    ``,
    `=== PERSONAL CHARACTER INSTRUCTION SET ===`,
    personalRules,
    ``,
    `=== CHARACTER IDENTITY & INITIAL PERSONALITY ===`,
    `Name: ${agent.name} | Role/Archetype: ${agent.occupation} | Suite/Zone: ${agent.roomNumber} (${agent.floor})`,
    `Voice Style: ${voice}`,
    `Locked Playthrough Voice Identity (MUST MAINTAIN STRICTLY EVERY TURN):`,
    `- Prebuilt Voice Timbre: ${lockedVoice.prebuiltVoiceName} (Pitch ${lockedVoice.pitchMultiplier.toFixed(2)}x, Rate ${lockedVoice.speakingRate.toFixed(2)}x)`,
    `- Locked Regional/Period Accent: ${lockedVoice.accent}`,
    `- Locked Vocal Tone: ${lockedVoice.vocalTone}`,
    `- Locked Cadence & Phrasing: ${lockedVoice.cadenceStyle}`,
    `- Active 3D Facial Expression: ${activeExpr}`,
    `Demeanor: ${demeanor}`,
    `Likes: ${likes}`,
    `Dislikes: ${dislikes}`,
    `Personality Summary: ${agent.personality}`,
    ``,
    `=== STARTING KNOWN INFORMATION (EPISTEMIC BOUNDARY) ===`,
    `You ONLY know the following game-specific facts and may NOT invent external or internet facts:`,
    knownFactsList,
    ``,
    `=== ACTIVE GAMEPLAY TIME & TIME-OF-DAY DAILY ACTION ===`,
    `Current Gameplay Day & Clock: Day ${currentGameDay} · ${timeInfo.formattedTime} (${timeInfo.phase})`,
    `Active Time-of-Day World Event: ${timeInfo.activeWorldEvent}`,
    `Your Current Daily Action (${currentDaily.timeRange}): ${currentDaily.action} @ ${currentDaily.location}`,
    ``,
    `=== EPISODIC MEMORY, TENANT ATTITUDE & MULTI-DAY PENDING QUESTIONS ===`,
    `Current Disposition toward Clerk: ${disposition.toUpperCase()} | Trust: ${agent.trustLevel ?? 50}/100 | Suspicion: ${agent.suspicionLevel ?? 25}/100`,
    `Unanswered Questions You Asked the Clerk:\n${pendingQuestionsSummary}`,
    memoryEval ? `\nActive Interaction Memory Evaluation:\n${memoryEval.memoryDirectiveForPrompt}` : '',
    ``,
    `=== SAVED INTERACTION & DIALOGUE HISTORY ===`,
    historyList,
    ``,
    `Respond strictly in-character in 2 to 4 sentences reflecting your locked Accent (${lockedVoice.accent}), Vocal Tone (${lockedVoice.vocalTone}), Cadence (${lockedVoice.cadenceStyle}), Facial Expression (${activeExpr}), Likes/Dislikes, Disposition (${disposition.toUpperCase()}), and any unanswered questions from days ago.`
  ].join('\n');
}

export function buildProceduralPersonaFromPrompt(
  name: string,
  archetype: string,
  seedPrompt: string,
  roomNumber: string
): {
  voiceStyle: string;
  voiceProfile: CharacterVoiceProfile;
  demeanor: string;
  likes: string[];
  dislikes: string[];
  knownFacts: string[];
  personalInstructionSet: string;
  dailySchedule: DailyActionEntry[];
} {
  const cleanSeed = seedPrompt.trim() || `${archetype} stationed near ${roomNumber}`;
  const voiceProfile = inferVoiceProfileFromArchetypeAndName(name, archetype, cleanSeed);
  return {
    voiceStyle: `${voiceProfile.accent} accent · ${voiceProfile.vocalTone} (${voiceProfile.cadenceStyle})`,
    voiceProfile,
    demeanor: `Attentive, slightly secretive, protective of ${roomNumber} routines`,
    likes: ['Polished brass fixtures', 'Warm radiator steam', 'Accurate guest ledgers', 'Quiet corridors'],
    dislikes: ['Unexplained footsteps behind walls', 'Missing room keys', 'Drafts from the airshaft'],
    knownFacts: [
      `Stationed in ${roomNumber} inside The Alderney Arms Hotel.`,
      `Heard metallic latching noises behind the brickwork at 11:45 PM.`,
      `Knows that only the Night Clerk and Registrar hold brass passkeys to the service shaft.`,
      `Personal background note: ${cleanSeed}`
    ],
    personalInstructionSet: `Stay strictly in-character as ${name} (${archetype}). Maintain your locked ${voiceProfile.accent} accent, ${voiceProfile.vocalTone} vocal tone, and ${voiceProfile.cadenceStyle} throughout the entire playthrough. Only reference The Alderney Arms Hotel, ${roomNumber}, and your Starting Known Information. Never use modern internet or out-of-world knowledge.`,
    dailySchedule: [
      {
        phase: 'Morning',
        timeRange: '06:00 – 11:59',
        action: `Organizing personal ledger notes and inspecting locks in ${roomNumber}.`,
        location: roomNumber,
        eventTrigger: 'Morning Bell & Ledger Audit'
      },
      {
        phase: 'Afternoon',
        timeRange: '12:00 – 16:59',
        action: `Observing guest arrivals and checking corridor wainscoting near ${roomNumber}.`,
        location: `${roomNumber} Corridor`,
        eventTrigger: 'Afternoon Check-In & Corridor Inspection'
      },
      {
        phase: 'Evening',
        timeRange: '17:00 – 21:59',
        action: `Conversing in hushed tones under the dimmed brass wall sconces.`,
        location: 'Main Lobby & Parlor',
        eventTrigger: 'Lobby Lights Dimming & Parlor Social Hour'
      },
      {
        phase: 'Late Night',
        timeRange: '22:00 – 05:59',
        action: `Listening for hollow footsteps along the secret crawlspace wall behind ${roomNumber}.`,
        location: `${roomNumber} Inner Partition`,
        eventTrigger: 'Midnight Curfew & Hidden Passageway Activity'
      }
    ]
  };
}


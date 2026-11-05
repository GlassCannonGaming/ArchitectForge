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


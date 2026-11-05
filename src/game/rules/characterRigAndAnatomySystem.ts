import { type CharacterAppearance, type CharacterArchetype, type CharacterVoiceProfile, type DailyActionEntry, type FacialExpressionType, type FacialRigParams, type FloorId, type HotelAgentProfile, INITIAL_CLUES, type NaturalCharacterAnatomySpec, type PendingTenantQuestion, type ScheduledActivityGesture, type SkeletonPoseEuler, type TenantDisposition, type TimeOfDayPhase } from './coreTypesAndFloors';
import { getOrCreateCharacterVoiceProfile, inferVoiceProfileFromArchetypeAndName } from './catalogVoiceAndSets';
import { getActiveDailyAction } from './characterScheduleSystem';
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


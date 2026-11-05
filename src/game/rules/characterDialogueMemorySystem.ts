import { type CharacterAppearance, type CharacterArchetype, type CharacterVoiceProfile, type DailyActionEntry, type FacialExpressionType, type FacialRigParams, type FloorId, type HotelAgentProfile, INITIAL_CLUES, type NaturalCharacterAnatomySpec, type PendingTenantQuestion, type ScheduledActivityGesture, type SkeletonPoseEuler, type TenantDisposition, type TimeOfDayPhase } from './coreTypesAndFloors';
import { getOrCreateCharacterVoiceProfile, inferVoiceProfileFromArchetypeAndName } from './catalogVoiceAndSets';
import { DEFAULT_GLOBAL_INSTRUCTION_SET, DEFAULT_DAILY_SCHEDULE, getTimeOfDayInfo, getActiveDailyAction } from './characterScheduleSystem';
import { getArchetypeDefaults } from './characterRigAndAnatomySystem';
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

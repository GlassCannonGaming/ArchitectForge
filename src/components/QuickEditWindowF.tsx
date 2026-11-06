import React, { useState, useRef, useEffect } from 'react';
import {
  AssetConditionVariant,
  computeAssetInteractionVisualState,
  computeUnkemptFlickerCssSpec,
  DEFAULT_GLOBAL_ANIMATION_FPS,
  FacialExpressionType,
  getAssetVisualDesignVariants,
  GlobalAnimationFps,
  HingeSwingMode,
  HotelAgentProfile,
  InvisibleTriggerEventType,
  isInvisibleTriggerAsset,
  isStructuralHotelAsset,
  isUnkemptOrAgedAsset,
  PlacedAsset,
  resolveAssetConditionVariant,
  safeExecuteCatalogOrVariantCallback,
  ScheduledActivityGesture,
  swapAssetConditionVariant,
  swapAssetVisualDesign,
  TexturePresetId,
  isTvOrCrtScreenAsset,
  LIGHTING_PRESETS,
  LIGHTING_MOOD_QUICK_PROMPTS,
  CHARACTER_CLOTHING_STYLES,
  CharacterClothingStyleId,
  resolveCharacterClothingStyle,
  generateCharacterClothingChoices,
  applyClothingChoiceToAppearance,
  CHARACTER_HAIR_STYLES,
  CHARACTER_HAIR_COLOR_SWATCHES,
  CharacterHairStyleId,
  resolveCharacterHairStyle,
  cycleCharacterHairStyle
} from '../game/rules';
import { AssetBlueprint } from '../game/hotelData';

interface QuickEditWindowFProps {
  primaryAsset: PlacedAsset | null;
  selectedCount: number;
  screenPosition: { x: number; y: number };
  onClose: () => void;
  onBatchModify: (patch: {
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
    isLocked?: boolean;
  }) => void;
  onToggleLockSelected?: () => void;
  isSelectionLocked?: boolean;
  lockedSelectedCount?: number;
  onSelectEntireRoom?: () => void;
  onInteractKeyE: (asset: PlacedAsset) => void;
  onDuplicate: (asset: PlacedAsset) => void;
  onDeleteSelected: () => void;
  onExtendWallRow?: (asset: PlacedAsset) => void;
  onCopySelected?: () => void;
  onPasteClipboard?: () => void;
  clipboardCount?: number;
  onSaveSelectionAsSet?: (setName: string) => void;
  catalogAssets?: AssetBlueprint[];
  onUpdateAsset?: (updated: PlacedAsset, message?: string) => void;
  onSwapConditionVariant?: (variant: AssetConditionVariant) => void;
  onSwapVisualDesign?: (targetSubType: string | 'next') => void;
  globalAnimationFps?: GlobalAnimationFps;
  selectedAgent?: HotelAgentProfile | null;
  onUpdateAgent?: (updated: HotelAgentProfile, message?: string) => void;
  onOpenCharacterCreator?: (agent: HotelAgentProfile) => void;
  onClearAgentSelection?: () => void;
  onAutoDirectLighting?: (moodPrompt: string) => void;
}

const SWATCH_COLORS = [
  '#592820', // Soot-Stained Brick
  '#8a8170', // Nicotine Plaster
  '#3b2314', // Dark Walnut Trim
  '#4a181b', // Dried Oxblood
  '#4a5438', // 70s Faded Avocado
  '#6e562f', // 70s Harvest Ochre
  '#5e4c2e', // Tarnished Brass
  '#242220'  // Corroded Cast Iron
];

const TEXTURE_OPTIONS: { id: TexturePresetId; label: string }[] = [
  { id: 'nyc_old_brick', label: 'Soot-Stained Brick' },
  { id: 'plaster_cream', label: 'Nicotine Wainscot' },
  { id: 'oak_parquet', label: 'Worn Dark Walnut' },
  { id: 'checker_marble', label: '70s Cracked Linoleum' },
  { id: 'wallpaper_damask', label: 'Peeling 70s Wallpaper' },
  { id: 'velvet_crimson', label: 'Threadbare Oxblood' },
  { id: 'aged_brass', label: 'Tarnished Bronze' },
  { id: 'industrial_concrete', label: 'Damp Cellar Concrete' }
];

export const QuickEditWindowF: React.FC<QuickEditWindowFProps> = ({
  primaryAsset,
  selectedCount,
  screenPosition,
  onClose,
  onBatchModify,
  onToggleLockSelected,
  isSelectionLocked,
  lockedSelectedCount,
  onSelectEntireRoom,
  onInteractKeyE,
  onDuplicate,
  onDeleteSelected,
  onExtendWallRow,
  onCopySelected,
  onPasteClipboard,
  clipboardCount = 0,
  onSaveSelectionAsSet,
  catalogAssets = [],
  onUpdateAsset,
  onSwapConditionVariant,
  onSwapVisualDesign,
  globalAnimationFps = DEFAULT_GLOBAL_ANIMATION_FPS,
  selectedAgent = null,
  onUpdateAgent,
  onOpenCharacterCreator,
  onClearAgentSelection,
  onAutoDirectLighting
}) => {
  const [customPos, setCustomPos] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState<boolean>(false);
  const [setNameDraft, setSetNameDraft] = useState<string>('');
  const [moodPromptDraft, setMoodPromptDraft] = useState<string>('1978 Noir Detective Interrogation');
  const [agentClothingGenNonce, setAgentClothingGenNonce] = useState<number>(0);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Reset custom drag offset if primary asset or selected agent changes
  useEffect(() => {
    setCustomPos(null);
  }, [primaryAsset?.id, selectedAgent?.id]);

  const baseLeft = Math.max(16, Math.min(window.innerWidth - 310, screenPosition?.x ?? 24));
  const baseTop = Math.max(82, Math.min(window.innerHeight - 380, screenPosition?.y ?? 96));

  const left = customPos ? customPos.x : baseLeft;
  const top = customPos ? customPos.y : baseTop;

  if (selectedAgent && typeof selectedAgent === 'object') {
    const startHeaderDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: left,
        originY: top
      };
      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const nx = Math.max(8, Math.min(window.innerWidth - 290, dragRef.current.originX + (ev.clientX - dragRef.current.startX)));
        const ny = Math.max(54, Math.min(window.innerHeight - 100, dragRef.current.originY + (ev.clientY - dragRef.current.startY)));
        setCustomPos({ x: nx, y: ny });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    const CHARACTER_INTERACT_GESTURES: { value: ScheduledActivityGesture; label: string }[] = [
      { value: 'idle_observe', label: '👁️ Stand & Observe (Idle)' },
      { value: 'sit_chair', label: '🪑 Sit in Chair (Shared Rig)' },
      { value: 'open_door', label: '🚪 Open Door (Shared Rig)' },
      { value: 'press_button', label: '👆 Press Button / Reach & Touch' },
      { value: 'pickup_item', label: '📦 Place / Pickup Item' },
      { value: 'lay_bed', label: '🛏️ Lay in Bed (Shared Rig)' },
      { value: 'crawl', label: '🐾 Crawl Low (Shared Rig)' },
      { value: 'run', label: '🏃 Run / Sprint (Shared Rig)' },
      { value: 'parlor_social', label: '☕ Parlor Social / Converse' },
      { value: 'wall_listen', label: '👂 Listen at Wall / Door' },
      { value: 'inspect_ledger', label: '📖 Inspect Ledger / Notes' },
      { value: 'pace_corridor', label: '🚶 Pace Corridor / Patrol' },
      { value: 'sleepwalk_trance', label: '🌀 33Hz Sleepwalk Trance' }
    ];

    const EXPRESSIONS: FacialExpressionType[] = [
      'neutral',
      'suspicious',
      'hollow_stare',
      'side_eye_glare',
      'paranoid_twitch',
      'cryptic_whisper',
      'weary',
      'alarmed',
      'smirk',
      'grimace',
      'shocked'
    ];

    const heightScale = Number(selectedAgent.appearance?.heightScale ?? 1.0);
    const widthScale = Number(selectedAgent.appearance?.widthScale ?? 1.0);
    const headScale = Number(selectedAgent.appearance?.headScale ?? 1.0);
    const outfitColor = selectedAgent.appearance?.outfitColor || '#3b2314';

    const updateAppearanceField = (patch: Partial<HotelAgentProfile['appearance']>, msg?: string) => {
      onUpdateAgent?.(
        {
          ...selectedAgent,
          appearance: {
            ...selectedAgent.appearance,
            ...patch
          }
        },
        msg
      );
    };

    return (
      <div
        role="dialog"
        aria-label="Quick Character Editor [F]"
        data-testid="quick-edit-window-f"
        style={{ left: `${left}px`, top: `${top}px` }}
        className="studio-dark-window fixed z-40 w-72 pointer-events-auto bg-slate-900/95 backdrop-blur-md border-2 border-[#38bdf8] rounded-3xl shadow-2xl overflow-hidden text-slate-100 transition-shadow select-none"
      >
        {/* Draggable Window Title Bar with Minimize & Close [F] (Matches Asset Quick Edit Window) */}
        <div
          onPointerDown={startHeaderDrag}
          className="cursor-move select-none bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-slate-500 text-xs font-bold">⋮⋮</span>
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
              F
            </span>
            <div className="truncate">
              <div className="text-xs font-extrabold text-slate-100 truncate">
                {selectedAgent.name}
              </div>
              <div className="text-[10px] font-medium text-[#38bdf8] truncate">
                Character Quick Edit · Drag to Move
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              title={minimized ? 'Restore Character Quick Edit' : 'Minimize Character Quick Edit'}
              className="w-5 h-5 rounded-full bg-amber-950/90 hover:bg-amber-900 text-amber-200 text-[10px] font-bold flex items-center justify-center border border-amber-700/70"
            >
              {minimized ? '▲' : '—'}
            </button>
            <button
              type="button"
              data-testid="close-character-quick-edit-btn"
              onClick={() => {
                onClearAgentSelection?.();
                onClose();
              }}
              title="Close Quick Edit Window [F]"
              className="px-2 py-0.5 rounded-full bg-rose-950/90 hover:bg-rose-900 text-rose-200 text-[10px] font-bold shrink-0 border border-rose-700/70"
            >
              ✕ [F]
            </button>
          </div>
        </div>

        {!minimized && (
          <div data-testid="quick-edit-character-panel" className="p-3.5 space-y-2.5 text-slate-800">
            {/* 1. RESIZE RIG PROPORTIONS (Height / Width / Head Scale — Mirrors Asset Resize Dimensions) */}
            <div className="space-y-1.5 bg-slate-50/90 border border-slate-200 rounded-2xl p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                  Resize Rig Scale
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="quick-edit-agent-scale-down-btn"
                    onClick={() =>
                      updateAppearanceField(
                        {
                          heightScale: Number(Math.max(0.7, heightScale * 0.92).toFixed(2)),
                          widthScale: Number(Math.max(0.7, widthScale * 0.92).toFixed(2))
                        },
                        `Scaled ${selectedAgent.name} -8%`
                      )
                    }
                    className="px-2 py-0.5 rounded-full bg-white hover:bg-[#e0f2fe] border border-slate-300 text-[10px] font-bold text-slate-700"
                  >
                    -8%
                  </button>
                  <button
                    type="button"
                    data-testid="quick-edit-agent-scale-up-btn"
                    onClick={() =>
                      updateAppearanceField(
                        {
                          heightScale: Number(Math.min(1.35, heightScale * 1.08).toFixed(2)),
                          widthScale: Number(Math.min(1.35, widthScale * 1.08).toFixed(2))
                        },
                        `Scaled ${selectedAgent.name} +8%`
                      )
                    }
                    className="px-2 py-0.5 rounded-full bg-white hover:bg-[#e0f2fe] border border-slate-300 text-[10px] font-bold text-slate-700"
                  >
                    +8%
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <label className="flex flex-col">
                  <span className="text-slate-500 font-semibold">Height</span>
                  <input
                    type="number"
                    aria-label="Character Height Scale"
                    step={0.05}
                    min={0.7}
                    max={1.35}
                    value={heightScale}
                    onChange={(e) =>
                      updateAppearanceField({
                        heightScale: parseFloat(e.target.value) || 1.0
                      })
                    }
                    className="mt-0.5 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-slate-500 font-semibold">Width</span>
                  <input
                    type="number"
                    aria-label="Character Width Scale"
                    step={0.05}
                    min={0.7}
                    max={1.35}
                    value={widthScale}
                    onChange={(e) =>
                      updateAppearanceField({
                        widthScale: parseFloat(e.target.value) || 1.0
                      })
                    }
                    className="mt-0.5 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-slate-500 font-semibold">Head</span>
                  <input
                    type="number"
                    aria-label="Character Head Scale"
                    step={0.05}
                    min={0.75}
                    max={1.4}
                    value={headScale}
                    onChange={(e) =>
                      updateAppearanceField({
                        headScale: parseFloat(e.target.value) || 1.0
                      })
                    }
                    className="mt-0.5 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800"
                  />
                </label>
              </div>
            </div>

            {/* 2. ALTER OUTFIT COLOR & SWATCH (Mirrors Asset Color & Swatch) */}
            <div className="space-y-1.5 bg-slate-50/90 border border-slate-200 rounded-2xl p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                  Alter Outfit Color &amp; Swatch
                </span>
                <input
                  type="color"
                  aria-label="Character Outfit Color"
                  value={outfitColor}
                  onChange={(e) => updateAppearanceField({ outfitColor: e.target.value })}
                  className="w-5 h-5 rounded-full cursor-pointer border border-slate-300 bg-transparent"
                />
              </div>

              <div className="flex items-center justify-between gap-1 pt-0.5">
                {SWATCH_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Character Outfit Swatch ${swatch}`}
                    onClick={() => updateAppearanceField({ outfitColor: swatch })}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      outfitColor.toLowerCase() === swatch.toLowerCase()
                        ? 'ring-2 ring-[#10b981] scale-115 border-white'
                        : 'border-slate-300 hover:scale-110'
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
            </div>

            {/* 3. SHARED CHARACTER INTERACT & RIG ANIMATION SELECTOR */}
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-amber-950">
                  🎬 Shared Rig Interact Animation
                </span>
                <span className="text-[9px] font-mono text-amber-800">All Rigs Shared</span>
              </div>
              <select
                data-testid="quick-edit-agent-animation-select"
                value={selectedAgent.activeInteractGesture || 'idle_observe'}
                onChange={(e) => {
                  const nextGesture = e.target.value as ScheduledActivityGesture;
                  onUpdateAgent?.(
                    {
                      ...selectedAgent,
                      activeInteractGesture: nextGesture
                    },
                    `${selectedAgent.name} animation → ${nextGesture}`
                  );
                }}
                className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-800"
              >
                {CHARACTER_INTERACT_GESTURES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. CHARACTER IDENTITY, ROOM & AI PARAMETERS */}
            <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                  Identity &amp; Parameters
                </span>
                <span className="text-[9px] font-mono bg-sky-100 text-sky-900 px-1.5 py-0.5 rounded-full font-bold">
                  {selectedAgent.roomNumber || 'Lobby'} · {(selectedAgent.floor || 'lobby').toUpperCase()}
                </span>
              </div>
              <input
                type="text"
                data-testid="quick-edit-agent-name-input"
                value={selectedAgent.name}
                onChange={(e) =>
                  onUpdateAgent?.(
                    { ...selectedAgent, name: e.target.value },
                    `Renamed character to ${e.target.value}`
                  )
                }
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-900"
              />
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <span className="text-[9px] text-slate-500 font-bold block">Occupation</span>
                  <input
                    type="text"
                    data-testid="quick-edit-agent-occupation-input"
                    value={selectedAgent.occupation}
                    onChange={(e) =>
                      onUpdateAgent?.({ ...selectedAgent, occupation: e.target.value })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold block">Room #</span>
                  <input
                    type="text"
                    data-testid="quick-edit-agent-room-input"
                    value={selectedAgent.roomNumber}
                    onChange={(e) =>
                      onUpdateAgent?.({ ...selectedAgent, roomNumber: e.target.value })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-emerald-800">Trust Level</span>
                  <span className="font-mono text-emerald-700">{selectedAgent.trustLevel}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  data-testid="quick-edit-agent-trust-slider"
                  value={selectedAgent.trustLevel}
                  onChange={(e) =>
                    onUpdateAgent?.({
                      ...selectedAgent,
                      trustLevel: Number(e.target.value)
                    })
                  }
                  className="w-full accent-emerald-600 h-1.5 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-rose-800">Suspicion Level</span>
                  <span className="font-mono text-rose-700">{selectedAgent.suspicionLevel}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  data-testid="quick-edit-agent-suspicion-slider"
                  value={selectedAgent.suspicionLevel}
                  onChange={(e) =>
                    onUpdateAgent?.({
                      ...selectedAgent,
                      suspicionLevel: Number(e.target.value)
                    })
                  }
                  className="w-full accent-rose-600 h-1.5 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-700">Expression &amp; Spine Stoop</span>
                  <span className="font-mono text-slate-600">
                    {selectedAgent.appearance?.spineCurvature ?? 10}°
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-0.5">
                  <select
                    data-testid="quick-edit-agent-expression-select"
                    value={
                      selectedAgent.activeFacialExpression ||
                      selectedAgent.appearance?.facialExpression ||
                      'neutral'
                    }
                    onChange={(e) => {
                      const nextExp = e.target.value as FacialExpressionType;
                      onUpdateAgent?.({
                        ...selectedAgent,
                        activeFacialExpression: nextExp,
                        appearance: {
                          ...selectedAgent.appearance,
                          facialExpression: nextExp
                        }
                      });
                    }}
                    className="bg-white border border-slate-300 rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                  >
                    {EXPRESSIONS.map((exp) => (
                      <option key={exp} value={exp}>
                        {exp}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={selectedAgent.appearance?.spineCurvature ?? 10}
                    onChange={(e) =>
                      updateAppearanceField({
                        spineCurvature: Number(e.target.value)
                      })
                    }
                    className="w-full accent-[#0284c7] h-1.5 self-center cursor-pointer"
                  />
                </div>
              </div>

              {/* 3D Hair Style & Tone Switcher for Placed Character */}
              <div className="pt-1 border-t border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-extrabold text-sky-900">
                    💇 3D Hair Style Switcher
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="quick-edit-agent-hair-prev-btn"
                      onClick={() => {
                        const prevMeta = cycleCharacterHairStyle(
                          resolveCharacterHairStyle(selectedAgent.appearance),
                          'prev'
                        );
                        updateAppearanceField(
                          { hairStyle: prevMeta.id },
                          `Switched ${selectedAgent.name}'s hair to ${prevMeta.label}`
                        );
                      }}
                      className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[9px] font-extrabold cursor-pointer"
                      title="Previous Hair Style"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      data-testid="quick-edit-agent-hair-next-btn"
                      onClick={() => {
                        const nextMeta = cycleCharacterHairStyle(
                          resolveCharacterHairStyle(selectedAgent.appearance),
                          'next'
                        );
                        updateAppearanceField(
                          { hairStyle: nextMeta.id },
                          `Switched ${selectedAgent.name}'s hair to ${nextMeta.label}`
                        );
                      }}
                      className="px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[9px] font-extrabold cursor-pointer"
                      title="Next Hair Style"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                <select
                  data-testid="quick-edit-agent-hair-select"
                  value={resolveCharacterHairStyle(selectedAgent.appearance)}
                  onChange={(e) => {
                    const nextHair = e.target.value as CharacterHairStyleId;
                    const entry = CHARACTER_HAIR_STYLES.find((h) => h.id === nextHair);
                    updateAppearanceField(
                      { hairStyle: nextHair },
                      `Switched ${selectedAgent.name}'s hair to ${entry?.label || nextHair}`
                    );
                  }}
                  className="w-full bg-white border border-sky-300 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-800"
                >
                  {CHARACTER_HAIR_STYLES.map((hr) => (
                    <option key={hr.id} value={hr.id}>
                      {hr.icon} {hr.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-semibold text-slate-600">Tone:</span>
                  <div className="flex items-center gap-1">
                    {CHARACTER_HAIR_COLOR_SWATCHES.map((sw, idx) => (
                      <button
                        key={sw.id}
                        type="button"
                        data-testid={`quick-edit-agent-hair-swatch-${idx}`}
                        onClick={() =>
                          updateAppearanceField(
                            { hairColor: sw.hex },
                            `Updated ${selectedAgent.name}'s hair color to ${sw.label}`
                          )
                        }
                        style={{ backgroundColor: sw.hex }}
                        className="w-3.5 h-3.5 rounded-full border border-slate-400 hover:scale-110 transition-transform cursor-pointer"
                        title={sw.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Wardrobe & Generated Outfit Choices for Placed Character */}
              <div className="pt-1 border-t border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-extrabold text-amber-900">
                    🧥 3D Clothing &amp; Generator
                  </span>
                  <button
                    type="button"
                    data-testid="quick-edit-agent-generate-clothing-btn"
                    onClick={() => {
                      const nextNonce = agentClothingGenNonce + 1;
                      setAgentClothingGenNonce(nextNonce);
                      const choices = generateCharacterClothingChoices(
                        selectedAgent.appearance,
                        4,
                        nextNonce
                      );
                      if (choices.length > 0) {
                        const updatedApp = applyClothingChoiceToAppearance(
                          selectedAgent.appearance,
                          choices[0]
                        );
                        onUpdateAgent?.(
                          {
                            ...selectedAgent,
                            appearance: updatedApp
                          },
                          `Equipped "${choices[0].title}" on ${selectedAgent.name}`
                        );
                      }
                    }}
                    className="px-2 py-0.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-[9px] font-extrabold shadow-2xs cursor-pointer"
                  >
                    ✨ Generate 4 Outfits
                  </button>
                </div>

                <select
                  data-testid="quick-edit-agent-clothing-select"
                  value={resolveCharacterClothingStyle(selectedAgent.appearance)}
                  onChange={(e) => {
                    const nextStyle = e.target.value as CharacterClothingStyleId;
                    const entry = CHARACTER_CLOTHING_STYLES.find((s) => s.id === nextStyle);
                    updateAppearanceField(
                      {
                        clothingStyle: nextStyle,
                        clothingPattern: entry?.defaultPattern || selectedAgent.appearance?.clothingPattern,
                        customClothingLabel: entry?.label
                      },
                      `Changed ${selectedAgent.name} outfit to ${entry?.label || nextStyle}`
                    );
                  }}
                  className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-800"
                >
                  {CHARACTER_CLOTHING_STYLES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label} ({st.eraBadge})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-1">
                  {generateCharacterClothingChoices(
                    selectedAgent.appearance,
                    4,
                    agentClothingGenNonce
                  ).map((choice, idx) => (
                    <button
                      key={choice.id}
                      type="button"
                      data-testid={`quick-edit-clothing-choice-${idx}`}
                      onClick={() => {
                        const updatedApp = applyClothingChoiceToAppearance(
                          selectedAgent.appearance,
                          choice
                        );
                        onUpdateAgent?.(
                          {
                            ...selectedAgent,
                            appearance: updatedApp
                          },
                          `Applied "${choice.title}" to ${selectedAgent.name}`
                        );
                      }}
                      className="flex items-center gap-1 p-1 rounded-lg bg-white hover:bg-amber-50 border border-slate-200 text-left cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-400"
                        style={{ backgroundColor: choice.outfitColor }}
                      />
                      <span className="text-[9px] font-bold text-slate-700 truncate">
                        {choice.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. ACTION BUTTONS */}
            <div className="flex items-center gap-1.5 pt-0.5">
              {onOpenCharacterCreator && (
                <button
                  type="button"
                  data-testid="quick-edit-open-character-creator-btn"
                  onClick={() => onOpenCharacterCreator(selectedAgent)}
                  className="flex-1 py-1.5 px-2.5 rounded-full bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:from-[#0369a1] hover:to-[#075985] text-white text-[10px] font-extrabold shadow-xs"
                >
                  🧬 Full Character Studio
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClearAgentSelection?.();
                  onClose();
                }}
                className="py-1.5 px-2.5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold"
              >
                Done [F]
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!primaryAsset || typeof primaryAsset !== 'object') {
    return null;
  }

  const safeDims: [number, number, number] =
    Array.isArray(primaryAsset.dimensions) && primaryAsset.dimensions.length === 3
      ? [
          Number(primaryAsset.dimensions[0]) || 1,
          Number(primaryAsset.dimensions[1]) || 1,
          Number(primaryAsset.dimensions[2]) || 1
        ]
      : [1, 1, 1];

  const activeConditionVariant = safeExecuteCatalogOrVariantCallback(
    () => resolveAssetConditionVariant(primaryAsset),
    'pristine',
    'QuickEdit.resolveAssetConditionVariant'
  );
  const unkemptOrAged = safeExecuteCatalogOrVariantCallback(
    () => isUnkemptOrAgedAsset(primaryAsset),
    false,
    'QuickEdit.isUnkemptOrAgedAsset'
  );
  const effectiveAssetFps =
    primaryAsset.customAnimationFps || primaryAsset.customFlickerFps || globalAnimationFps;
  const flickerSpec = safeExecuteCatalogOrVariantCallback(
    () => computeUnkemptFlickerCssSpec(effectiveAssetFps, primaryAsset.id),
    {
      isFlickering: true,
      fps: effectiveAssetFps,
      steps: 6,
      stepCount: 6,
      durationSec: 0.5,
      delaySec: 0,
      animationDurationSec: '0.5s',
      animationDelaySec: '0s',
      className: 'unkempt-aged-flicker',
      styleVars: {}
    },
    'QuickEdit.computeUnkemptFlickerCssSpec'
  );
  const interactionState = safeExecuteCatalogOrVariantCallback(
    () => computeAssetInteractionVisualState(primaryAsset),
    {
      isInteractive: true,
      interactionKind: 'general_prop',
      isActivated: Boolean(primaryAsset.isActivated),
      isLightEmitting: Boolean(primaryAsset.isLightEmitting),
      screenState: 'none',
      screenColorHex: primaryAsset.color || '#8a8170',
      screenEmissiveHex: '#000000',
      screenEmissiveIntensity: 0,
      emissiveIntensity: 0,
      emitsLight: false,
      lightColorHex: '#fde68a',
      lightIntensity: 0,
      lightDistance: 0,
      statusLabel: 'STANDBY',
      statusSummary: 'STANDBY',
      actionPromptLabel: 'Interact [E]'
    },
    'QuickEdit.computeAssetInteractionVisualState'
  );
  const visualDesignVariants = safeExecuteCatalogOrVariantCallback(
    () => getAssetVisualDesignVariants(primaryAsset.subType, catalogAssets),
    [],
    'QuickEdit.getAssetVisualDesignVariants'
  );

  const safeBatchModify = (patch: Parameters<typeof onBatchModify>[0]) => {
    safeExecuteCatalogOrVariantCallback(
      () => {
        onBatchModify(patch);
      },
      undefined,
      'QuickEdit.onBatchModify'
    );
  };

  const handleApplyConditionVariant = (targetVariant: AssetConditionVariant) => {
    safeExecuteCatalogOrVariantCallback(
      () => {
        if (onSwapConditionVariant) {
          onSwapConditionVariant(targetVariant);
          return;
        }
        const res = swapAssetConditionVariant(primaryAsset, targetVariant, catalogAssets);
        if (onUpdateAsset) {
          onUpdateAsset(res.swappedAsset, res.message);
        } else {
          onBatchModify({
            color: res.swappedAsset.color,
            textureId: res.swappedAsset.textureId
          });
        }
      },
      undefined,
      `QuickEdit.handleApplyConditionVariant(${targetVariant})`
    );
  };

  const handleSwapVisualDesign = (targetSubType: string | 'next') => {
    safeExecuteCatalogOrVariantCallback(
      () => {
        if (onSwapVisualDesign) {
          onSwapVisualDesign(targetSubType);
          return;
        }
        const res = swapAssetVisualDesign(primaryAsset, targetSubType, catalogAssets);
        if (onUpdateAsset) {
          onUpdateAsset(res.swappedAsset, res.message);
        } else {
          onBatchModify({
            color: res.swappedAsset.color,
            textureId: res.swappedAsset.textureId,
            dimensions: res.swappedAsset.dimensions
          });
        }
      },
      undefined,
      `QuickEdit.handleSwapVisualDesign(${targetSubType})`
    );
  };

  const handleTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: left,
      originY: top
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const nx = Math.max(8, Math.min(window.innerWidth - 260, dragRef.current.originX + (ev.clientX - dragRef.current.startX)));
      const ny = Math.max(54, Math.min(window.innerHeight - 80, dragRef.current.originY + (ev.clientY - dragRef.current.startY)));
      setCustomPos({ x: nx, y: ny });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const effectiveIsLocked =
    typeof isSelectionLocked === 'boolean'
      ? isSelectionLocked
      : Boolean(primaryAsset.isLocked);
  const effectiveLockedCount =
    typeof lockedSelectedCount === 'number'
      ? lockedSelectedCount
      : effectiveIsLocked
      ? selectedCount
      : 0;

  const handleToggleLock = () => {
    safeExecuteCatalogOrVariantCallback(
      () => {
        if (onToggleLockSelected) {
          onToggleLockSelected();
        } else {
          safeBatchModify({ isLocked: !effectiveIsLocked });
        }
      },
      undefined,
      'QuickEdit.handleToggleLock'
    );
  };

  return (
    <div
      role="dialog"
      aria-label="Quick Asset Editor [F]"
      data-testid="quick-edit-window-f"
      style={
        {
          left: `${left}px`,
          top: `${top}px`,
          '--flicker-duration': flickerSpec.animationDurationSec,
          '--flicker-steps': flickerSpec.stepCount,
          '--flicker-delay': flickerSpec.animationDelaySec
        } as React.CSSProperties
      }
      className="studio-dark-window fixed z-40 w-72 pointer-events-auto bg-slate-900/95 backdrop-blur-md border-2 border-[#38bdf8] rounded-3xl shadow-2xl overflow-hidden text-slate-100 transition-shadow"
    >
      {/* Draggable Window Title Bar with Minimize & Close [F] (Dark Mode) */}
      <div
        onPointerDown={handleTitlePointerDown}
        className="cursor-move select-none bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-slate-500 text-xs font-bold">⋮⋮</span>
          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
            F
          </span>
          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <div
                className={`text-xs font-extrabold text-slate-100 truncate ${
                  unkemptOrAged ? 'unkempt-aged-flicker' : ''
                }`}
              >
                {selectedCount > 1
                  ? `${selectedCount} Assets Selected`
                  : primaryAsset.name}
              </div>
              {effectiveLockedCount > 0 && (
                <span
                  data-testid="quick-edit-lock-status-badge"
                  className="px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-400/70 text-amber-300 text-[9px] font-extrabold shrink-0"
                >
                  🔒 {selectedCount > 1 && !effectiveIsLocked ? `${effectiveLockedCount}/${selectedCount}` : 'LOCKED'}
                </span>
              )}
            </div>
            <div className="text-[10px] font-medium text-[#38bdf8] truncate">
              {effectiveIsLocked
                ? '🔒 Protected vs Move & Delete'
                : unkemptOrAged
                ? `🕯️ Atmospheric Flicker (${effectiveAssetFps} FPS) · Drag to Move`
                : 'Quick Edit Window · Drag to Move'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            title={minimized ? 'Restore Quick Edit Window' : 'Minimize Quick Edit Window'}
            className="w-5 h-5 rounded-full bg-amber-950/90 hover:bg-amber-900 text-amber-200 text-[10px] font-bold flex items-center justify-center border border-amber-700/70"
          >
            {minimized ? '▲' : '—'}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Quick Edit Window [F]"
            className="px-2 py-0.5 rounded-full bg-rose-950/90 hover:bg-rose-900 text-rose-200 text-[10px] font-bold shrink-0 border border-rose-700/70"
          >
            ✕ [F]
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="p-3.5 space-y-2.5 max-h-[calc(100vh-140px)] overflow-y-auto">
          {/* 0. ASSET LOCK PROTECTION BAR (Prevents Accidental Movement or Deletion) */}
          <div
            data-testid="quick-edit-lock-panel"
            className={`flex items-center justify-between gap-2 rounded-2xl px-2.5 py-1.5 border transition-colors ${
              effectiveIsLocked
                ? 'bg-amber-950/80 border-amber-500/80 text-amber-100'
                : effectiveLockedCount > 0
                ? 'bg-amber-950/45 border-amber-600/60 text-amber-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-200'
            }`}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                <span>{effectiveIsLocked ? '🔒 Asset Locked' : '🔓 Asset Lock'}</span>
              </div>
              <div className="text-[9px] text-slate-300 truncate">
                {effectiveIsLocked
                  ? 'Movement & deletion blocked'
                  : effectiveLockedCount > 0
                  ? `${effectiveLockedCount} of ${selectedCount} selected locked`
                  : 'Prevent accidental move or delete'}
              </div>
            </div>
            <button
              type="button"
              data-testid="quick-edit-lock-toggle-btn"
              aria-pressed={effectiveIsLocked}
              onClick={handleToggleLock}
              title={
                effectiveIsLocked
                  ? 'Unlock selected asset(s) to allow movement and deletion'
                  : 'Lock selected asset(s) to prevent accidental movement or deletion'
              }
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 transition-all shadow-2xs ${
                effectiveIsLocked
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-1 ring-amber-200'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-500'
              }`}
            >
              {effectiveIsLocked
                ? selectedCount > 1
                  ? `🔓 Unlock (${selectedCount})`
                  : '🔓 Unlock'
                : selectedCount > 1
                ? `🔒 Lock (${selectedCount})`
                : '🔒 Lock'}
            </button>
          </div>

          {/* 1. RESIZE CONTROLS (Uniform Scale + W / H / D Dimensions) */}
          <div className="space-y-1.5 bg-slate-50/90 border border-slate-200 rounded-2xl p-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                Resize Dimensions
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => safeBatchModify({ scaleMultiplier: 0.85 })}
                  className="px-2 py-0.5 rounded-full bg-white hover:bg-[#e0f2fe] border border-slate-300 text-[10px] font-bold text-slate-700"
                >
                  -15%
                </button>
                <button
                  type="button"
                  onClick={() => safeBatchModify({ scaleMultiplier: 1.15 })}
                  className="px-2 py-0.5 rounded-full bg-white hover:bg-[#e0f2fe] border border-slate-300 text-[10px] font-bold text-slate-700"
                >
                  +15%
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <label className="flex flex-col">
                <span className="text-slate-500 font-semibold">Width (m)</span>
                <input
                  type="number"
                  aria-label="Quick Edit Width"
                  step={0.2}
                  min={0.3}
                  max={24}
                  value={safeDims[0]}
                  onChange={(e) =>
                    safeBatchModify({
                      dimensions: [
                        parseFloat(e.target.value) || 1,
                        safeDims[1],
                        safeDims[2]
                      ]
                    })
                  }
                  className="mt-0.5 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-slate-500 font-semibold">Height (m)</span>
                <input
                  type="number"
                  aria-label="Quick Edit Height"
                  step={0.2}
                  min={0.05}
                  max={12}
                  value={safeDims[1]}
                  onChange={(e) =>
                    safeBatchModify({
                      dimensions: [
                        safeDims[0],
                        parseFloat(e.target.value) || 1,
                        safeDims[2]
                      ]
                    })
                  }
                  className="mt-0.5 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-slate-500 font-semibold">Depth (m)</span>
                <input
                  type="number"
                  aria-label="Quick Edit Depth"
                  step={0.2}
                  min={0.2}
                  max={24}
                  value={safeDims[2]}
                  onChange={(e) =>
                    safeBatchModify({
                      dimensions: [
                        safeDims[0],
                        safeDims[1],
                        parseFloat(e.target.value) || 1
                      ]
                    })
                  }
                  className="mt-0.5 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800"
                />
              </label>
            </div>
          </div>

          {/* 2. ALTER COLOR & SURFACE SWATCHES */}
          <div className="space-y-1.5 bg-slate-50/90 border border-slate-200 rounded-2xl p-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                Alter Color &amp; Swatch
              </span>
              <input
                type="color"
                aria-label="Quick Edit Custom Color"
                value={primaryAsset.color || '#592820'}
                onChange={(e) => safeBatchModify({ color: e.target.value })}
                className="w-5 h-5 rounded-full cursor-pointer border border-slate-300 bg-transparent"
              />
            </div>

            <div className="flex items-center justify-between gap-1 pt-0.5">
              {SWATCH_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Color Swatch ${swatch}`}
                  onClick={() => safeBatchModify({ color: swatch })}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    (primaryAsset.color || '').toLowerCase() === swatch.toLowerCase()
                      ? 'ring-2 ring-[#10b981] scale-115 border-white'
                      : 'border-slate-300 hover:scale-110'
                  }`}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>

            <select
              aria-label="Quick Edit Material Preset"
              value={primaryAsset.textureId}
              onChange={(e) => {
                e.currentTarget.blur();
                safeBatchModify({ textureId: e.target.value as TexturePresetId });
              }}
              className="mt-1 w-full bg-white border border-slate-300 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-700"
            >
              {TEXTURE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  Material: {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* 2B. PROPOSAL 2: HINGE SWING MODE SELECTOR (500MS TRANSITION + FOLEY) */}
          <div
            data-testid="quick-edit-hinge-mode-panel"
            className="bg-amber-50/85 border border-amber-200 rounded-2xl p-2 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
                🚪 500ms Hinge / Slide Mode
              </span>
              <label className="flex items-center gap-1 text-[10px] font-bold text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(primaryAsset.isSecretPassage || primaryAsset.category === 'secret_wall')}
                  onChange={(e) => safeBatchModify({ isSecretPassage: e.target.checked })}
                  className="accent-amber-600 rounded"
                />
                <span>Secret Passage</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'right_hinge', label: 'Right Hinge' },
                  { id: 'left_hinge', label: 'Left Hinge' },
                  { id: 'pocket_slide', label: 'Pocket Slide' }
                ] as { id: HingeSwingMode; label: string }[]
              ).map((m) => {
                const activeMode = primaryAsset.hingeSwingMode || 'right_hinge';
                const isSelected = activeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`hinge-mode-${m.id}`}
                    onClick={() => safeBatchModify({ hingeSwingMode: m.id })}
                    className={`py-1 px-1.5 rounded-full text-[10px] font-bold transition-all ${
                      isSelected
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2D. LIGHT EMISSION INTENSITY SLIDER (For light-emitting assets) */}
          {(primaryAsset.isLightEmitting ||
            primaryAsset.category === 'lighting' ||
            isTvOrCrtScreenAsset(primaryAsset) ||
            /lamp|sconce|chandelier|light|exit_sign|crt|tv|terminal|computer|neon/i.test(
              `${primaryAsset.name} ${primaryAsset.subType} ${primaryAsset.category}`
            )) && (
            <div
              data-testid="quick-edit-emission-intensity-panel"
              className="bg-amber-50/90 border border-amber-200 rounded-2xl p-2 space-y-1"
            >
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-amber-950">💡 Light Emission Intensity</span>
                <span className="font-mono text-amber-800">
                  {Number(primaryAsset.emissionIntensity ?? primaryAsset.lightIntensity ?? 1.0).toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={3.0}
                step={0.1}
                data-testid="quick-edit-emission-intensity-slider"
                value={primaryAsset.emissionIntensity ?? primaryAsset.lightIntensity ?? 1.0}
                onChange={(e) =>
                  safeBatchModify({
                    emissionIntensity: Number(e.target.value),
                    lightIntensity: Number(e.target.value),
                    isLightEmitting: true
                  })
                }
                className="w-full accent-amber-600 h-1.5 cursor-pointer"
              />
            </div>
          )}

          {/* 2E. LIGHTING PRESETS DROPDOWN */}
          {(primaryAsset.isLightEmitting ||
            primaryAsset.category === 'lighting' ||
            isTvOrCrtScreenAsset(primaryAsset) ||
            /lamp|sconce|chandelier|light|exit_sign|crt|tv|terminal|computer|neon/i.test(
              `${primaryAsset.name} ${primaryAsset.subType} ${primaryAsset.category}`
            )) && (
            <div
              data-testid="quick-edit-lighting-presets-panel"
              className="bg-amber-50/90 border border-amber-200 rounded-2xl p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-950">
                  ✨ Lighting Presets
                </span>
                <span className="text-[9px] font-mono text-amber-800">Auto-updates color &amp; intensity</span>
              </div>
              <select
                aria-label="Lighting Preset Selection"
                data-testid="quick-edit-lighting-preset-select"
                value={primaryAsset.lightingPreset || 'custom'}
                onChange={(e) => {
                  const presetId = e.target.value;
                  const found = LIGHTING_PRESETS.find((p) => p.id === presetId);
                  if (found) {
                    safeBatchModify({
                      lightingPreset: presetId,
                      emissionIntensity: found.intensity,
                      lightIntensity: found.intensity,
                      color: found.color,
                      isLightEmitting: true
                    });
                  } else {
                    safeBatchModify({ lightingPreset: 'custom', isLightEmitting: true });
                  }
                }}
                className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-800"
              >
                <option value="custom">-- Custom Preset --</option>
                {LIGHTING_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.intensity}x, {p.color})
                  </option>
                ))}
              </select>

              {/* AI Lighting Mood Auto-Director (gemini-3.1-flash-lite + 250ms Floor Crossfade) */}
              {onAutoDirectLighting && (
                <div
                  data-testid="quick-edit-ai-lighting-director"
                  className="pt-1.5 mt-1 border-t border-amber-200/80 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-900">
                      🎬 AI Room Mood Auto-Director
                    </span>
                    <span className="text-[8px] font-mono text-amber-700">250ms Crossfade · Flash-Lite</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {LIGHTING_MOOD_QUICK_PROMPTS.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        data-testid={`lighting-mood-chip-${chip.id}`}
                        onClick={() => {
                          setMoodPromptDraft(chip.prompt);
                          onAutoDirectLighting(chip.prompt);
                        }}
                        className="px-1.5 py-0.5 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-[9px] font-bold text-amber-950 transition-colors"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 pt-0.5">
                    <input
                      type="text"
                      aria-label="AI Lighting Mood Prompt"
                      data-testid="ai-lighting-mood-input"
                      value={moodPromptDraft}
                      onChange={(e) => setMoodPromptDraft(e.target.value)}
                      placeholder="e.g. 1978 Noir Interrogation..."
                      className="flex-1 min-w-0 bg-white border border-amber-300 rounded-lg px-2 py-0.5 text-[10px] text-slate-800"
                    />
                    <button
                      type="button"
                      data-testid="ai-lighting-mood-apply-btn"
                      onClick={() => onAutoDirectLighting(moodPromptDraft)}
                      className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[9px] font-extrabold shrink-0"
                    >
                      Direct
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2F. CUSTOM ANIMATION FPS OVERRIDE */}
          {(primaryAsset.isLightEmitting ||
            primaryAsset.category === 'lighting' ||
            isTvOrCrtScreenAsset(primaryAsset) ||
            unkemptOrAged ||
            /lamp|sconce|chandelier|light|exit_sign|crt|tv|terminal|computer|neon/i.test(
              `${primaryAsset.name} ${primaryAsset.subType} ${primaryAsset.category}`
            )) && (
            <div
              data-testid="quick-edit-custom-fps-panel"
              className="bg-amber-50/90 border border-amber-200 rounded-2xl p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-950">
                  ⚡ Custom Flicker FPS Override
                </span>
                <span className="text-[9px] font-mono text-amber-800">
                  {primaryAsset.customAnimationFps ? `${primaryAsset.customAnimationFps} FPS` : `Global (${globalAnimationFps} FPS)`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: 'Global', val: 0 },
                  { label: '6 FPS', val: 6 },
                  { label: '12 FPS', val: 12 },
                  { label: '24 FPS', val: 24 },
                  { label: '60 FPS', val: 60 }
                ].map((opt) => {
                  const isSelected = (opt.val === 0 && !primaryAsset.customAnimationFps) || primaryAsset.customAnimationFps === opt.val;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() =>
                        safeBatchModify({
                          customAnimationFps: opt.val === 0 ? null : opt.val
                        })
                      }
                      className={`py-1 rounded text-[9px] font-bold transition-all ${
                        isSelected
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2C. UNIVERSAL "PRISTINE / UNKEMPT / UPDATED (90S)" CONDITION VARIANT TOGGLE FOR ALL ASSETS */}
          <div
            data-testid="quick-edit-updated-90s-panel"
            className={`bg-violet-950/50 border border-violet-700/60 rounded-2xl p-2 space-y-1.5 ${
              unkemptOrAged ? 'unkempt-aged-flicker' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-300">
                🎭 Pristine / Unkempt / Updated
              </span>
              <span
                data-testid="quick-edit-condition-badge"
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 border border-violet-700/60 text-violet-200"
              >
                {isStructuralHotelAsset(primaryAsset.subType, catalogAssets)
                  ? `🏛️ Shell · ${activeConditionVariant.toUpperCase()}`
                  : activeConditionVariant === 'updated'
                  ? '🏨 Updated (90s Set)'
                  : activeConditionVariant === 'unkempt'
                  ? '🏚️ Unkempt (70s Grime)'
                  : '✨ Pristine (1978)'}
              </span>
            </div>

            <div
              data-testid="quick-edit-condition-variant-toggle"
              className="grid grid-cols-3 gap-1"
            >
              <button
                type="button"
                data-testid="quick-edit-condition-pristine-btn"
                onClick={() => handleApplyConditionVariant('pristine')}
                className={`py-1 px-1.5 rounded-full text-[10px] font-bold transition-all ${
                  activeConditionVariant === 'pristine'
                    ? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-300'
                    : 'bg-slate-900/80 text-slate-300 border border-slate-700 hover:border-emerald-500/60'
                }`}
              >
                ✨ Pristine
              </button>
              <button
                type="button"
                data-testid="quick-edit-condition-unkempt-btn"
                onClick={() => handleApplyConditionVariant('unkempt')}
                className={`py-1 px-1.5 rounded-full text-[10px] font-bold transition-all ${
                  activeConditionVariant === 'unkempt'
                    ? 'bg-amber-700 text-white shadow-2xs ring-1 ring-amber-300'
                    : 'bg-slate-900/80 text-slate-300 border border-slate-700 hover:border-amber-500/60'
                }`}
              >
                🏚️ Unkempt
              </button>
              <button
                type="button"
                data-testid="quick-edit-condition-updated-btn"
                onClick={() => handleApplyConditionVariant('updated')}
                className={`py-1 px-1.5 rounded-full text-[10px] font-bold transition-all ${
                  activeConditionVariant === 'updated'
                    ? 'bg-violet-600 text-white shadow-2xs ring-1 ring-violet-300'
                    : 'bg-slate-900/80 text-slate-300 border border-slate-700 hover:border-violet-500/60'
                }`}
              >
                🏨 Updated
              </button>
            </div>

            {visualDesignVariants.length > 1 && (
              <div
                data-testid="quick-edit-visual-design-panel"
                className="pt-1 border-t border-violet-800/50 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-violet-300">
                    🎨 Visual Design ({visualDesignVariants.length} Meshy.ai 3D Models)
                  </span>
                  <button
                    type="button"
                    data-testid="quick-edit-cycle-visual-design-btn"
                    onClick={() => handleSwapVisualDesign('next')}
                    className="px-2 py-0.5 rounded-full bg-violet-700/80 hover:bg-violet-600 text-white text-[9px] font-bold"
                  >
                    ⟳ Next Design
                  </button>
                </div>
                <select
                  aria-label="Quick Edit Visual Design Variant"
                  data-testid="quick-edit-visual-design-select"
                  value={primaryAsset.subType}
                  onChange={(e) => {
                    e.currentTarget.blur();
                    handleSwapVisualDesign(e.target.value);
                  }}
                  className="w-full bg-slate-900/90 border border-violet-700/60 rounded-full px-2 py-0.5 text-[10px] font-semibold text-violet-100"
                >
                  {visualDesignVariants.map((design, idx) => (
                    <option key={design.subType} value={design.subType}>
                      Design {idx + 1}: {design.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 3. COMMON EDITING & INTERACTIVE STATE ACTIONS */}
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              data-testid="quick-edit-rotate-90-btn"
              disabled={effectiveIsLocked}
              onClick={() => safeBatchModify({ rotationDeltaY: Math.PI / 2 })}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-45 disabled:cursor-not-allowed rounded-full text-[11px] font-bold text-slate-700"
              title={
                effectiveIsLocked
                  ? 'Asset is Locked — Unlock to rotate'
                  : selectedCount > 1
                  ? 'Rotate [R]: Rotates each wall for a wall row, or rotates the entire room as a single selection'
                  : 'Rotate 90° [R]'
              }
            >
              {selectedCount > 1 ? '↻ Rotate 90° [R]' : '↻ Rotate 90°'}
            </button>
            {onSelectEntireRoom && (
              <button
                type="button"
                data-testid="quick-edit-select-entire-room-btn"
                onClick={onSelectEntireRoom}
                className="px-2.5 py-1 bg-sky-100 hover:bg-sky-200 rounded-full text-[11px] font-bold text-sky-900 truncate"
                title="Select the entire room with all walls and assets so pressing [R] rotates the room as a single selection"
              >
                🏠 Select Entire Room
              </button>
            )}
            {selectedCount > 1 && (
              <>
                <button
                  type="button"
                  data-testid="quick-edit-rotate-room-group-btn"
                  disabled={effectiveIsLocked}
                  onClick={() =>
                    safeBatchModify({ rotationDeltaY: Math.PI / 2, rotatePivotMode: 'group' })
                  }
                  className="px-2 py-0.5 bg-indigo-100 hover:bg-indigo-200 disabled:opacity-45 disabled:cursor-not-allowed rounded-full text-[10px] font-bold text-indigo-900 truncate"
                  title="Force rotate all selected objects together around their shared center pivot"
                >
                  🏢 Rotate as Single Selection
                </button>
                <button
                  type="button"
                  data-testid="quick-edit-rotate-individual-btn"
                  disabled={effectiveIsLocked}
                  onClick={() =>
                    safeBatchModify({ rotationDeltaY: Math.PI / 2, rotatePivotMode: 'individual' })
                  }
                  className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-45 disabled:cursor-not-allowed rounded-full text-[10px] font-bold text-slate-800 truncate"
                  title="Rotate each selected object individually in place"
                >
                  🧱 Rotate Each Individually
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="quick-edit-interact-e-btn"
              onClick={() =>
                safeExecuteCatalogOrVariantCallback(
                  () => onInteractKeyE(primaryAsset),
                  undefined,
                  'QuickEdit.onInteractKeyE'
                )
              }
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all truncate ${
                primaryAsset.isActivated
                  ? 'bg-emerald-600 text-white ring-1 ring-white'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
              }`}
              title={interactionState.statusSummary}
            >
              {primaryAsset.isSecretPassage || primaryAsset.category === 'door' || primaryAsset.category === 'secret_wall'
                ? `${primaryAsset.isOpen ? 'Close' : 'Open'} 500ms [E]`
                : interactionState.actionPromptLabel}
            </button>
            <button
              type="button"
              onClick={() =>
                safeExecuteCatalogOrVariantCallback(
                  () => onDuplicate(primaryAsset),
                  undefined,
                  'QuickEdit.onDuplicate'
                )
              }
              className="px-2.5 py-1 bg-[#e0f2fe] hover:bg-[#bae6fd] rounded-full text-[11px] font-bold text-[#0369a1]"
            >
              Duplicate
            </button>
            {isInvisibleTriggerAsset(primaryAsset) && onUpdateAsset && (
              <div
                data-testid="quick-edit-invisible-trigger-section"
                className="col-span-2 bg-cyan-950/90 border border-cyan-400/70 rounded-2xl p-2 text-cyan-50 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-300">
                    👻 Invisible In-Game Event Trigger
                  </span>
                  <label className="flex items-center gap-1 text-[9px] font-bold text-cyan-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(primaryAsset.triggerOnce)}
                      onChange={(e) =>
                        onUpdateAsset(
                          {
                            ...primaryAsset,
                            triggerOnce: e.target.checked,
                            hasTriggered: false
                          },
                          `Trigger Once set to ${e.target.checked}`
                        )
                      }
                    />
                    <span>Once Only</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <span className="text-[9px] text-cyan-300 font-bold block">Event Type</span>
                    <select
                      data-testid="quick-edit-trigger-event-type-select"
                      value={primaryAsset.triggerEventType || 'sound_ambience'}
                      onChange={(e) =>
                        onUpdateAsset(
                          {
                            ...primaryAsset,
                            isInvisibleTrigger: true,
                            triggerEventType: e.target.value as InvisibleTriggerEventType
                          },
                          `Trigger event type → ${e.target.value}`
                        )
                      }
                      className="w-full bg-slate-900 border border-cyan-500/60 rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-cyan-100"
                    >
                      <option value="sound_ambience">🔊 Sound / Ambience</option>
                      <option value="sanity_shock">🧠 Sanity Shock (-8%)</option>
                      <option value="open_secret_passage">🚪 Open Secret Passage</option>
                      <option value="lights_flicker">💡 Flicker Floor Lights</option>
                      <option value="npc_anomaly">👁️ Tenant Anomaly Spike</option>
                      <option value="clue_reveal">🔍 Reveal Hidden Clue</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[9px] text-cyan-300 font-bold block">
                      Radius ({Number(primaryAsset.triggerRadius || 2.0).toFixed(1)}m)
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={0.5}
                      data-testid="quick-edit-trigger-radius-slider"
                      value={Number(primaryAsset.triggerRadius || 2.0)}
                      onChange={(e) =>
                        onUpdateAsset({
                          ...primaryAsset,
                          isInvisibleTrigger: true,
                          triggerRadius: Number(e.target.value)
                        })
                      }
                      className="w-full accent-cyan-400 h-1.5 mt-1.5 cursor-pointer"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-cyan-300 font-bold block">
                    In-Game Event Banner / Payload Message
                  </span>
                  <input
                    type="text"
                    data-testid="quick-edit-trigger-payload-input"
                    value={primaryAsset.triggerPayload || ''}
                    placeholder="Custom event message when player steps here..."
                    onChange={(e) =>
                      onUpdateAsset({
                        ...primaryAsset,
                        isInvisibleTrigger: true,
                        triggerPayload: e.target.value
                      })
                    }
                    className="w-full bg-slate-900 border border-cyan-500/60 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              data-testid="quick-edit-delete-btn"
              disabled={effectiveIsLocked}
              title={
                effectiveIsLocked
                  ? 'Asset is Locked — Unlock in Quick Edit [F] first to delete'
                  : `Delete ${selectedCount} selected asset(s)`
              }
              onClick={() =>
                safeExecuteCatalogOrVariantCallback(
                  () => onDeleteSelected(),
                  undefined,
                  'QuickEdit.onDeleteSelected'
                )
              }
              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed rounded-full text-[11px] font-bold text-rose-700"
            >
              {effectiveIsLocked ? `🔒 Locked (${selectedCount})` : `Delete (${selectedCount})`}
            </button>
            {onCopySelected && (
              <button
                type="button"
                data-testid="quick-edit-copy-btn"
                onClick={() =>
                  safeExecuteCatalogOrVariantCallback(
                    () => onCopySelected(),
                    undefined,
                    'QuickEdit.onCopySelected'
                  )
                }
                className="px-2.5 py-1 bg-sky-100 hover:bg-sky-200 rounded-full text-[11px] font-bold text-sky-900"
              >
                📋 Copy ({selectedCount}) [Ctrl+C]
              </button>
            )}
            {onPasteClipboard && (
              <button
                type="button"
                data-testid="quick-edit-paste-btn"
                disabled={clipboardCount === 0}
                onClick={() =>
                  safeExecuteCatalogOrVariantCallback(
                    () => onPasteClipboard(),
                    undefined,
                    'QuickEdit.onPasteClipboard'
                  )
                }
                className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 disabled:opacity-40 rounded-full text-[11px] font-bold text-emerald-900"
              >
                📥 Paste ({clipboardCount}) [Ctrl+V]
              </button>
            )}
            {onSaveSelectionAsSet && (
              <div className="col-span-2 flex items-center gap-1 bg-slate-50/90 border border-slate-200 rounded-full px-2 py-0.5">
                <input
                  type="text"
                  data-testid="quick-edit-set-name-input"
                  value={setNameDraft}
                  onChange={(e) => setSetNameDraft(e.target.value)}
                  placeholder={`Set name (${selectedCount} ${selectedCount === 1 ? 'item' : 'items'})...`}
                  className="flex-1 bg-transparent text-[10px] font-bold text-slate-800 px-1 focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="quick-edit-save-set-btn"
                  onClick={() =>
                    safeExecuteCatalogOrVariantCallback(
                      () => {
                        onSaveSelectionAsSet(
                          setNameDraft.trim() ||
                            (selectedCount === 1
                              ? `${primaryAsset.name} Set`
                              : `${primaryAsset.name} + ${selectedCount - 1} Items Set`)
                        );
                        setSetNameDraft('');
                      },
                      undefined,
                      'QuickEdit.onSaveSelectionAsSet'
                    )
                  }
                  className="px-2 py-0.5 rounded-full bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-[10px] font-extrabold shrink-0"
                >
                  + Save Set
                </button>
              </div>
            )}
            {primaryAsset.category === 'wall' && onExtendWallRow && (
              <button
                type="button"
                data-testid="extend-wall-row-btn"
                onClick={() =>
                  safeExecuteCatalogOrVariantCallback(
                    () => onExtendWallRow(primaryAsset),
                    undefined,
                    'QuickEdit.onExtendWallRow'
                  )
                }
                title="Activate Wall Drag Tool using this wall's style and dimensions"
                className="col-span-2 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-full text-[11px] font-bold shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>🧱</span>
                <span>Extend Wall Row (Click &amp; Drag)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

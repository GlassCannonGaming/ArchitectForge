/**
 * Barrel index re-exporting all 21 system-specific rule modules in `src/game/rules/`.
 * Keeps existing imports from `./game/rules` working while allowing low-token, single-system development.
 */
export * from './rules/coreTypesSystem';
export * from './rules/floorsAndStatsSystem';
export * from './rules/weatheringAndProcedural3dSystem';
export * from './rules/buildPlacementAndRotationSystem';
export * from './rules/characterScheduleSystem';
export * from './rules/characterRigAndAnatomySystem';
export * from './rules/characterDialogueMemorySystem';
export * from './rules/characterCameraAndPreviewSystem';
export * from './rules/roomBlueprintsAndWindowsSystem';
export * from './rules/projectSnapshotsAndLocalDiskSystem';
export * from './rules/standaloneInstallerAndAiComplianceSystem';
export * from './rules/moodLightsAndBatchImportSystem';
export * from './rules/hingesCameraAndFoleySystem';
export * from './rules/proceduralAudioAndFootstepsSystem';
export * from './rules/keybindingsAndMovementSystem';
export * from './rules/animationLodAndElevatorSystem';
export * from './rules/catalogAndTagSearchSystem';
export * from './rules/voiceAndAnimationClipSystem';
export * from './rules/assetSetsAndClipboardSystem';
export * from './rules/renovationAndTriggersSystem';
export * from './rules/interactiveAssetsAndResetRoomSystem';
export * from './rules/lightingDirectorAndUiLayoutSystem';


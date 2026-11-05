/**
 * Barrel index re-exporting all system-specific rule modules in `src/game/rules/`.
 * Keeps existing imports from `./game/rules` working while allowing modular development.
 */
export * from './rules/coreTypesAndFloors';
export * from './rules/buildAndPlacement';
export * from './rules/scheduleAndCharacterRig';
export * from './rules/roomBlueprintsAndWindows';
export * from './rules/projectAiAndInstaller';
export * from './rules/lightingHingesAndAudio';
export * from './rules/keybindingsAndAnimation';
export * from './rules/catalogVoiceAndSets';
export * from './rules/renovationTriggersAndUi';

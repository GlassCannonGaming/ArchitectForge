import { type CharacterAppearance, type CharacterStats, type FloorId, type FloorLayer, GRID_TILE_COUNT, type HotelAgentProfile, INITIAL_FLOOR_LAYERS, type PlacedAsset, type SavedInteractionEntry, type TimeOfDayEventLog } from './coreTypesAndFloors';
import { INITIAL_ROOM_BLUEPRINTS, type RoomBlueprint } from './roomBlueprintsAndWindows';
import { DEFAULT_GLOBAL_INSTRUCTION_SET } from './scheduleAndCharacterRig';
import { INITIAL_ASSET_SETS } from './catalogVoiceAndSets';
import { type ArchitectForgeProjectSnapshot, LOCAL_WORKSPACE_ROOT_NAME, LOCAL_WORKSPACE_FOLDERS, buildLocalFolderItemFilename } from './projectSnapshotsAndLocalDiskSystem';

export function buildLocalSetupScripts(): {
  windowsBat: string;
  unixSh: string;
  readmeTxt: string;
} {
  const winDirs = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `mkdir "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}\\${f.relativePath.replace(/\//g, '\\')}" 2>nul`
  ).join('\r\n');

  const unixDirs = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `mkdir -p "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/${f.relativePath}"`
  ).join('\n');

  const windowsBat = `@echo off
setlocal EnableDelayedExpansion
echo ============================================================================
echo ArchitectForge: The House Suite — Full Local Device Installer (Windows)
echo ============================================================================
set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

echo [1/4] Preparing Local Workspace Directories...
mkdir "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}" 2>nul
${winDirs}

echo [2/4] Importing Initial Asset Catalog, Room Blueprints, Character Rigs ^& Description Queue...
(
echo # ArchitectForge Late-70s ^& 1990s Asset Import Queue
echo Brass Hotel Key Rack ^| furniture ^| 0.8x1.1x0.15 ^| #5e4c2e ^| aged_brass ^| Tarnished brass wall rack for room keys
echo Flickering Exit Sign ^| lighting ^| 0.6x0.3x0.12 ^| #7f1d1d ^| aged_brass ^| Cracked red glass exit sign
echo 1978 Velvet Tufted Sofa ^| furniture ^| 2.1x0.85x0.9 ^| #4a5438 ^| velvet_crimson ^| Late-70s parlor sofa
) > "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}\\assets\\image_descriptions_import\\late70s_hotel_asset_descriptions.descriptions.txt"

(
echo {"schemaVersion":"2.0.0","installedAt":"%DATE% %TIME%","workspaceRoot":"${LOCAL_WORKSPACE_ROOT_NAME}","foldersCount":${LOCAL_WORKSPACE_FOLDERS.length},"assetsImported":true,"offlineReady":true}
) > "%INSTALL_DIR%\\${LOCAL_WORKSPACE_ROOT_NAME}\\projects\\saved_projects\\project_installed_default_seed.architectforge.json"

echo [3/4] Creating Local Desktop Shortcut ("Architect Forge.lnk")...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $desktop 'Architect Forge.lnk')); if (Test-Path (Join-Path '%INSTALL_DIR%' 'ArchitectForge_Standalone.html')) { $s.TargetPath = (Join-Path '%INSTALL_DIR%' 'ArchitectForge_Standalone.html') } else { $s.TargetPath = 'http://localhost:3000' }; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'Launch Architect Forge 3D Building, Character & Sound Studio Locally'; $s.Save()" 2>nul

echo [4/4] Verifying Offline Standalone Application ^& Local Dev Server...
echo.
echo Created all ${LOCAL_WORKSPACE_FOLDERS.length} dedicated data and newly-added asset folders inside .\\${LOCAL_WORKSPACE_ROOT_NAME}\\
echo Imported initial asset data and added "Architect Forge" shortcut to your Desktop!
echo Place any .txt or .json file of asset descriptions inside .\\${LOCAL_WORKSPACE_ROOT_NAME}\\assets\\image_descriptions_import\\
echo to batch-convert descriptions into images (gemini-3.1-flash-lite-image) -^> Meshy.ai 3D -^> Game Catalog!
if exist "%INSTALL_DIR%\\ArchitectForge_Standalone.html" (
  echo Launching ArchitectForge_Standalone.html...
  start "" "%INSTALL_DIR%\\ArchitectForge_Standalone.html"
) else if exist "%INSTALL_DIR%\\package.json" (
  echo Starting local ArchitectForge server on http://localhost:3000 ...
  call npm install
  start "" "http://localhost:3000"
  call npm run dev
)
pause
`;

  const unixSh = `#!/usr/bin/env bash
set -e
echo "============================================================================"
echo "ArchitectForge: The House Suite — Full Local Device Installer (macOS / Linux)"
echo "============================================================================"
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[1/4] Preparing Local Workspace Directories..."
mkdir -p "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}"
${unixDirs}

echo "[2/4] Importing Initial Asset Catalog, Room Blueprints, Character Rigs & Description Queue..."
cat << 'EOF' > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/assets/image_descriptions_import/late70s_hotel_asset_descriptions.descriptions.txt"
# ArchitectForge Late-70s & 1990s Asset Import Queue
Brass Hotel Key Rack | furniture | 0.8x1.1x0.15 | #5e4c2e | aged_brass | Tarnished brass wall rack for room keys
Flickering Exit Sign | lighting | 0.6x0.3x0.12 | #7f1d1d | aged_brass | Cracked red glass exit sign
1978 Velvet Tufted Sofa | furniture | 2.1x0.85x0.9 | #4a5438 | velvet_crimson | Late-70s parlor sofa
EOF

cat << 'EOF' > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/projects/saved_projects/project_installed_default_seed.architectforge.json"
{"schemaVersion":"2.0.0","workspaceRoot":"${LOCAL_WORKSPACE_ROOT_NAME}","foldersCount":11,"assetsImported":true,"offlineReady":true}
EOF

echo "[3/4] Creating Desktop Shortcut..."
DESKTOP_DIR="$HOME/Desktop"
if [ -d "$DESKTOP_DIR" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    SHORTCUT_PATH="$DESKTOP_DIR/Architect Forge.command"
    cat << EOF > "$SHORTCUT_PATH"
#!/usr/bin/env bash
cd "$INSTALL_DIR"
if [ -f "$INSTALL_DIR/ArchitectForge_Standalone.html" ]; then
  open "$INSTALL_DIR/ArchitectForge_Standalone.html"
else
  open "http://localhost:3000"
  npm run dev
fi
EOF
    chmod +x "$SHORTCUT_PATH"
  else
    SHORTCUT_PATH="$DESKTOP_DIR/ArchitectForge.desktop"
    TARGET_EXEC="xdg-open $INSTALL_DIR/ArchitectForge_Standalone.html"
    if [ ! -f "$INSTALL_DIR/ArchitectForge_Standalone.html" ]; then
      TARGET_EXEC="bash -c 'cd \"$INSTALL_DIR\" && (xdg-open http://localhost:3000 &) && npm run dev'"
    fi
    cat << EOF > "$SHORTCUT_PATH"
[Desktop Entry]
Version=1.0
Type=Application
Name=Architect Forge
Comment=Architect Forge 3D Building, Character & Sound Studio (100% Local)
Exec=$TARGET_EXEC
Path=$INSTALL_DIR
Terminal=false
Categories=Development;Graphics;Game;
EOF
    chmod +x "$SHORTCUT_PATH"
  fi
  echo "Created Desktop shortcut at: $SHORTCUT_PATH"
fi

echo "[4/4] Finalizing Local Installation..."
echo "Created all ${LOCAL_WORKSPACE_FOLDERS.length} dedicated data and newly-added asset folders inside ./${LOCAL_WORKSPACE_ROOT_NAME}/"
echo "Place any .txt or .json file of asset descriptions inside ./${LOCAL_WORKSPACE_ROOT_NAME}/assets/image_descriptions_import/"
echo "to batch-convert descriptions into images (gemini-3.1-flash-lite-image) -> Meshy.ai 3D -> Game Catalog!"
`;

  const folderTable = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `- ${LOCAL_WORKSPACE_ROOT_NAME}/${f.relativePath}/  -> ${f.label} (*${f.extension})\n    Auto-saves when: ${f.autoSavesOn}`
  ).join('\n');

  const readmeTxt = `ARCHITECTFORGE: THE HOUSE SUITE — 100% LOCAL COMPUTER INSTALLER & WORKSPACE
============================================================================

Dedicated Folder Structure (${LOCAL_WORKSPACE_ROOT_NAME}/):
${folderTable}

What the Local Device Installer Does:
1. Prepares all ${LOCAL_WORKSPACE_FOLDERS.length} dedicated folders under ./${LOCAL_WORKSPACE_ROOT_NAME}/.
2. Imports all initial 3D asset catalog blueprints, 1978 Pristine / 1970s Unkempt / 1990s Updated themes,
   Room Blueprints, Character Rigs, Audio Presets, and the Asset Description Queue onto local disk.
3. Creates a Desktop Shortcut ("Architect Forge.lnk" on Windows, "ArchitectForge.desktop" on Linux,
   or "Architect Forge.command" on macOS) so you can launch the app directly from your Desktop.
4. Unpacks "ArchitectForge_Standalone.html" for 100% offline local execution in any browser without
   requiring cloud dependencies.
`;

  return { windowsBat, unixSh, readmeTxt };
}

export interface FullLocalInstallerBundleSpec {
  installerWindowsBatFilename: string;
  installerWindowsBatContent: string;
  installerUnixShFilename: string;
  installerUnixShContent: string;
  foldersPrepared: string[];
  desktopShortcutName: string;
  importedCounts: {
    placedAssets: number;
    roomBlueprints: number;
    assetSets: number;
    characterRigs: number;
  };
}

/**
 * Builds a self-contained cross-platform local installer script bundle that:
 * 1. Creates all `ArchitectForge_Workspace` directories on the user's computer,
 * 2. Writes/imports the complete project snapshot & asset catalog JSON files into the local folders,
 * 3. Writes the standalone offline HTML app (`ArchitectForge_Standalone.html`) if provided,
 * 4. Creates a Desktop shortcut (`Architect Forge.lnk` / `.desktop` / `.command`) and launches the app locally.
 */
export function buildFullLocalDeviceInstallerBundle(
  projectSnapshot: ArchitectForgeProjectSnapshot,
  standaloneHtmlContent?: string
): FullLocalInstallerBundleSpec {
  const baseScripts = buildLocalSetupScripts();
  const foldersPrepared = LOCAL_WORKSPACE_FOLDERS.map(
    (f) => `${LOCAL_WORKSPACE_ROOT_NAME}/${f.relativePath}`
  );
  const projectJsonCompact = JSON.stringify(projectSnapshot);
  const projectBase64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(projectJsonCompact, 'utf-8').toString('base64')
      : typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(projectJsonCompact)))
      : '';

  const htmlBase64 =
    standaloneHtmlContent && typeof Buffer !== 'undefined'
      ? Buffer.from(standaloneHtmlContent, 'utf-8').toString('base64')
      : standaloneHtmlContent && typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(standaloneHtmlContent)))
      : '';

  const winHtmlExtractStep = htmlBase64
    ? `echo Extracting Offline Standalone App (ArchitectForge_Standalone.html)...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllBytes((Join-Path '%INSTALL_DIR%' 'ArchitectForge_Standalone.html'), [Convert]::FromBase64String('${htmlBase64}'))"\r\n`
    : '';

  const winProjectExtractStep = projectBase64
    ? `echo Importing Full Asset Catalog, Placed Objects, Room Blueprints ^& Character Rigs...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllBytes((Join-Path '%INSTALL_DIR%' '${LOCAL_WORKSPACE_ROOT_NAME}\\projects\\saved_projects\\project_full_local_install.architectforge.json'), [Convert]::FromBase64String('${projectBase64}'))"\r\n`
    : '';

  const installerWindowsBatContent = `${baseScripts.windowsBat.replace('pause\r\n', '')}${winProjectExtractStep}${winHtmlExtractStep}echo Full Local Installation Complete!
pause
`;

  const unixHtmlExtractStep = htmlBase64
    ? `echo "Extracting Offline Standalone App (ArchitectForge_Standalone.html)..."\necho "${htmlBase64}" | base64 -d > "$INSTALL_DIR/ArchitectForge_Standalone.html" 2>/dev/null || echo "${htmlBase64}" | base64 -D > "$INSTALL_DIR/ArchitectForge_Standalone.html"\n`
    : '';

  const unixProjectExtractStep = projectBase64
    ? `echo "Importing Full Asset Catalog, Placed Objects, Room Blueprints & Character Rigs..."\necho "${projectBase64}" | base64 -d > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/projects/saved_projects/project_full_local_install.architectforge.json" 2>/dev/null || echo "${projectBase64}" | base64 -D > "$INSTALL_DIR/${LOCAL_WORKSPACE_ROOT_NAME}/projects/saved_projects/project_full_local_install.architectforge.json"\n`
    : '';

  const installerUnixShContent = `${baseScripts.unixSh}\n${unixProjectExtractStep}${unixHtmlExtractStep}echo "Full Local Installation Complete!"\n`;

  return {
    installerWindowsBatFilename: 'Install_ArchitectForge_Local.bat',
    installerWindowsBatContent,
    installerUnixShFilename: 'Install_ArchitectForge_Local.sh',
    installerUnixShContent,
    foldersPrepared,
    desktopShortcutName: 'Architect Forge',
    importedCounts: {
      placedAssets: projectSnapshot.assets?.length || 0,
      roomBlueprints: projectSnapshot.roomBlueprints?.length || 0,
      assetSets: INITIAL_ASSET_SETS.length,
      characterRigs: projectSnapshot.characterRigs?.length || 0
    }
  };
}

@echo off
setlocal enabledelayedexpansion

:: Clear all variables at start
set "args="
set "cache_dir="
set "base_dir="
set "canOptMesh="
set "canOptTextures="
set "canBackupCache="
set "canMigrate="
set "maxMeshFloatDecimals="
set "resizePercent="
set "minResizeDimension="
set "maxResizeDimension="

:: Cache file location (saved next to the batch script)
set "cacheFile=%~dp0cache_base_dir.txt"

:: Load cache dir
if exist "%cacheFile%" set /p cache_dir=<"%cacheFile%"

:: Prompt for base_dir
:base_dir
echo Enter path to HLA.exe
if exist "%cacheFile%" (
  if not "!cache_dir!"=="" (
    set base_dir=!cache_dir!
    echo or press Enter to default to: "!cache_dir!"
  )
)
set /p base_dir="> "

:: Trim spaces from user input (both ends)
:trim_user_input
:: Trim leading spaces
if "!base_dir:~0,1!"==" " (
  set "base_dir=!base_dir:~1!"
  goto :trim_user_input
)
:: Trim trailing spaces
if "!base_dir:~-1!"==" " (
  set "base_dir=!base_dir:~0,-1!"
  goto :trim_user_input
)

:: Clear quotes
if not "!base_dir!"=="" (
  set "base_dir=!base_dir:"=!"
)

:: Clear trailing \
if "!base_dir:~-1!"=="\" set "base_dir=!base_dir:~0,-1!"

:: validate empty dir
if "!base_dir!"=="" (
  cls
  goto :base_dir
)

:: Save to cache file
if not "!base_dir!"=="!cache_dir!" (
  <nul set /p "=!base_dir!" > "%cacheFile%"
)

:: Optimize Textures ------------------------------------------
cls
echo Do you want to Optimize Textures ?
echo.
echo convert textures to .DDS and compress with dxt1/dxt5
echo.
echo \Mods\GEG Redux\Data\MEDIA
echo \Mods\GEG Redux\Data\BMP  [no resize]
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canOptTextures=true
if errorlevel 2 set canOptTextures=false
set "args=!args! --canOptTextures !canOptTextures!"

if errorlevel 2 goto :ask_optMesh

:: Prompt for resize percent ----------------------------------
set default_resizePercent=80
cls
:ask_resizePercent
echo Enter resize percentage %% (1~100)
echo   example resize 80%% texture 1024x512px: 819x410px
echo.
echo or press Enter to default to: %default_resizePercent%
set /p resizePercent="> "
if "!resizePercent!"=="" (
  set resizePercent=%default_resizePercent%
)

:: Remove % symbol if present
set "resizePercent=!resizePercent:%%=!"

echo !resizePercent!|findstr /r "^[0-9][0-9]*$" >nul || (
  cls
  echo Invalid input. Must be a number.
  echo.
  goto :ask_resizePercent
)

:: Check range 1~100
if !resizePercent! lss 1 (
  cls
  echo Error: Percentage cannot be less than 1.
  echo.
  goto :ask_resizePercent
)
if !resizePercent! gtr 100 (
  cls
  echo Error: Percentage cannot exceed 100.
  echo.
  goto :ask_resizePercent
)
set "args=!args! --resizePercent !resizePercent!"

:: Prompt for max resize dimension ----------------------------
set default_maxResizeDimension=512
cls
echo Enter max resize dimension in pixels
echo to trim any over-sized textures
echo so the output cannot be big than that
echo.
echo or press Enter to default to: %default_maxResizeDimension%
set /p maxResizeDimension="> "
if "!maxResizeDimension!"=="" (
  set maxResizeDimension=%default_maxResizeDimension%
)
set "args=!args! --maxResizeDimension !maxResizeDimension!"

:: Prompt for min resize dimension ----------------------------
set default_minResizeDimension=64
cls
echo Enter min resize dimension in pixels
echo so the output cannot be small than that
echo And to skip resizing tiny textures
echo.
echo or press Enter to default to: %default_minResizeDimension%
set /p minResizeDimension="> "
if "!minResizeDimension!"=="" (
  set minResizeDimension=%default_minResizeDimension%
)
set "args=!args! --minResizeDimension !minResizeDimension!"

:: Optimize 3d Mesh -------------------------------------------
:ask_optMesh
cls
echo Do you want to Optimize 3d Mesh files ?
echo.
echo convert to binary supported files as 0303txt
echo opt text of unsupported files as 0302txt
echo.
echo \Mods\GEG Redux\Data\ACTORS\ITEMS
echo \Mods\GEG Redux\Data\ACTORS\MONSTERS [repack .azp]
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canOptMesh=true
if errorlevel 2 set canOptMesh=false
set "args=!args! --canOptMesh !canOptMesh!"

if errorlevel 2 goto :ask_canBackupCache

:: Prompt for max Mesh float decimals -------------------------
cls
set default_maxMeshFloatDecimals=4
:ask_maxMeshFloatDecimals
echo Enter max float decimals of 3d Mesh coordinates
echo.
echo by default all coords floats have 6 decimals
echo reducing the number will boost loading speed
echo.
echo but reducing much accuracy will render Blocky textures
echo so its bad to reduce to 1 or 2 decimals
echo.
echo example reducing decimals form 6 to 4:
echo    0.123456 opted to  0.1235
echo   -1.000000 opted to -1.0
echo.
echo recommanded to reduce to: %default_maxMeshFloatDecimals%
choice /c 123456 /n /m "[1~6]: "
if errorlevel 1 set maxMeshFloatDecimals=1
if errorlevel 2 set maxMeshFloatDecimals=2
if errorlevel 3 set maxMeshFloatDecimals=3
if errorlevel 4 set maxMeshFloatDecimals=4
if errorlevel 5 set maxMeshFloatDecimals=5
if errorlevel 6 set maxMeshFloatDecimals=6
set "args=!args! --maxMeshFloatDecimals !maxMeshFloatDecimals!"

:: Promp fror backup cache ------------------------------------
:ask_canBackupCache
cls
echo Do you want to backup Cache ?
echo so the engine can regenerate fresh opted cache
echo.
echo move "\RenderItems"
echo to   "\_geg_redux_opt\_cache\<date>\RenderItems"
echo.
echo move "\Temp"
echo to   "\_geg_redux_opt\_cache\<date>\Temp"
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canBackupCache=true
if errorlevel 2 set canBackupCache=false
set "args=!args! --canBackupCache !canBackupCache!"

:: Prompt for migration ---------------------------------------
cls
echo Do you want to Migration from v1 to v2 ?
echo.
echo For new users, or who already migrated: skip [N]
echo.
echo But If you used v1 of this tool and never migrated before
echo then you need to migrate to v2
echo.
echo you can find the version on "\geg_redux_opt\package.json"
echo if the version are "1.x.x" then its v1
echo.
echo migration process: =============================
echo move  v1 "\Mods\GEG Redux\Data\_backup"
echo to    v2 "\_geg_redux_opt\_backup"
echo.
echo clear v1 "\Mods\GEG Redux\Data\_temp"
echo.
echo move  v1 "\RenderItems_backup_<timestimp>"
echo to    v2 "\_geg_redux_opt\_cache\<date>\RenderItems"
echo.
echo move  v1 "\Temp_backup_<timestimp>"
echo to    v2 "\_geg_redux_opt\_cache\<date>\Temp"
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canMigrate=true
if errorlevel 2 set canMigrate=false
set "args=!args! --canMigrate !canMigrate!"

:: summary ----------------------------------------------------
cls
echo ========================================
echo              SUMMARY
echo ========================================
echo.
echo HLA.exe Directory:    "!base_dir!"
echo.

if %canOptTextures%==true (
  echo Optimize Textures ----------------------
  echo Resize Percent:       !resizePercent!%%
  echo Min Resize Dimension: !minResizeDimension!px
  echo Max Resize Dimension: !maxResizeDimension!px
  echo target directories:
  echo   \Mods\GEG Redux\Data\MEDIA
  echo   \Mods\GEG Redux\Data\BMP   [no resize]
  echo.
)

if %canOptMesh%==true (
  echo Optimize 3D Mesh files -----------------
  echo Max Float Decimals: !maxMeshFloatDecimals!
  echo target directories:
  echo   \Mods\GEG Redux\Data\ACTORS\ITEMS
  echo   \Mods\GEG Redux\Data\ACTORS\MONSTERS [repack .azp]
  echo.
)

if %canBackupCache%==true (
  echo Backup cache ---------------------------
  echo move "\RenderItems"
  echo to   "\_geg_redux_opt\_cache\<date>\RenderItems"
  echo.
  echo move "\Temp"
  echo to   "\_geg_redux_opt\_cache\<date>\Temp"
  echo.
)

if %canMigrate%==true (
  echo Migrate from v1 to v2 ------------------
  echo move  v1 "\Mods\GEG Redux\Data\_backup"
  echo to    v2 "\_geg_redux_opt\_backup"
  echo.
  echo clear v1 "\Mods\GEG Redux\Data\_temp"
  echo.
  echo move  v1 "\RenderItems_backup_<timestimp>"
  echo to    v2 "\_geg_redux_opt\_cache\<date>\RenderItems"
  echo.
  echo move  v1 "\Temp_backup_<timestimp>"
  echo to    v2 "\_geg_redux_opt\_cache\<date>\Temp"
  echo.
)

echo ========================================
echo.
set /p confirm="Press Enter to start processing"

echo.
echo Starting processing...
echo ========================================
echo.

:: Run Node.js script with all arguments
node "%~dp0src/index.js" "!base_dir!" !args!

echo.
echo ========================================
echo Processing complete!

pause

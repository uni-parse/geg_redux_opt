@echo off
setlocal enabledelayedexpansion

:: Clear all variables at start
set "args="
set "threads="
set "cache_dir="
set "base_dir="
set "canBackupCache="
set "canMigrate="

set "canOptTextures="
set "resizePercent="
set "minResizeDimension="
set "maxResizeDimension="

set "canOptAudio="
set "maxSampleRate="
set "maxBitDepth="
set "canForceMonoChannel="

set "canOptMesh="
set "maxMeshFloatDecimals="

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
echo \Mods\GEG Redux\Data\BMP          [no resize]
echo \Mods\GEG Redux\Data\MEDIA
echo \Mods\GEG Redux\Data\HARDLIFE\BMP
echo \Data\HardLife.zip\BMP            [no resize]
echo \Data\HardLife.zip\MEDIA
echo \Data\HardLife.zip\HARDLIFE\BMP
echo \Data\HardLife.zip\RENDEREDITEMS
echo \Data\HardLife_En.zip\BMP         [no resize]
echo \Data\HardLife_En.zip\MEDIA
echo \Data\HardLife_En.zip\HARDLIFE\BMP
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canOptTextures=true
if errorlevel 2 set canOptTextures=false
set "args=!args! --canOptTextures !canOptTextures!"

if errorlevel 2 goto :ask_optAudio

:: Prompt for resize percent ----------------------------------
set default_resizePercent=80
cls
:ask_resizePercent
echo Enter Percentage %% to Resize Textures Dimension
echo example resize 1024x512px by 80%% to be 819x410px
echo.
echo if you do not want to resize, enter: 100
echo.
echo or press Enter to default to: %default_resizePercent%
set /p resizePercent="[1~100]: "
if "!resizePercent!"=="" (
  set resizePercent=%default_resizePercent%
) else (
  :: Remove % symbol if present
  set "resizePercent=!resizePercent:%%=!"

  echo !resizePercent!|findstr /r "^[0-9][0-9]*$" >nul || (
    cls
    echo Invalid input "!resizePercent!". Must be a number.
    echo.
    goto :ask_resizePercent
  )
  if !resizePercent! lss 1 set resizePercent=1
  if !resizePercent! gtr 100 set resizePercent=100
)
set "args=!args! --resizePercent !resizePercent!"

:: Prompt for max resize dimension ----------------------------
set default_maxResizeDimension=512
cls
:ask_maxResizeDimension
echo Enter Max Texture Dimension can be Resized to
echo so the output cannot be big than that
echo and trim all over-sized textures
echo.
echo or press Enter to default to: %default_maxResizeDimension%px
set /p maxResizeDimension="[1~4096]: "
if "!maxResizeDimension!"=="" (
  set maxResizeDimension=%default_maxResizeDimension%
) else (
  echo !maxResizeDimension!|findstr /r "^[0-9][0-9]*$" >nul || (
    cls
    echo Invalid input "!maxResizeDimension!". Must be a number.
    echo.
    goto :ask_maxResizeDimension
  )
  if !maxResizeDimension! lss 1 set maxResizeDimension=1
  if !maxResizeDimension! gtr 4096 set maxResizeDimension=4096
)
set "args=!args! --maxResizeDimension !maxResizeDimension!"

:: Prompt for min resize dimension ----------------------------
set default_minResizeDimension=64
cls
:ask_minResizeDimension
echo Enter Min Texture Dimension can be Resized to
echo so the output cannot be small than that
echo and skip resizing tiny textures
echo.
echo or press Enter to default to: %default_minResizeDimension%px
set /p minResizeDimension="[1~4096]: "
if "!minResizeDimension!"=="" (
  set minResizeDimension=%default_minResizeDimension%
) else (
  echo !minResizeDimension!|findstr /r "^[0-9][0-9]*$" >nul || (
    cls
    echo Invalid input "!minResizeDimension!". Must be a number.
    echo.
    goto :ask_minResizeDimension
  )
  if !minResizeDimension! lss 1 set minResizeDimension=1
  if !minResizeDimension! gtr 4096 set minResizeDimension=4096
)
set "args=!args! --minResizeDimension !minResizeDimension!"

:: Optimize audio ---------------------------------------------
:ask_optAudio
cls
echo Do you want to Optimize audio files ?
echo.
echo \Mods\GEG Redux\Data\music
echo \Mods\GEG Redux\Data\SOUNDS
echo \Data\Music
echo \Data\Sounds
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canOptAudio=true
if errorlevel 2 set canOptAudio=false
set "args=!args! --canOptAudio !canOptAudio!"

if errorlevel 2 goto :ask_canOptMesh

:: Prompt for max sample rate ---------------------------------
set default_maxSampleRate=13000
cls
:ask_maxSampleRate
echo Enter max sample-rate of audio files
echo so the output cannot be big than that
echo.
echo the lower the better for memory
echo but under %default_maxSampleRate%Hz make audio bad "shhhhh"
echo.
echo or press Enter to default to: %default_maxSampleRate%Hz
set /p maxSampleRate="[8000~48000]: "
if "!maxSampleRate!"=="" (
  set maxSampleRate=%default_maxSampleRate%
) else (
  echo !maxSampleRate!|findstr /r "^[0-9][0-9]*$" >nul || (
    cls
    echo Invalid input "!maxSampleRate!". Must be a number.
    echo.
    goto :ask_maxSampleRate
  )
  if !maxSampleRate! lss 1 set maxSampleRate=8000
  if !maxSampleRate! gtr 1 set maxSampleRate=48000
)
set "args=!args! --maxSampleRate !maxSampleRate!"

:: Prompt for max bit depth -----------------------------------
cls
echo Choice max bit-depth of audio files
echo so the output cannot be big than that
echo.
echo [A] 8-bit
echo [B] 16-bit
echo [C] 24-bit
echo [D] 32-bit
echo.
echo the lower the better for memory
echo but reducing to 8-bit make audio bad "shhhhh"
echo.
echo recommanded: [B] 16-bit
choice /c abcd /n /m "[A|B|C|D]: "
if errorlevel 1 set maxBitDepth=8
if errorlevel 2 set maxBitDepth=16
if errorlevel 3 set maxBitDepth=24
if errorlevel 4 set maxBitDepth=32
set "args=!args! --maxBitDepth !maxBitDepth!"

:: Prompt for mono channel ------------------------------------
cls
echo Do you want to force mono-channel of audio
echo.
echo some audio files have 2 channels: left and right
echo.
echo that will save 50%% memory
echo but you will lose the feeling of 3d audio
echo.
choice /c yn /n /m "[Y/N]: "
if errorlevel 1 set canForceMonoChannel=true
if errorlevel 2 set canForceMonoChannel=false
set "args=!args! --canForceMonoChannel !canForceMonoChannel!"

:: Optimize 3d Mesh -------------------------------------------
:ask_canOptMesh
cls
echo Do you want to Optimize 3d Mesh files ?
echo.
echo convert to binary supported files as 0303txt
echo opt text of unsupported files as 0302txt
echo.
echo \Mods\GEG Redux\Data\ACTORS\ITEMS
echo \Mods\GEG Redux\Data\ACTORS\MONSTERS [repack azp]
echo \Data\Actors\Monsters                [repack azp]
echo \Data\HardLife.zip\ACTORS
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
echo recommanded: %default_maxMeshFloatDecimals%
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

:: Prompt for cores -------------------------------------------
set /a default_threads=%NUMBER_OF_PROCESSORS% - 1
if %default_threads% lss 1 set default_threads=1

cls
:ask_threads
echo How much CPU threads do you want to assign?
echo your total CPU threads are: %NUMBER_OF_PROCESSORS%
echo.
echo More threads means faster process
echo But using all may cause the system to become unresponsive
echo.
echo or press Enter to default to: %default_threads%
set /p threads="[1-%NUMBER_OF_PROCESSORS%]: "
if "!threads!"=="" (
  set threads=!default_threads!
) else (
  echo !threads!|findstr /r "^[0-9][0-9]*$" >nul || (
    cls
    echo Invalid input "!threads!". Must be a number.
    echo.
    goto :ask_threads
  )
  if !threads! lss 1 set threads=1
  if !threads! gtr %NUMBER_OF_PROCESSORS% (
    set threads=%NUMBER_OF_PROCESSORS%
  )
)
set "args=!args! --threads !threads!"

:: summary ----------------------------------------------------
cls
echo ========================================
echo              SUMMARY
echo ========================================
echo.
echo CPU threads used:     !threads! / %NUMBER_OF_PROCESSORS%
echo HLA.exe Directory:    "!base_dir!"
echo.

if %canOptTextures%==true (
  echo Optimize Textures ----------------------
  echo Resize Percent:       !resizePercent!%%
  echo Min Resize Dimension: !minResizeDimension!px
  echo Max Resize Dimension: !maxResizeDimension!px
  echo Target Directories:
  echo   \Mods\GEG Redux\Data\BMP              [no resize]
  echo   \Mods\GEG Redux\Data\MEDIA
  echo   \Mods\GEG Redux\Data\HARDLIFE\BMP
  echo   \Data\HardLife.zip\BMP                [no resize]
  echo   \Data\HardLife.zip\MEDIA
  echo   \Data\HardLife.zip\HARDLIFE\BMP
  echo   \Data\HardLife.zip\RENDEREDITEMS
  echo   \Data\HardLife_En.zip\BMP             [no resize]
  echo   \Data\HardLife_En.zip\MEDIA
  echo   \Data\HardLife_En.zip\HARDLIFE\BMP
  echo.
)

if %canOptAudio%==true (
  echo Optimize Audio ----------------------
  echo Max Sample-Rate:      !maxSampleRate!Hz
  echo Max Bit-Depth:        !maxBitDepth!-bit
  echo Force mono-channel:   !canForceMonoChannel!
  echo Target Directories:
  echo   \Mods\GEG Redux\Data\music
  echo   \Mods\GEG Redux\Data\SOUNDS
  echo   \Data\Music
  echo   \Data\Sounds
  echo.
)

if %canOptMesh%==true (
  echo Optimize 3D Mesh files -----------------
  echo Max Float Decimals: !maxMeshFloatDecimals!
  echo Target Directories:
  echo   \Mods\GEG Redux\Data\ACTORS\ITEMS
  echo   \Mods\GEG Redux\Data\ACTORS\MONSTERS [repack azp]
  echo   \Data\Actors\Monsters                [repack azp]
  echo   \Data\HardLife.zip\ACTORS
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

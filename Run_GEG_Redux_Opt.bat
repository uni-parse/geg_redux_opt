@echo off
setlocal enabledelayedexpansion

:: Clear all variables at start
set "args="
set "cache_dir="
set "base_dir="
set "select_mode="
set "maxMeshFloatDecimals="
set "resizePercent="
set "minResize="
set "maxResize="

:: Cache file location (saved next to the batch script)
set "cacheFile=%~dp0cache_base_dir.txt"

:: Load cache dir
if exist "%cacheFile%" set /p cache_dir=<"%cacheFile%"

:: Prompt for base_dir
:base_dir
echo Enter path to "...\Mods\GEG Redux\Data":
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

cls
:select_mode
echo Select what to optimize:
echo [1] 3D Mesh files only
echo [2] Textures only
echo [3] Both 3D Mesh and Textures
echo.
echo or press Enter to default to: 3 (Both)
echo.

set /p select_mode="Enter choice (1~3): "
if "!select_mode!"=="" set select_mode=3
echo !select_mode!|findstr /r "^[1-3]$" >nul || (
  cls
  echo Invalid choice. Please enter 1, 2, or 3.
  echo.
  goto :select_mode
)

if "!select_mode!"=="2" goto :ask_images

:: Prompt for maxMeshFloatDecimals
cls
set default_maxMeshFloatDecimals=4
:ask_maxMeshFloatDecimals
echo set max float decimals of 3d Mesh coordinates
echo example (6 to 4): 0.123456 opted to 0.1235
echo.
echo Enter number of max decimals after float (3~6)
echo or press Enter to default to: %default_maxMeshFloatDecimals%

set /p maxMeshFloatDecimals="> "
if "!maxMeshFloatDecimals!"=="" set maxMeshFloatDecimals=%default_maxMeshFloatDecimals%
echo !maxMeshFloatDecimals!|findstr /r "^[3-6]$" >nul || (
  cls
  echo Invalid input. Must be between 3 and 6.
  echo.
  goto :ask_maxMeshFloatDecimals
)
set "args=!args! --maxMeshFloatDecimals !maxMeshFloatDecimals!"

if "!select_mode!"=="1" goto :show_summary

:ask_images

:: Prompt for resizePercent -------------------------
set default_resizePercent=80
cls
:ask_resizePercent
echo Enter resize percentage %% (1~100)
echo or press Enter to default to: %default_resizePercent%
set /p resizePercent="> "
if "!resizePercent!"=="" set resizePercent=%default_resizePercent%

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

:: Prompt for minResize -----------------------------
set default_minResize=64
cls
echo Enter min resize dimension in pixels
echo or press Enter to default to: %default_minResize%
set /p minResize="> "
if "!minResize!"=="" set minResize=%default_minResize%
set "args=!args! --minResize !minResize!"

:: Prompt for maxResize -----------------------------
set default_maxResize=512
cls
echo Enter max resize dimension in pixels
echo or press Enter to default to: %default_maxResize%
set /p maxResize="> "
if "!maxResize!"=="" set maxResize=%default_maxResize%
set "args=!args! --maxResize !maxResize!"

:: summary ------------------------------------------
:show_summary
cls
echo ========================================
echo              SUMMARY
echo ========================================
echo.
echo Source Path:    "!base_dir!"
if %select_mode%==1 (
  echo Optimize mode:  3D Mesh files only
  echo Max Float Decimals: !maxMeshFloatDecimals!
  echo Target Path:    \ACTORS\ITEMS    [3d mesh]
  echo                 \ACTORS\MONSTERS [3d mesh repack .azp]
) else if %select_mode%==2 (
  echo Optimize mode:  Textures only
  echo Resize Percent: !resizePercent!%%
  echo Min Dimension:  !minResize!px
  echo Max Dimension:  !maxResize!px
  echo Target Paths:   \MEDIA  [textures]
  echo                 \BMP    [textures, no resize]
) else if %select_mode%==3 (
  echo Optimize mode:  Both Textures and 3D Mesh files
  echo Max Float Decimals: !maxMeshFloatDecimals!
  echo Resize Percent: !resizePercent!%%
  echo Min Dimension:  !minResize!px
  echo Max Dimension:  !maxResize!px
  echo Target Paths:   \MEDIA           [textures]
  echo                 \BMP             [textures, no resize]
  echo                 \ACTORS\ITEMS    [3d mesh]
  echo                 \ACTORS\MONSTERS [3d mesh, repack .azp]
)
echo.
echo ========================================
echo.
set /p confirm="Press Enter to start processing"

echo.
echo Starting processing...
echo ========================================
echo.

:: Run Node.js script with all arguments
node "%~dp0src/index.js" "!base_dir!" !select_mode! !args!

echo.
echo ========================================
echo Processing complete!

pause

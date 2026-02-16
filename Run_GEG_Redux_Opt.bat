@echo off
setlocal enabledelayedexpansion

:: Clear all variables at start
set "args="
set "src_path="
set "select_mode="
set "floatDecimal="
set "resizePercent="
set "minResize="
set "maxResize="

:: Prompt for src_path
:src_path
echo Enter path to "...\Mods\GEG Redux\Data":
set /p src_path="> "
if "!src_path!"=="" (
    cls
    goto :src_path
)

:: Clean path from quotes and trailing \
set "src_path=!src_path:"=!"
if "!src_path:~-1!"=="\" set "src_path=!src_path:~0,-1!"

cls
:select_mode
echo Select what to optimize:
echo [1] 3D Mech files only
echo [2] Textures only
echo [3] Both 3D Mech and Textures
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

:: Prompt for floatDecimal
cls
set default_floatDecimal=4
:ask_floatDecimal
echo for 3d Mech optimization
echo Enter number of decimals after float point (2~6)
echo or press Enter to default to: %default_floatDecimal%
echo example: 0.123456 opted to 0.1235

set /p floatDecimal="> "
if "!floatDecimal!"=="" set floatDecimal=%default_floatDecimal%
echo !floatDecimal!|findstr /r "^[2-6]$" >nul || (
  cls
  echo Invalid input. Must be between 2 and 6.
  echo.
  goto :ask_floatDecimal
)
set "args=!args! --floatDecimal !floatDecimal!"

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
echo Source Path:    !src_path!
if "!select_mode!"=="1" (
  echo Optimize mode:  3D Mech files only
  echo Float Decimals: !floatDecimal!
  echo Target Path:    \ACTORS\ITEMS    (3d mech)
  echo                 \ACTORS\MONSTERS (3d mech repack .azp)
) else if "!select_mode!"=="2" (
  echo Optimize mode:  Textures only
  echo Resize Percent: !resizePercent!%%
  echo Min Dimension:  !minResize!px
  echo Max Dimension:  !maxResize!px
  echo Target Paths:   \MEDIA  (textures)
  echo                 \BMP    (textures, no resize)
) else if "!select_mode!"=="3" (
  echo Optimize mode:  Both Textures and 3D Mech files
  echo Float Decimals: !floatDecimal!
  echo Resize Percent: !resizePercent!%%
  echo Min Dimension:  !minResize!px
  echo Max Dimension:  !maxResize!px
  echo Target Paths:   \MEDIA           (textures)
  echo                 \BMP             (textures, no resize)
  echo                 \ACTORS\ITEMS    (3d mech)
  echo                 \ACTORS\MONSTERS (3d mech, repack .azp)
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
node "%~dp0src/index.js" "!src_path!" !select_mode! !args!

echo.
echo ========================================
echo Processing complete!

pause

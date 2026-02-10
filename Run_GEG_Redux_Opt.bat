@echo off
setlocal enabledelayedexpansion

:: Prompt for src_path
:src_path
echo Enter path to "...\Mods\GEG Redux\Data":
set /p src_path="> "
if "!src_path!"=="" (
    cls
    goto :src_path
)

:: Clean path from quates and tailing \
set "src_path=!src_path:"=!"
if "!src_path:~-1!"=="\" set "src_path=!src_path:~0,-1!"

cls
:select_mode
echo Select what to optimize:
echo [1] 3D Mech files only
echo [2] Image files only
echo [3] Both 3D Mech and Image files
echo.
echo Or press Enter to default to: 3 (Both)
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

:: Prompt for floatPointDecimal
cls
set default_floatPointDecimal=3
:ask_floatPointDecimal
echo Enter number of decemals after float point (2~6)%%
echo Or press Enter to default to: %default_floatPointDecimal%

set /p floatPointDecimal="> "
if "!floatPointDecimal!"=="" set floatPointDecimal=%default_floatPointDecimal%
echo !floatPointDecimal!|findstr /r "^[2-6]$" >nul || (
  cls
  echo Invalid input. Must be between 2 and 6.
  echo.
  goto :ask_floatPointDecimal
)
set "args=!args! --floatPointDecimal !floatPointDecimal!"



if "!select_mode!"=="1" goto :run_script

:ask_images

:: Prompt for resizePercent
set default_resizePercent=60
cls
:ask_resizePercent
echo Enter resize percentage %% (1~99)
echo Or press Enter to default to: %default_resizePercent%
set /p resizePercent="> "
if "!resizePercent!"=="" set resizePercent=%default_resizePercent%
echo !resizePercent!|findstr /r "^[1-9][0-9]*$" >nul || (
  cls
  echo Invalid input. Must be between 1 and 99.
  echo.
  goto :ask_resizePercent
)
set "args=!args! --resizePercent !resizePercent!"

:: Prompt for minResize
set default_minResize=32
cls
echo Enter min resize dimension in pixels
echo Or press Enter to default to: %default_minResize%
set /p minResize="> "
if "!minResize!"=="" set minResize=%default_minResize%
set "args=!args! --minResize !minResize!"

:: Prompt for maxResize
set default_maxResize=512
cls
echo Enter max resize dimension in pixels
echo Or press Enter to default to: %default_maxResize%
set /p maxResize="> "
if "!maxResize!"=="" set maxResize=%default_maxResize%
set "args=!args! --maxResize !maxResize!"

:run_script

:: Run Node.js script with all arguments
node "%~dp0src/index.js" "!src_path!" !select_mode! !args!

pause

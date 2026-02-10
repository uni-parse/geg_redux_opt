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

:: Remove ALL quates
set "src_path=!src_path:"=!"

:: Remove tailing backslash \
if "!src_path:~-1!"=="\" set "src_path=!src_path:~0,-1!"

:: Prompt for resizePercent
set default_resizePercent=60
echo Enter resize percentage %%
echo Or press Enter to default to: %default_resizePercent%
set /p resizePercent="> "
if "!resizePercent!"=="" set resizePercent=%default_resizePercent%

:: Prompt for minResize
set default_minResize=32
echo Enter min resize dimension in pixels
echo Or press Enter to default to: %default_minResize%
set /p minResize="> "
if "!minResize!"=="" set minResize=%default_minResize%

:: Prompt for maxResize
set default_maxResize=512
echo Enter max resize dimension in pixels
echo Or press Enter to default to: %default_maxResize%
set /p maxResize="> "
if "!maxResize!"=="" set maxResize=%default_maxResize%

:: Run Node.js script with all arguments
node "%~dp0index.js" "%src_path%" "%resizePercent%" "%minResize%" "%maxResize%"

pause

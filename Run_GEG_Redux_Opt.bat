@echo off
set /p mod_path="Enter path to ...\Mods\GEG Redux\Data: "
node "%~dp0index.js" "%mod_path%"
pause
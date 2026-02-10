## Requirments:
  - install [node](https://nodejs.org/en/download/current) if you didn't yet:

## Usage:
  - clone the git repo (or download the code zip directly from github):
    ```bash
    git clone "https://github.com/uni-parse/geg_redux_opt"
    cd geg_redux_opt
  - adjust <b>resize.js</b> as you wish
  - double click on /Run_GEG_Redux_Opt.bat and follow instructins
  - wait (it took ~20min on ssd & cpu i5-2450m 2core/4thread)
  - backup will be generated (you can remove it if you want):
     ```bash
     /Mods/GEG Redux/Data/_backup/MEDIA
     /Mods/GEG Redux/Data/_backup/ACTORS/ITEMS
  - done

## Compress Textures process:
  - skip/copy small textures & unsupported files (as .vtf)
  - rename misFormated & fix corrupt .dds (magick required it)
  - resize/convert everything to .dds (by magick)
  - rename back to org filename (compatibility hack)
  - renamed "/RenderedItems" to "/RenderedItems_backup" (to generate fresh cache)

## Compress 3d Mesh process:
  - remove `//line_comments` and `/*multi_line_comments*/`
  - round float points ex:
    ```bash
    -1.000000 => -1
    1.234567 => 1.235
  - remove white-space as: spaces, tabs, new lines
  - remove unnecessary tailing ";"

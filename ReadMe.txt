# requirments:
  - install node js if you don't have it already:
    https://nodejs.org/en/download/current

# usage:
  - clone the git repo: git clone ""
  - adjust \uniparse\resize.js as you wish
  - open terminal on the extraction folder
  - enter the command:
    node index.js "path\to\Mods\GEG Redux\Data\"
  - wait (it took ~20min on ssd & cpu i5-2450m 2core/4thread)
  - backup will be generated (you can remove it if you want):
     \Mods\GEG Redux\Data\_backup\MEDIA
     \Mods\GEG Redux\Data\_backup\ACTORS\ITEMS
  - done

# compress Imgs process:
  - skip/copy small imgs & unsupported files (as .vtf)
  - rename misFormated & fix corrupt .dds (magick required it)
  - resize/convert everything to .dds (by magick)
  - rename back to org filename (compatibility hack)

# compress 3d Mesh process:
  - remove //line_commaets and /*multi_line_comments*/
  - round float points ex: -1.000000 => -1, 1.234567 => 1.235
  - remove white-space as: spaces, tabs, new lines
  - remove unnecessary tailing ";"
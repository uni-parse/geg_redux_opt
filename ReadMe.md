# GEG Redux Opt


## The Problems
  - Memory leak crash
    -The Engine run on **32-bit** => **limited** to **4GB RAM**, even with [4GB patch](https://ntcore.com/4gb-patch/)
    - The Engine have known **Memory Leaks** issue
    - The Mod added 6000+ unOptimized OverSized Textures (5.4gb)
    - Mix the above points and you will get **FREQUENT CRACHES**
  - Loading time
    - The Engine load assets in **Sync mode** => use only 1 core of cpu
    - No memory cache, reload assets Each time you go back to main menu
    - The Mod added 34000+ 3d Mech files 3d Mech text based (4.8gb unpacked)
    - Mix the above points and you will get **Slow Loading Time**

## The Solutions
  - Reduce Memory Leak
    - compress textures 5.5gb => ~450mb (based on your config)
    - convert all texture to the memory-friendly format .dds (dxt1/dxt5)
    - downScale overSized textures as 2k/4k (based on your config)
  - Reduce Loading time
    - opt 3d mech 4.8gb => ~3.2gb (based on your config)

## Requirments
  - install [node](https://nodejs.org/en/download/current) if you did not yet:

## Usage
  - [download](https://github.com/uni-parse/geg_redux_opt/archive/refs/heads/main.zip) the code zip, or clone the git repo:
    ```bash
    git clone "https://github.com/uni-parse/geg_redux_opt"
    cd geg_redux_opt
  - double click on `/Run_GEG_Redux_Opt.bat` and follow instructins
  - wait (depend on your hardware it may took 5~25min)
  - backup will be generated, (you can remove it at the end):
     ```bash
     /Mods/GEG Redux/Data/_backup/MEDIA
     /Mods/GEG Redux/Data/_backup/BMP
     /Mods/GEG Redux/Data/_backup/ACTORS/ITEMS
     /Mods/GEG Redux/Data/_backup/ACTORS/MONSTERS
  - Warning ⚠️: keep backup if you want to test different resize configs
  - optional: you can exclude some textures from resizing in `/geg_redux_opt/src/resize.js`

## Refresh Cache Tutorial
  - the script will automaticly rename old cache
    ```bash
    /Temp          => /Temp_backup_<timestamp>
    /RenderedItems => /RenderedItems_backup_<timestamp>
  - now let generate fresh cache (fellow below instractins)
  - load save
  - open console by the key `~`
  - enter the command `enter_dev_mode` and press Enter
  - enter the command `shop` and press Enter
  - wait (it will take 5~20min based on your hardware)
  - fresh cache will be generated `/Temp` & `/RenderedItems`
  - from now on, shops loading time will be fast

## Texture Processing Pipeline
  - target textures: .tga .dds .bmp .png .jpg
  - target directories: `/MEDIA`, `/BMP`
  - skip/copy unsupported textures as .vtf ...
  - rename misFormated textures (required by [magick.exe](https://imagemagick.org/))
  - repair corrupt .dds headers (required by [magick.exe](https://imagemagick.org/))
  - convert everything to .dds (compress dxt1/dxt5) (by [texconv.exe](https://github.com/microsoft/DirectXTex/wiki/Texconv) / [magick.exe](https://imagemagick.org/))
  - resize only `/MEDIA` textures (preserve the UI `/BMP` textures)
  - compatibility hack: rename back to org filename

## 3D Mesh Processing Pipeline
  - target files: .act .att .inf | .act.# .lod# .hi .descr
  - target directories: `/ACTORS/ITEMS`, `/ACTORS/MONSTERS`
  - unpack/repack .azp files in `/ACTORS/MONSTERS`
  - clear `// line comments` and `/* multi-line comments */`
  - round floating-point coordinates ex:
    ```bash
    -1.000000 => -1.0
     0.123456 =>  0.1235
  - clear white-space as: spaces, tabs, new lines
  - clear unnecessary tailing semicolons `;`

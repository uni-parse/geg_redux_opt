# GEG Redux Opt


## The Problems
  - Memory leak crash
    - The Engine run on **32-bit** => **limited** to **4GB RAM**, even with [4GB patch](https://ntcore.com/4gb-patch/)
    - The Engine have known **Memory Leaks** issue
    - The Mod added 6000+ unOptimized OverSized Textures (5.4gb)
    - Mix the above points and you will get **FREQUENT CRACHES**
  - Loading time
    - The Engine load assets in **Sync mode** => use only 1 core of cpu
    - No memory cache, reload assets Each time you go back to main menu
    - The Mod added 34000+ text based 3d Mesh files (4.8gb unpacked)
    - Mix the above points and you will get **Slow Loading Time**

## The Solutions
  - Reduce Memory Leak
    - compress textures 5.5gb => ~450mb (based on your config)
    - convert all texture to the memory-friendly format .dds (dxt1/dxt5)
    - downScale overSized textures as 2k/4k (based on your config)
  - Reduce Loading time
    - opt 3d mesh 4.8gb => ~3.2gb (based on your config)
    - convenrt to binary supported files as 0303txt
    - opt text of unsupported files as 0302txt

## Requirments
  - install [node](https://nodejs.org/en/download/current) if you did not yet:

## Usage
  - [download](https://github.com/uni-parse/geg_redux_opt/archive/refs/heads/main.zip) the code zip, or clone the git repo:
    ```bash
    git clone "https://github.com/uni-parse/geg_redux_opt"
    cd geg_redux_opt
  - double click on `/Run_GEG_Redux_Opt.bat` and follow instructins
  - wait (depend on your hardware it may took 5~25min)
  - backup will be generated `/_geg_redux_opt/_backup/` 
    - you can remove it at the end
    - ⚠️ but keep it if you want to test different resize configs
  - optional: you can exclude some textures from resizing in `/geg_redux_opt/src/resize.js`

## Refresh Cache Tutorial
  - the script will automaticly backup old cache
    ```bash
    /Temp          => /_geg_redux_opt/_cache/<date>/Temp
    /RenderedItems => /_geg_redux_opt/_cache/<date>/RenderedItems
  - now let generate fresh cache (fellow below instractins)
  - load save
  - open console by the key `~`
  - enter the command `enter_dev_mode` and press Enter
  - enter the command `shop` and press Enter
  - wait (it will take 5~20min based on your hardware)
  - fresh cache will be generated `/Temp` & `/RenderedItems`
  - from now on, shops loading time will be fast

## Texture Processing Pipeline
  - textures: .tga .dds .bmp .png .jpg .jpeg .webp
  - directories:
    - `/Mods/GEG Redux/Data/MEDIA`
    - `/Mods/GEG Redux/Data/BMP`          (no resize)
    - `/Mods/GEG Redux/Data/HARDLIFE/BMP`
  - skip/copy unsupported textures as .vtf ...
  - rename misFormated textures (required by magick.exe)
  - repair corrupt .dds headers (required by magick.exe)
  - convert everything to .dds (compress dxt1/dxt5) 
    - by [texconv.exe](https://github.com/microsoft/DirectXTex/wiki/Texconv) and fallback to [magick.exe](https://imagemagick.org/)
  - resize textures by percentage, and respect min/max Dimension
  - rename back to org filename (compatibility hack)

## 3D Mesh Processing Pipeline
  - mesh files: .x .mesh .act .actx .act.# .lod#
  - config files: .att .inf .hi .descr
  - target directories:
    - `/Mods/GEG Redux/Data/ACTORS/ITEMS`
    - `/Mods/GEG Redux/Data/ACTORS/MONSTERS` (repack azp)
    - `/Data/Actors/Monsters` (repack azp)
  - convert 0303txt mesh files to binary
    - by **MeshConvert.exe** utility from [DirectX sdk june 2010](https://archive.org/details/dxsdk_jun10)
  - opt text of configs and 0302txt mesh files
    - clear `// comments`
    - clear white-space as: spaces, tabs, new lines
    - clear unnecessary tailing semicolons `;`
    - round floating-point coordinates ex:
      ```bash
       1.000000 =>  1.0
      -0.123456 => -0.1235

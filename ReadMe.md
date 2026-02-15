# GEG Redux Opt


## The Problem
  - The Engine run on **32-bit** => **limited** to **4GB RAM**, even with [4GB patch](https://ntcore.com/4gb-patch/)
  - The Engine have known **Memory Leaks**
  - The Mod added 6000+ unOptimized OverSized Textures (5.4gb)
  - The Mod added 11000+ unOptimized 3d Mech text based (3.2gb)
  - Mix the above points and you will get **FREQUENT CRACHES**

## The Solution
  - optimize 3d mech 3.2gb => 1.8gb+ (based on your settings)
  - optimize textures 5.4gb => 300mb+ (based on your settings)
  - convert all texture to the memory friendly .dds (dxt1/dxt5)
  - downScale overSized textures as 2k/4k (based on your settings)
  - this way, we will reduce memory leak craches

## Requirments
  - install [node](https://nodejs.org/en/download/current) if you did not yet:

## Usage
  - [download](https://github.com/uni-parse/geg_redux_opt/archive/refs/heads/main.zip) the code zip, or clone the git repo:
    ```bash
    git clone "https://github.com/uni-parse/geg_redux_opt"
    cd geg_redux_opt
  - optional: if you do not want to resize a texture add it in `/geg_redux_opt/src/resize.js`
  - double click on `/Run_GEG_Redux_Opt.bat` and follow instructins
  - wait (depend on your hardware it may took 5~25min)
  - backup will be generated (you can remove it):
     ```bash
     /Mods/GEG Redux/Data/_backup/ACTORS/ITEMS
     /Mods/GEG Redux/Data/_backup/MEDIA
     /Mods/GEG Redux/Data/_backup/BMP
  
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
  - target files: .act .att .inf
  - target directories: `/ACTORS/ITEMS`
  - clear `// line comments` and `/* multi-line comments */`
  - round floating-point coordinates ex:
    ```bash
    -1.000000 => -1
     0.123456 =>  0.1235
  - clear white-space as: spaces, tabs, new lines
  - clear unnecessary tailing semicolons `;`

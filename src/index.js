const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const os = require('node:os')
const { compressImgs } = require('./compressImgs')
const { compressMech } = require('./compressMech')
const { unpackAZP, repackAZP } = require('./azp')
const {
  checkDir,
  moveDir,
  removeDir,
  parallelProccess,
  getAllFilePaths,
} = require('./utilities')

// set number of parallel processing
// by default it use full cpu cores to finish fast
// you can reduce it by 1 or so to let system do other things
// ex: "cores - 1" will free 1 core to do othe things
const cores = os.cpus().length
const CORES_LIMIT = cores // - 1

// set number of parallel Disk I/O read/write
// depend on if you have HDD/SSD/NVMe
const IO_LIMIT = 20 // default to SSD

// Only run if called directly from terminal
if (require.main === module) {
  const args = process.argv.slice(2)

  const basePath = args[0]
  const selectMode = parseInt(args[1])

  const options = {}
  for (const [i, arg] of args.slice(2).entries())
    if (arg.startsWith('--'))
      options[arg.slice(2)] = parseInt(args[i + 1 + 2])

  main(basePath, selectMode, options).catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}

async function main(basePath, selectMode, options) {
  const timerLabel = 'Total Time'
  console.time(timerLabel)

  const optMechOnly = selectMode === 1
  const optTexturesOnly = selectMode === 2
  const optAll = selectMode === 3

  try {
    if (!basePath || !(await checkDir(basePath))) {
      console.warn(
        `Invalid basePath "${basePath}"\n` +
          'it must be path to "...\\Mods\\GEG Redux\\Data"'
      )
      return
    }

    const baseTempDir = path.resolve(basePath, '_temp')
    const baseBackupDir = path.resolve(basePath, '_backup')

    // "/MEDIA"
    const mediaRelDir = 'MEDIA'
    const mediaSrc = path.resolve(basePath, mediaRelDir)
    const mediaTemp = path.resolve(baseTempDir, mediaRelDir)
    const mediaBackup = path.resolve(baseBackupDir, mediaRelDir)
    const isValidMediaSrc = await checkDir(mediaSrc)
    const isValidMediaBackup = await checkDir(mediaBackup)
    const canOptMedia = isValidMediaSrc || isValidMediaBackup

    // "/BMP"
    const bmpRelDir = 'BMP'
    const bmpSrc = path.resolve(basePath, bmpRelDir)
    const bmpTemp = path.resolve(baseTempDir, bmpRelDir)
    const bmpBackup = path.resolve(baseBackupDir, bmpRelDir)
    const isValidBmpSrc = await checkDir(bmpSrc)
    const isValidBmpBackup = await checkDir(bmpBackup)
    const canOptBmp = isValidBmpSrc || isValidBmpBackup

    // "/ACTORS/ITEMS"
    const mechRelDir = 'ACTORS/ITEMS'
    const mechSrc = path.resolve(basePath, mechRelDir)
    const mechTemp = path.resolve(baseTempDir, mechRelDir)
    const mechBackup = path.resolve(baseBackupDir, mechRelDir)
    const isValidMechSrc = await checkDir(mechSrc)
    const isValidMechBackup = await checkDir(mechBackup)
    const canOptMech = isValidMechSrc || isValidMechBackup

    // "/ACTORS/MONSTERS"
    const azpRelDir = 'ACTORS/MONSTERS'
    const azpMechSrc = path.resolve(basePath, azpRelDir)
    const azpMechTemp = path.resolve(baseTempDir, azpRelDir)
    const azpMechBackup = path.resolve(baseBackupDir, azpRelDir)
    const isValidAzpMechSrc = await checkDir(azpMechSrc)
    const isValidAzpMechBackup = await checkDir(azpMechBackup)
    const canOptAzpMech =
      isValidAzpMechSrc || isValidAzpMechBackup

    // check directories --------------------------------------
    if (optMechOnly && !canOptMech && !canOptAzpMech) {
      console.warn(
        `invalid basePath "${basePath}"\n` +
          `missing sub directories:\n` +
          `  "\\ACTORS\\ITEMS"\n` +
          `  "\\ACTORS\\MONSTERS"`
      )

      return
    }

    if (optTexturesOnly && !canOptMedia && !canOptBmp) {
      console.warn(
        `invalid basePath "${basePath}"\n` +
          `missing sub directories:\n` +
          `  "\\MEDIA"\n` +
          `  "\\BMP"`
      )

      return
    }

    if (
      optAll &&
      !canOptMedia &&
      !canOptBmp &&
      !canOptMech &&
      !canOptAzpMech
    ) {
      console.warn(
        `invalid basePath "${basePath}"\n` +
          `missing sub directories:\n` +
          `  "\\MEDIA"\n` +
          `  "\\BMP"\n` +
          `  "\\ACTORS\\ITEMS"\n` +
          `  "\\ACTORS\\MONSTERS"`
      )

      return
    }

    // create backup ------------------------------------------
    if (!optTexturesOnly) {
      if (isValidMechSrc && !isValidMechBackup)
        await moveDir(mechSrc, mechBackup)

      if (isValidAzpMechSrc && !isValidAzpMechBackup)
        await moveDir(azpMechSrc, azpMechBackup)
    }

    if (!optMechOnly) {
      if (isValidMediaSrc && !isValidMediaBackup)
        await moveDir(mediaSrc, mediaBackup)

      if (isValidBmpSrc && !isValidBmpBackup)
        await moveDir(bmpSrc, bmpBackup)
    }

    // clear old "/_temp" if exist ----------------------------
    if (await checkDir(baseTempDir))
      await removeDir(baseTempDir)

    // opt mech -----------------------------------------------
    if (!optTexturesOnly) {
      if (canOptMech)
        await compressMech(
          CORES_LIMIT,
          IO_LIMIT,
          mechBackup,
          mechTemp,
          options.floatDecimal
        )

      if (canOptAzpMech) {
        const baseUnpackDir = path.join(azpMechTemp, '_unpack')
        const baseUnpackOptDir = path.join(
          azpMechTemp,
          '_unpack_opt'
        )

        // unpack
        const azpPaths = await getAllFilePaths(azpMechBackup)
        const unpackDirs = await parallelProccess(
          'unpack mech .azp files',
          azpPaths,
          CORES_LIMIT,
          async azpPath => {
            const ext = path.extname(azpPath)
            const basename = path.basename(azpPath, ext)
            const unpackDir = path.join(baseUnpackDir, basename)

            await unpackAZP(azpPath, unpackDir)
            return unpackDir
          }
        )

        // opt unpacked mech files
        await compressMech(
          CORES_LIMIT,
          IO_LIMIT,
          baseUnpackDir,
          baseUnpackOptDir,
          options.floatDecimal
        )

        // const allUnpackPaths = await getAllFilePaths(
        //   baseUnpackDir
        // )
        // const actPaths = []
        // const descrPaths = []
        // const hiPaths = []
        // const otherPaths = []
        // for (const unpackPath of allUnpackPaths) {
        //   const filename = path
        //     .basename(unpackPath)
        //     .toLowerCase()

        //   if (filename.endsWith('.descr'))
        //     descrPaths.push(unpackPath)
        //   else if (filename.endsWith('.hi'))
        //     hiPaths.push(unpackPath)
        //   else if (
        //     filename.endsWith('.act') ||
        //     /\.act\.\d+$/.test(filename) || // endsWith .ACT.#
        //     /\.lod\d+$/.test(filename) // endsWith .LOD#
        //   )
        //     actPaths.push(unpackPath)
        //   else otherPaths.push(unpackPath)
        // }

        // // copy other files
        // const result = await parallelProccess(
        //   'copy other files',
        //   otherPaths,
        //   IO_LIMIT,
        //   async p => {
        //     const outPath = p.replace(
        //       baseUnpackDir,
        //       baseUnpackOptDir
        //     )
        //     await copyFile(p, outPath)
        //   }
        // )

        // // opt .ACT .ACT# .LOD# | .HI .DESCR files
        // const results = await parallelProccess(
        //   'opt unpacked azp mech files: .ACT .ACT# .LOD# | .HI .DESCR',
        //   [...actPaths, ...hiPaths, ...descrPaths],
        //   IO_LIMIT,
        //   async p => {
        //     const outPath = p.replace(
        //       baseUnpackDir,
        //       baseUnpackOptDir
        //     )

        //     const content = await fs.readFile(p, 'utf8')
        //     const optContent = actPaths.includes(p)
        //       ? opt_Act_Content(content, floatDecimal)
        //       : opt_HI_DESCR_content(content)

        //     // Create output directory if needed
        //     const dir = path.dirname(outPath)
        //     await fs.mkdir(dir, { recursive: true })

        //     await fs.writeFile(outPath, optContent, 'utf8')

        //     const filename = path.basename(p)
        //     const orgSize = content.length
        //     const optSize = optContent.length
        //     const savedSize = orgSize - optSize
        //     const savedPercent = (
        //       (savedSize * 100) /
        //       orgSize
        //     ).toFixed(2)

        //     // console.log(
        //     //   `${filename}: ${sizeToStr(orgSize)} → ${sizeToStr(
        //     //     optSize
        //     //   )} ` +
        //     //     `(Saved ${savedPercent}% ${sizeToStr(savedSize)})`
        //     // )

        //     return {
        //       filename,
        //       orgSize,
        //       optSize,
        //       savedSize,
        //       savedPercent,
        //     }
        //   }
        // )

        // // opt .ACT .ACT# .LOD# files
        // const act_results = await parallelProccess(
        //   'opt .ACT .ACT# .LOD# files',
        //   actPaths,
        //   IO_LIMIT,
        //   async p => {
        //     const outPath = p.replace(
        //       baseUnpackDir,
        //       baseUnpackOptDir
        //     )

        //     const content = await fs.readFile(p, 'utf8')
        //     const optContent = opt_Act_Content(
        //       content,
        //       options.floatDecimal
        //     )

        //     // Create output directory if needed
        //     const dir = path.dirname(outPath)
        //     await fs.mkdir(dir, { recursive: true })

        //     await fs.writeFile(outPath, optContent, 'utf8')

        //     const filename = path.basename(p)
        //     const orgSize = content.length
        //     const optSize = optContent.length
        //     const savedSize = orgSize - optSize
        //     const savedPercent = (
        //       (savedSize * 100) /
        //       orgSize
        //     ).toFixed(2)

        //     // console.log(
        //     //   `${filename}: ${sizeToStr(orgSize)} → ${sizeToStr(
        //     //     optSize
        //     //   )} ` +
        //     //     `(Saved ${savedPercent}% ${sizeToStr(savedSize)})`
        //     // )

        //     return {
        //       filename,
        //       orgSize,
        //       optSize,
        //       savedSize,
        //       savedPercent,
        //     }
        //   }
        // )

        // repack
        const unpackOptDirs = unpackDirs.map(unpackDir =>
          unpackDir.replace(baseUnpackDir, baseUnpackOptDir)
        )
        await parallelProccess(
          'repack mech .azp files',
          unpackOptDirs,
          CORES_LIMIT,
          async unpackOptDir => {
            const basename = path.basename(unpackOptDir)
            const azpPath = path.join(
              azpMechTemp,
              basename + '.azp'
            )

            await repackAZP(unpackOptDir, azpPath)

            return azpPath
          }
        )

        // remove unpacked files
        await removeDir(baseUnpackDir)
        await removeDir(baseUnpackOptDir)
      }
    }

    // opt textures -------------------------------------------
    if (!optMechOnly) {
      if (canOptBmp)
        await compressImgs(
          CORES_LIMIT,
          IO_LIMIT,
          bmpBackup,
          bmpTemp,
          // do not resize, it have aprolute ui/sprite textures
          100, //options.resizePercent,
          99999, //options.minResize,
          99999 //options.maxResize
        )

      if (canOptMedia)
        await compressImgs(
          CORES_LIMIT,
          IO_LIMIT,
          mediaBackup,
          mediaTemp,
          options.resizePercent,
          options.minResize,
          options.maxResize
        )
    }

    // save ---------------------------------------------------
    if (!optTexturesOnly) {
      if (canOptMech) await moveDir(mechTemp, mechSrc)
      if (canOptAzpMech) await moveDir(azpMechTemp, azpMechSrc)
    }

    if (!optMechOnly) {
      if (canOptMedia) await moveDir(mediaTemp, mediaSrc)
      if (canOptBmp) await moveDir(bmpTemp, bmpSrc)
    }

    // clear "/_temp" -----------------------------------------
    if (await checkDir(baseTempDir))
      await removeDir(baseTempDir)

    // rename old caches "/Temp" "/RenderedItems" -------------
    const timestamp = Date.now()
    const tempCachePath = path.resolve(
      basePath,
      '..',
      '..',
      '..',
      'Temp'
    )
    if (await checkDir(tempCachePath)) {
      const outPath = `${tempCachePath}_backup_${timestamp}`
      await fs.rename(tempCachePath, outPath)

      console.log(
        `Renamed old cache "\\Temp" => "\\Temp_backup_${timestamp}"\n` +
          ` "${outPath}"\n`
      )
    }

    const renderedItemsCachePath = path.resolve(
      basePath,
      '..',
      '..',
      '..',
      'RenderedItems'
    )
    if (await checkDir(renderedItemsCachePath)) {
      const outPath = `${renderedItemsCachePath}_backup_${timestamp}`
      await fs.rename(renderedItemsCachePath, outPath)

      console.log(
        `Renamed old cache "\\RenderedItems" => "\\RenderedItems_backup_${timestamp}"\n` +
          ` "${outPath}"`
      )
    }
  } catch (error) {
    console.error('❌ Fatal error in main:', error)
  } finally {
    console.timeEnd(timerLabel)
  }
}

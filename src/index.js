const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const os = require('node:os')
const { compressImgs } = require('./compressImgs')
const { compressMesh } = require('./compressMesh')
const { unpackAZP, repackAZP } = require('./tools')
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

  const {
    resizePercent,
    minResizeDimension,
    maxResizeDimension,
    maxMeshFloatDecimals,
  } = options

  const optMeshOnly = selectMode === 1
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
    const meshRelDir = 'ACTORS/ITEMS'
    const meshSrc = path.resolve(basePath, meshRelDir)
    const meshTemp = path.resolve(baseTempDir, meshRelDir)
    const meshBackup = path.resolve(baseBackupDir, meshRelDir)
    const isValidMeshSrc = await checkDir(meshSrc)
    const isValidMeshBackup = await checkDir(meshBackup)
    const canOptMesh = isValidMeshSrc || isValidMeshBackup

    // "/ACTORS/MONSTERS"
    const azpRelDir = 'ACTORS/MONSTERS'
    const azpMeshSrc = path.resolve(basePath, azpRelDir)
    const azpMeshTemp = path.resolve(baseTempDir, azpRelDir)
    const azpMeshBackup = path.resolve(baseBackupDir, azpRelDir)
    const isValidAzpMeshSrc = await checkDir(azpMeshSrc)
    const isValidAzpMeshBackup = await checkDir(azpMeshBackup)
    const canOptAzpMesh =
      isValidAzpMeshSrc || isValidAzpMeshBackup

    // check missing directories ------------------------------
    if (optMeshOnly && !canOptMesh && !canOptAzpMesh) {
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
      !canOptMesh &&
      !canOptAzpMesh
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
      if (isValidMeshSrc && !isValidMeshBackup)
        await moveDir(meshSrc, meshBackup)

      if (isValidAzpMeshSrc && !isValidAzpMeshBackup)
        await moveDir(azpMeshSrc, azpMeshBackup)
    }

    if (!optMeshOnly) {
      if (isValidMediaSrc && !isValidMediaBackup)
        await moveDir(mediaSrc, mediaBackup)

      if (isValidBmpSrc && !isValidBmpBackup)
        await moveDir(bmpSrc, bmpBackup)
    }

    // clear old "/_temp" if exist ----------------------------
    if (await checkDir(baseTempDir))
      await removeDir(baseTempDir)

    // opt mesh -----------------------------------------------
    if (!optTexturesOnly) {
      if (canOptMesh)
        await compressMesh(
          CORES_LIMIT,
          IO_LIMIT,
          meshBackup,
          meshTemp,
          maxMeshFloatDecimals
        )

      if (canOptAzpMesh) {
        const baseUnpackDir = path.join(azpMeshTemp, '_unpack')
        const baseUnpackOptDir = path.join(
          azpMeshTemp,
          '_unpack_opt'
        )

        // unpack
        const azpPaths = await getAllFilePaths(azpMeshBackup)
        const unpackDirs = await parallelProccess(
          'unpack mesh .azp files',
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

        // opt unpacked mesh files
        await compressMesh(
          CORES_LIMIT,
          IO_LIMIT,
          baseUnpackDir,
          baseUnpackOptDir,
          maxMeshFloatDecimals
        )

        // repack
        const unpackOptDirs = unpackDirs.map(unpackDir =>
          unpackDir.replace(baseUnpackDir, baseUnpackOptDir)
        )
        await parallelProccess(
          'repack mesh .azp files',
          unpackOptDirs,
          CORES_LIMIT,
          async unpackOptDir => {
            const basename = path.basename(unpackOptDir)
            const azpPath = path.join(
              azpMeshTemp,
              `${basename}.azp`
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
    if (!optMeshOnly) {
      if (canOptBmp)
        await compressImgs(
          CORES_LIMIT,
          IO_LIMIT,
          bmpBackup,
          bmpTemp,
          // do not resize, it have aprolute ui/sprite textures
          100, // resizePercent,
          99999, // minResizeDimension,
          99999 // maxResizeDimension
        )

      if (canOptMedia)
        await compressImgs(
          CORES_LIMIT,
          IO_LIMIT,
          mediaBackup,
          mediaTemp,
          resizePercent,
          minResizeDimension,
          maxResizeDimension
        )
    }

    // save ---------------------------------------------------
    if (!optTexturesOnly) {
      if (canOptMesh) await moveDir(meshTemp, meshSrc)
      if (canOptAzpMesh) await moveDir(azpMeshTemp, azpMeshSrc)
    }

    if (!optMeshOnly) {
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

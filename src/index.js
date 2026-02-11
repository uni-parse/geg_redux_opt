const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const os = require('node:os')
const { compressImgs } = require('./compressImgs')
const { compressMech } = require('./compressMech')
const { checkDir, moveDir, removeDir } = require('./utilities')

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

    // "/MEDIA"
    const mediaSrc = path.resolve(basePath, 'MEDIA')
    const mediaTemp = path.resolve(basePath, '_temp', 'MEDIA')
    const mediaBackup = path.resolve(
      basePath,
      '_backup',
      'MEDIA'
    )
    const isValidMediaSrc = await checkDir(mediaSrc)
    const isValidMediaBackup = await checkDir(mediaBackup)
    const canOptMedia = isValidMediaSrc || isValidMediaBackup

    // "/BMP"
    const bmpSrc = path.resolve(basePath, 'BMP')
    const bmpTemp = path.resolve(basePath, '_temp', 'BMP')
    const bmpBackup = path.resolve(basePath, '_backup', 'BMP')
    const isValidBmpSrc = await checkDir(bmpSrc)
    const isValidBmpBackup = await checkDir(bmpBackup)
    const canOptBmp = isValidBmpSrc || isValidBmpBackup

    // "/ACTORS/ITEMS"
    const mechSrc = path.resolve(basePath, 'ACTORS', 'ITEMS')
    const mechTemp = path.resolve(
      basePath,
      '_temp',
      'ACTORS',
      'ITEMS'
    )
    const mechBackup = path.resolve(
      basePath,
      '_backup',
      'ACTORS',
      'ITEMS'
    )
    const isValidMechSrc = await checkDir(mechSrc)
    const isValidMechBackup = await checkDir(mechBackup)
    const canOptMech = isValidMechSrc || isValidMechBackup

    if (optMechOnly && !canOptMech) {
      console.warn(
        `invalid basePath "${basePath}"\n` +
          'missing sub directory "\\ACTORS\\ITEMS"'
      )

      return
    }

    if (optTexturesOnly && !canOptMedia && !canOptBmp) {
      console.warn(
        `invalid basePath "${basePath}"\n` +
          'missing sub directory "\\MEDIA" or "\\BMP"'
      )

      return
    }

    if (optAll && !canOptMedia && !canOptBmp && !canOptMech) {
      console.warn(
        `invalid basePath "${basePath}"\n` +
          `missing sub directory "\\MEDIA" or "\\BMP" or "\\ACTORS\\ITEMS"`
      )

      return
    }

    // ---------------------------------------
    if (canOptMech && !optTexturesOnly) {
      if (!isValidMechBackup) await moveDir(mechSrc, mechBackup)
      if (await checkDir(mechTemp)) await removeDir(mechTemp)

      await compressMech(
        CORES_LIMIT,
        IO_LIMIT,
        mechBackup,
        mechTemp,
        options.floatDecimal
      )

      if (await checkDir(mechTemp)) {
        await moveDir(mechTemp, mechSrc)
        await removeDir(mechTemp)
      }
    }

    // ---------------------------------------
    if (canOptBmp || !optMechOnly) {
      if (!isValidBmpBackup) await moveDir(bmpSrc, bmpBackup)
      if (await checkDir(bmpTemp)) await removeDir(bmpTemp)

      await compressImgs(
        CORES_LIMIT,
        IO_LIMIT,
        bmpBackup,
        bmpTemp,
        // do not resize, it have apsolute sperit textures
        100, //options.resizePercent,
        99999, //options.minResize,
        99999 //options.maxResize
      )

      if (await checkDir(bmpTemp)) {
        await moveDir(bmpTemp, bmpSrc)
        await removeDir(bmpTemp)
      }
    }

    if (canOptMedia || !optMechOnly) {
      if (!isValidMediaBackup)
        await moveDir(mediaSrc, mediaBackup)
      if (await checkDir(mediaTemp)) await removeDir(mediaTemp)

      await compressImgs(
        CORES_LIMIT,
        IO_LIMIT,
        mediaBackup,
        mediaTemp,
        options.resizePercent,
        options.minResize,
        options.maxResize
      )

      if (await checkDir(mediaTemp)) {
        await moveDir(mediaTemp, mediaSrc)
        await removeDir(mediaTemp)
      }
    }

    // ----------------------------------------
    const tempPath = path.resolve(basePath, '_temp')
    if (await checkDir(tempPath)) await removeDir(tempPath)

    // ----------------------------------------
    const renderedItemsPath = path.resolve(
      basePath,
      '..',
      '..',
      '..',
      'RenderedItems'
    )
    if (await checkDir(renderedItemsPath)) {
      const backup = `${renderedItemsPath}_backup_${Date.now()}`
      await fs.rename(renderedItemsPath, backup)

      console.log(
        `\nRenamed "\\RenderedItems" to "\\${backup}"\n`
      )
    }
  } catch (error) {
    console.error('❌ Fatal error in main:', error)
  } finally {
    console.timeEnd(timerLabel)
  }
}

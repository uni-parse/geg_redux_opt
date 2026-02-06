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

  main(...args).catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}

async function main(basePath) {
  const timerLabel = 'Total Time'
  console.time(timerLabel)

  try {
    if (!basePath || !(await checkDir(basePath))) {
      console.warn(
        'Invalid basePath\n' +
          'Usage: node index.js "path\\to\\Mods\\GEG Redux\\Data"'
      )
      return
    }

    const mediaSrc = path.resolve(basePath, 'MEDIA')
    const actSrc = path.resolve(basePath, 'ACTORS', 'ITEMS')

    const mediaTemp = path.resolve(basePath, '_temp', 'MEDIA')
    const actTemp = path.resolve(
      basePath,
      '_temp',
      'ACTORS',
      'ITEMS'
    )

    const mediaBackup = path.resolve(
      basePath,
      '_backup',
      'MEDIA'
    )
    const actBackup = path.resolve(
      basePath,
      '_backup',
      'ACTORS',
      'ITEMS'
    )

    const isValidMediaSrc = await checkDir(mediaSrc)
    const isValidActSrc = await checkDir(actSrc)
    let isValidMediaBackup = await checkDir(mediaBackup)
    let isValidActBackup = await checkDir(actBackup)

    if (
      !isValidMediaSrc &&
      !isValidActSrc &&
      !isValidMediaBackup &&
      !isValidActBackup
    ) {
      console.warn(
        `invalid basePath "${basePath}" \n` +
          `the basePath should contain the sub paths ".\\MEDIA\\" and ".\\ACTORS\\ITEMS\\" \n` +
          'Usage: node index.js "path\\to\\Mods\\GEG Redux\\Data"'
      )

      return
    }

    // ---------------------------------------
    if (isValidActSrc || isValidActBackup) {
      if (!isValidActBackup) await moveDir(actSrc, actBackup)
      if (await checkDir(actTemp)) await removeDir(actTemp)

      await compressMech(
        actBackup,
        actTemp,
        CORES_LIMIT,
        IO_LIMIT
      )

      if (await checkDir(actTemp)) {
        await moveDir(actTemp, actSrc)
        await removeDir(actTemp)
      }
    }

    // ---------------------------------------
    if (isValidMediaSrc || isValidMediaBackup) {
      if (!isValidMediaBackup)
        await moveDir(mediaSrc, mediaBackup)
      if (await checkDir(mediaTemp)) await removeDir(mediaTemp)

      await compressImgs(
        mediaBackup,
        mediaTemp,
        CORES_LIMIT,
        IO_LIMIT
      )

      if (await checkDir(mediaTemp)) {
        await moveDir(mediaTemp, mediaSrc)
        await removeDir(mediaTemp)
      }
    }
  } catch (error) {
    console.error('❌ Fatal error in main:', error)
  } finally {
    console.timeEnd(timerLabel)
  }
}

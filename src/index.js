const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const os = require('node:os')
const { compressImgs } = require('./compressImgs')
const { compressMesh } = require('./compressMesh')
const { unpackAZP, repackAZP } = require('./tools')
const {
  checkDir,
  copyFile,
  moveDir,
  removeDir,
  parallelProccess,
  getAllFilePaths,
  getLocalIsoString,
  sizeToStr,
} = require('./utilities')

// set number of parallel processing
// by default it use full cpu cores to finish fast
// you can reduce it by 1 or so to let system do other things
// ex: "cores - 1" will free 1 core to do othe things
const cores = os.cpus().length
const coresLimit = cores - 2
const CORES_LIMIT = Math.max(1, coresLimit)

// set number of parallel Disk I/O read/write
// depend on if you have HDD/SSD/NVMe
const IO_LIMIT = 20 // default to SSD

// Only run if called directly from terminal
if (require.main === module) {
  const { argv } = process
  const baseDirInput = argv[2]?.trim()
  const optionArgs = argv.slice(3)
  const options = {}
  for (const [i, optionArg] of optionArgs.entries()) {
    if (!optionArg.startsWith('--')) continue

    const name = optionArg.slice(2) // remove prefix "--"

    // extract value
    const nextIndex = i + 1
    let value = optionArgs[nextIndex]

    // normalize value
    value = name.startsWith('can')
      ? value === 'true'
      : parseInt(value)

    options[name] = value
  }

  main(baseDirInput, options).catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}

async function main(baseDirInput, options = {}) {
  const timerLabel = 'Total Time'
  console.time(timerLabel)

  const {
    canMigrate,
    canOptMesh,
    canOptTextures,
    canBackupCache,
    resizePercent,
    minResizeDimension,
    maxResizeDimension,
    maxMeshFloatDecimals,
  } = options

  try {
    const baseDir = await validateBaseDir(baseDirInput)

    // console.log('baseDir =', baseDir)
    // console.log('options =', JSON.stringify(options, null, 2))

    const gegRedux0ptDir = path.resolve(
      baseDir,
      '_geg_redux_opt'
    )
    const baseBackupDir = path.join(gegRedux0ptDir, '_backup')
    const baseTempDir = path.join(gegRedux0ptDir, '_temp')
    const baseCacheDir = path.join(gegRedux0ptDir, '_cache')

    // migrate v1 to v2 ---------------------------------------
    if (canMigrate)
      await migrate(baseDir, baseBackupDir, baseCacheDir)

    const opt = async (relDir, callback, isAzp = false) => {
      const srcDir = path.resolve(baseDir, relDir)
      const tempDir = path.resolve(baseTempDir, relDir)
      const backupDir = path.resolve(baseBackupDir, relDir)
      const isValidSrcDir = await checkDir(srcDir)
      const isValidBackupDir = await checkDir(backupDir)

      if (!isValidSrcDir && !isValidBackupDir) return

      // create backup
      if (!isValidBackupDir) await moveDir(srcDir, backupDir)

      // clear old temp (if exist)
      await removeDir(tempDir)

      // opt callback
      const result = isAzp
        ? await patchAzp(backupDir, tempDir, callback)
        : await callback(backupDir, tempDir)

      // save
      await moveDir(tempDir, srcDir)

      // clear new temp
      await removeDir(tempDir)

      return result
    }

    const meshResults = []
    const textureResults = []

    // opt textures -------------------------------------------
    if (canOptTextures) {
      // Mods/GEG Redux/Data/BMP
      const result1 = await opt(
        'Mods/GEG Redux/Data/BMP',
        (srcDir, outDir) =>
          compressImgs(
            CORES_LIMIT,
            IO_LIMIT,
            srcDir,
            outDir,
            // do not resize, it have aprolute ui/sprite textures
            100, // resizePercent,
            99999, // minResizeDimension,
            99999 // maxResizeDimension
          )
      )

      // Mods/GEG Redux/Data/HARDLIFE/BMP
      const result2 = await opt(
        'Mods/GEG Redux/Data/HARDLIFE/BMP',
        (srcDir, outDir) =>
          compressImgs(
            CORES_LIMIT,
            IO_LIMIT,
            srcDir,
            outDir,
            resizePercent,
            minResizeDimension,
            maxResizeDimension
          )
      )

      // Mods/GEG Redux/Data/MEDIA
      const result3 = await opt(
        'Mods/GEG Redux/Data/MEDIA',
        (srcDir, outDir) =>
          compressImgs(
            CORES_LIMIT,
            IO_LIMIT,
            srcDir,
            outDir,
            resizePercent,
            minResizeDimension,
            maxResizeDimension
          )
      )

      textureResults.push(result1, result2, result3)
    }

    // opt 3d mesh --------------------------------------------
    if (canOptMesh) {
      // Mods/GEG Redux/Data/ACTORS/ITEMS
      const result1 = await opt(
        'Mods/GEG Redux/Data/ACTORS/ITEMS',
        (srcDir, outDir) =>
          compressMesh(
            CORES_LIMIT,
            IO_LIMIT,
            srcDir,
            outDir,
            maxMeshFloatDecimals
          )
      )

      // Mods/GEG Redux/Data/ACTORS/MONSTERS
      const result2 = await opt(
        'Mods/GEG Redux/Data/ACTORS/MONSTERS',
        async (srcDir, outDir) =>
          compressMesh(
            CORES_LIMIT,
            IO_LIMIT,
            srcDir,
            outDir,
            maxMeshFloatDecimals
          ),
        true
      )

      meshResults.push(result1, result2)
    }

    // clear temp dir -----------------------------------------
    await removeDir(baseTempDir)

    // backup old cache ---------------------------------------
    if (canBackupCache) {
      const cacheNames = ['RenderedItems', 'Temp']
      await backupCache(baseDir, baseCacheDir, cacheNames)
    }

    // show summary -------------------------------------------
    console.log(`\n${'═'.repeat(60)}`)
    if (canOptTextures)
      showSummary(
        'Final Textures Optimization Summary',
        textureResults
      )
    if (canOptMesh)
      showSummary(
        'Final 3d Mesh Optimization Summary',
        meshResults
      )
    console.log('═'.repeat(60))
  } catch (error) {
    console.error('❌ Fatal error in main:', error)
  } finally {
    console.timeEnd(timerLabel)
  }
}

async function validateBaseDir(baseDirInput) {
  let isValidDir =
    typeof baseDirInput === 'string' && baseDirInput !== ''

  if (isValidDir) isValidDir = await checkDir(baseDirInput)

  // always return Directory
  let baseDir = baseDirInput
  if (isValidDir) {
    const stat = await fs.stat(baseDirInput)
    if (!stat.isDirectory()) baseDir = path.dirname(baseDir)
  }

  // check HLA.exe
  if (isValidDir) {
    const hlaExePath = path.resolve(baseDir, 'HLA.exe')
    isValidDir = await checkDir(hlaExePath)
  }

  if (!isValidDir)
    throw new Error(
      `Invalid directory "${baseDirInput}"\n` +
        'it must be path to HLA.exe'
    )

  return baseDir
}

async function patchAzp(srcDir, outDir, callback) {
  const baseUnpackDir = path.join(outDir, '_unpack')
  const baseUnpackOptDir = path.join(outDir, '_unpack_opt')

  const allPaths = await getAllFilePaths(srcDir)
  const azpPaths = []
  const otherPaths = []
  for (const p of allPaths) {
    const ext = path.extname(p)
    if (ext.toLowerCase() === '.azp') azpPaths.push(p)
    else otherPaths.push(p)
  }

  // copy other files
  await parallelProccess(
    'copy other files',
    otherPaths,
    IO_LIMIT,
    async p => {
      const relPath = path.relative(srcDir, p)
      const outPath = path.join(outDir, relPath)
      await copyFile(p, outPath)
      return outPath
    }
  )

  // unpack azp files
  const unpackDirArr = await parallelProccess(
    'unpack .azp files',
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

  // opt callback
  const result = await callback(baseUnpackDir, baseUnpackOptDir)

  const unpackOptDirs = unpackDirArr.map(p => {
    const relPath = path.relative(baseUnpackDir, p)
    const output = path.join(baseUnpackOptDir, relPath)
    return output
  })

  // repack azp files
  await parallelProccess(
    'repack .azp files',
    unpackOptDirs,
    CORES_LIMIT,
    async unpackOptDir => {
      const basename = path.basename(unpackOptDir)
      const azpPath = path.join(outDir, `${basename}.azp`)

      await repackAZP(unpackOptDir, azpPath)
      return azpPath
    }
  )

  // remove unpacked files
  await removeDir(baseUnpackDir)
  await removeDir(baseUnpackOptDir)

  return result
}

async function migrate(baseDir, baseBackupDir, baseCacheDir) {
  console.log(`>>> migrating from v1 to v2 ${'='.repeat(32)}`)

  // move old backup to new Dir
  const oldBackupDir = path.resolve(
    baseDir,
    'Mods',
    'GEG Redux',
    'Data',
    '_backup'
  )
  if (await checkDir(oldBackupDir)) {
    const entries = await fs.readdir(oldBackupDir, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      const oldPath = path.join(oldBackupDir, entry.name)
      const newPath = path.join(
        baseBackupDir,
        'Mods',
        'GEG Redux',
        'Data',
        entry.name
      )

      if (entry.isDirectory()) await moveDir(oldPath, newPath)
      else {
        // Create output directory if needed
        const parentDir = path.dirname(newPath)
        await fs.mkdir(parentDir, { recursive: true })

        await fs.rename(oldPath, newPath)
      }
    }

    await removeDir(oldBackupDir)

    const oldBackupRelDir = path.relative(baseDir, oldBackupDir)
    const backupRelDir = path.relative(baseDir, baseBackupDir)
    console.log(
      `moved v1 _backup dir "${oldBackupRelDir}"\n` +
        `=> "${backupRelDir}"`
    )
  }

  // clear old temp dir (if exist)
  const oldTempDir = path.resolve(
    baseDir,
    'Mods',
    'GEG Redux',
    'Data',
    '_temp'
  )
  if (await checkDir(oldTempDir)) {
    await removeDir(oldTempDir)

    const oldTempRelDir = path.relative(baseDir, oldTempDir)
    console.log(`\nremoved v1 temp dir "${oldTempRelDir}"`)
  }

  // move old cache to new directory
  const entries = await fs.readdir(baseDir, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // validate old cache
    //  "/Temp_backup_<timestamp>"
    //  "/RenderedItems_backup_<timestamp>"
    const match = entry.name.match(
      /^(Temp|RenderedItems)_backup_(\d+)$/
    )
    if (!match) continue

    const chacheName = match[1] // "Temp" or "RenderedItems"
    const timestamp = parseInt(match[2])
    const dateDirName = getDateDirName(timestamp)

    const oldDir = path.join(baseDir, entry.name)
    const newDir = path.join(
      baseCacheDir,
      dateDirName,
      chacheName
    )

    await moveDir(oldDir, newDir)

    const oldRelDir = path.relative(baseDir, oldDir)
    const newRelDir = path.relative(baseDir, newDir)
    console.log(
      `\nmoved v1 cache "${oldRelDir}"\n` + `=> "${newRelDir}"`
    )
  }

  console.log(`=== End ${'='.repeat(52)}`)
}

async function backupCache(baseDir, baseCacheDir, cacheNames) {
  const dateDirName = getDateDirName()

  for (const cacheName of cacheNames) {
    const cacheDir = path.resolve(baseDir, cacheName)

    if (!(await checkDir(cacheDir))) continue

    const backupPath = path.join(
      baseCacheDir,
      dateDirName,
      cacheName
    )

    const parentDir = path.dirname(backupPath)
    await fs.mkdir(parentDir, { recursive: true })

    await fs.rename(cacheDir, backupPath)

    console.log(
      `Moved old cache to backup "\\${cacheName}"\n` +
        `=> "\\_geg_redux_opt\\_cache\\${dateDirName}\\${cacheName}"\n`
    )
  }
}

function showSummary(label, results) {
  const orgSize = results.reduce((_, r) => _ + r.orgSize, 0)
  const optSize = results.reduce((_, r) => _ + r.optSize, 0)
  const savedSize = orgSize - optSize
  const savedPercent = Math.round((savedSize / orgSize) * 100)

  console.log(
    `  ${label}\n` +
      `📊 Total Size: ${sizeToStr(orgSize)} → ${sizeToStr(
        optSize
      )}\n` +
      `💰 Total Size Saved: ${savedPercent}% ${sizeToStr(
        savedSize
      )}\n`
  )
}

function getDateDirName(date = new Date()) {
  return getLocalIsoString(date)
    .slice(0, -1) // remoze "Z" at the end
    .replaceAll(':', '_')
}

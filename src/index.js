const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const os = require('node:os')
const { compressImgs } = require('./compressImgs')
const { compressMesh } = require('./compressMesh')
const { compressAudio } = require('./compressAudio')
const {
  unpackAZP,
  repackAZP,
  unpackZip,
  updateZip,
} = require('./tools')
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
  const {
    threads = Math.max(1, os.cpus().length - 1),
    canMigrate,
    canBackupCache,
    // textures
    canOptTextures,
    resizePercent,
    minResizeDimension,
    maxResizeDimension,
    // audio
    canOptAudio,
    maxSampleRate,
    maxBitDepth,
    canForceMonoChannel,
    // 3d mesh
    canOptMesh,
    maxMeshFloatDecimals,
  } = options

  const timerLabel = 'Total Time'
  console.time(timerLabel)

  try {
    const baseDir = await validateBaseDir(baseDirInput)
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

    const repackZip = (relPath, callback) =>
      patchZip(
        relPath,
        baseDir,
        baseBackupDir,
        baseTempDir,
        callback
      )
    const opt = (relDir, callback, isAzp = false) =>
      _opt(
        relDir,
        baseDir,
        baseBackupDir,
        baseTempDir,
        callback,
        isAzp
      )
    const optTextures = (src, dest) =>
      compressImgs(
        threads,
        IO_LIMIT,
        src,
        dest,
        resizePercent,
        minResizeDimension,
        maxResizeDimension
      )
    const optTexturesWithoutResize = (src, dest) =>
      compressImgs(
        threads,
        IO_LIMIT,
        src,
        dest,
        // do not resize, it have apsolute ui/sprite textures
        100, // resizePercent,
        99999, // minResizeDimension,
        99999 // maxResizeDimension
      )
    const optMesh = (src, dest) =>
      compressMesh(
        threads,
        IO_LIMIT,
        src,
        dest,
        maxMeshFloatDecimals
      )
    const optAudio = (src, dest) =>
      compressAudio(
        threads,
        IO_LIMIT,
        src,
        dest,
        maxSampleRate,
        maxBitDepth,
        canForceMonoChannel
      )

    const results = { textures: [], audio: [], mesh: [] }

    // opt textures -------------------------------------------
    if (canOptTextures)
      results.textures.push(
        await opt('Mods/GEG Redux/Data/MEDIA', optTextures),
        await opt(
          'Mods/GEG Redux/Data/HARDLIFE/BMP',
          optTextures
        ),
        await opt(
          'Mods/GEG Redux/Data/BMP',
          optTexturesWithoutResize
        )
      )

    // opt audio ----------------------------------------------
    if (canOptAudio)
      results.audio.push(
        await opt('Mods/GEG Redux/Data/music', optAudio),
        await opt('Mods/GEG Redux/Data/SOUNDS', optAudio),
        await opt('Data/Music', optAudio),
        await opt('Data/Sounds', optAudio)
      )

    // opt 3d mesh --------------------------------------------
    if (canOptMesh)
      results.mesh.push(
        await opt('Mods/GEG Redux/Data/ACTORS/ITEMS', optMesh),
        await opt('Data/Actors/Monsters', optMesh, true),
        await opt(
          'Mods/GEG Redux/Data/ACTORS/MONSTERS',
          optMesh,
          true
        )
      )

    // repack zips --------------------------------------------
    if (canOptTextures)
      await repackZip('Data/HardLife_En.zip', async opt => {
        if (canOptTextures)
          results.textures.push(
            await opt('MEDIA', optTextures),
            await opt('HARDLIFE/BMP', optTextures),
            await opt('BMP', optTexturesWithoutResize)
          )
      })

    if (canOptTextures || canOptMesh)
      await repackZip('Data/HardLife.zip', async opt => {
        if (canOptTextures)
          results.textures.push(
            await opt('MEDIA', optTextures),
            await opt('RENDEREDITEMS', optTextures),
            await opt('HARDLIFE/BMP', optTextures),
            await opt('BMP', optTexturesWithoutResize)
          )

        if (canOptMesh)
          results.mesh.push(await opt('ACTORS', optMesh))
      })

    // clear temp dir -----------------------------------------
    await removeDir(baseTempDir)

    // backup old cache ---------------------------------------
    if (canBackupCache) {
      const cacheNames = ['RenderedItems', 'Temp']
      await backupCache(baseDir, baseCacheDir, cacheNames)
    }

    // show summary -------------------------------------------
    const canShowSummary =
      canOptTextures || canOptAudio || canOptMesh
    if (canShowSummary) console.log(`\n${'═'.repeat(60)}`)
    if (canOptTextures && results.textures.length > 0)
      showSummary(
        'Final Textures Optimization Summary',
        results.textures
      )
    if (canOptAudio && results.audio.length > 0)
      showSummary(
        'Final Audio Optimization Summary',
        results.audio
      )
    if (canOptMesh && results.mesh.length > 0)
      showSummary(
        'Final 3d Mesh Optimization Summary',
        results.mesh
      )
    if (canShowSummary) console.log('═'.repeat(60))
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

async function _opt(
  relDir,
  baseDir,
  baseBackupDir,
  baseTempDir,
  callback,
  isAzp = false
) {
  const srcDir = path.resolve(baseDir, relDir)
  const backupDir = path.resolve(baseBackupDir, relDir)
  const tempDir = path.resolve(baseTempDir, relDir)

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
    threads,
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
    threads,
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

async function patchZip(
  zipRelPath,
  baseDir,
  baseBackupDir,
  baseTempDir,
  callback
) {
  const zipSrcPath = path.resolve(baseDir, zipRelPath)
  const zipBackupPath = path.resolve(baseBackupDir, zipRelPath)
  const zipTempPath = path.resolve(baseTempDir, zipRelPath)

  const isValidZipSrcPath = await checkDir(zipSrcPath)
  const isValidZipBackupPath = await checkDir(zipBackupPath)
  if (!isValidZipSrcPath && !isValidZipBackupPath) return

  // create backup
  if (!isValidZipBackupPath) {
    const parentDir = path.dirname(zipBackupPath)
    await fs.mkdir(parentDir, { recursive: true })

    await fs.rename(zipSrcPath, zipBackupPath)
  }

  // clear old temp (if exist)
  const zipExt = path.extname(zipRelPath)
  const zipBasename = path.basename(zipRelPath, zipExt)
  const zipRelDir = path.dirname(zipRelPath)
  const zipTempDir = path.resolve(
    baseTempDir,
    zipRelDir,
    zipBasename
  )
  await removeDir(zipTempDir)

  // copy zip to temp
  await copyFile(zipBackupPath, zipTempPath)

  const baseUnpackDir = path.resolve(zipTempDir, '_unpack')
  const baseUnpackOptDir = path.resolve(
    zipTempDir,
    '_unpack_opt'
  )

  const opt = async (targetDir, callback) => {
    console.log(
      `\nunpacking zip ... "${path.join(
        zipRelPath,
        targetDir
      )}"`
    )
    await unpackZip(
      zipBackupPath,
      baseUnpackDir,
      targetDir,
      `-mmt${threads}`
    )

    const unpackDir = path.join(baseUnpackDir, targetDir)
    const unpackOptDir = path.join(baseUnpackOptDir, targetDir)

    // opt callpack
    const result = await callback(unpackDir, unpackOptDir)

    // update zip
    console.log(
      `\nupdating zip ... "${path.join(
        path.relative(baseDir, zipTempPath),
        targetDir
      )}"`
    )
    await updateZip(zipTempPath, unpackOptDir, `-mmt${threads}`)

    return result
  }

  // opt callbacks
  await callback(opt)

  // save
  await moveDir(zipTempPath, zipSrcPath)

  // delete new temp
  await removeDir(baseUnpackDir)
  await removeDir(baseUnpackOptDir)
  await removeDir(zipTempDir)
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

const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
} = require('./utilities')
const { soxInfo, sox } = require('./tools')

module.exports = { compressAudio }

const SHOW_MORE_LOGS = true

async function compressAudio(
  CORES_LIMIT,
  IO_LIMIT,
  baseSrcDir,
  baseDestDir,
  maxSampleRate,
  maxBitDepth,
  canForceMonoChannel
) {
  const allPaths = await getAllFilePaths(baseSrcDir)
  const wavPaths = []
  const oggPaths = []
  const otherPaths = []
  const otherExtentions = new Set()

  for (const p of allPaths) {
    const ext = path.extname(p).toLowerCase()
    if (ext === '.wav') wavPaths.push(p)
    else if (ext === '.ogg') oggPaths.push(p)
    else {
      otherPaths.push(p)
      otherExtentions.add(path.extname(p).toLowerCase())
    }
  }

  console.log(
    `\n📊 Opting Audio files: "${baseSrcDir}"\n` +
      `   Total files: ${allPaths.length}\n` +
      `   WAV files: ${wavPaths.length}\n` +
      `   OGG files: ${oggPaths.length}\n` +
      `   Other files: ${otherPaths.length}` +
      ` [${[...otherExtentions].join(' ')}]\n`
  )

  // copy other files
  await parallelProccess(
    'copy other files',
    otherPaths,
    IO_LIMIT,
    async p => {
      const relPath = path.relative(baseSrcDir, p)
      const outPath = path.join(baseDestDir, relPath)
      await copyFile(p, outPath)
      return outPath
    }
  )

  // opt audio files
  const results = await parallelProccess(
    'Opt audio files',
    [...wavPaths, ...oggPaths],
    CORES_LIMIT,
    async p => {
      const filename = path.basename(p)
      const relPath = path.relative(baseSrcDir, p)
      const outPath = path.join(baseDestDir, relPath)

      const { sampleRate, bitDepth, channels } = await soxInfo(
        p
      )

      const canConvert =
        sampleRate > maxSampleRate ||
        bitDepth > maxBitDepth ||
        (canForceMonoChannel && channels !== 1)

      if (canConvert)
        await sox(p, {
          outPath,
          sampleRate: Math.min(maxSampleRate, sampleRate),
          bitDepth: Math.min(maxBitDepth, bitDepth),
          channels: canForceMonoChannel ? 1 : channels,
          multiThreads: false,
        })
      else await copyFile(p, outPath)

      const orgSize = (await fs.stat(p)).size
      const optSize = (await fs.stat(outPath)).size

      return { filename, orgSize, optSize }
    }
  )

  const orgSize = results.reduce((_, r) => _ + r.orgSize, 0)
  const optSize = results.reduce((_, r) => _ + r.optSize, 0)
  const savedSize = orgSize - optSize
  const savedPercent = Math.round((savedSize / orgSize) * 100)

  console.log(
    `\n${'═'.repeat(60)}\n` +
      `  Audio optimization Summary\n` +
      `  "${baseSrcDir}"\n` +
      `📊 Total Size: ${sizeToStr(orgSize)} → ${sizeToStr(
        optSize
      )}\n` +
      `💰 Total Size Saved: ${savedPercent}% ${sizeToStr(
        savedSize
      )}\n` +
      `${'═'.repeat(60)}\n`
  )

  return { orgSize, optSize, savedSize, savedPercent }
}

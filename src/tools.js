const fs = require('node:fs/promises')
const path = require('node:path')
const { execAsync, spawnAsync } = require('./utilities')

module.exports = {
  magickIdentify,
  magickVerbose,
  magickConv,
  texConv,
  meshConv,
  soxInfo,
  sox,
  unpackZip,
  updateZip,
  packZip,
  unpackAZP,
  repackAZP,
}

const TOOLS_DIR = path.resolve(__dirname, '..', 'tools')

const MAGICK_EXE_PATH = path.join(
  TOOLS_DIR,
  'ImageMagick-7.1.2-13-portable-Q16-HDRI-x64',
  'magick.exe'
)

const TEXCONV_EXE_PATH = path.join(
  TOOLS_DIR,
  'texconv October 2025',
  'texconv.exe'
)

const MESHCONVERT_EXE_PATH = path.join(
  TOOLS_DIR,
  'Microsoft DirectX SDK (June 2010)',
  'MeshConvert.exe'
)

const SOX_EXE_PATH = path.join(
  TOOLS_DIR,
  'SoX - Sound eXchange 14.4.2',
  'sox.exe'
)

const ZIP7_EXE_PATH = path.join(
  TOOLS_DIR,
  '7z2600-extra',
  '7za.exe'
)

const AZP_EXE_PATH = path.join(
  TOOLS_DIR,
  '7.62 resource archiver (c) 2007 by Novik v 1.3',
  'azp.exe'
)

async function magickIdentify(
  inputPath,
  format,
  separator,
  threads
) {
  const flags = ['identify']

  if (threads) flags.push('-limit', 'thread', threads)

  if (format) flags.push('-format', format)

  flags.push(inputPath)

  const output = await spawnAsync(MAGICK_EXE_PATH, flags)

  if (!output) return []

  const statusArr = []

  if (separator) statusArr.push(...output.split(separator))
  else statusArr.push(output)

  return statusArr
}

async function magickVerbose(inputPath, threads) {
  const flags = [inputPath]

  if (threads) flags.push('-limit', 'thread', threads)

  flags.push('-verbose', 'info:')

  return await spawnAsync(MAGICK_EXE_PATH, flags)
}

async function magickConv(inputPath, flags, outPath) {
  let command = `"${MAGICK_EXE_PATH}"`
  command += ` "${inputPath}"`

  if (flags) command += ` ${flags}`

  if (outPath) {
    const parentDir = path.dirname(outPath)
    await fs.mkdir(parentDir, { recursive: true })

    command += ` "${outPath}"`
  }

  return await execAsync(command)
}

async function texConv(inputPath, flags, outDir) {
  let command = `"${TEXCONV_EXE_PATH}"`
  command += ` "${inputPath}"`

  if (flags) command += ` ${flags}`

  if (outDir) {
    // Create output directory if needed
    await fs.mkdir(outDir, { recursive: true })

    command += ` -o "${outDir}"`
    command += ' --overwrite'
  }

  return await execAsync(command)
}

async function meshConv(inputPath, flags, outPath) {
  let command = `"${MESHCONVERT_EXE_PATH}"`
  command += ` "${inputPath}"`

  if (flags) command += ` ${flags}`
  // to binary: -x
  // to txt: -xt

  if (outPath) {
    const parentDir = path.dirname(outPath)
    await fs.mkdir(parentDir, { recursive: true })

    command += ` -o "${outPath}"`
    command += ` -y`
  }

  const output = await execAsync(command)

  if (output === 'Cannot Load specified input file')
    throw new Error(output)

  return output
}

async function soxInfo(inputPath) {
  const command = flag =>
    `"${SOX_EXE_PATH}" --info ${flag} "${inputPath}"`

  const sampleRate = await execAsync(command('-r'))
  const bitDepth = await execAsync(command('-b'))
  const channels = await execAsync(command('-c'))

  return {
    sampleRate: parseInt(sampleRate),
    bitDepth: parseInt(bitDepth),
    channels: parseInt(channels),
  }
}

async function sox(inputPath, options = {}) {
  const {
    outPath,
    sampleRate,
    bitDepth,
    channels,
    multiThreads,
    flags,
  } = options

  let command = `"${SOX_EXE_PATH}"`
  command += ` "${inputPath}"`

  if (sampleRate) command += ` --rate ${sampleRate}`
  if (bitDepth) command += ` --bits ${bitDepth}`
  if (channels) command += ` --channels ${channels}`
  if (typeof multiThreads === 'boolean')
    command += multiThreads
      ? ' --multi-threaded'
      : ' --single-threaded'
  if (flags) command += ` ${flags}`

  if (outPath) {
    const parentDir = path.dirname(outPath)
    await fs.mkdir(parentDir, { recursive: true })

    command += ` "${outPath}"`
  }

  return await execAsync(command)
}

async function unpackZip(
  zipPath,
  unpackDir,
  targetPath,
  flags
) {
  let command = `"${ZIP7_EXE_PATH}"`
  command += ` x`
  command += ` "${zipPath}"`

  // extract only file or dir
  if (targetPath) command += ` "${targetPath}"`

  if (unpackDir) {
    await fs.mkdir(unpackDir, { recursive: true })
    command += ` -o"${unpackDir}"`
  }

  command += ` -y`

  if (flags) command += ` ${flags}`
  // -mmt[N] N CPU threads used

  return await execAsync(command)
}

async function updateZip(zipPath, updatedPath, flags) {
  let command = `"${ZIP7_EXE_PATH}"`
  command += `  u`
  command += ` "${zipPath}"`
  command += ` "${updatedPath}"` // file or dir
  command += ` -y`

  if (flags) command += ` ${flags}`
  // -mmt[N] N CPU threads used

  return await execAsync(command)
}

async function packZip(unpackDir, zipPath, flags) {
  const parentDir = path.dirname(zipPath)
  await fs.mkdir(parentDir, { recursive: true })

  let command = `"${ZIP7_EXE_PATH}"`
  command += `  a`

  if (flags) command += ` ${flags}`
  // -mx[N]  N 1~9 compression lvl
  // -mmt[N] N CPU threads used

  command += ` "${zipPath}"`
  command += ` "${unpackDir}"`
  command += ` -y`

  return await execAsync(command)
}

async function unpackAZP(azpPath, unpackDir) {
  await fs.mkdir(unpackDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" x "${azpPath}"`

  return await execAsync(command)
}

async function repackAZP(unpackDir, azpPath) {
  const parentDir = path.dirname(azpPath)
  await fs.mkdir(parentDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" ar "${azpPath}" *`

  return await execAsync(command)
}

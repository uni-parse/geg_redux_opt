const fs = require('node:fs/promises')
const path = require('node:path')
const { execAsync, spawnAsync } = require('./utilities')

module.exports = {
  magickIdentify,
  magickVerbose,
  magickConv,
  texConv,
  meshConv,
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

const AZP_EXE_PATH = path.join(
  TOOLS_DIR,
  '7.62 resource archiver (c) 2007 by Novik v 1.3',
  'azp.exe'
)

async function magickIdentify(inputPath, format, separator) {
  const flags = ['identify']
  if (format) flags.push[('-format', format)]
  flags.push(inputPath)

  const output = await spawnAsync(MAGICK_EXE_PATH, flags)

  if (!output) return []

  const statusArr = []

  if (separator) statusArr.push(...output.split(separator))
  else statusArr.push(output)

  return statusArr
}

async function magickVerbose(inputPath) {
  return await spawnAsync(MAGICK_EXE_PATH, [
    inputPath,
    '-verbose',
    'info:',
  ])
}

async function magickConv(inputPath, flags, outPath) {
  let command = `"${MAGICK_EXE_PATH}"`
  command += ` "${inputPath}"`

  if (flags) command += ` ${flags}`

  if (outPath) {
    // Create output directory if needed
    const dir = path.dirname(outPath)
    await fs.mkdir(dir, { recursive: true })

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
    // Create output directory if needed
    const dir = path.dirname(outPath)
    await fs.mkdir(dir, { recursive: true })

    command += ` -o "${outPath}"`
    command += ` -y`
  }

  const output = await execAsync(command)

  if (output === 'Cannot Load specified input file')
    throw new Error(output)

  return output
}

async function unpackAZP(azpPath, unpackDir) {
  await fs.mkdir(unpackDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" x "${azpPath}"`

  return await execAsync(command)
}

async function repackAZP(unpackDir, azpPath) {
  // Create output directory if needed
  const azpDir = path.dirname(azpPath)
  await fs.mkdir(azpDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" ar "${azpPath}" *`

  return await execAsync(command)
}

const fs = require('node:fs/promises')
const path = require('node:path')
const { execAsync, spawnAsync } = require('./utilities')

module.exports = {
  magickIdentify,
  magickVerbose,
  magickConv,
  texConv,
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

const AZP_EXE_PATH = path.join(
  TOOLS_DIR,
  '7.62 resource archiver (c) 2007 by Novik v 1.3',
  'azp.exe'
)

async function magickIdentify(inputPath, format, separator) {
  const flags = ['identify']
  if (format) flags.push[('-format', format)]
  flags.push(inputPath)

  try {
    const result = await spawnAsync(MAGICK_EXE_PATH, flags)
    const { stdout } = result
    if (!stdout) return []

    const statusArr = []

    if (separator)
      statusArr.push(...stdout.trim().split(separator))
    else statusArr.push(stdout.trim())

    return statusArr
  } catch ({ error, stderr }) {
    throw new Error(
      `❌ Failed to identify texture ${inputPath}:`,
      stderr ?? error?.message
    )
  }
}

async function magickVerbose(inputPath) {
  try {
    const result = await spawnAsync(MAGICK_EXE_PATH, [
      inputPath,
      '-verbose',
      'info:',
    ])

    return result.stdout
  } catch ({ error, stderr }) {
    throw new Error(
      `❌ Failed to verbose texture ${inputPath}:`,
      stderr ?? error?.message
    )
  }
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

  try {
    result = await execAsync(command)
    return result
  } catch ({ error, stderr }) {
    throw stderr ?? error
  }
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

  try {
    result = await execAsync(command)
    return result
  } catch ({ error, stderr }) {
    throw stderr ?? error
  }
}

async function unpackAZP(azpPath, unpackDir) {
  await fs.mkdir(unpackDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" x "${azpPath}"`

  try {
    result = await execAsync(command)
    return result
  } catch ({ error, stderr }) {
    throw stderr ?? error
  }
}

async function repackAZP(unpackDir, azpPath) {
  // Create output directory if needed
  const azpDir = path.dirname(azpPath)
  await fs.mkdir(azpDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" ar "${azpPath}" *`

  try {
    result = await execAsync(command)
    return result
  } catch ({ error, stderr }) {
    throw stderr ?? error
  }
}

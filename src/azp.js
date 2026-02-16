const fs = require('node:fs/promises')
const path = require('node:path')
const { execAsync } = require('./utilities')

module.exports = { unpackAZP, repackAZP }

const AZP_EXE_PATH = path.resolve(
  __dirname,
  '..',
  'tools',
  '7.62 resource archiver (c) 2007 by Novik v 1.3',
  'azp.exe'
)

async function unpackAZP(azpPath, unpackDir) {
  await fs.mkdir(unpackDir, { recursive: true })

  let command = `cd "${unpackDir}"`
  command += ` &&`
  command += ` "${AZP_EXE_PATH}" x "${azpPath}"`

  try {
    await execAsync(command)
  } catch ({ error }) {
    throw error
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
    await execAsync(command)
  } catch ({ error }) {
    throw error
  }
}

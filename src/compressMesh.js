const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
} = require('./utilities')
const { meshConv } = require('./tools')

module.exports = { compressMesh }

const SHOW_MORE_LOGS = false

async function compressMesh(
  CORES_LIMIT,
  IO_LIMIT,
  baseSrcDir,
  baseDestDir,
  maxMeshFloatDecimals
) {
  const allPaths = await getAllFilePaths(baseSrcDir)
  const meshPaths = []
  const configPaths = []
  const otherPaths = []

  for (const p of allPaths) {
    const ext = path.extname(p).toLowerCase()
    const filename = path.basename(p).toLowerCase()

    const isConfig = ['.inf', '.att', '.descr', '.hi'].includes(
      ext
    )
    const isMesh =
      ['.act', '.actx', '.x', '.mesh'].includes(ext) ||
      /\.act\.\d+$/.test(filename) || // endsWith .ACT.#
      /\.lod\d+$/.test(filename) // endsWith .LOD#

    if (isConfig) configPaths.push(p)
    else if (isMesh) meshPaths.push(p)
    else otherPaths.push(p)
  }

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

  // opt mesh config files: .inf .att .descr .hi
  const configResults = await parallelProccess(
    'Opt Mesh config files',
    configPaths,
    CORES_LIMIT,
    async p => {
      const filename = path.basename(p)
      const relPath = path.relative(baseSrcDir, p)
      const outPath = path.join(baseDestDir, relPath)
      const content = await fs.readFile(p, 'utf8')

      const optContent = optMeshConfigContent(
        content,
        maxMeshFloatDecimals
      )

      const parentDir = path.dirname(outPath)
      await fs.mkdir(parentDir, { recursive: true })

      await fs.writeFile(outPath, optContent, 'utf8')

      const orgSize = content.length
      const optSize = optContent.length

      return { filename, orgSize, optSize }
    }
  )

  // opt 3d mech files: .x .act .actx .lod# .act.#
  const meshResults = await parallelProccess(
    'Opt Mesh files',
    meshPaths,
    CORES_LIMIT,
    async p => {
      const filename = path.basename(p)
      const relPath = path.relative(baseSrcDir, p)
      const outPath = path.join(baseDestDir, relPath)

      const parentDir = path.dirname(outPath)
      await fs.mkdir(parentDir, { recursive: true })

      const content = await fs.readFile(p, 'utf8')
      let optContent = content

      // const binHeaders = ['xof 0303bin 0032']
      // const txtHeaders = ['xof 0302txt 0032', 'xof 0303txt 0032']
      const header = content.slice(0, 16).toLowerCase()
      const isTxt =
        header.includes('txt') && !header.includes('bin')

      let isSupportedTxt0303 = header.includes('0303txt')

      if (isTxt) {
        // convert to binary
        if (isSupportedTxt0303) {
          // compatibility hack: MeshConvert.exe require .x
          const ext = path.extname(p).toLowerCase()
          const isX = ext === '.x'
          const xPath = isX ? p : `${outPath}.x`

          // create temp .x
          if (!isX) await copyFile(p, xPath)

          try {
            await meshConv(xPath, '-x', outPath)
          } catch (error) {
            if (SHOW_MORE_LOGS)
              console.warn(
                `\n  Warn: unsupported 0303txt mesh file: "${filename}"\n` +
                  `  "${p}"\n` +
                  `  fallback to opt text`
              )

            isSupportedTxt0303 = false
          }

          // remove temp .x
          if (!isX) await fs.unlink(xPath)
        }

        // opt text
        if (!isSupportedTxt0303) {
          optContent = optMeshContent(
            content,
            maxMeshFloatDecimals
          )
          await fs.writeFile(outPath, optContent, 'utf8')
        }
      } else await copyFile(p, outPath)

      const orgSize = content.length
      const optSize = isSupportedTxt0303
        ? (await fs.stat(outPath)).size
        : optContent.length

      return { filename, orgSize, optSize }
    }
  )

  const results = [...configResults, ...meshResults]
  const orgSize = results.reduce((_, r) => _ + r.orgSize, 0)
  const optSize = results.reduce((_, r) => _ + r.optSize, 0)
  const savedSize = orgSize - optSize
  const savedPercent = Math.round((savedSize / orgSize) * 100)

  console.log(
    `\n${'═'.repeat(60)}\n` +
      `  3d Mesh optimization Summary\n` +
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

function optMeshConfigContent(content, maxMeshFloatDecimals) {
  return (
    content
      .split(/\r?\n/)
      .map(
        line =>
          line
            .split('//')[0] // Remove // Comments
            .trim() // trim extra spaces
            .replace(/\s{2,}/g, ' ') // remove dulplicate spaces
      )
      .filter(line => line.length > 0) // remove empty lines
      .join('\n')
      // Optimize floats
      .replace(/(-?\d+\.\d+)/g, match =>
        roundFloat(match, maxMeshFloatDecimals)
      )
  )
}

function optMeshContent(content, maxMeshFloatDecimals) {
  const header = content.slice(0, 16)
  const body = content
    .slice(16)
    .split(/\r?\n/)
    .map(
      line =>
        line
          .split('//')[0] // Remove // Comments
          .trim() // trim extra spaces
          .replace(/\s{2,}/g, ' ') // remove dulplicate spaces
    )
    .filter(line => line.length > 0) // remove empty lines
    .join('')
    // remove space around special charecters
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*;\s*/g, ';')
    // remove unecessary tailing ;
    .replaceAll(';,', ',')
    .replaceAll(';;', ';')
    // Optimize floats
    .replace(/(-?\d+\.\d{6})(?!\d)/g, match =>
      roundFloat(match, maxMeshFloatDecimals)
    )

  return `${header}\n${body}`
}

function roundFloat(float, maxDecimal = 4) {
  const roundFactor = 10 ** maxDecimal

  let num = parseFloat(float)
  num = Math.round(num * roundFactor) / roundFactor
  num = num.toString()
  num = num.includes('.') ? num : `${num}.0`

  return num
}

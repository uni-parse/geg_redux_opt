const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
} = require('./utilities')

module.exports = { compressMesh }

const SHOW_MORE_LOGS = false

async function compressMesh(
  CORES_LIMIT,
  IO_LIMIT,
  baseSrcDir,
  baseDestDir,
  floatDecimal
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
      ['.act', '.actx', '.x'].includes(ext) ||
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
      const outPath = p.replace(baseSrcDir, baseDestDir)
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
      const outPath = p.replace(baseSrcDir, baseDestDir)
      const content = await fs.readFile(p, 'utf8')

      const optContent = optMeshConfigContent(content)

      // Create output directory if needed
      const dir = path.dirname(outPath)
      await fs.mkdir(dir, { recursive: true })

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
      const outPath = p.replace(baseSrcDir, baseDestDir)

      const content = await fs.readFile(p, 'utf8')

      // const binHeaders = ['xof 0303bin 0032']
      // const txtHeaders = ['xof 0302txt 0032', 'xof 0303txt 0032']
      const header = content.slice(0, 16).toLowerCase()
      const isTxt =
        header.includes('txt') && !header.includes('bin')

      const optContent = isTxt
        ? optMeshContent(content, floatDecimal)
        : content

      // Create output directory if needed
      const dir = path.dirname(outPath)
      await fs.mkdir(dir, { recursive: true })

      if (isTxt) await fs.writeFile(outPath, optContent, 'utf8')
      else await copyFile(p, outPath)

      const orgSize = content.length
      const optSize = optContent.length

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

function optMeshConfigContent(content) {
  return (
    content
      .replace(/\/\/.*$/gm, '') // Remove // comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* comments */
      // Optimize floats
      .replace(/(-?\d+\.\d+)/g, matchFloat => {
        const num = parseFloat(matchFloat).toString()
        return num.includes('.') ? num : `${num}.0`
      })
      .split(/\r?\n/)
      .map(line => line.trim().replace(/\s{2,}/g, ' ')) // trim extra spaces
      .filter(line => line.length > 0) // remove empty lines
      .join('\n')
  )
}

function optMeshContent(content, floatDecimal) {
  const header = content.slice(0, 16)
  const body = content
    .slice(16)
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* comments */
    .replace(/\/\/.*$/gm, m => '') // Remove // comments
    .split(/\r?\n/)
    .map(line => line.trim()) // trim spaces at the edges
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
      roundFloat(match, floatDecimal)
    )

  return `${header}\n${body}`
}

function roundFloat(float, maxDecimal = 4) {
  const num = parseFloat(float)
  const rounded =
    Math.round(num * 10 ** maxDecimal) / 10 ** maxDecimal

  let result = rounded.toString()
  if (!result.includes('.')) result += '.0'

  return result
}

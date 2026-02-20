const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
} = require('./utilities')

module.exports = { compressMesh }

async function compressMesh(
  CORES_LIMIT,
  IO_LIMIT,
  baseSrcDir,
  baseDestDir,
  floatDecimal
) {
  const allPaths = await getAllFilePaths(baseSrcDir)
  const {
    actPaths,
    attPaths,
    infPaths,
    hiPaths,
    descrPaths,
    otherPaths,
  } = filterActPaths(allPaths)

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

  // opt mesh files: .act .att .inf | .hi .descr .lod# .act.#
  const results = await parallelProccess(
    'Opt Mesh files',
    [
      ...actPaths,
      ...attPaths,
      ...infPaths,
      ...hiPaths,
      ...descrPaths,
    ],
    CORES_LIMIT,
    async p => {
      const outPath = p.replace(baseSrcDir, baseDestDir)

      const content = await fs.readFile(p, 'utf8')

      let optContent = content
      let isTxt = true

      if (attPaths.includes(p) || infPaths.includes(p))
        optContent = opt_ATT_INF_content(content, floatDecimal)
      else if (hiPaths.includes(p) || descrPaths.includes(p))
        optContent = opt_HI_DESCR_content(content)
      else {
        const header = content.slice(0, 16).toLowerCase()

        // const binHeaders = ['xof 0303bin 0032']
        // const txtHeaders = ['xof 0302txt 0032', 'xof 0303txt 0032']

        isTxt =
          header.includes('txt') && !header.includes('bin')

        if (isTxt)
          optContent = opt_ACT_content(content, floatDecimal)
      }

      // Create output directory if needed
      const dir = path.dirname(outPath)
      await fs.mkdir(dir, { recursive: true })

      if (isTxt) await fs.writeFile(outPath, optContent, 'utf8')
      else await copyFile(p, outPath)

      const filename = path.basename(p)
      const orgSize = content.length
      const optSize = optContent.length
      const savedSize = orgSize - optSize
      const savedPercent = (
        (savedSize * 100) /
        orgSize
      ).toFixed(2)

      // console.log(
      //   `${filename}: ${sizeToStr(orgSize)} → ${sizeToStr(
      //     optSize
      //   )} ` +
      //     `(Saved ${savedPercent}% ${sizeToStr(savedSize)})`
      // )

      return {
        filename,
        orgSize,
        optSize,
        savedSize,
        savedPercent,
      }
    }
  )

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

function filterActPaths(allPaths) {
  const actPaths = []
  const infPaths = []
  const attPaths = []
  const hiPaths = []
  const descrPaths = []
  const otherPaths = []

  for (const p of allPaths) {
    const ext = path.extname(p).toLowerCase()
    const filename = path.basename(p).toLowerCase()

    if (ext === '.inf') infPaths.push(p)
    else if (ext === '.att') attPaths.push(p)
    else if (ext === '.hi') hiPaths.push(p)
    else if (ext === '.descr') descrPaths.push(p)
    else if (
      // ext === '.x' ||
      // ext === '.actx' ||
      ext === '.act' ||
      /\.act\.\d+$/.test(filename) || // endsWith .ACT.#
      /\.lod\d+$/.test(filename) // endsWith .LOD#
    )
      actPaths.push(p)
    else otherPaths.push(p)
  }

  return {
    actPaths,
    infPaths,
    attPaths,
    hiPaths,
    descrPaths,
    otherPaths,
  }
}

function opt_ACT_content(content, floatDecimal) {
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

function opt_ATT_INF_content(content, floatDecimal) {
  return (
    content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* comments */
      .replace(/\/\/.*$/gm, '') // Remove // comments
      // Optimize floats
      .replace(/(-?\d+\.\d+)/g, match =>
        roundFloat(match, floatDecimal)
      )
      .split(/\r?\n/) // split to lines arr
      .map(line => line.trim()) // trim spaces at the edges
      .filter(line => line.length > 0) // remove empty lines
      .join('\n') // rejoin lines arr to str
  )
}

function opt_HI_DESCR_content(content) {
  return (
    content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* comments */
      .replace(/\/\/.*$/gm, '') // Remove // comments
      .split(/\r?\n/) // split to lines arr
      // trim extra spaces
      .map(line => line.trim().replace(/\s{2,}/g, ' '))
      .filter(line => line.length > 0) // remove empty lines
      .join('\n') // rejoin lines arr to str
  )
}

function roundFloat(float, maxDecimal = 2) {
  const num = parseFloat(float)
  const rounded =
    Math.round(num * 10 ** maxDecimal) / 10 ** maxDecimal

  let result = rounded.toString()
  if (!result.includes('.')) result += '.0'

  return result
}

const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
} = require('./utilities')

module.exports = { compressMech }

async function compressMech(
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

  // opt mech files: .act .att .inf | .hi .descr .lod# .act.#
  const results = await parallelProccess(
    'Opt Mech files',
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
      if ([...attPaths, ...infPaths].includes(p))
        optContent = opt_ATT_INF_content(content, floatDecimal)
      else if ([...hiPaths, ...descrPaths].includes(p))
        optContent = opt_HI_DESCR_content(content)
      else optContent = opt_ACT_content(content, floatDecimal)

      // Create output directory if needed
      const dir = path.dirname(outPath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(outPath, optContent, 'utf8')

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
      `  3d Mech optimization Summary\n` +
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
      ext === '.act' ||
      // ext === '.actx' ||
      // ext === '.x' ||
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
  const lines = content
    // Remove /* ... */ comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove // comments
    .replace(/\/\/.*$/gm, '')
    .split(/\r?\n/)
    // trim spaces at the start and end
    .map(line => line.trim())
    // remove empty lines
    .filter(line => line.length > 0)

  const header = lines[0]

  const rest = lines
    .slice(1)
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
    .replace(/(-?\d*\.\d+)/g, m => roundFloat(m, floatDecimal))

  const optContent = `${header}\n${rest}`
  return optContent
}

function opt_ATT_INF_content(content, floatDecimal) {
  return (
    content
      // Remove /* ... */ comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove // comments
      .replace(/\/\/.*$/gm, '')
      // Optimize floats
      .replace(/(-?\d*\.\d+)/g, m =>
        roundFloat(m, floatDecimal)
      )
      // split to lines arr
      .split(/\r?\n/)
      // trim spaces at the start and end
      .map(line => line.trim())
      // remove empty lines
      .filter(line => line.length > 0)
      // rejoin lines arr to str
      .join('\n')
  )
}

function opt_HI_DESCR_content(content) {
  return (
    content
      // Remove /* comments */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove // comments
      .replace(/\/\/.*$/gm, '')
      // split to lines arr
      .split(/\r?\n/)
      // trim extra spaces
      .map(line => line.trim().replace(/\s{2,}/g, ' '))
      // remove empty lines
      .filter(line => line.length > 0)
      // rejoin lines arr to str
      .join('\n')
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

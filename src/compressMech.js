const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
} = require('./utilities')

module.exports = {
  compressMech,
}

async function compressMech(
  CORES_LIMIT,
  IO_LIMIT,
  srcPath,
  destPath,
  floatDecimal
) {
  const allPaths = await getAllFilePaths(srcPath)
  const { actPaths, attPaths, infPaths, otherPaths } =
    filterActPaths(allPaths)

  // copy other files
  await parallelProccess(
    'copy other files',
    otherPaths,
    IO_LIMIT,
    async p => {
      const outPath = p.replace(srcPath, destPath)
      await copyFile(p, outPath)
    }
  )

  // opt att & inf files
  const optedInfoConfigs = await parallelProccess(
    'Opt INF and ATT files',
    [...infPaths, ...attPaths],
    CORES_LIMIT,
    async p => {
      const content = await fs.readFile(p, 'utf8')
      const optContent = opt_Att_Inf_Content(
        content,
        floatDecimal
      )

      const outPath = p.replace(srcPath, destPath)

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

  const optedACTs = await parallelProccess(
    'Opt .Act files',
    actPaths,
    CORES_LIMIT,
    async p => {
      const content = await fs.readFile(p, 'utf8')
      const optContent = opt_Act_Content(content, floatDecimal)

      const outPath = p.replace(srcPath, destPath)

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

  const configFiles = [...optedACTs, ...optedInfoConfigs]
  const orgSize = configFiles.reduce(
    (_, file) => _ + file.orgSize,
    0
  )

  const optSize = configFiles.reduce(
    (_, file) => _ + file.optSize,
    0
  )
  const savedSize = orgSize - optSize
  const savedPercent = Math.round((savedSize / orgSize) * 100)

  console.log(
    `\n${'═'.repeat(60)}\n` +
      `📊 Total Size: ${sizeToStr(orgSize)} → ${sizeToStr(
        optSize
      )}\n` +
      `💰 Total Size Saved: ${savedPercent}% ${sizeToStr(
        savedSize
      )}\n` +
      `${'═'.repeat(60)}\n`
  )
}

function filterActPaths(allPaths) {
  const actPaths = []
  const infPaths = []
  const attPaths = []
  const otherPaths = []

  for (const p of allPaths) {
    const filename = path.basename(p).toLowerCase()
    const ext = path.extname(p).toLowerCase()

    if (ext === '.inf') infPaths.push(p)
    else if (ext === '.att') attPaths.push(p)
    else if (
      [
        '.act',
        // '.actx',
        // '.x'
      ].includes(ext)
      // || filename.endsWith('.act.1')
    )
      actPaths.push(p)
    else otherPaths.push(p)
  }

  return { actPaths, infPaths, attPaths, otherPaths }
}

function opt_Att_Inf_Content(content, floatDecimal) {
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

function opt_Act_Content(content, floatDecimal) {
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

function roundFloat(float, maxDecimal = 3) {
  const num = parseFloat(float)
  const rounded =
    Math.round(num * 10 ** maxDecimal) / 10 ** maxDecimal
  return rounded.toString()
}

/** process
 * copy/skip small imgs & unsupported files (as .vtf)
 * rename misFormated & fix corrupt .dds (magick required it)
 * opt/resize/convert everything to .dds (by magick)
 * rename back to org filename (compatibility hack)
 */

/** config files who contine imgs paths
  *.act, *.ACT, *.ACT.1, *.x, *.actx, *.ACTx, *.E5B, *.e5b, *.E6B, *.e6b, *.INI, *.ini, *.xml, *.lua, SOLDIEREPAULETS

  /CTORS/ITEMS/ *.act, *.ACT, *.ACT.1, *.x, *.actx, *.ACTx
  /ARDLIFE/Configs/dloob_decals.xml
  /ARDLIFE/lua/items/tracers.lua
  /NI/SOLDIEREPAULETS
 */

const fs = require('node:fs/promises')
const path = require('node:path')
const {
  parallelProccess,
  sizeToStr,
  getAllFilePaths,
  copyFile,
  execAsync,
  spawnAsync,
} = require('./utilities')
const { getResizeDimensions } = require('./resize')

module.exports = {
  compressImgs,
  detectImgFormat,
  getImageStatus,
}

const MAGICK_EXE_PATH = path.resolve(
  __dirname,
  '..',
  'tools',
  'ImageMagick-7.1.2-13-portable-Q16-HDRI-x64',
  'magick.exe'
)

const TEXCONV_PATH = path.resolve(
  __dirname,
  '..',
  'tools',
  'texconv October 2025',
  'texconv.exe'
)

const SHOW_MORE_LOGS = false

const EXTENSIONS = [
  '.tga',
  '.dds',
  '.bmp',
  '.png',
  '.jpg',
  '.jpeg',
  // '.vtf', // unsupported, so it can only copy
]

async function compressImgs(
  CORES_LIMIT,
  IO_LIMIT,
  baseSrcDir,
  baseDestDir,
  resizePercent,
  minResize,
  maxResize
) {
  const filePaths = await getAllFilePaths(baseSrcDir)

  // Filter supported imgs
  const imgPaths = filePaths.filter(p =>
    EXTENSIONS.includes(path.extname(p).toLowerCase())
  )
  console.log(
    `\n📊 Found ${filePaths.length} total files:\n` +
      `   📷 Images: ${imgPaths.length}\n` +
      `   📄 Other: ${filePaths.length - imgPaths.length}\n`
  )

  // Copy unSupported files
  const unSupportedPaths = filePaths.filter(
    p => !EXTENSIONS.includes(path.extname(p).toLowerCase())
  )
  await parallelProccess(
    'Copy unSupported Files',
    unSupportedPaths,
    IO_LIMIT,
    async p => {
      const outputPath = p.replace(baseSrcDir, baseDestDir)
      await copyFile(p, outputPath)

      if (SHOW_MORE_LOGS)
        console.log(`\n\n📋 Copied File "${outputPath}"`)
    }
  )

  // init imgs objects details
  const imgs = imgPaths.map(p => ({
    basename: path.basename(p, path.extname(p)),
    relDir: path.dirname(path.relative(baseSrcDir, p)),

    // org status
    orgFilename: path.basename(p),
    orgPath: p,
    orgRelPath: path.relative(baseSrcDir, p),
    orgExt: path.extname(p),

    // current status
    filename: path.basename(p),
    path: p,
    relPath: path.relative(baseSrcDir, p),
    ext: path.extname(p),

    // compatibility hack
    // to bypass configs absolute paths misMatching
    // at the end, we MOST rename to org filename
    // ex: huge img.TGA => convert/opt img.png => renamed img.TGA
    finalPath: p.replace(baseSrcDir, baseDestDir),

    setPath(newPath) {
      const newExt = path.extname(newPath)
      this.filename = path.basename(newPath)
      this.path = newPath
      this.relPath = path.join(
        this.relDir,
        this.basename + newExt
      )
      this.ext = newExt

      return this
    },
  }))

  // Flag duplicated imgs
  const { uniqueImgs, duplicateImgs, orgDuplicateImgs } =
    deduplicateImgs(imgs)

  // Flag misFormated imgs
  // Flag Corrupted .dds imgs
  const misFormat_or_curroptDDS_imgs = await parallelProccess(
    'Flag misFormat / Corrupt .dds imgs',
    uniqueImgs,
    IO_LIMIT,
    async img => {
      const actualExt = await detectImgFormat(img.orgPath)
      const isMisFormated =
        img.orgExt.toLowerCase() !== actualExt

      const isCorruptDDS =
        actualExt === '.dds' && (await detectCurroptDDS(img))

      // update
      img.isMisFormated = isMisFormated
      img.actualExt = actualExt
      img.isCorruptDDS = isCorruptDDS

      if (isMisFormated || isCorruptDDS) return img
    }
  )

  // Rename misFormated imgs
  // Repair corrupt .dds imgs
  await parallelProccess(
    'Fix misFormat imgs / Corrupt .dds imgs',
    misFormat_or_curroptDDS_imgs,
    IO_LIMIT,
    async img => {
      const outPath = path.join(
        baseDestDir,
        img.relDir,
        img.basename + img.actualExt
      )

      await copyFile(img.path, outPath)

      if (img.isMisFormated) {
        img.isMisFormated = false
        img.isRenamed = true
      }

      if (img.isCorruptDDS) {
        await repairCorruptDDS(outPath)

        img.isCorruptDDS = false
        img.isRepairedDDS = true
      }

      // update
      img.setPath(outPath)

      if (img.isRenamed || img.isRepairedDDS) return img
    }
  )

  // Collect img status
  await parallelProccess(
    `Collect imgs status`,
    uniqueImgs,
    IO_LIMIT,
    async img => {
      const {
        size,
        width,
        height,
        dimensions,
        depth,
        hasAlpha,
      } = await getImageStatus(img.path)

      // update
      img.size = size
      img.width = width
      img.height = height
      img.dimensions = dimensions
      img.depth = depth
      img.hasAlpha = hasAlpha

      return img
    },
    (error, img) =>
      console.error(
        `\n\n❌ Failed to get img status "${img.relPath}: ${error?.message}"`
      )
  )

  // Opt & Convert to .dds
  const optedImgs = await parallelProccess(
    'Opt & Convert to .DDS',
    uniqueImgs,
    CORES_LIMIT,
    async img => {
      const outPath = path.join(
        baseDestDir,
        img.relDir,
        img.basename + '.dds'
      )

      // Create output directory if needed
      const dir = path.dirname(outPath)
      await fs.mkdir(dir, { recursive: true })

      try {
        await convertToDDS_texconv(
          img,
          outPath,
          resizePercent,
          minResize,
          maxResize
        )
      } catch (error) {
        await convertToDDS_magick(
          img,
          outPath,
          resizePercent,
          minResize,
          maxResize
        )
      }

      // update
      img.isOpted = true
      img.setPath(outPath)

      return img
    }
  )

  // Remove temp renamed imgs
  // org  actual rename convert remove
  // tga => tga => --- => dds   no (convert from src)
  // dds => dds => --- => dds   no (convert from src)
  // tga => dds => dds => dds   no (overrite dest)
  // tga => png => png => dds   remove (temp renamed png)
  const tempRenamedImgs = uniqueImgs.filter(
    img => img.isRenamed && img.actualExt !== '.dds'
  )
  await parallelProccess(
    'Remove temp renamed imgs',
    tempRenamedImgs,
    CORES_LIMIT,
    async img => {
      const renamedPath = path.join(
        baseDestDir,
        img.relDir,
        img.basename + img.actualExt
      )
      await fs.unlink(renamedPath)
      return img
    }
  )

  // Update opted imgs Status
  await parallelProccess(
    'Update opted status',
    optedImgs,
    IO_LIMIT,
    async img => {
      const {
        size,
        width,
        height,
        dimensions,
        depth,
        hasAlpha,
      } = await getImageStatus(img.path)

      const saved = img.size - size
      const savedPercent = Math.round((saved / img.size) * 100)

      // update
      img.opt = {
        size,
        width,
        height,
        dimensions,
        depth,
        hasAlpha,
        saved,
        savedPercent,
      }

      return img
    },
    (error, img) =>
      console.error(
        `\n\n❌ Failed to get img status "${img.relPath}": ${error?.message}"`
      )
  )

  // Compatibility hack
  // Restore original filename
  await parallelProccess(
    'Restore org filename (compatibility hack)',
    uniqueImgs,
    IO_LIMIT,
    async img => {
      await fs.rename(img.path, img.finalPath)
      img.setPath(img.finalPath)
      return img
    }
  )

  // Copy duplicates
  await parallelProccess(
    'Copy duplicates',
    duplicateImgs,
    IO_LIMIT,
    async img => {
      const { orgDuplicateImg } = img

      // update org status
      const { size } = await fs.stat(img.orgPath)
      img.size = size
      img.width = orgDuplicateImg.width
      img.height = orgDuplicateImg.height
      img.dimensions = orgDuplicateImg.dimensions

      await copyFile(orgDuplicateImg.path, img.finalPath)
      img.setPath(img.finalPath)

      // update opt status
      img.isOpted = orgDuplicateImg.isOpted
      img.opt = orgDuplicateImg.opt

      img.isMisFormated = orgDuplicateImg.isMisFormated
      img.isRenamed = orgDuplicateImg.isRenamed

      img.isCorruptDDS = orgDuplicateImg.isCorruptDDS
      img.isRepairedDDS = orgDuplicateImg.isRepairedDDS
    }
  )

  const orgSize = imgs.reduce((_, img) => _ + img.size, 0)
  const newSize = imgs.reduce(
    (_, img) => _ + (img.opt?.size ?? img.size),
    0
  )
  const saved = orgSize - newSize
  const savedPercent = Math.round((saved / orgSize) * 100)

  const optedImgsLength = imgs.reduce(
    (_, img) => _ + +img.isOpted,
    0
  )

  console.log(
    `\n${'═'.repeat(60)}\n` +
      `⚡ Optimized: ${optedImgsLength} / ${imgs.length} files\n` +
      `📊 Total Size: ${sizeToStr(orgSize)} → ${sizeToStr(
        newSize
      )}\n` +
      `💰 Total Size Saved: ${savedPercent}% ${sizeToStr(
        saved
      )}\n` +
      `${'═'.repeat(60)}\n`
  )
}

async function convertToDDS_texconv(
  img,
  outPath,
  resizePercent,
  minResize,
  maxResize
) {
  let command = `"${TEXCONV_PATH}"`
  command += ` "${img.path}"`
  command += ` -o "${path.dirname(outPath)}"`
  command += ` --overwrite`
  command += ' --single-proc' // disable multi thread
  command += ' --file-type dds'
  command += ' --mip-levels 4'

  const compression = await decideCompression(img)
  command += ` --format ${compression}`

  const { canResize, newWidth, newHeight } =
    getResizeDimensions(
      img,
      resizePercent,
      minResize,
      maxResize
    )
  if (canResize) {
    command += ` --width ${newWidth}`
    command += ` --height ${newHeight}`
  }

  try {
    await execAsync(command)
  } catch ({ error }) {
    throw new Error(error)
  }
}

async function convertToDDS_magick(
  img,
  outPath,
  resizePercent,
  minResize,
  maxResize
) {
  let command = `"${MAGICK_EXE_PATH}"`
  command += ` "${img.path}"`
  command += ' -define dds:mipmaps=4'
  command += ' -define dds:fast-mipmaps=true'
  command += ' -define dds:weighted=false'

  const compression = await decideCompression(img)
  command += ` -define dds:compression=${compression}`

  if (img.depth > 8) command += ' -depth 8'

  const { canResize, newWidth, newHeight } =
    getResizeDimensions(
      img,
      resizePercent,
      minResize,
      maxResize
    )
  if (canResize)
    command += ` -resize "${newWidth}x${newHeight}>"`

  command += ` "${outPath}"`

  try {
    await execAsync(command)
  } catch ({ error }) {
    throw new Error(error)
  }
}

async function detectImgFormat(inputPath) {
  let fileHandler

  try {
    fileHandler = await fs.open(inputPath, 'r')

    const buf = Buffer.alloc(5)
    const { bytesRead } = await fileHandler.read(buf, 0, 5, 0)
    if (bytesRead !== 5) throw new Error('invalid bytesRead')

    if (buf.slice(0, 4).toString() === 'DDS ') return '.dds'
    if (buf.slice(1, 4).toString() === 'PNG') return '.png'
    if (buf.slice(0, 2).toString() === 'BM') return '.bmp'
    if (buf.slice(0, 3).toString() === 'GIF') return '.gif'
    if (buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      return '.jpg'

    const isTGA = [0, 1, 2, 3, 9, 10, 11].includes(buf[2])
    if (isTGA) return '.tga'

    console.warn('unknown format, fallback to .tga')
    return '.tga' // fallback to .tga
  } catch (error) {
    throw new Error(
      `Failed to check format of "${inputPath}": ${error?.message}`
    )
  } finally {
    await fileHandler?.close()
  }
}

async function detectCurroptDDS(img) {
  let fileHandler

  try {
    fileHandler = await fs.open(img.path, 'r')

    const buf = Buffer.alloc(5)
    const { bytesRead } = await fileHandler.read(buf, 0, 5, 0)
    if (bytesRead !== 5) throw new Error('invalid bytesRead')

    const isValid = buf.toString() === 'DDS |'
    return !isValid
  } catch (error) {
    throw new Error(
      `Failed to validate DDS metadata "${img.relPath}": ${error?.message}`
    )
  } finally {
    await fileHandler?.close()
  }
}

async function repairCorruptDDS(inputPath) {
  let fileHandler

  try {
    fileHandler = await fs.open(inputPath, 'r+')

    const buf = Buffer.alloc(8)
    buf.writeUInt32LE(124, 0) // Header size
    buf.writeUInt32LE(0xa1007, 4) // Flags

    await fileHandler.write(buf, 0, 8, 4)
  } catch (error) {
    throw new Error(
      `Failed to repair corrupt DDS "${inputPath}": ${error?.message}`
    )
  } finally {
    await fileHandler?.close()
  }
}

async function getImageStatus(inputPath) {
  try {
    const result = await spawnAsync(MAGICK_EXE_PATH, [
      'identify',
      '-format',
      '%B|%w|%h|%[depth]|%[channels]',
      inputPath,
    ])

    if (result.stdout) {
      const [size, width, height, depth, channels] =
        result.stdout.trim().split('|')

      return {
        size: parseInt(size),
        width: parseInt(width),
        height: parseInt(height),
        dimensions: `${width}x${height}`,
        depth: parseInt(depth),
        hasAlpha: channels.toLowerCase().includes('a'),
      }
    }
  } catch ({ error }) {
    throw new Error(
      `❌ Failed to stat file ${inputPath}:`,
      error?.message
    )
  }
}

async function decideCompression(img) {
  if (!img.hasAlpha) return 'dxt1'

  const result = await spawnAsync(MAGICK_EXE_PATH, [
    img.path,
    '-verbose',
    'info:',
  ])

  const output = result.stdout
  if (!output) return 'dxt5' // fallback

  // Check alpha channel depth
  const depthMatch = output.match(/Alpha:\s+(\d+)-bit/)
  if (!depthMatch) return 'dxt1' // No alpha channel

  const alphaDepth = parseInt(depthMatch[1])
  if (alphaDepth === 1) return 'dxt1' // Binary transparency

  // Check if alpha unused
  const minMatch = output.match(
    /Alpha:\s+min:\s+\d+\s+\(([\d.]+)\)/
  )
  if (minMatch) {
    const min = parseFloat(minMatch[1])
    const isOpaque = min === 1.0
    if (isOpaque) return 'dxt1'
  }

  return 'dxt5' // Smooth transparency
}

function deduplicateImgs(imgs) {
  // First, group by relPath without extension
  const groups = new Map()
  imgs.forEach(img => {
    const key = path
      .join(img.relDir, img.basename)
      .toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(img)
  })

  // For each group, pick the best format
  const uniqueImgs = []
  const duplicateImgs = []
  const orgDuplicateImgs = []

  groups.values().forEach(group => {
    if (group.length === 1) {
      // No duplicates
      uniqueImgs.push(group[0])
      return
    }

    const orgDuplicateImg = getBestDuplicateImg(group)
    orgDuplicateImgs.push(orgDuplicateImg)
    uniqueImgs.push(orgDuplicateImg)

    // update
    orgDuplicateImg.isOrgDuplicate = true

    // Mark the rest as duplicates
    group.forEach(img => {
      if (img === orgDuplicateImg) return

      // update
      img.isDuplicate = true
      img.orgDuplicateImg = orgDuplicateImg

      duplicateImgs.push(img)
    })
  })

  return { uniqueImgs, orgDuplicateImgs, duplicateImgs }
}

function getBestDuplicateImg(group) {
  // Priority: DDS (already optimal) > easy to convert > hard to convert
  const formatPriority = {
    '.dds': 1, // Already DDS, no conversion needed!
    '.tga': 2, // Easy for ImageMagick to convert to DDS
    '.png': 3, // Easy to convert
    '.bmp': 4, // Easy but large
    '.jpg': 5, // Lossy, may have artifacts when converting
    '.jpeg': 6, // Lossy, may have artifacts when converting
  }

  const getPriority = img => formatPriority[img.actualExt] || 99

  // Sort by priority (lower number = higher priority)
  group.sort((a, b) => getPriority(a) - getPriority(b))

  const bestImg = group[0] // First = smallest
  return bestImg
}

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
const { getResizeDimension } = require('./resize')

module.exports = {
  compressImgs,
  detectImgFormat,
  getImageStatus,
}

const MAGICK_EXE_PATH = path.resolve(
  __dirname,
  'ImageMagick-7.1.2-13-portable-Q16-HDRI-x64',
  'magick.exe'
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
  SRC_MEDIA_PATH,
  DEST_MEDIA_PATH,
  CORES_LIMIT,
  IO_LIMIT
) {
  const filePaths = await getAllFilePaths(SRC_MEDIA_PATH)

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
      const outputPath = p.replace(
        SRC_MEDIA_PATH,
        DEST_MEDIA_PATH
      )
      await copyFile(p, outputPath)

      if (SHOW_MORE_LOGS)
        console.log(`\n\n📋 Copied File "${outputPath}"`)
    }
  )

  // init imgs objects details
  const imgs = imgPaths.map(p => ({
    basename: path.basename(p, path.extname(p)),

    // org status
    orgFilename: path.basename(p),
    orgPath: p,
    orgRelPath: path.relative(SRC_MEDIA_PATH, p),
    orgExt: path.extname(p),

    // current status
    filename: path.basename(p),
    path: p,
    relPath: path.relative(SRC_MEDIA_PATH, p),
    ext: path.extname(p),

    // compatibility hack
    // to bypass configs absolute paths misMatching
    // at the end, we MOST rename to org filename
    // ex: huge img.TGA => convert/opt img.png => renamed img.TGA
    finalPath: p.replace(SRC_MEDIA_PATH, DEST_MEDIA_PATH),

    setPath(newPath) {
      const newExt = path.extname(newPath)
      this.filename = path.basename(newPath)
      this.path = newPath
      this.relPath = this.relPath.replace(this.ext, newExt)
      this.ext = newExt

      return this
    },
  }))

  // Flag duplicated imgs
  const { uniqueImgs, duplicateImgs, orgDuplicateImgs } =
    deduplicateImgs(imgs)

  // Flag misFormated imgs
  // Flag Corrupted .dds imgs
  await parallelProccess(
    'Flag misFormat / Corrupt .dds imgs',
    uniqueImgs,
    IO_LIMIT,
    async img => {
      const actualExt = await detectImgFormat(img.orgPath)
      const isMisFormated =
        img.orgExt.toLowerCase() !== actualExt

      // update
      img.isMisFormated = isMisFormated
      img.actualExt = actualExt

      if (actualExt === '.dds')
        img.isCorruptDDS = await detectCurroptDDS(img)
    }
  )

  // Rename misFormated imgs
  // Repair corrupt .dds imgs
  await parallelProccess(
    'Fix misFormat imgs / Corrupt .dds imgs',
    uniqueImgs.filter(
      img => img.isMisFormated || img.isCorruptDDS
    ),
    IO_LIMIT,
    async img => {
      const outPath = img.orgPath
        .replace(SRC_MEDIA_PATH, DEST_MEDIA_PATH)
        .replace(img.orgExt, img.actualExt)

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
    }
  )

  // Collect img status
  await parallelProccess(
    `Collect imgs status`,
    uniqueImgs,
    IO_LIMIT,
    async img => {
      const { size, width, height, dimensions, channels } =
        await getImageStatus(img.path)

      // update
      img.size = size
      img.width = width
      img.height = height
      img.dimensions = dimensions
      img.channels = channels

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
      const outPath = img.orgPath
        .replace(SRC_MEDIA_PATH, DEST_MEDIA_PATH)
        .replace(img.orgExt, '.dds')

      // Create output directory if needed
      const dir = path.dirname(outPath)
      await fs.mkdir(dir, { recursive: true })

      await optAndConvertToDDS(img, outPath)

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
      await fs.unlink(img.path)
      return img
    }
  )

  // Update opted imgs Status
  await parallelProccess(
    'Update opted status',
    optedImgs,
    IO_LIMIT,
    async img => {
      const { size, width, height, dimensions, channels } =
        await getImageStatus(img.path)

      const saved = img.size - size
      const savedPercent = Math.round((saved / img.size) * 100)

      // update
      img.opt = {
        size,
        width,
        height,
        dimensions,
        channels,
        saved,
        savedPercent,
      }

      return img
    },
    (error, img) =>
      console.error(
        `\n\n❌ Failed to get img status "${img.relPath}: ${error?.message}"`
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
      const { size } = await fs.state(img.orgPath)
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

  console.log(
    `\n${'═'.repeat(60)}\n` +
      `⚡ Optimized: ${optedImgs.length} / ${imgs.length} files\n` +
      `📊 Total Size: ${sizeToStr(orgSize)} → ${sizeToStr(
        newSize
      )}\n` +
      `💰 Total Size Saved: ${savedPercent}% ${sizeToStr(
        saved
      )}\n` +
      `${'═'.repeat(60)}\n`
  )
}

async function optAndConvertToDDS(img, outPath) {
  const { canResize, resizeDimension } = getResizeDimension(img)

  const hasAlpha = img.channels.includes('a')
  const compression = hasAlpha ? 'dxt5' : 'dxt1'

  let command = `"${MAGICK_EXE_PATH}" "${img.path}" `

  // Convert to linear RGB for processing
  command += '-colorspace RGB '

  // Resize if needed
  if (canResize)
    command += `-resize "${resizeDimension}x${resizeDimension}>" `

  // Remove alpha if not needed
  if (!hasAlpha) command += '-alpha off '

  // Set DDS compression
  command += `-define dds:compression=${compression} `
  command += '-define dds:mipmaps=4 '
  command += '-define dds:fast-mipmaps=true '

  // Convert back to sRGB (required for gamma correction)
  command += '-colorspace sRGB '

  command += `"${outPath}"`

  await execAsync(command)
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
      '%B|%w|%h|%[channels]',
      inputPath,
    ])

    if (result.stdout) {
      const [size, width, height, channels] = result.stdout
        .trim()
        .split('|')

      return {
        size: parseInt(size),
        width: parseInt(width),
        height: parseInt(height),
        dimensions: `${width}x${height}`,
        channels: channels.toLowerCase(),
      }
    }
  } catch ({ error }) {
    throw new Error(
      `❌ Failed to stat file ${inputPath}:`,
      error?.message
    )
  }
}

function deduplicateImgs(imgs) {
  // First, group by relPath without extension
  const groups = new Map()
  imgs.forEach(img => {
    const key = img.relPath.replace(img.ext, '').toLowerCase()
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

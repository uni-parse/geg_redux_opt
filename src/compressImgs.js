/** process
 * copy/skip unsupported files (as .vtf)
 * rename misFormated / repair corrupt .dds (magick required it)
 * opt/resize/convert everything to .dds (by texconv / magick)
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
} = require('./utilities')
const {
  magickIdentify,
  magickVerbose,
  magickConv,
  texConv,
} = require('./tools')
const { getResizeDimensions } = require('./resize')

module.exports = { compressImgs }

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
  const imgs = imgPaths.map(p => {
    const ext = path.extname(p)
    const basename = path.basename(p, ext)
    const filename = path.basename(p)
    const relPath = path.relative(baseSrcDir, p)
    const relDir = path.dirname(relPath)

    // duplication hack
    const id = `___${crypto?.randomUUID?.() ?? Math.random()}`

    return {
      id,
      basename,
      relDir,

      // org status
      orgFilename: filename,
      orgPath: p,
      orgRelPath: relPath,
      orgExt: ext,

      // current status
      filename,
      path: p,
      relPath,
      ext,

      setPath(newPath) {
        const newFilename = path.basename(newPath)
        this.filename = newFilename
        this.path = newPath
        this.relPath = path.join(this.relDir, newFilename)
        this.ext = path.extname(newPath)

        return this
      },
    }
  })

  // Flag misFormated imgs
  // Flag Corrupted .dds imgs
  const misFormat_or_curroptDDS_imgs = await parallelProccess(
    'Flag misFormat / Corrupt .dds imgs',
    imgs,
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
        img.basename + img.id + img.actualExt
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
    imgs,
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
    imgs,
    CORES_LIMIT,
    async img => {
      const outPath = path.join(
        baseDestDir,
        img.relDir,
        img.basename + img.id + '.dds'
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
        if (SHOW_MORE_LOGS)
          console.warn(
            `\n  Warn: texconv.exe failed ❌, "${img.relPath}"\n` +
              `  fallback to magick.exe ...`
          )

        try {
          await convertToDDS_magick(
            img,
            outPath,
            resizePercent,
            minResize,
            maxResize
          )

          if (SHOW_MORE_LOGS)
            console.log(
              `  magick.exe fallback seccess ✅, "${img.relPath}"`
            )
        } catch (error) {
          if (SHOW_MORE_LOGS)
            console.warn(
              `  Warn: magick.exe failed ❌, "${img.relPath}"\n` +
                `  fallback to copy`
            )
          await copyFile(img.path, outPath)
        }
      }

      // Remove extra temp renamed textures
      // org  actual rename convert results
      // tga => tga => --- => dds : dds only (convert from src)
      // dds => dds => --- => dds : dds only (convert from src)
      // tga => dds => dds => dds : dds only (overwrite dest)
      // tga => png => png => dds : dds + png (❌ remove png)
      if (img.isRenamed && img.actualExt !== '.dds')
        await fs.unlink(img.path) // old renamedPath

      // update
      img.isOpted = true
      img.setPath(outPath)

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
    imgs,
    IO_LIMIT,
    async img => {
      const outPath = path.join(
        baseDestDir,
        img.relDir,
        img.orgFilename
      )

      if (img.isOpted || img.isRenamed || img.isRepairedDDS)
        await fs.rename(img.path, outPath)
      else await copyFile(img.orgPath, outPath) // fallback

      // update
      img.setPath(outPath)

      return img
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
      `⚡ Optimized: ${optedImgs.length} / ${imgs.length} textures\n` +
      `📊 Total Size: ${sizeToStr(orgSize)} → ${sizeToStr(
        newSize
      )}\n` +
      `💰 Total Size Saved: ${savedPercent}% ${sizeToStr(
        saved
      )}\n` +
      `${'═'.repeat(60)}\n`
  )

  return { orgSize, newSize, saved, savedPercent }
}

async function getImageStatus(inputPath) {
  const format = '%B|%w|%h|%[depth]|%[channels]'
  const separator = '|'

  const [size, width, height, depth, channels] =
    await magickIdentify(inputPath, format, separator)

  return {
    size: parseInt(size),
    width: parseInt(width),
    height: parseInt(height),
    dimensions: `${width}x${height}`,
    depth: parseInt(depth),
    hasAlpha: channels.toLowerCase().includes('a'),
  }
}

async function convertToDDS_texconv(
  img,
  outPath,
  resizePercent,
  minResize,
  maxResize
) {
  let flags = ''
  flags += ' --single-proc' // disable multi thread
  flags += ' --file-type dds'
  flags += ' --mip-levels 4'

  if (!img.filename.includes(img.id))
    flags += ` --suffix "${img.id}"`

  const compression = await decideCompression(img)
  flags += ` --format ${compression}`

  const { canResize, newWidth, newHeight } =
    getResizeDimensions(
      img,
      resizePercent,
      minResize,
      maxResize
    )
  if (canResize) {
    flags += ` --width ${newWidth}`
    flags += ` --height ${newHeight}`
  }

  const outDir = path.direname(outPath)
  await texConv(img.path, flags, outDir)
}

async function convertToDDS_magick(
  img,
  outPath,
  resizePercent,
  minResize,
  maxResize
) {
  let flags = ''
  flags += ' -define dds:mipmaps=4'
  flags += ' -define dds:fast-mipmaps=true'
  flags += ' -define dds:weighted=false'

  const compression = await decideCompression(img)
  flags += ` -define dds:compression=${compression}`

  if (img.depth > 8) flags += ' -depth 8'

  const { canResize, newWidth, newHeight } =
    getResizeDimensions(
      img,
      resizePercent,
      minResize,
      maxResize
    )
  if (canResize) flags += ` -resize "${newWidth}x${newHeight}>"`

  await magickConv(img.path, flags, outPath)
}

async function decideCompression(img) {
  if (!img.hasAlpha) return 'dxt1'

  const verbose = await magickVerbose(img.path)
  if (!verbose) return 'dxt5' // fallback

  // Check alpha channel depth
  const depthMatch = verbose.match(/Alpha:\s+(\d+)-bit/)
  if (!depthMatch) return 'dxt1' // No alpha channel

  const alphaDepth = parseInt(depthMatch[1])
  if (alphaDepth === 1) return 'dxt1' // Binary transparency

  // Check if alpha unused
  const minMatch = verbose.match(
    /Alpha:\s+min:\s+\d+\s+\(([\d.]+)\)/
  )
  if (minMatch) {
    const min = parseFloat(minMatch[1])
    const isOpaque = min === 1.0
    if (isOpaque) return 'dxt1'
  }

  return 'dxt5' // Smooth transparency
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

    const hexStr = buf.toString('hex').match(/.{2}/g).join(' ')
    console.warn(
      `\nunknown actual format of "${inputPath}"\n` +
        `first 5 bytes: "${hexStr}" : "${buf.toString()}"\n` +
        `fallback to .tga`
    )
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

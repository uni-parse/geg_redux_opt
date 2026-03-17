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
  magickCreateTransparantDDS,
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
  '.webp',
  // '.vtf', // unsupported, so it can only copy
]

async function compressImgs(
  CORES_LIMIT,
  IO_LIMIT,
  baseSrcDir,
  baseDestDir,
  resizePercent,
  minResizeDimension,
  maxResizeDimension
) {
  const allPaths = await getAllFilePaths(baseSrcDir)
  const texturesPaths = []
  const otherPaths = []
  const texturesExtentions = new Set()
  const otherExtentions = new Set()

  for (const p of allPaths) {
    const ext = path.extname(p).toLowerCase()
    if (EXTENSIONS.includes(ext)) {
      texturesPaths.push(p)
      texturesExtentions.add(ext)
    } else {
      otherPaths.push(p)
      otherExtentions.add(ext)
    }
  }

  console.log(
    `\n📊 Opting Textures: "${baseSrcDir}"\n` +
      `   Total files: ${allPaths.length}\n` +
      `   📷 Textures: ${texturesPaths.length}` +
      ` [${[...texturesExtentions].join(' ')}]\n` +
      `   📄 Other files: ${otherPaths.length}` +
      ` [${[...otherExtentions].join(' ')}]\n`
  )

  // Copy unSupported files
  await parallelProccess(
    'Copy unSupported Files',
    otherPaths,
    IO_LIMIT,
    async p => {
      const relPath = path.relative(baseSrcDir, p)
      const outPath = path.join(baseDestDir, relPath)
      await copyFile(p, outPath)
    }
  )

  // init imgs objects details
  const imgs = texturesPaths.map(p => {
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

  // Rename misFormated textures
  // Repair Corrupted .dds textures
  await parallelProccess(
    'Fix misFormated textures / Corrupted DDS textures',
    imgs,
    IO_LIMIT,
    async img => {
      const actualExt = await detectImgFormat(img.orgPath)
      img.actualExt = actualExt

      const isMisFormated =
        actualExt !== img.orgExt.toLowerCase()
      const isCorruptDDS =
        actualExt === '.dds' && (await detectCurroptDDS(img))
      const needRepair = isMisFormated || isCorruptDDS

      if (needRepair) {
        const filename = `${img.basename}${img.id}${actualExt}`
        const outPath = path.join(
          baseDestDir,
          img.relDir,
          filename
        )
        await copyFile(img.path, outPath)

        if (isMisFormated) img.isRenamed = true

        if (isCorruptDDS) {
          await repairCorruptDDS(outPath)
          img.isRepairedDDS = true
        }

        img.setPath(outPath)
        return img
      }
    }
  )

  // Collect img metadata
  await parallelProccess(
    `Collect textures metadata`,
    imgs,
    CORES_LIMIT,
    async img => {
      const threads = 1 // disable multi threads
      const {
        size,
        width,
        height,
        depth,
        channels,
        hasAlpha,
        transparancy,
      } = await getTextureMetadata(img.path, threads)

      // update
      img.size = size
      img.width = width
      img.height = height
      img.depth = depth
      img.channels = channels
      img.hasAlpha = hasAlpha
      img.transparancy = transparancy

      return img
    }
  )

  // Opt & Convert textures to .dds
  await parallelProccess(
    'Opt & Convert textures to DDS',
    imgs,
    CORES_LIMIT,
    async img => {
      const outPath = path.join(
        baseDestDir,
        img.relDir,
        img.basename + img.id + '.dds'
      )

      const { canResize, newWidth, newHeight } =
        getResizeDimensions(
          img,
          resizePercent,
          minResizeDimension,
          maxResizeDimension
        )

      const texConvToDDS = compression =>
        convertToDDS_texconv(
          img,
          outPath,
          compression,
          canResize,
          newWidth,
          newHeight
        )
      const magickConvToDDS = compression =>
        convertToDDS_magick(
          img,
          outPath,
          compression,
          canResize,
          newWidth,
          newHeight
        )
      const createTransparantDDS = async () => {
        const width = canResize ? newWidth : img.width
        const height = canResize ? newHeight : img.height
        await magickCreateTransparantDDS(outPath, width, height)

        if (SHOW_MORE_LOGS)
          console.log(
            `\ncreated transparent texture: "${path.join(
              img.relDir,
              img.orgFilename
            )}"`
          )
      }

      try {
        if (img.transparancy === 'full')
          await createTransparantDDS()
        else
          try {
            const compression =
              img.transparancy === 'opaque' ||
              img.transparancy === 'binary'
                ? 'dxt1'
                : 'dxt5' // 'smooth'
            await texConvToDDS(compression)
          } catch (error) {
            if (SHOW_MORE_LOGS)
              console.warn(
                `\n  Warn: texconv.exe failed, "${img.relPath}"\n` +
                  `  fallback to magick.exe ...`
              )

            // magick.exe can black/scuff transparancy on dxt1
            const compression =
              img.transparancy === 'opaque' ? 'dxt1' : 'dxt5'
            await magickConvToDDS(compression)
          }
      } catch (error) {
        if (SHOW_MORE_LOGS)
          console.warn(
            `  Warn: magick.exe failed, "${img.relPath}"\n` +
              `  fallback to copy ...`
          )

        if (img.path !== outPath)
          await copyFile(img.path, outPath)
      }

      // Remove extra temp renamed textures
      // org  actual rename convert results
      // tga => tga => --- => dds : dds only (convert from src)
      // dds => dds => --- => dds : dds only (convert from src)
      // tga => dds => dds => dds : dds only (overwrite dest)
      // tga => png => png => dds : dds + png (❌ remove png)
      if (img.isRenamed && img.actualExt !== '.dds')
        await fs.unlink(img.path) // old renamedPath

      const { size } = await fs.stat(outPath)

      // update
      img.isOpted = true
      img.opt = { size }
      img.setPath(outPath)

      return img
    }
  )

  // Compatibility hack
  // Restore original filename
  await parallelProccess(
    'Restore textures org filename (compatibility hack)',
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
  const optSize = imgs.reduce(
    (_, img) => _ + (img.opt?.size ?? img.size),
    0
  )
  const savedSize = orgSize - optSize
  const savedPercent = Math.round((savedSize / orgSize) * 100)

  console.log(
    `\n${'═'.repeat(60)}\n` +
      `⚡ Textures optimization Summary\n` +
      `  "${baseSrcDir}"\n` +
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

async function convertToDDS_texconv(
  img,
  outPath,
  compression,
  canResize,
  newWidth,
  newHeight
) {
  let flags = ''
  flags += ' --single-proc' // disable multi thread
  flags += ` --separate-alpha` // fix black transparancy
  flags += ' --file-type dds'
  flags += ' --mip-levels 4'
  flags += ` --format ${compression}`

  // gamma correction
  if (img.channels.includes('srgb')) flags += ' -srgb'

  if (!img.filename.includes(img.id))
    flags += ` --suffix "${img.id}"`

  if (canResize) {
    flags += ` --width ${newWidth}`
    flags += ` --height ${newHeight}`
  }

  const outDir = path.dirname(outPath)
  await texConv(img.path, flags, outDir)
}

async function convertToDDS_magick(
  img,
  outPath,
  compression,
  canResize,
  newWidth,
  newHeight
) {
  let flags = ''
  flags += ' -limit thread 1' // disable multi thread
  flags += ' -define dds:mipmaps=4'
  flags += ' -define dds:fast-mipmaps=true'
  flags += ' -define dds:weighted=false'
  flags += ` -define dds:compression=${compression}`

  if (img.depth > 8) flags += ' -depth 8'

  if (canResize) flags += ` -resize "${newWidth}x${newHeight}>"`

  await magickConv(img.path, flags, outPath)
}

async function getTextureMetadata(inputPath, threads) {
  const format = '%B|%w|%h|%[depth]|%[channels]'
  const separator = '|'

  const [size, width, height, depth, _channels] =
    await magickIdentify(inputPath, format, separator, threads)

  const channels = _channels.toLowerCase()
  const hasAlpha = channels.includes('a')
  const transparancy = hasAlpha
    ? await checkTransparancy(inputPath, threads)
    : 'opaque'

  return {
    size: parseInt(size),
    width: parseInt(width),
    height: parseInt(height),
    depth: parseInt(depth),
    channels,
    hasAlpha,
    transparancy,
  }
}

async function checkTransparancy(inputPath, threads) {
  const verbose = await magickVerbose(inputPath, threads)
  if (!verbose) return 'smooth' // fallback

  // Check alpha channel depth
  const depthMatch = verbose.match(/Alpha:\s+(\d+)-bit/)
  if (!depthMatch) return 'opaque'

  const alphaDepth = parseInt(depthMatch[1])

  // Check alpha min value to detect semi-transparency
  const minMaxMatch = verbose.match(
    /Alpha:\s+min:\s+\d+\s+\(([\d.]+)\)\s+max:\s+\d+\s+\(([\d.]+)\)/
  )

  if (minMaxMatch) {
    const min = parseFloat(minMaxMatch[1])
    const max = parseFloat(minMaxMatch[2])

    // Opaque, no transparancy
    if (min === 1.0) return 'opaque'

    // Invisible, fully transparant
    if (max === 0.0) return 'full'

    // Binary transparency
    if (alphaDepth === 1 && min === 0.0 && max === 1.0)
      return 'binary'
  }

  return 'smooth'
}

async function detectImgFormat(inputPath) {
  let fileHandler

  try {
    fileHandler = await fs.open(inputPath, 'r')

    const buf = Buffer.alloc(12)
    const { bytesRead } = await fileHandler.read(buf, 0, 12, 0)
    if (bytesRead !== 12) throw new Error('invalid bytesRead')

    if (buf.slice(0, 4).toString() === 'DDS ') return '.dds'
    if (buf.slice(1, 4).toString() === 'PNG') return '.png'
    if (buf.slice(0, 2).toString() === 'BM') return '.bmp'
    if (buf.slice(0, 3).toString() === 'GIF') return '.gif'
    if (buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      return '.jpg'
    if (
      buf.slice(0, 4).toString() === 'RIFF' &&
      buf.slice(8, 12).toString() === 'WEBP'
    )
      return '.webp'

    const isTGA = [0, 1, 2, 3, 9, 10, 11].includes(buf[2])
    if (isTGA) return '.tga'

    const hexStr = buf.toString('hex').match(/.{2}/g).join(' ')
    console.warn(
      `\nunknown actual format of "${inputPath}"\n` +
        `first 12 bytes: "${hexStr}" : "${buf.toString()}"\n` +
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

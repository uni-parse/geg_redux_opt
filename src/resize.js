const path = require('node:path')

// add other textures paths you don't want to resize
const exluded = [
  'MEDIA/SPLASHES/startgame.tga', // Main Menu
]

// need tests to get the right resizes
function getResizeDimensions(
  img,
  resizePercent = 80,
  minResize = 32,
  maxResize = 512
) {
  const {
    size, // number
    width, // number
    height, // number
    basename, // ex "name"
    orgFilename, // ex "name.dds"
    orgPath, // apsolute path, ex "c:/.../media/items/name.dds"
    orgRelPath, // relative path, ex "./media/items/name.dds"
    orgExt, // ex .dds .tga .png .jpg .bmp
  } = img

  const imgDimension = Math.max(width, height)

  const isExluded = exluded.some(p =>
    orgPath
      .toLowerCase()
      .includes(path.normalize(p).toLowerCase())
  )
  const isSmall = imgDimension <= minResize
  const isPreserved =
    resizePercent === 100 && imgDimension <= maxResize

  if (isExluded || isSmall || isPreserved)
    return { canResize: false }

  let newDimension = imgDimension * (resizePercent / 100)
  if (newDimension > maxResize) newDimension = maxResize
  if (newDimension < minResize) newDimension = minResize

  const aspectRatio = width / height
  const isLandscape = width >= height

  const smallDimension = newDimension / aspectRatio
  const newWidth = isLandscape ? newDimension : smallDimension
  const newHeight = !isLandscape ? newDimension : smallDimension

  return {
    canResize: true,
    newWidth: Math.round(newWidth),
    newHeight: Math.round(newHeight),
  }
}

module.exports = { getResizeDimensions }

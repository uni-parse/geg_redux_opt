const path = require('node:path')

// add other names you don't want to resize
const exluded = [
  'startgame.tga', // Main Menu "/MEDIA/SPLASHES/startgame.tga"
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
    filename, // ex "name.dds"
    orgPath, // apsolute path, ex "c:/.../media/items/name.dds"
    orgRelPath, // relative path, ex "./media/items/name.dds"
    orgExt, // ex .dds .tga .png .jpg .bmp
  } = img

  const imgDimension = Math.max(width, height)

  const isExluded = exluded
    .map(p => path.basename(p).toLowerCase())
    .includes(filename.toLowerCase())

  if (
    isExluded ||
    imgDimension <= minResize ||
    (resizePercent === 100 && imgDimension <= maxResize)
  )
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

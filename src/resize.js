const path = require('node:path')

// add other names you don't want to resize
const exluded = [
  'startgame', // Main Menu "/MEDIA/SPLASHES/startgame.tga"
]

// need tests to get the right resizes
function getResizeDimensions(
  img,
  resizePercent = 60,
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
  let newWidth = width
  let newHeight = height
  let canResize = true

  // skip exluded textures
  if (
    exluded
      .map(p => path.basename(p, path.extname(p)).toLowerCase())
      .includes(basename.toLowerCase())
  )
    canResize = false
  // skip small textures
  else if (imgDimension <= minResize) canResize = false
  else {
    let newDimension = imgDimension * (resizePercent / 100)

    if (newDimension > maxResize) newDimension = maxResize
    if (newDimension < minResize) newDimension = minResize

    const aspectRatio = width / height
    const isLandscape = width >= height

    const smallDimension = newDimension / aspectRatio

    newWidth = isLandscape ? newDimension : smallDimension
    newHeight = !isLandscape ? newDimension : smallDimension

    newWidth = Math.round(newWidth)
    newHeight = Math.round(newHeight)
  }

  return { canResize, newWidth, newHeight }
}

module.exports = { getResizeDimensions }

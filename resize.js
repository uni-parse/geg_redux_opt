// this to prevent resizing any img has small max width/heigh
// ex: preserve imgs with 32x32 or 24x12... if MIN_DIMENSION=32
const MIN_DIMENSION = 32

// need tests to get the right resizes
function getResizeDimension(img) {
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
  const maxDimension = Math.max(width, height)
  let resizeDimension = maxDimension
  let canResize = true

  const isMainMenuImg = basename.toLowerCase() === 'startgame'

  if (isMainMenuImg || maxDimension <= MIN_DIMENSION)
    canResize = false
  else if (maxDimension <= 64) resizeDimension = 32
  else if (maxDimension <= 128) resizeDimension = 64
  else if (maxDimension <= 256) resizeDimension = 128
  else if (maxDimension <= 512) resizeDimension = 256
  else resizeDimension = 512

  return { canResize, resizeDimension }
}

module.exports = {
  getResizeDimension,
}

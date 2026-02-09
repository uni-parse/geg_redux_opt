const path = require('node:path')

// adjust as you wish
const minDimension = 32
const maxDimension = 512
const percent = 60

// add other names you don't want to resize
const exluded = [
  'startgame', // Main Menu "/MEDIA/SPLASHES/startgame.tga"
]

// need tests to get the right resizes
function getResize(img) {
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
  let resize = imgDimension
  let canResize = true

  // skip exluded imgs
  if (
    exluded
      .map(p => path.basename(p).toLowerCase())
      .includes(basename.toLowerCase())
  )
    canResize = false
  // skip small imgs
  else if (imgDimension <= minDimension) canResize = false
  // resize/limit large imgs to maxDimension
  else if (imgDimension > maxDimension)
    resize = Math.min(
      maxDimension,
      imgDimension * (percent / 100)
    )
  // resize everything else to percent
  else resize = `${percent}%`

  return { canResize, resize }
}

module.exports = { getResize }

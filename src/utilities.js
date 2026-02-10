const { exec, spawn } = require('child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')

module.exports = {
  parallelProccess,
  showProgressBar,
  getAllFilePaths,
  sizeToStr,
  execAsync,
  spawnAsync,
  checkDir,
  copyFile,
  moveDir,
  removeDir,
}

async function parallelProccess(
  label,
  arr,
  maxWorkers,
  callback,
  onError = null
) {
  const total = arr.length
  if (total === 0) return []

  const timerLabel = `Time`
  console.time(timerLabel)

  console.log(
    `\n>>> ${label} ${'='.repeat(
      Math.max(3, 55 - label.length)
    )}`
  )
  showProgressBar(0, total, '    ')

  const results = []

  // Track progress
  let processed = 0
  let errors = 0

  // Async function to process a single item
  const worker = async (item, index) => {
    let isError = false
    try {
      const result = await callback(item, index, arr)
      if (result) results.push(result)
    } catch (error) {
      errors++
      isError = true

      if (onError) await onError(error, item, index, arr)
      else
        throw new Error(
          `Failed to "${label}": ${error?.message}`
        )
    } finally {
      showProgressBar(++processed, total, '    ', isError)
    }
  }

  // Process with concurrency control
  const workers = new Set()
  for (const [index, item] of arr.entries()) {
    const promise = worker(item, index)
    workers.add(promise)
    promise.finally(() => workers.delete(promise))

    // If we've reached the limit, wait for one to complete
    if (workers.size >= maxWorkers) await Promise.race(workers)
  }

  // Wait for any remaining promises
  await Promise.allSettled(workers)

  // logs
  console.log('\n')
  if (results.length)
    console.log(`Results: ${results.length} / ${arr.length}`)
  if (errors) console.log(`Errors: ${errors} ❌`)
  console.timeEnd(timerLabel)
  console.log(`=== End ${'='.repeat(52)}\n`)

  return results
}

function showProgressBar(
  processed,
  total,
  label = null,
  isError = false
) {
  const barLength = 20
  const percent = Math.round((processed / total) * 100)
  const filled = Math.round((barLength * processed) / total)
  const bar =
    '█'.repeat(filled) + '░'.repeat(barLength - filled)

  const isEnd = processed === total

  // Update progress in place
  process.stdout.write(
    `\r` +
      (label !== null ? label : '') +
      `[${bar}] ${percent}% (${processed}/${total})` +
      (isEnd ? ' ✅' : '') +
      (isError ? ' ❌' : '')
  )
}

async function getAllFilePaths(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(e =>
      e.isDirectory()
        ? getAllFilePaths(path.join(dir, e.name))
        : [path.join(dir, e.name)]
    )
  )
  return nested.flat()
}

async function checkDir(inputPath) {
  try {
    await fs.access(inputPath)
    return true
  } catch (error) {
    return false
  }
}

async function copyFile(src, dest) {
  // Delete if exists
  await fs.unlink(dest).catch(() => {})

  // Create output directory if needed
  const dir = path.dirname(dest)
  await fs.mkdir(dir, { recursive: true })

  await fs.copyFile(src, dest)
}

async function moveDir(src, dest) {
  // Delete if exists
  await fs
    .rm(dest, { recursive: true, force: true })
    .catch(() => {})

  // Create output directory if needed
  const dir = path.dirname(dest)
  await fs.mkdir(dir, { recursive: true })

  await fs.rename(src, dest)
}

async function removeDir(src) {
  await fs
    .rm(src, { recursive: true, force: true })
    .catch(() => {})
}

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject({ error, stderr })
      else resolve({ stdout, stderr })
    })
  })
}

function spawnAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', data => (stdout += data.toString()))
    child.stderr.on('data', data => (stderr += data.toString()))
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr })
      else reject({ code, stderr, stdout })
    })
    child.on('error', error => reject({ error, stderr }))
  })
}

function sizeToStr(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) +
    ' ' +
    sizes[i]
  )
}

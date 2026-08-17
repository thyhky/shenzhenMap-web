// run-wrangler.mjs — Run a wrangler CLI command and finish when its output
// signals completion, killing the zombie process that keeps the shell open
// on Windows even after the actual work has finished.
import { spawn } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 600_000

export function runWrangler(wrangler, wranglerArgs, {
  cwd,
  donePatterns = [],
  failPatterns = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...wranglerArgs], { cwd, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    let done = false
    let lastOutputAt = Date.now()

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stdout += text
      process.stdout.write(text)
      lastOutputAt = Date.now()
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderr += text
      process.stderr.write(text)
      lastOutputAt = Date.now()
    })

    const check = () => {
      if (done) return
      const now = Date.now()
      const output = stdout + stderr
      if (failPatterns.some((pattern) => pattern.test(output))) {
        done = true
        clearInterval(timer)
        killTree(child)
        reject(new Error(`wrangler ${wranglerArgs.join(' ')} reported a failure`))
        return
      }
      if (donePatterns.some((pattern) => pattern.test(output)) && now - lastOutputAt > 3000) {
        done = true
        clearInterval(timer)
        killTree(child)
        resolve()
      }
    }
    const timer = setInterval(check, 1000)

    child.on('exit', (code) => {
      if (done) return
      done = true
      clearInterval(timer)
      resolve()
    })
    child.on('error', (error) => {
      if (done) return
      done = true
      clearInterval(timer)
      reject(error)
    })
    setTimeout(() => {
      if (done) return
      done = true
      clearInterval(timer)
      killTree(child)
      reject(new Error(`wrangler ${wranglerArgs.join(' ')} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs).unref()
  })
}

function killTree(child) {
  try {
    child.kill('SIGKILL')
  } catch {
    /* already gone */
  }
  try {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* not on Windows */
  }
}
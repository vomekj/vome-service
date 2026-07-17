/**
 * 端口检测（供 config 启动前调用）
 * - dev：可杀占用进程后复用
 * - 非 dev：只检测，占用则向后扫描
 *
 * 注意：不可 import vome-core（core 顶层 await loadConfig 会加载本文件，形成环）
 */

const MAX_SCAN = 10

function isDev() {
  return Bun.env.NODE_ENV === 'dev'
}
function spawnQuiet(cmd: string[]): string {
  const result = Bun.spawnSync({
    cmd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) return ''
  return new TextDecoder().decode(result.stdout).trim()
}

function isPortListening(port: number): boolean {
  if (process.platform === 'win32') {
    const out = spawnQuiet(['cmd', '/c', `netstat -ano | findstr :${port}`])
    if (!out) return false
    return out.split('\n').some((line) => /LISTENING/i.test(line))
  }
  const out = spawnQuiet(['lsof', '-i', `:${port}`, '-sTCP:LISTEN'])
  return out.length > 0
}

function killPort(port: number): void {
  try {
    if (process.platform === 'win32') {
      const out = spawnQuiet(['cmd', '/c', `netstat -ano | findstr :${port}`])
      const killed = new Set<string>()
      for (const line of out.split('\n')) {
        const match = line.match(/LISTENING\s+(\d+)/i)
        if (match && !killed.has(match[1])) {
          Bun.spawnSync({
            cmd: ['taskkill', '/PID', match[1], '/F'],
            stderr: 'ignore',
            stdout: 'ignore',
          })
          killed.add(match[1])
          console.warn(`Port ${port} was occupied, killed PID ${match[1]}`)
        }
      }
    } else {
      const out = spawnQuiet(['lsof', '-ti', `:${port}`])
      const pids = [...new Set(out.split('\n').filter(Boolean))]
      if (pids.length > 0) {
        Bun.spawnSync({ cmd: ['kill', '-9', ...pids], stderr: 'ignore', stdout: 'ignore' })
        console.warn(`Port ${port} was occupied, killed PID ${pids.join(', ')}`)
      }
    }
  } catch {
    // ignore
  }
}

/** 返回可用端口；dev 下会先尝试释放 startPort */
export function availablePort(startPort: number): number {
  if (isDev()) {
    killPort(startPort)
  }

  if (!isPortListening(startPort)) {
    return startPort
  }

  for (let port = startPort + 1; port <= startPort + MAX_SCAN; port++) {
    if (!isPortListening(port)) {
      console.warn(`Port ${startPort} still occupied, using port ${port}`)
      return port
    }
  }

  console.warn(
    `No available port in range ${startPort}-${startPort + MAX_SCAN}, fallback to ${startPort}`,
  )
  return startPort
}

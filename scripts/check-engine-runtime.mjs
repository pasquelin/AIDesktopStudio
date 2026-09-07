import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SMOKE = [
  'import onnxruntime',
  'import numpy',
  'from PIL import Image',
  'import socket',
  'import threading',
  'from aidesktopstudio_engine.workers.door import serve_selection',
  'parent, child = socket.socketpair()',
  'parent.settimeout(60)',
  'thread = threading.Thread(target=serve_selection, args=("engine/selection", child.detach()), daemon=True)',
  'thread.start()',
  'hello = parent.recv(4096)',
  'parent.close()',
  'hello.index(b"worker.hello")',
].join('; ')

function pythonOf(runtime, platform) {
  return join(resolve(runtime), 'python', platform === 'win32' ? 'python.exe' : 'bin/python3')
}

function commandOf(python, platform, arch) {
  if (platform !== process.platform) {
    throw new Error(`Cannot execute ${platform}-${arch} from ${process.platform}-${process.arch}`)
  }
  if (platform === 'darwin' && arch === 'x64' && process.arch !== 'x64') {
    return { command: 'arch', args: ['-x86_64', python] }
  }
  if (arch !== process.arch)
    throw new Error(`Cannot execute ${platform}-${arch} from ${process.arch}`)
  return { command: python, args: [] }
}

function packagedRuntime(context) {
  if (context.electronPlatformName !== 'darwin') {
    return join(context.appOutDir, 'resources', 'engine')
  }

  const app = readdirSync(context.appOutDir).find(entry => entry.endsWith('.app'))
  if (!app) throw new Error(`No macOS application exists in ${context.appOutDir}`)
  return join(context.appOutDir, app, 'Contents', 'Resources', 'engine')
}

export function checkEngineRuntime(runtime, platform = process.platform, arch = process.arch) {
  const python = pythonOf(runtime, platform)
  if (!existsSync(python)) throw new Error(`The packaged engine has no interpreter at ${python}`)

  const manifest = JSON.parse(readFileSync(join(runtime, 'runtime-manifest.json'), 'utf8'))
  if (!Array.isArray(manifest.profiles) || !manifest.profiles.includes('autorig')) {
    throw new Error('The packaged engine is missing the Auto Rig profile')
  }
  if (!manifest.profiles.includes('selection')) {
    throw new Error('The packaged engine is missing the selection profile')
  }

  const { command, args } = commandOf(python, platform, arch)
  execFileSync(command, [...args, '-c', SMOKE], {
    cwd: runtime,
    encoding: 'utf8',
    // What `settimeout` above cannot bound: a hang at import or in the model's constructor. The
    // pack hook this runs from would otherwise hold the build until the job timed out.
    timeout: 180_000,
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONPATH: join(resolve(runtime), 'src'),
    },
    stdio: 'inherit',
  })
}

export function packagedEngineOf(context) {
  return packagedRuntime(context)
}

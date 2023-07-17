// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

/**
 * Access the file system.
 *
 * This package is also accessible with `window.__TAURI__.fs` when [`build.withGlobalTauri`](https://tauri.app/v1/api/config/#buildconfig.withglobaltauri) in `tauri.conf.json` is set to `true`.
 *
 * The APIs must be added to [`tauri.allowlist.fs`](https://tauri.app/v1/api/config/#allowlistconfig.fs) in `tauri.conf.json`:
 * ```json
 * {
 *   "tauri": {
 *     "allowlist": {
 *       "fs": {
 *         "all": true, // enable all FS APIs
 *         "readFile": true,
 *         "writeFile": true,
 *         "readFileStream": true,
 *         "writeFileStream": true,
 *         "readDir": true,
 *         "copyFile": true,
 *         "createDir": true,
 *         "removeDir": true,
 *         "removeFile": true,
 *         "renameFile": true,
 *         "exists": true
 *       }
 *     }
 *   }
 * }
 * ```
 * It is recommended to allowlist only the APIs you use for optimal bundle size and security.
 *
 * ## Security
 *
 * This module prevents path traversal, not allowing absolute paths or parent dir components
 * (i.e. "/usr/path/to/file" or "../path/to/file" paths are not allowed).
 * Paths accessed with this API must be relative to one of the {@link BaseDirectory | base directories}
 * so if you need access to arbitrary filesystem paths, you must write such logic on the core layer instead.
 *
 * The API has a scope configuration that forces you to restrict the paths that can be accessed using glob patterns.
 *
 * The scope configuration is an array of glob patterns describing folder paths that are allowed.
 * For instance, this scope configuration only allows accessing files on the
 * *databases* folder of the {@link path.appDataDir | $APPDATA directory}:
 * ```json
 * {
 *   "tauri": {
 *     "allowlist": {
 *       "fs": {
 *         "scope": ["$APPDATA/databases/*"]
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * Notice the use of the `$APPDATA` variable. The value is injected at runtime, resolving to the {@link path.appDataDir | app data directory}.
 * The available variables are:
 * {@link path.appConfigDir | `$APPCONFIG`}, {@link path.appDataDir | `$APPDATA`}, {@link path.appLocalDataDir | `$APPLOCALDATA`},
 * {@link path.appCacheDir | `$APPCACHE`}, {@link path.appLogDir | `$APPLOG`},
 * {@link path.audioDir | `$AUDIO`}, {@link path.cacheDir | `$CACHE`}, {@link path.configDir | `$CONFIG`}, {@link path.dataDir | `$DATA`},
 * {@link path.localDataDir | `$LOCALDATA`}, {@link path.desktopDir | `$DESKTOP`}, {@link path.documentDir | `$DOCUMENT`},
 * {@link path.downloadDir | `$DOWNLOAD`}, {@link path.executableDir | `$EXE`}, {@link path.fontDir | `$FONT`}, {@link path.homeDir | `$HOME`},
 * {@link path.pictureDir | `$PICTURE`}, {@link path.publicDir | `$PUBLIC`}, {@link path.runtimeDir | `$RUNTIME`},
 * {@link path.templateDir | `$TEMPLATE`}, {@link path.videoDir | `$VIDEO`}, {@link path.resourceDir | `$RESOURCE`}, {@link path.appDir | `$APP`},
 * {@link path.logDir | `$LOG`}, {@link os.tempdir | `$TEMP`}.
 *
 * Trying to execute any API with a URL not configured on the scope results in a promise rejection due to denied access.
 *
 * Note that this scope applies to **all** APIs on this module.
 *
 * @module
 */

import { invokeTauriCommand } from './helpers/tauri'
import { transformCallback } from './tauri'

/**
 * @since 1.0.0
 */
export enum BaseDirectory {
  Audio = 1,
  Cache,
  Config,
  Data,
  LocalData,
  Desktop,
  Document,
  Download,
  Executable,
  Font,
  Home,
  Picture,
  Public,
  Runtime,
  Template,
  Video,
  Resource,
  App,
  Log,
  Temp,
  AppConfig,
  AppData,
  AppLocalData,
  AppCache,
  AppLog
}

/**
 * @since 1.0.0
 */
interface FsOptions {
  dir?: BaseDirectory
  // note that adding fields here needs a change in the writeBinaryFile check
}

/**
 * @since 1.0.0
 */
interface FsDirOptions {
  dir?: BaseDirectory
  recursive?: boolean
}

/**
 * Options object used to write a UTF-8 string to a file.
 *
 * @since 1.0.0
 */
interface FsTextFileOption {
  /** Path to the file to write. */
  path: string
  /** The UTF-8 string to write to the file. */
  contents: string
}

type BinaryFileContents = Iterable<number> | ArrayLike<number> | ArrayBuffer

/**
 * Options object used to write a binary data to a file.
 *
 * @since 1.0.0
 */
interface FsBinaryFileOption {
  /** Path to the file to write. */
  path: string
  /** The byte array contents. */
  contents: BinaryFileContents
}

/**
 * @since 1.0.0
 */
interface FileEntry {
  path: string
  /**
   * Name of the directory/file
   * can be null if the path terminates with `..`
   */
  name?: string
  /** Children of this entry if it's a directory; null otherwise */
  children?: FileEntry[]
}

/**
 * Reads a file as an UTF-8 encoded string.
 * @example
 * ```typescript
 * import { readTextFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Read the text file in the `$APPCONFIG/app.conf` path
 * const contents = await readTextFile('app.conf', { dir: BaseDirectory.AppConfig });
 * ```
 *
 * @since 1.0.0
 */
async function readTextFile(
  filePath: string,
  options: FsOptions = {}
): Promise<string> {
  return invokeTauriCommand<string>({
    __tauriModule: 'Fs',
    message: {
      cmd: 'readTextFile',
      path: filePath,
      options
    }
  })
}

/**
 * Reads a file as byte array.
 * @example
 * ```typescript
 * import { readBinaryFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Read the image file in the `$RESOURCEDIR/avatar.png` path
 * const contents = await readBinaryFile('avatar.png', { dir: BaseDirectory.Resource });
 * ```
 *
 * @since 1.0.0
 */
async function readBinaryFile(
  filePath: string,
  options: FsOptions = {}
): Promise<Uint8Array> {
  const arr = await invokeTauriCommand<number[]>({
    __tauriModule: 'Fs',
    message: {
      cmd: 'readFile',
      path: filePath,
      options
    }
  })

  return Uint8Array.from(arr)
}

abstract class FileStream {
  readonly filepath: string
  protected fd: number = -1
  protected closed: boolean = true
  readonly options: FsOptions = {}

  constructor(filepath: string, options: FsOptions = {}) {
    this.filepath = filepath
    this.options = options
  }

  protected abstract _tauriOpenCommand: string
  protected abstract _tauriCloseCommand: string

  async open(): Promise<FileStream> {
    if (!this.closed) {
      throw new Error('open called on already opened file stream')
    }
    const fd = await invokeTauriCommand<number>({
      __tauriModule: 'Fs',
      message: {
        cmd: this._tauriOpenCommand,
        path: this.filepath,
        options: this.options
      }
    })
    this.fd = fd
    this.closed = false
    return this
  }

  async close(): Promise<void> {
    if (this.closed) {
      throw new Error('close called on already closed file stream')
    }
    await invokeTauriCommand({
      __tauriModule: 'Fs',
      message: {
        cmd: this._tauriCloseCommand,
        fd: this.fd
      }
    })
    this.fd = -1
    this.closed = true
  }
}

class ReadFileStream extends FileStream {
  protected readonly _tauriOpenCommand: string = 'openReadFileStream'
  protected readonly _tauriCloseCommand: string = 'closeReadFileStream'

  public get stream(): ReadableStream<Uint8Array> {
    const _start = async (): Promise<FileStream> => {
      return this.open()
    }
    const _pull = async (
      controller: ReadableStreamDefaultController
    ): Promise<void> => {
      return this.read((data) => {
        controller.enqueue(data)
      })
    }
    const _cancel = async (reason: string): Promise<void> => this.close()
    return new ReadableStream({
      async start(controller) {
        await _start()
        await _pull(controller)
      },
      async pull(controller) {
        await _pull(controller)
      },
      async cancel(reason: string) {
        await _cancel(reason)
      }
    })
  }

  /**
   * Reads `data` from the file stream.
   *
   * @param onData A function to process data read from the file stream.
   * @example
   * ```typescript
   * import { FileStream } from '@tauri-apps/api/fs';
   * const stream = new FileStream('node');
   * await stream.open();
   * await stream.read(data => console.log(`read ${data}`));
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async read(onData: (data: Uint8Array) => void): Promise<void> {
    if (this.closed) {
      throw new Error(`read called on closed file stream`)
    }
    return invokeTauriCommand({
      __tauriModule: 'Fs',
      message: {
        cmd: 'readFileStream',
        fd: this.fd,
        onDataFn: transformCallback(onData)
      }
    })
  }
}

class WriteFileStream extends FileStream {
  protected readonly _tauriOpenCommand: string = 'openWriteFileStream'
  protected readonly _tauriCloseCommand: string = 'closeWriteFileStream'

  public get stream(): WritableStream<string | Uint8Array> {
    const _start = async (): Promise<FileStream> => this.open()
    const _write = async (
      chunk: string | Uint8Array,
      controller: WritableStreamDefaultController
    ): Promise<void> => this.write(chunk)
    const _close = async (): Promise<void> => this.close()
    return new WritableStream({
      async start(controller) {
        await _start()
      },
      async write(chunk, controller) {
        await _write(chunk, controller)
      },
      async close() {
        await _close()
      },
      async abort(reason: string) {
        await _close()
      }
    })
  }

  /**
   * Writes `data` to the file stream.
   *
   * @param data The message to write, either a string or a byte array.
   * @example
   * ```typescript
   * import { FileStream } from '@tauri-apps/api/fs';
   * const stream = new FileStream('node');
   * await stream.open();
   * await stream.write('message');
   * await stream.write([0, 1, 2, 3, 4, 5]);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async write(data: string | Uint8Array): Promise<void> {
    if (this.closed) {
      throw new Error(`write called on closed file stream`)
    }
    return invokeTauriCommand({
      __tauriModule: 'Fs',
      message: {
        cmd: 'writeFileStream',
        fd: this.fd,
        // correctly serialize Uint8Arrays
        buffer: typeof data === 'string' ? data : Array.from(data)
      }
    })
  }
}

/**
 * Writes a UTF-8 text file.
 * @example
 * ```typescript
 * import { writeTextFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Write a text file to the `$APPCONFIG/app.conf` path
 * await writeTextFile('app.conf', 'file contents', { dir: BaseDirectory.AppConfig });
 * ```
 *
 * @since 1.0.0
 */
async function writeTextFile(
  path: string,
  contents: string,
  options?: FsOptions
): Promise<void>

/**
 * Writes a UTF-8 text file.
 * @example
 * ```typescript
 * import { writeTextFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Write a text file to the `$APPCONFIG/app.conf` path
 * await writeTextFile({ path: 'app.conf', contents: 'file contents' }, { dir: BaseDirectory.AppConfig });
 * ```
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function writeTextFile(
  file: FsTextFileOption,
  options?: FsOptions
): Promise<void>

/**
 * Writes a UTF-8 text file.
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function writeTextFile(
  path: string | FsTextFileOption,
  contents?: string | FsOptions,
  options?: FsOptions
): Promise<void> {
  if (typeof options === 'object') {
    Object.freeze(options)
  }
  if (typeof path === 'object') {
    Object.freeze(path)
  }

  const file: FsTextFileOption = { path: '', contents: '' }
  let fileOptions: FsOptions | undefined = options
  if (typeof path === 'string') {
    file.path = path
  } else {
    file.path = path.path
    file.contents = path.contents
  }

  if (typeof contents === 'string') {
    file.contents = contents ?? ''
  } else {
    fileOptions = contents
  }

  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'writeFile',
      path: file.path,
      contents: Array.from(new TextEncoder().encode(file.contents)),
      options: fileOptions
    }
  })
}

/**
 * Writes a byte array content to a file.
 * @example
 * ```typescript
 * import { writeBinaryFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Write a binary file to the `$APPDATA/avatar.png` path
 * await writeBinaryFile('avatar.png', new Uint8Array([]), { dir: BaseDirectory.AppData });
 * ```
 *
 * @param options Configuration object.
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function writeBinaryFile(
  path: string,
  contents: BinaryFileContents,
  options?: FsOptions
): Promise<void>

/**
 * Writes a byte array content to a file.
 * @example
 * ```typescript
 * import { writeBinaryFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Write a binary file to the `$APPDATA/avatar.png` path
 * await writeBinaryFile({ path: 'avatar.png', contents: new Uint8Array([]) }, { dir: BaseDirectory.AppData });
 * ```
 *
 * @param file The object containing the file path and contents.
 * @param options Configuration object.
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function writeBinaryFile(
  file: FsBinaryFileOption,
  options?: FsOptions
): Promise<void>

/**
 * Writes a byte array content to a file.
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function writeBinaryFile(
  path: string | FsBinaryFileOption,
  contents?: BinaryFileContents | FsOptions,
  options?: FsOptions
): Promise<void> {
  if (typeof options === 'object') {
    Object.freeze(options)
  }
  if (typeof path === 'object') {
    Object.freeze(path)
  }

  const file: FsBinaryFileOption = { path: '', contents: [] }
  let fileOptions: FsOptions | undefined = options
  if (typeof path === 'string') {
    file.path = path
  } else {
    file.path = path.path
    file.contents = path.contents
  }

  if (contents && 'dir' in contents) {
    fileOptions = contents
  } else if (typeof path === 'string') {
    // @ts-expect-error in this case `contents` is always a BinaryFileContents
    file.contents = contents ?? []
  }

  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'writeFile',
      path: file.path,
      contents: Array.from(
        file.contents instanceof ArrayBuffer
          ? new Uint8Array(file.contents)
          : file.contents
      ),
      options: fileOptions
    }
  })
}

/**
 * List directory files.
 * @example
 * ```typescript
 * import { readDir, BaseDirectory } from '@tauri-apps/api/fs';
 * // Reads the `$APPDATA/users` directory recursively
 * const entries = await readDir('users', { dir: BaseDirectory.AppData, recursive: true });
 *
 * function processEntries(entries) {
 *   for (const entry of entries) {
 *     console.log(`Entry: ${entry.path}`);
 *     if (entry.children) {
 *       processEntries(entry.children)
 *     }
 *   }
 * }
 * ```
 *
 * @since 1.0.0
 */
async function readDir(
  dir: string,
  options: FsDirOptions = {}
): Promise<FileEntry[]> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'readDir',
      path: dir,
      options
    }
  })
}

/**
 * Creates a directory.
 * If one of the path's parent components doesn't exist
 * and the `recursive` option isn't set to true, the promise will be rejected.
 * @example
 * ```typescript
 * import { createDir, BaseDirectory } from '@tauri-apps/api/fs';
 * // Create the `$APPDATA/users` directory
 * await createDir('users', { dir: BaseDirectory.AppData, recursive: true });
 * ```
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function createDir(
  dir: string,
  options: FsDirOptions = {}
): Promise<void> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'createDir',
      path: dir,
      options
    }
  })
}

/**
 * Removes a directory.
 * If the directory is not empty and the `recursive` option isn't set to true, the promise will be rejected.
 * @example
 * ```typescript
 * import { removeDir, BaseDirectory } from '@tauri-apps/api/fs';
 * // Remove the directory `$APPDATA/users`
 * await removeDir('users', { dir: BaseDirectory.AppData });
 * ```
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function removeDir(
  dir: string,
  options: FsDirOptions = {}
): Promise<void> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'removeDir',
      path: dir,
      options
    }
  })
}

/**
 * Copies a file to a destination.
 * @example
 * ```typescript
 * import { copyFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Copy the `$APPCONFIG/app.conf` file to `$APPCONFIG/app.conf.bk`
 * await copyFile('app.conf', 'app.conf.bk', { dir: BaseDirectory.AppConfig });
 * ```
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function copyFile(
  source: string,
  destination: string,
  options: FsOptions = {}
): Promise<void> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'copyFile',
      source,
      destination,
      options
    }
  })
}

/**
 * Removes a file.
 * @example
 * ```typescript
 * import { removeFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Remove the `$APPConfig/app.conf` file
 * await removeFile('app.conf', { dir: BaseDirectory.AppConfig });
 * ```
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function removeFile(
  file: string,
  options: FsOptions = {}
): Promise<void> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'removeFile',
      path: file,
      options
    }
  })
}

/**
 * Renames a file.
 * @example
 * ```typescript
 * import { renameFile, BaseDirectory } from '@tauri-apps/api/fs';
 * // Rename the `$APPDATA/avatar.png` file
 * await renameFile('avatar.png', 'deleted.png', { dir: BaseDirectory.AppData });
 * ```
 *
 * @returns A promise indicating the success or failure of the operation.
 *
 * @since 1.0.0
 */
async function renameFile(
  oldPath: string,
  newPath: string,
  options: FsOptions = {}
): Promise<void> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'renameFile',
      oldPath,
      newPath,
      options
    }
  })
}

/**
 * Check if a path exists.
 * @example
 * ```typescript
 * import { exists, BaseDirectory } from '@tauri-apps/api/fs';
 * // Check if the `$APPDATA/avatar.png` file exists
 * await exists('avatar.png', { dir: BaseDirectory.AppData });
 * ```
 *
 * @since 1.1.0
 */
async function exists(path: string, options: FsOptions = {}): Promise<boolean> {
  return invokeTauriCommand({
    __tauriModule: 'Fs',
    message: {
      cmd: 'exists',
      path,
      options
    }
  })
}

export type {
  FsOptions,
  FsDirOptions,
  FsTextFileOption,
  BinaryFileContents,
  FsBinaryFileOption,
  FileEntry
}

export {
  BaseDirectory as Dir,
  FileStream,
  ReadFileStream,
  WriteFileStream,
  readTextFile,
  readBinaryFile,
  writeTextFile,
  writeTextFile as writeFile,
  writeBinaryFile,
  readDir,
  createDir,
  removeDir,
  copyFile,
  removeFile,
  renameFile,
  exists
}

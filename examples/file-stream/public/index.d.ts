

interface BaseDirectory {
  Data: number
  Temp: number
}

interface FsOptions {
  dir: BaseDirectory
}

interface FileStream {
  new(filepath: string, options: FsOptions)
  filepath: string
  fd: number
  closed: boolean
  close: () => Promise<void>
}

interface ReadFileStream extends FileStream {
  stream: ReadableStream<Uint8Array>
  open: () => Promise<ReadFileStream>
  read: (onData: (data: Uint8Array) => void) => Promise<void>
}

interface WriteFileStream extends FileStream {
  stream: WritableStream<Uint8Array>
  open: () => Promise<WriteFileStream>
  write: (data: string | Uint8Array) => Promise<void>
}

interface FSModule {
  ReadFileStream: ReadFileStream
  WriteFileStream: WriteFileStream
  BaseDirectory: BaseDirectory
}

declare interface Window {
  __TAURI__: {
    fs: FSModule;
  }
}

interface ReadFileStreamStore {
  fileStream: ReadFileStream?
}

interface WriteFileStreamStore {
  fileStream: WriteFileStream?
}

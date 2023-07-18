// @ts-check
/// <reference path="./index.d.ts"/>

const { ReadFileStream, WriteFileStream, BaseDirectory } = window.__TAURI__.fs

/** @type {HTMLSelectElement} */
// @ts-ignore
const baseDirectorySelect = document.querySelector('#base-directory-select')

/** @type {HTMLInputElement} */
// @ts-ignore
const maxReadRowsInput = document.querySelector('#max-read-rows-input')

/**
 * @template {ReadFileStream|WriteFileStream} FStream
 * @param {FStream} cls
 * @param {HTMLInputElement} filepathInput
 * @param {HTMLDivElement} resultElement
 * @returns {Promise<FStream>}
 */
async function openStream(cls, filepathInput, resultElement) {
  const filestream = new cls(filepathInput.value, {
    dir: BaseDirectory[baseDirectorySelect.value]
  })
  resultElement.innerText = ''
  try {
    await filestream.open()
    resultElement.innerText = 'Opened successfully'
  } catch (error) {
    resultElement.innerText = `${error}`
  }
  return filestream
}

/**
 * @template {ReadFileStream|WriteFileStream} FStream
 * @param {FStream?} filestream
 * @param {HTMLInputElement} filepathInput
 * @param {HTMLDivElement} resultElement
 */
async function closeStream(filestream, filepathInput, resultElement) {
  if (!filestream) {
    return
  }
  resultElement.innerText = ''
  try {
    await filestream.close()
    resultElement.innerText = 'Closed successfully'
  } catch (error) {
    resultElement.innerText = `${error}`
  }
  return filestream
}

/**
 * @param {WriteFileStreamStore} writeFileStreamStore
 * @param {HTMLInputElement} writeInput
 * @param {HTMLDivElement} writeResult
 */
async function writeToStream(writeFileStreamStore, writeInput, writeResult) {
  const writeFileStream = writeFileStreamStore.fileStream
  writeResult.innerText = ''
  if (!writeFileStream) {
    writeResult.innerText = 'Filestream is not open!'
    return
  }
  try {
    await writeFileStream.write(writeInput.value)
    writeResult.innerText = 'Success'
    writeInput.value = ''
  } catch (error) {
    writeResult.innerText = `${error}`
  }
}

/**
 * @param {HTMLDivElement} container
 * @param {string} text
 */
function cyclicAddElement(container, text) {
  while (container.children.length >= Number(maxReadRowsInput.value)) {
    // @ts-ignore
    container.removeChild(container.firstChild)
  }
  const textElement = document.createElement('p')
  textElement.innerText = text
  container.appendChild(textElement)
}

/**
 * @param {ReadFileStreamStore} readFileStreamStore
 * @param {HTMLDivElement} readResult
 */
async function readFromStream(readFileStreamStore, readResult) {
  const readFileStream = readFileStreamStore.fileStream
  if (!readFileStream) {
    readResult.innerText = 'Filestream is not open!'
    return
  }
  try {
    await readFileStream.read((data) => {
      cyclicAddElement(readResult, String.fromCharCode.apply(String, data))
    })
  } catch (error) {
    cyclicAddElement(readResult, `${error}`)
  }
}

/**
 * @param {HTMLDivElement} readResult
 */
function clearReadContent(readResult) {
  while (readResult.firstChild) {
    readResult.removeChild(readResult.firstChild)
  }
}

{
  const allowedBaseDirectories = [BaseDirectory.Data, BaseDirectory.Temp]

  let isFirstOption = true
  for (const baseDirId of allowedBaseDirectories) {
    const option = document.createElement('option')
    option.label = BaseDirectory[baseDirId]
    option.value = BaseDirectory[baseDirId]
    if (isFirstOption) {
      option.selected = true
      isFirstOption = false
    }
    baseDirectorySelect.appendChild(option)
  }
}

/**
 * @param {() => Promise<void>} asyncCallback
 * @param {('Shift'|'Control'|'Alt')[]} modifiers
 */
const asyncCallbackOnEnter = (asyncCallback, modifiers = []) => {
  /**
   * @type {('Shift'|'Control'|'Alt')[]}
   */
  const MODIFIERS = ['Shift', 'Control', 'Alt']
  /** @type {(evt: KeyboardEvent) => Promise<void>} */
  return async (evt) => {
    if (evt.key === 'Enter') {
      if (
        !MODIFIERS.every(
          (value) =>
            evt.getModifierState(value) === (modifiers.indexOf(value) !== -1)
        )
      ) {
        return
      }
      await asyncCallback()
    }
  }
}

{
  /** @type {HTMLInputElement} */
  // @ts-ignore
  const writeFilepathInput = document.querySelector('#write-filepath-input')
  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const writeOpenButton = document.querySelector('#write-filepath-open')
  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const writeCloseButton = document.querySelector('#write-filepath-close')
  /** @type {HTMLDivElement} */
  // @ts-ignore
  const writeOpenResult = document.querySelector('#write-filepath-open-result')

  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const writeButton = document.querySelector('#write-content')
  /** @type {HTMLInputElement} */
  // @ts-ignore
  const writeInput = document.querySelector('#write-content-input')
  /** @type {HTMLDivElement} */
  // @ts-ignore
  const writeResult = document.querySelector('#write-content-result')

  /** @type {WriteFileStreamStore} */
  let writeFileStreamStore = {
    fileStream: null
  }

  const openWriteStream = async () => {
    if (
      writeFileStreamStore.fileStream &&
      !writeFileStreamStore.fileStream.closed
    ) {
      await writeFileStreamStore.fileStream.close()
    }
    writeFileStreamStore.fileStream = await openStream(
      WriteFileStream,
      writeFilepathInput,
      writeOpenResult
    )
  }
  writeFilepathInput.addEventListener(
    'keyup',
    asyncCallbackOnEnter(openWriteStream)
  )
  writeOpenButton.addEventListener('click', openWriteStream)
  writeCloseButton.addEventListener(
    'click',
    async () =>
      await closeStream(
        writeFileStreamStore.fileStream,
        writeFilepathInput,
        writeOpenResult
      )
  )

  const _writeToStream = async () =>
    await writeToStream(writeFileStreamStore, writeInput, writeResult)
  writeInput.addEventListener('keyup', asyncCallbackOnEnter(_writeToStream))
  writeButton.addEventListener('click', _writeToStream)
}

/**
 * @param {ReadableStream<Uint8Array>} stream
 */
async function* streamAsyncIterable(stream) {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        return
      }
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

{
  /** @type {HTMLInputElement} */
  // @ts-ignore
  const readFilepathInput = document.querySelector('#read-filepath-input')
  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const readOpenButton = document.querySelector('#read-filepath-open')
  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const readCloseButton = document.querySelector('#read-filepath-close')
  /** @type {HTMLDivElement} */
  // @ts-ignore
  const readOpenResult = document.querySelector('#read-filepath-open-result')

  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const readButton = document.querySelector('#read-content')
  /** @type {HTMLButtonElement} */
  // @ts-ignore
  const clearReadButton = document.querySelector('#clear-read-content')
  /** @type {HTMLDivElement} */
  // @ts-ignore
  const readResult = document.querySelector('#read-content-result')

  /** @type {ReadFileStreamStore} */
  let readFileStreamStore = {
    fileStream: null
  }

  const openReadStream = async () => {
    if (
      readFileStreamStore.fileStream &&
      !readFileStreamStore.fileStream.closed
    ) {
      await readFileStreamStore.fileStream.close()
    }
    readFileStreamStore.fileStream = await openStream(
      ReadFileStream,
      readFilepathInput,
      readOpenResult
    )
  }
  readFilepathInput.addEventListener(
    'keyup',
    asyncCallbackOnEnter(openReadStream)
  )
  readOpenButton.addEventListener('click', openReadStream)
  readCloseButton.addEventListener(
    'click',
    async () =>
      await closeStream(
        readFileStreamStore.fileStream,
        readFilepathInput,
        readOpenResult
      )
  )

  readButton.addEventListener('click', () =>
    readFromStream(readFileStreamStore, readResult)
  )
  clearReadButton.addEventListener('click', () => clearReadContent(readResult))

  // alternative implementation to openReadStream using for await
  // with this, using readButton to call readFromStream is no longer needed
  // const openReadStreamIterable = async () => {
  //   if (readFileStreamStore.fileStream && !readFileStreamStore.fileStream.closed) {
  //     await readFileStreamStore.fileStream.close()
  //   }
  //   // readFileStreamStore.fileStream = await openStream(ReadFileStream, readFilepathInput, readOpenResult)
  //   readFileStreamStore.fileStream = new ReadFileStream(readFilepathInput.value, {dir: BaseDirectory[baseDirectorySelect.value]})
  //   readOpenResult.innerText = ''
  //   if (!readFileStreamStore.fileStream) {
  //     return
  //   }
  //   try {
  //     let statused = false
  //     for await (const data of streamAsyncIterable(readFileStreamStore.fileStream.stream)) {
  //       if (!statused) {
  //         readOpenResult.innerText = 'Opened successfully'
  //         statused = true
  //       }
  //       cyclicAddElement(readResult, String.fromCharCode.apply(String, data))
  //     }
  //   } catch (error) {
  //     readOpenResult.innerText = `${error}`
  //   }
  // }
}

// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

#![allow(unused_imports)]

use crate::{
  api::{
    dir,
    file::{self, SafePathBuf},
    ipc::CallbackFn,
    path::BaseDirectory,
  },
  event,
  scope::Scopes,
  Config, Env, Manager, PackageInfo, Runtime, Window,
};

use super::InvokeContext;
#[allow(unused_imports)]
use anyhow::Context;
use serde::{
  de::{Deserializer, Error as DeError},
  Deserialize, Serialize,
};
use tauri_macros::{command_enum, module_command_handler, CommandModule};

use std::fmt::{Debug, Formatter};
use std::{
  fs,
  fs::File,
  fs::OpenOptions,
  io::Write,
  os,
  os::fd::AsRawFd,
  path::{Component, Path},
  sync::{Arc, Mutex},
};
use tokio::{
  fs::File as TokioFile,
  io::{self, AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufStream},
  sync::Mutex as TokioMutex,
};

use std::collections::HashMap;

type FileStreamFd = os::fd::RawFd;
type FileStreamStore = Arc<Mutex<HashMap<FileStreamFd, Arc<TokioMutex<BufStream<TokioFile>>>>>>;

fn file_stream_store() -> &'static FileStreamStore {
  use once_cell::sync::Lazy;
  static STORE: Lazy<FileStreamStore> = Lazy::new(Default::default);
  &STORE
}

/// The options for the directory functions on the file system API.
#[derive(Debug, Clone, Deserialize)]
pub struct DirOperationOptions {
  /// Whether the API should recursively perform the operation on the directory.
  #[serde(default)]
  pub recursive: bool,
  /// The base directory of the operation.
  /// The directory path of the BaseDirectory will be the prefix of the defined directory path.
  pub dir: Option<BaseDirectory>,
}

/// The options for the file functions on the file system API.
#[derive(Debug, Clone, Deserialize)]
pub struct FileOperationOptions {
  /// The base directory of the operation.
  /// The directory path of the BaseDirectory will be the prefix of the defined file path.
  pub dir: Option<BaseDirectory>,
}

// FIXME: Buffer enum is copied from shell.rs, share?
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Buffer {
  Text(String),
  Raw(Vec<u8>),
}

/// The API descriptor.
#[command_enum]
#[derive(Deserialize, CommandModule)]
#[serde(tag = "cmd", rename_all = "camelCase")]
pub(crate) enum Cmd {
  /// The read binary file API.
  #[cmd(fs_read_file, "fs > readFile")]
  ReadFile {
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The read binary file API.
  #[cmd(fs_read_file, "fs > readFile")]
  ReadTextFile {
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The write file API.
  #[cmd(fs_write_file, "fs > writeFile")]
  WriteFile {
    path: SafePathBuf,
    contents: Vec<u8>,
    options: Option<FileOperationOptions>,
  },
  /// The open read file stream API.
  #[cmd(fs_read_file_stream, "fs > openReadFileStream")]
  OpenReadFileStream {
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The read file stream API.
  #[cmd(fs_read_file_stream, "fs > readFileStream")]
  #[serde(rename_all = "camelCase")]
  ReadFileStream {
    fd: FileStreamFd,
    on_data_fn: CallbackFn,
  },
  /// The open write file stream API.
  #[cmd(fs_write_file_stream, "fs > openWriteFileStream")]
  OpenWriteFileStream {
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The write file stream API.
  #[cmd(fs_write_file_stream, "fs > writeFileStream")]
  WriteFileStream { fd: FileStreamFd, buffer: Buffer },
  /// The close file stream API.
  #[cmd(fs_write_file_stream, "fs > closeFileStream")]
  CloseFileStream { fd: FileStreamFd },
  /// The read dir API.
  #[cmd(fs_read_dir, "fs > readDir")]
  ReadDir {
    path: SafePathBuf,
    options: Option<DirOperationOptions>,
  },
  /// The copy file API.
  #[cmd(fs_copy_file, "fs > copyFile")]
  CopyFile {
    source: SafePathBuf,
    destination: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The create dir API.
  #[cmd(fs_create_dir, "fs > createDir")]
  CreateDir {
    path: SafePathBuf,
    options: Option<DirOperationOptions>,
  },
  /// The remove dir API.
  #[cmd(fs_remove_dir, "fs > removeDir")]
  RemoveDir {
    path: SafePathBuf,
    options: Option<DirOperationOptions>,
  },
  /// The remove file API.
  #[cmd(fs_remove_file, "fs > removeFile")]
  RemoveFile {
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The rename file API.
  #[cmd(fs_rename_file, "fs > renameFile")]
  #[serde(rename_all = "camelCase")]
  RenameFile {
    old_path: SafePathBuf,
    new_path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
  /// The exists API.
  #[cmd(fs_exists, "fs > exists")]
  Exists {
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  },
}

impl Cmd {
  #[module_command_handler(fs_read_file)]
  fn read_file<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<Vec<u8>> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    file::read_binary(&resolved_path)
      .with_context(|| format!("path: {}", resolved_path.display()))
      .map_err(Into::into)
  }

  #[module_command_handler(fs_read_file)]
  fn read_text_file<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<String> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    file::read_string(&resolved_path)
      .with_context(|| format!("path: {}", resolved_path.display()))
      .map_err(Into::into)
  }

  #[module_command_handler(fs_write_file)]
  fn write_file<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    contents: Vec<u8>,
    options: Option<FileOperationOptions>,
  ) -> super::Result<()> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    File::create(&resolved_path)
      .with_context(|| format!("path: {}", resolved_path.display()))
      .map_err(Into::into)
      .and_then(|mut f| f.write_all(&contents).map_err(|err| err.into()))
  }

  #[module_command_handler(fs_read_file_stream)]
  fn open_read_file_stream<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<FileStreamFd> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    let open_file = OpenOptions::new()
      .read(true)
      .open(&resolved_path)
      .with_context(|| format!("path: {}", resolved_path.display()))?;
    let open_file = TokioFile::from_std(open_file);
    let open_fd = open_file.as_raw_fd();

    // 64 KiB buffer
    let stream = Arc::new(TokioMutex::new(BufStream::with_capacity(
      65536, 0, open_file,
    )));
    file_stream_store().lock().unwrap().insert(open_fd, stream);
    dbg!(format!(
      "resolved read path: {} {}",
      open_fd,
      resolved_path.display()
    ));
    Ok(open_fd)
  }

  #[module_command_handler(fs_write_file_stream)]
  fn open_write_file_stream<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<FileStreamFd> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    let open_file = OpenOptions::new()
      .append(true)
      .create(true)
      .open(&resolved_path)
      .with_context(|| format!("path: {}", resolved_path.display()))?;
    let open_file = TokioFile::from_std(open_file);
    let open_fd = open_file.as_raw_fd();

    // 64 KiB buffer
    let stream = Arc::new(TokioMutex::new(BufStream::with_capacity(
      0, 65536, open_file,
    )));
    file_stream_store().lock().unwrap().insert(open_fd, stream);
    dbg!(format!(
      "resolved write path: {} {}",
      open_fd,
      resolved_path.display()
    ));
    Ok(open_fd)
  }

  #[module_command_handler(fs_read_file_stream)]
  #[allow(unused_variables)]
  fn read_file_stream<R: Runtime>(
    context: InvokeContext<R>,
    fd: FileStreamFd,
    on_data_fn: CallbackFn,
  ) -> super::Result<()> {
    dbg!(format!("reading {}", fd));
    if let Some(stream_) = file_stream_store().lock().unwrap().get_mut(&fd) {
      dbg!(format!("got stream {}", fd));
      let stream = stream_.clone();
      crate::async_runtime::spawn(async move {
        dbg!(format!("in async {}", fd));
        let mut asdf = stream.lock().await;
        dbg!(format!("locked stream {}", fd));
        // asdf.read
        loop {
          let length = {
            let buffer = asdf.fill_buf().await.expect("msg");
            if buffer.len() == 0 {
              dbg!(format!("reached eof {}", fd));
              break;
            }
            dbg!(format!("read buffer {} {} {:?}", fd, buffer.len(), buffer));
            let js = crate::api::ipc::format_callback(on_data_fn, &buffer)
              .expect("unable to serialize data");

            dbg!(format!("js result {:#?}", js));
            dbg!(format!("js str {}", js.as_str()));
            let _ = context.window.eval(js.as_str()).expect("could not eval js");
            buffer.len()
          };
          asdf.consume(length);
          dbg!(format!("consumed buffer {}", fd));
        }
      });
    }
    Ok(())
  }

  #[module_command_handler(fs_write_file_stream)]
  #[allow(unused_variables)]
  fn write_file_stream<R: Runtime>(
    context: InvokeContext<R>,
    fd: FileStreamFd,
    buffer: Buffer,
  ) -> super::Result<()> {
    dbg!(format!("writing: {}", fd));
    if let Some(stream_) = file_stream_store().lock().unwrap().get_mut(&fd) {
      dbg!(format!("got stream {}", fd));
      let stream = stream_.clone();
      crate::async_runtime::spawn(async move {
        dbg!(format!("in async {}", fd));
        let text_copy;
        let vec_copy;
        let data = match buffer {
          Buffer::Text(t) => {
            text_copy = t.clone();
            text_copy.as_bytes()
          }
          Buffer::Raw(r) => {
            vec_copy = r.clone();
            vec_copy.as_slice()
          }
        };
        // dbg!(format!("got data {} {:#?}", fd, data));
        // stream
        //   .lock()
        //   .await
        //   .write_all(data)
        //   .await
        //   .expect("failed to write to file stream");
        // dbg!(format!("wrote data {}", fd));
        // stream
        //   .lock()
        //   .await
        //   .flush()
        //   .await
        //   .expect("failed to flush written data to file stream");
        // dbg!(format!("flushed data {}", fd));
        let mut stream = stream.lock().await;
        stream
          .write_all(data)
          .await
          .expect("failed to write to file stream");
        stream
          .flush()
          .await
          .expect("failed to flush written data to file stream");
      });
    }
    Ok(())
  }

  #[module_command_handler(fs_write_file_stream)]
  #[allow(unused_variables)]
  fn close_file_stream<R: Runtime>(
    context: InvokeContext<R>,
    fd: FileStreamFd,
  ) -> super::Result<()> {
    file_stream_store().lock().unwrap().remove(&fd);
    Ok(())
  }

  #[module_command_handler(fs_read_dir)]
  fn read_dir<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<DirOperationOptions>,
  ) -> super::Result<Vec<dir::DiskEntry>> {
    let (recursive, dir) = if let Some(options_value) = options {
      (options_value.recursive, options_value.dir)
    } else {
      (false, None)
    };
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      dir,
    )?;
    dir::read_dir_with_options(
      &resolved_path,
      recursive,
      dir::ReadDirOptions {
        scope: Some(&context.window.state::<Scopes>().fs),
      },
    )
    .with_context(|| format!("path: {}", resolved_path.display()))
    .map_err(Into::into)
  }

  #[module_command_handler(fs_copy_file)]
  fn copy_file<R: Runtime>(
    context: InvokeContext<R>,
    source: SafePathBuf,
    destination: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<()> {
    let (src, dest) = match options.and_then(|o| o.dir) {
      Some(dir) => (
        resolve_path(
          &context.config,
          &context.package_info,
          &context.window,
          source,
          Some(dir),
        )?,
        resolve_path(
          &context.config,
          &context.package_info,
          &context.window,
          destination,
          Some(dir),
        )?,
      ),
      None => (source, destination),
    };
    fs::copy(src.clone(), dest.clone())
      .with_context(|| format!("source: {}, dest: {}", src.display(), dest.display()))?;
    Ok(())
  }

  #[module_command_handler(fs_create_dir)]
  fn create_dir<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<DirOperationOptions>,
  ) -> super::Result<()> {
    let (recursive, dir) = if let Some(options_value) = options {
      (options_value.recursive, options_value.dir)
    } else {
      (false, None)
    };
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      dir,
    )?;
    if recursive {
      fs::create_dir_all(&resolved_path)
        .with_context(|| format!("path: {}", resolved_path.display()))?;
    } else {
      fs::create_dir(&resolved_path)
        .with_context(|| format!("path: {} (non recursive)", resolved_path.display()))?;
    }

    Ok(())
  }

  #[module_command_handler(fs_remove_dir)]
  fn remove_dir<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<DirOperationOptions>,
  ) -> super::Result<()> {
    let (recursive, dir) = if let Some(options_value) = options {
      (options_value.recursive, options_value.dir)
    } else {
      (false, None)
    };
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      dir,
    )?;
    if recursive {
      fs::remove_dir_all(&resolved_path)
        .with_context(|| format!("path: {}", resolved_path.display()))?;
    } else {
      fs::remove_dir(&resolved_path)
        .with_context(|| format!("path: {} (non recursive)", resolved_path.display()))?;
    }

    Ok(())
  }

  #[module_command_handler(fs_remove_file)]
  fn remove_file<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<()> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    fs::remove_file(&resolved_path)
      .with_context(|| format!("path: {}", resolved_path.display()))?;
    Ok(())
  }

  #[module_command_handler(fs_rename_file)]
  fn rename_file<R: Runtime>(
    context: InvokeContext<R>,
    old_path: SafePathBuf,
    new_path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<()> {
    let (old, new) = match options.and_then(|o| o.dir) {
      Some(dir) => (
        resolve_path(
          &context.config,
          &context.package_info,
          &context.window,
          old_path,
          Some(dir),
        )?,
        resolve_path(
          &context.config,
          &context.package_info,
          &context.window,
          new_path,
          Some(dir),
        )?,
      ),
      None => (old_path, new_path),
    };
    fs::rename(&old, &new)
      .with_context(|| format!("old: {}, new: {}", old.display(), new.display()))
      .map_err(Into::into)
  }

  #[module_command_handler(fs_exists)]
  fn exists<R: Runtime>(
    context: InvokeContext<R>,
    path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) -> super::Result<bool> {
    let resolved_path = resolve_path(
      &context.config,
      &context.package_info,
      &context.window,
      path,
      options.and_then(|o| o.dir),
    )?;
    Ok(resolved_path.as_ref().exists())
  }
}

#[allow(dead_code)]
fn resolve_path<R: Runtime>(
  config: &Config,
  package_info: &PackageInfo,
  window: &Window<R>,
  path: SafePathBuf,
  dir: Option<BaseDirectory>,
) -> super::Result<SafePathBuf> {
  let env = window.state::<Env>().inner();
  match crate::api::path::resolve_path(config, package_info, env, &path, dir) {
    Ok(path) => {
      if window.state::<Scopes>().fs.is_allowed(&path) {
        Ok(
          // safety: the path is resolved by Tauri so it is safe
          unsafe { SafePathBuf::new_unchecked(path) },
        )
      } else {
        Err(anyhow::anyhow!(
          crate::Error::PathNotAllowed(path).to_string()
        ))
      }
    }
    Err(e) => super::Result::<SafePathBuf>::Err(e.into())
      .with_context(|| format!("path: {}, base dir: {dir:?}", path.display())),
  }
}

#[cfg(test)]
mod tests {
  use super::{
    BaseDirectory, Buffer, DirOperationOptions, FileOperationOptions, FileStreamFd, SafePathBuf,
  };

  use quickcheck::{Arbitrary, Gen};

  impl Arbitrary for BaseDirectory {
    fn arbitrary(g: &mut Gen) -> Self {
      if bool::arbitrary(g) {
        BaseDirectory::AppData
      } else {
        BaseDirectory::Resource
      }
    }
  }

  impl Arbitrary for Buffer {
    fn arbitrary(g: &mut Gen) -> Self {
      Buffer::Text(String::arbitrary(g))
    }
  }

  impl Arbitrary for FileOperationOptions {
    fn arbitrary(g: &mut Gen) -> Self {
      Self {
        dir: Option::arbitrary(g),
      }
    }
  }

  impl Arbitrary for DirOperationOptions {
    fn arbitrary(g: &mut Gen) -> Self {
      Self {
        recursive: bool::arbitrary(g),
        dir: Option::arbitrary(g),
      }
    }
  }

  #[tauri_macros::module_command_test(fs_read_file, "fs > readFile")]
  #[quickcheck_macros::quickcheck]
  fn read_file(path: SafePathBuf, options: Option<FileOperationOptions>) {
    let res = super::Cmd::read_file(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_write_file, "fs > writeFile")]
  #[quickcheck_macros::quickcheck]
  fn write_file(path: SafePathBuf, contents: Vec<u8>, options: Option<FileOperationOptions>) {
    let res = super::Cmd::write_file(crate::test::mock_invoke_context(), path, contents, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_read_file_stream, "fs > openReadFileStream")]
  #[quickcheck_macros::quickcheck]
  fn open_read_file_stream(path: SafePathBuf, options: Option<FileOperationOptions>) {
    let res = super::Cmd::open_read_file_stream(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_write_file_stream, "fs > openWriteFileStream")]
  #[quickcheck_macros::quickcheck]
  fn open_write_file_stream(path: SafePathBuf, options: Option<FileOperationOptions>) {
    let res = super::Cmd::open_write_file_stream(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_read_file_stream, "fs > readFileStream")]
  #[quickcheck_macros::quickcheck]
  fn read_file_stream(fd: FileStreamFd, on_data_fn: crate::api::ipc::CallbackFn) {
    let res = super::Cmd::read_file_stream(crate::test::mock_invoke_context(), fd, on_data_fn);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_write_file_stream, "fs > writeFileStream")]
  #[quickcheck_macros::quickcheck]
  fn write_file_stream(fd: FileStreamFd, buffer: Buffer) {
    let res = super::Cmd::write_file_stream(crate::test::mock_invoke_context(), fd, buffer);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_write_file_stream, "fs > closeFileStream")]
  #[quickcheck_macros::quickcheck]
  fn close_file_stream(fd: FileStreamFd) {
    let res = super::Cmd::close_file_stream(crate::test::mock_invoke_context(), fd);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_read_dir, "fs > readDir")]
  #[quickcheck_macros::quickcheck]
  fn read_dir(path: SafePathBuf, options: Option<DirOperationOptions>) {
    let res = super::Cmd::read_dir(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_copy_file, "fs > copyFile")]
  #[quickcheck_macros::quickcheck]
  fn copy_file(
    source: SafePathBuf,
    destination: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) {
    let res = super::Cmd::copy_file(
      crate::test::mock_invoke_context(),
      source,
      destination,
      options,
    );
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_create_dir, "fs > createDir")]
  #[quickcheck_macros::quickcheck]
  fn create_dir(path: SafePathBuf, options: Option<DirOperationOptions>) {
    let res = super::Cmd::create_dir(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_remove_dir, "fs > removeDir")]
  #[quickcheck_macros::quickcheck]
  fn remove_dir(path: SafePathBuf, options: Option<DirOperationOptions>) {
    let res = super::Cmd::remove_dir(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_remove_file, "fs > removeFile")]
  #[quickcheck_macros::quickcheck]
  fn remove_file(path: SafePathBuf, options: Option<FileOperationOptions>) {
    let res = super::Cmd::remove_file(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_rename_file, "fs > renameFile")]
  #[quickcheck_macros::quickcheck]
  fn rename_file(
    old_path: SafePathBuf,
    new_path: SafePathBuf,
    options: Option<FileOperationOptions>,
  ) {
    let res = super::Cmd::rename_file(
      crate::test::mock_invoke_context(),
      old_path,
      new_path,
      options,
    );
    crate::test_utils::assert_not_allowlist_error(res);
  }

  #[tauri_macros::module_command_test(fs_exists, "fs > exists")]
  #[quickcheck_macros::quickcheck]
  fn exists(path: SafePathBuf, options: Option<FileOperationOptions>) {
    let res = super::Cmd::exists(crate::test::mock_invoke_context(), path, options);
    crate::test_utils::assert_not_allowlist_error(res);
  }
}

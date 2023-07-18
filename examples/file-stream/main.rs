// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

#[tauri::command]
fn create_test_file(path: PathBuf) {
  let path_str = path.display();
  dbg!(format!("hello world {path_str}"));
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![create_test_file])
    .run(tauri::generate_context!(
      "../../examples/file-stream/tauri.conf.json"
    ))
    .expect("error while running tauri application");
}

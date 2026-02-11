#[cfg(not(debug_assertions))]
use std::{fs, process::{Child, Command}, sync::Mutex};
#[cfg(all(not(debug_assertions), target_os = "windows"))]
use std::os::windows::process::CommandExt;
use tauri::Manager;

#[cfg(not(debug_assertions))]
const SERVER_BUNDLE: &str = include_str!("../../dist/index.js");
#[cfg(not(debug_assertions))]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(not(debug_assertions))]
struct BackendChild(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(port: u16) {
  let backend_url = format!("http://127.0.0.1:{port}");
  let app = tauri::Builder::default()
    .on_page_load({
      let backend_url = backend_url.clone();
      move |window, _| {
        let script = format!("window.__CLOVIS_API_BASE__ = '{}';", backend_url);
        let _ = window.eval(&script);
      }
    })
    .setup(move |app| {
      #[cfg(debug_assertions)]
      {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(not(debug_assertions))]
      {
        let app_data_dir = app.path().app_local_data_dir()?;
        fs::create_dir_all(&app_data_dir)?;
        let server_script_path = app_data_dir.join("server.js");
        fs::write(&server_script_path, SERVER_BUNDLE)?;
        let mut command = Command::new("bun");
        command
          .arg(&server_script_path)
          .env("CLOVIS_BACKEND_PORT", port.to_string());
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);
        let child = command.spawn()?;
        app.manage(BackendChild(Mutex::new(Some(child))));
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application");
  app.run(|app_handle, event| {
    #[cfg(not(debug_assertions))]
    if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
      if let Some(state) = app_handle.try_state::<BackendChild>() {
        if let Some(mut child) = state.0.lock().ok().and_then(|mut guard| guard.take()) {
          let _ = child.kill();
          let _ = child.wait();
        }
      }
    }
  });
}

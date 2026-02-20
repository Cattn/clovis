#[cfg(not(debug_assertions))]
use std::{process::{Child, Command}, sync::Mutex};
#[cfg(all(not(debug_assertions), target_os = "windows"))]
use std::os::windows::process::CommandExt;
use tauri::Manager;

#[cfg(all(not(debug_assertions), target_os = "windows"))]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(not(debug_assertions))]
struct BackendChild(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(port: u16) {
  let backend_url = format!("http://127.0.0.1:{port}");
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
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
        let resource_dir = app.path().resource_dir()?;

        #[cfg(target_os = "windows")]
        let node_bin = resource_dir.join("resources").join("node.exe");
        #[cfg(not(target_os = "windows"))]
        let node_bin = resource_dir.join("resources").join("node");

        let server_script = resource_dir.join("resources").join("index.js");

        #[cfg(not(target_os = "windows"))]
        {
          use std::os::unix::fs::PermissionsExt;
          let perms = std::fs::Permissions::from_mode(0o755);
          std::fs::set_permissions(&node_bin, perms)?;
        }

        let mut command = Command::new(&node_bin);
        command
          .arg(&server_script)
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

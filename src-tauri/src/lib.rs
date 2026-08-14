#[cfg(not(debug_assertions))]
use std::{process::{Child, Command, Stdio}, sync::Mutex};
#[cfg(all(not(debug_assertions), target_os = "windows"))]
use std::os::windows::process::CommandExt;
use std::{fs, io::ErrorKind};
use tauri::Manager;

#[cfg(all(not(debug_assertions), target_os = "windows"))]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(not(debug_assertions))]
struct BackendChild(Mutex<Option<Child>>);

const PREFERENCES_FILE_NAME: &str = "preferences.json";

#[tauri::command]
fn load_preferences(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let preferences_path = app_data_dir.join(PREFERENCES_FILE_NAME);
  match fs::read_to_string(preferences_path) {
    Ok(content) => Ok(Some(content)),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
    Err(error) => Err(error.to_string()),
  }
}

#[tauri::command]
fn save_preferences(app: tauri::AppHandle, preferences: String) -> Result<(), String> {
  let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
  let preferences_path = app_data_dir.join(PREFERENCES_FILE_NAME);
  fs::write(preferences_path, preferences).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(port: u16) {
  let backend_url = format!("http://127.0.0.1:{port}");
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![load_preferences, save_preferences])
    .setup(move |app| {
      // Must be an initialization script, not an on_page_load eval: the frontend reads
      // this while its bundle is evaluating, which an on_page_load eval can lose the
      // race against, leaving the app pointed at its own origin instead of the backend.
      tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
        .title("Clovis Flights")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .maximized(true)
        .initialization_script(format!("window.__CLOVIS_API_BASE__ = '{}';", backend_url))
        .build()?;

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

        // Launched from Explorer there is no console, so inherited stdio handles are
        // invalid and the backend dies on its first write. Give it real ones, and keep
        // the output as a log so a dead backend is diagnosable instead of silent.
        let app_data_dir = app.path().app_data_dir()?;
        fs::create_dir_all(&app_data_dir)?;
        let log_file = fs::File::create(app_data_dir.join("backend.log"))?;
        let log_file_err = log_file.try_clone()?;

        let mut command = Command::new(&node_bin);
        command
          .arg(&server_script)
          .env("CLOVIS_BACKEND_PORT", port.to_string())
          // The bundled runtime must not inherit the machine's Node config: a user-set
          // NODE_OPTIONS (e.g. --use-system-ca) makes it exit before it can serve.
          .env_remove("NODE_OPTIONS")
          .env_remove("NODE_PATH")
          .stdin(Stdio::null())
          .stdout(Stdio::from(log_file))
          .stderr(Stdio::from(log_file_err));
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);
        let child = command.spawn()?;
        app.manage(BackendChild(Mutex::new(Some(child))));
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application");
  app.run(|_app_handle, _event| {
    #[cfg(not(debug_assertions))]
    if matches!(_event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
      if let Some(state) = _app_handle.try_state::<BackendChild>() {
        if let Some(mut child) = state.0.lock().ok().and_then(|mut guard| guard.take()) {
          let _ = child.kill();
          let _ = child.wait();
        }
      }
    }
  });
}

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// The web store's origin for this build, like getStoreBaseUrl() in src/lib/storeAuth.ts.
const DEFAULT_STORE_URL: &str = "https://agent-store-test.panghuli.tech";

// Holds the `aas __local-api` child: dropping it would close the child's stdin, which is
// how the child knows to exit, so it lives as long as the app.
struct LocalApi(#[allow(dead_code)] Mutex<Option<CommandChild>>);

/// Starts `aas __local-api <store origin>` (apps/client-core/src/local-api/server.ts), the
/// read-only endpoint that tells the web store which shown items are installed here.
/// Spawned here rather than from the webview, whose shell scope allows only `__rpc`.
fn start_local_api(app: &tauri::App) {
  let store = option_env!("VITE_STORE_URL").filter(|s| !s.is_empty()).unwrap_or(DEFAULT_STORE_URL);
  let spawned = app
    .shell()
    .sidecar("aas")
    .and_then(|cmd| cmd.args(["__local-api", store.trim_end_matches('/')]).spawn());
  match spawned {
    Ok((mut events, child)) => {
      app.manage(LocalApi(Mutex::new(Some(child))));
      tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
    }
    Err(err) => log::warn!("local api not started: {err}"),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // Must be the first plugin: on Windows and Linux every install link launches the
  // app again, and this hands the link to the running instance before a window opens.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
    }
  }));
  builder
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      start_local_api(app);
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Register the agent-store:// scheme at runtime (needed on Linux/Windows dev;
      // macOS/Windows release pick it up from the bundle config).
      #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register_all();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Emitter;

// ─── Windows API imports ─────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, MAX_PATH};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, ShowWindow, SW_MINIMIZE
};
#[cfg(target_os = "windows")]
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2PermissionRequestedEventHandler,
    COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};

// The custom struct has been removed. We will use the macro-generated create method instead.

// ─── Payload emitted to the frontend ─────────────────────────────────────────
#[derive(Clone, Serialize)]
struct ActiveWindowPayload {
    title: String,
    #[serde(rename = "processName")]
    process_name: String,
    timestamp: u64,
}

// ─── Windows: get active window title + process name ─────────────────────────
#[cfg(target_os = "windows")]
fn get_foreground_window_info() -> Option<(String, String)> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }

        // Get window title
        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
        let title = if title_len > 0 {
            String::from_utf16_lossy(&title_buf[..title_len as usize])
        } else {
            String::new()
        };

        // Get process name from PID
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);

        let process_name = if pid != 0 {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !handle.is_null() {
                let mut path_buf = [0u16; MAX_PATH as usize];
                let mut path_len = MAX_PATH;
                let ok = QueryFullProcessImageNameW(
                    handle,
                    0,
                    path_buf.as_mut_ptr(),
                    &mut path_len,
                );
                CloseHandle(handle);
                if ok != 0 && path_len > 0 {
                    let full_path =
                        String::from_utf16_lossy(&path_buf[..path_len as usize]);
                    // Extract just the exe filename from the full path
                    full_path
                        .rsplit('\\')
                        .next()
                        .unwrap_or(&full_path)
                        .to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        // Skip empty results (e.g. desktop, lock screen)
        if title.is_empty() && process_name.is_empty() {
            return None;
        }

        Some((title, process_name))
    }
}

#[cfg(not(target_os = "windows"))]
fn get_foreground_window_info() -> Option<(String, String)> {
    // No OS-level window tracking on non-Windows platforms
    None
}

// ─── Tauri command: one-shot active window query ─────────────────────────────
#[tauri::command]
fn get_active_window() -> Option<ActiveWindowPayload> {
    let (title, process_name) = get_foreground_window_info()?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Some(ActiveWindowPayload {
        title,
        process_name,
        timestamp,
    })
}

#[tauri::command]
fn minimize_active_window() {
    #[cfg(target_os = "windows")]
    unsafe {
        let hwnd = GetForegroundWindow();
        if !hwnd.is_null() {
            ShowWindow(hwnd, SW_MINIMIZE);
        }
    }
}

// ─── Background poller: emits "window-changed" events on actual changes ──────
fn start_window_poller(app_handle: tauri::AppHandle) {
    // Track both title and process. Different apps can legitimately expose the
    // same title (for example, an untitled editor and a browser new-tab page),
    // and each change must be classified against the active focus intent.
    let last_window: Arc<Mutex<Option<(String, String)>>> = Arc::new(Mutex::new(None));

    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(750));

            if let Some((title, process_name)) = get_foreground_window_info() {
                let mut last = last_window.lock().unwrap();

                // Only emit when the window actually changed
                if last.as_ref() != Some(&(title.clone(), process_name.clone())) {
                    *last = Some((title.clone(), process_name.clone()));
                    // Drop the lock before emitting to avoid deadlock
                    drop(last);

                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let payload = ActiveWindowPayload {
                        title,
                        process_name,
                        timestamp,
                    };

                    // Emit to all webview windows
                    let _ = app_handle.emit("window-changed", payload);
                }
            }
        }
    });
}

// ─── App entry point ─────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![get_active_window, minimize_active_window])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start the background window poller
            start_window_poller(app.handle().clone());

            // Auto-grant camera/microphone permissions in WebView2
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.with_webview(move |webview| {
                        unsafe {
                            if let Ok(core) = webview.controller().CoreWebView2() {
                                let handler = webview2_com::PermissionRequestedEventHandler::create(Box::new(|_sender, args| {
                                    if let Some(args) = args {
                                        let mut kind = webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_KIND(0);
                                        args.PermissionKind(&mut kind)?;
                                        if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                            || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                                        {
                                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                        }
                                    }
                                    Ok(())
                                }));
                                let handler_interface: ICoreWebView2PermissionRequestedEventHandler = handler.into();
                                let mut token: i64 = 0;
                                let _ = core.add_PermissionRequested(&handler_interface, &mut token);
                            }
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

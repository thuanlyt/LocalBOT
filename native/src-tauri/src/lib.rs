use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::io::AsRawHandle;
use std::{
    fs,
    fs::OpenOptions,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, RunEvent, State};

const SOUNDCLOUD_CREDENTIAL_TARGET: &str = "LocalBot/SoundCloud";
const MAX_SOUNDCLOUD_CLIENT_ID_LEN: usize = 256;
const MAX_SOUNDCLOUD_CLIENT_SECRET_LEN: usize = 2_048;
const INSTALLER_SMOKE_MARKER: &str = "LOCALBOT_INSTALLER_SMOKE";
const INSTALLER_SMOKE_DATA_DIR: &str = "LOCALBOT_INSTALLER_SMOKE_DATA_DIR";
const MAX_AUTOMATIC_RESTARTS: u8 = 3;
const SUPERVISOR_POLL_MS: u64 = 250;
const STABLE_RUNTIME_RESET_SECONDS: u64 = 30;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum RuntimeRecoveryState {
    Stable,
    Restarting,
    Exhausted,
}

#[derive(Debug, Deserialize, Serialize)]
struct SoundCloudCredentials {
    client_id: String,
    client_secret: String,
}

fn normalize_credential(value: String, max_len: usize, label: &str) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(format!("{label} SoundCloud không được để trống."));
    }
    if value.len() > max_len {
        return Err(format!("{label} SoundCloud vượt quá giới hạn an toàn."));
    }
    if value.chars().any(char::is_control) {
        return Err(format!("{label} SoundCloud chứa ký tự không hợp lệ."));
    }
    Ok(value)
}

fn validate_soundcloud_credentials(
    client_id: String,
    client_secret: String,
) -> Result<SoundCloudCredentials, String> {
    Ok(SoundCloudCredentials {
        client_id: normalize_credential(client_id, MAX_SOUNDCLOUD_CLIENT_ID_LEN, "Client ID")?,
        client_secret: normalize_credential(
            client_secret,
            MAX_SOUNDCLOUD_CLIENT_SECRET_LEN,
            "Client secret",
        )?,
    })
}

fn encode_soundcloud_credentials(credentials: &SoundCloudCredentials) -> Result<Vec<u8>, String> {
    serde_json::to_vec(credentials)
        .map_err(|_| "Không thể chuẩn bị credential SoundCloud.".to_string())
}

fn decode_soundcloud_credentials(blob: &[u8]) -> Result<SoundCloudCredentials, String> {
    let credentials: SoundCloudCredentials = serde_json::from_slice(blob).map_err(|_| {
        "Credential SoundCloud trong Windows Credential Manager không hợp lệ.".to_string()
    })?;
    validate_soundcloud_credentials(credentials.client_id, credentials.client_secret)
}

#[cfg(test)]
mod credential_tests {
    use super::{
        automatic_restart_backoff, decode_soundcloud_credentials, encode_soundcloud_credentials,
        validate_soundcloud_credentials, NativeRuntimeInfo, MAX_AUTOMATIC_RESTARTS,
    };

    #[test]
    fn soundcloud_credentials_are_trimmed_and_round_trip_as_bounded_json() {
        let credentials = validate_soundcloud_credentials(
            "  client-id  ".to_string(),
            " client-secret ".to_string(),
        )
        .unwrap();
        assert_eq!(credentials.client_id, "client-id");
        assert_eq!(credentials.client_secret, "client-secret");
        let encoded = encode_soundcloud_credentials(&credentials).unwrap();
        assert_eq!(
            decode_soundcloud_credentials(&encoded).unwrap().client_id,
            "client-id"
        );
    }

    #[test]
    fn soundcloud_credentials_reject_empty_control_and_oversized_values() {
        assert!(validate_soundcloud_credentials(" ".to_string(), "secret".to_string()).is_err());
        assert!(
            validate_soundcloud_credentials("client".to_string(), "secret\nvalue".to_string())
                .is_err()
        );
        assert!(validate_soundcloud_credentials("x".repeat(257), "secret".to_string()).is_err());
        assert!(validate_soundcloud_credentials("client".to_string(), "x".repeat(2_049)).is_err());
    }

    #[test]
    fn native_runtime_info_is_metadata_only_and_uses_stable_wire_names() {
        let info = NativeRuntimeInfo {
            packaged: true,
            data_dir: r"C:\LocalBotData".to_string(),
            env_file_present: false,
        };
        let payload = serde_json::to_value(info).unwrap();
        assert_eq!(payload["packaged"], true);
        assert_eq!(payload["dataDir"], r"C:\LocalBotData");
        assert_eq!(payload["envFilePresent"], false);
        assert!(payload.get("DISCORD_TOKEN").is_none());
        assert!(payload.get("BOT_TOKEN").is_none());
    }

    #[test]
    fn installer_smoke_data_dir_is_absolute_and_temp_scoped() {
        let temp = std::path::Path::new(r"C:\Users\Test\AppData\Local\Temp");
        let accepted = super::validate_installer_smoke_data_dir(
            r"C:\Users\Test\AppData\Local\Temp\localbot-smoke\data",
            temp,
        )
        .unwrap();
        assert!(accepted.starts_with(temp));
        assert!(
            super::validate_installer_smoke_data_dir(r"C:\Users\Test\Desktop\data", temp).is_err()
        );
        assert!(super::validate_installer_smoke_data_dir(r"relative\data", temp).is_err());
    }

    #[test]
    fn automatic_recovery_uses_bounded_backoff_and_attempt_limit() {
        assert_eq!(
            automatic_restart_backoff(1),
            std::time::Duration::from_secs(1)
        );
        assert_eq!(
            automatic_restart_backoff(2),
            std::time::Duration::from_secs(2)
        );
        assert_eq!(
            automatic_restart_backoff(3),
            std::time::Duration::from_secs(4)
        );
        assert_eq!(
            automatic_restart_backoff(99),
            std::time::Duration::from_secs(4)
        );
        assert_eq!(MAX_AUTOMATIC_RESTARTS, 3);
    }

    #[cfg(windows)]
    #[test]
    fn owned_windows_child_tree_is_terminated_and_reaped() {
        use std::process::Command;

        // Keep this fixture local and short-lived. `taskkill /T /F` must terminate
        // the exact child tree, while `terminate_child` must still reap the root
        // process before native ownership is released.
        let mut child = Command::new("cmd.exe")
            .args(["/D", "/S", "/C", "ping 127.0.0.1 -n 30 > NUL"])
            .spawn()
            .expect("spawn local Windows process fixture");
        assert!(child.try_wait().expect("check fixture process").is_none());

        super::terminate_child(&mut child).expect("terminate and reap owned process tree");
        assert!(child
            .try_wait()
            .expect("check reaped fixture process")
            .is_some());
    }
}

#[cfg(windows)]
fn credential_target_wide() -> Vec<u16> {
    SOUNDCLOUD_CREDENTIAL_TARGET
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn read_soundcloud_credentials() -> Result<Option<SoundCloudCredentials>, String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target = credential_target_wide();
    let mut raw: *mut CREDENTIALW = null_mut();
    let read = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) };
    if read == 0 {
        let error = unsafe { GetLastError() };
        if error == ERROR_NOT_FOUND {
            return Ok(None);
        }
        return Err(format!(
            "Không thể đọc credential SoundCloud từ Windows Credential Manager (mã {error})."
        ));
    }
    if raw.is_null() {
        return Err("Windows Credential Manager trả về credential SoundCloud rỗng.".to_string());
    }

    let result = unsafe {
        let credential = &*raw;
        if credential.CredentialBlob.is_null() {
            Err("Credential SoundCloud trong Windows Credential Manager bị rỗng.".to_string())
        } else {
            let blob = std::slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            );
            decode_soundcloud_credentials(blob)
        }
    };
    unsafe { CredFree(raw.cast()) };
    result.map(Some)
}

#[cfg(not(windows))]
fn read_soundcloud_credentials() -> Result<Option<SoundCloudCredentials>, String> {
    Ok(None)
}

#[cfg(windows)]
fn write_soundcloud_credentials(credentials: &SoundCloudCredentials) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let blob = encode_soundcloud_credentials(credentials)?;
    let mut target = credential_target_wide();
    let mut username: Vec<u16> = "LocalBot"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: username.as_mut_ptr(),
        ..Default::default()
    };
    let written = unsafe { CredWriteW(&credential, 0) };
    if written == 0 {
        return Err(
            "Không thể lưu credential SoundCloud vào Windows Credential Manager.".to_string(),
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn write_soundcloud_credentials(_credentials: &SoundCloudCredentials) -> Result<(), String> {
    Err("Lưu credential SoundCloud qua native app hiện chỉ hỗ trợ Windows.".to_string())
}

#[cfg(windows)]
fn delete_soundcloud_credentials() -> Result<(), String> {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

    let target = credential_target_wide();
    let deleted = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if deleted == 0 {
        let error = unsafe { GetLastError() };
        if error == ERROR_NOT_FOUND {
            return Ok(());
        }
        return Err(
            "Không thể xoá credential SoundCloud khỏi Windows Credential Manager.".to_string(),
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn delete_soundcloud_credentials() -> Result<(), String> {
    Err("Xoá credential SoundCloud qua native app hiện chỉ hỗ trợ Windows.".to_string())
}

// The native shell owns the bot child process it starts. Keeping this boundary
// here prevents the React UI from receiving or handling credentials.
struct OwnedBot {
    child: Child,
    owner_id: String,
    #[cfg(windows)]
    _kill_on_close_job: KillOnCloseJob,
}

#[cfg(windows)]
struct KillOnCloseJob(windows_sys::Win32::Foundation::HANDLE);

// Windows kernel handles are safe to move behind the runtime mutex. The job
// handle is only used by this process and is closed by Drop on the same
// native-owned runtime slot.
#[cfg(windows)]
unsafe impl Send for KillOnCloseJob {}

#[cfg(windows)]
unsafe impl Sync for KillOnCloseJob {}

#[cfg(windows)]
impl Drop for KillOnCloseJob {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                let _ = windows_sys::Win32::Foundation::CloseHandle(self.0);
            }
        }
    }
}

struct RuntimeState {
    owned: Option<OwnedBot>,
    desired_running: bool,
    recovery_state: RuntimeRecoveryState,
    restart_attempt: u8,
    last_started: Option<Instant>,
    retry_at: Option<Instant>,
    shutting_down: bool,
    supervisor_started: bool,
}

struct BotRuntime(Arc<Mutex<RuntimeState>>);

impl BotRuntime {
    fn new() -> Self {
        Self(Arc::new(Mutex::new(RuntimeState {
            owned: None,
            desired_running: false,
            recovery_state: RuntimeRecoveryState::Stable,
            restart_attempt: 0,
            last_started: None,
            retry_at: None,
            shutting_down: false,
            supervisor_started: false,
        })))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BotRuntimeStatus {
    managed: bool,
    pid: Option<u32>,
    owner_id: Option<String>,
    desired_running: bool,
    recovery_state: RuntimeRecoveryState,
    restart_attempt: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRuntimeInfo {
    packaged: bool,
    data_dir: String,
    env_file_present: bool,
}

fn validate_installer_smoke_data_dir(
    raw: &str,
    temp_dir: &std::path::Path,
) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(raw.trim());
    if !candidate.is_absolute() || !candidate.starts_with(temp_dir) {
        return Err("Installer smoke data directory must be an absolute path below the system temp directory.".to_string());
    }
    Ok(candidate)
}

fn local_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if std::env::var(INSTALLER_SMOKE_MARKER).ok().as_deref() == Some("1") {
        let raw = std::env::var(INSTALLER_SMOKE_DATA_DIR).map_err(|_| {
            "Installer smoke marker requires a temporary data directory.".to_string()
        })?;
        return validate_installer_smoke_data_dir(&raw, &std::env::temp_dir());
    }

    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("Không thể xác định thư mục dữ liệu LocalBot: {error}"))
}

#[tauri::command]
fn native_runtime_info(app: AppHandle) -> Result<NativeRuntimeInfo, String> {
    let data_dir = local_data_dir(&app)?;

    let packaged = !cfg!(debug_assertions);
    let env_file_present = packaged && data_dir.join(".env").is_file();

    Ok(NativeRuntimeInfo {
        packaged,
        data_dir: data_dir.to_string_lossy().into_owned(),
        env_file_present,
    })
}

#[tauri::command]
fn prepare_native_data_dir(app: AppHandle) -> Result<String, String> {
    let data_dir = local_data_dir(&app)?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Không thể chuẩn bị thư mục dữ liệu LocalBot: {error}"))?;
    Ok(data_dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn status_from_runtime(runtime: &mut RuntimeState) -> Result<BotRuntimeStatus, String> {
    let finished = match runtime.owned.as_mut() {
        Some(owned) => owned
            .child
            .try_wait()
            .map_err(|error| format!("Không thể kiểm tra bot runtime: {error}"))?
            .is_some(),
        None => false,
    };

    if finished {
        runtime.owned = None;
    }

    Ok(BotRuntimeStatus {
        managed: runtime.owned.is_some(),
        pid: runtime.owned.as_ref().map(|owned| owned.child.id()),
        owner_id: runtime.owned.as_ref().map(|owned| owned.owner_id.clone()),
        desired_running: runtime.desired_running,
        recovery_state: runtime.recovery_state,
        restart_attempt: runtime.restart_attempt,
    })
}

fn native_owner_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("native-{}-{}", std::process::id(), timestamp)
}

fn control_port_is_occupied() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 2901));
    TcpStream::connect_timeout(&address, std::time::Duration::from_millis(150)).is_ok()
}

fn automatic_restart_backoff(attempt: u8) -> Duration {
    match attempt {
        1 => Duration::from_secs(1),
        2 => Duration::from_secs(2),
        _ => Duration::from_secs(4),
    }
}

fn workspace_root() -> Result<PathBuf, String> {
    let candidate = option_env!("LOCALBOT_PROJECT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."));
    let root = candidate
        .canonicalize()
        .map_err(|error| format!("Không tìm thấy workspace LocalBot: {error}"))?;

    if !root.join("package.json").is_file() {
        return Err("Native dev runner cần package.json ở workspace LocalBot.".to_string());
    }

    Ok(root)
}

fn packaged_runtime_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Không thể xác định thư mục resource của LocalBot: {error}"))?;
    let runtime_dir = resource_dir.join("runtime");
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let node_path = runtime_dir.join(node_name);
    let entry_path = runtime_dir.join("dist/index.js");
    let data_dir = local_data_dir(app)?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Không thể tạo thư mục dữ liệu LocalBot: {error}"))?;

    if !node_path.is_file() || !entry_path.is_file() {
        return Err(
            "LOCALBOT_RUNTIME_PACKAGE_MISSING: bản cài đặt thiếu runtime production (node hoặc dist). Hãy build lại native artifact.".to_string(),
        );
    }

    Ok((node_path, entry_path, data_dir))
}

fn runtime_log_path(working_dir: &Path, packaged: bool) -> Result<PathBuf, String> {
    let log_dir = if packaged {
        working_dir.to_path_buf()
    } else {
        working_dir.join("data")
    };
    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("Không thể tạo thư mục log runtime: {error}"))?;
    Ok(log_dir.join("native-runtime.log"))
}

fn terminate_child(child: &mut Child) -> Result<(), String> {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|error| format!("Không thể dừng bot runtime: {error}"))?;

        if !status.success()
            && child
                .try_wait()
                .map_err(|error| format!("Không thể kiểm tra bot runtime: {error}"))?
                .is_none()
        {
            return Err("Windows không thể dừng cây tiến trình bot.".to_string());
        }
    }

    #[cfg(not(windows))]
    child
        .kill()
        .map_err(|error| format!("Không thể dừng bot runtime: {error}"))?;

    child
        .wait()
        .map(|_| ())
        .map_err(|error| format!("Không thể thu hồi bot runtime: {error}"))
}

#[cfg(windows)]
fn attach_kill_on_close_job(child: &Child) -> Result<KillOnCloseJob, String> {
    use std::mem::size_of;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return Err("Không thể tạo Windows Job Object để quản lý vòng đời bot.".to_string());
    }

    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } != 0;
    if !configured {
        unsafe {
            let _ = windows_sys::Win32::Foundation::CloseHandle(job);
        }
        return Err("Không thể cấu hình Windows Job Object cho bot runtime.".to_string());
    }

    let assigned = unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as _) } != 0;
    if !assigned {
        unsafe {
            let _ = windows_sys::Win32::Foundation::CloseHandle(job);
        }
        return Err("Không thể gắn bot runtime vào Windows Job Object.".to_string());
    }

    Ok(KillOnCloseJob(job))
}

#[tauri::command]
fn bot_status(state: State<'_, BotRuntime>) -> Result<BotRuntimeStatus, String> {
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Không thể đọc trạng thái bot runtime.".to_string())?;
    status_from_runtime(&mut runtime)
}

#[tauri::command]
fn start_bot(app: AppHandle, state: State<'_, BotRuntime>) -> Result<BotRuntimeStatus, String> {
    state.ensure_supervisor(&app);
    state.start_owned(&app)
}

fn spawn_owned_process(app: &AppHandle) -> Result<OwnedBot, String> {
    let owner_id = native_owner_id();
    let mut command;
    let working_dir;
    let runtime_error;
    let packaged;

    if cfg!(debug_assertions) {
        let root = workspace_root()?;
        working_dir = root;
        runtime_error = "Không thể khởi động bot runtime bằng npm";
        packaged = false;
        command = if cfg!(windows) {
            let mut command = Command::new("cmd.exe");
            command.args(["/D", "/S", "/C", "npm run dev"]);
            command
        } else {
            let mut command = Command::new("npm");
            command.args(["run", "dev"]);
            command
        };
    } else {
        let (node_path, entry_path, data_dir) = packaged_runtime_paths(app)?;
        let env_file = data_dir.join(".env");
        working_dir = data_dir.clone();
        runtime_error = "Không thể khởi động packaged LocalBot runtime";
        packaged = true;
        command = Command::new(node_path);
        // Keep the absolute Windows path in an environment variable instead of
        // the argv command line. This avoids drive-letter/path parsing issues
        // in the bundled Node launcher when the app is installed on F:, D:, etc.
        let mut entry_path_value = entry_path.to_string_lossy().to_string();
        #[cfg(windows)]
        if let Some(path_without_verbatim_prefix) = entry_path_value.strip_prefix(r"\\?\") {
            entry_path_value = path_without_verbatim_prefix.to_string();
        }
        command.args([
            "-e",
            "import('node:url').then(({ pathToFileURL }) => import(pathToFileURL(process.env.LOCALBOT_RUNTIME_ENTRY).href)).catch((error) => { console.error(error); process.exitCode = 1; })",
        ]);
        command.env("LOCALBOT_RUNTIME_ENTRY", entry_path_value);
        command.env("LOCALBOT_DATA_DIR", &data_dir);
        if env_file.is_file() {
            command.env("LOCALBOT_ENV_FILE", env_file);
        }
    }

    // Windows Credential Manager is the native-only secret boundary. The
    // Node runtime receives the values only as child-process environment
    // variables; they never cross the React/control API boundary.
    if let Some(credentials) = read_soundcloud_credentials()? {
        command.env("SOUNDCLOUD_CLIENT_ID", credentials.client_id);
        command.env("SOUNDCLOUD_CLIENT_SECRET", credentials.client_secret);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let log_path = runtime_log_path(&working_dir, packaged)?;
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("Không thể mở log runtime {}: {error}", log_path.display()))?;
    let error_log_file = log_file
        .try_clone()
        .map_err(|error| format!("Không thể khởi tạo log stderr runtime: {error}"))?;

    let mut child = command
        .current_dir(working_dir)
        .env("LOCALBOT_RUNTIME_PROFILE", "native")
        .env("LOCALBOT_CONTROL_ENABLED", "true")
        .env("LOCALBOT_CONTROL_HOST", "127.0.0.1")
        .env("LOCALBOT_CONTROL_PORT", "2901")
        .env("LOCALBOT_RUNTIME_OWNER_ID", &owner_id)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(error_log_file))
        .spawn()
        .map_err(|error| format!("{runtime_error}: {error}"))?;

    #[cfg(windows)]
    let kill_on_close_job = match attach_kill_on_close_job(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = terminate_child(&mut child);
            return Err(error);
        }
    };

    Ok(OwnedBot {
        child,
        owner_id,
        #[cfg(windows)]
        _kill_on_close_job: kill_on_close_job,
    })
}

fn runtime_supervisor_loop(state: Arc<Mutex<RuntimeState>>, app: AppHandle) {
    loop {
        let should_continue = {
            let mut runtime = match state.lock() {
                Ok(runtime) => runtime,
                Err(_) => break,
            };

            if runtime.shutting_down {
                false
            } else {
                let status = match status_from_runtime(&mut runtime) {
                    Ok(status) => status,
                    Err(error) => {
                        eprintln!("[native-runtime] supervisor status check failed: {error}");
                        continue;
                    }
                };

                if status.managed {
                    if runtime.recovery_state == RuntimeRecoveryState::Restarting
                        && runtime.last_started.is_some_and(|started| {
                            started.elapsed() >= Duration::from_secs(STABLE_RUNTIME_RESET_SECONDS)
                        })
                    {
                        runtime.recovery_state = RuntimeRecoveryState::Stable;
                        runtime.restart_attempt = 0;
                        runtime.last_started = None;
                    }
                    true
                } else if !runtime.desired_running {
                    runtime.recovery_state = RuntimeRecoveryState::Stable;
                    runtime.restart_attempt = 0;
                    runtime.retry_at = None;
                    true
                } else if runtime.recovery_state == RuntimeRecoveryState::Exhausted
                    || runtime
                        .retry_at
                        .is_some_and(|retry_at| Instant::now() < retry_at)
                {
                    true
                } else if runtime.restart_attempt >= MAX_AUTOMATIC_RESTARTS
                    || control_port_is_occupied()
                {
                    runtime.recovery_state = RuntimeRecoveryState::Exhausted;
                    runtime.retry_at = None;
                    true
                } else {
                    let attempt = runtime.restart_attempt.saturating_add(1);
                    runtime.restart_attempt = attempt;
                    runtime.recovery_state = RuntimeRecoveryState::Restarting;
                    match spawn_owned_process(&app) {
                        Ok(owned) => {
                            runtime.owned = Some(owned);
                            runtime.last_started = Some(Instant::now());
                            runtime.retry_at = None;
                        }
                        Err(error) => {
                            eprintln!("[native-runtime] automatic recovery attempt {attempt} failed: {error}");
                            if attempt >= MAX_AUTOMATIC_RESTARTS {
                                runtime.recovery_state = RuntimeRecoveryState::Exhausted;
                                runtime.retry_at = None;
                            } else {
                                runtime.retry_at =
                                    Some(Instant::now() + automatic_restart_backoff(attempt));
                            }
                        }
                    }
                    true
                }
            }
        };

        if !should_continue {
            break;
        }
        thread::sleep(Duration::from_millis(SUPERVISOR_POLL_MS));
    }
}

impl BotRuntime {
    fn ensure_supervisor(&self, app: &AppHandle) {
        let should_start = self
            .0
            .lock()
            .map(|mut runtime| {
                if runtime.supervisor_started {
                    false
                } else {
                    runtime.supervisor_started = true;
                    true
                }
            })
            .unwrap_or(false);
        if !should_start {
            return;
        }

        let state = Arc::clone(&self.0);
        let app = app.clone();
        thread::spawn(move || runtime_supervisor_loop(state, app));
    }

    fn start_owned(&self, app: &AppHandle) -> Result<BotRuntimeStatus, String> {
        let mut runtime = self
            .0
            .lock()
            .map_err(|_| "Không thể truy cập bot runtime.".to_string())?;

        let status = status_from_runtime(&mut runtime)?;
        if status.managed {
            return Ok(status);
        }

        if control_port_is_occupied() {
            runtime.recovery_state = RuntimeRecoveryState::Exhausted;
            runtime.retry_at = None;
            return Err("LOCALBOT_RUNTIME_UNOWNED: port 2901 đang được một tiến trình ngoài native sử dụng. Hãy dừng tiến trình đó rồi bật LocalBot từ cửa sổ native.".to_string());
        }

        let owned = spawn_owned_process(app)?;
        runtime.owned = Some(owned);
        runtime.desired_running = true;
        runtime.recovery_state = RuntimeRecoveryState::Stable;
        runtime.restart_attempt = 0;
        runtime.last_started = Some(Instant::now());
        runtime.retry_at = None;
        status_from_runtime(&mut runtime)
    }
}

#[tauri::command]
fn stop_bot(state: State<'_, BotRuntime>) -> Result<BotRuntimeStatus, String> {
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Không thể truy cập bot runtime.".to_string())?;

    // Explicit user intent always wins over automatic recovery.
    runtime.desired_running = false;
    runtime.recovery_state = RuntimeRecoveryState::Stable;
    runtime.restart_attempt = 0;
    runtime.last_started = None;
    runtime.retry_at = None;
    let status = status_from_runtime(&mut runtime)?;
    if !status.managed {
        return Ok(status);
    }

    // Keep the owned child in the slot until termination has succeeded. If
    // taskkill/Wait fails, the caller must still be able to retry and the
    // process must never become an unowned runtime by accident.
    let running = runtime
        .owned
        .as_mut()
        .expect("owned slot was checked above")
        .child
        .try_wait()
        .map_err(|error| format!("Không thể kiểm tra bot runtime: {error}"))?
        .is_none();
    if running {
        terminate_child(
            &mut runtime
                .owned
                .as_mut()
                .expect("owned slot was checked above")
                .child,
        )?;
    }
    runtime.owned = None;
    status_from_runtime(&mut runtime)
}

#[tauri::command]
fn soundcloud_credentials_status() -> Result<bool, String> {
    Ok(read_soundcloud_credentials()?.is_some())
}

#[tauri::command(rename_all = "camelCase")]
fn set_soundcloud_credentials(client_id: String, client_secret: String) -> Result<(), String> {
    let credentials = validate_soundcloud_credentials(client_id, client_secret)?;
    write_soundcloud_credentials(&credentials)
}

#[tauri::command]
fn clear_soundcloud_credentials() -> Result<(), String> {
    delete_soundcloud_credentials()
}

impl BotRuntime {
    fn shutdown(&self) {
        if let Ok(mut runtime) = self.0.lock() {
            runtime.shutting_down = true;
            runtime.desired_running = false;
            runtime.recovery_state = RuntimeRecoveryState::Stable;
            runtime.restart_attempt = 0;
            runtime.last_started = None;
            runtime.retry_at = None;
            if let Some(mut owned) = runtime.owned.take() {
                let _ = owned.child.try_wait().and_then(|status| {
                    if status.is_none() {
                        terminate_child(&mut owned.child)
                            .map_err(|_| std::io::Error::other("terminate failed"))?;
                    }
                    Ok(status)
                });
            }
        }
    }
}

impl Drop for BotRuntime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(BotRuntime::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            greet,
            bot_status,
            native_runtime_info,
            prepare_native_data_dir,
            start_bot,
            stop_bot,
            soundcloud_credentials_status,
            set_soundcloud_credentials,
            clear_soundcloud_credentials
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let runtime = app.state::<BotRuntime>();
    if let Err(error) = runtime.start_owned(app.handle()) {
        eprintln!("[native-runtime] {error}");
    }
    runtime.ensure_supervisor(app.handle());

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit) {
            app_handle.state::<BotRuntime>().shutdown();
        }
    });
}

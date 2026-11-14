// The desktop session token lives in the OS credential store (#195): Keychain on
// macOS, Credential Manager on Windows, Secret Service on Linux. When the store
// can't be used, the caller is told so; nothing falls back to a file.
use serde::Serialize;
use tauri::{AppHandle, Manager};

const ACCOUNTS: [&str; 2] = ["store-session", "store-session-revoke"];

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CredentialRead {
  Found { secret: String },
  Missing,
  Unavailable { detail: String },
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CredentialWrite {
  Done,
  Unavailable { detail: String },
}

fn entry(service: &str, account: &str) -> keyring::Result<keyring::Entry> {
  keyring::Entry::new(service, account)
}

fn checked(app: &AppHandle, account: &str) -> Result<(String, String), String> {
  if !ACCOUNTS.contains(&account) {
    return Err(format!("unknown credential: {account}"));
  }
  Ok((app.config().identifier.clone(), account.to_string()))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn credential_get(app: AppHandle, account: String) -> Result<CredentialRead, String> {
  let (service, account) = checked(&app, &account)?;
  blocking(move || match entry(&service, &account).and_then(|e| e.get_password()) {
    Ok(secret) => CredentialRead::Found { secret },
    Err(keyring::Error::NoEntry) => CredentialRead::Missing,
    Err(e) => CredentialRead::Unavailable { detail: e.to_string() },
  })
  .await
}

#[tauri::command]
pub async fn credential_set(app: AppHandle, account: String, secret: String) -> Result<CredentialWrite, String> {
  let (service, account) = checked(&app, &account)?;
  blocking(move || match entry(&service, &account).and_then(|e| e.set_password(&secret)) {
    Ok(()) => CredentialWrite::Done,
    Err(e) => CredentialWrite::Unavailable { detail: e.to_string() },
  })
  .await
}

#[tauri::command]
pub async fn credential_delete(app: AppHandle, account: String) -> Result<CredentialWrite, String> {
  let (service, account) = checked(&app, &account)?;
  blocking(move || match entry(&service, &account).and_then(|e| e.delete_credential()) {
    Ok(()) | Err(keyring::Error::NoEntry) => CredentialWrite::Done,
    Err(e) => CredentialWrite::Unavailable { detail: e.to_string() },
  })
  .await
}

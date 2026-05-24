use crate::managers::transcription::TranscriptionManager;
use crate::settings::{
    get_settings, write_settings, ModelUnloadTimeout, APPLE_INTELLIGENCE_PROVIDER_ID,
};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    transcription_manager: State<TranscriptionManager>,
) -> Result<ModelLoadStatus, String> {
    Ok(ModelLoadStatus {
        is_loaded: transcription_manager.is_model_loaded(),
        current_model: transcription_manager.get_current_model(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<TranscriptionManager>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn preview_post_process_transcript(
    app: AppHandle,
    transcript: String,
) -> Result<String, String> {
    if transcript.trim().is_empty() {
        return Ok(String::new());
    }

    let settings = get_settings(&app);
    let provider = settings
        .active_post_process_provider()
        .ok_or_else(|| "Kein Nachbearbeitungs-Anbieter ausgewählt.".to_string())?;

    let model = settings
        .post_process_models
        .get(&provider.id)
        .map(|value| value.trim())
        .unwrap_or_default();

    if model.is_empty() {
        return Err(format!(
            "Für {} ist kein Modell ausgewählt.",
            provider.label
        ));
    }

    let selected_prompt_id = settings
        .post_process_selected_prompt_id
        .as_deref()
        .ok_or_else(|| "Kein Prompt ausgewählt.".to_string())?;

    let prompt = settings
        .post_process_prompts
        .iter()
        .find(|prompt| prompt.id == selected_prompt_id)
        .ok_or_else(|| "Der ausgewählte Prompt wurde nicht gefunden.".to_string())?;

    if prompt.prompt.trim().is_empty() {
        return Err("Der ausgewählte Prompt ist leer.".to_string());
    }

    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .map(|value| value.trim())
        .unwrap_or_default();

    if api_key.is_empty()
        && provider.id != "custom"
        && provider.id != APPLE_INTELLIGENCE_PROVIDER_ID
        && !provider.base_url.starts_with("http://localhost")
        && !provider.base_url.starts_with("http://127.0.0.1")
    {
        return Err(format!(
            "Für {} ist kein API-Schlüssel hinterlegt.",
            provider.label
        ));
    }

    crate::actions::post_process_transcription(&settings, &transcript)
        .await
        .ok_or_else(|| {
            "Nachbearbeitung fehlgeschlagen. Bitte Anbieter, API-Schlüssel, Modell und Prompt prüfen."
                .to_string()
        })
}

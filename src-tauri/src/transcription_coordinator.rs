use crate::actions::ACTION_MAP;
use crate::managers::audio::AudioRecordingManager;
use crate::overlay::show_locked_overlay;
use log::{debug, error, warn};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const DEBOUNCE: Duration = Duration::from_millis(30);
const QUICK_TAP_MAX: Duration = Duration::from_millis(250);
const DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(320);

/// Commands processed sequentially by the coordinator thread.
enum Command {
    Input {
        binding_id: String,
        hotkey_string: String,
        is_pressed: bool,
        push_to_talk: bool,
        double_tap_lock: bool,
    },
    Cancel {
        recording_was_active: bool,
    },
    ProcessingFinished,
}

/// Pipeline lifecycle, owned exclusively by the coordinator thread.
enum Stage {
    Idle,
    Recording { binding_id: String, locked: bool },
    Processing,
}

struct PendingShortTap {
    binding_id: String,
    hotkey_string: String,
    deadline: Instant,
}

/// Serialises all transcription lifecycle events through a single thread
/// to eliminate race conditions between keyboard shortcuts, signals, and
/// the async transcribe-paste pipeline.
pub struct TranscriptionCoordinator {
    tx: Sender<Command>,
}

pub fn is_transcribe_binding(id: &str) -> bool {
    id == "transcribe" || id == "transcribe_with_post_process"
}

impl TranscriptionCoordinator {
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut stage = Stage::Idle;
                let mut last_press: Option<Instant> = None;
                let mut active_press_started: Option<Instant> = None;
                let mut pending_short_tap: Option<PendingShortTap> = None;
                let mut ignore_next_release_for_lock: Option<String> = None;

                loop {
                    let cmd = if let Some(pending) = &pending_short_tap {
                        let now = Instant::now();
                        if now >= pending.deadline {
                            let pending = pending_short_tap.take().unwrap();
                            finish_pending_short_tap(&app, &mut stage, pending);
                            continue;
                        }

                        match rx.recv_timeout(pending.deadline.duration_since(now)) {
                            Ok(cmd) => cmd,
                            Err(RecvTimeoutError::Timeout) => {
                                let pending = pending_short_tap.take().unwrap();
                                finish_pending_short_tap(&app, &mut stage, pending);
                                continue;
                            }
                            Err(RecvTimeoutError::Disconnected) => break,
                        }
                    } else {
                        match rx.recv() {
                            Ok(cmd) => cmd,
                            Err(_) => break,
                        }
                    };

                    match cmd {
                        Command::Input {
                            binding_id,
                            hotkey_string,
                            is_pressed,
                            push_to_talk,
                            double_tap_lock,
                        } => {
                            // Debounce rapid-fire press events (key repeat / double-tap).
                            // Releases always pass through for push-to-talk.
                            let now = Instant::now();
                            if is_pressed {
                                if last_press.map_or(false, |t| now.duration_since(t) < DEBOUNCE) {
                                    debug!("Debounced press for '{binding_id}'");
                                    continue;
                                }
                                last_press = Some(now);
                            }

                            if push_to_talk {
                                if is_pressed {
                                    if double_tap_lock
                                        && pending_short_tap
                                            .as_ref()
                                            .is_some_and(|pending| pending.binding_id == binding_id)
                                        && matches!(
                                            &stage,
                                            Stage::Recording {
                                                binding_id: id,
                                                locked: false,
                                            } if id == &binding_id
                                        )
                                    {
                                        pending_short_tap = None;
                                        stage = Stage::Recording {
                                            binding_id: binding_id.clone(),
                                            locked: true,
                                        };
                                        ignore_next_release_for_lock = Some(binding_id.clone());
                                        active_press_started = None;
                                        show_locked_overlay(&app);
                                        debug!("Locked recording for '{binding_id}' by double tap");
                                    } else {
                                        match &stage {
                                            Stage::Idle => {
                                                start(
                                                    &app,
                                                    &mut stage,
                                                    &binding_id,
                                                    &hotkey_string,
                                                );
                                                if matches!(&stage, Stage::Recording { .. }) {
                                                    active_press_started = Some(now);
                                                }
                                            }
                                            Stage::Recording {
                                                binding_id: id,
                                                locked: true,
                                            } if id == &binding_id => {
                                                pending_short_tap = None;
                                                active_press_started = None;
                                                stop(&app, &mut stage, &binding_id, &hotkey_string);
                                            }
                                            _ => debug!(
                                                "Ignoring press for '{binding_id}': pipeline busy"
                                            ),
                                        }
                                    }
                                } else if ignore_next_release_for_lock.as_ref() == Some(&binding_id)
                                {
                                    ignore_next_release_for_lock = None;
                                    debug!("Ignored lock activation release for '{binding_id}'");
                                } else if pending_short_tap.is_some() {
                                    debug!("Ignoring release for '{binding_id}' while short tap is pending");
                                } else if matches!(
                                    &stage,
                                    Stage::Recording {
                                        binding_id: id,
                                        locked: false,
                                    } if id == &binding_id
                                ) {
                                    let press_duration = active_press_started
                                        .map(|started| now.duration_since(started))
                                        .unwrap_or(Duration::MAX);
                                    active_press_started = None;

                                    if double_tap_lock && press_duration <= QUICK_TAP_MAX {
                                        pending_short_tap = Some(PendingShortTap {
                                            binding_id,
                                            hotkey_string,
                                            deadline: now + DOUBLE_TAP_WINDOW,
                                        });
                                    } else {
                                        stop(&app, &mut stage, &binding_id, &hotkey_string);
                                    }
                                }
                            } else if is_pressed {
                                match &stage {
                                    Stage::Idle => {
                                        start(&app, &mut stage, &binding_id, &hotkey_string);
                                    }
                                    Stage::Recording { binding_id: id, .. }
                                        if id == &binding_id =>
                                    {
                                        stop(&app, &mut stage, &binding_id, &hotkey_string);
                                    }
                                    _ => {
                                        debug!("Ignoring press for '{binding_id}': pipeline busy")
                                    }
                                }
                            }
                        }
                        Command::Cancel {
                            recording_was_active,
                        } => {
                            pending_short_tap = None;
                            active_press_started = None;
                            ignore_next_release_for_lock = None;
                            // Don't reset during processing — wait for the pipeline to finish.
                            if !matches!(stage, Stage::Processing)
                                && (recording_was_active
                                    || matches!(stage, Stage::Recording { .. }))
                            {
                                stage = Stage::Idle;
                            }
                        }
                        Command::ProcessingFinished => {
                            pending_short_tap = None;
                            active_press_started = None;
                            ignore_next_release_for_lock = None;
                            stage = Stage::Idle;
                        }
                    }
                }
                debug!("Transcription coordinator exited");
            }));
            if let Err(e) = result {
                error!("Transcription coordinator panicked: {e:?}");
            }
        });

        Self { tx }
    }

    /// Send a keyboard/signal input event for a transcribe binding.
    /// For signal-based toggles, use `is_pressed: true` and `push_to_talk: false`.
    pub fn send_input(
        &self,
        binding_id: &str,
        hotkey_string: &str,
        is_pressed: bool,
        push_to_talk: bool,
        double_tap_lock: bool,
    ) {
        if self
            .tx
            .send(Command::Input {
                binding_id: binding_id.to_string(),
                hotkey_string: hotkey_string.to_string(),
                is_pressed,
                push_to_talk,
                double_tap_lock,
            })
            .is_err()
        {
            warn!("Transcription coordinator channel closed");
        }
    }

    pub fn notify_cancel(&self, recording_was_active: bool) {
        if self
            .tx
            .send(Command::Cancel {
                recording_was_active,
            })
            .is_err()
        {
            warn!("Transcription coordinator channel closed");
        }
    }

    pub fn notify_processing_finished(&self) {
        if self.tx.send(Command::ProcessingFinished).is_err() {
            warn!("Transcription coordinator channel closed");
        }
    }
}

fn start(app: &AppHandle, stage: &mut Stage, binding_id: &str, hotkey_string: &str) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action in ACTION_MAP for '{binding_id}'");
        return;
    };
    action.start(app, binding_id, hotkey_string);
    if app
        .try_state::<Arc<AudioRecordingManager>>()
        .map_or(false, |a| a.is_recording())
    {
        *stage = Stage::Recording {
            binding_id: binding_id.to_string(),
            locked: false,
        };
    } else {
        debug!("Start for '{binding_id}' did not begin recording; staying idle");
    }
}

fn stop(app: &AppHandle, stage: &mut Stage, binding_id: &str, hotkey_string: &str) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action in ACTION_MAP for '{binding_id}'");
        return;
    };
    action.stop(app, binding_id, hotkey_string);
    *stage = Stage::Processing;
}

fn finish_pending_short_tap(app: &AppHandle, stage: &mut Stage, pending: PendingShortTap) {
    if matches!(
        &*stage,
        Stage::Recording {
            binding_id,
            locked: false,
        } if binding_id == &pending.binding_id
    ) {
        stop(app, stage, &pending.binding_id, &pending.hotkey_string);
    }
}

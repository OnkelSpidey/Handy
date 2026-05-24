# Handy Fork Notes

This fork is a personal, minimal dictation workflow based on Handy.

The goal is to keep the app small, stable, resource-friendly, and visually calm while improving the daily dictation flow for German-first usage, coding assistants, short messages, tasks, and structured notes.

## Current Direction

- Stay close to Handy's simple core instead of turning the app into a large feature suite.
- Use WhisperFlow-style ergonomics as inspiration: minimal UI, fast recording, useful post-processing, and low friction.
- Keep the installed app small and avoid accidental replacement by upstream auto-updates.
- Prefer robust conservative transcript cleanup over creative rewriting.

## Implemented Fork Changes

- Added an empty-transcript guard so no placeholder text or internal model tokens are inserted when no speech was captured.
- Improved the recording overlay position so it sits slightly above the macOS Dock.
- Strengthened the microphone activity bars while keeping the pill compact.
- Added optional double-tap lock recording mode:
  - Hold shortcut for push-to-talk.
  - Double-tap shortcut to keep recording hands-free.
  - Press shortcut again to stop locked recording.
- Added settings toggle for double-tap lock.
- Added locked recording UI state in the overlay.
- Disabled Tauri updater artifacts and protected this fork from accidental upstream auto-updates.
- Marked the app as a local `Fork` in the footer and tray menu.
- Added a post-processing cockpit:
  - Shows whether post-processing is enabled.
  - Shows provider, model, API key status, selected prompt, and protected terms count.
  - Provides a real connection test using the post-processing pipeline.
- Added a prompt test area for raw transcript cleanup testing.
- Made prompt test failures explicit instead of silently returning the original text.
- Extended custom words:
  - Allows multi-word terms.
  - Uses custom words as protected terms during LLM post-processing.
  - Helps preserve project names, tool names, and important vocabulary.

## Current Git Setup Target

Recommended remotes:

- `origin`: personal fork, for example `https://github.com/OnkelSpidey/Handy.git`
- `upstream`: original Handy repository, `https://github.com/cjpais/Handy.git`

Use `origin` for this fork's changes and `upstream` only when deliberately pulling updates from the original project.

## Build

Frontend check:

```bash
PATH=/Users/tulio/.bun/bin:$PATH /Users/tulio/.bun/bin/bun run build
```

macOS app bundle:

```bash
PATH=/Users/tulio/Library/Python/3.9/bin:/Users/tulio/.bun/bin:/Users/tulio/.cargo/bin:$PATH CMAKE_POLICY_VERSION_MINIMUM=3.5 /Users/tulio/.bun/bin/bun run tauri build --bundles app
```

Install local build:

```bash
ditto src-tauri/target/release/bundle/macos/Handy.app /Applications/Handy.app
```

## Next Ideas

- Add a small set of post-processing modes:
  - Normal
  - Coding assistant
  - Short message
  - List / tasks
- Polish the overlay pill into a distinct fork identity without making it visually loud.
- Add lightweight health/status signals for post-processing latency and last error.
- Keep protected vocabulary simple first, then consider grouping terms later.

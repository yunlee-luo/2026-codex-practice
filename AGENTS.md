# 2026 database AGENTS.md

## Project Context

Project name: 2026 database
Workspace path: G:\我的雲端硬碟\2026 database
Primary branch: main
GitHub repo: https://github.com/yunlee-luo/2026-codex-practice
Firebase project: long789913-teaching-tool-aab13

This workspace is configured for classroom-tool work. Keep project notes, Firebase configuration, and deployment status easy to recover at the start and end of a Codex session.

## Firebase

Cloud Firestore is configured through:

- `.firebaserc`
- `firebase.json`
- `firestore.rules`

Current Firestore rules:

- `wordcloud_words`: public read access
- `wordcloud_words`: write access only for authenticated Firebase Auth users
- all other collections: read/write denied

Anonymous Firebase Authentication has been enabled for testing authenticated writes.

## Obsidian Notes

Obsidian vault: G:\我的雲端硬碟\secondbrain
Project note path: 2026 database/Project Sync Status.md

Keep a project status note at:

`2026 database/Project Sync Status.md`

The workspace itself is not the Obsidian vault.

## Startup Workflow

At the beginning of a work session:

- Read this `AGENTS.md`.
- Check the current Firebase project in `.firebaserc`.
- Check `git status`.
- Review pending project notes if an Obsidian vault is configured.
- Do not pull, commit, or push unless the user asks.

## Shutdown Workflow

At the end of a work session:

- Summarize completed changes.
- List any remaining manual setup.
- Check for uncommitted changes.
- Update project notes if an Obsidian vault is configured.
- Do not commit or push unless the user asks.

## Initialization Workflow

For first-time setup or re-initialization:

- Keep `AGENTS.md`, `README.md`, and `.gitignore` current.
- Confirm Firebase project and Firestore rules before deployment.
- Confirm GitHub repo and GitHub Pages settings before publishing.
- Confirm Obsidian vault before creating notes.

## Local Tool Status

Verified:

- Git is installed.
- GitHub CLI is installed and authenticated as `yunlee-luo`.
- Node.js is installed.
- Firebase CLI can deploy to `long789913-teaching-tool-aab13`.

Not installed:

- Codex skill `startup-sync`
- Codex skill `shutdown-sync`
- Codex skill `project-init-sync`

## Safety Rules

- Do not commit secrets, tokens, service account keys, or `.env` files.
- Do not commit `.codex/`, `.claude/`, or local tool caches.
- Do not overwrite user-created notes or Firebase rules without checking current content first.
- Do not make public GitHub repositories or enable GitHub Pages without explicit user approval.
- Do not weaken Firestore rules unless the user explicitly confirms the security impact.

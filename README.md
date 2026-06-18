# 2026 database

Classroom-tool Firebase workspace.

## Current Setup

- Firebase project: `long789913-teaching-tool-aab13`
- Firestore database: enabled
- Firebase Auth: anonymous sign-in enabled for authenticated write testing
- Firestore rules: deployed successfully
- GitHub repo: `yunlee-luo/2026-codex-practice` private repository
- Obsidian vault: `G:\我的雲端硬碟\secondbrain`

## Firestore Access

The active rules allow:

- Public reads from `wordcloud_words`
- Writes to `wordcloud_words` only when the request has Firebase Authentication
- No access to other collections

## Files

- `.firebaserc`: Firebase project alias
- `firebase.json`: Firebase deploy configuration
- `firestore.rules`: Firestore security rules
- `AGENTS.md`: Codex project operating notes
- `.gitignore`: local files and secret exclusions
- `docs/expense-automation.md`: Google Sheets monthly expense automation setup guide, including dynamic payment fields and monthly pie-chart reports
- `apps-script/`: Google Apps Script backend for expense tracking
- `index.html`, `styles.css`, `app.js`: static expense dashboard for GitHub Pages from the repository root
- `skill/automate-monthly-expenses/`: reusable Skill package and OpenAPI contract

## Verified Test

Codex successfully tested:

- Anonymous Firebase Authentication sign-in
- Write to `wordcloud_words`
- Read back the written document
- Delete the test document
- Confirm deletion

Test message:

`Codex Firestore write/read test OK`

## Pending Optional Setup

- Install Codex sync skills if you want startup/shutdown automation.
- Enable GitHub Pages only if the repository is changed to public or Pages is configured for private repository support.

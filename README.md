# FlowCraft

FlowCraft is a browser-based flowchart and infrastructure diagram editor built with vanilla HTML, CSS, and JavaScript.

It supports drag-and-drop shape creation, connector routing, local saves, Google Drive sync, and document export.

## Features

- Rich shape library: rectangle, diamond, terminator, parallelogram, cylinder, document, hexagon, circle, sticky note, text box, cloud
- Connector lines with styles: orthogonal, straight, curved
- Interactive line rerouting by dragging selected lines and route handles
- Shape and multi-shape movement with keyboard nudging
- Text editing and positioning inside shapes
- Local workspace save/load in browser storage
- Google Drive open/save/trash support (OAuth)
- Export to PDF, Word (.docx), and FlowCraft JSON
- Import from FlowCraft JSON, Lucidchart-like JSON (best effort), and VSDX (best effort)
- Build badge support via generated build metadata

## Tech Stack

- Plain JavaScript (no frontend framework)
- HTML/CSS UI
- jsPDF for PDF export
- docx for Word export
- JSZip for VSDX parsing
- Google Identity Services + Google Drive API

## Project Structure

- `index.html` - UI structure and modals
- `style.css` - styles and layer behavior
- `app.js` - editor logic, rendering, import/export, Google integration
- `app-config.js` - shared runtime config (OAuth client ID and allowed origins)
- `scripts/write-build-info.js` - generates `build-info.json`
- `.github/workflows/deploy-pages.yml` - GitHub Pages deployment workflow

## Requirements

- Node.js 20+ recommended
- npm

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Open:

- http://127.0.0.1:3000

### Windows PowerShell note

If PowerShell blocks `npm` scripts due execution policy, use:

```powershell
npm.cmd run dev
```

## NPM Scripts

- `npm run build:meta` - writes `build-info.json` with commit metadata
- `npm run dev` - generates metadata and starts `http-server` on port 3000

## OAuth and Google Drive Setup

FlowCraft is a frontend app. Keep only the OAuth Client ID in config, never secrets.

1. Edit `app-config.js`:

```js
window.FLOWCRAFT_CONFIG = {
  googleClientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  allowedOrigins: [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://<your-github-pages-domain>"
  ],
  allowLocalClientIdOverride: false
};
```

Config behavior:

- `googleClientId` in `app-config.js` is the primary source (recommended)
- Local per-device override in browser storage is only intended for debug/fallback
- Set `allowLocalClientIdOverride: true` only if you explicitly want local overrides

2. In Google Cloud Console OAuth settings:
- Add exact Authorized JavaScript origins matching your runtime URLs
- Use least-privilege scopes (the app uses `drive.file`)

3. In app UI:
- OAuth Credentials modal is active only when local override is enabled or no shared ID is configured
- In production, keep `allowLocalClientIdOverride` as `false`

## Keyboard Shortcuts

- Double click: edit shape text
- F2: edit selected shape text
- Ctrl+Z / Ctrl+Y: undo/redo
- Delete/Backspace: delete selected element
- Arrow keys: nudge selected shape(s) by 1px
- Shift+Arrow: nudge selected shape(s) by 10px
- Space: reset view

## Connector Routing

- Select a line, then drag the line or route handle to reroute
- Works for orthogonal, straight, and curved lines
- Double-click route handle to reset manual reroute

## Deployment (GitHub Pages)

The repo includes an Actions workflow at `.github/workflows/deploy-pages.yml` that:

1. Runs on push to `main`
2. Generates build metadata
3. Prepares a static `dist` artifact
4. Deploys to GitHub Pages

## Security Notes

- OAuth Client ID is public by design
- Do not commit client secrets, refresh tokens, API keys, or service account keys
- Use `allowedOrigins` in `app-config.js` and match them in Google Cloud OAuth config

## Troubleshooting

- Google sign-in disabled on origin:
  - Check `allowedOrigins` in `app-config.js`
  - Check Google OAuth Authorized JavaScript origins
- Build badge not updating:
  - Run `npm run build:meta`
- PDF/Word export mismatch:
  - Ensure you are on latest commit and hard refresh browser

## License

ISC

# Production Environment Documentation — flowchart-app

**Repository:** `mikhum/flowchart-app`  
**Owner:** `mikhum`  
**Last Updated:** July 9, 2026  
**Environment Type:** Personal production (GitHub Pages + Google Drive)

## 1) Purpose

This document describes the production setup for `flowchart-app` / FlowChart, including:

- Hosting and deployment
- Data storage model
- Operational checks
- Incident recovery steps

The goal is to make future maintenance and recovery straightforward.

---

## 2) Production Overview

FlowChart is a static web application for creating and editing flowcharts.

### Runtime architecture

1. User opens the production URL (GitHub Pages)
2. Browser downloads static assets (HTML/CSS/JS)
3. App runs entirely client-side
4. User files are loaded/saved to Google Drive

### Key characteristics

- No dedicated backend server
- No hosted database
- Code and deployment history in GitHub
- User files in Google Drive

---

## 3) Production Services

## 3.1 Hosting

- **Provider:** GitHub Pages
- **Repository:** `mikhum/flowchart-app`
- **Production URL:** `https://mikhum.github.io/flowchart-app/` *(confirm if changed)*
- **Pages config:** Repository **Settings → Pages**
  - Source branch/folder: *(fill actual values, e.g. `main` `/root` or `/docs`)*

## 3.2 Data Storage

- **Provider:** Google Drive
- **Storage owner:** `mikhum` personal Google account
- **Data type:** Flowchart documents and related user files

## 3.3 Source Control

- **Provider:** GitHub
- **Default branch:** *(fill actual value, likely `main`)*
- **Deploy trigger:** push to configured Pages source branch

---

## 4) Deployment Process

## 4.1 Standard deployment

1. Make and test changes locally
2. Commit with clear message
3. Push to Pages source branch
4. Wait for GitHub Pages deployment to complete
5. Verify production URL and core functionality

## 4.2 Post-deploy smoke test

- [ ] App loads without 404 or blank screen
- [ ] Main editor opens
- [ ] Create/edit flowchart works
- [ ] Save to Google Drive works
- [ ] Load from Google Drive works
- [ ] Browser console has no critical errors

---

## 5) Data and File Management

## 5.1 Data location

Production user data is not stored in GitHub repo.  
It is stored in Google Drive.

## 5.2 Recommended Drive structure

- `/Apps/flowchart-app/active/`
- `/Apps/flowchart-app/archive/`
- `/Apps/backups/flowchart-app/`

## 5.3 Backup policy (recommended)

- Weekly: copy critical files to backup folder
- Monthly: export/sync offline backup
- Keep at least 2 historical versions of important files

---

## 6) Access and Security

## 6.1 GitHub

- Account: `mikhum`
- 2FA enabled (recommended)
- Recovery codes stored securely

## 6.2 Google Account

- 2FA enabled
- Recovery methods verified
- App permissions reviewed periodically

## 6.3 Secrets and credentials

- Do not commit private secrets/tokens
- Keep only public client configuration in frontend
- Rotate credentials immediately if compromised

---

## 7) Operations and Monitoring

For this personal production setup, lightweight checks are sufficient.

## 7.1 Weekly checks

- Open production URL
- Verify create/edit/save/load workflow
- Check latest Pages deployment status
- Check console for new errors

## 7.2 Warning signs

- Page not loading
- Save/load failures
- Repeated Drive auth failures
- New OAuth/CORS/permissions errors

---

## 8) Incident Runbook

## 8.1 Site not available

1. Open repository Settings → Pages
2. Confirm branch/folder source is correct
3. Check latest deployment status/logs
4. Roll back to last known good commit if needed
5. Re-deploy and re-test

## 8.2 Drive save/load failing

1. Check Google sign-in state
2. Re-authenticate app permissions
3. Verify required Drive access/scopes
4. Test with a new temporary file
5. Confirm Drive folder permissions and ownership

## 8.3 Bad release rollback

1. Identify last known good commit
2. Revert problematic commit(s)
3. Push revert commit
4. Run smoke test checklist

---

## 9) Recovery Checklist

If rebuilding on a new machine/account recovery scenario:

1. Recover GitHub account access
2. Recover Google account access
3. Clone `mikhum/flowchart-app`
4. Restore local dev prerequisites
5. Verify Pages deployment permissions
6. Verify access to Drive files
7. Validate production URL

---

## 10) Change Log Notes (Recommended)

Track production-impacting changes in `CHANGELOG.md` with:

- Date
- Commit hash
- What changed
- Risk level
- Rollback reference

---

## 11) Repo-Specific Fill-In (Complete This)

- **Pages Source Branch:** `<fill>`
- **Pages Source Folder:** `<fill>`
- **Build Command (if any):** `<fill>`
- **Last Known Good Commit:** `<fill>`
- **Primary Drive Folder ID/Path:** `<fill>`
- **Special Operational Notes:** `<fill>`

# Backup Checklist — flowchart-app

**Repository:** `mikhum/flowchart-app`  
**Last Updated:** July 9, 2026

## 1) Goal

Ensure user flowchart data in Google Drive can be restored after accidental deletion, corruption, or account/device loss.

---

## 2) Backup Scope

Back up:

- [ ] Active flowchart files
- [ ] Important archived flowchart files
- [ ] Any template files used regularly
- [ ] Config/export files (if used by app workflow)

Do **not** rely on repo history for user documents stored only in Drive.

---

## 3) Recommended Backup Locations

- Primary working folder: `/Apps/flowchart-app/active/`
- Archive folder: `/Apps/flowchart-app/archive/`
- Backup folder: `/Apps/backups/flowchart-app/`
- Optional offline backup: encrypted local/external drive copy

---

## 4) Weekly Backup Checklist

- [ ] Copy newly created/edited critical files to backup folder
- [ ] Verify copied files can be opened
- [ ] Keep date-stamped snapshot (e.g., `2026-07-09-weekly`)
- [ ] Record completion date below

**Weekly backup log**

- Date: `<fill>` — Status: `<ok/issues>`
- Date: `<fill>` — Status: `<ok/issues>`
- Date: `<fill>` — Status: `<ok/issues>`

---

## 5) Monthly Backup Checklist

- [ ] Export full active folder snapshot
- [ ] Save offline copy (local encrypted folder or external media)
- [ ] Verify at least one restore test from backup
- [ ] Remove stale duplicates only after verifying latest backups
- [ ] Record completion date below

**Monthly backup log**

- Month: `<fill>` — Status: `<ok/issues>`
- Month: `<fill>` — Status: `<ok/issues>`
- Month: `<fill>` — Status: `<ok/issues>`

---

## 6) Restore Test Procedure (Monthly)

1. Pick one recent flowchart file in backup location.
2. Restore/copy it into a test folder.
3. Open `flowchart-app` production URL.
4. Load restored file from Drive.
5. Confirm file integrity (nodes, links, labels, layout).
6. Mark restore test pass/fail.

- Last restore test date: `<fill>`
- Result: `<pass/fail>`
- Notes: `<fill>`

---

## 7) Data Retention Guideline (Suggested)

- Keep weekly snapshots for 8 weeks
- Keep monthly snapshots for 12 months
- Keep milestone/project-critical files indefinitely

---

## 8) Security and Access Checklist

- [ ] Google account 2FA enabled
- [ ] Recovery email/phone up to date
- [ ] Recovery codes stored securely
- [ ] Drive sharing permissions reviewed
- [ ] No unnecessary third-party app access

---

## 9) Emergency Recovery Minimums

To fully recover production usage:

- [ ] Access to Google account
- [ ] Access to GitHub account
- [ ] Latest backup snapshot in Drive/offline
- [ ] Knowledge of production URL and app usage flow

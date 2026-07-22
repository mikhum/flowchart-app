# Runbook — flowchart-app

**Repository:** `mikhum/flowchart-app`  
**Last Updated:** July 9, 2026

## 1) Purpose

This runbook is the quick operational playbook for production incidents and routine checks for `flowchart-app`.

---

## 2) Quick Facts

- **Production URL:** `https://mikhum.github.io/flowchart-app/` *(confirm if updated)*
- **Hosting:** GitHub Pages
- **Data storage:** Google Drive
- **Owner/operator:** `mikhum`

---

## 3) Routine Operations

## 3.1 Weekly health check

- [ ] Open production URL
- [ ] Create or edit a sample flowchart
- [ ] Save file to Drive
- [ ] Load file from Drive
- [ ] Open browser console and verify no new critical errors
- [ ] Check latest GitHub Pages deployment status

## 3.2 Monthly maintenance

- [ ] Verify GitHub + Google account recovery options
- [ ] Review OAuth/app permissions
- [ ] Validate backup folder contains recent copies
- [ ] Update `PRODUCTION.md` if architecture/settings changed

---

## 4) Incident Severity

- **SEV-1 (Critical):** App inaccessible, cannot load at all
- **SEV-2 (Major):** App loads but save/load to Drive fails
- **SEV-3 (Minor):** Non-blocking UI bugs or intermittent errors

---

## 5) Incident Procedures

## 5.1 Site fails to load (SEV-1)

1. Confirm URL is correct.
2. Check repository **Settings → Pages**.
3. Verify source branch/folder configuration.
4. Check latest deployment status and error logs.
5. If needed, rollback to last known good commit.
6. Push fix/revert and verify site is restored.

**Exit criteria:** app loads and editor usable.

---

## 5.2 Save/load to Drive fails (SEV-2)

1. Check Google login/authentication state.
2. Re-authenticate app permissions.
3. Validate required Drive access scopes.
4. Test with a new temporary file/folder.
5. Confirm Drive folder permissions and ownership.
6. Re-test save/load in production.

**Exit criteria:** successful save and load roundtrip.

---

## 5.3 Bad release rollback (SEV-1/2)

1. Identify the first bad commit.
2. Find last known good commit hash.
3. Revert problematic commit(s).
4. Push revert to Pages source branch.
5. Perform smoke test:
   - Load app
   - Edit flowchart
   - Save to Drive
   - Load from Drive

**Exit criteria:** production behavior matches known good state.

---

## 6) Troubleshooting Matrix

| Symptom | Likely cause | First action |
|---|---|---|
| 404 / blank page | Pages config or broken deploy | Check Settings → Pages and latest deploy |
| UI loads but no editor actions | JS runtime error | Browser console + recent commits |
| Save fails | Drive auth/scope issue | Re-auth + scope verification |
| Load fails | Wrong folder/file permission | Validate Drive file visibility/access |
| Intermittent behavior | Cached stale assets | Hard refresh / clear cache |

---

## 7) Recovery Procedure (Lost Machine / Account Issues)

1. Recover GitHub account
2. Recover Google account
3. Clone repo on new machine
4. Restore local tooling
5. Confirm deploy permissions
6. Confirm Drive file access
7. Validate production URL end-to-end

---

## 8) Operational Notes

Fill and maintain:

- **Pages source branch:** `<fill>`
- **Pages source folder:** `<fill>`
- **Last known good commit:** `<fill>`
- **Drive root folder path/id:** `<fill>`
- **Special caveats:** `<fill>`

// FlowCraft Login Page Logic
const FLOWCRAFT_EDITOR_BOOT_PREFIX = "flowcraft_editor_boot:";
const FLOWCRAFT_DRIVE_SESSION_KEY = "flowcraft_drive_session";
const FLOWCRAFT_DRIVE_SESSION_TTL_MS = 1000 * 60 * 2; // 2 minutes (short-lived handoff token)

// --- DOM refs ---
const btnNewFlowchart    = document.getElementById("btn-new-flowchart");
const btnImportJson      = document.getElementById("btn-import-json");
const fileImportInput    = document.getElementById("file-import-input");
const btnGoogleSignIn    = document.getElementById("btn-google-sign-in");
const btnSignOut         = document.getElementById("btn-sign-out");
const btnConfigureGoogle = document.getElementById("btn-configure-google");
const btnRefreshDrive    = document.getElementById("btn-refresh-drive");
const profileRow         = document.getElementById("profile-row");
const authBody           = document.getElementById("auth-body");
const driveFilesList     = document.getElementById("drive-files-list");
const configModal        = document.getElementById("google-config-modal");
const btnCloseConfig     = document.getElementById("close-config-modal");
const inputClientId      = document.getElementById("google-client-id");
const btnSaveConfig      = document.getElementById("btn-save-config");
const btnClearConfig     = document.getElementById("btn-clear-config");

// --- Helpers ---
function buildEditorUrl(extra = {}) {
    const url = new URL("editor.html", window.location.href);
    for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    return url.toString();
}

function persistBootPayload(payload) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(FLOWCRAFT_EDITOR_BOOT_PREFIX + key, JSON.stringify(payload));
    return key;
}

function persistDriveSession(state) {
    if (!state.driveReady || !state.userProfile) {
        localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
        return;
    }
    localStorage.setItem(FLOWCRAFT_DRIVE_SESSION_KEY, JSON.stringify({
        createdAt: Date.now(),
        accessToken: state.accessToken,
        userProfile: state.userProfile
    }));
}

function openEditorTab(url) {
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    if (!tab) alert("Please allow pop-ups for this site to open the editor in a new tab.");
    return tab;
}

// --- Drive file list ---
function setFilesLoading(msg) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = msg;
    driveFilesList.replaceChildren(div);
}

async function loadDriveFiles() {
    setFilesLoading("Loading files…");
    btnRefreshDrive.disabled = true;
    try {
        const files = await window.FlowAuthDrive.listFlowchartFiles();
        renderFileList(files);
    } catch (err) {
        setFilesLoading("Could not load Drive files: " + err.message);
    } finally {
        btnRefreshDrive.disabled = false;
    }
}

function renderFileList(files) {
    driveFilesList.innerHTML = "";
    if (!files.length) {
        driveFilesList.innerHTML = '<div class="empty-state">No flowcharts saved in Drive yet.</div>';
        return;
    }
    files.forEach(file => {
        const item = document.createElement("div");
        item.className = "drive-file-item";

        const info = document.createElement("div");
        info.className = "drive-file-info";

        const name = document.createElement("span");
        name.className = "drive-file-name";
        name.textContent = file.name.replace(/\.(flowchart|json)$/, "");

        const date = document.createElement("span");
        date.className = "drive-file-date";
        date.textContent = new Date(file.modifiedTime).toLocaleString();

        info.appendChild(name);
        info.appendChild(date);

        const actions = document.createElement("div");
        actions.className = "drive-file-actions";

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-arrow-up-right-from-square drive-file-open-icon";

        const trashBtn = document.createElement("button");
        trashBtn.className = "drive-file-trash-btn";
        trashBtn.title = "Delete flowchart";
        trashBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        trashBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const displayName = file.name.replace(/\.(flowchart|json)$/, "");
            if (!confirm(`Delete "${displayName}"? This cannot be undone.`)) return;
            trashBtn.disabled = true;
            try {
                await window.FlowAuthDrive.deleteFlowchartFile(file.id);
                item.remove();
                if (!driveFilesList.querySelector(".drive-file-item")) {
                    driveFilesList.innerHTML = '<div class="empty-state">No flowcharts saved in Drive yet.</div>';
                }
            } catch (err) {
                alert("Could not delete: " + err.message);
                trashBtn.disabled = false;
            }
        });

        actions.appendChild(icon);
        actions.appendChild(trashBtn);

        item.appendChild(info);
        item.appendChild(actions);
        item.addEventListener("click", () => openDriveFile(file));
        driveFilesList.appendChild(item);
    });
}

async function openDriveFile(file) {
    const tab = window.open("about:blank", "_blank");
    if (!tab) { alert("Please allow pop-ups for this site."); return; }

    tab.document.write('<html><body style="font-family:Inter,sans-serif;padding:24px;color:#0f172a;background:#f8fafc;">Opening ' + file.name.replace(/</g,"&lt;") + '…</body></html>');
    tab.document.close();

    try {
        persistDriveSession(window.FlowAuthDrive.getState());
        const content = await window.FlowAuthDrive.fetchDriveFlowchart(file.id);
        const bootKey = persistBootPayload({ type: "drive-file", fileId: file.id, fileName: file.name, content });
        tab.location.replace(buildEditorUrl({ bootKey }));
    } catch (err) {
        tab.close();
        alert("Could not open flowchart: " + err.message);
    }
}

// --- Auth state ---
function onAuthState(state) {
    // Update config modal input
    if (inputClientId) inputClientId.value = state.googleClientId || "";

    if (state.signedIn) {
        authBody.style.display = "none";
        profileRow.style.display = "flex";
        document.getElementById("user-avatar").src = state.userProfile.picture || "";
        document.getElementById("user-name").textContent = state.userProfile.name || "";
        document.getElementById("user-email").textContent = state.userProfile.email || "";
        btnRefreshDrive.disabled = !state.driveReady;
        if (state.driveReady) {
            persistDriveSession(state);
            loadDriveFiles();
        } else {
            setFilesLoading("Connecting to Drive…");
        }
    } else {
        authBody.style.display = "block";
        profileRow.style.display = "none";
        btnRefreshDrive.disabled = true;
        setFilesLoading("Sign in to load your flowcharts.");
        localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
    }
}

// --- Event wiring ---
btnNewFlowchart.addEventListener("click", () => {
    persistDriveSession(window.FlowAuthDrive.getState());
    openEditorTab(buildEditorUrl({ mode: "new" }));
});

btnImportJson.addEventListener("click", () => fileImportInput.click());

fileImportInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) { alert("Please allow pop-ups for this site."); fileImportInput.value = ""; return; }
    try {
        const content = JSON.parse(await file.text());
        persistDriveSession(window.FlowAuthDrive.getState());
        const bootKey = persistBootPayload({ type: "imported-json", fileName: file.name, content });
        tab.location.replace(buildEditorUrl({ bootKey }));
    } catch (err) {
        tab.close();
        alert("Could not import JSON: " + err.message);
    } finally {
        fileImportInput.value = "";
    }
});

btnGoogleSignIn.addEventListener("click", async () => {
    try {
        await window.FlowAuthDrive.startGoogleSignIn();
    } catch (err) {
        if (err.code === "needs-config") { configModal.classList.add("active"); return; }
        alert(err.message);
    }
});

btnSignOut.addEventListener("click", () => window.FlowAuthDrive.signOut());

btnRefreshDrive.addEventListener("click", loadDriveFiles);

btnConfigureGoogle.addEventListener("click", () => configModal.classList.add("active"));
btnCloseConfig.addEventListener("click", () => configModal.classList.remove("active"));

btnSaveConfig.addEventListener("click", () => {
    try {
        window.FlowAuthDrive.setLocalGoogleClientId(inputClientId.value);
        configModal.classList.remove("active");
    } catch (err) { alert(err.message); }
});

btnClearConfig.addEventListener("click", () => {
    try {
        window.FlowAuthDrive.clearLocalGoogleClientId();
        configModal.classList.remove("active");
    } catch (err) { alert(err.message); }
});

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
    await window.FlowAuthDrive.init({ onStateChange: onAuthState });
});

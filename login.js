const FLOWCRAFT_EDITOR_BOOT_PREFIX = "flowcraft_editor_boot:";
const FLOWCRAFT_EDITOR_BOOT_TTL_MS = 1000 * 60 * 30;

const btnGoogleSignIn = document.getElementById("btn-google-sign-in");
const btnGoogleSignOut = document.getElementById("google-sign-out");
const btnConfigureGoogle = document.getElementById("btn-configure-google");
const btnOpenNewFlowchart = document.getElementById("btn-open-new-flowchart");
const btnRefreshDrive = document.getElementById("btn-refresh-drive");
const userProfileCard = document.getElementById("user-profile");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const userEmail = document.getElementById("user-email");
const driveFilesList = document.getElementById("drive-files-list");

const googleConfigModal = document.getElementById("google-config-modal");
const closeConfigModal = document.getElementById("close-config-modal");
const inputClientId = document.getElementById("google-client-id");
const btnSaveConfig = document.getElementById("btn-save-config");
const btnClearConfig = document.getElementById("btn-clear-config");

let latestAuthState = null;
let lastListedEmail = "";

function showGoogleConfigModal(show) {
    googleConfigModal.classList.toggle("active", show);
}

function setDriveListEmpty(message) {
    driveFilesList.innerHTML = `<div class="empty-state">${message}</div>`;
}

function cleanupStaleBootPayloads() {
    const now = Date.now();
    Object.keys(localStorage).forEach((key) => {
        if (!key.startsWith(FLOWCRAFT_EDITOR_BOOT_PREFIX)) return;
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "null");
            if (!parsed || !parsed.createdAt || now - Number(parsed.createdAt) > FLOWCRAFT_EDITOR_BOOT_TTL_MS) {
                localStorage.removeItem(key);
            }
        } catch (error) {
            localStorage.removeItem(key);
        }
    });
}

function persistEditorBootPayload(payload) {
    cleanupStaleBootPayloads();
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(FLOWCRAFT_EDITOR_BOOT_PREFIX + key, JSON.stringify({
        createdAt: Date.now(),
        payload
    }));
    return key;
}

function openLoadingEditorTab() {
    const editorTab = window.open("about:blank", "_blank");
    if (!editorTab) return null;
    editorTab.document.write(`<!DOCTYPE html><html><head><title>Opening FlowCraft...</title></head><body style="font-family:Inter,Arial,sans-serif;padding:24px;color:#0f172a;background:#f8fafc;">Opening FlowCraft editor...</body></html>`);
    editorTab.document.close();
    return editorTab;
}

function renderDriveList(files) {
    if (!files.length) {
        setDriveListEmpty("No saved flowcharts found in Google Drive.");
        return;
    }

    driveFilesList.innerHTML = "";
    files.forEach((file) => {
        const item = document.createElement("div");
        item.className = "gdrive-file-item";
        item.addEventListener("click", () => openDriveFileInEditor(file));

        const info = document.createElement("div");
        info.className = "gdrive-file-info";

        const nameEl = document.createElement("span");
        nameEl.className = "gdrive-file-name";
        nameEl.textContent = file.name.replace(".flowchart", "");

        const dateEl = document.createElement("span");
        dateEl.className = "gdrive-file-date";
        dateEl.textContent = "Modified: " + new Date(file.modifiedTime).toLocaleString();

        const actions = document.createElement("div");
        actions.className = "gdrive-file-actions";
        const loadIcon = document.createElement("i");
        loadIcon.className = "fa-solid fa-arrow-up-right-from-square";

        info.appendChild(nameEl);
        info.appendChild(dateEl);
        actions.appendChild(loadIcon);
        item.appendChild(info);
        item.appendChild(actions);
        driveFilesList.appendChild(item);
    });
}

async function refreshDriveList() {
    if (!latestAuthState || !latestAuthState.driveReady) {
        setDriveListEmpty("Sign in to load your saved flowcharts.");
        return;
    }

    driveFilesList.innerHTML = '<div class="empty-state">Loading Drive files...</div>';
    btnRefreshDrive.disabled = true;
    try {
        const files = await window.FlowAuthDrive.listFlowchartFiles();
        renderDriveList(files);
        lastListedEmail = latestAuthState.userProfile ? latestAuthState.userProfile.email : "";
    } catch (error) {
        setDriveListEmpty("Could not load Google Drive files: " + error.message);
    } finally {
        btnRefreshDrive.disabled = !latestAuthState || !latestAuthState.driveReady;
    }
}

async function openDriveFileInEditor(file) {
    const editorTab = openLoadingEditorTab();
    if (!editorTab) {
        alert("Please allow popups to open the editor in a new tab.");
        return;
    }

    try {
        const content = await window.FlowAuthDrive.fetchDriveFlowchart(file.id);
        const bootKey = persistEditorBootPayload({
            type: "drive-file",
            fileId: file.id,
            fileName: file.name,
            content
        });
        editorTab.location.replace(`editor.html?bootKey=${encodeURIComponent(bootKey)}`);
    } catch (error) {
        editorTab.close();
        alert("Could not open flowchart from Google Drive: " + error.message);
    }
}

function openNewFlowchart() {
    const editorTab = window.open("editor.html?mode=new", "_blank");
    if (!editorTab) alert("Please allow popups to open the editor in a new tab.");
}

function updateConfigUiState(state) {
    inputClientId.value = state.googleClientId || "";
    if (state.configuredGoogleClientId && !state.allowLocalClientIdOverride) {
        inputClientId.readOnly = true;
        inputClientId.disabled = true;
        btnSaveConfig.disabled = true;
        btnClearConfig.disabled = true;
        return;
    }
    inputClientId.readOnly = false;
    inputClientId.disabled = false;
    btnSaveConfig.disabled = false;
    btnClearConfig.disabled = false;
}

function renderAuthState(state) {
    latestAuthState = state;
    updateConfigUiState(state);
    btnGoogleSignIn.style.display = state.signedIn ? "none" : "inline-flex";
    userProfileCard.style.display = state.signedIn ? "flex" : "none";
    btnRefreshDrive.disabled = !state.driveReady;

    if (state.signedIn && state.userProfile) {
        userAvatar.src = state.userProfile.picture || "";
        userName.textContent = state.userProfile.name || "Signed in";
        userEmail.textContent = state.userProfile.email || "";
        if (state.driveReady && lastListedEmail !== state.userProfile.email) {
            refreshDriveList();
        }
    } else {
        lastListedEmail = "";
        setDriveListEmpty(state.trustedOrigin ? "Sign in to load your saved flowcharts." : "Google OAuth is disabled on this origin.");
    }
}

function setupEventListeners() {
    btnGoogleSignIn.addEventListener("click", async () => {
        try {
            await window.FlowAuthDrive.startGoogleSignIn();
        } catch (error) {
            if (error.code === "needs-config") {
                showGoogleConfigModal(true);
                return;
            }
            alert(error.message);
        }
    });
    btnGoogleSignOut.addEventListener("click", () => window.FlowAuthDrive.signOut());
    btnOpenNewFlowchart.addEventListener("click", openNewFlowchart);
    btnRefreshDrive.addEventListener("click", refreshDriveList);
    btnConfigureGoogle.addEventListener("click", () => showGoogleConfigModal(true));
    closeConfigModal.addEventListener("click", () => showGoogleConfigModal(false));
    btnSaveConfig.addEventListener("click", () => {
        try {
            window.FlowAuthDrive.setLocalGoogleClientId(inputClientId.value);
            showGoogleConfigModal(false);
        } catch (error) {
            alert(error.message);
        }
    });
    btnClearConfig.addEventListener("click", () => {
        try {
            window.FlowAuthDrive.clearLocalGoogleClientId();
            showGoogleConfigModal(false);
        } catch (error) {
            alert(error.message);
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    cleanupStaleBootPayloads();
    setupEventListeners();
    await window.FlowAuthDrive.init({ onStateChange: renderAuthState });
});
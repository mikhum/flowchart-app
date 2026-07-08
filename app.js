// FlowCraft - Core Flowchart & Infrastructure Engine
const APP_BUILD = "login-separated";
const BUILD_INFO_PATH = "build-info.json";
const FLOWCRAFT_EDITOR_BOOT_PREFIX = "flowcraft_editor_boot:";
const FLOWCRAFT_DRIVE_SESSION_KEY = "flowcraft_drive_session";
const FLOWCRAFT_DRIVE_SESSION_TTL_MS = 1000 * 60 * 2; // 2 minutes (short-lived handoff token)

// --- Application State ---
let nodes = {};
let lines = [];

// Selection states
let selectedId = null; 
let selectedType = null; // 'node' | 'line'
let selectedNodeIds = new Set();
let copiedElement = null; // { type: 'node' | 'line', payload: object }
let pasteSerial = 0;

// Camera Viewport Panning and Zooming
let viewportTransform = { x: 0, y: 0, scale: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let isMarqueeSelecting = false;
let marqueeStartMouse = { x: 0, y: 0 };
let marqueeStartCanvas = { x: 0, y: 0 };
let marqueeCurrentCanvas = { x: 0, y: 0 };
let marqueeMoved = false;
let marqueeAdditive = false;
let marqueeBaseSelection = new Set();

// Node drag and resize states
let draggingNodeId = null;
let dragStartMouse = { x: 0, y: 0 };
let dragStartNodePos = { x: 0, y: 0 };
let dragDelta = { x: 0, y: 0 };
let dragStartNodePositions = {};

let resizingNodeId = null;
let resizeStartMouse = { x: 0, y: 0 };
let resizeStartNodeSize = { width: 0, height: 0 };

// Text label drag states
let draggingTextNodeId = null;
let dragStartTextOffset = { x: 0, y: 0 };

// Line creation states
let activePortNodeId = null;
let activePortName = null; // 'top' | 'right' | 'bottom' | 'left'
let lineDrawingMousePos = null;
let hoveredPortNodeId = null;
let hoveredPortName = null;
let draggingLineEnd = null; // { lineId: string, end: 'from' | 'to' }
let lineEndSnapTarget = null; // { nodeId: string, portName: string } | null
let draggingLineRouteId = null;
let lineRouteDragStartWaypoint = null;

// Snap to grid
let snapGridEnabled = true;
const GRID_SIZE = 20;

// Document Title & Local Saves
let currentDocName = "Untitled Flowchart";
let currentLocalSaveName = "";
let currentDriveFileId = null; // Google Drive File ID
let jsonExportFileHandle = null;

// Google OAuth & GIS States
const configuredGoogleClientId = (
    window.FLOWCRAFT_CONFIG &&
    typeof window.FLOWCRAFT_CONFIG.googleClientId === "string"
) ? window.FLOWCRAFT_CONFIG.googleClientId.trim() : "";
const configuredAllowedOrigins = Array.isArray(window.FLOWCRAFT_CONFIG?.allowedOrigins)
    ? window.FLOWCRAFT_CONFIG.allowedOrigins
        .map((origin) => String(origin || "").trim())
        .filter(Boolean)
    : [];
const allowLocalClientIdOverride = !!window.FLOWCRAFT_CONFIG?.allowLocalClientIdOverride;

function getStoredLocalGoogleClientId() {
    return String(localStorage.getItem("flowcraft_google_client_id") || "").trim();
}

function getEffectiveGoogleClientId() {
    const localClientId = getStoredLocalGoogleClientId();
    // Config-first by default. Local override can supersede only when explicitly enabled.
    if (allowLocalClientIdOverride && localClientId) return localClientId;
    if (configuredGoogleClientId) return configuredGoogleClientId;
    return localClientId;
}

let googleClientId = getEffectiveGoogleClientId();
let accessToken = "";
let userProfile = null;
let tokenClient = null;
const ALLOWED_GOOGLE_DOMAIN = "hummel.se";

function isValidGoogleClientId(clientId) {
    return /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(String(clientId || "").trim());
}

function isTrustedRuntimeOrigin() {
    if (configuredAllowedOrigins.length === 0) return true;
    return configuredAllowedOrigins.includes(window.location.origin);
}

function ensureTrustedOriginForGoogle() {
    if (isTrustedRuntimeOrigin()) return true;

    alert("Google OAuth is disabled on this origin. Configure allowedOrigins in app-config.js and Google Cloud OAuth origins.");
    return false;
}

function updateGoogleSecurityState() {
    const trustedOrigin = isTrustedRuntimeOrigin();
    if (trustedOrigin) return;

    googleClientId = "";
    accessToken = "";
    tokenClient = null;

    if (btnGoogleSignIn) btnGoogleSignIn.disabled = true;
    if (btnSaveGdrive) btnSaveGdrive.disabled = true;
    if (btnOpenGdrive) btnOpenGdrive.disabled = true;

    const profileCard = document.getElementById("user-profile");
    const signInContainer = document.getElementById("google-sign-in-btn");
    const driveActions = document.getElementById("gdrive-actions");
    if (profileCard) profileCard.style.display = "none";
    if (signInContainer) signInContainer.style.display = "none";
    if (driveActions) driveActions.style.display = "none";

    saveStatus.textContent = "OAuth disabled on this origin";
}

function updateGoogleConfigUiState() {
    if (!inputClientId || !btnSaveConfig || !btnClearConfig) return;

    const hasSharedConfig = !!configuredGoogleClientId;
    const overrideEnabled = allowLocalClientIdOverride;

    if (hasSharedConfig && !overrideEnabled) {
        inputClientId.value = configuredGoogleClientId;
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

function isAllowedGoogleDomain(payload) {
    if (!payload || typeof payload !== "object") return false;
    const email = String(payload.email || "").toLowerCase();
    const hd = String(payload.hd || "").toLowerCase();
    return hd === ALLOWED_GOOGLE_DOMAIN || email.endsWith("@" + ALLOWED_GOOGLE_DOMAIN);
}

// History Stack for Undo/Redo
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// Color presets
const BG_COLORS = [
    "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#e0f2fe", "#e0f7fa", 
    "#d1fae5", "#fef3c7", "#ffe4e6", "#f3e8ff", "#fae8ff", "#e0e7ff"
];
const BORDER_COLORS = [
    "#64748b", "#334155", "#0f172a", "#0ea5e9", "#0891b2", "#10b981", 
    "#f59e0b", "#f43f5e", "#8b5cf6", "#d946ef", "#4f46e5", "#cbd5e1"
];

const DEFAULT_LINE_SETTINGS_KEY = "flowcraft_default_line_settings";
const DEFAULT_LINE_SETTINGS = {
    lineType: "orthogonal",
    lineStyle: "solid",
    color: "#64748b",
    thickness: 2.5,
    hasArrow: "end"
};
let defaultLineSettings = { ...DEFAULT_LINE_SETTINGS };

function resolveCssColorVar(varName, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
}

function loadDefaultLineSettings() {
    try {
        const raw = localStorage.getItem(DEFAULT_LINE_SETTINGS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return;
        defaultLineSettings = {
            lineType: parsed.lineType || DEFAULT_LINE_SETTINGS.lineType,
            lineStyle: parsed.lineStyle || DEFAULT_LINE_SETTINGS.lineStyle,
            color: parsed.color || DEFAULT_LINE_SETTINGS.color,
            thickness: Number.isFinite(Number(parsed.thickness)) ? Number(parsed.thickness) : DEFAULT_LINE_SETTINGS.thickness,
            hasArrow: parsed.hasArrow || DEFAULT_LINE_SETTINGS.hasArrow
        };
    } catch (err) {
        defaultLineSettings = { ...DEFAULT_LINE_SETTINGS };
    }
}

function saveDefaultLineSettings() {
    localStorage.setItem(DEFAULT_LINE_SETTINGS_KEY, JSON.stringify(defaultLineSettings));
}

// --- DOM References ---
const workspace = document.getElementById("workspace");
const canvas = document.getElementById("canvas");
const nodesContainer = document.getElementById("nodes-container");
const lineHandlesLayer = document.getElementById("line-handles-layer");
const nodeHandlesLayer = document.getElementById("node-handles-layer");
const svgOverlay = document.getElementById("svg-overlay");
const marqueeSelectionBox = document.getElementById("marquee-selection-box");
const zoomIndicator = document.getElementById("zoom-indicator");
const docTitle = document.getElementById("doc-title");
const saveStatus = document.getElementById("save-status");
const buildId = document.getElementById("build-id");

// Sidebars & Properties
const sidebar = document.getElementById("sidebar");
const btnHideSidebar = document.getElementById("hide-sidebar");
const btnShowSidebar = document.getElementById("show-sidebar");
const propertiesPanel = document.getElementById("properties-panel");
const closeProperties = document.getElementById("close-properties");

// Control buttons
const ctrlZoomIn = document.getElementById("ctrl-zoom-in");
const ctrlZoomOut = document.getElementById("ctrl-zoom-out");
const ctrlResetView = document.getElementById("ctrl-reset-view");
const ctrlHelp = document.getElementById("ctrl-help");
const btnUndo = document.getElementById("btn-undo");
const btnRedo = document.getElementById("btn-redo");
const btnSnapGrid = document.getElementById("btn-snap-grid");
const btnClearCanvas = document.getElementById("btn-clear-canvas");

// Import/Export
const btnExportPDF = document.getElementById("btn-export-pdf");
const btnExportJson = document.getElementById("btn-export-json");
const btnImportJson = document.getElementById("btn-import-json");
const fileImportInput = document.getElementById("file-import-input");

// Local Workspaces
const btnNewFlowchart = document.getElementById("btn-new-flowchart");
const btnSaveLocal = document.getElementById("btn-save-local");
const localFilesList = document.getElementById("local-files-list");

// Modals
const helpModal = document.getElementById("help-modal");
const btnCloseHelp = document.getElementById("btn-close-help");
const closeHelpModal = document.getElementById("close-help-modal");

const googleConfigModal = document.getElementById("google-config-modal");
const btnConfigureGoogle = document.getElementById("btn-configure-google");
const btnGoogleSignIn = document.getElementById("btn-google-sign-in");
const closeConfigModal = document.getElementById("close-config-modal");
const btnSaveConfig = document.getElementById("btn-save-config");
const btnClearConfig = document.getElementById("btn-clear-config");
const inputClientId = document.getElementById("google-client-id");

const gdriveExplorerModal = document.getElementById("gdrive-explorer-modal");
const btnOpenGdrive = document.getElementById("btn-open-gdrive");
const btnSaveGdrive = document.getElementById("btn-save-gdrive");
const closeGdriveModal = document.getElementById("close-gdrive-modal");
const btnCloseGdriveExplorer = document.getElementById("btn-close-gdrive-explorer");
const gdriveFilesContainer = document.getElementById("gdrive-files-container");

// Properties Panel inputs
const propNodeSection = document.getElementById("prop-node-section");
const propLineSection = document.getElementById("prop-line-section");
const propText = document.getElementById("prop-text");
const propTextSize = document.getElementById("prop-text-size");
const propUrl = document.getElementById("prop-url");
const propTextPosition = document.getElementById("prop-text-position");
const propNodeWidth = document.getElementById("prop-node-width");
const propNodeHeight = document.getElementById("prop-node-height");
const propImageCropGroup = document.getElementById("prop-image-crop-group");
const propCropLeft = document.getElementById("prop-crop-left");
const propCropTop = document.getElementById("prop-crop-top");
const propCropRight = document.getElementById("prop-crop-right");
const propCropBottom = document.getElementById("prop-crop-bottom");
const btnResetCrop = document.getElementById("btn-reset-crop");
const propBorderWidth = document.getElementById("prop-border-width");
const propBorderStyle = document.getElementById("prop-border-style");
const propLineType = document.getElementById("prop-line-type");
const propLineStyle = document.getElementById("prop-line-style");
const propLineWidth = document.getElementById("prop-line-width");
const propLineArrows = document.getElementById("prop-line-arrows");
const btnSetDefaultLine = document.getElementById("btn-set-default-line");
const btnResetDefaultLine = document.getElementById("btn-reset-default-line");
const btnLineBringFront = document.getElementById("btn-line-bring-front");
const btnLineSendBack = document.getElementById("btn-line-send-back");
const btnDeleteSelected = document.getElementById("btn-delete-selected");

// --- Initialization ---
function setBuildBadgeLabel(label) {
    if (buildId) buildId.textContent = label;
}

async function updateBuildBadge() {
    setBuildBadgeLabel(`Commit ${APP_BUILD}`);

    try {
        const response = await fetch(`${BUILD_INFO_PATH}?v=${encodeURIComponent(APP_BUILD)}`, {
            cache: "no-store"
        });
        if (!response.ok) return;

        const buildInfo = await response.json();
        const shortSha = typeof buildInfo?.shortSha === "string" ? buildInfo.shortSha.trim() : "";
        if (!shortSha) return;

        setBuildBadgeLabel(`Commit ${shortSha}`);
        console.info("FlowCraft build:", shortSha);
        return;
    } catch (err) {
        console.warn("Unable to load build metadata.", err);
    }

    console.info("FlowCraft build:", APP_BUILD);
}

// --- Drive Session Hydration (from login page handoff) ---
function hydrateDriveSession() {
    try {
        const raw = localStorage.getItem(FLOWCRAFT_DRIVE_SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.createdAt || Date.now() - Number(parsed.createdAt) > FLOWCRAFT_DRIVE_SESSION_TTL_MS) {
            localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
            return;
        }
        if (!parsed.accessToken || !isAllowedGoogleDomain(parsed.userProfile)) {
            localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
            return;
        }
        accessToken = String(parsed.accessToken);
        userProfile = parsed.userProfile;
    } catch (err) {
        localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
    }
}

// --- Editor Boot Payload (flowchart loaded from login page) ---
function consumeEditorBootPayload() {
    const params = new URLSearchParams(window.location.search);
    const bootKey = params.get("bootKey");
    if (!bootKey) return false;

    const storageKey = FLOWCRAFT_EDITOR_BOOT_PREFIX + bootKey;
    try {
        const raw = localStorage.getItem(storageKey);
        localStorage.removeItem(storageKey);

        // Clean bootKey from URL so refresh doesn't try to reload it
        const url = new URL(window.location.href);
        url.searchParams.delete("bootKey");
        window.history.replaceState({}, document.title, url.toString());

        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || !payload.content) return false;

        currentDriveFileId = payload.fileId || null;
        currentLocalSaveName = "";
        loadSessionData(payload.content);
        return true;
    } catch (err) {
        return false;
    }
}

function init() {
    updateBuildBadge();
    updateGoogleConfigUiState();
    hydrateDriveSession();
    loadDefaultLineSettings();
    setupEventListeners();
    updateGoogleSecurityState();
    setupColorPickers();
    loadLocalFilesList();

    // Set snap grid button state
    updateSnapGridButtonState();

    // If opened from login with a boot payload, use that; otherwise restore autosave
    if (!consumeEditorBootPayload()) {
        const lastSession = localStorage.getItem("flowcraft_autosave");
        if (lastSession) {
            try {
                loadSessionData(JSON.parse(lastSession));
            } catch (e) {
                createStartingTemplate();
            }
        } else {
            createStartingTemplate();
        }
    }

    // Apply hydrated Drive session to UI
    if (userProfile) {
        document.getElementById("google-sign-in-btn").style.display = "none";
        const profileCard = document.getElementById("user-profile");
        if (profileCard) {
            profileCard.style.display = "flex";
            const av = document.getElementById("user-avatar");
            const nm = document.getElementById("user-name");
            const em = document.getElementById("user-email");
            if (av) av.src = userProfile.picture || "";
            if (nm) nm.textContent = userProfile.name || "Signed in";
            if (em) em.textContent = userProfile.email || "";
        }
        if (accessToken) {
            const da = document.getElementById("gdrive-actions");
            if (da) da.style.display = "flex";
        }
    }

    // Google GIS Auto login check
    if (googleClientId && isTrustedRuntimeOrigin()) {
        inputClientId.value = googleClientId;
        initGoogleClient();
    }

    saveHistory(); // initial state
    render();
    centerCanvas();
}

function createStartingTemplate() {
    nodes = {
        "start_node": {
            id: "start_node",
            type: "shape",
            shapeType: "terminator",
            x: 0,
            y: -100,
            width: 140,
            height: 50,
            text: "Start Process",
            textOffset: { x: 0, y: 0 },
            textSize: 14,
            bgColor: "#e0f2fe",
            borderColor: "#0ea5e9",
            borderWidth: 2,
            borderStyle: "solid",
            url: ""
        },
        "process_node": {
            id: "process_node",
            type: "shape",
            shapeType: "rectangle",
            x: 0,
            y: 60,
            width: 150,
            height: 60,
            text: "Double click to edit\nDrag ports to link",
            textOffset: { x: 0, y: 0 },
            textSize: 13,
            bgColor: "#ffffff",
            borderColor: "#64748b",
            borderWidth: 2,
            borderStyle: "solid",
            url: ""
        }
    };
    lines = [
        {
            id: "line_start",
            fromId: "start_node",
            fromPort: "bottom",
            toId: "process_node",
            toPort: "top",
            lineType: "orthogonal",
            lineStyle: "solid",
            color: "#64748b",
            thickness: 2.5,
            hasArrow: "end"
        }
    ];
    currentDocName = "Process Workflow";
    docTitle.textContent = currentDocName;
}

function centerCanvas() {
    const rect = workspace.getBoundingClientRect();
    viewportTransform.x = rect.width / 2;
    viewportTransform.y = rect.height / 2;
    viewportTransform.scale = 1.0;
    updateCanvasTransform();
}

// --- Coordinate Conversions ---
function screenToCanvas(clientX, clientY) {
    const rect = workspace.getBoundingClientRect();
    return {
        x: (clientX - rect.left - viewportTransform.x) / viewportTransform.scale,
        y: (clientY - rect.top - viewportTransform.y) / viewportTransform.scale
    };
}

function snap(val) {
    return snapGridEnabled ? Math.round(val / GRID_SIZE) * GRID_SIZE : Math.round(val);
}

// --- Color Pickers Setup ---
function setupColorPickers() {
    const bgGrid = document.getElementById("prop-bgcolor-grid");
    const borderGrid = document.getElementById("prop-bordercolor-grid");
    const lineGrid = document.getElementById("prop-linecolor-grid");
    
    bgGrid.innerHTML = "";
    borderGrid.innerHTML = "";
    lineGrid.innerHTML = "";
    
    BG_COLORS.forEach(color => {
        const swatch = document.createElement("div");
        swatch.className = "color-swatch";
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.addEventListener("click", () => selectBgColor(color));
        bgGrid.appendChild(swatch);
    });
    
    BORDER_COLORS.forEach(color => {
        // for border
        const swatchB = document.createElement("div");
        swatchB.className = "color-swatch";
        swatchB.style.backgroundColor = color;
        swatchB.dataset.color = color;
        swatchB.addEventListener("click", () => selectBorderColor(color));
        borderGrid.appendChild(swatchB);
        
        // for lines
        const swatchL = document.createElement("div");
        swatchL.className = "color-swatch";
        swatchL.style.backgroundColor = color;
        swatchL.dataset.color = color;
        swatchL.addEventListener("click", () => selectLineColor(color));
        lineGrid.appendChild(swatchL);
    });
}

function selectBgColor(color) {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].bgColor = color;
        });
        saveHistory();
        saveAutosave();
        render();
        updatePropertiesPanel();
    }
}

function selectBorderColor(color) {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].borderColor = color;
        });
        saveHistory();
        saveAutosave();
        render();
        updatePropertiesPanel();
    }
}

function selectLineColor(color) {
    if (selectedType === "line") {
        const line = lines.find(l => l.id === selectedId);
        if (line) {
            line.color = color;
            saveHistory();
            render();
            updatePropertiesPanel();
        }
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Zooming (Wheel)
    workspace.addEventListener("wheel", handleWheel, { passive: false });
    workspace.addEventListener("contextmenu", handleWorkspaceContextMenu);

    // Workspace Panning & Click Off
    workspace.addEventListener("pointerdown", handleWorkspacePointerDown);
    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    window.addEventListener("blur", handleGlobalPointerAbort);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) handleGlobalPointerAbort();
    });
    
    // Drag and Drop from Sidebar Library
    const paletteItems = document.querySelectorAll(".palette-item");
    paletteItems.forEach(item => {
        item.addEventListener("dragstart", handleLibraryDragStart);
    });
    
    // Canvas Drop Events
    workspace.addEventListener("dragover", e => e.preventDefault());
    workspace.addEventListener("drop", handleCanvasDrop);

    // Keyboard Shortcuts
    window.addEventListener("keydown", handleKeyDown);
    
    // Title Input
    docTitle.addEventListener("blur", () => {
        const newName = docTitle.textContent.trim();
        if (newName && newName !== currentDocName) {
            currentDocName = newName;
            saveHistory();
            saveAutosave();
        } else {
            docTitle.textContent = currentDocName;
        }
    });
    docTitle.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            docTitle.blur();
        }
    });

    // Sidebar Toggles
    btnHideSidebar.addEventListener("click", () => {
        sidebar.classList.add("hidden");
        btnShowSidebar.style.display = "flex";
    });
    btnShowSidebar.addEventListener("click", () => {
        sidebar.classList.remove("hidden");
        btnShowSidebar.style.display = "none";
    });
    
    // View controls
    ctrlZoomIn.addEventListener("click", () => zoom(1.15));
    ctrlZoomOut.addEventListener("click", () => zoom(0.85));
    ctrlResetView.addEventListener("click", centerCanvas);
    ctrlHelp.addEventListener("click", () => showHelpModal(true));
    
    // Tool buttons
    btnUndo.addEventListener("click", undo);
    btnRedo.addEventListener("click", redo);
    btnSnapGrid.addEventListener("click", toggleSnapGrid);
    btnClearCanvas.addEventListener("click", handleClearCanvas);
    
    // Local workspace manager
    btnNewFlowchart.addEventListener("click", handleNewFlowchart);
    btnSaveLocal.addEventListener("click", handleSaveLocal);
    
    // Document Exports
    btnExportPDF.addEventListener("click", exportToPDF);
    btnExportJson.addEventListener("click", exportJsonFile);
    btnImportJson.addEventListener("click", () => {
        fileImportInput.click();
    });
    fileImportInput.addEventListener("change", importJsonFile);

    // Modals buttons
    closeHelpModal.addEventListener("click", () => showHelpModal(false));
    btnCloseHelp.addEventListener("click", () => showHelpModal(false));
    
    if (btnConfigureGoogle) btnConfigureGoogle.addEventListener("click", () => showGoogleConfigModal(true));
    if (btnGoogleSignIn) btnGoogleSignIn.addEventListener("click", startGoogleSignIn);
    closeConfigModal.addEventListener("click", () => showGoogleConfigModal(false));
    btnSaveConfig.addEventListener("click", saveGoogleConfig);
    btnClearConfig.addEventListener("click", clearGoogleConfig);
    
    if (btnOpenGdrive) btnOpenGdrive.addEventListener("click", openGoogleDriveExplorer);
    btnSaveGdrive.addEventListener("click", saveToGoogleDrive);
    closeGdriveModal.addEventListener("click", () => showGdriveExplorer(false));
    btnCloseGdriveExplorer.addEventListener("click", () => showGdriveExplorer(false));

    // Properties panel bindings
    closeProperties.addEventListener("click", () => selectElement(null));
    propText.addEventListener("input", updateSelectedNodeText);
    propTextSize.addEventListener("input", updateSelectedNodeTextSize);
    propUrl.addEventListener("input", updateSelectedNodeUrl);
    propTextPosition.addEventListener("change", updateSelectedNodeTextPosition);
    propNodeWidth.addEventListener("change", updateSelectedNodeWidth);
    propNodeHeight.addEventListener("change", updateSelectedNodeHeight);
    propCropLeft.addEventListener("input", updateSelectedNodeCrop);
    propCropTop.addEventListener("input", updateSelectedNodeCrop);
    propCropRight.addEventListener("input", updateSelectedNodeCrop);
    propCropBottom.addEventListener("input", updateSelectedNodeCrop);
    btnResetCrop.addEventListener("click", resetSelectedNodeCrop);
    propBorderWidth.addEventListener("change", updateSelectedNodeBorderWidth);
    propBorderStyle.addEventListener("change", updateSelectedNodeBorderStyle);
    
    propLineType.addEventListener("change", updateSelectedLineType);
    propLineStyle.addEventListener("change", updateSelectedLineStyle);
    propLineWidth.addEventListener("change", updateSelectedLineThickness);
    propLineArrows.addEventListener("change", updateSelectedLineArrows);
    btnLineBringFront.addEventListener("click", bringToFront);
    btnLineSendBack.addEventListener("click", sendToBack);
    btnSetDefaultLine.addEventListener("click", setSelectedLineAsDefault);
    btnResetDefaultLine.addEventListener("click", resetDefaultLineSettings);
    btnDeleteSelected.addEventListener("click", deleteSelectedElement);
    
    document.getElementById("btn-bring-front").addEventListener("click", bringToFront);
    document.getElementById("btn-send-back").addEventListener("click", sendToBack);

    // Clipboard pasting
    window.addEventListener("paste", handleClipboardPaste);
}

// --- Zooming ---
function handleWheel(e) {
    e.preventDefault();
    const zoomFactor = 1.08;
    const direction = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
    
    const rect = workspace.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasMouseX = (mouseX - viewportTransform.x) / viewportTransform.scale;
    const canvasMouseY = (mouseY - viewportTransform.y) / viewportTransform.scale;

    let newScale = viewportTransform.scale * direction;
    newScale = Math.max(0.15, Math.min(3.0, newScale));

    viewportTransform.scale = newScale;
    viewportTransform.x = mouseX - canvasMouseX * newScale;
    viewportTransform.y = mouseY - canvasMouseY * newScale;

    updateCanvasTransform();
}

function zoom(factor) {
    const rect = workspace.getBoundingClientRect();
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    
    const canvasMidX = (midX - viewportTransform.x) / viewportTransform.scale;
    const canvasMidY = (midY - viewportTransform.y) / viewportTransform.scale;
    
    let newScale = viewportTransform.scale * factor;
    newScale = Math.max(0.15, Math.min(3.0, newScale));
    
    viewportTransform.scale = newScale;
    viewportTransform.x = midX - canvasMidX * newScale;
    viewportTransform.y = midY - canvasMidY * newScale;
    
    updateCanvasTransform();
}

function updateCanvasTransform() {
    canvas.style.transform = `translate(${viewportTransform.x}px, ${viewportTransform.y}px) scale(${viewportTransform.scale})`;
    zoomIndicator.textContent = `${Math.round(viewportTransform.scale * 100)}%`;
}

function setMarqueeBoxVisibility(visible) {
    if (!marqueeSelectionBox) return;
    marqueeSelectionBox.style.display = visible ? "block" : "none";
}

function updateMarqueeBox() {
    if (!marqueeSelectionBox) return;
    const left = Math.min(marqueeStartCanvas.x, marqueeCurrentCanvas.x);
    const top = Math.min(marqueeStartCanvas.y, marqueeCurrentCanvas.y);
    const width = Math.abs(marqueeCurrentCanvas.x - marqueeStartCanvas.x);
    const height = Math.abs(marqueeCurrentCanvas.y - marqueeStartCanvas.y);
    marqueeSelectionBox.style.left = `${left}px`;
    marqueeSelectionBox.style.top = `${top}px`;
    marqueeSelectionBox.style.width = `${width}px`;
    marqueeSelectionBox.style.height = `${height}px`;
}

function getMarqueeRect() {
    return {
        left: Math.min(marqueeStartCanvas.x, marqueeCurrentCanvas.x),
        right: Math.max(marqueeStartCanvas.x, marqueeCurrentCanvas.x),
        top: Math.min(marqueeStartCanvas.y, marqueeCurrentCanvas.y),
        bottom: Math.max(marqueeStartCanvas.y, marqueeCurrentCanvas.y)
    };
}

function getMarqueeNodeHits() {
    const rect = getMarqueeRect();
    const hits = new Set();
    Object.values(nodes).forEach(node => {
        const nodeLeft = node.x - (node.width || 120) / 2;
        const nodeRight = node.x + (node.width || 120) / 2;
        const nodeTop = node.y - (node.height || 60) / 2;
        const nodeBottom = node.y + (node.height || 60) / 2;
        const overlaps = !(nodeRight < rect.left || nodeLeft > rect.right || nodeBottom < rect.top || nodeTop > rect.bottom);
        if (overlaps) hits.add(node.id);
    });
    return hits;
}

function applyNodeSelection(nodeIds, options = {}) {
    const validNodeIds = Array.from(nodeIds).filter(nodeId => !!nodes[nodeId]);
    selectedNodeIds = new Set(validNodeIds);
    if (selectedNodeIds.size > 0) {
        selectedType = "node";
        selectedId = validNodeIds[validNodeIds.length - 1];
    } else {
        selectedType = null;
        selectedId = null;
    }

    document.body.classList.toggle("line-edit-mode", selectedType === "line" && !!selectedId);
    document.body.classList.toggle("node-multi-select-mode", selectedType === "node" && selectedNodeIds.size > 1);
    Object.keys(nodes).forEach(nodeId => {
        const el = document.getElementById("node-" + nodeId);
        if (el) el.classList.toggle("selected", selectedType === "node" && selectedNodeIds.has(nodeId));
    });

    if (!options.silent) {
        updatePropertiesPanel();
        renderConnectors();
    }
}

function updateMarqueeSelection() {
    const hits = getMarqueeNodeHits();
    const selection = marqueeAdditive ? new Set([...marqueeBaseSelection, ...hits]) : hits;
    applyNodeSelection(selection, { silent: true });
}

// --- Panning & Drag/Drop Pointer Handling ---
function handleWorkspacePointerDown(e) {
    if (e.target.closest(".node") || e.target.closest(".properties-panel") || e.target.closest(".sidebar") || e.target.closest(".floating-controls") || e.target.closest(".modal") || e.target.closest(".connector-line-overlay") || e.target.closest(".line-end-handle-ui")) {
        return;
    }

    // Keep panning available with middle or right mouse button.
    if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        isPanning = true;
        canvas.classList.add("grabbing");
        panStart = { x: e.clientX, y: e.clientY };
        panOffset = { x: viewportTransform.x, y: viewportTransform.y };
        workspace.setPointerCapture(e.pointerId);
        return;
    }

    if (e.button !== 0) return;

    marqueeAdditive = e.ctrlKey || e.metaKey || e.shiftKey;
    marqueeBaseSelection = marqueeAdditive ? new Set(selectedNodeIds) : new Set();
    isMarqueeSelecting = true;
    marqueeMoved = false;
    marqueeStartMouse = { x: e.clientX, y: e.clientY };
    marqueeStartCanvas = screenToCanvas(e.clientX, e.clientY);
    marqueeCurrentCanvas = { ...marqueeStartCanvas };
    updateMarqueeBox();
    setMarqueeBoxVisibility(false);
    workspace.setPointerCapture(e.pointerId);
}

function handleWorkspaceContextMenu(e) {
    if (e.target.closest(".canvas") || e.target.closest(".node") || e.target.closest(".svg-connector-overlay") || e.target.closest(".line-handles-layer")) {
        e.preventDefault();
    }
}

function hasActivePointerInteraction() {
    return isPanning || isMarqueeSelecting || !!draggingLineEnd || !!draggingLineRouteId || !!draggingNodeId || !!resizingNodeId || !!draggingTextNodeId || !!(activePortNodeId && activePortName);
}

function handleGlobalPointerAbort() {
    if (!hasActivePointerInteraction()) return;
    handleGlobalPointerUp({ pointerId: -1 });
}

function handleGlobalPointerMove(e) {
    // Failsafe release when pointerup happens outside app/window and is missed.
    if (hasActivePointerInteraction() && e.buttons === 0) {
        handleGlobalPointerUp(e);
        return;
    }

    if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        viewportTransform.x = panOffset.x + dx;
        viewportTransform.y = panOffset.y + dy;
        updateCanvasTransform();
    } else if (isMarqueeSelecting) {
        marqueeCurrentCanvas = screenToCanvas(e.clientX, e.clientY);
        const moveDistance = Math.hypot(e.clientX - marqueeStartMouse.x, e.clientY - marqueeStartMouse.y);
        if (!marqueeMoved && moveDistance > 4) {
            marqueeMoved = true;
            setMarqueeBoxVisibility(true);
        }

        if (marqueeMoved) {
            updateMarqueeBox();
            updateMarqueeSelection();
        }
    } else if (draggingLineEnd && draggingLineEnd.lineId) {
        const coords = screenToCanvas(e.clientX, e.clientY);
        lineDrawingMousePos = coords;

        lineEndSnapTarget = findNearestPort(coords.x, coords.y, 26);

        document.querySelectorAll(".port").forEach(p => p.classList.remove("snapped"));
        if (lineEndSnapTarget) {
            const portEl = document.querySelector(`#node-${lineEndSnapTarget.nodeId} .port-${lineEndSnapTarget.portName}`);
            if (portEl) portEl.classList.add("snapped");
        }
        renderConnectors();
    } else if (draggingLineRouteId) {
        const line = lines.find(l => l.id === draggingLineRouteId);
        if (line) {
            const coords = screenToCanvas(e.clientX, e.clientY);
            line.manualWaypoint = {
                x: snap(coords.x),
                y: snap(coords.y)
            };
            renderConnectors();
        }
    } else if (draggingNodeId && nodes[draggingNodeId]) {
        // Move shape node
        const coords = screenToCanvas(e.clientX, e.clientY);
        const startCoords = screenToCanvas(dragStartMouse.x, dragStartMouse.y);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;

        const draggedSelection = (selectedType === "node" && selectedNodeIds.has(draggingNodeId))
            ? Array.from(selectedNodeIds)
            : [draggingNodeId];

        draggedSelection.forEach(nodeId => {
            if (!nodes[nodeId]) return;
            const startPos = dragStartNodePositions[nodeId] || { x: nodes[nodeId].x, y: nodes[nodeId].y };
            nodes[nodeId].x = snap(startPos.x + dx);
            nodes[nodeId].y = snap(startPos.y + dy);

            const nodeEl = document.getElementById("node-" + nodeId);
            if (nodeEl) {
                nodeEl.style.left = `${nodes[nodeId].x}px`;
                nodeEl.style.top = `${nodes[nodeId].y}px`;
            }
        });
        renderConnectors();
    } else if (resizingNodeId && nodes[resizingNodeId]) {
        // Resize shape node
        const coords = screenToCanvas(e.clientX, e.clientY);
        const startCoords = screenToCanvas(resizeStartMouse.x, resizeStartMouse.y);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;
        
        // Calculate new size
        const newW = snap(resizeStartNodeSize.width + dx);
        const newH = snap(resizeStartNodeSize.height + dy);
        
        nodes[resizingNodeId].width = Math.max(60, newW);
        nodes[resizingNodeId].height = Math.max(30, newH);
        
        const nodeEl = document.getElementById("node-" + resizingNodeId);
        if (nodeEl) {
            nodeEl.style.width = `${nodes[resizingNodeId].width}px`;
            nodeEl.style.height = `${nodes[resizingNodeId].height}px`;
            
            // Re-render shape SVGs to reflect new dimensions
            const svgWrapper = nodeEl.querySelector(".shape-svg-wrapper");
            if (svgWrapper) {
                svgWrapper.innerHTML = generateShapeSVG(nodes[resizingNodeId]);
            }
        }
        renderConnectors();
    } else if (draggingTextNodeId && nodes[draggingTextNodeId]) {
        // Drag shape text offset
        const coords = screenToCanvas(e.clientX, e.clientY);
        const startCoords = screenToCanvas(dragStartMouse.x, dragStartMouse.y);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;
        
        nodes[draggingTextNodeId].textOffset.x = dragStartTextOffset.x + dx;
        nodes[draggingTextNodeId].textOffset.y = dragStartTextOffset.y + dy;
        
        const nodeEl = document.getElementById("node-" + draggingTextNodeId);
        if (nodeEl) {
            const textContainer = nodeEl.querySelector(".node-text-container");
            if (textContainer) {
                textContainer.style.transform = `translate(${nodes[draggingTextNodeId].textOffset.x}px, ${nodes[draggingTextNodeId].textOffset.y}px)`;
            }
        }
    } else if (activePortNodeId && activePortName) {
        // Draw connector line preview
        const coords = screenToCanvas(e.clientX, e.clientY);
        lineDrawingMousePos = coords;
        
        // Check for snapping to other ports
        checkPortHoverSnap(coords.x, coords.y);
        renderConnectors();
    }
}

function handleGlobalPointerUp(e) {
    if (isPanning) {
        isPanning = false;
        canvas.classList.remove("grabbing");
        try { workspace.releasePointerCapture(e.pointerId); } catch(err) {}
    } else if (isMarqueeSelecting) {
        if (marqueeMoved) {
            updateMarqueeSelection();
            applyNodeSelection(selectedNodeIds);
        } else if (!marqueeAdditive) {
            selectElement(null);
        }

        isMarqueeSelecting = false;
        marqueeMoved = false;
        setMarqueeBoxVisibility(false);
        try { workspace.releasePointerCapture(e.pointerId); } catch(err) {}
    } else if (draggingLineEnd) {
        const line = lines.find(l => l.id === draggingLineEnd.lineId);
        if (line && lineEndSnapTarget) {
            if (draggingLineEnd.end === "from") {
                line.fromId = lineEndSnapTarget.nodeId;
                line.fromPort = lineEndSnapTarget.portName;
            } else {
                line.toId = lineEndSnapTarget.nodeId;
                line.toPort = lineEndSnapTarget.portName;
            }
            saveHistory();
            saveAutosave();
        }

        draggingLineEnd = null;
        lineEndSnapTarget = null;
        lineDrawingMousePos = null;
        document.body.classList.remove("line-end-dragging");
        document.querySelectorAll(".port").forEach(p => p.classList.remove("snapped"));
        renderConnectors();
    } else if (draggingLineRouteId) {
        const line = lines.find(l => l.id === draggingLineRouteId);
        const before = lineRouteDragStartWaypoint;
        const after = line ? line.manualWaypoint : null;
        const moved = !!line && (
            !before ||
            !after ||
            before.x !== after.x ||
            before.y !== after.y
        );

        draggingLineRouteId = null;
        lineRouteDragStartWaypoint = null;
        document.body.classList.remove("line-route-dragging");
        if (moved) {
            saveHistory();
            saveAutosave();
        }
        renderConnectors();
    } else if (draggingNodeId) {
        const draggedSelection = (selectedType === "node" && selectedNodeIds.has(draggingNodeId))
            ? Array.from(selectedNodeIds)
            : [draggingNodeId];
        const didMove = draggedSelection.some(nodeId => {
            const startPos = dragStartNodePositions[nodeId];
            return startPos && nodes[nodeId] && (startPos.x !== nodes[nodeId].x || startPos.y !== nodes[nodeId].y);
        });
        draggingNodeId = null;
        dragStartNodePositions = {};
        if (didMove) {
            saveHistory();
            saveAutosave();
        }
    } else if (resizingNodeId) {
        resizingNodeId = null;
        saveHistory();
        saveAutosave();
    } else if (draggingTextNodeId) {
        draggingTextNodeId = null;
        saveHistory();
        saveAutosave();
    } else if (activePortNodeId && activePortName) {
        // Complete or cancel line
        if (hoveredPortNodeId && hoveredPortName) {
            createConnectorLine(activePortNodeId, activePortName, hoveredPortNodeId, hoveredPortName);
        }
        
        activePortNodeId = null;
        activePortName = null;
        lineDrawingMousePos = null;
        
        // Clear highlights
        document.querySelectorAll(".port").forEach(el => el.classList.remove("snapped"));
        hoveredPortNodeId = null;
        hoveredPortName = null;
        
        document.body.classList.remove("drawing-line");
        
        renderConnectors();
    }
}

// --- Drag & Drop Library Shapes ---
const LIBRARY_SHAPE_TYPES = new Set([
    "rectangle", "diamond", "terminator", "parallelogram", "cylinder", "document", "hexagon", "circle",
    "text-box", "sticky-note", "cloud"
]);

let libraryDragShapeType = "";
function handleLibraryDragStart(e) {
    libraryDragShapeType = e.currentTarget.dataset.shape;
    e.dataTransfer.setData("application/x-flowcraft-shape", libraryDragShapeType);
    e.dataTransfer.setData("text/plain", libraryDragShapeType);
    
    // Create preview cursor ghost
    const preview = document.createElement("div");
    preview.className = "drag-preview-helper";
    preview.textContent = e.currentTarget.querySelector("span").textContent;
    preview.style.backgroundColor = resolveCssColorVar("--accent-primary-light", "#e0f2fe");
    preview.style.border = `1px solid ${resolveCssColorVar("--accent-primary", "#0ea5e9")}`;
    preview.style.padding = "6px 12px";
    preview.style.borderRadius = "6px";
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 15, 10);
    
    // Remove cursor helper shortly after dragging starts
    setTimeout(() => preview.remove(), 50);
}

function handleCanvasDrop(e) {
    e.preventDefault();
    const shapeType = e.dataTransfer.getData("application/x-flowcraft-shape") || e.dataTransfer.getData("text/plain");
    if (!LIBRARY_SHAPE_TYPES.has(shapeType)) return;

    // Reset transient pointer modes to avoid stale interaction locks after DnD.
    resetTransientInteractions();
    
    const coords = screenToCanvas(e.clientX, e.clientY);
    addNewShapeNode(shapeType, snap(coords.x), snap(coords.y));
}

function resetTransientInteractions() {
    isPanning = false;
    isMarqueeSelecting = false;
    marqueeMoved = false;
    draggingNodeId = null;
    resizingNodeId = null;
    draggingTextNodeId = null;
    activePortNodeId = null;
    activePortName = null;
    hoveredPortNodeId = null;
    hoveredPortName = null;
    lineDrawingMousePos = null;
    draggingLineEnd = null;
    lineEndSnapTarget = null;
    draggingLineRouteId = null;
    lineRouteDragStartWaypoint = null;
    setMarqueeBoxVisibility(false);
    document.body.classList.remove("drawing-line", "line-end-dragging", "line-route-dragging");
    document.querySelectorAll(".port").forEach(el => el.classList.remove("snapped"));
}

function addNewShapeNode(shapeType, x, y) {
    const id = "node_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const isTextBox = shapeType === "text-box";
    const isStickyNote = shapeType === "sticky-note";
    const isCloud = shapeType === "cloud";
    
    nodes[id] = {
        id: id,
        type: "shape",
        shapeType: shapeType,
        x: x,
        y: y,
        width: 120,
        height: isTextBox ? 36 : (isStickyNote ? 90 : (isCloud ? 72 : 60)),
        text: isTextBox ? "Text" : (isStickyNote ? "Notering" : "New Shape"),
        textOffset: { x: 0, y: 0 },
        textSize: 14,
        bgColor: isTextBox ? "transparent" : (isStickyNote ? "#fef08a" : "#ffffff"),
        borderColor: isTextBox ? "transparent" : (isStickyNote ? "#ca8a04" : "#64748b"),
        borderWidth: isTextBox ? 0 : (isStickyNote ? 1 : 2),
        borderStyle: "solid",
        textPosition: "center",
        url: ""
    };
    
    saveHistory();
    saveAutosave();
    render();
    selectElement(id, "node");
}

// --- Ports & Snap Checking ---
function checkPortHoverSnap(canvasX, canvasY) {
    let bestSnap = null;
    let minDistance = 24; // snapping radius
    
    Object.keys(nodes).forEach(nodeId => {
        // Do not connect back to the same node
        if (nodeId === activePortNodeId) return;
        
        const node = nodes[nodeId];
        const ports = getPortCoords(nodeId);
        
        Object.keys(ports).forEach(portName => {
            const port = ports[portName];
            const dist = Math.hypot(canvasX - port.x, canvasY - port.y);
            if (dist < minDistance) {
                minDistance = dist;
                bestSnap = { nodeId, portName };
            }
        });
    });
    
    // Reset previous port snapped visuals
    document.querySelectorAll(".port").forEach(p => p.classList.remove("snapped"));
    
    if (bestSnap) {
        hoveredPortNodeId = bestSnap.nodeId;
        hoveredPortName = bestSnap.portName;
        
        const portEl = document.querySelector(`#node-${bestSnap.nodeId} .port-${bestSnap.portName}`);
        if (portEl) portEl.classList.add("snapped");
    } else {
        hoveredPortNodeId = null;
        hoveredPortName = null;
    }
}

function findNearestPort(canvasX, canvasY, radius = 24) {
    let bestSnap = null;
    let minDistance = radius;

    Object.keys(nodes).forEach(nodeId => {
        const node = nodes[nodeId];
        const ports = getPortCoords(nodeId);

        Object.keys(ports).forEach(portName => {
            const port = ports[portName];
            const dist = Math.hypot(canvasX - port.x, canvasY - port.y);
            if (dist < minDistance) {
                minDistance = dist;
                bestSnap = { nodeId, portName };
            }
        });
    });

    return bestSnap;
}

function getPortCoords(nodeId) {
    const node = nodes[nodeId];
    if (!node) return {};
    
    return {
        top: { x: node.x, y: node.y - node.height / 2 },
        right: { x: node.x + node.width / 2, y: node.y },
        bottom: { x: node.x, y: node.y + node.height / 2 },
        left: { x: node.x - node.width / 2, y: node.y }
    };
}

function createConnectorLine(fromId, fromPort, toId, toPort) {
    // Check if line already exists
    const exists = lines.some(l => 
        l.fromId === fromId && l.fromPort === fromPort && 
        l.toId === toId && l.toPort === toPort
    );
    if (exists) return;
    
    const id = "line_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    lines.push({
        id: id,
        fromId: fromId,
        fromPort: fromPort,
        toId: toId,
        toPort: toPort,
        lineType: defaultLineSettings.lineType,
        lineStyle: defaultLineSettings.lineStyle,
        color: defaultLineSettings.color,
        thickness: defaultLineSettings.thickness,
        hasArrow: defaultLineSettings.hasArrow
    });
    
    saveHistory();
    saveAutosave();
    render();
    selectElement(id, "line");
}

// --- Render Elements ---
function render() {
    // Remove obsolete node elements
    const currentElements = nodesContainer.querySelectorAll(".node");
    currentElements.forEach(el => {
        const id = el.id.replace("node-", "");
        if (!nodes[id]) el.remove();
    });

    if (nodeHandlesLayer) nodeHandlesLayer.innerHTML = "";
    
    // Render/Update nodes
    Object.keys(nodes).forEach(id => {
        const node = nodes[id];
        let nodeEl = document.getElementById("node-" + id);
        
        if (!nodeEl) {
            nodeEl = document.createElement("div");
            nodeEl.id = "node-" + id;
            nodeEl.className = "node";
            nodeEl.setAttribute("draggable", "false");
            nodeEl.addEventListener("dragstart", (e) => e.preventDefault());
            
            // Port HTML templates
            ["top", "right", "bottom", "left"].forEach(p => {
                const portEl = document.createElement("div");
                portEl.className = `port port-${p}`;
                portEl.addEventListener("pointerdown", (e) => {
                    e.stopPropagation();
                    e.preventDefault(); // Prevent text selection and browser drag-cancellation
                    activePortNodeId = id;
                    activePortName = p;
                    lineDrawingMousePos = getPortCoords(id)[p];
                    portEl.setPointerCapture(e.pointerId);
                    document.body.classList.add("drawing-line");
                });
                nodeEl.appendChild(portEl);
            });
            
            // Text Container template
            const textContainer = document.createElement("div");
            textContainer.className = "node-text-container";
            const textSpan = document.createElement("span");
            textSpan.className = "node-text";
            textContainer.appendChild(textSpan);
            
            // Drag handle to move text offset
            textContainer.addEventListener("pointerdown", (e) => {
                // Text offset dragging is explicit so normal drag still moves the node.
                if (e.altKey && selectedType === "node" && selectedNodeIds.size === 1 && selectedNodeIds.has(id)) {
                    e.stopPropagation();
                    draggingTextNodeId = id;
                    dragStartMouse = { x: e.clientX, y: e.clientY };
                    dragStartTextOffset = { x: node.textOffset.x, y: node.textOffset.y };
                    textContainer.setPointerCapture(e.pointerId);
                }
            });
            
            nodeEl.appendChild(textContainer);
            
            // Double click to edit
            nodeEl.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                startTextEdit(id);
            });
            
            // Pointer Down for Selection & Dragging Shape
            nodeEl.addEventListener("pointerdown", (e) => {
                if (e.target.classList.contains("port") || e.target.classList.contains("resize-handle")) return;
                if (draggingLineEnd || document.body.classList.contains("line-end-dragging")) return;
                e.stopPropagation();
                const isToggleSelection = e.ctrlKey || e.metaKey;
                if (isToggleSelection) {
                    selectElement(id, "node", { toggle: true });
                    if (!selectedNodeIds.has(id)) return;
                } else if (!(selectedType === "node" && selectedNodeIds.has(id))) {
                    selectElement(id, "node");
                }
                
                draggingNodeId = id;
                dragStartMouse = { x: e.clientX, y: e.clientY };
                dragStartNodePos = { x: node.x, y: node.y };
                dragStartNodePositions = {};
                const dragTargets = (selectedType === "node" && selectedNodeIds.size > 0)
                    ? Array.from(selectedNodeIds)
                    : [id];
                dragTargets.forEach(nodeId => {
                    if (!nodes[nodeId]) return;
                    dragStartNodePositions[nodeId] = { x: nodes[nodeId].x, y: nodes[nodeId].y };
                });
                nodeEl.setPointerCapture(e.pointerId);
            });
            
            nodesContainer.appendChild(nodeEl);
        }
        
        // Node Properties Updates
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
        nodeEl.style.width = `${node.width}px`;
        nodeEl.style.height = `${node.height}px`;
        nodeEl.style.zIndex = node.zIndex || 10;
        
        // Handle selection state styling
        nodeEl.classList.toggle("selected", selectedType === "node" && selectedNodeIds.has(id));
        nodeEl.classList.toggle("image-node", node.type === "image");
        
        // Inline shape template SVG or image container
        let svgWrapper = nodeEl.querySelector(".shape-svg-wrapper");
        let imageElement = nodeEl.querySelector(".node-image-img");
        
        if (node.type === "image") {
            if (svgWrapper) svgWrapper.remove();
            if (!imageElement) {
                imageElement = document.createElement("img");
                imageElement.className = "node-image-img";
                imageElement.setAttribute("draggable", "false");
                nodeEl.appendChild(imageElement);
            }
            imageElement.src = node.imageUrl;

            const crop = node.crop || { left: 0, top: 0, right: 0, bottom: 0 };
            const left = Math.max(0, Math.min(0.9, Number(crop.left) || 0));
            const top = Math.max(0, Math.min(0.9, Number(crop.top) || 0));
            const right = Math.max(0, Math.min(0.9, Number(crop.right) || 0));
            const bottom = Math.max(0, Math.min(0.9, Number(crop.bottom) || 0));
            const visW = Math.max(0.05, 1 - left - right);
            const visH = Math.max(0.05, 1 - top - bottom);

            imageElement.style.position = "absolute";
            imageElement.style.width = `${100 / visW}%`;
            imageElement.style.height = `${100 / visH}%`;
            imageElement.style.left = `${-(left / visW) * 100}%`;
            imageElement.style.top = `${-(top / visH) * 100}%`;
            imageElement.style.objectFit = "fill";
            nodeEl.style.overflow = "hidden";
        } else {
            if (imageElement) imageElement.remove();
            if (!svgWrapper) {
                svgWrapper = document.createElement("div");
                svgWrapper.className = "shape-svg-wrapper";
                nodeEl.prepend(svgWrapper);
            }
            svgWrapper.innerHTML = generateShapeSVG(node);
        }
        
        // Set label text
        const textSpan = nodeEl.querySelector(".node-text");
        if (textSpan) {
            textSpan.textContent = node.text;
            textSpan.style.fontSize = `${node.textSize || 14}px`;
            
            // Set text color dynamically for dark borders/fills
            if (node.bgColor === "transparent") {
                textSpan.style.color = resolveCssColorVar("--text-main", "#0f172a");
            } else {
                // simple contrast calculation: light bg gets main text, dark gets white text
                const isDark = ["#334155", "#0f172a", "#4f46e5", "#0ea5e9", "#ef4444", "#8b5cf6"].includes(node.bgColor);
                textSpan.style.color = isDark ? "white" : resolveCssColorVar("--text-main", "#0f172a");
            }
        }
        
        // Apply text dragging translation
        const textContainer = nodeEl.querySelector(".node-text-container");
        if (textContainer) {
            textContainer.style.transform = `translate(${node.textOffset.x}px, ${node.textOffset.y}px)`;
            applyTextPositionStyles(textContainer, textSpan, node.textPosition);
        }
        
        // URL Link indicator icon
        let linkIcon = nodeEl.querySelector(".node-link-icon");
        if (node.url) {
            if (!linkIcon) {
                linkIcon = document.createElement("div");
                linkIcon.className = "node-link-icon";
                linkIcon.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
                linkIcon.title = "Open Link: " + node.url;
                linkIcon.addEventListener("pointerdown", e => e.stopPropagation());
                linkIcon.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const safeUrl = sanitizeUrl(node.url);
                    if (safeUrl) window.open(safeUrl, "_blank", "noopener,noreferrer");
                });
                nodeEl.appendChild(linkIcon);
            }
        } else if (linkIcon) {
            linkIcon.remove();
        }

        renderNodeResizeHandle(node);
    });
    
    renderConnectors();
    saveAutosave();
}

function renderNodeResizeHandle(node) {
    if (!nodeHandlesLayer || !node) return;
    if (!(selectedType === "node" && selectedNodeIds.size === 1 && selectedNodeIds.has(node.id))) return;

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    resizeHandle.style.left = `${node.x + node.width / 2 - 9}px`;
    resizeHandle.style.top = `${node.y + node.height / 2 - 9}px`;
    resizeHandle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        resizingNodeId = node.id;
        resizeStartMouse = { x: e.clientX, y: e.clientY };
        resizeStartNodeSize = { width: node.width, height: node.height };
        resizeHandle.setPointerCapture(e.pointerId);
    });
    nodeHandlesLayer.appendChild(resizeHandle);
}

// Validates that a value is a safe CSS colour (prevents SVG attribute injection).
const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|transparent|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+(?:\s*,\s*[\d.]+)?\s*\))$/;
function sanitizeCssColor(val, fallback) {
    const trimmed = String(val || "").trim();
    return CSS_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

// Validates that a URL is safe to open (https/http only – blocks javascript: and data: URIs).
function sanitizeUrl(raw) {
    const trimmed = String(raw || "").trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function generateShapeSVG(node) {
    const w = node.width;
    const h = node.height;
    const fill = sanitizeCssColor(node.bgColor, "#ffffff");
    const stroke = sanitizeCssColor(node.borderColor, "#64748b");
    const strokeW = node.borderWidth;
    
    let dash = "none";
    if (node.borderStyle === "dashed") dash = "6,4";
    else if (node.borderStyle === "dotted") dash = "2,3";
    
    // Standard shapes representations
    switch (node.shapeType) {
        case "text-box":
            return "";

        case "sticky-note":
            const foldSize = Math.min(w, h) * 0.2;
            return `<svg>
                <path d="M ${strokeW/2} ${strokeW/2} L ${w - foldSize - strokeW/2} ${strokeW/2} L ${w - strokeW/2} ${foldSize + strokeW/2} L ${w - strokeW/2} ${h - strokeW/2} L ${strokeW/2} ${h - strokeW/2} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/>
                <path d="M ${w - foldSize - strokeW/2} ${strokeW/2} L ${w - foldSize - strokeW/2} ${foldSize + strokeW/2} L ${w - strokeW/2} ${foldSize + strokeW/2} Z" fill="#fef9c3" stroke="${stroke}" stroke-width="${strokeW}"/>
            </svg>`;

        case "rectangle":
            return `<svg><rect x="${strokeW/2}" y="${strokeW/2}" width="${w - strokeW}" height="${h - strokeW}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}" rx="2"/></svg>`;
            
        case "terminator":
            const rx = h / 2;
            return `<svg><rect x="${strokeW/2}" y="${strokeW/2}" width="${w - strokeW}" height="${h - strokeW}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;
            
        case "circle":
            return `<svg><ellipse cx="${w/2}" cy="${h/2}" rx="${(w - strokeW)/2}" ry="${(h - strokeW)/2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;
            
        case "diamond":
            return `<svg><polygon points="${w/2} ${strokeW}, ${w - strokeW} ${h/2}, ${w/2} ${h - strokeW}, ${strokeW} ${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;
            
        case "parallelogram":
            return `<svg><polygon points="${w*0.15} ${strokeW}, ${w - strokeW} ${strokeW}, ${w * 0.85} ${h - strokeW}, ${strokeW} ${h - strokeW}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;
            
        case "cylinder":
            const ryCap = Math.min(12, h * 0.15);
            return `<svg>
                <path d="M ${strokeW} ${ryCap} L ${strokeW} ${h - ryCap} A ${(w-strokeW*2)/2} ${ryCap} 0 0 0 ${w-strokeW} ${h - ryCap} L ${w-strokeW} ${ryCap} A ${(w-strokeW*2)/2} ${ryCap} 0 0 0 ${strokeW} ${ryCap}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/>
                <ellipse cx="${w/2}" cy="${ryCap}" rx="${(w-strokeW*2)/2}" ry="${ryCap}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/>
            </svg>`;
            
        case "document":
            const waveH = Math.min(15, h * 0.15);
            return `<svg><path d="M ${strokeW} ${strokeW} L ${w - strokeW} ${strokeW} L ${w - strokeW} ${h - waveH} Q ${w*0.75} ${h - waveH*2}, ${w*0.5} ${h - waveH} T ${strokeW} ${h - waveH} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;
            
        case "hexagon":
            return `<svg><polygon points="${w*0.18} ${strokeW}, ${w*0.82} ${strokeW}, ${w-strokeW} ${h/2}, ${w*0.82} ${h - strokeW}, ${w*0.18} ${h - strokeW}, ${strokeW} ${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;

        case "cloud":
            return `<svg><path d="${buildCloudPathData(strokeW / 2, strokeW / 2, w - strokeW, h - strokeW)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}"/></svg>`;

        default:
            return "";
    }
}

// --- Connector Lines rendering ---
function renderConnectors() {
    svgOverlay.innerHTML = "";
    if (lineHandlesLayer) lineHandlesLayer.innerHTML = "";
    if (nodeHandlesLayer) nodeHandlesLayer.innerHTML = "";
    
    // Defs markers Arrowheads
    svgOverlay.innerHTML = `
        <defs>
            <marker id="arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#64748b" />
            </marker>
            <marker id="arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 10 1.5 L 0 5 L 10 8.5 z" fill="#64748b" />
            </marker>
            <marker id="arrow-end-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#0ea5e9" />
            </marker>
            <marker id="arrow-start-selected" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 10 1.5 L 0 5 L 10 8.5 z" fill="#0ea5e9" />
            </marker>
        </defs>
    `;

    // 1. Draw existing connection lines
    lines.forEach(line => {
        const fromNode = nodes[line.fromId];
        const toNode = nodes[line.toId];
        
        if (!fromNode || !toNode) return; // safeguard
        
        const fromCoords = getPortCoords(line.fromId)[line.fromPort];
        const toCoords = getPortCoords(line.toId)[line.toPort];
        
        if (!fromCoords || !toCoords) return;
        
        const pathD = getLinePathD(line, fromCoords, toCoords);
        
        // Draw physical line path
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathD);
        path.setAttribute("class", "connector-line" + (selectedId === line.id && selectedType === "line" ? " selected" : ""));
        path.style.stroke = selectedId === line.id && selectedType === "line" ? resolveCssColorVar("--accent-primary", "#0ea5e9") : line.color;
        path.style.strokeWidth = `${line.thickness}px`;
        path.addEventListener("pointerdown", (e) => {
            if (tryStartNodeDragFromPointer(e)) return;
            const wasSelected = selectedId === line.id && selectedType === "line";
            e.stopPropagation();
            selectElement(line.id, "line");
            if (wasSelected) {
                beginLineRouteDrag(line, e, fromCoords, toCoords);
            }
        });
        
        if (line.lineStyle === "dashed") path.style.strokeDasharray = "6 4";
        else if (line.lineStyle === "dotted") path.style.strokeDasharray = "2 3";
        else path.style.strokeDasharray = "none";
        
        // Arrows
        const isSel = selectedId === line.id && selectedType === "line";
        if (line.hasArrow === "end" || line.hasArrow === "both") {
            path.setAttribute("marker-end", isSel ? "url(#arrow-end-selected)" : "url(#arrow-end)");
        }
        if (line.hasArrow === "start" || line.hasArrow === "both") {
            path.setAttribute("marker-start", isSel ? "url(#arrow-start-selected)" : "url(#arrow-start)");
        }
        
        svgOverlay.appendChild(path);
        
        // Draw click trigger overlay path
        const overlay = document.createElementNS("http://www.w3.org/2000/svg", "path");
        overlay.setAttribute("d", pathD);
        overlay.setAttribute("class", "connector-line-overlay");
        overlay.addEventListener("pointerdown", (e) => {
            if (tryStartNodeDragFromPointer(e)) return;
            const wasSelected = selectedId === line.id && selectedType === "line";
            e.stopPropagation();
            selectElement(line.id, "line");
            if (wasSelected) {
                beginLineRouteDrag(line, e, fromCoords, toCoords);
            }
        });
        svgOverlay.appendChild(overlay);

        if (selectedId === line.id && selectedType === "line" && lineHandlesLayer) {
            const routePoint = getLineRouteHandlePoint(line, fromCoords, toCoords);
            const routeHandle = document.createElement("div");
            routeHandle.className = "line-route-handle";
            routeHandle.style.left = `${routePoint.x}px`;
            routeHandle.style.top = `${routePoint.y}px`;
            routeHandle.title = "Drag to reroute line";
            routeHandle.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                beginLineRouteDrag(line, e, fromCoords, toCoords);
            });
            routeHandle.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();
                delete line.manualWaypoint;
                saveHistory();
                saveAutosave();
                renderConnectors();
            });
            lineHandlesLayer.appendChild(routeHandle);

            const beginLineEndDrag = (end) => {
                selectElement(line.id, "line");
                draggingNodeId = null;
                resizingNodeId = null;
                draggingTextNodeId = null;
                activePortNodeId = null;
                activePortName = null;
                draggingLineEnd = { lineId: line.id, end };
                lineEndSnapTarget = null;
                document.body.classList.add("line-end-dragging");
            };

            const fromHandle = document.createElement("div");
            fromHandle.className = "line-end-handle-ui";
            fromHandle.style.left = `${fromCoords.x}px`;
            fromHandle.style.top = `${fromCoords.y}px`;
            fromHandle.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                beginLineEndDrag("from");
            });
            lineHandlesLayer.appendChild(fromHandle);

            const toHandle = document.createElement("div");
            toHandle.className = "line-end-handle-ui";
            toHandle.style.left = `${toCoords.x}px`;
            toHandle.style.top = `${toCoords.y}px`;
            toHandle.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                beginLineEndDrag("to");
            });
            lineHandlesLayer.appendChild(toHandle);

            // SVG fallback hit targets: catches pointer even if HTML handles are obscured by browser quirks.
            const fromHit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            fromHit.setAttribute("cx", fromCoords.x);
            fromHit.setAttribute("cy", fromCoords.y);
            fromHit.setAttribute("r", "14");
            fromHit.setAttribute("class", "line-end-hit-target");
            fromHit.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                beginLineEndDrag("from");
            });
            svgOverlay.appendChild(fromHit);

            const toHit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            toHit.setAttribute("cx", toCoords.x);
            toHit.setAttribute("cy", toCoords.y);
            toHit.setAttribute("r", "14");
            toHit.setAttribute("class", "line-end-hit-target");
            toHit.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                beginLineEndDrag("to");
            });
            svgOverlay.appendChild(toHit);
        }
    });

    // 2. Draw line preview if currently drawing
    if (activePortNodeId && activePortName && lineDrawingMousePos) {
        const fromCoords = getPortCoords(activePortNodeId)[activePortName];
        let pathD = "";
        
        if (hoveredPortNodeId && hoveredPortName) {
            // Snapped target preview
            const toCoords = getPortCoords(hoveredPortNodeId)[hoveredPortName];
            pathD = getOrthogonalPath(fromCoords.x, fromCoords.y, activePortName, toCoords.x, toCoords.y, hoveredPortName);
        } else {
            // Free floating preview
            pathD = `M ${fromCoords.x} ${fromCoords.y} L ${lineDrawingMousePos.x} ${lineDrawingMousePos.y}`;
        }
        
        const previewPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        previewPath.setAttribute("d", pathD);
        previewPath.setAttribute("class", "connector-line preview");
        previewPath.setAttribute("marker-end", "url(#arrow-end-selected)");
        svgOverlay.appendChild(previewPath);
    }

    renderNodeResizeHandles();
}

function tryStartNodeDragFromPointer(e) {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const nodeEl = stack.find(el => el && el.classList && el.classList.contains("node"));
    if (!nodeEl) return false;

    const id = String(nodeEl.id || "").replace("node-", "");
    if (!id || !nodes[id] || draggingLineEnd || document.body.classList.contains("line-end-dragging")) {
        return false;
    }

    e.stopPropagation();

    const isToggleSelection = e.ctrlKey || e.metaKey;
    if (isToggleSelection) {
        selectElement(id, "node", { toggle: true });
        if (!selectedNodeIds.has(id)) return true;
    } else if (!(selectedType === "node" && selectedNodeIds.has(id))) {
        selectElement(id, "node");
    }

    draggingNodeId = id;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartNodePositions = {};
    const dragTargets = (selectedType === "node" && selectedNodeIds.size > 0)
        ? Array.from(selectedNodeIds)
        : [id];
    dragTargets.forEach(nodeId => {
        if (!nodes[nodeId]) return;
        dragStartNodePositions[nodeId] = { x: nodes[nodeId].x, y: nodes[nodeId].y };
    });

    try { nodeEl.setPointerCapture(e.pointerId); } catch (err) {}
    return true;
}

function renderNodeResizeHandles() {
    if (!nodeHandlesLayer) return;
    if (!(selectedType === "node" && selectedNodeIds.size === 1 && selectedId && nodes[selectedId])) return;

    const node = nodes[selectedId];
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    resizeHandle.style.left = `${node.x + node.width / 2 - 9}px`;
    resizeHandle.style.top = `${node.y + node.height / 2 - 9}px`;
    resizeHandle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        resizingNodeId = node.id;
        resizeStartMouse = { x: e.clientX, y: e.clientY };
        resizeStartNodeSize = { width: node.width, height: node.height };
        resizeHandle.setPointerCapture(e.pointerId);
    });
    nodeHandlesLayer.appendChild(resizeHandle);
}

function getPortVectorOffset(portName, offset) {
    switch (portName) {
        case "top": return { x: 0, y: -offset };
        case "right": return { x: offset, y: 0 };
        case "bottom": return { x: 0, y: offset };
        case "left": return { x: -offset, y: 0 };
    }
}

function getOrthogonalPolyline(x1, y1, port1, x2, y2, port2) {
    const buffer = 24;

    const startOffset = getPortVectorOffset(port1, buffer);
    const endOffset = getPortVectorOffset(port2, buffer);

    const px1 = x1 + startOffset.x;
    const py1 = y1 + startOffset.y;
    const px2 = x2 + endOffset.x;
    const py2 = y2 + endOffset.y;

    const points = [
        { x: x1, y: y1 },
        { x: px1, y: py1 }
    ];

    if (port1 === "left" || port1 === "right") {
        if (port2 === "left" || port2 === "right") {
            const midX = (px1 + px2) / 2;
            points.push({ x: midX, y: py1 }, { x: midX, y: py2 }, { x: px2, y: py2 });
        } else {
            points.push({ x: px2, y: py1 }, { x: px2, y: py2 });
        }
    } else {
        if (port2 === "top" || port2 === "bottom") {
            const midY = (py1 + py2) / 2;
            points.push({ x: px1, y: midY }, { x: px2, y: midY }, { x: px2, y: py2 });
        } else {
            points.push({ x: px1, y: py2 }, { x: px2, y: py2 });
        }
    }

    points.push({ x: x2, y: y2 });
    return points;
}

// Clean right-angle elbow routing
function getOrthogonalPath(x1, y1, port1, x2, y2, port2) {
    const points = getOrthogonalPolyline(x1, y1, port1, x2, y2, port2);
    return points.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), "");
}

function getOrthogonalPolylineWithWaypoint(fromCoords, toCoords, waypoint) {
    if (!waypoint) return [fromCoords, toCoords];

    const p = [
        { x: fromCoords.x, y: fromCoords.y },
        { x: waypoint.x, y: fromCoords.y },
        { x: waypoint.x, y: waypoint.y },
        { x: toCoords.x, y: waypoint.y },
        { x: toCoords.x, y: toCoords.y }
    ];

    return p.filter((point, idx) => idx === 0 || point.x !== p[idx - 1].x || point.y !== p[idx - 1].y);
}

function getLineOrthogonalPolyline(line, fromCoords, toCoords) {
    if (line && line.manualWaypoint && Number.isFinite(line.manualWaypoint.x) && Number.isFinite(line.manualWaypoint.y)) {
        return getOrthogonalPolylineWithWaypoint(fromCoords, toCoords, line.manualWaypoint);
    }

    return getOrthogonalPolyline(fromCoords.x, fromCoords.y, line.fromPort, toCoords.x, toCoords.y, line.toPort);
}

function getLineStraightPolyline(line, fromCoords, toCoords) {
    if (line && line.manualWaypoint && Number.isFinite(line.manualWaypoint.x) && Number.isFinite(line.manualWaypoint.y)) {
        return [
            { x: fromCoords.x, y: fromCoords.y },
            { x: line.manualWaypoint.x, y: line.manualWaypoint.y },
            { x: toCoords.x, y: toCoords.y }
        ];
    }

    return [fromCoords, toCoords];
}

function getLinePathD(line, fromCoords, toCoords) {
    if (line.lineType === "straight") {
        const points = getLineStraightPolyline(line, fromCoords, toCoords);
        return points.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), "");
    }

    if (line.lineType === "curved") {
        if (line.manualWaypoint && Number.isFinite(line.manualWaypoint.x) && Number.isFinite(line.manualWaypoint.y)) {
            return `M ${fromCoords.x} ${fromCoords.y} Q ${line.manualWaypoint.x} ${line.manualWaypoint.y}, ${toCoords.x} ${toCoords.y}`;
        }

        const distance = Math.hypot(toCoords.x - fromCoords.x, toCoords.y - fromCoords.y);
        const ctrlOffset = Math.min(120, distance * 0.4);
        const ctrl1 = getPortVectorOffset(line.fromPort, ctrlOffset);
        const ctrl2 = getPortVectorOffset(line.toPort, ctrlOffset);
        return `M ${fromCoords.x} ${fromCoords.y} C ${fromCoords.x + ctrl1.x} ${fromCoords.y + ctrl1.y}, ${toCoords.x + ctrl2.x} ${toCoords.y + ctrl2.y}, ${toCoords.x} ${toCoords.y}`;
    }

    const points = getLineOrthogonalPolyline(line, fromCoords, toCoords);
    return points.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), "");
}

function getLineRouteHandlePoint(line, fromCoords, toCoords) {
    if (line.manualWaypoint && Number.isFinite(line.manualWaypoint.x) && Number.isFinite(line.manualWaypoint.y)) {
        return { x: line.manualWaypoint.x, y: line.manualWaypoint.y };
    }

    if (line.lineType === "straight" || line.lineType === "curved") {
        return {
            x: (fromCoords.x + toCoords.x) / 2,
            y: (fromCoords.y + toCoords.y) / 2
        };
    }

    const points = getLineOrthogonalPolyline(line, fromCoords, toCoords);
    if (points.length < 2) {
        return {
            x: (fromCoords.x + toCoords.x) / 2,
            y: (fromCoords.y + toCoords.y) / 2
        };
    }

    const midIndex = Math.max(0, Math.floor((points.length - 2) / 2));
    const a = points[midIndex];
    const b = points[midIndex + 1];
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
    };
}

function beginLineRouteDrag(line, e, fromCoords, toCoords) {
    if (!line) return;

    draggingNodeId = null;
    resizingNodeId = null;
    draggingTextNodeId = null;
    activePortNodeId = null;
    activePortName = null;
    draggingLineEnd = null;
    lineEndSnapTarget = null;

    const existing = line.manualWaypoint && Number.isFinite(line.manualWaypoint.x) && Number.isFinite(line.manualWaypoint.y)
        ? { x: line.manualWaypoint.x, y: line.manualWaypoint.y }
        : null;
    lineRouteDragStartWaypoint = existing;

    const coords = screenToCanvas(e.clientX, e.clientY);
    const fallback = getLineRouteHandlePoint(line, fromCoords, toCoords);
    line.manualWaypoint = {
        x: snap(Number.isFinite(coords.x) ? coords.x : fallback.x),
        y: snap(Number.isFinite(coords.y) ? coords.y : fallback.y)
    };
    draggingLineRouteId = line.id;
    document.body.classList.add("line-route-dragging");
    renderConnectors();
}

// --- Text Inline Editing ---
let editingNodeId = null;
function startTextEdit(nodeId) {
    if (editingNodeId || (nodes[nodeId] && nodes[nodeId].type === "image")) return;
    
    editingNodeId = nodeId;
    const nodeEl = document.getElementById("node-" + nodeId);
    const textSpan = nodeEl.querySelector(".node-text");
    
    textSpan.contentEditable = "true";
    textSpan.classList.add("node-editor");
    textSpan.focus();
    
    // Select text range
    document.execCommand('selectAll', false, null);
    
    const originalText = nodes[nodeId].text;
    
    textSpan.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            textSpan.blur();
        }
        if (e.key === "Escape") {
            textSpan.textContent = originalText;
            editingNodeId = null;
            textSpan.blur();
            render();
        }
    });
    
    textSpan.addEventListener("blur", () => {
        const text = textSpan.textContent.trim();
        textSpan.contentEditable = "false";
        textSpan.classList.remove("node-editor");
        
        if (text !== originalText) {
            nodes[nodeId].text = text;
            saveHistory();
            saveAutosave();
        }
        editingNodeId = null;
        render();
    }, { once: true });
}

// --- Selection & Properties Update ---
function selectElement(id, type = null, options = {}) {

    if (!id || !type) {
        selectedId = null;
        selectedType = null;
        selectedNodeIds = new Set();
    } else if (type === "line") {
        selectedId = id;
        selectedType = "line";
        selectedNodeIds = new Set();
    } else if (type === "node") {
        selectedType = "node";
        if (options.toggle) {
            if (selectedNodeIds.has(id)) {
                selectedNodeIds.delete(id);
                if (selectedId === id) {
                    if (selectedNodeIds.size > 0) {
                        const selectedIds = Array.from(selectedNodeIds);
                        selectedId = selectedIds[selectedIds.length - 1];
                    } else {
                        selectedId = null;
                    }
                }
                if (selectedNodeIds.size === 0) {
                    selectedType = null;
                    selectedId = null;
                }
            } else {
                selectedNodeIds.add(id);
                selectedId = id;
            }
        } else {
            selectedNodeIds = new Set([id]);
            selectedId = id;
        }
    }

    document.body.classList.toggle("line-edit-mode", selectedType === "line" && !!selectedId);
    document.body.classList.toggle("node-multi-select-mode", selectedType === "node" && selectedNodeIds.size > 1);
    
    // Update visual nodes selected state
    Object.keys(nodes).forEach(nodeId => {
        const el = document.getElementById("node-" + nodeId);
        if (el) el.classList.toggle("selected", selectedType === "node" && selectedNodeIds.has(nodeId));
    });
    
    updatePropertiesPanel();
    renderConnectors();
}

function updatePropertiesPanel() {
    if (!selectedId && selectedNodeIds.size === 0) {
        propertiesPanel.style.display = "none";
        propNodeSection.style.display = "none";
        propLineSection.style.display = "none";
        return;
    }
    
    propertiesPanel.style.display = "flex";
    
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        propNodeSection.style.display = "block";
        propLineSection.style.display = "none";

        const referenceNodeId = selectedId && nodes[selectedId] ? selectedId : Array.from(selectedNodeIds).find(nodeId => !!nodes[nodeId]);
        const node = referenceNodeId ? nodes[referenceNodeId] : null;
        if (!node) {
            propertiesPanel.style.display = "none";
            propNodeSection.style.display = "none";
            propLineSection.style.display = "none";
            return;
        }

        propText.value = node.text;
        propTextSize.value = node.textSize || 14;
        propUrl.value = node.url || "";
        propTextPosition.value = node.textPosition || "center";
        propNodeWidth.value = Math.round(node.width || 120);
        propNodeHeight.value = Math.round(node.height || 60);
        const crop = node.crop || { left: 0, top: 0, right: 0, bottom: 0 };
        propCropLeft.value = Math.round((crop.left || 0) * 100);
        propCropTop.value = Math.round((crop.top || 0) * 100);
        propCropRight.value = Math.round((crop.right || 0) * 100);
        propCropBottom.value = Math.round((crop.bottom || 0) * 100);
        propImageCropGroup.style.display = node.type === "image" ? "block" : "none";
        propBorderWidth.value = node.borderWidth;
        propBorderStyle.value = node.borderStyle;
        
        // update swatches selected ring
        document.querySelectorAll("#prop-bgcolor-grid .color-swatch").forEach(s => {
            s.classList.toggle("selected", s.dataset.color === node.bgColor);
        });
        document.querySelectorAll("#prop-bordercolor-grid .color-swatch").forEach(s => {
            s.classList.toggle("selected", s.dataset.color === node.borderColor);
        });
    } else if (selectedType === "line") {
        propNodeSection.style.display = "none";
        propLineSection.style.display = "block";
        
        const line = lines.find(l => l.id === selectedId);
        if (line) {
            propLineType.value = line.lineType;
            propLineStyle.value = line.lineStyle;
            propLineWidth.value = line.thickness;
            propLineArrows.value = line.hasArrow;
            
            document.querySelectorAll("#prop-linecolor-grid .color-swatch").forEach(s => {
                s.classList.toggle("selected", s.dataset.color === line.color);
            });
        }
    }
}

// Properties changes handlers
function updateSelectedNodeText() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        selectedNodeIds.forEach(nodeId => {
            if (!nodes[nodeId]) return;
            nodes[nodeId].text = propText.value;
            const textSpan = document.querySelector(`#node-${nodeId} .node-text`);
            if (textSpan) textSpan.textContent = propText.value;
        });
    }
}

function updateSelectedNodeTextSize() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const textSize = parseInt(propTextSize.value, 10) || 14;
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].textSize = textSize;
        });
        render();
    }
}

function updateSelectedNodeTextPosition() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const position = propTextPosition.value || "center";
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].textPosition = position;
        });
        saveHistory();
        saveAutosave();
        render();
    }
}

function updateSelectedNodeUrl() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const raw = propUrl.value.trim();
        const url = sanitizeUrl(raw);
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].url = url;
        });
        render();
    }
}

function updateSelectedNodeWidth() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        selectedNodeIds.forEach(nodeId => {
            if (!nodes[nodeId]) return;
            const width = Math.max(40, parseInt(propNodeWidth.value, 10) || nodes[nodeId].width || 120);
            nodes[nodeId].width = snap(width);
        });
        saveHistory();
        saveAutosave();
        render();
    }
}

function updateSelectedNodeHeight() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        selectedNodeIds.forEach(nodeId => {
            if (!nodes[nodeId]) return;
            const height = Math.max(30, parseInt(propNodeHeight.value, 10) || nodes[nodeId].height || 60);
            nodes[nodeId].height = snap(height);
        });
        saveHistory();
        saveAutosave();
        render();
    }
}

function updateSelectedNodeCrop() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const left = Math.max(0, Math.min(90, parseInt(propCropLeft.value, 10) || 0)) / 100;
        const top = Math.max(0, Math.min(90, parseInt(propCropTop.value, 10) || 0)) / 100;
        const right = Math.max(0, Math.min(90, parseInt(propCropRight.value, 10) || 0)) / 100;
        const bottom = Math.max(0, Math.min(90, parseInt(propCropBottom.value, 10) || 0)) / 100;

        const maxLR = Math.max(0, 0.95 - right);
        const safeLeft = Math.min(left, maxLR);
        const maxTB = Math.max(0, 0.95 - bottom);
        const safeTop = Math.min(top, maxTB);

        let hasImageSelection = false;
        selectedNodeIds.forEach(nodeId => {
            if (!nodes[nodeId] || nodes[nodeId].type !== "image") return;
            hasImageSelection = true;
            nodes[nodeId].crop = {
                left: safeLeft,
                top: safeTop,
                right,
                bottom
            };
        });

        if (hasImageSelection) {
            saveHistory();
            saveAutosave();
            render();
        }
    }
}

function resetSelectedNodeCrop() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        let hasImageSelection = false;
        selectedNodeIds.forEach(nodeId => {
            if (!nodes[nodeId] || nodes[nodeId].type !== "image") return;
            hasImageSelection = true;
            nodes[nodeId].crop = { left: 0, top: 0, right: 0, bottom: 0 };
        });
        if (!hasImageSelection) return;

        propCropLeft.value = "0";
        propCropTop.value = "0";
        propCropRight.value = "0";
        propCropBottom.value = "0";
        saveHistory();
        saveAutosave();
        render();
    }
}

function updateSelectedNodeBorderWidth() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const borderWidth = parseInt(propBorderWidth.value, 10);
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].borderWidth = borderWidth;
        });
        saveHistory();
        saveAutosave();
        render();
    }
}

function updateSelectedNodeBorderStyle() {
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const borderStyle = propBorderStyle.value;
        selectedNodeIds.forEach(nodeId => {
            if (nodes[nodeId]) nodes[nodeId].borderStyle = borderStyle;
        });
        saveHistory();
        saveAutosave();
        render();
    }
}

function updateSelectedLineType() {
    if (selectedType === "line") {
        const line = lines.find(l => l.id === selectedId);
        if (line) {
            line.lineType = propLineType.value;
            saveHistory();
            render();
        }
    }
}

function updateSelectedLineStyle() {
    if (selectedType === "line") {
        const line = lines.find(l => l.id === selectedId);
        if (line) {
            line.lineStyle = propLineStyle.value;
            saveHistory();
            render();
        }
    }
}

function updateSelectedLineThickness() {
    if (selectedType === "line") {
        const line = lines.find(l => l.id === selectedId);
        if (line) {
            line.thickness = parseFloat(propLineWidth.value);
            saveHistory();
            render();
        }
    }
}

function updateSelectedLineArrows() {
    if (selectedType === "line") {
        const line = lines.find(l => l.id === selectedId);
        if (line) {
            line.hasArrow = propLineArrows.value;
            saveHistory();
            render();
        }
    }
}

function setSelectedLineAsDefault() {
    if (selectedType !== "line") {
        alert("Select a line first.");
        return;
    }

    const line = lines.find(l => l.id === selectedId);
    if (!line) return;

    defaultLineSettings = {
        lineType: line.lineType || DEFAULT_LINE_SETTINGS.lineType,
        lineStyle: line.lineStyle || DEFAULT_LINE_SETTINGS.lineStyle,
        color: line.color || DEFAULT_LINE_SETTINGS.color,
        thickness: Number.isFinite(Number(line.thickness)) ? Number(line.thickness) : DEFAULT_LINE_SETTINGS.thickness,
        hasArrow: line.hasArrow || DEFAULT_LINE_SETTINGS.hasArrow
    };
    saveDefaultLineSettings();
    saveStatus.textContent = "Default line updated";
}

function resetDefaultLineSettings() {
    defaultLineSettings = { ...DEFAULT_LINE_SETTINGS };
    localStorage.removeItem(DEFAULT_LINE_SETTINGS_KEY);
    saveStatus.textContent = "Default line reset";
}

function deleteSelectedElement() {
    if (!selectedId && selectedNodeIds.size === 0) return;
    
    if (selectedType === "node" && selectedNodeIds.size > 0) {
        const idsToDelete = new Set(selectedNodeIds);
        idsToDelete.forEach(nodeId => {
            delete nodes[nodeId];
        });
        lines = lines.filter(l => !idsToDelete.has(l.fromId) && !idsToDelete.has(l.toId));
        saveHistory();
        saveAutosave();
        render();
    } else if (selectedType === "line") {
        deleteLine(selectedId);
    }
    selectElement(null);
}

function deleteNode(nodeId) {
    if (nodes[nodeId]) {
        delete nodes[nodeId];
        // Remove connected lines
        lines = lines.filter(l => l.fromId !== nodeId && l.toId !== nodeId);
        saveHistory();
        saveAutosave();
        render();
    }
}

function deleteLine(lineId) {
    lines = lines.filter(l => l.id !== lineId);
    saveHistory();
    saveAutosave();
    render();
}

function bringToFront() {
    if (hasActivePointerInteraction()) handleGlobalPointerAbort();

    if (selectedType === "node" && selectedNodeIds.size > 0) {
        let maxZ = 10;
        Object.values(nodes).forEach(n => {
            if (n.zIndex && n.zIndex > maxZ) maxZ = n.zIndex;
        });

        const selectedNodes = Array.from(selectedNodeIds)
            .filter(nodeId => !!nodes[nodeId])
            .sort((a, b) => (nodes[a].zIndex || 10) - (nodes[b].zIndex || 10));
        if (selectedNodes.length === 0) return;

        selectedNodes.forEach((nodeId, index) => {
            nodes[nodeId].zIndex = maxZ + 1 + index;
        });
        saveHistory();
        saveAutosave();
        render();
        return;
    }

    if (selectedType === "line") {
        const lineIndex = lines.findIndex(l => l.id === selectedId);
        if (lineIndex === -1 || lineIndex === lines.length - 1) return;
        const [line] = lines.splice(lineIndex, 1);
        lines.push(line);
        saveHistory();
        saveAutosave();
        render();
    }
}

function sendToBack() {
    if (hasActivePointerInteraction()) handleGlobalPointerAbort();

    if (selectedType === "node" && selectedNodeIds.size > 0) {
        let minZ = 10;
        Object.values(nodes).forEach(n => {
            if (n.zIndex && n.zIndex < minZ) minZ = n.zIndex;
        });

        const selectedNodes = Array.from(selectedNodeIds)
            .filter(nodeId => !!nodes[nodeId])
            .sort((a, b) => (nodes[a].zIndex || 10) - (nodes[b].zIndex || 10));
        if (selectedNodes.length === 0) return;

        selectedNodes.forEach((nodeId, index) => {
            nodes[nodeId].zIndex = minZ - selectedNodes.length + index;
        });
        saveHistory();
        saveAutosave();
        render();
        return;
    }

    if (selectedType === "line") {
        const lineIndex = lines.findIndex(l => l.id === selectedId);
        if (lineIndex <= 0) return;
        const [line] = lines.splice(lineIndex, 1);
        lines.unshift(line);
        saveHistory();
        saveAutosave();
        render();
    }
}

function copySelectedElement() {
    if (!selectedId || !selectedType) return;

    if (selectedType === "node" && nodes[selectedId]) {
        copiedElement = {
            type: "node",
            payload: JSON.parse(JSON.stringify(nodes[selectedId]))
        };
        pasteSerial = 0;
        saveStatus.textContent = "Node copied";
        return;
    }

    if (selectedType === "line") {
        const line = lines.find(l => l.id === selectedId);
        if (!line) return;
        copiedElement = {
            type: "line",
            payload: JSON.parse(JSON.stringify(line))
        };
        pasteSerial = 0;
        saveStatus.textContent = "Line copied";
    }
}

function pasteCopiedElement() {
    if (!copiedElement || !copiedElement.type || !copiedElement.payload) return;

    pasteSerial += 1;
    const offset = GRID_SIZE * pasteSerial;

    if (copiedElement.type === "node") {
        const sourceNode = copiedElement.payload;
        const newIdPrefix = sourceNode.type === "image" ? "img_" : "node_";
        const newId = `${newIdPrefix}${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const cloned = JSON.parse(JSON.stringify(sourceNode));
        cloned.id = newId;
        cloned.x = snap((Number(sourceNode.x) || 0) + offset);
        cloned.y = snap((Number(sourceNode.y) || 0) + offset);
        nodes[newId] = cloned;

        saveHistory();
        saveAutosave();
        render();
        selectElement(newId, "node");
        saveStatus.textContent = "Node pasted";
        return;
    }

    if (copiedElement.type === "line") {
        const sourceLine = copiedElement.payload;
        if (!nodes[sourceLine.fromId] || !nodes[sourceLine.toId]) {
            saveStatus.textContent = "Could not paste line (missing nodes)";
            return;
        }

        const newLineId = `line_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        lines.push({
            ...JSON.parse(JSON.stringify(sourceLine)),
            id: newLineId
        });

        saveHistory();
        saveAutosave();
        render();
        selectElement(newLineId, "line");
        saveStatus.textContent = "Line pasted";
    }
}

function nudgeSelectedNodesBy(dx, dy) {
    if (selectedType !== "node" || selectedNodeIds.size === 0) return false;

    const selectedNodes = Array.from(selectedNodeIds).filter((nodeId) => !!nodes[nodeId]);
    if (selectedNodes.length === 0) return false;

    selectedNodes.forEach((nodeId) => {
        nodes[nodeId].x = Math.round((Number(nodes[nodeId].x) || 0) + dx);
        nodes[nodeId].y = Math.round((Number(nodes[nodeId].y) || 0) + dy);
    });

    saveHistory();
    saveAutosave();
    render();
    updatePropertiesPanel();
    return true;
}

// --- Keyboard Handling ---
function handleKeyDown(e) {
    // Disable shortcuts if writing text or in modals
    if (editingNodeId || document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.contentEditable === "true") {
        return;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    const arrowNudges = {
        ArrowLeft: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        ArrowUp: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 }
    };

    if (arrowNudges[e.key]) {
        const step = e.shiftKey ? 10 : 1;
        const { dx, dy } = arrowNudges[e.key];
        const moved = nudgeSelectedNodesBy(dx * step, dy * step);
        if (moved) e.preventDefault();
        return;
    }
    
    // Delete key
    if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedElement();
    }
    
    // F2 to Edit Text
    if (e.key === "F2" && selectedType === "node" && selectedNodeIds.size === 1 && selectedId && nodes[selectedId]) {
        e.preventDefault();
        startTextEdit(selectedId);
    }

    // Ctrl/Cmd + C -> Copy selected object
    if (isCtrlOrCmd && (e.key === "c" || e.key === "C")) {
        if (selectedId && selectedType) {
            e.preventDefault();
            copySelectedElement();
        }
    }

    // Ctrl/Cmd + V -> Paste copied object
    if (isCtrlOrCmd && (e.key === "v" || e.key === "V")) {
        if (copiedElement) {
            e.preventDefault();
            pasteCopiedElement();
        }
    }
    
    // Ctrl + Z -> Undo
    if (isCtrlOrCmd && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
    }
    
    // Ctrl + Y -> Redo
    if (isCtrlOrCmd && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
    }
    
    // Space -> Recenter
    if (e.key === " " && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        centerCanvas();
    }
    
    // Escape -> Cancel active connection drag or deselect elements
    if (e.key === "Escape") {
        if (activePortNodeId) {
            activePortNodeId = null;
            activePortName = null;
            lineDrawingMousePos = null;
            hoveredPortNodeId = null;
            hoveredPortName = null;
            document.body.classList.remove("drawing-line");
            document.querySelectorAll(".port").forEach(el => el.classList.remove("snapped"));
            renderConnectors();
        } else {
            selectElement(null);
        }
    }
}

// --- Snap To Grid ---
function toggleSnapGrid() {
    snapGridEnabled = !snapGridEnabled;
    updateSnapGridButtonState();
}

function updateSnapGridButtonState() {
    btnSnapGrid.classList.toggle("active", snapGridEnabled);
    btnSnapGrid.title = snapGridEnabled ? "Snap to Grid: ON" : "Snap to Grid: OFF";
}

// --- Clipboard Image Pasting ---
function handleClipboardPaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = function(evt) {
                const base64 = evt.target.result;
                const img = new Image();
                img.onload = function() {
                    addNewImageNode(base64, img.naturalWidth, img.naturalHeight);
                };
                img.onerror = function() {
                    addNewImageNode(base64);
                };
                img.src = base64;
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            break;
        }
    }
}

function addNewImageNode(base64, naturalWidth = 0, naturalHeight = 0) {
    const id = "img_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    
    // Find viewport center in canvas space
    const rect = workspace.getBoundingClientRect();
    const center = screenToCanvas(rect.width / 2, rect.height / 2);
    
    // Setup default image bounds while preserving source aspect ratio.
    let width = 220;
    let height = 160;
    if (naturalWidth > 0 && naturalHeight > 0) {
        const maxW = 520;
        const maxH = 360;
        const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
        width = Math.max(80, Math.round(naturalWidth * scale));
        height = Math.max(60, Math.round(naturalHeight * scale));
    }

    nodes[id] = {
        id: id,
        type: "image",
        imageUrl: base64,
        x: snap(center.x),
        y: snap(center.y),
        width: snap(width),
        height: snap(height),
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        text: "",
        textOffset: { x: 0, y: 0 },
        bgColor: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        borderStyle: "solid",
        url: ""
    };
    
    saveHistory();
    saveAutosave();
    render();
    selectElement(id, "node");
}

// --- History Undo/Redo ---
function saveHistory() {
    // Clear redo
    redoStack = [];
    
    undoStack.push(JSON.stringify({
        nodes: nodes,
        lines: lines,
        name: currentDocName
    }));
    
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }
}

function undo() {
    if (undoStack.length <= 1) return;
    
    const curr = undoStack.pop();
    redoStack.push(curr);
    
    const prev = undoStack[undoStack.length - 1];
    const data = JSON.parse(prev);
    
    loadSessionData(data);
    selectElement(null);
}

function redo() {
    if (redoStack.length === 0) return;
    
    const next = redoStack.pop();
    undoStack.push(next);
    
    const data = JSON.parse(next);
    loadSessionData(data);
    selectElement(null);
}

function loadSessionData(data) {
    nodes = data.nodes || {};
    lines = data.lines || [];
    currentDocName = data.name || "Untitled Flowchart";
    docTitle.textContent = currentDocName;
    render();
}

function handleClearCanvas() {
    if (confirm("Are you sure you want to clear the entire flowchart canvas?")) {
        nodes = {};
        lines = [];
        saveHistory();
        saveAutosave();
        render();
        selectElement(null);
    }
}

function handleNewFlowchart() {
    if (confirm("Start a new flowchart project? Unsaved changes will be discarded.")) {
        createStartingTemplate();
        currentLocalSaveName = "";
        currentDriveFileId = null;
        saveHistory();
        saveAutosave();
        render();
        selectElement(null);
        centerCanvas();
    }
}

// --- Local browser saves manager ---
function handleSaveLocal() {
    const isFirstLocalSave = !currentLocalSaveName;
    const name = prompt("Enter a workspace name for this flowchart:", currentLocalSaveName || currentDocName);
    if (name === null) return;
    
    const trimmed = name.trim() || "My Flowchart";
    currentLocalSaveName = trimmed;
    currentDocName = trimmed;
    docTitle.textContent = trimmed;
    
    const saves = JSON.parse(localStorage.getItem("flowcraft_local_saves") || "{}");
    saves[trimmed] = {
        nodes: nodes,
        lines: lines,
        name: trimmed,
        updatedAt: Date.now()
    };
    
    localStorage.setItem("flowcraft_local_saves", JSON.stringify(saves));
    saveStatus.textContent = "Saved locally";
    loadLocalFilesList();
    alert(`Project "${trimmed}" saved locally!`);

    if (isFirstLocalSave) {
        const shouldDownload = confirm("Do you want to choose a save location and export this as a JSON file now?");
        if (shouldDownload) {
            exportJsonFile({ forcePrompt: true });
        }
    }
}

function loadLocalSave(name) {
    const saves = JSON.parse(localStorage.getItem("flowcraft_local_saves") || "{}");
    if (saves[name]) {
        currentLocalSaveName = name;
        currentDriveFileId = null; // reset drive file ID
        loadSessionData(saves[name]);
        undoStack = [];
        redoStack = [];
        saveHistory();
        centerCanvas();
        saveStatus.textContent = "Saved locally";
    }
}

function deleteLocalSave(name, e) {
    e.stopPropagation();
    if (!confirm(`Delete local save "${name}"?`)) return;
    
    const saves = JSON.parse(localStorage.getItem("flowcraft_local_saves") || "{}");
    delete saves[name];
    localStorage.setItem("flowcraft_local_saves", JSON.stringify(saves));
    
    if (currentLocalSaveName === name) currentLocalSaveName = "";
    loadLocalFilesList();
}

function loadLocalFilesList() {
    const saves = JSON.parse(localStorage.getItem("flowcraft_local_saves") || "{}");
    const names = Object.keys(saves).sort((a,b) => saves[b].updatedAt - saves[a].updatedAt);
    
    localFilesList.innerHTML = "";
    if (names.length === 0) {
        localFilesList.innerHTML = '<div class="empty-state">No local saves.</div>';
        return;
    }
    
    names.forEach(name => {
        const item = document.createElement("div");
        item.className = "saved-map-item";
        item.addEventListener("click", () => loadLocalSave(name));
        
        const span = document.createElement("span");
        span.className = "map-name";
        span.textContent = name;
        
        const actions = document.createElement("div");
        actions.className = "map-actions";
        
        const delBtn = document.createElement("button");
        delBtn.className = "map-action-btn delete";
        delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        delBtn.addEventListener("click", (e) => deleteLocalSave(name, e));
        
        actions.appendChild(delBtn);
        item.appendChild(span);
        item.appendChild(actions);
        localFilesList.appendChild(item);
    });
}

function saveAutosave() {
    localStorage.setItem("flowcraft_autosave", JSON.stringify({
        nodes: nodes,
        lines: lines,
        name: currentDocName
    }));
}

// --- Import/Export Local Files JSON ---
function isObject(val) {
    return !!val && typeof val === "object" && !Array.isArray(val);
}

function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    const parts = String(path).split(".");
    let curr = obj;
    for (const part of parts) {
        if (!isObject(curr) || !(part in curr)) return undefined;
        curr = curr[part];
    }
    return curr;
}

function readNum(obj, keys, fallback = 0) {
    for (const key of keys) {
        const val = getByPath(obj, key);
        if (val === undefined || val === null) continue;
        const n = Number(val);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

function readString(obj, keys, fallback = "") {
    for (const key of keys) {
        const val = getByPath(obj, key);
        if (val === undefined || val === null) continue;
        if (typeof val === "string" && val.trim()) return val;
        if (typeof val === "number" || typeof val === "boolean") return String(val);
    }
    return fallback;
}

function isFlowcraftFormat(data) {
    return isObject(data) && data.format === "flowcraft" && isObject(data.nodes);
}

function collectArrayCandidates(root, keys) {
    if (!isObject(root)) return [];
    const found = [];
    keys.forEach(key => {
        const val = getByPath(root, key);
        if (Array.isArray(val)) found.push(...val);
    });
    return found;
}

function discoverArraysDeep(root, maxDepth = 5) {
    const arrays = [];
    const visited = new Set();

    function walk(node, depth) {
        if (depth > maxDepth || !node || typeof node !== "object") return;
        if (visited.has(node)) return;
        visited.add(node);

        if (Array.isArray(node)) {
            arrays.push(node);
            node.forEach(item => walk(item, depth + 1));
            return;
        }

        Object.keys(node).forEach(k => walk(node[k], depth + 1));
    }

    walk(root, 0);
    return arrays;
}

function looksLikeLineItem(item) {
    if (!isObject(item)) return false;
    const typeHint = readString(item, ["type", "kind", "objectType", "class"], "").toLowerCase();
    if (typeHint.includes("line") || typeHint.includes("edge") || typeHint.includes("connector") || typeHint.includes("link")) return true;
    if (isObject(item.endpoint1) || isObject(item.endpoint2)) return true;
    const hasRefs = !!(
        item.fromId || item.toId || item.sourceId || item.targetId || item.startNodeId || item.endNodeId ||
        item.source || item.target || item.from || item.to || item.nodeA || item.nodeB
    );
    const hasCoords = ["x1", "y1", "x2", "y2", "startX", "startY", "endX", "endY"].some(k => readNum(item, [k], NaN) === readNum(item, [k], NaN));
    return hasRefs || hasCoords;
}

function looksLikeNodeItem(item) {
    if (!isObject(item)) return false;
    if (looksLikeLineItem(item)) return false;
    const hasGeom = [
        "x", "y", "left", "top", "centerX", "centerY", "cx", "cy",
        "bounds.x", "bounds.y", "position.x", "position.y"
    ].some(k => Number.isFinite(readNum(item, [k], NaN)));
    const hasSize = ["width", "height", "w", "h", "bounds.width", "bounds.height", "size.width", "size.height"].some(k => Number.isFinite(readNum(item, [k], NaN)));
    const hasShapeHints = !!readString(item, ["class", "shapeType", "shape", "type"], "") || Array.isArray(item.textAreas);
    return hasGeom || hasSize || hasShapeHints;
}

function normalizeShapeType(shapeType) {
    const val = (shapeType || "").toString().trim().toLowerCase();
    const map = {
        process: "rectangle",
        decision: "diamond",
        terminator: "terminator",
        database: "cylinder",
        data: "parallelogram",
        io: "parallelogram",
        connector: "circle",
        document: "document",
        preparation: "hexagon",
        cloud: "cloud"
    };
    const supported = new Set([
        "rectangle", "diamond", "terminator", "parallelogram", "cylinder", "document", "hexagon", "circle",
        "text-box", "sticky-note", "cloud"
    ]);
    const mapped = map[val] || val;
    return supported.has(mapped) ? mapped : "rectangle";
}

function asTextLabel(item, fallback = "") {
    const explicit = readString(item, ["text", "label", "name", "title", "value", "text.value", "data.label"], "");
    if (explicit) return explicit;
    if (Array.isArray(item.textAreas)) {
        const preferred = item.textAreas.find(t => isObject(t) && String(t.label || "").toLowerCase() === "text" && readString(t, ["text"], "").trim());
        if (preferred) return readString(preferred, ["text"], fallback);
        const firstMeaningful = item.textAreas.find(t => isObject(t) && !String(t.label || "").toLowerCase().includes("readonly") && readString(t, ["text"], "").trim());
        if (firstMeaningful) return readString(firstMeaningful, ["text"], fallback);
    }
    if (isObject(item.text) && typeof item.text.value === "string") return item.text.value;
    return fallback;
}

function extractNodeGeometry(item, defaultIndex) {
    let hasSourceGeometry = false;
    const width = Math.max(60, readNum(item, ["width", "w", "boundsWidth", "sizeX", "bounds.width", "size.width", "frame.width", "rect.width"], 140));
    const height = Math.max(30, readNum(item, ["height", "h", "boundsHeight", "sizeY", "bounds.height", "size.height", "frame.height", "rect.height"], 60));

    let x = readNum(item, ["centerX", "cx", "bounds.centerX", "position.centerX"], NaN);
    let y = readNum(item, ["centerY", "cy", "bounds.centerY", "position.centerY"], NaN);

    if (!Number.isFinite(x)) {
        const left = readNum(item, ["x", "left", "posX", "boundsX", "bounds.x", "position.x", "frame.x", "rect.x"], NaN);
        if (Number.isFinite(left)) {
            x = left + width / 2;
            hasSourceGeometry = true;
        } else {
            x = defaultIndex * 180;
        }
    } else {
        hasSourceGeometry = true;
    }
    if (!Number.isFinite(y)) {
        const top = readNum(item, ["y", "top", "posY", "boundsY", "bounds.y", "position.y", "frame.y", "rect.y"], NaN);
        if (Number.isFinite(top)) {
            y = top + height / 2;
            hasSourceGeometry = true;
        } else {
            y = 0;
        }
    } else {
        hasSourceGeometry = true;
    }

    return { x: snap(x), y: snap(y), width: snap(width), height: snap(height), hasSourceGeometry };
}

function autoLayoutNodesWhenGeometryMissing(nodesOut, linesOut) {
    const ids = Object.keys(nodesOut);
    if (ids.length === 0) return;

    const degree = {};
    ids.forEach(id => { degree[id] = 0; });
    (linesOut || []).forEach(line => {
        if (degree[line.fromId] !== undefined) degree[line.fromId] += 1;
        if (degree[line.toId] !== undefined) degree[line.toId] += 1;
    });

    ids.sort((a, b) => {
        const diff = (degree[b] || 0) - (degree[a] || 0);
        if (diff !== 0) return diff;
        return (nodesOut[a].text || "").localeCompare(nodesOut[b].text || "");
    });

    const columns = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(ids.length))));
    const rows = Math.ceil(ids.length / columns);
    const spacingX = 260;
    const spacingY = 160;
    const offsetX = ((columns - 1) * spacingX) / 2;
    const offsetY = ((rows - 1) * spacingY) / 2;

    ids.forEach((id, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        nodesOut[id].x = snap((col * spacingX) - offsetX);
        nodesOut[id].y = snap((row * spacingY) - offsetY);
    });
}

function toArray(val) {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
}

function getNearestNodeIdByPoint(x, y, nodeList) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || nodeList.length === 0) return null;
    let bestId = null;
    let bestDist = Infinity;
    nodeList.forEach(node => {
        const d = Math.hypot(x - node.x, y - node.y);
        if (d < bestDist) {
            bestDist = d;
            bestId = node.id;
        }
    });
    return bestId;
}

function getPortToward(node, otherNode) {
    if (!node || !otherNode) return "right";
    const dx = otherNode.x - node.x;
    const dy = otherNode.y - node.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? "right" : "left";
    }
    return dy >= 0 ? "bottom" : "top";
}

function normalizeImportedData(rawData) {
    if (isFlowcraftFormat(rawData)) {
        return { data: rawData, source: "flowcraft" };
    }

    // Some tools wrap payloads under common envelope keys.
    const wrapped = [rawData?.diagram, rawData?.document, rawData?.data].find(isObject);
    if (wrapped && isFlowcraftFormat(wrapped)) {
        return { data: wrapped, source: "flowcraft" };
    }

    const lucidConverted = convertLucidchartLikeData(rawData);
    if (lucidConverted) {
        return { data: lucidConverted, source: "lucidchart" };
    }

    return null;
}

function convertLucidchartLikeData(rawData) {
    const roots = [rawData].filter(isObject);
    const pages = [];

    if (Array.isArray(rawData?.pages)) pages.push(...rawData.pages.filter(isObject));
    if (isObject(rawData?.page)) pages.push(rawData.page);
    if (isObject(rawData?.document) && Array.isArray(rawData.document.pages)) {
        pages.push(...rawData.document.pages.filter(isObject));
    }

    roots.push(...pages);

    const shapeKeys = ["nodes", "shapes", "objects", "elements", "items", "entities", "items.shapes"]; 
    const lineKeys = ["lines", "connectors", "edges", "links", "connections", "items.lines"]; 

    const shapeCandidates = [];
    const lineCandidates = [];

    roots.forEach(root => {
        shapeCandidates.push(...collectArrayCandidates(root, shapeKeys));
        lineCandidates.push(...collectArrayCandidates(root, lineKeys));

        // Mixed arrays are common, split by semantic type hints.
        const mixed = collectArrayCandidates(root, ["items", "elements", "objects"]);
        mixed.forEach(item => {
            const t = (readString(item, ["type", "kind", "objectType"], "")).toLowerCase();
            if (t.includes("line") || t.includes("edge") || t.includes("connector") || t.includes("link")) {
                lineCandidates.push(item);
            } else {
                shapeCandidates.push(item);
            }
        });
    });

    // Deep fallback: many exports nest arrays under unknown keys.
    const deepArrays = discoverArraysDeep(rawData, 6);
    deepArrays.forEach(arr => {
        if (!Array.isArray(arr) || arr.length === 0) return;
        const nodeLike = arr.filter(looksLikeNodeItem);
        const lineLike = arr.filter(looksLikeLineItem);
        if (nodeLike.length >= 1) shapeCandidates.push(...nodeLike);
        if (lineLike.length >= 1) lineCandidates.push(...lineLike);
    });

    const nodesOut = {};
    const nodeList = [];
    let fallbackIdx = 0;
    let nodesWithGeometry = 0;

    shapeCandidates.forEach(item => {
        if (!isObject(item)) return;

        if (looksLikeLineItem(item)) return;

        const maybeType = readString(item, ["type", "shape", "shapeType", "kind"], "").toLowerCase();
        if (maybeType.includes("line") || maybeType.includes("edge") || maybeType.includes("connector") || maybeType.includes("link")) {
            return;
        }

        const geometry = extractNodeGeometry(item, fallbackIdx++);
        const rawId = readString(item, ["id", "uuid", "key", "nodeId", "shapeId", "meta.id", "data.id"], "");
        const id = rawId || `lucid_node_${fallbackIdx}`;
        if (nodesOut[id]) return;

        const shapeType = normalizeShapeType(readString(item, ["shapeType", "shape", "type", "kind", "class"], "rectangle"));
        const imageUrl = readString(item, ["image.url"], "");
        const node = {
            id,
            type: imageUrl ? "image" : "shape",
            shapeType,
            imageUrl: imageUrl || undefined,
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            text: asTextLabel(item, "Node"),
            textOffset: { x: 0, y: 0 },
            textSize: 14,
            bgColor: sanitizeCssColor(readString(item, ["fillColor", "backgroundColor", "bgColor", "style.fill", "style.fillColor"], "#ffffff"), "#ffffff"),
            borderColor: sanitizeCssColor(readString(item, ["strokeColor", "lineColor", "borderColor", "style.stroke", "style.strokeColor"], "#64748b"), "#64748b"),
            borderWidth: Math.max(1, readNum(item, ["strokeWidth", "lineWidth", "borderWidth", "style.strokeWidth"], 2)),
            borderStyle: readString(item, ["borderStyle", "lineStyle", "style.strokeStyle"], "solid"),
            url: sanitizeUrl(readString(item, ["url", "link", "href", "hyperlink", "metadata.url"], ""))
        };

        if (node.type === "image") {
            node.bgColor = "transparent";
            node.borderColor = "transparent";
            node.borderWidth = 0;
        }

        if (geometry.hasSourceGeometry) {
            nodesWithGeometry += 1;
        }

        nodesOut[id] = node;
        nodeList.push(node);
    });

    if (Object.keys(nodesOut).length === 0) {
        return null;
    }

    const linesOut = [];
    let lineIdx = 0;

    lineCandidates.forEach(item => {
        if (!isObject(item)) return;

        const fromRef = item.fromId || item.from || item.sourceId || item.source || item.startNodeId || item.nodeA || getByPath(item, "source.id") || getByPath(item, "start.id") || getByPath(item, "endpoint1.connectedTo");
        const toRef = item.toId || item.to || item.targetId || item.target || item.endNodeId || item.nodeB || getByPath(item, "target.id") || getByPath(item, "end.id") || getByPath(item, "endpoint2.connectedTo");

        let fromId = typeof fromRef === "string" ? fromRef : readString(fromRef, ["id", "nodeId", "shapeId"], "");
        let toId = typeof toRef === "string" ? toRef : readString(toRef, ["id", "nodeId", "shapeId"], "");

        if (!nodesOut[fromId] || !nodesOut[toId]) {
            const sx = readNum(item, ["x1", "startX", "fromX", "start.x", "source.x", "points.0.x"], NaN);
            const sy = readNum(item, ["y1", "startY", "fromY", "start.y", "source.y", "points.0.y"], NaN);
            const ex = readNum(item, ["x2", "endX", "toX", "end.x", "target.x"], NaN);
            const ey = readNum(item, ["y2", "endY", "toY", "end.y", "target.y"], NaN);

            if (!nodesOut[fromId]) fromId = getNearestNodeIdByPoint(sx, sy, nodeList);
            if (!nodesOut[toId]) toId = getNearestNodeIdByPoint(ex, ey, nodeList);
        }

        if (!fromId || !toId || fromId === toId || !nodesOut[fromId] || !nodesOut[toId]) {
            return;
        }

        const fromNode = nodesOut[fromId];
        const toNode = nodesOut[toId];
        const fromPort = getPortToward(fromNode, toNode);
        const toPort = getPortToward(toNode, fromNode);

        lineIdx += 1;
        linesOut.push({
            id: readString(item, ["id", "uuid", "key", "meta.id"], `lucid_line_${lineIdx}`),
            fromId,
            fromPort,
            toId,
            toPort,
            lineType: "orthogonal",
            lineStyle: readString(item, ["lineStyle", "style", "style.strokeStyle"], "solid"),
            color: readString(item, ["strokeColor", "color", "lineColor", "style.stroke", "style.strokeColor"], "#64748b"),
            thickness: Math.max(1, readNum(item, ["strokeWidth", "lineWidth", "thickness", "style.strokeWidth"], 2.5)),
            hasArrow: readString(item, ["hasArrow", "arrow", "arrowType"], "end")
        });
    });

    if (nodesWithGeometry === 0) {
        autoLayoutNodesWhenGeometryMissing(nodesOut, linesOut);
    }

    return {
        format: "flowcraft",
        version: "1.0",
        name: readString(rawData, ["name", "title", "documentName"], "Imported Lucidchart Diagram"),
        nodes: nodesOut,
        lines: linesOut
    };
}

function getExportPayload() {
    return {
        format: "flowcraft",
        version: "1.0",
        name: currentDocName,
        nodes: nodes,
        lines: lines
    };
}

function getSafeExportFilename() {
    return currentDocName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".flowchart";
}

async function exportJsonFile(options = {}) {
    const forcePrompt = !!options.forcePrompt;
    const serialized = JSON.stringify(getExportPayload(), null, 2);
    const filename = getSafeExportFilename();

    if (typeof window.showSaveFilePicker === "function") {
        try {
            if (!jsonExportFileHandle || forcePrompt) {
                jsonExportFileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: "Flowchart JSON",
                        accept: {
                            "application/json": [".flowchart", ".json"]
                        }
                    }]
                });
            }

            const writable = await jsonExportFileHandle.createWritable();
            await writable.write(serialized);
            await writable.close();
            saveStatus.textContent = "JSON saved";
            return;
        } catch (err) {
            if (err && err.name === "AbortError") {
                saveStatus.textContent = "Export cancelled";
                return;
            }
            jsonExportFileHandle = null;
        }
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(serialized);
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = filename;
    a.click();
    saveStatus.textContent = "Export complete";
}

async function importJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const data = JSON.parse(await file.text());
        const normalized = normalizeImportedData(data);
        if (!normalized) {
            const topKeys = isObject(data) ? Object.keys(data).slice(0, 15).join(", ") : "(non-object json root)";
            alert("Invalid format: could not detect FlowCraft/Lucidchart node data. Top-level keys: " + topKeys);
            return;
        }

        loadSessionData(normalized.data);
        currentLocalSaveName = "";
        currentDriveFileId = null;
        undoStack = [];
        redoStack = [];
        saveHistory();
        centerCanvas();

        if (normalized.source === "flowcraft") {
            alert("Flowchart imported successfully!");
        } else if (normalized.source === "lucidchart") {
            alert("Lucidchart JSON imported successfully (best effort conversion).");
        }
    } catch (err) {
        alert("Error parsing file: " + err.message);
    } finally {
        fileImportInput.value = "";
    }
}

// --- Google Drive & OAuth Integration (Domain Restricted) ---

function showGoogleConfigModal(show) {
    if (show) updateGoogleConfigUiState();
    googleConfigModal.classList.toggle("active", show);
}

function saveGoogleConfig() {
    if (!ensureTrustedOriginForGoogle()) return;

    if (configuredGoogleClientId && !allowLocalClientIdOverride) {
        alert("Shared app configuration is active. Local override is disabled.");
        showGoogleConfigModal(false);
        return;
    }

    const cid = inputClientId.value.trim();
    if (!cid) {
        alert("Please enter a valid Google Client ID.");
        return;
    }
    if (!isValidGoogleClientId(cid)) {
        alert("Invalid Google Client ID format. Expected *.apps.googleusercontent.com");
        return;
    }
    googleClientId = cid;
    localStorage.setItem("flowcraft_google_client_id", cid);
    showGoogleConfigModal(false);
    
    initGoogleClient();
}

function clearGoogleConfig() {
    if (configuredGoogleClientId && !allowLocalClientIdOverride) {
        alert("Shared app configuration is active. Nothing to clear locally.");
        showGoogleConfigModal(false);
        return;
    }

    localStorage.removeItem("flowcraft_google_client_id");
    googleClientId = getEffectiveGoogleClientId();
    inputClientId.value = googleClientId;
    showGoogleConfigModal(false);
    if (googleClientId) {
        alert("Local override cleared. Falling back to shared app configuration.");
    } else {
        alert("Google credentials cleared. Please configure again to use Google Drive.");
    }
    signOutGoogle();
}

function startGoogleSignIn() {
    if (!ensureTrustedOriginForGoogle()) return;

    googleClientId = getEffectiveGoogleClientId();
    if (!googleClientId) {
        inputClientId.value = "";
    }

    if (!googleClientId) {
        alert("Börja med att ange Google OAuth Client ID under OAuth Credentials.");
        showGoogleConfigModal(true);
        return;
    }

    if (typeof google === "undefined" || !google.accounts || !google.accounts.id) {
        alert("Google Identity Services kunde inte laddas. Ladda om sidan och försök igen.");
        return;
    }

    initGoogleClient();
    document.getElementById("google-sign-in-btn").style.display = "block";
    google.accounts.id.prompt();
}

// Initialize the Google OAuth & GIS sign-in button
function initGoogleClient() {
    if (!googleClientId) return;
    if (!ensureTrustedOriginForGoogle()) return;
    if (!isValidGoogleClientId(googleClientId)) {
        console.warn("Skipping OAuth init due to invalid Google client ID format.");
        return;
    }
    
    try {
        // Initialize GIS Login client – callback is kept inside the closure so it is not
        // accessible as a global (window.handleGoogleSignInCallback), reducing the attack
        // surface for malicious scripts that might try to invoke it with a forged credential.
        const handleGoogleSignInCallback = (response) => {
            try {
                const payload = decodeJwt(response.credential);

                if (!isValidGoogleJwtPayload(payload)) {
                    alert("Access Denied:\nInvalid or expired credential.");
                    signOutGoogle();
                    return;
                }

                if (!isAllowedGoogleDomain(payload)) {
                    alert("Access Denied:\nOnly Google accounts with a @hummel.se email are allowed to sign in.");
                    signOutGoogle();
                    return;
                }
                
                userProfile = payload;
                
                // Update user UI card
                document.getElementById("google-sign-in-btn").style.display = "none";
                const profileCard = document.getElementById("user-profile");
                profileCard.style.display = "flex";
                document.getElementById("user-avatar").src = payload.picture;
                document.getElementById("user-name").textContent = payload.name;
                document.getElementById("user-email").textContent = payload.email;
                
                document.getElementById("google-sign-out").onclick = signOutGoogle;
                
                // Request Drive Access Token next
                if (tokenClient) {
                    tokenClient.requestAccessToken({ prompt: 'consent', hint: payload.email });
                }
            } catch (e) {
                alert("Failed to sign in: " + e.message);
            }
        };

        google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleSignInCallback,
            hd: ALLOWED_GOOGLE_DOMAIN
        });
        
        google.accounts.id.renderButton(
            document.getElementById("google-sign-in-btn"),
            { theme: "outline", size: "large" }
        );
        
        // Initialize token client for Drive API OAuth scope
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: "https://www.googleapis.com/auth/drive.file",
            callback: (resp) => {
                // Extra safety: never keep token unless user is validated for allowed domain.
                if (resp && resp.access_token && isAllowedGoogleDomain(userProfile)) {
                    accessToken = resp.access_token;
                    document.getElementById("gdrive-actions").style.display = "flex";
                    saveStatus.textContent = "Google Drive Connected";
                } else {
                    accessToken = "";
                    document.getElementById("gdrive-actions").style.display = "none";
                }
            }
        });
    } catch (e) {
        console.error("Error initializing Google GIS API:", e);
    }
}

// Decode GIS JWT token payload client side (display only – not a substitute for server-side verification)
function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

function isValidGoogleJwtPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    const now = Math.floor(Date.now() / 1000);
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!validIssuers.includes(String(payload.iss || ""))) return false;
    if (payload.exp && Number(payload.exp) < now) return false;
    if (googleClientId && String(payload.aud || "") !== googleClientId) return false;
    return true;
}

function signOutGoogle() {
    const revokedEmail = userProfile && userProfile.email ? userProfile.email : "";
    userProfile = null;
    accessToken = "";
    
    document.getElementById("google-sign-in-btn").style.display = "block";
    document.getElementById("user-profile").style.display = "none";
    document.getElementById("gdrive-actions").style.display = "none";
    saveStatus.textContent = "Saved locally";
    currentDriveFileId = null;
    
    // Revoke token if exists
    if (revokedEmail) {
        google.accounts.id.revoke(revokedEmail, () => {});
    }
}

async function saveToGoogleDrive() {
    if (!ensureTrustedOriginForGoogle()) return;

    if (!accessToken) {
        if (tokenClient) tokenClient.requestAccessToken();
        else alert("Please configure Google Client ID first.");
        return;
    }
    
    const flowchartData = getExportPayload();
    
    const fileContent = JSON.stringify(flowchartData, null, 2);
    const filename = currentDocName + ".flowchart";
    
    saveStatus.textContent = "Saving to Google Drive...";
    
    try {
        const metadata = {
            name: filename,
            mimeType: 'application/json'
        };
        
        const boundary = 'flowcraft_boundary';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";
        
        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';
        
        if (currentDriveFileId) {
            url = `https://www.googleapis.com/upload/drive/v3/files/${currentDriveFileId}?uploadType=multipart`;
            method = 'PATCH';
        }
        
        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            fileContent +
            close_delim;
            
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartRequestBody
        });
        
        if (!response.ok) throw new Error("HTTP error " + response.status);
        
        const file = await response.json();
        currentDriveFileId = file.id;
        
        saveStatus.textContent = "Cloud saved";
        alert(`Successfully saved to Google Drive!\nFile ID: ${file.id}`);
    } catch(err) {
        saveStatus.textContent = "Save failed";
        alert("Google Drive upload failed: " + err.message);
    }
}

function showGdriveExplorer(show) {
    gdriveExplorerModal.classList.toggle("active", show);
}

async function openGoogleDriveExplorer() {
    if (!ensureTrustedOriginForGoogle()) return;

    if (!accessToken) {
        if (tokenClient) tokenClient.requestAccessToken();
        else alert("Please configure Google Client ID first.");
        return;
    }
    
    showGdriveExplorer(true);
    gdriveFilesContainer.innerHTML = '<div class="empty-state">Loading Drive files...</div>';
    
    try {
        // Query application/json files created or opened by drive.file scope
        const url = 'https://www.googleapis.com/drive/v3/files?q=mimeType="application/json" and trashed=false&fields=files(id,name,modifiedTime)';
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error("Status code " + response.status);
        
        const data = await response.json();
        const files = data.files || [];
        
        // Filter files with .flowchart name pattern or JSON containing signature
        const filteredFiles = files.filter(f => f.name.endsWith(".flowchart") || f.name.endsWith(".json"));
        
        gdriveFilesContainer.innerHTML = "";
        if (filteredFiles.length === 0) {
            gdriveFilesContainer.innerHTML = '<div class="empty-state">No flowchart files found on Google Drive. Make sure to save a file first.</div>';
            return;
        }
        
        filteredFiles.forEach(file => {
            const item = document.createElement("div");
            item.className = "gdrive-file-item";
            item.addEventListener("click", () => loadGoogleDriveFile(file.id));
            
            const info = document.createElement("div");
            info.className = "gdrive-file-info";
            
            const nameEl = document.createElement("span");
            nameEl.className = "gdrive-file-name";
            nameEl.textContent = file.name.replace(".flowchart", "");
            
            const dateEl = document.createElement("span");
            dateEl.className = "gdrive-file-date";
            dateEl.textContent = "Modified: " + new Date(file.modifiedTime).toLocaleString();
            
            info.appendChild(nameEl);
            info.appendChild(dateEl);
            
            const loadIcon = document.createElement("i");
            loadIcon.className = "fa-solid fa-cloud-arrow-down";
            loadIcon.style.color = resolveCssColorVar("--accent-primary", "#0ea5e9");

            const actions = document.createElement("div");
            actions.className = "gdrive-file-actions";

            const trashBtn = document.createElement("button");
            trashBtn.className = "gdrive-file-trash-btn";
            trashBtn.title = "Move to Drive trash";
            trashBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            trashBtn.addEventListener("click", (e) => trashGoogleDriveFile(file.id, file.name, e));

            actions.appendChild(loadIcon);
            actions.appendChild(trashBtn);
            
            item.appendChild(info);
            item.appendChild(actions);
            gdriveFilesContainer.appendChild(item);
        });
    } catch(e) {
        const errorColor = resolveCssColorVar("--accent-danger", "#ef4444");
        const errDiv = document.createElement("div");
        errDiv.className = "empty-state";
        errDiv.style.color = errorColor;
        errDiv.textContent = "Error loading files: " + e.message;
        gdriveFilesContainer.replaceChildren(errDiv);
    }
}

async function trashGoogleDriveFile(fileId, fileName, event) {
    event.stopPropagation();

    if (!accessToken) {
        alert("Google session expired. Please sign in again.");
        return;
    }

    const confirmed = confirm(`Move "${fileName}" to Google Drive trash?`);
    if (!confirmed) return;

    try {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ trashed: true })
        });

        if (!response.ok) throw new Error("HTTP error " + response.status);

        if (currentDriveFileId === fileId) {
            currentDriveFileId = null;
        }

        saveStatus.textContent = "Moved to Drive trash";
        await openGoogleDriveExplorer();
    } catch (err) {
        alert("Could not move file to Google Drive trash: " + err.message);
    }
}

async function loadGoogleDriveFile(fileId) {
    showGdriveExplorer(false);
    saveStatus.textContent = "Opening file...";
    
    try {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error("HTTP error " + response.status);
        
        const data = await response.json();
        
        const normalized = normalizeImportedData(data);
        if (normalized) {
            currentDriveFileId = fileId;
            currentLocalSaveName = "";
            loadSessionData(normalized.data);
            undoStack = [];
            redoStack = [];
            saveHistory();
            centerCanvas();
            saveStatus.textContent = "Cloud saved";
            alert(`Flowchart "${normalized.data.name}" successfully loaded from Google Drive!`);
        } else {
            alert("File exists but does not match a supported FlowCraft/Lucidchart JSON format.");
            saveStatus.textContent = "Load failed";
        }
    } catch(err) {
        saveStatus.textContent = "Load failed";
        alert("Google Drive download failed: " + err.message);
    }
}

// --- Walkthrough Help Modal ---
function showHelpModal(show) {
    helpModal.classList.toggle("active", show);
}

// --- Image Captures & Document Exports ---

function getNodeTextColor(node) {
    if (node.bgColor === "transparent") return resolveCssColorVar("--text-main", "#0f172a");
    const isDark = ["#334155", "#0f172a", "#4f46e5", "#0ea5e9", "#ef4444", "#8b5cf6"].includes((node.bgColor || "").toLowerCase());
    return isDark ? "#ffffff" : resolveCssColorVar("--text-main", "#0f172a");
}

function setDashedStroke(ctx, style) {
    if (style === "dashed") ctx.setLineDash([6, 4]);
    else if (style === "dotted") ctx.setLineDash([2, 3]);
    else ctx.setLineDash([]);
}

function addRoundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawArrowHead(ctx, tipX, tipY, dirX, dirY, color, size = 10) {
    const len = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    const baseX = tipX - ux * size;
    const baseY = tipY - uy * size;
    const nx = -uy;
    const ny = ux;
    const wing = size * 0.45;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + nx * wing, baseY + ny * wing);
    ctx.lineTo(baseX - nx * wing, baseY - ny * wing);
    ctx.closePath();
    ctx.fill();
}

function drawNodeShapePath(ctx, node, x, y, w, h, strokeW) {
    const halfStroke = strokeW / 2;
    const left = x + halfStroke;
    const top = y + halfStroke;
    const width = Math.max(1, w - strokeW);
    const height = Math.max(1, h - strokeW);

    switch (node.shapeType) {
        case "rectangle":
            addRoundedRectPath(ctx, left, top, width, height, 2);
            break;
        case "terminator":
            addRoundedRectPath(ctx, left, top, width, height, height / 2);
            break;
        case "circle":
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
            ctx.closePath();
            break;
        case "diamond":
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y + strokeW);
            ctx.lineTo(x + w - strokeW, y + h / 2);
            ctx.lineTo(x + w / 2, y + h - strokeW);
            ctx.lineTo(x + strokeW, y + h / 2);
            ctx.closePath();
            break;
        case "parallelogram":
            ctx.beginPath();
            ctx.moveTo(x + w * 0.15, y + strokeW);
            ctx.lineTo(x + w - strokeW, y + strokeW);
            ctx.lineTo(x + w * 0.85, y + h - strokeW);
            ctx.lineTo(x + strokeW, y + h - strokeW);
            ctx.closePath();
            break;
        case "cylinder": {
            const ryCap = Math.min(12, h * 0.15);
            const rxCap = (w - strokeW * 2) / 2;
            const cx = x + w / 2;
            const topY = y + ryCap;
            const bottomY = y + h - ryCap;
            ctx.beginPath();
            ctx.ellipse(cx, topY, rxCap, ryCap, 0, Math.PI, 0, true);
            ctx.lineTo(x + w - strokeW, bottomY);
            ctx.ellipse(cx, bottomY, rxCap, ryCap, 0, 0, Math.PI, true);
            ctx.lineTo(x + strokeW, topY);
            ctx.closePath();
            break;
        }
        case "document": {
            const waveH = Math.min(15, h * 0.15);
            ctx.beginPath();
            ctx.moveTo(x + strokeW, y + strokeW);
            ctx.lineTo(x + w - strokeW, y + strokeW);
            ctx.lineTo(x + w - strokeW, y + h - waveH);
            ctx.quadraticCurveTo(x + w * 0.75, y + h - waveH * 2, x + w * 0.5, y + h - waveH);
            ctx.quadraticCurveTo(x + w * 0.25, y + h, x + strokeW, y + h - waveH);
            ctx.closePath();
            break;
        }
        case "hexagon":
            ctx.beginPath();
            ctx.moveTo(x + w * 0.18, y + strokeW);
            ctx.lineTo(x + w * 0.82, y + strokeW);
            ctx.lineTo(x + w - strokeW, y + h / 2);
            ctx.lineTo(x + w * 0.82, y + h - strokeW);
            ctx.lineTo(x + w * 0.18, y + h - strokeW);
            ctx.lineTo(x + strokeW, y + h / 2);
            ctx.closePath();
            break;
        case "cloud":
            addCloudPath(ctx, x + strokeW / 2, y + strokeW / 2, w - strokeW, h - strokeW);
            break;
        case "sticky-note":
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.closePath();
            break;
        default:
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.closePath();
            break;
    }
}

function buildCloudPathData(x, y, w, h) {
    const p = {
        s: { x: x + w * 0.2, y: y + h * 0.72 },
        p1: { x: x + w * 0.08, y: y + h * 0.72 },
        p2: { x: x + w * 0.16, y: y + h * 0.5 },
        p3: { x: x + w * 0.38, y: y + h * 0.44 },
        p4: { x: x + w * 0.62, y: y + h * 0.36 },
        p5: { x: x + w * 0.84, y: y + h * 0.5 },
        p6: { x: x + w * 0.92, y: y + h * 0.72 },
        p7: { x: x + w * 0.76, y: y + h * 0.8 }
    };

    return [
        `M ${p.s.x} ${p.s.y}`,
        `C ${x + w * 0.1} ${y + h * 0.86}, ${x + w * 0.02} ${y + h * 0.82}, ${p.p1.x} ${p.p1.y}`,
        `C ${x + w * 0.02} ${y + h * 0.58}, ${x + w * 0.06} ${y + h * 0.44}, ${p.p2.x} ${p.p2.y}`,
        `C ${x + w * 0.18} ${y + h * 0.3}, ${x + w * 0.3} ${y + h * 0.28}, ${p.p3.x} ${p.p3.y}`,
        `C ${x + w * 0.42} ${y + h * 0.2}, ${x + w * 0.56} ${y + h * 0.2}, ${p.p4.x} ${p.p4.y}`,
        `C ${x + w * 0.7} ${y + h * 0.2}, ${x + w * 0.82} ${y + h * 0.3}, ${p.p5.x} ${p.p5.y}`,
        `C ${x + w * 0.98} ${y + h * 0.54}, ${x + w * 0.98} ${y + h * 0.66}, ${p.p6.x} ${p.p6.y}`,
        `C ${x + w * 0.9} ${y + h * 0.84}, ${x + w * 0.84} ${y + h * 0.84}, ${p.p7.x} ${p.p7.y}`,
        `C ${x + w * 0.64} ${y + h * 0.92}, ${x + w * 0.34} ${y + h * 0.92}, ${p.s.x} ${p.s.y}`,
        "Z"
    ].join(" ");
}

function addCloudPath(ctx, x, y, w, h) {
    const p = {
        s: { x: x + w * 0.2, y: y + h * 0.72 },
        p1: { x: x + w * 0.08, y: y + h * 0.72 },
        p2: { x: x + w * 0.16, y: y + h * 0.5 },
        p3: { x: x + w * 0.38, y: y + h * 0.44 },
        p4: { x: x + w * 0.62, y: y + h * 0.36 },
        p5: { x: x + w * 0.84, y: y + h * 0.5 },
        p6: { x: x + w * 0.92, y: y + h * 0.72 },
        p7: { x: x + w * 0.76, y: y + h * 0.8 }
    };

    ctx.beginPath();
    ctx.moveTo(p.s.x, p.s.y);
    ctx.bezierCurveTo(x + w * 0.1, y + h * 0.86, x + w * 0.02, y + h * 0.82, p.p1.x, p.p1.y);
    ctx.bezierCurveTo(x + w * 0.02, y + h * 0.58, x + w * 0.06, y + h * 0.44, p.p2.x, p.p2.y);
    ctx.bezierCurveTo(x + w * 0.18, y + h * 0.3, x + w * 0.3, y + h * 0.28, p.p3.x, p.p3.y);
    ctx.bezierCurveTo(x + w * 0.42, y + h * 0.2, x + w * 0.56, y + h * 0.2, p.p4.x, p.p4.y);
    ctx.bezierCurveTo(x + w * 0.7, y + h * 0.2, x + w * 0.82, y + h * 0.3, p.p5.x, p.p5.y);
    ctx.bezierCurveTo(x + w * 0.98, y + h * 0.54, x + w * 0.98, y + h * 0.66, p.p6.x, p.p6.y);
    ctx.bezierCurveTo(x + w * 0.9, y + h * 0.84, x + w * 0.84, y + h * 0.84, p.p7.x, p.p7.y);
    ctx.bezierCurveTo(x + w * 0.64, y + h * 0.92, x + w * 0.34, y + h * 0.92, p.s.x, p.s.y);
    ctx.closePath();
}

function drawNodeLabel(ctx, node, x, y, w, h) {
    if (node.type === "image") return;
    const rawLines = String(node.text || "").split("\n");
    const textSize = Number(node.textSize) || 14;
    const offsetX = (node.textOffset && Number(node.textOffset.x)) || 0;
    const offsetY = (node.textOffset && Number(node.textOffset.y)) || 0;
    const lineHeight = textSize * 1.3;
    const placement = getTextPlacementConfig(node.textPosition);
    const paddingX = Math.max(8, Math.round(textSize * 0.7));
    const paddingY = Math.max(8, Math.round(textSize * 0.6));
    const contentWidth = Math.max(0, w - paddingX * 2);

    ctx.fillStyle = getNodeTextColor(node);
    ctx.textAlign = placement.textAlign;
    ctx.textBaseline = "alphabetic";
    ctx.font = `${textSize}px Inter, Arial, sans-serif`;

    const linesText = wrapTextForCanvas(ctx, rawLines, contentWidth);
    const totalHeight = Math.max(lineHeight, linesText.length * lineHeight);

    let anchorX = x + w / 2;
    let anchorY = y + h / 2;

    if (placement.horizontal === "left") anchorX = x + paddingX;
    if (placement.horizontal === "right") anchorX = x + w - paddingX;
    if (placement.vertical === "top") anchorY = y + paddingY;
    if (placement.vertical === "bottom") anchorY = y + h - paddingY;

    let startY = anchorY + lineHeight * 0.8;
    if (placement.vertical === "center") {
        startY = y + h / 2 - totalHeight / 2 + lineHeight * 0.8;
    } else if (placement.vertical === "top") {
        startY = y + paddingY + lineHeight * 0.8;
    } else if (placement.vertical === "bottom") {
        startY = y + h - paddingY - totalHeight + lineHeight * 0.8;
    }

    if (placement.vertical === "center" && placement.horizontal === "left") {
        startY = y + h / 2 - totalHeight / 2 + lineHeight * 0.8;
    }

    linesText.forEach((line, index) => {
        let drawX = anchorX + offsetX;
        if (placement.horizontal === "left") drawX = x + paddingX + offsetX;
        if (placement.horizontal === "right") drawX = x + w - paddingX + offsetX;
        if (placement.horizontal === "center") drawX = x + w / 2 + offsetX;
        ctx.fillText(line, drawX, startY + index * lineHeight + offsetY);
    });
}

function wrapTextForCanvas(ctx, rawLines, maxWidth) {
    if (!Array.isArray(rawLines) || rawLines.length === 0) return [""];
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return rawLines.length ? rawLines : [""];

    const wrapped = [];

    rawLines.forEach((sourceLine) => {
        const line = String(sourceLine || "");
        if (!line.trim()) {
            wrapped.push("");
            return;
        }

        let current = "";
        const words = line.split(/\s+/).filter(Boolean);

        words.forEach((word) => {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= maxWidth) {
                current = candidate;
                return;
            }

            if (current) wrapped.push(current);

            // Break long unspaced words to match CSS break-word behavior.
            if (ctx.measureText(word).width > maxWidth) {
                let chunk = "";
                for (const ch of word) {
                    const nextChunk = chunk + ch;
                    if (ctx.measureText(nextChunk).width <= maxWidth || !chunk) {
                        chunk = nextChunk;
                    } else {
                        wrapped.push(chunk);
                        chunk = ch;
                    }
                }
                current = chunk;
            } else {
                current = word;
            }
        });

        wrapped.push(current);
    });

    return wrapped.length ? wrapped : [""];
}

function getTextPlacementConfig(textPosition) {
    switch (textPosition) {
        case "top-left":
            return { horizontal: "left", vertical: "top", textAlign: "left" };
        case "top-right":
            return { horizontal: "right", vertical: "top", textAlign: "right" };
        case "bottom-left":
            return { horizontal: "left", vertical: "bottom", textAlign: "left" };
        case "bottom-right":
            return { horizontal: "right", vertical: "bottom", textAlign: "right" };
        case "top":
            return { horizontal: "center", vertical: "top", textAlign: "center" };
        case "bottom":
            return { horizontal: "center", vertical: "bottom", textAlign: "center" };
        case "left":
            return { horizontal: "left", vertical: "center", textAlign: "left" };
        case "right":
            return { horizontal: "right", vertical: "center", textAlign: "right" };
        case "center":
        default:
            return { horizontal: "center", vertical: "center", textAlign: "center" };
    }
}

function applyTextPositionStyles(textContainer, textSpan, textPosition) {
    const placement = getTextPlacementConfig(textPosition);
    textContainer.style.justifyContent = placement.horizontal === "left" ? "flex-start" : placement.horizontal === "right" ? "flex-end" : "center";
    textContainer.style.alignItems = placement.vertical === "top" ? "flex-start" : placement.vertical === "bottom" ? "flex-end" : "center";
    textSpan.style.textAlign = placement.textAlign;
}

function drawLineOnCanvas(ctx, line) {
    const fromNode = nodes[line.fromId];
    const toNode = nodes[line.toId];
    if (!fromNode || !toNode) return;

    const fromCoords = getPortCoords(line.fromId)[line.fromPort];
    const toCoords = getPortCoords(line.toId)[line.toPort];
    if (!fromCoords || !toCoords) return;

    const color = line.color || "#64748b";
    const thickness = Number(line.thickness) || 2.5;

    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    setDashedStroke(ctx, line.lineStyle);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    let startDir = { x: toCoords.x - fromCoords.x, y: toCoords.y - fromCoords.y };
    let endDir = { x: toCoords.x - fromCoords.x, y: toCoords.y - fromCoords.y };

    if (line.lineType === "curved") {
        if (line.manualWaypoint && Number.isFinite(line.manualWaypoint.x) && Number.isFinite(line.manualWaypoint.y)) {
            const wx = line.manualWaypoint.x;
            const wy = line.manualWaypoint.y;
            ctx.beginPath();
            ctx.moveTo(fromCoords.x, fromCoords.y);
            ctx.quadraticCurveTo(wx, wy, toCoords.x, toCoords.y);
            ctx.stroke();

            startDir = { x: wx - fromCoords.x, y: wy - fromCoords.y };
            endDir = { x: toCoords.x - wx, y: toCoords.y - wy };
        } else {
            const distance = Math.hypot(toCoords.x - fromCoords.x, toCoords.y - fromCoords.y);
            const ctrlOffset = Math.min(120, distance * 0.4);
            const ctrl1 = getPortVectorOffset(line.fromPort, ctrlOffset);
            const ctrl2 = getPortVectorOffset(line.toPort, ctrlOffset);
            const c1x = fromCoords.x + ctrl1.x;
            const c1y = fromCoords.y + ctrl1.y;
            const c2x = toCoords.x + ctrl2.x;
            const c2y = toCoords.y + ctrl2.y;

            ctx.beginPath();
            ctx.moveTo(fromCoords.x, fromCoords.y);
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, toCoords.x, toCoords.y);
            ctx.stroke();

            startDir = { x: c1x - fromCoords.x, y: c1y - fromCoords.y };
            endDir = { x: toCoords.x - c2x, y: toCoords.y - c2y };
        }
    } else if (line.lineType === "straight") {
        const points = getLineStraightPolyline(line, fromCoords, toCoords);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();

        startDir = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
        const n = points.length;
        endDir = { x: points[n - 1].x - points[n - 2].x, y: points[n - 1].y - points[n - 2].y };
    } else {
        const points = getLineOrthogonalPolyline(line, fromCoords, toCoords);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();

        startDir = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
        const n = points.length;
        endDir = { x: points[n - 1].x - points[n - 2].x, y: points[n - 1].y - points[n - 2].y };
    }

    if (line.hasArrow === "end" || line.hasArrow === "both") {
        drawArrowHead(ctx, toCoords.x, toCoords.y, endDir.x, endDir.y, color, Math.max(8, thickness * 3.5));
    }
    if (line.hasArrow === "start" || line.hasArrow === "both") {
        drawArrowHead(ctx, fromCoords.x, fromCoords.y, -startDir.x, -startDir.y, color, Math.max(8, thickness * 3.5));
    }

    ctx.setLineDash([]);
}

function loadImageElement(src) {
    return new Promise((resolve) => {
        if (!src) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// Utility to render the flowchart model into a single PNG image URL
async function getFlowchartCanvasImage() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const nodeIds = Object.keys(nodes);

    if (nodeIds.length === 0) {
        minX = -100; maxX = 100; minY = -100; maxY = 100;
    } else {
        nodeIds.forEach(id => {
            const node = nodes[id];
            minX = Math.min(minX, node.x - node.width / 2);
            maxX = Math.max(maxX, node.x + node.width / 2);
            minY = Math.min(minY, node.y - node.height / 2);
            maxY = Math.max(maxY, node.y + node.height / 2);
        });
    }

    const margin = 40;
    const outW = Math.max(1, Math.ceil((maxX - minX) + margin * 2));
    const outH = Math.max(1, Math.ceil((maxY - minY) + margin * 2));
    const originX = minX - margin;
    const originY = minY - margin;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = outW;
    exportCanvas.height = outH;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not create export canvas");

    ctx.fillStyle = resolveCssColorVar("--bg-app", "#f8fafc");
    ctx.fillRect(0, 0, outW, outH);

    ctx.save();
    ctx.translate(-originX, -originY);

    const orderedNodes = Object.values(nodes).slice().sort((a, b) => (a.zIndex || 10) - (b.zIndex || 10));
    const imageNodes = orderedNodes.filter(n => n.type === "image");
    const loadedImages = await Promise.all(imageNodes.map(n => loadImageElement(n.imageUrl)));
    const imageMap = new Map();
    imageNodes.forEach((node, idx) => imageMap.set(node.id, loadedImages[idx]));

    orderedNodes.forEach(node => {
        const x = node.x - node.width / 2;
        const y = node.y - node.height / 2;
        const w = node.width;
        const h = node.height;

        if (node.type === "image") {
            const img = imageMap.get(node.id);
            if (img) {
                const crop = node.crop || { left: 0, top: 0, right: 0, bottom: 0 };
                const left = Math.max(0, Math.min(0.9, Number(crop.left) || 0));
                const top = Math.max(0, Math.min(0.9, Number(crop.top) || 0));
                const right = Math.max(0, Math.min(0.9, Number(crop.right) || 0));
                const bottom = Math.max(0, Math.min(0.9, Number(crop.bottom) || 0));
                const visW = Math.max(0.05, 1 - left - right);
                const visH = Math.max(0.05, 1 - top - bottom);

                const sx = img.width * left;
                const sy = img.height * top;
                const sw = img.width * visW;
                const sh = img.height * visH;

                ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
            }

            const borderW = Number(node.borderWidth) || 1;
            if (borderW > 0) {
                ctx.strokeStyle = node.borderColor || "#cbd5e1";
                ctx.lineWidth = borderW;
                setDashedStroke(ctx, node.borderStyle || "solid");
                ctx.strokeRect(x + borderW / 2, y + borderW / 2, Math.max(1, w - borderW), Math.max(1, h - borderW));
                ctx.setLineDash([]);
            }
            return;
        }

        if (node.shapeType !== "text-box") {
            const strokeW = Number(node.borderWidth) || 0;
            ctx.fillStyle = node.bgColor || "transparent";
            ctx.strokeStyle = node.borderColor || "#64748b";
            ctx.lineWidth = strokeW;
            setDashedStroke(ctx, node.borderStyle || "solid");

            drawNodeShapePath(ctx, node, x, y, w, h, strokeW);
            if (node.bgColor && node.bgColor !== "transparent") ctx.fill();
            if (strokeW > 0) ctx.stroke();

            if (node.shapeType === "sticky-note") {
                const foldSize = Math.min(w, h) * 0.2;
                const s = strokeW || 1;
                ctx.fillStyle = "#fef9c3";
                ctx.beginPath();
                ctx.moveTo(x + w - foldSize - s / 2, y + s / 2);
                ctx.lineTo(x + w - foldSize - s / 2, y + foldSize + s / 2);
                ctx.lineTo(x + w - s / 2, y + foldSize + s / 2);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = node.borderColor || "#ca8a04";
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        drawNodeLabel(ctx, node, x, y, w, h);
    });

    // Match on-canvas behavior where connectors render above node shapes.
    lines.forEach(line => drawLineOnCanvas(ctx, line));

    ctx.restore();

    return {
        imgData: exportCanvas.toDataURL("image/png"),
        width: outW,
        height: outH
    };
}

async function exportToPDF() {
    saveStatus.textContent = "Exporting PDF...";
    try {
        const capture = await getFlowchartCanvasImage();
        const { jsPDF } = window.jspdf;
        
        // Create matching landscape/portrait layout size PDF
        const orientation = capture.width > capture.height ? "l" : "p";
        const pdf = new jsPDF({
            orientation: orientation,
            unit: "px",
            format: [capture.width + 40, capture.height + 40]
        });
        
        pdf.addImage(capture.imgData, "PNG", 20, 20, capture.width, capture.height);
        pdf.save(currentDocName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf");
        
        saveStatus.textContent = "Export complete";
    } catch(e) {
        alert("Failed to export PDF: " + e.message);
        saveStatus.textContent = "Export failed";
    }
}

// Start the App
document.addEventListener("DOMContentLoaded", init);

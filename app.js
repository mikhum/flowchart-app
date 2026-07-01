// FlowCraft - Core Flowchart & Infrastructure Engine
const APP_BUILD = "2026-06-30-vsdx-domparser-2";

// --- Application State ---
let nodes = {};
let lines = [];

// Selection states
let selectedId = null; 
let selectedType = null; // 'node' | 'line'
let copiedElement = null; // { type: 'node' | 'line', payload: object }
let pasteSerial = 0;

// Camera Viewport Panning and Zooming
let viewportTransform = { x: 0, y: 0, scale: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };

// Node drag and resize states
let draggingNodeId = null;
let dragStartMouse = { x: 0, y: 0 };
let dragStartNodePos = { x: 0, y: 0 };
let dragDelta = { x: 0, y: 0 };

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

// Snap to grid
let snapGridEnabled = true;
const GRID_SIZE = 20;

// Document Title & Local Saves
let currentDocName = "Untitled Flowchart";
let currentLocalSaveName = "";
let currentDriveFileId = null; // Google Drive File ID

// Google OAuth & GIS States
let googleClientId = localStorage.getItem("flowcraft_google_client_id") || "";
let accessToken = "";
let userProfile = null;
let tokenClient = null;
const ALLOWED_GOOGLE_DOMAIN = "hummel.se";

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
const svgOverlay = document.getElementById("svg-overlay");
const zoomIndicator = document.getElementById("zoom-indicator");
const docTitle = document.getElementById("doc-title");
const saveStatus = document.getElementById("save-status");

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
const btnExportWord = document.getElementById("btn-export-word");
const btnExportPDF = document.getElementById("btn-export-pdf");
const btnExportJson = document.getElementById("btn-export-json");
const btnImportJson = document.getElementById("btn-import-json");
const btnImportVsdx = document.getElementById("btn-import-vsdx");
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
const btnDeleteSelected = document.getElementById("btn-delete-selected");

// --- Initialization ---
function init() {
    console.info("FlowCraft build:", APP_BUILD);
    loadDefaultLineSettings();
    setupEventListeners();
    setupColorPickers();
    loadLocalFilesList();
    
    // Set snap grid button state
    updateSnapGridButtonState();
    
    // Auto load last saved map or create a starting node
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
    
    // Google GIS Auto login check
    if (googleClientId) {
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
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].bgColor = color;
        saveHistory();
        render();
        updatePropertiesPanel();
    }
}

function selectBorderColor(color) {
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].borderColor = color;
        saveHistory();
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

    // Workspace Panning & Click Off
    workspace.addEventListener("pointerdown", handleWorkspacePointerDown);
    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    
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
    btnExportWord.addEventListener("click", exportToWord);
    btnExportPDF.addEventListener("click", exportToPDF);
    btnExportJson.addEventListener("click", exportJsonFile);
    btnImportJson.addEventListener("click", () => {
        fileImportInput.accept = ".json,.flowchart";
        fileImportInput.click();
    });
    btnImportVsdx.addEventListener("click", () => {
        fileImportInput.accept = ".vsdx";
        fileImportInput.click();
    });
    fileImportInput.addEventListener("change", importJsonFile);

    // Modals buttons
    closeHelpModal.addEventListener("click", () => showHelpModal(false));
    btnCloseHelp.addEventListener("click", () => showHelpModal(false));
    
    btnConfigureGoogle.addEventListener("click", () => showGoogleConfigModal(true));
    btnGoogleSignIn.addEventListener("click", startGoogleSignIn);
    closeConfigModal.addEventListener("click", () => showGoogleConfigModal(false));
    btnSaveConfig.addEventListener("click", saveGoogleConfig);
    btnClearConfig.addEventListener("click", clearGoogleConfig);
    
    btnOpenGdrive.addEventListener("click", openGoogleDriveExplorer);
    btnSaveGdrive.addEventListener("click", saveToGoogleDrive);
    closeGdriveModal.addEventListener("click", () => showGdriveExplorer(false));
    btnCloseGdriveExplorer.addEventListener("click", () => showGdriveExplorer(false));

    // Properties panel bindings
    closeProperties.addEventListener("click", () => selectElement(null));
    propText.addEventListener("input", updateSelectedNodeText);
    propTextSize.addEventListener("input", updateSelectedNodeTextSize);
    propUrl.addEventListener("input", updateSelectedNodeUrl);
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

// --- Panning & Drag/Drop Pointer Handling ---
function handleWorkspacePointerDown(e) {
    // Escape properties selection on background click
    if (selectedId && !e.target.closest(".node") && !e.target.closest(".properties-panel") && !e.target.closest(".topbar") && !e.target.closest(".sidebar") && !e.target.closest(".floating-controls") && !e.target.closest(".connector-line-overlay")) {
        selectElement(null);
    }
    
    if (e.target.closest(".node") || e.target.closest(".properties-panel") || e.target.closest(".sidebar") || e.target.closest(".floating-controls") || e.target.closest(".modal")) {
        return;
    }
    
    isPanning = true;
    canvas.classList.add("grabbing");
    panStart = { x: e.clientX, y: e.clientY };
    panOffset = { x: viewportTransform.x, y: viewportTransform.y };
    workspace.setPointerCapture(e.pointerId);
}

function handleGlobalPointerMove(e) {
    if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        viewportTransform.x = panOffset.x + dx;
        viewportTransform.y = panOffset.y + dy;
        updateCanvasTransform();
    } else if (draggingNodeId && nodes[draggingNodeId]) {
        // Move shape node
        const coords = screenToCanvas(e.clientX, e.clientY);
        const startCoords = screenToCanvas(dragStartMouse.x, dragStartMouse.y);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;
        
        nodes[draggingNodeId].x = snap(dragStartNodePos.x + dx);
        nodes[draggingNodeId].y = snap(dragStartNodePos.y + dy);
        
        const nodeEl = document.getElementById("node-" + draggingNodeId);
        if (nodeEl) {
            nodeEl.style.left = `${nodes[draggingNodeId].x}px`;
            nodeEl.style.top = `${nodes[draggingNodeId].y}px`;
        }
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
    } else if (draggingNodeId) {
        const didMove = dragStartNodePos.x !== nodes[draggingNodeId].x || dragStartNodePos.y !== nodes[draggingNodeId].y;
        draggingNodeId = null;
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
    "text-box", "sticky-note"
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
    preview.style.backgroundColor = "var(--accent-primary-light)";
    preview.style.border = "1px solid var(--accent-primary)";
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
    
    const coords = screenToCanvas(e.clientX, e.clientY);
    addNewShapeNode(shapeType, snap(coords.x), snap(coords.y));
}

function addNewShapeNode(shapeType, x, y) {
    const id = "node_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const isTextBox = shapeType === "text-box";
    const isStickyNote = shapeType === "sticky-note";
    
    nodes[id] = {
        id: id,
        type: "shape",
        shapeType: shapeType,
        x: x,
        y: y,
        width: 120,
        height: isTextBox ? 36 : (isStickyNote ? 90 : 60),
        text: isTextBox ? "Text" : (isStickyNote ? "Notering" : "New Shape"),
        textOffset: { x: 0, y: 0 },
        textSize: 14,
        bgColor: isTextBox ? "transparent" : (isStickyNote ? "#fef08a" : "#ffffff"),
        borderColor: isTextBox ? "transparent" : (isStickyNote ? "#ca8a04" : "#64748b"),
        borderWidth: isTextBox ? 0 : (isStickyNote ? 1 : 2),
        borderStyle: "solid",
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
                if (selectedId === id && selectedType === "node") {
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
                e.stopPropagation();
                selectElement(id, "node");
                
                draggingNodeId = id;
                dragStartMouse = { x: e.clientX, y: e.clientY };
                dragStartNodePos = { x: node.x, y: node.y };
                nodeEl.setPointerCapture(e.pointerId);
            });
            
            // Add resize handle
            const resizeHandle = document.createElement("div");
            resizeHandle.className = "resize-handle";
            resizeHandle.addEventListener("pointerdown", (e) => {
                e.stopPropagation();
                resizingNodeId = id;
                resizeStartMouse = { x: e.clientX, y: e.clientY };
                resizeStartNodeSize = { width: node.width, height: node.height };
                resizeHandle.setPointerCapture(e.pointerId);
            });
            nodeEl.appendChild(resizeHandle);
            
            nodesContainer.appendChild(nodeEl);
        }
        
        // Node Properties Updates
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
        nodeEl.style.width = `${node.width}px`;
        nodeEl.style.height = `${node.height}px`;
        nodeEl.style.zIndex = node.zIndex || 10;
        
        // Handle selection state styling
        nodeEl.classList.toggle("selected", selectedId === id && selectedType === "node");
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
                textSpan.style.color = "var(--text-main)";
            } else {
                // simple contrast calculation: light bg gets main text, dark gets white text
                const isDark = ["#334155", "#0f172a", "#4f46e5", "#0ea5e9", "#ef4444", "#8b5cf6"].includes(node.bgColor);
                textSpan.style.color = isDark ? "white" : "var(--text-main)";
            }
        }
        
        // Apply text dragging translation
        const textContainer = nodeEl.querySelector(".node-text-container");
        if (textContainer) {
            textContainer.style.transform = `translate(${node.textOffset.x}px, ${node.textOffset.y}px)`;
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
                    window.open(node.url, "_blank");
                });
                nodeEl.appendChild(linkIcon);
            }
        } else if (linkIcon) {
            linkIcon.remove();
        }
    });
    
    renderConnectors();
    saveAutosave();
}

function generateShapeSVG(node) {
    const w = node.width;
    const h = node.height;
    const fill = node.bgColor;
    const stroke = node.borderColor;
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

        default:
            return "";
    }
}

// --- Connector Lines rendering ---
function renderConnectors() {
    svgOverlay.innerHTML = "";
    
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
        
        let pathD = "";
        
        if (line.lineType === "straight") {
            pathD = `M ${fromCoords.x} ${fromCoords.y} L ${toCoords.x} ${toCoords.y}`;
        } else if (line.lineType === "curved") {
            const distance = Math.hypot(toCoords.x - fromCoords.x, toCoords.y - fromCoords.y);
            const ctrlOffset = Math.min(120, distance * 0.4);
            
            const ctrl1 = getPortVectorOffset(line.fromPort, ctrlOffset);
            const ctrl2 = getPortVectorOffset(line.toPort, ctrlOffset);
            
            pathD = `M ${fromCoords.x} ${fromCoords.y} C ${fromCoords.x + ctrl1.x} ${fromCoords.y + ctrl1.y}, ${toCoords.x + ctrl2.x} ${toCoords.y + ctrl2.y}, ${toCoords.x} ${toCoords.y}`;
        } else { // orthogonal (elbow bends)
            pathD = getOrthogonalPath(fromCoords.x, fromCoords.y, line.fromPort, toCoords.x, toCoords.y, line.toPort);
        }
        
        // Draw physical line path
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathD);
        path.setAttribute("class", "connector-line" + (selectedId === line.id && selectedType === "line" ? " selected" : ""));
        path.style.stroke = selectedId === line.id && selectedType === "line" ? "var(--accent-primary)" : line.color;
        path.style.strokeWidth = `${line.thickness}px`;
        
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
            e.stopPropagation();
            selectElement(line.id, "line");
        });
        svgOverlay.appendChild(overlay);
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
}

function getPortVectorOffset(portName, offset) {
    switch (portName) {
        case "top": return { x: 0, y: -offset };
        case "right": return { x: offset, y: 0 };
        case "bottom": return { x: 0, y: offset };
        case "left": return { x: -offset, y: 0 };
    }
}

// Clean right-angle elbow routing
function getOrthogonalPath(x1, y1, port1, x2, y2, port2) {
    const buffer = 24;
    
    // start direction vector offsets
    const startOffset = getPortVectorOffset(port1, buffer);
    const endOffset = getPortVectorOffset(port2, buffer);
    
    const px1 = x1 + startOffset.x;
    const py1 = y1 + startOffset.y;
    const px2 = x2 + endOffset.x;
    const py2 = y2 + endOffset.y;
    
    let path = `M ${x1} ${y1} L ${px1} ${py1} `;
    
    if (port1 === "left" || port1 === "right") {
        if (port2 === "left" || port2 === "right") {
            const midX = (px1 + px2) / 2;
            path += `L ${midX} ${py1} L ${midX} ${py2} L ${px2} ${py2}`;
        } else {
            path += `L ${px2} ${py1} L ${px2} ${py2}`;
        }
    } else { // top or bottom
        if (port2 === "top" || port2 === "bottom") {
            const midY = (py1 + py2) / 2;
            path += `L ${px1} ${midY} L ${px2} ${midY} L ${px2} ${py2}`;
        } else {
            path += `L ${px1} ${py2} L ${px2} ${py2}`;
        }
    }
    
    path += ` L ${x2} ${y2}`;
    return path;
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
function selectElement(id, type = null) {
    selectedId = id;
    selectedType = type;
    
    // Update visual nodes selected state
    Object.keys(nodes).forEach(nodeId => {
        const el = document.getElementById("node-" + nodeId);
        if (el) el.classList.toggle("selected", selectedId === nodeId && selectedType === "node");
    });
    
    updatePropertiesPanel();
    renderConnectors();
}

function updatePropertiesPanel() {
    if (!selectedId) {
        propertiesPanel.style.display = "none";
        propNodeSection.style.display = "none";
        propLineSection.style.display = "none";
        return;
    }
    
    propertiesPanel.style.display = "flex";
    
    if (selectedType === "node" && nodes[selectedId]) {
        propNodeSection.style.display = "block";
        propLineSection.style.display = "none";
        
        const node = nodes[selectedId];
        propText.value = node.text;
        propTextSize.value = node.textSize || 14;
        propUrl.value = node.url || "";
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
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].text = propText.value;
        const textSpan = document.querySelector(`#node-${selectedId} .node-text`);
        if (textSpan) textSpan.textContent = propText.value;
    }
}

function updateSelectedNodeTextSize() {
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].textSize = parseInt(propTextSize.value, 10) || 14;
        render();
    }
}

function updateSelectedNodeUrl() {
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].url = propUrl.value.trim();
        render();
    }
}

function updateSelectedNodeWidth() {
    if (selectedType === "node" && nodes[selectedId]) {
        const width = Math.max(40, parseInt(propNodeWidth.value, 10) || nodes[selectedId].width || 120);
        nodes[selectedId].width = snap(width);
        saveHistory();
        render();
    }
}

function updateSelectedNodeHeight() {
    if (selectedType === "node" && nodes[selectedId]) {
        const height = Math.max(30, parseInt(propNodeHeight.value, 10) || nodes[selectedId].height || 60);
        nodes[selectedId].height = snap(height);
        saveHistory();
        render();
    }
}

function updateSelectedNodeCrop() {
    if (selectedType === "node" && nodes[selectedId] && nodes[selectedId].type === "image") {
        const left = Math.max(0, Math.min(90, parseInt(propCropLeft.value, 10) || 0)) / 100;
        const top = Math.max(0, Math.min(90, parseInt(propCropTop.value, 10) || 0)) / 100;
        const right = Math.max(0, Math.min(90, parseInt(propCropRight.value, 10) || 0)) / 100;
        const bottom = Math.max(0, Math.min(90, parseInt(propCropBottom.value, 10) || 0)) / 100;

        const maxLR = Math.max(0, 0.95 - right);
        const safeLeft = Math.min(left, maxLR);
        const maxTB = Math.max(0, 0.95 - bottom);
        const safeTop = Math.min(top, maxTB);

        nodes[selectedId].crop = {
            left: safeLeft,
            top: safeTop,
            right,
            bottom
        };

        saveHistory();
        render();
    }
}

function resetSelectedNodeCrop() {
    if (selectedType === "node" && nodes[selectedId] && nodes[selectedId].type === "image") {
        nodes[selectedId].crop = { left: 0, top: 0, right: 0, bottom: 0 };
        propCropLeft.value = "0";
        propCropTop.value = "0";
        propCropRight.value = "0";
        propCropBottom.value = "0";
        saveHistory();
        render();
    }
}

function updateSelectedNodeBorderWidth() {
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].borderWidth = parseInt(propBorderWidth.value, 10);
        saveHistory();
        render();
    }
}

function updateSelectedNodeBorderStyle() {
    if (selectedType === "node" && nodes[selectedId]) {
        nodes[selectedId].borderStyle = propBorderStyle.value;
        saveHistory();
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
    if (!selectedId) return;
    
    if (selectedType === "node") {
        deleteNode(selectedId);
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
    if (selectedType === "node" && nodes[selectedId]) {
        let maxZ = 10;
        Object.values(nodes).forEach(n => {
            if (n.zIndex && n.zIndex > maxZ) maxZ = n.zIndex;
        });
        nodes[selectedId].zIndex = maxZ + 1;
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
    if (selectedType === "node" && nodes[selectedId]) {
        let minZ = 10;
        Object.values(nodes).forEach(n => {
            if (n.zIndex && n.zIndex < minZ) minZ = n.zIndex;
        });
        nodes[selectedId].zIndex = minZ - 1;
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

// --- Keyboard Handling ---
function handleKeyDown(e) {
    // Disable shortcuts if writing text or in modals
    if (editingNodeId || document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.contentEditable === "true") {
        return;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    
    // Delete key
    if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedElement();
    }
    
    // F2 to Edit Text
    if (e.key === "F2" && selectedId && selectedType === "node") {
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
        preparation: "hexagon"
    };
    const supported = new Set([
        "rectangle", "diamond", "terminator", "parallelogram", "cylinder", "document", "hexagon", "circle",
        "text-box", "sticky-note"
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

function parseMaybeNumber(value, fallback = NaN) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function hasLocalName(el, name) {
    return !!el && el.nodeType === 1 && String(el.localName || el.nodeName || "").toLowerCase() === String(name).toLowerCase();
}

function getDescendantsByLocalName(root, name) {
    if (!root || !root.getElementsByTagName) return [];
    const all = root.getElementsByTagName("*");
    const out = [];
    for (let i = 0; i < all.length; i += 1) {
        if (hasLocalName(all[i], name)) out.push(all[i]);
    }
    return out;
}

function getFirstDescendantByLocalName(root, name) {
    const matches = getDescendantsByLocalName(root, name);
    return matches.length ? matches[0] : null;
}

function getDirectChildrenByLocalName(root, name) {
    if (!root || !root.children) return [];
    const out = [];
    for (let i = 0; i < root.children.length; i += 1) {
        if (hasLocalName(root.children[i], name)) out.push(root.children[i]);
    }
    return out;
}

function getPageTopLevelShapes(pageRoot) {
    const directShapesContainers = getDirectChildrenByLocalName(pageRoot, "Shapes");
    const shapesContainer = directShapesContainers.length
        ? directShapesContainers[0]
        : getFirstDescendantByLocalName(pageRoot, "Shapes");
    if (!shapesContainer) return [];
    return getDirectChildrenByLocalName(shapesContainer, "Shape");
}

function getDirectChildShapes(shapeEl) {
    const shapesContainers = getDirectChildrenByLocalName(shapeEl, "Shapes");
    if (!shapesContainers.length) return [];
    return getDirectChildrenByLocalName(shapesContainers[0], "Shape");
}

function hasChildShapes(shapeEl) {
    return getDirectChildShapes(shapeEl).length > 0;
}

function getParentShapeElement(shapeEl) {
    let curr = shapeEl ? shapeEl.parentElement : null;
    while (curr) {
        if (hasLocalName(curr, "Shape")) return curr;
        curr = curr.parentElement;
    }
    return null;
}

function detectFlowcraftShapeTypeFromVisio(shapeEl) {
    const hint = String(shapeEl?.getAttribute("NameU") || shapeEl?.getAttribute("Name") || "").toLowerCase();
    if (hint.includes("mindmapcloud") || hint.includes("cloud")) return "rectangle";
    if (hint.includes("bpmnactivity")) return "terminator";
    if (hint.includes("stickiesstickynoteblock") || hint.includes("sticky")) return "document";
    if (hint.includes("defaultsquareblock")) return "rectangle";
    if (hint.includes("userimage")) return "rectangle";
    if (hint.includes("decision") || hint.includes("diamond")) return "diamond";
    if (hint.includes("terminator") || hint.includes("start") || hint.includes("end")) return "terminator";
    if (hint.includes("database") || hint.includes("cylinder") || hint.includes("datastore")) return "cylinder";
    if (hint.includes("document")) return "document";
    if (hint.includes("hexagon") || hint.includes("preparation")) return "hexagon";
    if (hint.includes("circle") || hint.includes("connector")) return "circle";
    if (hint.includes("user") || hint.includes("person")) return "rectangle";
    return "rectangle";
}

function getVisioCellValue(containerEl, cellName) {
    if (!containerEl) return undefined;
    const directCells = getDirectChildrenByLocalName(containerEl, "Cell");
    const match = directCells.find(cell => String(cell.getAttribute("N") || "") === cellName);
    return match ? match.getAttribute("V") : undefined;
}

function getVisioShapeCellValue(shapeEl, cellName) {
    const xform = getFirstDescendantByLocalName(shapeEl, "XForm");
    const fromXform = getVisioCellValue(xform, cellName);
    if (fromXform !== undefined) return fromXform;
    return getVisioCellValue(shapeEl, cellName);
}

function buildPortByPosition(fromNode, toNode) {
    return getPortToward(fromNode, toNode);
}

async function parseVsdxToFlowcraft(file) {
    if (typeof JSZip === "undefined") {
        throw new Error("VSDX library not loaded. Refresh the page and try again.");
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const pagePaths = Object.keys(zip.files)
        .filter(p => /^visio\/pages\/page\d+\.xml$/i.test(p))
        .sort((a, b) => {
            const ai = parseInt((a.match(/page(\d+)\.xml/i) || ["", "0"])[1], 10);
            const bi = parseInt((b.match(/page(\d+)\.xml/i) || ["", "0"])[1], 10);
            return ai - bi;
        });

    if (pagePaths.length === 0) {
        throw new Error("No Visio page XML found in VSDX.");
    }

    const nodesOut = {};
    const linesOut = [];
    let globalLineCounter = 0;

    for (let pageIndex = 0; pageIndex < pagePaths.length; pageIndex += 1) {
        const pagePath = pagePaths[pageIndex];
        const xmlText = await zip.file(pagePath).async("string");
        const xmlDoc = new DOMParser().parseFromString(xmlText, "application/xml");
        const parseErrors = xmlDoc.getElementsByTagName("parsererror");
        if (parseErrors && parseErrors.length > 0) {
            throw new Error(`Failed to parse VSDX XML at ${pagePath}`);
        }

        const pageRoot = xmlDoc.documentElement;
        const pageSheet = getFirstDescendantByLocalName(pageRoot, "PageSheet");
        const pageHeightIn = parseMaybeNumber(getVisioCellValue(pageSheet, "PageHeight"), 8.5);
        const pageWidthIn = parseMaybeNumber(getVisioCellValue(pageSheet, "PageWidth"), 11);
        const pageHeightPx = pageHeightIn * 96;
        const pageWidthPx = pageWidthIn * 96;
        const pageYOffset = pageIndex * (pageHeightPx + 300);

        const allShapes = getDescendantsByLocalName(pageRoot, "Shape");
        const topLevelShapes = getPageTopLevelShapes(pageRoot);
        const candidateShapes = topLevelShapes.length ? topLevelShapes : allShapes;
        const shapeParentById = {};
        const shapeById = {};

        allShapes.forEach(shape => {
            const sid = String(shape.getAttribute("ID") || "").trim();
            if (!sid) return;
            shapeById[sid] = shape;
            const parentShape = getParentShapeElement(shape);
            if (parentShape) {
                const parentId = String(parentShape.getAttribute("ID") || "").trim();
                if (parentId) shapeParentById[sid] = parentId;
            }
        });

        const connectorIds = new Set();

        allShapes.forEach(shape => {
            const id = String(shape.getAttribute("ID") || "").trim();
            if (!id) return;

            const oneD = String(getVisioShapeCellValue(shape, "OneD") || "").trim();
            const nameHint = String(shape.getAttribute("NameU") || shape.getAttribute("Name") || "").toLowerCase();
            const isConnector = oneD === "1" || nameHint.includes("connector") || nameHint.includes("dynamic connector");
            if (isConnector) connectorIds.add(id);
        });

        candidateShapes.forEach(shape => {
            const id = String(shape.getAttribute("ID") || "").trim();
            if (!id || nodesOut[id]) return;

            if (connectorIds.has(id)) return;

            const pinX = parseMaybeNumber(getVisioShapeCellValue(shape, "PinX"), NaN);
            const pinY = parseMaybeNumber(getVisioShapeCellValue(shape, "PinY"), NaN);
            const width = Math.max(60, parseMaybeNumber(getVisioShapeCellValue(shape, "Width"), 1.4) * 96);
            const height = Math.max(30, parseMaybeNumber(getVisioShapeCellValue(shape, "Height"), 0.8) * 96);
            const locPinX = parseMaybeNumber(getVisioShapeCellValue(shape, "LocPinX"), width / 192) * 96;
            const locPinY = parseMaybeNumber(getVisioShapeCellValue(shape, "LocPinY"), height / 192) * 96;

            let x = 0;
            let y = 0;
            if (Number.isFinite(pinX)) {
                // Visio PinX is anchored by LocPinX inside the shape. Convert to center in top-origin space.
                x = (pinX * 96) - locPinX + (width / 2);
            }
            if (Number.isFinite(pinY)) {
                // Visio Y grows upward; also adjust for LocPinY to align shape center.
                y = pageHeightPx - ((pinY * 96) - locPinY + (height / 2));
            }

            x = snap(x - pageWidthPx / 2);
            y = snap(y - pageHeightPx / 2 + pageYOffset);

            const textEl = getFirstDescendantByLocalName(shape, "Text");
            const text = textEl ? String(textEl.textContent || "").replace(/\s+/g, " ").trim() : "";
            const nameHint = String(shape.getAttribute("NameU") || shape.getAttribute("Name") || "").toLowerCase();
            const nodeType = (getFirstDescendantByLocalName(shape, "ForeignData") || nameHint.includes("userimage")) ? "image" : "shape";

            // Ignore tiny helper leaves that are not user-visible symbols.
            if (nodeType === "shape" && width < 20 && height < 20 && !text) return;

            const node = {
                id,
                type: nodeType,
                shapeType: detectFlowcraftShapeTypeFromVisio(shape),
                x,
                y,
                width: snap(width),
                height: snap(height),
                text: text || String(shape.getAttribute("NameU") || shape.getAttribute("Name") || `Shape ${id}`),
                textOffset: { x: 0, y: 0 },
                textSize: 14,
                bgColor: nodeType === "image" ? "transparent" : "#ffffff",
                borderColor: nodeType === "image" ? "transparent" : "#64748b",
                borderWidth: nodeType === "image" ? 0 : 2,
                borderStyle: "solid",
                url: ""
            };

            nodesOut[id] = node;
        });

        const importedNodeIds = new Set(Object.keys(nodesOut));
        const resolveNodeId = (rawId) => {
            let curr = rawId;
            const visited = new Set();
            while (curr && !visited.has(curr)) {
                if (importedNodeIds.has(curr)) return curr;
                visited.add(curr);
                curr = shapeParentById[curr];
            }
            return null;
        };

        const connects = getDescendantsByLocalName(pageRoot, "Connect");
        const connectorMap = {};

        connects.forEach(conn => {
            const fromSheet = String(conn.getAttribute("FromSheet") || "").trim();
            const toSheet = String(conn.getAttribute("ToSheet") || "").trim();
            const fromCell = String(conn.getAttribute("FromCell") || "").toLowerCase();
            const resolvedToNodeId = resolveNodeId(toSheet);

            if (!fromSheet || !toSheet) return;
            if (!connectorIds.has(fromSheet)) return;
            if (!resolvedToNodeId || !nodesOut[resolvedToNodeId]) return;

            if (!connectorMap[fromSheet]) connectorMap[fromSheet] = { fromId: null, toId: null };

            if (fromCell.includes("begin")) {
                connectorMap[fromSheet].fromId = resolvedToNodeId;
            } else if (fromCell.includes("end")) {
                connectorMap[fromSheet].toId = resolvedToNodeId;
            } else if (!connectorMap[fromSheet].fromId) {
                connectorMap[fromSheet].fromId = resolvedToNodeId;
            } else if (!connectorMap[fromSheet].toId) {
                connectorMap[fromSheet].toId = resolvedToNodeId;
            }
        });

        Object.keys(connectorMap).forEach(connectorId => {
            const entry = connectorMap[connectorId];
            if (!entry?.fromId || !entry?.toId || entry.fromId === entry.toId) return;
            const fromNode = nodesOut[entry.fromId];
            const toNode = nodesOut[entry.toId];
            if (!fromNode || !toNode) return;

            globalLineCounter += 1;
            linesOut.push({
                id: `vsdx_line_${connectorId}_${globalLineCounter}`,
                fromId: entry.fromId,
                fromPort: buildPortByPosition(fromNode, toNode),
                toId: entry.toId,
                toPort: buildPortByPosition(toNode, fromNode),
                lineType: "orthogonal",
                lineStyle: "solid",
                color: "#64748b",
                thickness: 2.5,
                hasArrow: "end"
            });
        });
    }

    if (Object.keys(nodesOut).length === 0) {
        throw new Error("No shapes found in VSDX pages.");
    }

    return {
        format: "flowcraft",
        version: "1.0",
        name: file.name.replace(/\.vsdx$/i, "") || "Imported VSDX Diagram",
        nodes: nodesOut,
        lines: linesOut
    };
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
            bgColor: readString(item, ["fillColor", "backgroundColor", "bgColor", "style.fill", "style.fillColor"], "#ffffff"),
            borderColor: readString(item, ["strokeColor", "lineColor", "borderColor", "style.stroke", "style.strokeColor"], "#64748b"),
            borderWidth: Math.max(1, readNum(item, ["strokeWidth", "lineWidth", "borderWidth", "style.strokeWidth"], 2)),
            borderStyle: readString(item, ["borderStyle", "lineStyle", "style.strokeStyle"], "solid"),
            url: readString(item, ["url", "link", "href", "hyperlink", "metadata.url"], "")
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

function exportJsonFile() {
    const exportData = {
        format: "flowcraft",
        version: "1.0",
        name: currentDocName,
        nodes: nodes,
        lines: lines
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = currentDocName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".flowchart";
    a.click();
}

async function importJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        let normalized = null;
        const isVsdx = /\.vsdx$/i.test(file.name);

        if (isVsdx) {
            const flowcraftData = await parseVsdxToFlowcraft(file);
            normalized = { data: flowcraftData, source: "vsdx" };
        } else {
            const data = JSON.parse(await file.text());
            normalized = normalizeImportedData(data);
            if (!normalized) {
                const topKeys = isObject(data) ? Object.keys(data).slice(0, 15).join(", ") : "(non-object json root)";
                alert("Invalid format: could not detect FlowCraft/Lucidchart node data. Top-level keys: " + topKeys);
                return;
            }
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
        } else if (normalized.source === "vsdx") {
            alert("VSDX imported successfully (best effort conversion).");
        }
    } catch (err) {
        alert("Error parsing file: " + err.message + " | build=" + APP_BUILD);
    } finally {
        fileImportInput.value = "";
    }
}

// --- Google Drive & OAuth Integration (Domain Restricted) ---

function showGoogleConfigModal(show) {
    googleConfigModal.classList.toggle("active", show);
}

function saveGoogleConfig() {
    const cid = inputClientId.value.trim();
    if (!cid) {
        alert("Please enter a valid Google Client ID.");
        return;
    }
    googleClientId = cid;
    localStorage.setItem("flowcraft_google_client_id", cid);
    showGoogleConfigModal(false);
    
    initGoogleClient();
}

function clearGoogleConfig() {
    localStorage.removeItem("flowcraft_google_client_id");
    googleClientId = "";
    inputClientId.value = "";
    showGoogleConfigModal(false);
    alert("Google credentials cleared. Please configure again to use Google Drive.");
    signOutGoogle();
}

function startGoogleSignIn() {
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
    
    try {
        // Initialize GIS Login client
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

// Decode GIS JWT token payload client side
function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

function handleGoogleSignInCallback(response) {
    try {
        const payload = decodeJwt(response.credential);

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
    if (!accessToken) {
        if (tokenClient) tokenClient.requestAccessToken();
        else alert("Please configure Google Client ID first.");
        return;
    }
    
    const flowchartData = {
        format: "flowcraft",
        version: "1.0",
        name: currentDocName,
        nodes: nodes,
        lines: lines
    };
    
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
            loadIcon.style.color = "var(--accent-primary)";
            
            item.appendChild(info);
            item.appendChild(loadIcon);
            gdriveFilesContainer.appendChild(item);
        });
    } catch(e) {
        gdriveFilesContainer.innerHTML = `<div class="empty-state" style="color: var(--accent-danger)">Error loading files: ${e.message}</div>`;
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

// Utility to render the flowchart canvas into a single PNG image URL
async function getFlowchartCanvasImage() {
    // 1. Hide interactive GUI elements temporarily
    const ports = document.querySelectorAll(".port");
    const resizeHandles = document.querySelectorAll(".resize-handle");
    const activeIndicators = document.querySelectorAll(".node.selected");
    
    ports.forEach(p => p.style.opacity = "0");
    resizeHandles.forEach(h => h.style.display = "none");
    activeIndicators.forEach(el => el.classList.remove("selected"));
    
    // Save current pan & zoom
    const originalTransform = { ...viewportTransform };
    
    // 2. Normalise scale to 1.0 to render a crisp high-res screenshot
    viewportTransform.scale = 1.0;
    
    // Find absolute bounds of all nodes to calculate fit coordinates
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
    const fitW = (maxX - minX) + margin * 2;
    const fitH = (maxY - minY) + margin * 2;
    
    // Center viewport translation relative to calculated bounding box center
    viewportTransform.x = -minX + margin;
    viewportTransform.y = -minY + margin;
    updateCanvasTransform();
    
    // 3. Invoke html2canvas on the canvas container
    try {
        const renderCanvas = await html2canvas(canvas, {
            backgroundColor: "var(--bg-app)",
            width: fitW,
            height: fitH,
            scrollX: 0,
            scrollY: 0,
            useCORS: true
        });
        
        // Restore interactive visuals
        ports.forEach(p => p.style.opacity = "");
        resizeHandles.forEach(h => h.style.display = "");
        if (selectedId && selectedType === "node") {
            const selEl = document.getElementById("node-" + selectedId);
            if (selEl) selEl.classList.add("selected");
        }
        
        // Restore zoom
        viewportTransform = originalTransform;
        updateCanvasTransform();
        
        return {
            imgData: renderCanvas.toDataURL("image/png"),
            width: fitW,
            height: fitH
        };
    } catch (e) {
        console.error("Canvas capture failed:", e);
        // Restore states anyway
        ports.forEach(p => p.style.opacity = "");
        resizeHandles.forEach(h => h.style.display = "");
        viewportTransform = originalTransform;
        updateCanvasTransform();
        throw e;
    }
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

async function exportToWord() {
    saveStatus.textContent = "Exporting Word doc...";
    try {
        const capture = await getFlowchartCanvasImage();
        
        // Fetch base64 image data and convert to buffer
        const response = await fetch(capture.imgData);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        // Generate Docx structure
        const doc = new docx.Document({
            sections: [{
                properties: {
                    page: {
                        size: {
                            // landscape paper sizes in twips if image is wide
                            orientation: capture.width > capture.height ? docx.PageOrientation.LANDSCAPE : docx.PageOrientation.PORTRAIT
                        }
                    }
                },
                children: [
                    new docx.Paragraph({
                        heading: docx.HeadingLevel.HEADING_1,
                        spacing: { after: 120 },
                        children: [
                            new docx.TextRun({
                                text: currentDocName,
                                bold: true,
                                font: "Outfit",
                                size: 36 // 18pt
                            })
                        ]
                    }),
                    new docx.Paragraph({
                        spacing: { after: 240 },
                        children: [
                            new docx.TextRun({
                                text: `Exported on: ${new Date().toLocaleDateString()}`,
                                italic: true,
                                font: "Inter",
                                color: "64748b"
                            })
                        ]
                    }),
                    new docx.Paragraph({
                        children: [
                            new docx.ImageRun({
                                data: arrayBuffer,
                                transformation: {
                                    // Scale size down to fit standard page dimensions
                                    width: Math.min(650, capture.width),
                                    height: (Math.min(650, capture.width) / capture.width) * capture.height
                                }
                            })
                        ]
                    })
                ]
            }]
        });
        
        docx.Packer.toBlob(doc).then(wordBlob => {
            const downloadUrl = URL.createObjectURL(wordBlob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = currentDocName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".docx";
            a.click();
            saveStatus.textContent = "Export complete";
        });
        
    } catch(e) {
        alert("Failed to export Word file: " + e.message);
        saveStatus.textContent = "Export failed";
    }
}

// Start the App
document.addEventListener("DOMContentLoaded", init);

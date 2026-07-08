(function () {
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
    const ALLOWED_GOOGLE_DOMAIN = "hummel.se";

    let googleClientId = getEffectiveGoogleClientId();
    let accessToken = "";
    let userProfile = null;
    let tokenClient = null;
    let stateListener = null;
    let pendingTokenResolver = null;
    let pendingTokenRejecter = null;

    function getStoredLocalGoogleClientId() {
        return String(localStorage.getItem("flowcraft_google_client_id") || "").trim();
    }

    function getEffectiveGoogleClientId() {
        const localClientId = getStoredLocalGoogleClientId();
        if (allowLocalClientIdOverride && localClientId) return localClientId;
        if (configuredGoogleClientId) return configuredGoogleClientId;
        return localClientId;
    }

    function isValidGoogleClientId(clientId) {
        return /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(String(clientId || "").trim());
    }

    function isTrustedRuntimeOrigin() {
        if (configuredAllowedOrigins.length === 0) return true;
        return configuredAllowedOrigins.includes(window.location.origin);
    }

    function ensureTrustedOriginForGoogle() {
        if (isTrustedRuntimeOrigin()) return true;
        throw new Error("Google OAuth is disabled on this origin. Configure allowedOrigins in app-config.js and Google Cloud OAuth origins.");
    }

    function isAllowedGoogleDomain(payload) {
        if (!payload || typeof payload !== "object") return false;
        const email = String(payload.email || "").toLowerCase();
        const hd = String(payload.hd || "").toLowerCase();
        return hd === ALLOWED_GOOGLE_DOMAIN || email.endsWith("@" + ALLOWED_GOOGLE_DOMAIN);
    }

    function getState() {
        return {
            googleClientId,
            accessToken,
            userProfile,
            signedIn: !!userProfile,
            driveReady: !!accessToken,
            trustedOrigin: isTrustedRuntimeOrigin(),
            configuredGoogleClientId,
            allowLocalClientIdOverride
        };
    }

    function notifyState() {
        if (typeof stateListener === "function") {
            stateListener(getState());
        }
    }

    function resetTransientAuthState() {
        accessToken = "";
        userProfile = null;
        tokenClient = null;
        pendingTokenResolver = null;
        pendingTokenRejecter = null;
    }

    async function fetchGoogleUserProfile(token) {
        const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if (!response.ok) throw new Error("Could not load Google user profile.");
        return response.json();
    }

    async function resolveTokenResponse(resp) {
        if (!resp || !resp.access_token) {
            const message = resp && resp.error ? String(resp.error) : "Google Drive access was not granted.";
            throw new Error(message);
        }

        const profile = await fetchGoogleUserProfile(resp.access_token);
        if (!isAllowedGoogleDomain(profile)) {
            throw new Error("Only Google accounts with a @hummel.se email are allowed to sign in.");
        }

        accessToken = resp.access_token;
        userProfile = profile;
        return accessToken;
    }

    function initGoogleClient() {
        if (tokenClient) return;
        if (!googleClientId) throw new Error("Missing Google Client ID.");
        ensureTrustedOriginForGoogle();
        if (!isValidGoogleClientId(googleClientId)) throw new Error("Invalid Google Client ID format.");
        if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
            throw new Error("Google Identity Services could not be loaded.");
        }

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: "openid email profile https://www.googleapis.com/auth/drive.file",
            callback: (resp) => {
                resolveTokenResponse(resp)
                    .then((token) => {
                        if (pendingTokenResolver) pendingTokenResolver(token);
                    })
                    .catch((error) => {
                        accessToken = "";
                        userProfile = null;
                        if (pendingTokenRejecter) pendingTokenRejecter(error);
                    })
                    .finally(() => {
                        pendingTokenResolver = null;
                        pendingTokenRejecter = null;
                        notifyState();
                    });
            }
        });
    }

    function requestDriveAccess(options = {}) {
        if (accessToken) return Promise.resolve(accessToken);
        initGoogleClient();

        return new Promise((resolve, reject) => {
            pendingTokenResolver = resolve;
            pendingTokenRejecter = reject;
            tokenClient.requestAccessToken({
                prompt: options.prompt || (userProfile ? "" : "consent"),
                hint: options.hint || (userProfile ? userProfile.email : undefined)
            });
        });
    }

    async function init(options = {}) {
        stateListener = typeof options.onStateChange === "function" ? options.onStateChange : null;
        googleClientId = getEffectiveGoogleClientId();
        if (googleClientId && isTrustedRuntimeOrigin()) {
            try {
                initGoogleClient();
            } catch (error) {
                console.warn("Google auth init skipped.", error);
            }
        }
        notifyState();
        return getState();
    }

    async function startGoogleSignIn() {
        ensureTrustedOriginForGoogle();
        googleClientId = getEffectiveGoogleClientId();
        if (!googleClientId) {
            const error = new Error("Google OAuth Client ID is not configured.");
            error.code = "needs-config";
            throw error;
        }
        return requestDriveAccess({ prompt: "consent" });
    }

    function signOut() {
        const revokedToken = accessToken;
        resetTransientAuthState();
        if (revokedToken && typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
            google.accounts.oauth2.revoke(revokedToken, () => {});
        }
        notifyState();
    }

    function setLocalGoogleClientId(clientId) {
        const trimmed = String(clientId || "").trim();
        if (!isValidGoogleClientId(trimmed)) throw new Error("Invalid Google Client ID format.");
        localStorage.setItem("flowcraft_google_client_id", trimmed);
        googleClientId = getEffectiveGoogleClientId();
        resetTransientAuthState();
        notifyState();
        return getState();
    }

    function clearLocalGoogleClientId() {
        if (configuredGoogleClientId && !allowLocalClientIdOverride) {
            throw new Error("Shared app configuration is active. Nothing to clear locally.");
        }
        localStorage.removeItem("flowcraft_google_client_id");
        googleClientId = getEffectiveGoogleClientId();
        resetTransientAuthState();
        notifyState();
        return getState();
    }

    async function listFlowchartFiles() {
        await requestDriveAccess();
        const url = 'https://www.googleapis.com/drive/v3/files?q=mimeType="application/json" and trashed=false&fields=files(id,name,modifiedTime)';
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error("Status code " + response.status);
        const data = await response.json();
        return (data.files || [])
            .filter((file) => file.name.endsWith(".flowchart") || file.name.endsWith(".json"))
            .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
    }

    async function fetchDriveFlowchart(fileId) {
        await requestDriveAccess();
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error("HTTP error " + response.status);
        return response.json();
    }

    async function deleteFlowchartFile(fileId) {
        await requestDriveAccess();
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
        const response = await fetch(url, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok && response.status !== 204) {
            throw new Error("Could not delete file (status " + response.status + ")");
        }
    }

    window.FlowAuthDrive = {
        init,
        getState,
        startGoogleSignIn,
        signOut,
        requestDriveAccess,
        listFlowchartFiles,
        fetchDriveFlowchart,
        deleteFlowchartFile,
        setLocalGoogleClientId,
        clearLocalGoogleClientId
    };
})();
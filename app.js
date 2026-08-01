function hydrateDriveSession() {
    try {
        const raw = localStorage.getItem(FLOWCRAFT_DRIVE_SESSION_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);

        if (parsed && Object.prototype.hasOwnProperty.call(parsed, "accessToken")) {
            // Legacy payload from older builds: remove sensitive field immediately.
            delete parsed.accessToken;
            localStorage.setItem(FLOWCRAFT_DRIVE_SESSION_KEY, JSON.stringify(parsed));
        }

        const isExpired =
            !parsed ||
            !parsed.createdAt ||
            (Date.now() - Number(parsed.createdAt) > FLOWCRAFT_DRIVE_SESSION_TTL_MS);

        if (isExpired) {
            localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
            return;
        }

        // Security hardening:
        // Never hydrate OAuth access tokens from browser storage.
        // Only keep optional profile hint for UI continuity.
        if (parsed.userProfile && isAllowedGoogleDomain(parsed.userProfile)) {
            userProfile = parsed.userProfile;
        }

        // Ensure no token is trusted from storage.
        accessToken = "";
    } catch (err) {
        localStorage.removeItem(FLOWCRAFT_DRIVE_SESSION_KEY);
        accessToken = "";
    }
}

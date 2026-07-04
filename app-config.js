// Shared runtime configuration.
// Set this once and commit it if you want all devices/users to share the same OAuth Client ID.
// Never store client secrets, API keys, refresh tokens, or service account keys here.
// If allowedOrigins is non-empty, Google OAuth is only enabled on listed origins.
window.FLOWCRAFT_CONFIG = {
    googleClientId: "",
    allowedOrigins: [],
    // Keep false in production. True enables per-device local client-id override.
    allowLocalClientIdOverride: false
};

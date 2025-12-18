/**
 * AirView Shared Constants
 */

export const CONSTANTS = {
    // Sync engine
    DRIFT_THRESHOLD_MS: 2000,       // 2 seconds
    DRIFT_CHECK_INTERVAL_MS: 1000,  // Check every 1 second
    SOFT_SEEK_BUFFER_MS: 100,       // Small buffer to prevent oscillation

    // Server
    DEFAULT_SERVER_PORT: 3001,
    DEFAULT_SERVER_URL: 'http://localhost:3001',

    // QR Code
    QR_CODE_EXPIRY_MS: 5 * 60 * 1000,  // 5 minutes

    // WebRTC
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
} as const;

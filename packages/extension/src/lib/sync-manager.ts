/**
 * CouchGang Sync Manager
 * Handles video synchronization with buffering awareness,
 * playback rate adjustment for smooth drift correction,
 * and periodic sync heartbeat
 */

// Sync configuration
const SYNC_CONFIG = {
    // How often to check drift (milliseconds)
    HEARTBEAT_INTERVAL: 5000,

    // Drift thresholds (seconds)
    DRIFT_TOLERANCE: 0.5,        // Accept as "in sync"
    DRIFT_SOFT_THRESHOLD: 2.0,   // Use playback rate adjustment
    DRIFT_HARD_THRESHOLD: 5.0,   // Force hard seek

    // Playback rate adjustment
    RATE_SPEEDUP: 1.05,   // 5% faster
    RATE_SLOWDOWN: 0.95,  // 5% slower
    RATE_NORMAL: 1.0,

    // How long to maintain adjusted rate (ms)
    RATE_ADJUSTMENT_DURATION: 3000,

    // Buffering detection
    BUFFERING_TIMEOUT: 500,  // Consider buffering after 500ms of waiting
};

export interface SyncState {
    isPlaying: boolean;
    timestamp: number;
    serverTime: number;  // Server timestamp when state was sent
}

export interface SyncManagerOptions {
    onEmitUpdate: (isPlaying: boolean, timestamp: number) => void;
    onSyncStatus: (status: SyncStatus) => void;
}

export type SyncStatus =
    | 'synced'
    | 'adjusting'
    | 'seeking'
    | 'buffering'
    | 'paused';

export class SyncManager {
    private video: HTMLVideoElement | null = null;
    private options: SyncManagerOptions;
    private isActive: boolean = false;
    private isSyncing: boolean = false;
    private isBuffering: boolean = false;
    private heartbeatInterval: number | null = null;
    private bufferingTimeout: number | null = null;
    private rateAdjustmentTimeout: number | null = null;

    // Last known server state
    private serverState: SyncState | null = null;

    // Last emitted state (for debouncing)
    private lastEmittedState = { isPlaying: false, timestamp: 0 };

    constructor(options: SyncManagerOptions) {
        this.options = options;
    }

    /**
     * Attach to a video element
     */
    attach(videoEl: HTMLVideoElement): void {
        this.video = videoEl;
        this.setupEventListeners();
        console.log('[CouchGang Sync] Attached to video element');
    }

    /**
     * Activate sync (when in a room)
     */
    activate(): void {
        this.isActive = true;
        this.startHeartbeat();
        console.log('[CouchGang Sync] Activated');
    }

    /**
     * Deactivate sync
     */
    deactivate(): void {
        this.isActive = false;
        this.stopHeartbeat();
        this.resetPlaybackRate();
        console.log('[CouchGang Sync] Deactivated');
    }

    /**
     * Handle incoming sync state from server
     */
    handleServerState(state: SyncState): void {
        if (!this.video || !this.isActive || this.isSyncing) return;

        this.serverState = state;

        // Don't adjust if we're buffering
        if (this.isBuffering) {
            console.log('[CouchGang Sync] Skipping sync during buffering');
            return;
        }

        this.performSync(state);
    }

    /**
     * Perform sync based on drift
     */
    private performSync(state: SyncState): void {
        if (!this.video) return;

        this.isSyncing = true;

        const localTime = this.video.currentTime;

        // Calculate estimated current server position
        // Account for network latency by using server timestamp
        const timeSinceServerUpdate = (Date.now() - state.serverTime) / 1000;
        const estimatedServerTime = state.isPlaying
            ? state.timestamp + timeSinceServerUpdate
            : state.timestamp;

        const drift = localTime - estimatedServerTime;
        const absDrift = Math.abs(drift);

        // Handle play/pause state first
        if (state.isPlaying && this.video.paused) {
            this.video.play().catch(() => { });
        } else if (!state.isPlaying && !this.video.paused) {
            this.video.pause();
        }

        // Handle drift
        if (absDrift <= SYNC_CONFIG.DRIFT_TOLERANCE) {
            // Perfect sync
            this.resetPlaybackRate();
            this.options.onSyncStatus('synced');
            console.log(`[CouchGang Sync] In sync (drift: ${drift.toFixed(2)}s)`);
        } else if (absDrift <= SYNC_CONFIG.DRIFT_SOFT_THRESHOLD) {
            // Soft correction via playback rate
            this.adjustPlaybackRate(drift);
            this.options.onSyncStatus('adjusting');
            console.log(`[CouchGang Sync] Adjusting rate (drift: ${drift.toFixed(2)}s)`);
        } else if (absDrift <= SYNC_CONFIG.DRIFT_HARD_THRESHOLD) {
            // Hard seek for larger drift
            this.video.currentTime = estimatedServerTime;
            this.resetPlaybackRate();
            this.options.onSyncStatus('seeking');
            console.log(`[CouchGang Sync] Hard seek (drift: ${drift.toFixed(2)}s)`);
        } else {
            // Very large drift - just seek
            this.video.currentTime = estimatedServerTime;
            this.resetPlaybackRate();
            this.options.onSyncStatus('seeking');
            console.log(`[CouchGang Sync] Large drift correction: ${drift.toFixed(2)}s`);
        }

        // Reset sync flag after a short delay
        setTimeout(() => {
            this.isSyncing = false;
        }, 300);
    }

    /**
     * Adjust playback rate to catch up or slow down
     */
    private adjustPlaybackRate(drift: number): void {
        if (!this.video) return;

        // Clear any existing rate adjustment timeout
        if (this.rateAdjustmentTimeout) {
            clearTimeout(this.rateAdjustmentTimeout);
        }

        // Positive drift = we're ahead, slow down
        // Negative drift = we're behind, speed up
        const newRate = drift > 0
            ? SYNC_CONFIG.RATE_SLOWDOWN
            : SYNC_CONFIG.RATE_SPEEDUP;

        this.video.playbackRate = newRate;
        console.log(`[CouchGang Sync] Playback rate: ${newRate}x`);

        // Reset to normal after adjustment period
        this.rateAdjustmentTimeout = window.setTimeout(() => {
            this.resetPlaybackRate();
            // Check drift again
            if (this.serverState) {
                this.performSync(this.serverState);
            }
        }, SYNC_CONFIG.RATE_ADJUSTMENT_DURATION);
    }

    /**
     * Reset playback rate to normal
     */
    private resetPlaybackRate(): void {
        if (this.video && this.video.playbackRate !== SYNC_CONFIG.RATE_NORMAL) {
            this.video.playbackRate = SYNC_CONFIG.RATE_NORMAL;
            console.log('[CouchGang Sync] Playback rate reset to 1.0x');
        }
    }

    /**
     * Start periodic sync heartbeat
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();

        this.heartbeatInterval = window.setInterval(() => {
            if (this.serverState && !this.isBuffering && !this.isSyncing) {
                this.performSync(this.serverState);
            }
        }, SYNC_CONFIG.HEARTBEAT_INTERVAL);

        console.log('[CouchGang Sync] Heartbeat started');
    }

    /**
     * Stop periodic sync heartbeat
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Setup video event listeners
     */
    private setupEventListeners(): void {
        if (!this.video) return;

        // Play event
        this.video.addEventListener('play', () => {
            if (!this.isSyncing && this.isActive) {
                this.emitUpdate(true, this.video!.currentTime);
            }
        });

        // Pause event
        this.video.addEventListener('pause', () => {
            if (!this.isSyncing && this.isActive) {
                this.emitUpdate(false, this.video!.currentTime);
            }
        });

        // Seeked event
        this.video.addEventListener('seeked', () => {
            if (!this.isSyncing && this.isActive) {
                this.emitUpdate(!this.video!.paused, this.video!.currentTime);
            }
        });

        // Buffering detection - waiting event
        this.video.addEventListener('waiting', () => {
            this.bufferingTimeout = window.setTimeout(() => {
                this.isBuffering = true;
                this.options.onSyncStatus('buffering');
                console.log('[CouchGang Sync] Buffering detected');
            }, SYNC_CONFIG.BUFFERING_TIMEOUT);
        });

        // Buffering ended - playing event
        this.video.addEventListener('playing', () => {
            if (this.bufferingTimeout) {
                clearTimeout(this.bufferingTimeout);
                this.bufferingTimeout = null;
            }
            if (this.isBuffering) {
                this.isBuffering = false;
                console.log('[CouchGang Sync] Buffering ended');
                // Re-sync after buffering
                if (this.serverState) {
                    setTimeout(() => {
                        this.performSync(this.serverState!);
                    }, 100);
                }
            }
        });

        // Also listen to canplay for buffer recovery
        this.video.addEventListener('canplay', () => {
            if (this.bufferingTimeout) {
                clearTimeout(this.bufferingTimeout);
                this.bufferingTimeout = null;
            }
        });
    }

    /**
     * Emit playback update with debouncing
     */
    private emitUpdate(isPlaying: boolean, timestamp: number): void {
        // Debounce
        if (
            this.lastEmittedState.isPlaying === isPlaying &&
            Math.abs(this.lastEmittedState.timestamp - timestamp) < 0.5
        ) {
            return;
        }

        this.lastEmittedState = { isPlaying, timestamp };
        this.options.onEmitUpdate(isPlaying, timestamp);
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.deactivate();
        this.video = null;
    }
}

export default SyncManager;

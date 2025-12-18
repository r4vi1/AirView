/**
 * Netflix Content Script
 * Detects video element and syncs playback events
 */

import type { PlasmoCSConfig } from 'plasmo';

export const config: PlasmoCSConfig = {
    matches: ['https://www.netflix.com/*'],
    run_at: 'document_idle',
};

// State
let video: HTMLVideoElement | null = null;
let isSyncing = false;  // Prevent feedback loops during sync seeks
let lastEmittedState = { isPlaying: false, timestamp: 0 };

/**
 * Find the Netflix video element
 */
function findVideoElement(): HTMLVideoElement | null {
    // Netflix uses various video selectors depending on the page
    const selectors = [
        'video.watch-video--player-view',
        'video[data-uia="video-player"]',
        'video',
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLVideoElement;
        if (el && el.src) return el;
    }

    return null;
}

/**
 * Emit playback update to background script
 */
function emitPlaybackUpdate(isPlaying: boolean, timestamp: number) {
    // Debounce: Don't emit if state hasn't changed meaningfully
    if (
        lastEmittedState.isPlaying === isPlaying &&
        Math.abs(lastEmittedState.timestamp - timestamp) < 0.5
    ) {
        return;
    }

    lastEmittedState = { isPlaying, timestamp };

    chrome.runtime.sendMessage({
        type: 'PLAYBACK_UPDATE',
        isPlaying,
        timestamp,
        platform: 'netflix',
    });

    console.log(`[AirView] Emitted: ${isPlaying ? 'PLAY' : 'PAUSE'} @ ${timestamp.toFixed(2)}s`);
}

/**
 * Handle sync state from server
 */
function handleSyncState(playback: { isPlaying: boolean; timestamp: number }) {
    if (!video || isSyncing) return;

    isSyncing = true;

    const currentTime = video.currentTime;
    const drift = Math.abs(currentTime - playback.timestamp);

    // Seek if drift > 2 seconds
    if (drift > 2) {
        console.log(`[AirView] Drift correction: ${drift.toFixed(2)}s, seeking to ${playback.timestamp}`);
        video.currentTime = playback.timestamp;
    }

    // Sync play/pause state
    if (playback.isPlaying && video.paused) {
        video.play().catch(() => {/* Autoplay might be blocked */ });
    } else if (!playback.isPlaying && !video.paused) {
        video.pause();
    }

    // Reset sync flag after a short delay to allow events to settle
    setTimeout(() => {
        isSyncing = false;
    }, 500);
}

/**
 * Attach event listeners to video element
 */
function attachVideoListeners(videoEl: HTMLVideoElement) {
    video = videoEl;

    video.addEventListener('play', () => {
        if (!isSyncing) {
            emitPlaybackUpdate(true, video!.currentTime);
        }
    });

    video.addEventListener('pause', () => {
        if (!isSyncing) {
            emitPlaybackUpdate(false, video!.currentTime);
        }
    });

    video.addEventListener('seeked', () => {
        if (!isSyncing) {
            emitPlaybackUpdate(!video!.paused, video!.currentTime);
        }
    });

    console.log('[AirView] Video element attached');
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SYNC_STATE' && message.playback) {
        handleSyncState(message.playback);
    }
});

/**
 * Initialize: Wait for video element to appear
 */
function init() {
    // Try to find video immediately
    const videoEl = findVideoElement();
    if (videoEl) {
        attachVideoListeners(videoEl);
        return;
    }

    // If not found, use MutationObserver to wait for it
    const observer = new MutationObserver(() => {
        const videoEl = findVideoElement();
        if (videoEl) {
            attachVideoListeners(videoEl);
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    console.log('[AirView] Netflix content script loaded, waiting for video element...');
}

init();

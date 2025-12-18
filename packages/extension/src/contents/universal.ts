/**
 * Universal Content Script
 * Detects video elements on ANY website and syncs playback
 * Works on Netflix, Prime, Disney+, Hulu, HBO Max, etc.
 */

import type { PlasmoCSConfig } from 'plasmo';

export const config: PlasmoCSConfig = {
    // Match ALL websites - we'll detect if there's a video worth syncing
    matches: ['<all_urls>'],
    run_at: 'document_idle',
};

// State
let video: HTMLVideoElement | null = null;
let isSyncing = false;  // Prevent feedback loops during sync seeks
let lastEmittedState = { isPlaying: false, timestamp: 0 };
let isInRoom = false;

/**
 * Detect the platform from the URL
 */
function detectPlatform(): string {
    const hostname = window.location.hostname;

    if (hostname.includes('netflix.com')) return 'netflix';
    if (hostname.includes('primevideo.com') || hostname.includes('amazon.com/gp/video')) return 'prime';
    if (hostname.includes('disneyplus.com')) return 'disney';
    if (hostname.includes('hulu.com')) return 'hulu';
    if (hostname.includes('max.com') || hostname.includes('hbomax.com')) return 'hbomax';
    if (hostname.includes('peacock')) return 'peacock';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('hotstar.com')) return 'hotstar';
    if (hostname.includes('jiocinema.com')) return 'jiocinema';
    if (hostname.includes('sonyliv.com')) return 'sonyliv';
    if (hostname.includes('zee5.com')) return 'zee5';

    return 'unknown';
}

/**
 * Platform-specific video selectors for better detection
 */
const PLATFORM_SELECTORS: Record<string, string[]> = {
    netflix: ['video.watch-video--player-view', 'video[data-uia="video-player"]'],
    prime: ['video.webPlayerElement', 'video[class*="webPlayer"]'],
    disney: ['video.btm-media-client-element'],
    hulu: ['video.video-player'],
    hbomax: ['video[data-testid="player-video"]'],
    youtube: ['video.html5-main-video', 'video.video-stream'],
    hotstar: ['video#content-video'],
    unknown: [],
};

/**
 * Find the primary video element on the page
 * Uses platform-specific selectors first, then falls back to generic detection
 */
function findVideoElement(): HTMLVideoElement | null {
    const platform = detectPlatform();

    // Try platform-specific selectors first
    const selectors = PLATFORM_SELECTORS[platform] || [];
    for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLVideoElement;
        if (el && el.src && el.readyState > 0) return el;
    }

    // Fallback: find the largest video element on the page
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    // Sort by size (largest first) - the main video is usually the biggest
    const sortedVideos = videos
        .filter(v => v.src || v.querySelector('source'))  // Has a source
        .filter(v => v.readyState > 0)  // Has loaded something
        .sort((a, b) => {
            const areaA = a.videoWidth * a.videoHeight;
            const areaB = b.videoWidth * b.videoHeight;
            return areaB - areaA;
        });

    return sortedVideos[0] || null;
}

/**
 * Get the current content URL for sharing
 * This is the link friends will use to navigate to the same content
 */
function getContentUrl(): string {
    return window.location.href;
}

/**
 * Emit playback update to background script
 */
function emitPlaybackUpdate(isPlaying: boolean, timestamp: number) {
    if (!isInRoom) return;

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
        platform: detectPlatform(),
        contentUrl: getContentUrl(),
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

    console.log(`[AirView] Video element attached on ${detectPlatform()}`);

    // Notify background that we found a video
    chrome.runtime.sendMessage({
        type: 'VIDEO_DETECTED',
        platform: detectPlatform(),
        contentUrl: getContentUrl(),
    });
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
        case 'SYNC_STATE':
            if (message.playback) {
                handleSyncState(message.playback);
            }
            break;

        case 'ROOM_JOINED':
            isInRoom = true;
            console.log('[AirView] Joined room, sync active');
            break;

        case 'ROOM_LEFT':
            isInRoom = false;
            console.log('[AirView] Left room, sync inactive');
            break;

        case 'GET_VIDEO_STATUS':
            // Background is asking if we have a video
            chrome.runtime.sendMessage({
                type: 'VIDEO_STATUS',
                hasVideo: !!video,
                platform: detectPlatform(),
                contentUrl: getContentUrl(),
                currentTime: video?.currentTime || 0,
                isPlaying: video ? !video.paused : false,
            });
            break;
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
        if (videoEl && !video) {
            attachVideoListeners(videoEl);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    console.log(`[AirView] Content script loaded on ${detectPlatform()}, waiting for video element...`);
}

// Only initialize if the page might have a video
// This prevents unnecessary overhead on every page
const platform = detectPlatform();
if (platform !== 'unknown' || document.querySelector('video')) {
    init();
} else {
    // Even on unknown sites, watch for video elements appearing
    const lazyObserver = new MutationObserver(() => {
        if (document.querySelector('video')) {
            lazyObserver.disconnect();
            init();
        }
    });

    lazyObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

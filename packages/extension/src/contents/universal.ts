/**
 * Universal Content Script
 * Detects video elements on ANY website and syncs playback
 * Works on Netflix, Prime, Disney+, Hulu, HBO Max, etc.
 * Includes ad-aware sync with "Waiting for X" indicator
 */

import type { PlasmoCSConfig } from 'plasmo';
import { AdMonitor, detectPlatform as detectAdPlatform } from '../lib/ad-detector';

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
let adMonitor: AdMonitor | null = null;
let waitingOverlay: HTMLElement | null = null;

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

    const sortedVideos = videos
        .filter(v => v.src || v.querySelector('source'))
        .filter(v => v.readyState > 0)
        .sort((a, b) => {
            const areaA = a.videoWidth * a.videoHeight;
            const areaB = b.videoWidth * b.videoHeight;
            return areaB - areaA;
        });

    return sortedVideos[0] || null;
}

/**
 * Get the current content URL for sharing
 */
function getContentUrl(): string {
    return window.location.href;
}

/**
 * Create/show waiting overlay
 */
function showWaitingOverlay(usersInAd: Array<{ displayName: string; startedAt: number }>) {
    if (!waitingOverlay) {
        waitingOverlay = document.createElement('div');
        waitingOverlay.id = 'couchgang-waiting-overlay';
        waitingOverlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            z-index: 2147483647;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        document.body.appendChild(waitingOverlay);
    }

    const names = usersInAd.map(u => u.displayName).join(', ');
    const elapsed = usersInAd.length > 0
        ? Math.floor((Date.now() - usersInAd[0].startedAt) / 1000)
        : 0;

    waitingOverlay.innerHTML = `
        <div style="width: 20px; height: 20px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: couchgang-spin 1s linear infinite;"></div>
        <div>
            <div style="font-weight: 600;">Waiting for ${names} to finish ad</div>
            <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">${elapsed}s elapsed</div>
        </div>
    `;

    // Add spinner animation
    if (!document.getElementById('couchgang-spin-style')) {
        const style = document.createElement('style');
        style.id = 'couchgang-spin-style';
        style.textContent = `@keyframes couchgang-spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }

    waitingOverlay.style.display = 'flex';

    // Update elapsed time every second
    const updateInterval = setInterval(() => {
        if (!waitingOverlay || waitingOverlay.style.display === 'none') {
            clearInterval(updateInterval);
            return;
        }
        const newElapsed = usersInAd.length > 0
            ? Math.floor((Date.now() - usersInAd[0].startedAt) / 1000)
            : 0;
        const elapsedEl = waitingOverlay.querySelector('div > div:last-child');
        if (elapsedEl) elapsedEl.textContent = `${newElapsed}s elapsed`;
    }, 1000);
}

/**
 * Hide waiting overlay
 */
function hideWaitingOverlay() {
    if (waitingOverlay) {
        waitingOverlay.style.display = 'none';
    }
}

/**
 * Emit playback update to background script
 */
function emitPlaybackUpdate(isPlaying: boolean, timestamp: number) {
    if (!isInRoom) return;

    // Debounce
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

    console.log(`[CouchGang] Emitted: ${isPlaying ? 'PLAY' : 'PAUSE'} @ ${timestamp.toFixed(2)}s`);
}

/**
 * Handle sync state from server
 */
function handleSyncState(playback: { isPlaying: boolean; timestamp: number }) {
    if (!video || isSyncing) return;

    isSyncing = true;

    const currentTime = video.currentTime;
    const drift = Math.abs(currentTime - playback.timestamp);

    if (drift > 2) {
        console.log(`[CouchGang] Drift correction: ${drift.toFixed(2)}s, seeking to ${playback.timestamp}`);
        video.currentTime = playback.timestamp;
    }

    if (playback.isPlaying && video.paused) {
        video.play().catch(() => { });
    } else if (!playback.isPlaying && !video.paused) {
        video.pause();
    }

    setTimeout(() => {
        isSyncing = false;
    }, 500);
}

/**
 * Handle PAUSE_FOR_AD from server
 */
function handlePauseForAd(payload: { usersInAd: Array<{ displayName: string; startedAt: number }>; resumeTimestamp: number }) {
    if (!video) return;

    isSyncing = true;
    video.pause();
    showWaitingOverlay(payload.usersInAd);

    console.log(`[CouchGang] Paused for ad - waiting for: ${payload.usersInAd.map(u => u.displayName).join(', ')}`);

    setTimeout(() => {
        isSyncing = false;
    }, 500);
}

/**
 * Handle RESUME_ALL from server
 */
function handleResumeAll(payload: { timestamp: number; isPlaying: boolean }) {
    if (!video) return;

    isSyncing = true;
    hideWaitingOverlay();

    video.currentTime = payload.timestamp;
    if (payload.isPlaying) {
        video.play().catch(() => { });
    }

    console.log(`[CouchGang] Resuming all at ${payload.timestamp}s`);

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

    // Start ad monitoring
    adMonitor = new AdMonitor(
        (estimatedDuration) => {
            // Ad started - notify background
            chrome.runtime.sendMessage({
                type: 'AD_STARTED',
                estimatedDuration,
            });
        },
        () => {
            // Ad ended - notify background
            chrome.runtime.sendMessage({
                type: 'AD_FINISHED',
            });
        }
    );
    adMonitor.start();

    console.log(`[CouchGang] Video element attached on ${detectPlatform()}`);

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
            console.log('[CouchGang] Joined room, sync active');
            break;

        case 'ROOM_LEFT':
            isInRoom = false;
            hideWaitingOverlay();
            console.log('[CouchGang] Left room, sync inactive');
            break;

        case 'PAUSE_FOR_AD':
            handlePauseForAd(message);
            break;

        case 'RESUME_ALL':
            handleResumeAll(message);
            break;

        case 'GET_VIDEO_STATUS':
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
 * Initialize
 */
function init() {
    const videoEl = findVideoElement();
    if (videoEl) {
        attachVideoListeners(videoEl);
        return;
    }

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

    console.log(`[CouchGang] Content script loaded on ${detectPlatform()}, waiting for video element...`);
}

// Initialize
const platform = detectPlatform();
if (platform !== 'unknown' || document.querySelector('video')) {
    init();
} else {
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


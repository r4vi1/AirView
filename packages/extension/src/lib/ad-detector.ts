/**
 * Ad Detector
 * Platform-specific ad detection for streaming services
 */

export type SupportedPlatform =
    | 'netflix'
    | 'prime'
    | 'disney'
    | 'hulu'
    | 'hbomax'
    | 'youtube'
    | 'hotstar'
    | 'jiocinema'
    | 'unknown';

/**
 * Platform-specific CSS selectors for ad detection
 */
const AD_SELECTORS: Record<SupportedPlatform, string[]> = {
    // YouTube: Only use very specific selectors that exist ONLY during ads
    // The '.ad-showing' class on .html5-video-player is the most reliable
    youtube: [
        '.html5-video-player.ad-showing',  // Most reliable - on the player container
        '.ytp-ad-player-overlay-instream-info',  // Visible only during skippable ads
    ],
    prime: [
        '[class*="adPlayer"]',
        '[class*="atvwebplayersdk-ad"]',
        '[data-testid="ad-slate"]',
        '.atvwebplayersdk-adtimeindicator-text',
    ],
    hulu: [
        '.AdUnitView',
        '[class*="AdControls"]',
        '.ad-container',
        '[data-automationid="ad-overlay"]',
    ],
    disney: [
        '[data-testid="ad-overlay"]',
        '[class*="ad-interstitial"]',
        '.btm-media-overlays-container [class*="ad"]',
    ],
    hbomax: [
        '[data-testid="AdCountdown"]',
        '[class*="AdBreak"]',
        '.ad-overlay',
    ],
    hotstar: [
        '[class*="ad-overlay"]',
        '.bumpAd',
        '[class*="preroll"]',
    ],
    jiocinema: [
        '[class*="ad-container"]',
        '[class*="preroll"]',
    ],
    netflix: [], // Netflix Premium doesn't have ads (yet)
    unknown: [],
};

/**
 * Detect current platform from URL
 */
export function detectPlatform(): SupportedPlatform {
    const hostname = window.location.hostname;

    if (hostname.includes('netflix.com')) return 'netflix';
    if (hostname.includes('primevideo.com') || hostname.includes('amazon.com')) return 'prime';
    if (hostname.includes('disneyplus.com')) return 'disney';
    if (hostname.includes('hulu.com')) return 'hulu';
    if (hostname.includes('max.com') || hostname.includes('hbomax.com')) return 'hbomax';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('hotstar.com')) return 'hotstar';
    if (hostname.includes('jiocinema.com')) return 'jiocinema';

    return 'unknown';
}

/**
 * Check if an ad is currently playing
 */
export function isAdPlaying(platform?: SupportedPlatform): boolean {
    const currentPlatform = platform || detectPlatform();
    const selectors = AD_SELECTORS[currentPlatform] || [];

    // Check platform-specific selectors
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            // Check if element is visible (not hidden)
            const style = window.getComputedStyle(element);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
                return true;
            }
        }
    }

    // YouTube-specific: Check for ad class on video element
    if (currentPlatform === 'youtube') {
        const videoContainer = document.querySelector('.html5-video-player');
        if (videoContainer?.classList.contains('ad-showing')) {
            return true;
        }
    }

    // Generic fallback: Check video element for ad indicators
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (video) {
        // Some platforms change video source to ad URL
        if (video.src && (
            video.src.includes('/ads/') ||
            video.src.includes('ad-') ||
            video.src.includes('advertisement')
        )) {
            return true;
        }
    }

    return false;
}

/**
 * Try to estimate ad duration (platform-specific)
 */
export function getEstimatedAdDuration(platform?: SupportedPlatform): number | null {
    const currentPlatform = platform || detectPlatform();

    // YouTube shows remaining time
    if (currentPlatform === 'youtube') {
        const adTimeElement = document.querySelector('.ytp-ad-simple-ad-badge');
        if (adTimeElement?.textContent) {
            const match = adTimeElement.textContent.match(/(\d+)/);
            if (match) return parseInt(match[1], 10) * 1000; // Convert to ms
        }
    }

    // Prime Video sometimes shows ad duration
    if (currentPlatform === 'prime') {
        const adIndicator = document.querySelector('.atvwebplayersdk-adtimeindicator-text');
        if (adIndicator?.textContent) {
            const match = adIndicator.textContent.match(/(\d+):(\d+)/);
            if (match) {
                return (parseInt(match[1], 10) * 60 + parseInt(match[2], 10)) * 1000;
            }
        }
    }

    return null;
}

/**
 * Ad Monitor class for continuous ad detection
 */
export class AdMonitor {
    private platform: SupportedPlatform;
    private isInAd = false;
    private intervalId: number | null = null;
    private onAdStart: (estimatedDuration: number | null) => void;
    private onAdEnd: () => void;
    private checkInterval: number;

    constructor(
        onAdStart: (estimatedDuration: number | null) => void,
        onAdEnd: () => void,
        checkInterval = 500 // Check every 500ms
    ) {
        this.platform = detectPlatform();
        this.onAdStart = onAdStart;
        this.onAdEnd = onAdEnd;
        this.checkInterval = checkInterval;
    }

    start() {
        if (this.intervalId) return;

        this.intervalId = window.setInterval(() => {
            this.checkForAds();
        }, this.checkInterval);

        console.log(`[CouchGang AdMonitor] Started on ${this.platform}`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private checkForAds() {
        const adPlaying = isAdPlaying(this.platform);

        if (adPlaying && !this.isInAd) {
            // Ad just started
            this.isInAd = true;
            const duration = getEstimatedAdDuration(this.platform);
            this.onAdStart(duration);
            console.log(`[CouchGang AdMonitor] Ad started, estimated duration: ${duration}ms`);
        } else if (!adPlaying && this.isInAd) {
            // Ad just ended
            this.isInAd = false;
            this.onAdEnd();
            console.log('[CouchGang AdMonitor] Ad ended');
        }
    }

    isCurrentlyInAd(): boolean {
        return this.isInAd;
    }
}

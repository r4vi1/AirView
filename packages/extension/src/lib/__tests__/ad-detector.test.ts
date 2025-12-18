/**
 * Ad Detector Tests
 * Unit tests for platform detection and ad detection logic
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock window.location for platform detection tests
const mockLocation = (hostname: string) => {
    Object.defineProperty(window, 'location', {
        value: { hostname },
        writable: true,
    });
};

// Mock document.querySelector for ad detection tests
const mockQuerySelector = (selectors: Record<string, HTMLElement | null>) => {
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
        return selectors[selector] || null;
    });
};

// Mock getComputedStyle
const mockComputedStyle = (display = 'block', visibility = 'visible') => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        display,
        visibility,
    } as CSSStyleDeclaration);
};

describe('Ad Detector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('detectPlatform()', () => {
        // Import dynamically to allow mocking window.location
        const getDetectPlatform = async () => {
            const { detectPlatform } = await import('../ad-detector');
            return detectPlatform;
        };

        it('should detect Netflix', async () => {
            mockLocation('www.netflix.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('netflix');
        });

        it('should detect Prime Video from primevideo.com', async () => {
            mockLocation('www.primevideo.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('prime');
        });

        it('should detect Prime Video from amazon.com', async () => {
            mockLocation('www.amazon.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('prime');
        });

        it('should detect Disney+', async () => {
            mockLocation('www.disneyplus.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('disney');
        });

        it('should detect Hulu', async () => {
            mockLocation('www.hulu.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('hulu');
        });

        it('should detect HBO Max', async () => {
            mockLocation('www.max.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('hbomax');
        });

        it('should detect YouTube', async () => {
            mockLocation('www.youtube.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('youtube');
        });

        it('should detect Hotstar', async () => {
            mockLocation('www.hotstar.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('hotstar');
        });

        it('should detect JioCinema', async () => {
            mockLocation('www.jiocinema.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('jiocinema');
        });

        it('should return unknown for unsupported sites', async () => {
            mockLocation('www.example.com');
            const detectPlatform = await getDetectPlatform();
            expect(detectPlatform()).toBe('unknown');
        });
    });

    describe('isAdPlaying()', () => {
        const getIsAdPlaying = async () => {
            const { isAdPlaying } = await import('../ad-detector');
            return isAdPlaying;
        };

        it('should detect YouTube ad via .ad-showing class', async () => {
            mockLocation('www.youtube.com');
            const adElement = document.createElement('div');
            adElement.className = 'ad-showing';
            mockQuerySelector({ '.ad-showing': adElement });
            mockComputedStyle('block', 'visible');

            const isAdPlaying = await getIsAdPlaying();
            expect(isAdPlaying('youtube')).toBe(true);
        });

        it('should return false when no ad elements found', async () => {
            mockLocation('www.netflix.com');
            mockQuerySelector({});

            const isAdPlaying = await getIsAdPlaying();
            expect(isAdPlaying('netflix')).toBe(false);
        });

        it('should ignore hidden ad elements', async () => {
            mockLocation('www.youtube.com');
            const adElement = document.createElement('div');
            mockQuerySelector({ '.ad-showing': adElement });
            mockComputedStyle('none', 'hidden');

            const isAdPlaying = await getIsAdPlaying();
            expect(isAdPlaying('youtube')).toBe(false);
        });
    });

    describe('AdMonitor', () => {
        const getAdMonitor = async () => {
            const { AdMonitor } = await import('../ad-detector');
            return AdMonitor;
        };

        it('should call onAdStart when ad is detected', async () => {
            vi.useFakeTimers();
            mockLocation('www.youtube.com');

            // First check - no ad
            let queryCount = 0;
            vi.spyOn(document, 'querySelector').mockImplementation(() => {
                queryCount++;
                if (queryCount > 4) {
                    // After second check interval, return ad element
                    return document.createElement('div');
                }
                return null;
            });
            mockComputedStyle('block', 'visible');

            const onAdStart = vi.fn();
            const onAdEnd = vi.fn();

            const AdMonitor = await getAdMonitor();
            const monitor = new AdMonitor(onAdStart, onAdEnd, 500);
            monitor.start();

            // Advance past first check (no ad)
            vi.advanceTimersByTime(500);
            expect(onAdStart).not.toHaveBeenCalled();

            // Advance past second check (ad detected)
            vi.advanceTimersByTime(500);
            expect(onAdStart).toHaveBeenCalledTimes(1);

            monitor.stop();
            vi.useRealTimers();
        });

        it('should call onAdEnd when ad finishes', async () => {
            vi.useFakeTimers();
            mockLocation('www.youtube.com');

            let hasAd = true;
            vi.spyOn(document, 'querySelector').mockImplementation(() => {
                if (hasAd) {
                    return document.createElement('div');
                }
                return null;
            });
            mockComputedStyle('block', 'visible');

            const onAdStart = vi.fn();
            const onAdEnd = vi.fn();

            const AdMonitor = await getAdMonitor();
            const monitor = new AdMonitor(onAdStart, onAdEnd, 500);
            monitor.start();

            // First check - ad starts
            vi.advanceTimersByTime(500);
            expect(onAdStart).toHaveBeenCalledTimes(1);

            // Ad ends
            hasAd = false;
            vi.advanceTimersByTime(500);
            expect(onAdEnd).toHaveBeenCalledTimes(1);

            monitor.stop();
            vi.useRealTimers();
        });

        it('should track current ad state correctly', async () => {
            const AdMonitor = await getAdMonitor();
            const monitor = new AdMonitor(() => { }, () => { }, 500);

            expect(monitor.isCurrentlyInAd()).toBe(false);
        });
    });
});

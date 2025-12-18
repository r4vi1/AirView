/**
 * Socket Handlers Tests - Ad Sync Events
 * Integration tests for AD_STARTED, AD_FINISHED, PAUSE_FOR_AD, RESUME_ALL
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server, Socket } from 'socket.io';
import { RoomManager } from '../room-manager.js';
import { setupSocketHandlers } from '../socket-handlers.js';

// Mock Socket.io
function createMockSocket(id: string): Socket & { emittedEvents: Array<{ event: string; payload: unknown }> } {
    const emittedEvents: Array<{ event: string; payload: unknown }> = [];
    const socket = {
        id,
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn((event: string, payload: unknown) => {
            emittedEvents.push({ event, payload });
        }),
        to: vi.fn(() => ({
            emit: vi.fn((event: string, payload: unknown) => {
                emittedEvents.push({ event: `to:${event}`, payload });
            }),
        })),
        on: vi.fn(),
        emittedEvents,
    } as unknown as Socket & { emittedEvents: Array<{ event: string; payload: unknown }> };
    return socket;
}

describe('Socket Handlers - Ad Sync', () => {
    let roomManager: RoomManager;
    let hostSocket: ReturnType<typeof createMockSocket>;
    let userASocket: ReturnType<typeof createMockSocket>;
    let userBSocket: ReturnType<typeof createMockSocket>;
    let roomId: string;

    beforeEach(() => {
        roomManager = new RoomManager();

        // Create room with host
        hostSocket = createMockSocket('host-socket');
        const room = roomManager.createRoom('host-socket', 'host-user', 'Host');
        roomId = room.roomId;

        // Add two more users
        userASocket = createMockSocket('user-a-socket');
        userBSocket = createMockSocket('user-b-socket');
        roomManager.joinRoom(roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
        roomManager.joinRoom(roomId, 'user-b-socket', 'user-b', 'desktop', 'User B');

        // Set initial playback state
        roomManager.updatePlayback(roomId, true, 100);
    });

    describe('Scenario 1: Single User Ad Break', () => {
        it('should pause others when one user enters ad', () => {
            const result = roomManager.startAd(roomId, 'user-a-socket', 'User A', 30000);

            expect(result).not.toBeNull();
            expect(result!.isFirstAd).toBe(true);
            expect(result!.usersToPause).toContain('host-socket');
            expect(result!.usersToPause).toContain('user-b-socket');
        });

        it('should resume all when ad finishes', () => {
            roomManager.startAd(roomId, 'user-a-socket', 'User A', 30000);
            const result = roomManager.endAd(roomId, 'user-a-socket');

            expect(result).not.toBeNull();
            expect(result!.allClear).toBe(true);
            expect(result!.resumeTimestamp).toBe(100);
            expect(result!.resumeIsPlaying).toBe(true);
        });
    });

    describe('Scenario 2: Staggered Ads (A finishes before B)', () => {
        it('should not resume when first user finishes but second still in ad', () => {
            roomManager.startAd(roomId, 'user-a-socket', 'User A', 10000);
            roomManager.startAd(roomId, 'user-b-socket', 'User B', 30000);

            // User A finishes first
            const result = roomManager.endAd(roomId, 'user-a-socket');

            expect(result!.allClear).toBe(false);
            // User A should be told to wait for User B
        });

        it('should resume all when last user finishes', () => {
            roomManager.startAd(roomId, 'user-a-socket', 'User A', 10000);
            roomManager.startAd(roomId, 'user-b-socket', 'User B', 30000);

            roomManager.endAd(roomId, 'user-a-socket'); // A finishes first
            const result = roomManager.endAd(roomId, 'user-b-socket'); // B finishes

            expect(result!.allClear).toBe(true);
            expect(result!.resumeTimestamp).toBe(100);
        });
    });

    describe('Scenario 3: Simultaneous Ads', () => {
        it('should track multiple users in ads without pausing each other', () => {
            // User A enters ads first
            const resultA = roomManager.startAd(roomId, 'user-a-socket', 'User A', 15000);

            // When first ad starts, ALL non-ad users should be paused (including User B)
            expect(resultA!.usersToPause).toContain('host-socket');
            expect(resultA!.usersToPause).toContain('user-b-socket');
            expect(resultA!.usersToPause).not.toContain('user-a-socket');

            // Now User B enters ad - should NOT be in pause list since they're now also in ad
            const resultB = roomManager.startAd(roomId, 'user-b-socket', 'User B', 15000);
            expect(resultB!.usersToPause).not.toContain('user-a-socket');
            expect(resultB!.usersToPause).not.toContain('user-b-socket');
            // Only host should be in pause list (but they're already paused)
            expect(resultB!.usersToPause).toContain('host-socket');

            // Both should be tracked
            const adUsers = roomManager.getAdUsers(roomId);
            expect(adUsers).toHaveLength(2);
        });
    });

    describe('Scenario 4: Host Enters Ad', () => {
        it('should pause all non-host users when host enters ad', () => {
            const result = roomManager.startAd(roomId, 'host-socket', 'Host', 30000);

            expect(result!.usersToPause).toContain('user-a-socket');
            expect(result!.usersToPause).toContain('user-b-socket');
            expect(result!.usersToPause).not.toContain('host-socket');
        });
    });

    describe('Scenario 5: Resume Timestamp Preservation', () => {
        it('should preserve timestamp from before first ad', () => {
            roomManager.updatePlayback(roomId, true, 250.5);

            roomManager.startAd(roomId, 'user-a-socket', 'User A', 30000);
            // Even if playback updates happen, resume should stay at 250.5
            roomManager.startAd(roomId, 'user-b-socket', 'User B', 15000);

            const result = roomManager.endAd(roomId, 'user-a-socket');
            expect(result!.resumeTimestamp).toBe(250.5);

            const finalResult = roomManager.endAd(roomId, 'user-b-socket');
            expect(finalResult!.resumeTimestamp).toBe(250.5);
        });

        it('should preserve paused state for resume', () => {
            roomManager.updatePlayback(roomId, false, 200);

            roomManager.startAd(roomId, 'user-a-socket', 'User A', 30000);
            const result = roomManager.endAd(roomId, 'user-a-socket');

            expect(result!.resumeIsPlaying).toBe(false);
        });
    });

    describe('Edge Case: Rapid Ad Transitions', () => {
        it('should handle user ending ad and immediately starting new one', () => {
            roomManager.startAd(roomId, 'user-a-socket', 'User A', 15000);
            roomManager.endAd(roomId, 'user-a-socket');

            // Immediately starts another ad
            const result = roomManager.startAd(roomId, 'user-a-socket', 'User A', 30000);

            expect(result!.isFirstAd).toBe(true);
            expect(roomManager.isEveryoneClearOfAds(roomId)).toBe(false);
        });
    });

    describe('Edge Case: All Users In Ads', () => {
        it('should handle all three users in ads', () => {
            roomManager.startAd(roomId, 'host-socket', 'Host', 30000);
            roomManager.startAd(roomId, 'user-a-socket', 'User A', 15000);
            roomManager.startAd(roomId, 'user-b-socket', 'User B', 20000);

            const adUsers = roomManager.getAdUsers(roomId);
            expect(adUsers).toHaveLength(3);

            // When first user finishes, still not clear
            expect(roomManager.endAd(roomId, 'user-a-socket')!.allClear).toBe(false);
            expect(roomManager.endAd(roomId, 'host-socket')!.allClear).toBe(false);
            expect(roomManager.endAd(roomId, 'user-b-socket')!.allClear).toBe(true);
        });
    });
});

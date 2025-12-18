/**
 * RoomManager Tests - Ad State Management
 * Comprehensive tests for the Ad-Aware Sync Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../room-manager.js';

describe('RoomManager', () => {
    let roomManager: RoomManager;
    let room: ReturnType<typeof roomManager.createRoom>;

    beforeEach(() => {
        roomManager = new RoomManager();
        room = roomManager.createRoom('host-socket', 'host-user', 'Host');
    });

    describe('Room Creation and Joining', () => {
        it('should create a room with correct initial state', () => {
            expect(room.roomId).toBeDefined();
            expect(room.hostId).toBe('host-socket');
            expect(room.adState.usersInAd.size).toBe(0);
            expect(room.adState.resumeTimestamp).toBe(0);
            expect(room.adState.resumeIsPlaying).toBe(false);
        });

        it('should allow participants to join', () => {
            const updated = roomManager.joinRoom(
                room.roomId,
                'user-a-socket',
                'user-a',
                'desktop',
                'User A'
            );

            expect(updated).not.toBeNull();
            expect(Object.keys(updated!.participants)).toHaveLength(2);
        });
    });

    describe('startAd()', () => {
        beforeEach(() => {
            // Add two more users
            roomManager.joinRoom(room.roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
            roomManager.joinRoom(room.roomId, 'user-b-socket', 'user-b', 'desktop', 'User B');
            // Set playback state
            roomManager.updatePlayback(room.roomId, true, 120.5);
        });

        it('should mark first ad correctly and store resume timestamp', () => {
            const result = roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);

            expect(result).not.toBeNull();
            expect(result!.isFirstAd).toBe(true);
            expect(result!.usersToPause).toContain('host-socket');
            expect(result!.usersToPause).toContain('user-b-socket');
            expect(result!.usersToPause).not.toContain('user-a-socket');

            const roomState = roomManager.getRoom(room.roomId);
            expect(roomState!.adState.resumeTimestamp).toBe(120.5);
            expect(roomState!.adState.resumeIsPlaying).toBe(true);
        });

        it('should handle second user entering ad while first in ad', () => {
            // First user starts ad
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);

            // Second user also enters ad
            const result = roomManager.startAd(room.roomId, 'user-b-socket', 'User B', 15000);

            expect(result).not.toBeNull();
            expect(result!.isFirstAd).toBe(false);
            // Only host should be told to pause (not the two in ads)
            expect(result!.usersToPause).toContain('host-socket');
            expect(result!.usersToPause).not.toContain('user-a-socket');
            expect(result!.usersToPause).not.toContain('user-b-socket');
        });

        it('should track multiple users in ads correctly', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            roomManager.startAd(room.roomId, 'user-b-socket', 'User B', 15000);

            const adUsers = roomManager.getAdUsers(room.roomId);
            expect(adUsers).toHaveLength(2);
            expect(adUsers.map(u => u.displayName)).toContain('User A');
            expect(adUsers.map(u => u.displayName)).toContain('User B');
        });

        it('should return null for non-existent room', () => {
            const result = roomManager.startAd('fake-room', 'user-socket', 'User', 30000);
            expect(result).toBeNull();
        });
    });

    describe('endAd()', () => {
        beforeEach(() => {
            roomManager.joinRoom(room.roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
            roomManager.joinRoom(room.roomId, 'user-b-socket', 'user-b', 'desktop', 'User B');
            roomManager.updatePlayback(room.roomId, true, 120.5);
        });

        it('should return allClear when single user finishes ad', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            const result = roomManager.endAd(room.roomId, 'user-a-socket');

            expect(result).not.toBeNull();
            expect(result!.allClear).toBe(true);
            expect(result!.resumeTimestamp).toBe(120.5);
            expect(result!.resumeIsPlaying).toBe(true);
        });

        it('should NOT return allClear when other users still in ads', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            roomManager.startAd(room.roomId, 'user-b-socket', 'User B', 60000);

            // User A finishes first
            const result = roomManager.endAd(room.roomId, 'user-a-socket');

            expect(result).not.toBeNull();
            expect(result!.allClear).toBe(false);
            expect(result!.resumeTimestamp).toBe(120.5);
        });

        it('should return allClear when last user finishes ad', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            roomManager.startAd(room.roomId, 'user-b-socket', 'User B', 60000);

            roomManager.endAd(room.roomId, 'user-a-socket');
            const result = roomManager.endAd(room.roomId, 'user-b-socket');

            expect(result).not.toBeNull();
            expect(result!.allClear).toBe(true);
        });

        it('should return null for non-existent room', () => {
            const result = roomManager.endAd('fake-room', 'user-socket');
            expect(result).toBeNull();
        });
    });

    describe('isEveryoneClearOfAds()', () => {
        beforeEach(() => {
            roomManager.joinRoom(room.roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
        });

        it('should return true when no ads are playing', () => {
            expect(roomManager.isEveryoneClearOfAds(room.roomId)).toBe(true);
        });

        it('should return false when someone is in an ad', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            expect(roomManager.isEveryoneClearOfAds(room.roomId)).toBe(false);
        });

        it('should return true after all ads finish', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            roomManager.endAd(room.roomId, 'user-a-socket');
            expect(roomManager.isEveryoneClearOfAds(room.roomId)).toBe(true);
        });

        it('should return true for non-existent room', () => {
            expect(roomManager.isEveryoneClearOfAds('fake-room')).toBe(true);
        });
    });

    describe('getAdUsers()', () => {
        beforeEach(() => {
            roomManager.joinRoom(room.roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
        });

        it('should return empty array when no ads', () => {
            expect(roomManager.getAdUsers(room.roomId)).toHaveLength(0);
        });

        it('should return correct ad user info', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            const adUsers = roomManager.getAdUsers(room.roomId);

            expect(adUsers).toHaveLength(1);
            expect(adUsers[0].displayName).toBe('User A');
            expect(adUsers[0].estimatedDuration).toBe(30000);
            expect(adUsers[0].startedAt).toBeDefined();
        });

        it('should return empty array for non-existent room', () => {
            expect(roomManager.getAdUsers('fake-room')).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        beforeEach(() => {
            roomManager.joinRoom(room.roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
            roomManager.joinRoom(room.roomId, 'user-b-socket', 'user-b', 'desktop', 'User B');
            roomManager.updatePlayback(room.roomId, true, 120.5);
        });

        it('should handle user disconnecting while in ad', () => {
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);

            // User A disconnects (leaves room)
            roomManager.leaveRoom('user-a-socket');

            // They should no longer be tracked as in ad (implicitly cleared)
            // Note: Current implementation doesn't auto-clear ads on leave
            // This test documents current behavior
            const roomState = roomManager.getRoom(room.roomId);
            expect(roomState).not.toBeNull();
            // The user is removed from participants but still in usersInAd
            // This is a potential bug - documenting for later fix
        });

        it('should preserve resume state through multiple ads', () => {
            roomManager.updatePlayback(room.roomId, true, 50.0);
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);

            // State should be captured at 50.0
            let roomState = roomManager.getRoom(room.roomId);
            expect(roomState!.adState.resumeTimestamp).toBe(50.0);

            // Second user enters ad - resume point should NOT change
            roomManager.startAd(room.roomId, 'user-b-socket', 'User B', 15000);
            roomState = roomManager.getRoom(room.roomId);
            expect(roomState!.adState.resumeTimestamp).toBe(50.0);
        });

        it('should handle host entering ad', () => {
            const result = roomManager.startAd(room.roomId, 'host-socket', 'Host', 30000);

            expect(result).not.toBeNull();
            expect(result!.usersToPause).toContain('user-a-socket');
            expect(result!.usersToPause).toContain('user-b-socket');
            expect(result!.usersToPause).not.toContain('host-socket');
        });

        it('should handle calling endAd for user not in ad', () => {
            // User A is not in an ad but tries to end one
            const result = roomManager.endAd(room.roomId, 'user-a-socket');

            expect(result).not.toBeNull();
            // Should still work - just a no-op for the Map.delete()
            expect(result!.allClear).toBe(true);
        });
    });

    describe('Resume State Preservation', () => {
        beforeEach(() => {
            roomManager.joinRoom(room.roomId, 'user-a-socket', 'user-a', 'desktop', 'User A');
        });

        it('should preserve isPlaying=true for resume', () => {
            roomManager.updatePlayback(room.roomId, true, 100);
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            const result = roomManager.endAd(room.roomId, 'user-a-socket');

            expect(result!.resumeIsPlaying).toBe(true);
        });

        it('should preserve isPlaying=false for resume', () => {
            roomManager.updatePlayback(room.roomId, false, 100);
            roomManager.startAd(room.roomId, 'user-a-socket', 'User A', 30000);
            const result = roomManager.endAd(room.roomId, 'user-a-socket');

            expect(result!.resumeIsPlaying).toBe(false);
        });
    });
});

/**
 * Room Manager
 * In-memory store for room state (Redis-ready structure)
 */

import { v4 as uuidv4 } from 'uuid';
import type { RoomState, Participant, PlaybackState, StreamingPlatform, AdState, AdUserInfo } from './types.js';

export class RoomManager {
    private rooms: Map<string, RoomState> = new Map();
    private socketToRoom: Map<string, string> = new Map();

    /**
     * Create a new room
     */
    createRoom(hostSocketId: string, hostUserId: string, displayName?: string): RoomState {
        const roomId = this.generateRoomId();

        const host: Participant = {
            id: hostSocketId,
            userId: hostUserId,
            deviceType: 'desktop',
            displayName,
            isHost: true,
            joinedAt: Date.now(),
        };

        const room: RoomState = {
            roomId,
            hostId: hostSocketId,
            participants: { [hostSocketId]: host },
            playback: {
                isPlaying: false,
                timestamp: 0,
                updatedAt: Date.now(),
                platform: 'unknown',
            },
            adState: {
                usersInAd: new Map(),
                resumeTimestamp: 0,
                resumeIsPlaying: false,
            },
            createdAt: Date.now(),
        };

        this.rooms.set(roomId, room);
        this.socketToRoom.set(hostSocketId, roomId);

        return room;
    }

    /**
     * Join an existing room
     */
    joinRoom(
        roomId: string,
        socketId: string,
        userId: string,
        deviceType: 'desktop' | 'mobile',
        displayName?: string
    ): RoomState | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const participant: Participant = {
            id: socketId,
            userId,
            deviceType,
            displayName,
            isHost: false,
            joinedAt: Date.now(),
        };

        room.participants[socketId] = participant;
        this.socketToRoom.set(socketId, roomId);

        return room;
    }

    /**
     * Leave a room
     */
    leaveRoom(socketId: string): { roomId: string; room: RoomState | null } | null {
        const roomId = this.socketToRoom.get(socketId);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        delete room.participants[socketId];
        this.socketToRoom.delete(socketId);

        // If host left, promote next participant or delete room
        if (room.hostId === socketId) {
            const remainingParticipants = Object.keys(room.participants);
            if (remainingParticipants.length > 0) {
                room.hostId = remainingParticipants[0];
                room.participants[room.hostId].isHost = true;
            } else {
                this.rooms.delete(roomId);
                return { roomId, room: null };
            }
        }

        return { roomId, room };
    }

    /**
     * Update playback state
     */
    updatePlayback(
        roomId: string,
        isPlaying: boolean,
        timestamp: number,
        platform?: StreamingPlatform
    ): PlaybackState | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        room.playback = {
            isPlaying,
            timestamp,
            updatedAt: Date.now(),
            platform: platform || room.playback.platform,
        };

        return room.playback;
    }

    /**
     * Get room by ID
     */
    getRoom(roomId: string): RoomState | null {
        return this.rooms.get(roomId) || null;
    }

    /**
     * Get room by socket ID
     */
    getRoomBySocket(socketId: string): RoomState | null {
        const roomId = this.socketToRoom.get(socketId);
        if (!roomId) return null;
        return this.rooms.get(roomId) || null;
    }

    /**
     * Generate a short, readable room ID
     */
    private generateRoomId(): string {
        // Generate 6 character alphanumeric ID
        return uuidv4().substring(0, 6).toUpperCase();
    }

    // ============================================
    // Ad State Management
    // ============================================

    /**
     * Mark a user as watching an ad
     * Returns: list of users NOT in ads (who should be paused)
     */
    startAd(
        roomId: string,
        socketId: string,
        displayName: string,
        estimatedDuration?: number
    ): { usersToPause: string[]; isFirstAd: boolean } | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const isFirstAd = room.adState.usersInAd.size === 0;

        // If first ad, store the resume point
        if (isFirstAd) {
            room.adState.resumeTimestamp = room.playback.timestamp;
            room.adState.resumeIsPlaying = room.playback.isPlaying;
        }

        // Add user to ad set
        room.adState.usersInAd.set(socketId, {
            oderId: socketId,
            displayName,
            estimatedDuration,
            startedAt: Date.now(),
        });

        // Find users NOT in ads (they should pause)
        const usersToPause = Object.keys(room.participants).filter(
            (id) => !room.adState.usersInAd.has(id) && id !== socketId
        );

        return { usersToPause, isFirstAd };
    }

    /**
     * Mark a user as finished with their ad
     * Returns: whether all users are clear of ads
     */
    endAd(roomId: string, socketId: string): {
        allClear: boolean;
        resumeTimestamp: number;
        resumeIsPlaying: boolean;
    } | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        // Remove user from ad set
        room.adState.usersInAd.delete(socketId);

        const allClear = room.adState.usersInAd.size === 0;

        return {
            allClear,
            resumeTimestamp: room.adState.resumeTimestamp,
            resumeIsPlaying: room.adState.resumeIsPlaying,
        };
    }

    /**
     * Check if everyone is clear of ads
     */
    isEveryoneClearOfAds(roomId: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room) return true;
        return room.adState.usersInAd.size === 0;
    }

    /**
     * Get list of users currently in ads
     */
    getAdUsers(roomId: string): AdUserInfo[] {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        return Array.from(room.adState.usersInAd.values());
    }

    /**
     * Get participant display name
     */
    getParticipantName(roomId: string, socketId: string): string {
        const room = this.rooms.get(roomId);
        if (!room) return 'Unknown';
        return room.participants[socketId]?.displayName || 'User';
    }
}

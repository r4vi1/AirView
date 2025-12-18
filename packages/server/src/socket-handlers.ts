/**
 * Socket Event Handlers
 * Handles all WebSocket events for room management and sync
 */

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from './room-manager.js';
import type { SignalData, RemoteCommand, StreamingPlatform } from './types.js';

// Event names (should match @couchgang/shared)
const EVENTS = {
    // Client -> Server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    PLAYBACK_UPDATE: 'playback_update',
    REMOTE_COMMAND: 'remote_command',
    SIGNAL: 'signal',
    AD_STARTED: 'ad_started',
    AD_FINISHED: 'ad_finished',
    CHAT_MESSAGE: 'chat_message',
    REACTION: 'reaction',

    // Server -> Client
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    ROOM_LEFT: 'room_left',
    PARTICIPANT_JOINED: 'participant_joined',
    PARTICIPANT_LEFT: 'participant_left',
    SYNC_STATE: 'sync_state',
    PAUSE_FOR_AD: 'pause_for_ad',
    RESUME_ALL: 'resume_all',
    AD_STATE_UPDATE: 'ad_state_update',
    ERROR: 'error',
} as const;

interface CreateRoomPayload {
    userId: string;
    displayName?: string;
    contentUrl?: string;  // URL of content being watched
}

interface JoinRoomPayload {
    roomId: string;
    userId: string;
    deviceType: 'desktop' | 'mobile';
    displayName?: string;
}

interface PlaybackUpdatePayload {
    isPlaying: boolean;
    timestamp: number;
    platform?: StreamingPlatform;
}

interface SignalPayload {
    to: string;
    signal: SignalData;
}

interface AdStartedPayload {
    estimatedDuration?: number;
}

interface AdFinishedPayload {
    // Empty for now, could add ad duration or other metrics
}

export function setupSocketHandlers(io: Server, roomManager: RoomManager) {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // ========================================
        // Room Management
        // ========================================

        socket.on(EVENTS.CREATE_ROOM, (payload: CreateRoomPayload) => {
            const { userId, displayName, contentUrl } = payload;

            const room = roomManager.createRoom(socket.id, userId, displayName);

            // Store content URL if provided
            if (contentUrl) {
                room.contentUrl = contentUrl;
            }

            socket.join(room.roomId);

            socket.emit(EVENTS.ROOM_CREATED, {
                roomId: room.roomId,
                room,
            });

            console.log(`📦 Room created: ${room.roomId} by ${socket.id}${contentUrl ? ` (${contentUrl})` : ''}`);
        });

        socket.on(EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) => {
            const { roomId, userId, deviceType, displayName } = payload;

            const room = roomManager.joinRoom(roomId, socket.id, userId, deviceType, displayName);

            if (!room) {
                socket.emit(EVENTS.ERROR, { message: 'Room not found' });
                return;
            }

            socket.join(roomId);

            // Send current state to joining participant
            socket.emit(EVENTS.ROOM_JOINED, {
                roomId,
                room,
                playback: room.playback,
            });

            // Notify others in room
            socket.to(roomId).emit(EVENTS.PARTICIPANT_JOINED, {
                participant: room.participants[socket.id],
            });

            console.log(`👤 ${socket.id} joined room: ${roomId}`);
        });

        socket.on(EVENTS.LEAVE_ROOM, () => {
            handleLeaveRoom(socket, roomManager);
        });

        // ========================================
        // Playback Sync
        // ========================================

        socket.on(EVENTS.PLAYBACK_UPDATE, (payload: PlaybackUpdatePayload) => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) return;

            const playback = roomManager.updatePlayback(
                room.roomId,
                payload.isPlaying,
                payload.timestamp,
                payload.platform
            );

            if (playback) {
                // Broadcast to all OTHER participants in room
                socket.to(room.roomId).emit(EVENTS.SYNC_STATE, {
                    playback,
                    senderId: socket.id,
                });
            }
        });

        // ========================================
        // Remote Control (from Mobile)
        // ========================================

        socket.on(EVENTS.REMOTE_COMMAND, (payload: RemoteCommand) => {
            const room = roomManager.getRoom(payload.roomId);
            if (!room) {
                socket.emit(EVENTS.ERROR, { message: 'Room not found' });
                return;
            }

            // Forward command to desktop clients in room
            socket.to(payload.roomId).emit(EVENTS.REMOTE_COMMAND, {
                ...payload,
                senderId: socket.id,
            });

            console.log(`🎮 Remote command: ${payload.type} in room ${payload.roomId}`);
        });

        // ========================================
        // WebRTC Signaling
        // ========================================

        socket.on(EVENTS.SIGNAL, (payload: SignalPayload) => {
            io.to(payload.to).emit(EVENTS.SIGNAL, {
                from: socket.id,
                signal: payload.signal,
            });
        });

        // ========================================
        // Ad Sync
        // ========================================

        socket.on(EVENTS.AD_STARTED, (payload: AdStartedPayload) => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) return;

            const displayName = roomManager.getParticipantName(room.roomId, socket.id);
            const result = roomManager.startAd(
                room.roomId,
                socket.id,
                displayName,
                payload.estimatedDuration
            );

            if (!result) return;

            // Pause users not in ads
            if (result.usersToPause.length > 0) {
                const adUsers = roomManager.getAdUsers(room.roomId);
                for (const userId of result.usersToPause) {
                    io.to(userId).emit(EVENTS.PAUSE_FOR_AD, {
                        usersInAd: adUsers,
                        resumeTimestamp: room.playback.timestamp,
                    });
                }
            }

            // Broadcast ad state update to all
            socket.to(room.roomId).emit(EVENTS.AD_STATE_UPDATE, {
                usersInAd: roomManager.getAdUsers(room.roomId),
            });

            console.log(`📺 Ad started for ${displayName} in room ${room.roomId}`);
        });

        socket.on(EVENTS.AD_FINISHED, (_payload: AdFinishedPayload) => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) return;

            const result = roomManager.endAd(room.roomId, socket.id);
            if (!result) return;

            if (result.allClear) {
                // Everyone is done with ads - resume all!
                io.to(room.roomId).emit(EVENTS.RESUME_ALL, {
                    timestamp: result.resumeTimestamp,
                    isPlaying: result.resumeIsPlaying,
                });
                console.log(`▶️ All ads finished in room ${room.roomId}, resuming at ${result.resumeTimestamp}`);
            } else {
                // This user finished but others are still in ads
                // Pause this user until everyone is done
                socket.emit(EVENTS.PAUSE_FOR_AD, {
                    usersInAd: roomManager.getAdUsers(room.roomId),
                    resumeTimestamp: result.resumeTimestamp,
                });
            }

            // Broadcast ad state update to all
            socket.to(room.roomId).emit(EVENTS.AD_STATE_UPDATE, {
                usersInAd: roomManager.getAdUsers(room.roomId),
            });
        });

        // ========================================
        // Chat & Reactions
        // ========================================

        socket.on(EVENTS.CHAT_MESSAGE, (payload: { message: string }) => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) return;

            const participant = room.participants[socket.id];
            const displayName = participant?.displayName || 'Anonymous';

            // Broadcast to all in room including sender
            io.to(room.roomId).emit(EVENTS.CHAT_MESSAGE, {
                senderId: socket.id,
                senderName: displayName,
                message: payload.message,
                timestamp: Date.now(),
            });
        });

        socket.on(EVENTS.REACTION, (payload: { emoji: string }) => {
            const room = roomManager.getRoomBySocket(socket.id);
            if (!room) return;

            const participant = room.participants[socket.id];
            const displayName = participant?.displayName || 'Anonymous';

            // Broadcast to all in room
            io.to(room.roomId).emit(EVENTS.REACTION, {
                senderId: socket.id,
                senderName: displayName,
                emoji: payload.emoji,
                timestamp: Date.now(),
            });
        });

        // ========================================
        // Disconnect
        // ========================================

        socket.on('disconnect', () => {
            handleLeaveRoom(socket, roomManager);
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
}

function handleLeaveRoom(socket: Socket, roomManager: RoomManager) {
    const result = roomManager.leaveRoom(socket.id);

    if (result) {
        socket.leave(result.roomId);

        if (result.room) {
            // Notify remaining participants
            socket.to(result.roomId).emit(EVENTS.PARTICIPANT_LEFT, {
                participantId: socket.id,
            });
        }
    }
}

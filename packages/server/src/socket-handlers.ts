/**
 * Socket Event Handlers
 * Handles all WebSocket events for room management and sync
 */

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from './room-manager.js';
import type { SignalData, RemoteCommand, StreamingPlatform } from './types.js';

// Event names (should match @airview/shared)
const EVENTS = {
    // Client -> Server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    PLAYBACK_UPDATE: 'playback_update',
    REMOTE_COMMAND: 'remote_command',
    SIGNAL: 'signal',

    // Server -> Client
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    ROOM_LEFT: 'room_left',
    PARTICIPANT_JOINED: 'participant_joined',
    PARTICIPANT_LEFT: 'participant_left',
    SYNC_STATE: 'sync_state',
    ERROR: 'error',
} as const;

interface CreateRoomPayload {
    userId: string;
    displayName?: string;
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

export function setupSocketHandlers(io: Server, roomManager: RoomManager) {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // ========================================
        // Room Management
        // ========================================

        socket.on(EVENTS.CREATE_ROOM, (payload: CreateRoomPayload) => {
            const { userId, displayName } = payload;

            const room = roomManager.createRoom(socket.id, userId, displayName);
            socket.join(room.roomId);

            socket.emit(EVENTS.ROOM_CREATED, {
                roomId: room.roomId,
                room,
            });

            console.log(`📦 Room created: ${room.roomId} by ${socket.id}`);
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

/**
 * AirView Extension Background Service Worker
 * Manages socket connection and room state
 */

import { io, Socket } from 'socket.io-client';

// Server URL (should be configurable via options)
const SERVER_URL = 'http://localhost:3001';

// State
let socket: Socket | null = null;
let currentRoom: { roomId: string; participants: number } | null = null;

// Event names
const EVENTS = {
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    PARTICIPANT_JOINED: 'participant_joined',
    PARTICIPANT_LEFT: 'participant_left',
    PLAYBACK_UPDATE: 'playback_update',
    SYNC_STATE: 'sync_state',
    SIGNAL: 'signal',
};

/**
 * Initialize socket connection
 */
function initSocket(): Socket {
    if (socket?.connected) return socket;

    socket = io(SERVER_URL, {
        transports: ['websocket'],
        autoConnect: true,
    });

    socket.on('connect', () => {
        console.log('[AirView] Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('[AirView] Disconnected from server');
        currentRoom = null;
    });

    socket.on(EVENTS.ROOM_CREATED, (data) => {
        currentRoom = { roomId: data.roomId, participants: 1 };
        broadcastRoomUpdate();
    });

    socket.on(EVENTS.PARTICIPANT_JOINED, () => {
        if (currentRoom) {
            currentRoom.participants++;
            broadcastRoomUpdate();
        }
    });

    socket.on(EVENTS.PARTICIPANT_LEFT, () => {
        if (currentRoom && currentRoom.participants > 0) {
            currentRoom.participants--;
            broadcastRoomUpdate();
        }
    });

    socket.on(EVENTS.SYNC_STATE, (data) => {
        // Forward sync state to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SYNC_STATE',
                    playback: data.playback,
                });
            }
        });
    });

    return socket;
}

/**
 * Broadcast room update to popup
 */
function broadcastRoomUpdate() {
    chrome.runtime.sendMessage({
        type: 'ROOM_UPDATE',
        roomId: currentRoom?.roomId,
        participants: currentRoom?.participants || 0,
    }).catch(() => {
        // Popup might be closed, ignore error
    });
}

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
        case 'CREATE_ROOM': {
            const s = initSocket();
            s.emit(EVENTS.CREATE_ROOM, {
                userId: `user_${Date.now()}`,
                displayName: 'Desktop User',
            });

            // Wait for room creation response
            s.once(EVENTS.ROOM_CREATED, (data) => {
                sendResponse({ roomId: data.roomId });
            });
            return true; // async response
        }

        case 'LEAVE_ROOM': {
            socket?.emit(EVENTS.LEAVE_ROOM);
            currentRoom = null;
            sendResponse({ success: true });
            break;
        }

        case 'GET_STATUS': {
            sendResponse({
                roomId: currentRoom?.roomId,
                participants: currentRoom?.participants || 0,
                isConnected: socket?.connected || false,
            });
            break;
        }

        case 'PLAYBACK_UPDATE': {
            socket?.emit(EVENTS.PLAYBACK_UPDATE, {
                isPlaying: message.isPlaying,
                timestamp: message.timestamp,
                platform: message.platform,
            });
            break;
        }

        case 'SIGNAL': {
            socket?.emit(EVENTS.SIGNAL, {
                to: message.to,
                signal: message.signal,
            });
            break;
        }

        case 'MAXIMIZE_WINDOW': {
            chrome.windows.getCurrent((window) => {
                if (window.id) {
                    chrome.windows.update(window.id, { state: 'maximized' });
                }
            });
            break;
        }
    }

    return false;
});

// Initialize socket on extension load
initSocket();

export { };

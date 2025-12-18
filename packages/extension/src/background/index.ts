/**
 * CouchGang Extension Background Service Worker
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
    // Ad sync
    AD_STARTED: 'ad_started',
    AD_FINISHED: 'ad_finished',
    PAUSE_FOR_AD: 'pause_for_ad',
    RESUME_ALL: 'resume_all',
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
        console.log('[CouchGang] Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('[CouchGang] Disconnected from server');
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

    // Forward ad events to content script
    socket.on(EVENTS.PAUSE_FOR_AD, (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'PAUSE_FOR_AD',
                    usersInAd: data.usersInAd,
                    resumeTimestamp: data.resumeTimestamp,
                });
            }
        });
    });

    socket.on(EVENTS.RESUME_ALL, (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'RESUME_ALL',
                    timestamp: data.timestamp,
                    isPlaying: data.isPlaying,
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

        case 'JOIN_ROOM': {
            const s = initSocket();
            s.emit(EVENTS.JOIN_ROOM, {
                roomId: message.roomId,
                userId: `user_${Date.now()}`,
                deviceType: 'desktop',
                displayName: 'Desktop User',
            });

            // Wait for join response
            s.once(EVENTS.ROOM_JOINED, (data) => {
                currentRoom = { roomId: data.roomId, participants: Object.keys(data.room.participants).length };
                sendResponse({ success: true, roomId: data.roomId });
                broadcastRoomUpdate();

                // Notify content script
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]?.id) {
                        chrome.tabs.sendMessage(tabs[0].id, { type: 'ROOM_JOINED' });
                    }
                });
            });

            s.once('error', (data: { message: string }) => {
                sendResponse({ success: false, error: data.message });
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                sendResponse({ success: false, error: 'Connection timeout' });
            }, 5000);

            return true; // async response
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

        // Ad sync - forward to server
        case 'AD_STARTED': {
            socket?.emit(EVENTS.AD_STARTED, {
                estimatedDuration: message.estimatedDuration,
            });
            break;
        }

        case 'AD_FINISHED': {
            socket?.emit(EVENTS.AD_FINISHED, {});
            break;
        }
    }

    return false;
});

// Initialize socket on extension load
initSocket();

export { };

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
    // Chat & reactions
    CHAT_MESSAGE: 'chat_message',
    REACTION: 'reaction',
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

        // Notify content script that we're now in a room (host)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'ROOM_JOINED' });
            }
        });
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

    // Chat message from server - forward to content script
    socket.on(EVENTS.CHAT_MESSAGE, (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'CHAT_MESSAGE',
                    ...data,
                });
            }
        });
    });

    // Reaction from server - forward to content script
    socket.on(EVENTS.REACTION, (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'REACTION',
                    ...data,
                });
            }
        });
    });

    // Signal for WebRTC - forward to content script
    socket.on(EVENTS.SIGNAL, (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SIGNAL',
                    ...data,
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
            // Get current tab URL to share with room
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const contentUrl = tabs[0]?.url;

                const s = initSocket();
                s.emit(EVENTS.CREATE_ROOM, {
                    userId: `user_${Date.now()}`,
                    displayName: 'Desktop User',
                    contentUrl,
                });

                // Wait for room creation response
                s.once(EVENTS.ROOM_CREATED, (data) => {
                    sendResponse({ roomId: data.roomId });
                });
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
                sendResponse({ success: true, roomId: data.roomId, contentUrl: data.room.contentUrl });
                broadcastRoomUpdate();

                // If room has a content URL, open it
                if (data.room.contentUrl) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]?.id) {
                            // Navigate current tab to the content
                            chrome.tabs.update(tabs[0].id, { url: data.room.contentUrl });
                        }
                    });
                } else {
                    // Just notify content script if no redirect needed
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(tabs[0].id, { type: 'ROOM_JOINED' });
                        }
                    });
                }
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

        // Chat & reactions - forward to server
        case 'SEND_CHAT': {
            socket?.emit(EVENTS.CHAT_MESSAGE, {
                message: message.message,
            });
            break;
        }

        case 'SEND_REACTION': {
            socket?.emit(EVENTS.REACTION, {
                emoji: message.emoji,
            });
            break;
        }
    }

    return false;
});

// Initialize socket on extension load
initSocket();

export { };

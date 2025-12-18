/**
 * AirView Socket Events
 * Centralized event name constants for Socket.io communication
 */

// ============================================
// Client -> Server Events
// ============================================

export const CLIENT_EVENTS = {
    // Room management
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',

    // Playback sync
    PLAYBACK_UPDATE: 'playback_update',

    // Ad sync
    AD_STARTED: 'ad_started',
    AD_FINISHED: 'ad_finished',

    // Remote control
    REMOTE_COMMAND: 'remote_command',

    // WebRTC signaling
    SIGNAL: 'signal',
} as const;

// ============================================
// Server -> Client Events
// ============================================

export const SERVER_EVENTS = {
    // Room management
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    ROOM_LEFT: 'room_left',
    PARTICIPANT_JOINED: 'participant_joined',
    PARTICIPANT_LEFT: 'participant_left',

    // Playback sync
    SYNC_STATE: 'sync_state',

    // Ad sync
    PAUSE_FOR_AD: 'pause_for_ad',
    RESUME_ALL: 'resume_all',
    AD_STATE_UPDATE: 'ad_state_update',

    // Remote control
    REMOTE_COMMAND: 'remote_command',

    // WebRTC signaling
    SIGNAL: 'signal',

    // Errors
    ERROR: 'error',
} as const;

// Type helpers
export type ClientEventName = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];
export type ServerEventName = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];

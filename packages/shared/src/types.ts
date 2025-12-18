/**
 * AirView Shared Types
 * Common TypeScript interfaces used across all packages
 */

// ============================================
// Room & Participant Types
// ============================================

export interface Participant {
    id: string;
    userId: string;
    deviceType: 'desktop' | 'mobile';
    displayName?: string;
    isHost: boolean;
    joinedAt: number;
}

export interface RoomState {
    roomId: string;
    hostId: string;
    participants: Record<string, Participant>;
    playback: PlaybackState;
    createdAt: number;
}

export interface PlaybackState {
    isPlaying: boolean;
    timestamp: number;
    updatedAt: number;
    platform: StreamingPlatform;
    contentId?: string;
}

export type StreamingPlatform = 'netflix' | 'prime' | 'unknown';

// ============================================
// WebRTC Signaling Types
// ============================================

export interface SignalData {
    type: 'offer' | 'answer' | 'candidate';
    sdp?: string;
    candidate?: RTCIceCandidateInit;
}

export interface SignalMessage {
    from: string;
    to: string;
    signal: SignalData;
}

// ============================================
// Remote Control Types
// ============================================

export type RemoteCommandType = 'PLAY' | 'PAUSE' | 'SEEK';

export interface RemoteCommand {
    type: RemoteCommandType;
    roomId: string;
    senderId: string;
    seekTime?: number;  // Only for SEEK commands
}

// ============================================
// QR Code Pairing Types
// ============================================

export interface QRCodeData {
    roomId: string;
    serverUrl: string;
    expiresAt: number;
}

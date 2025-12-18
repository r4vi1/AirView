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

export type StreamingPlatform =
    | 'netflix'
    | 'prime'
    | 'disney'
    | 'hulu'
    | 'hbomax'
    | 'youtube'
    | 'hotstar'
    | 'jiocinema'
    | 'sonyliv'
    | 'zee5'
    | 'unknown';

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

// ============================================
// Ad Sync Types
// ============================================

export interface AdState {
    usersInAd: string[];           // User IDs currently watching ads
    resumeTimestamp: number;        // Where to resume when all clear
    resumeIsPlaying: boolean;       // Was playing before ads?
}

export interface AdUserInfo {
    oderId: string;
    displayName: string;
    estimatedDuration?: number;     // If we can detect ad length
    startedAt: number;
}

export interface PauseForAdPayload {
    usersInAd: AdUserInfo[];
    resumeTimestamp: number;
}

export interface ResumeAllPayload {
    timestamp: number;
    isPlaying: boolean;
}

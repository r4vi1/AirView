/**
 * Server-side type definitions
 * Mirrors @airview/shared types for server use
 */

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

export interface SignalData {
    type: 'offer' | 'answer' | 'candidate';
    sdp?: string;
    candidate?: RTCIceCandidateInit;
}

export interface RemoteCommand {
    type: 'PLAY' | 'PAUSE' | 'SEEK';
    roomId: string;
    senderId: string;
    seekTime?: number;
}

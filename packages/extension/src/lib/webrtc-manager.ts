/**
 * CouchGang WebRTC Manager
 * Handles peer connections, media streams, and signaling
 */

// ICE servers for NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

export interface PeerConnection {
    peerId: string;
    displayName: string;
    connection: RTCPeerConnection;
    stream?: MediaStream;
    audioEnabled: boolean;
    videoEnabled: boolean;
}

export interface WebRTCManagerOptions {
    onRemoteStream: (peerId: string, stream: MediaStream) => void;
    onPeerDisconnected: (peerId: string) => void;
    onSignal: (peerId: string, signal: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
}

export class WebRTCManager {
    private localStream: MediaStream | null = null;
    private peers: Map<string, PeerConnection> = new Map();
    private options: WebRTCManagerOptions;
    private isMuted: boolean = false;
    private isCameraOff: boolean = false;

    constructor(options: WebRTCManagerOptions) {
        this.options = options;
    }

    /**
     * Get local media stream (camera + microphone)
     */
    async getLocalStream(): Promise<MediaStream> {
        if (this.localStream) {
            return this.localStream;
        }

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user',
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            console.log('[CouchGang WebRTC] Got local stream');
            return this.localStream;
        } catch (error) {
            console.error('[CouchGang WebRTC] Failed to get local stream:', error);
            throw error;
        }
    }

    /**
     * Create a peer connection for a remote user
     */
    async createPeerConnection(peerId: string, displayName: string, isInitiator: boolean): Promise<void> {
        if (this.peers.has(peerId)) {
            console.warn(`[CouchGang WebRTC] Peer ${peerId} already exists`);
            return;
        }

        const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        // Add local tracks to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                connection.addTrack(track, this.localStream!);
            });
        }

        // Handle incoming tracks
        connection.ontrack = (event) => {
            console.log(`[CouchGang WebRTC] Received track from ${peerId}`);
            const peer = this.peers.get(peerId);
            if (peer) {
                peer.stream = event.streams[0];
                this.options.onRemoteStream(peerId, event.streams[0]);
            }
        };

        // Handle ICE candidates
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.options.onSignal(peerId, event.candidate.toJSON());
            }
        };

        // Handle connection state changes
        connection.onconnectionstatechange = () => {
            console.log(`[CouchGang WebRTC] Connection state for ${peerId}: ${connection.connectionState}`);
            if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed') {
                this.removePeer(peerId);
                this.options.onPeerDisconnected(peerId);
            }
        };

        const peer: PeerConnection = {
            peerId,
            displayName,
            connection,
            audioEnabled: true,
            videoEnabled: true,
        };

        this.peers.set(peerId, peer);

        // If we're the initiator, create and send an offer
        if (isInitiator) {
            try {
                const offer = await connection.createOffer();
                await connection.setLocalDescription(offer);
                this.options.onSignal(peerId, connection.localDescription!);
                console.log(`[CouchGang WebRTC] Sent offer to ${peerId}`);
            } catch (error) {
                console.error(`[CouchGang WebRTC] Failed to create offer for ${peerId}:`, error);
            }
        }
    }

    /**
     * Handle incoming signal (SDP offer/answer or ICE candidate)
     */
    async handleSignal(peerId: string, signal: RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void> {
        let peer = this.peers.get(peerId);

        // If we don't have this peer yet, create the connection
        if (!peer) {
            await this.createPeerConnection(peerId, peerId, false);
            peer = this.peers.get(peerId);
        }

        if (!peer) return;

        const connection = peer.connection;

        // Check if it's an SDP (has sdp property)
        if ('sdp' in signal && signal.sdp) {
            const description = signal as RTCSessionDescriptionInit;

            if (description.type === 'offer') {
                await connection.setRemoteDescription(new RTCSessionDescription(description));
                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                this.options.onSignal(peerId, connection.localDescription!);
                console.log(`[CouchGang WebRTC] Sent answer to ${peerId}`);
            } else if (description.type === 'answer') {
                await connection.setRemoteDescription(new RTCSessionDescription(description));
                console.log(`[CouchGang WebRTC] Set remote answer from ${peerId}`);
            }
        } else if ('candidate' in signal && signal.candidate) {
            // It's an ICE candidate
            try {
                await connection.addIceCandidate(new RTCIceCandidate(signal as RTCIceCandidateInit));
            } catch (error) {
                console.warn(`[CouchGang WebRTC] Failed to add ICE candidate:`, error);
            }
        }
    }

    /**
     * Toggle local audio (mute/unmute)
     */
    toggleMute(): boolean {
        this.isMuted = !this.isMuted;

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = !this.isMuted;
            });
        }

        console.log(`[CouchGang WebRTC] Mute: ${this.isMuted}`);
        return this.isMuted;
    }

    /**
     * Toggle local video (camera on/off)
     */
    toggleCamera(): boolean {
        this.isCameraOff = !this.isCameraOff;

        if (this.localStream) {
            this.localStream.getVideoTracks().forEach((track) => {
                track.enabled = !this.isCameraOff;
            });
        }

        console.log(`[CouchGang WebRTC] Camera off: ${this.isCameraOff}`);
        return this.isCameraOff;
    }

    /**
     * Get current mute state
     */
    getMuteState(): boolean {
        return this.isMuted;
    }

    /**
     * Get current camera state
     */
    getCameraState(): boolean {
        return !this.isCameraOff;
    }

    /**
     * Get local stream
     */
    getLocalMediaStream(): MediaStream | null {
        return this.localStream;
    }

    /**
     * Get all peer connections
     */
    getPeers(): PeerConnection[] {
        return Array.from(this.peers.values());
    }

    /**
     * Get a specific peer
     */
    getPeer(peerId: string): PeerConnection | undefined {
        return this.peers.get(peerId);
    }

    /**
     * Remove a peer connection
     */
    removePeer(peerId: string): void {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.connection.close();
            this.peers.delete(peerId);
            console.log(`[CouchGang WebRTC] Removed peer ${peerId}`);
        }
    }

    /**
     * Clean up all connections
     */
    destroy(): void {
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        // Close all peer connections
        this.peers.forEach((peer) => {
            peer.connection.close();
        });
        this.peers.clear();

        console.log('[CouchGang WebRTC] Destroyed all connections');
    }
}

export default WebRTCManager;

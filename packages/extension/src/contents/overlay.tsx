/**
 * CouchGang Overlay
 * Shadow DOM container for video chat overlay
 * Injected via Plasmo content script UI
 */

import type { PlasmoCSConfig, PlasmoGetShadowHostId } from 'plasmo';
import React, { useState, useEffect, useCallback } from 'react';
import { VideoBubble } from '../components/VideoBubble';
import { ControlBar } from '../components/ControlBar';
import { ChatPanel, type ChatMessage } from '../components/ChatPanel';
import { ReactionOverlay, ReactionPicker, type Reaction } from '../components/ReactionOverlay';
import cssText from 'data-text:../styles/design-tokens.css';
import videoBubbleCss from 'data-text:../components/VideoBubble.css';
import controlBarCss from 'data-text:../components/ControlBar.css';
import chatPanelCss from 'data-text:../components/ChatPanel.css';
import reactionOverlayCss from 'data-text:../components/ReactionOverlay.css';

// Plasmo configuration
export const config: PlasmoCSConfig = {
    matches: ['<all_urls>'],
    run_at: 'document_idle',
};

// Shadow DOM host ID
export const getShadowHostId: PlasmoGetShadowHostId = () => 'couchgang-overlay';

// Inject styles into shadow DOM
export const getStyle = () => {
    const style = document.createElement('style');
    style.textContent = `
    ${cssText}
    ${videoBubbleCss}
    ${controlBarCss}
    ${chatPanelCss}
    ${reactionOverlayCss}
    
    /* Container styles */
    .cg-overlay-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    .cg-overlay-root * {
      pointer-events: auto;
    }
    
    /* Waiting indicator (ad sync) */
    .cg-waiting-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 2147483647;
      animation: cg-spring-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .cg-waiting-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: cg-spin 1s linear infinite;
    }
    
    @keyframes cg-spin {
      to { transform: rotate(360deg); }
    }
    
    .cg-waiting-text {
      color: white;
    }
    
    .cg-waiting-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }
    
    .cg-waiting-subtitle {
      font-size: 12px;
      opacity: 0.6;
      margin-top: 2px;
    }
  `;
    return style;
};

interface Participant {
    id: string;
    displayName: string;
    stream?: MediaStream;
    isMuted?: boolean;
    isSpeaking?: boolean;
}

interface WaitingState {
    usersInAd: Array<{ displayName: string; startedAt: number }>;
    elapsedSeconds: number;
}

function CouchGangOverlay() {
    const [isActive, setIsActive] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [waiting, setWaiting] = useState<WaitingState | null>(null);

    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Reactions state
    const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
    const [reactions, setReactions] = useState<Reaction[]>([]);

    // Check room status on mount (for page reloads/navigations)
    useEffect(() => {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
            if (response?.roomId) {
                setIsActive(true);
                console.log('[CouchGang Overlay] Activated via GET_STATUS - already in room');
            }
        });
    }, []);

    // Listen for messages from background
    useEffect(() => {
        const handleMessage = (message: any) => {
            switch (message.type) {
                case 'OVERLAY_ACTIVATE':
                    setIsActive(true);
                    console.log('[CouchGang Overlay] Activated via message');
                    break;
                case 'OVERLAY_DEACTIVATE':
                    setIsActive(false);
                    setParticipants([]);
                    setLocalStream(null);
                    setMessages([]);
                    break;
                case 'PARTICIPANT_ADDED':
                    setParticipants((prev) => [...prev, message.participant]);
                    break;
                case 'PARTICIPANT_REMOVED':
                    setParticipants((prev) => prev.filter((p) => p.id !== message.participantId));
                    break;
                case 'LOCAL_STREAM':
                    setLocalStream(message.stream);
                    break;
                case 'PAUSE_FOR_AD':
                    setWaiting({
                        usersInAd: message.usersInAd || [],
                        elapsedSeconds: 0,
                    });
                    break;
                case 'RESUME_ALL':
                    setWaiting(null);
                    break;
                case 'CHAT_MESSAGE':
                    setMessages((prev) => [...prev, {
                        senderId: message.senderId,
                        senderName: message.senderName,
                        message: message.message,
                        timestamp: message.timestamp,
                    }]);
                    break;
                case 'REACTION':
                    setReactions((prev) => [...prev, {
                        id: `${message.senderId}-${message.timestamp}`,
                        senderId: message.senderId,
                        senderName: message.senderName,
                        emoji: message.emoji,
                        timestamp: message.timestamp,
                    }]);
                    break;
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    // Update waiting elapsed time
    useEffect(() => {
        if (!waiting) return;

        const interval = setInterval(() => {
            setWaiting((prev) =>
                prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : null
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [waiting]);

    // Control handlers
    const handleToggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
        chrome.runtime.sendMessage({ type: 'TOGGLE_MUTE' });
    }, []);

    const handleToggleCamera = useCallback(() => {
        setIsCameraOn((prev) => !prev);
        chrome.runtime.sendMessage({ type: 'TOGGLE_CAMERA' });
    }, []);

    const handleToggleFullscreen = useCallback(() => {
        setIsFullscreen((prev) => !prev);
        chrome.runtime.sendMessage({ type: 'TOGGLE_FULLSCREEN' });
    }, []);

    const handleEndSession = useCallback(() => {
        chrome.runtime.sendMessage({ type: 'END_SESSION' });
        setIsActive(false);
    }, []);

    const handleToggleChat = useCallback(() => {
        setIsChatOpen((prev) => !prev);
    }, []);

    const handleOpenReactions = useCallback(() => {
        setIsReactionPickerOpen((prev) => !prev);
    }, []);

    const handleSendMessage = useCallback((message: string) => {
        chrome.runtime.sendMessage({ type: 'SEND_CHAT', message });
    }, []);

    const handleSendReaction = useCallback((emoji: string) => {
        chrome.runtime.sendMessage({ type: 'SEND_REACTION', emoji });
    }, []);

    // Always log on every render
    console.log('[CouchGang Overlay] Rendering, isActive:', isActive);

    // DEBUG: Show a small indicator even when not active to confirm overlay is mounting
    if (!isActive) {
        return (
            <div style={{
                position: 'fixed',
                bottom: '10px',
                left: '10px',
                background: 'rgba(0,255,0,0.8)',
                color: 'black',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                zIndex: 2147483647,
                pointerEvents: 'auto',
            }}>
                CouchGang Overlay Loaded (Not in room)
            </div>
        );
    }

    return (
        <div className="cg-overlay-root">
            {/* Debug indicator when active */}
            <div style={{
                position: 'fixed',
                bottom: '10px',
                left: '10px',
                background: 'rgba(0,255,0,0.8)',
                color: 'black',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                zIndex: 2147483647,
            }}>
                CouchGang Overlay ACTIVE
            </div>

            {/* Local video bubble */}
            {localStream && (
                <VideoBubble
                    videoStream={localStream}
                    displayName="You"
                    isLocal
                    isMuted={isMuted}
                    size={100}
                    initialPosition={{ x: window.innerWidth - 130, y: window.innerHeight - 180 }}
                />
            )}

            {/* Remote participants */}
            {participants.map((participant, index) => (
                <VideoBubble
                    key={participant.id}
                    videoStream={participant.stream}
                    displayName={participant.displayName}
                    isMuted={participant.isMuted}
                    isSpeaking={participant.isSpeaking}
                    size={120}
                    initialPosition={{ x: 20, y: 20 + index * 140 }}
                />
            ))}

            {/* Control bar */}
            <ControlBar
                isMuted={isMuted}
                isCameraOn={isCameraOn}
                isFullscreen={isFullscreen}
                isChatOpen={isChatOpen}
                participantCount={participants.length + 1}
                onToggleMute={handleToggleMute}
                onToggleCamera={handleToggleCamera}
                onToggleFullscreen={handleToggleFullscreen}
                onToggleChat={handleToggleChat}
                onOpenReactions={handleOpenReactions}
                onEndSession={handleEndSession}
            />

            {/* Chat panel */}
            <ChatPanel
                messages={messages}
                onSendMessage={handleSendMessage}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
            />

            {/* Reaction picker */}
            <ReactionPicker
                isOpen={isReactionPickerOpen}
                onSelect={handleSendReaction}
                onClose={() => setIsReactionPickerOpen(false)}
            />

            {/* Reaction overlay (floating emojis) */}
            <ReactionOverlay reactions={reactions} />

            {/* Waiting for ad indicator */}
            {waiting && waiting.usersInAd.length > 0 && (
                <div className="cg-waiting-overlay">
                    <div className="cg-waiting-spinner" />
                    <div className="cg-waiting-text">
                        <div className="cg-waiting-title">
                            Waiting for {waiting.usersInAd.map((u) => u.displayName).join(', ')} to finish ad
                        </div>
                        <div className="cg-waiting-subtitle">
                            {waiting.elapsedSeconds}s elapsed
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CouchGangOverlay;


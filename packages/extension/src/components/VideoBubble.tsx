/**
 * VideoBubble Component
 * FaceTime-style draggable floating video circle
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { animateSpring, SPRING_CONFIGS, clamp } from '../lib/animations';
import './VideoBubble.css';

export interface VideoBubbleProps {
    videoStream?: MediaStream;
    displayName: string;
    isMuted?: boolean;
    isSpeaking?: boolean;
    isLocal?: boolean;
    size?: number;
    initialPosition?: { x: number; y: number };
    onPositionChange?: (position: { x: number; y: number }) => void;
}

export function VideoBubble({
    videoStream,
    displayName,
    isMuted = false,
    isSpeaking = false,
    isLocal = false,
    size = 120,
    initialPosition = { x: 20, y: 20 },
    onPositionChange,
}: VideoBubbleProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [position, setPosition] = useState(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

    // Attach video stream
    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream;
            videoRef.current.onloadeddata = () => setIsLoading(false);
        }
    }, [videoStream]);

    // Drag handlers with spring physics
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.x,
            posY: position.y,
        };
    }, [position]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;

        const newX = clamp(dragStartRef.current.posX + dx, 0, window.innerWidth - size);
        const newY = clamp(dragStartRef.current.posY + dy, 0, window.innerHeight - size);

        setPosition({ x: newX, y: newY });
    }, [isDragging, size]);

    const handleMouseUp = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);

        // Snap to nearest edge with spring animation
        const snapToEdge = () => {
            const centerX = position.x + size / 2;
            const targetX = centerX < window.innerWidth / 2 ? 20 : window.innerWidth - size - 20;

            animateSpring(
                position.x,
                targetX,
                SPRING_CONFIGS.gentle,
                (x) => {
                    setPosition((prev) => ({ ...prev, x }));
                }
            );
        };

        snapToEdge();
        onPositionChange?.(position);
    }, [isDragging, position, size, onPositionChange]);

    // Global mouse event listeners
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Touch handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        setIsDragging(true);
        dragStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            posX: position.x,
            posY: position.y,
        };
    }, [position]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isDragging) return;
        const touch = e.touches[0];

        const dx = touch.clientX - dragStartRef.current.x;
        const dy = touch.clientY - dragStartRef.current.y;

        const newX = clamp(dragStartRef.current.posX + dx, 0, window.innerWidth - size);
        const newY = clamp(dragStartRef.current.posY + dy, 0, window.innerHeight - size);

        setPosition({ x: newX, y: newY });
    }, [isDragging, size]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('touchmove', handleTouchMove);
            window.addEventListener('touchend', handleMouseUp);
        }
        return () => {
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging, handleTouchMove, handleMouseUp]);

    const initials = displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <div
            ref={containerRef}
            className={`cg-video-bubble ${isDragging ? 'is-dragging' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
            style={{
                width: size,
                height: size,
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            {/* Speaking indicator ring */}
            {isSpeaking && (
                <div className="cg-speaking-ring" />
            )}

            {/* Video element */}
            <video
                ref={videoRef}
                className="cg-video-element"
                autoPlay
                playsInline
                muted={isLocal}
                style={{ opacity: isLoading ? 0 : 1 }}
            />

            {/* Placeholder when no video or loading */}
            {(isLoading || !videoStream) && (
                <div className="cg-video-placeholder">
                    <span className="cg-initials">{initials}</span>
                </div>
            )}

            {/* Muted indicator */}
            {isMuted && (
                <div className="cg-muted-indicator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                </div>
            )}

            {/* Name label */}
            <div className="cg-name-label">
                <span>{isLocal ? 'You' : displayName}</span>
            </div>
        </div>
    );
}

export default VideoBubble;

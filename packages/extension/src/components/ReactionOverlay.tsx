/**
 * ReactionOverlay Component
 * Floating emoji reactions that animate and fade out
 */

import React, { useState, useEffect } from 'react';
import './ReactionOverlay.css';

export interface Reaction {
    id: string;
    senderId: string;
    senderName: string;
    emoji: string;
    timestamp: number;
}

export interface ReactionOverlayProps {
    reactions: Reaction[];
}

// Available reactions
export const REACTIONS = ['❤️', '😂', '👏', '🔥', '😮', '😢', '🎉'];

export function ReactionOverlay({ reactions }: ReactionOverlayProps) {
    const [visibleReactions, setVisibleReactions] = useState<Reaction[]>([]);

    // Add new reactions and auto-remove after animation
    useEffect(() => {
        if (reactions.length > 0) {
            const latest = reactions[reactions.length - 1];
            setVisibleReactions(prev => [...prev, latest]);

            // Remove after animation (3 seconds)
            const timeout = setTimeout(() => {
                setVisibleReactions(prev => prev.filter(r => r.id !== latest.id));
            }, 3000);

            return () => clearTimeout(timeout);
        }
    }, [reactions]);

    return (
        <div className="cg-reaction-overlay">
            {visibleReactions.map((reaction) => (
                <div
                    key={reaction.id}
                    className="cg-reaction-float"
                    style={{
                        // Random horizontal position
                        left: `${30 + Math.random() * 40}%`,
                    }}
                >
                    <span className="cg-reaction-emoji">{reaction.emoji}</span>
                    <span className="cg-reaction-sender">{reaction.senderName}</span>
                </div>
            ))}
        </div>
    );
}

export interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function ReactionPicker({ onSelect, isOpen, onClose }: ReactionPickerProps) {
    if (!isOpen) return null;

    return (
        <div className="cg-reaction-picker">
            {REACTIONS.map((emoji) => (
                <button
                    key={emoji}
                    className="cg-reaction-btn"
                    onClick={() => {
                        onSelect(emoji);
                        onClose();
                    }}
                >
                    {emoji}
                </button>
            ))}
        </div>
    );
}

export default ReactionOverlay;

/**
 * ChatPanel Component
 * Collapsible side panel for text chat
 */

import React, { useState, useRef, useEffect } from 'react';
import './ChatPanel.css';

export interface ChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: number;
}

export interface ChatPanelProps {
    messages: ChatMessage[];
    onSendMessage: (message: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function ChatPanel({ messages, onSendMessage, isOpen, onClose }: ChatPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim()) {
            onSendMessage(inputValue.trim());
            setInputValue('');
        }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (!isOpen) return null;

    return (
        <div className="cg-chat-panel">
            <div className="cg-chat-header">
                <span className="cg-chat-title">Chat</span>
                <button className="cg-chat-close" onClick={onClose}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className="cg-chat-messages">
                {messages.length === 0 ? (
                    <div className="cg-chat-empty">
                        No messages yet. Say hi! 👋
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div key={index} className="cg-message">
                            <div className="cg-message-header">
                                <span className="cg-message-sender">{msg.senderName}</span>
                                <span className="cg-message-time">{formatTime(msg.timestamp)}</span>
                            </div>
                            <div className="cg-message-content">{msg.message}</div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="cg-chat-input-container" onSubmit={handleSubmit}>
                <input
                    type="text"
                    className="cg-chat-input"
                    placeholder="Type a message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    maxLength={500}
                />
                <button type="submit" className="cg-chat-send" disabled={!inputValue.trim()}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </button>
            </form>
        </div>
    );
}

export default ChatPanel;

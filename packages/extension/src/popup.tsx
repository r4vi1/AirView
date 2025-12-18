/**
 * AirView Extension Popup
 * Main popup UI when clicking the extension icon
 */

import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import './popup.css';

function Popup() {
    const [roomId, setRoomId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [participants, setParticipants] = useState<number>(0);

    const serverUrl = 'http://localhost:3001';

    const createRoom = async () => {
        // Send message to background script to create room
        chrome.runtime.sendMessage({ type: 'CREATE_ROOM' }, (response) => {
            if (response?.roomId) {
                setRoomId(response.roomId);
                setIsConnected(true);
            }
        });
    };

    const leaveRoom = () => {
        chrome.runtime.sendMessage({ type: 'LEAVE_ROOM' });
        setRoomId(null);
        setIsConnected(false);
    };

    // Listen for updates from background
    useEffect(() => {
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'ROOM_UPDATE') {
                setParticipants(message.participants || 0);
            }
        });

        // Check if already in a room
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
            if (response?.roomId) {
                setRoomId(response.roomId);
                setIsConnected(true);
                setParticipants(response.participants || 0);
            }
        });
    }, []);

    const qrData = roomId
        ? JSON.stringify({ roomId, serverUrl, expiresAt: Date.now() + 300000 })
        : '';

    return (
        <div className="popup-container">
            <header className="popup-header">
                <h1>AirView</h1>
                <span className={`status ${isConnected ? 'connected' : ''}`}>
                    {isConnected ? '● Connected' : '○ Disconnected'}
                </span>
            </header>

            <main className="popup-main">
                {!isConnected ? (
                    <div className="action-section">
                        <p className="description">
                            Start a watch party and invite friends to join!
                        </p>
                        <button className="btn-primary" onClick={createRoom}>
                            Create Room
                        </button>
                    </div>
                ) : (
                    <div className="room-section">
                        <div className="room-info">
                            <span className="label">Room Code</span>
                            <span className="room-code">{roomId}</span>
                        </div>

                        <div className="qr-container">
                            <QRCode value={qrData} size={140} />
                            <p className="qr-hint">Scan with AirView mobile app</p>
                        </div>

                        <div className="participants">
                            <span>{participants} participant{participants !== 1 ? 's' : ''}</span>
                        </div>

                        <button className="btn-secondary" onClick={leaveRoom}>
                            Leave Room
                        </button>
                    </div>
                )}
            </main>

            <footer className="popup-footer">
                <small>BYOL: Use your own streaming account</small>
            </footer>
        </div>
    );
}

export default Popup;

/**
 * CouchGang Extension Popup
 * Main popup UI when clicking the extension icon
 */

import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import './popup.css';

function Popup() {
    const [roomId, setRoomId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [participants, setParticipants] = useState<number>(0);
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);

    const serverUrl = 'http://localhost:3001';

    const createRoom = async () => {
        setError(null);
        chrome.runtime.sendMessage({ type: 'CREATE_ROOM' }, (response) => {
            if (response?.roomId) {
                setRoomId(response.roomId);
                setIsConnected(true);
            } else {
                setError('Failed to create room. Is the server running?');
            }
        });
    };

    const joinRoom = async () => {
        if (!joinCode.trim()) {
            setError('Please enter a room code');
            return;
        }
        setError(null);
        setIsJoining(true);

        chrome.runtime.sendMessage({
            type: 'JOIN_ROOM',
            roomId: joinCode.toUpperCase().trim()
        }, (response) => {
            setIsJoining(false);
            if (response?.success) {
                setRoomId(joinCode.toUpperCase().trim());
                setIsConnected(true);
            } else {
                setError(response?.error || 'Room not found');
            }
        });
    };

    const leaveRoom = () => {
        chrome.runtime.sendMessage({ type: 'LEAVE_ROOM' });
        setRoomId(null);
        setIsConnected(false);
        setJoinCode('');
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
                <h1>CouchGang</h1>
                <span className={`status ${isConnected ? 'connected' : ''}`}>
                    {isConnected ? '● Connected' : '○ Disconnected'}
                </span>
            </header>

            <main className="popup-main">
                {!isConnected ? (
                    <div className="action-section">
                        <p className="description">
                            Watch together with friends in sync!
                        </p>

                        {/* Create Room */}
                        <button className="btn-primary" onClick={createRoom}>
                            Create Room
                        </button>

                        <div className="divider">
                            <span>or join a friend's room</span>
                        </div>

                        {/* Join Room */}
                        <div className="join-section">
                            <input
                                type="text"
                                className="room-input"
                                placeholder="Enter room code"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                                maxLength={6}
                            />
                            <button
                                className="btn-secondary"
                                onClick={joinRoom}
                                disabled={isJoining}
                            >
                                {isJoining ? 'Joining...' : 'Join'}
                            </button>
                        </div>

                        {error && <p className="error-message">{error}</p>}
                    </div>
                ) : (
                    <div className="room-section">
                        <div className="room-info">
                            <span className="label">Room Code</span>
                            <span className="room-code">{roomId}</span>
                        </div>

                        <div className="qr-container">
                            <QRCode value={qrData} size={140} />
                            <p className="qr-hint">Scan with CouchGang mobile app</p>
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


/**
 * CouchGang Signaling Server
 * Handles WebSocket connections for room management and playback sync
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket-handlers.js';
import { RoomManager } from './room-manager.js';

const PORT = process.env.PORT || 3001;

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: '*',  // Configure properly in production
        methods: ['GET', 'POST'],
    },
});

// Initialize room manager (in-memory store)
const roomManager = new RoomManager();

// Setup socket event handlers
setupSocketHandlers(io, roomManager);

// Start server
httpServer.listen(PORT, () => {
    console.log(`🚀 CouchGang Signaling Server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
});

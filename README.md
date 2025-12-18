# AirView - Universal Co-Viewing Ecosystem

A "Bring Your Own Login" (BYOL) utility that synchronizes playback control signals between users who are logged into their own premium streaming accounts.

## Packages

| Package | Description |
|---------|-------------|
| `@airview/extension` | Universal Browser Extension (Plasmo, Manifest V3) |
| `@airview/mobile` | React Native (Expo) Social Remote companion app |
| `@airview/server` | Node.js + Socket.io signaling server |
| `@airview/shared` | Shared TypeScript types and utilities |

## Quick Start

```bash
# Install dependencies
npm install

# Start all packages in dev mode
npm run dev

# Or start individual packages
npm run dev:extension  # Browser extension
npm run dev:mobile     # Mobile app
npm run dev:server     # Signaling server
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Philosophy

We do NOT stream copyrighted content. We synchronize:
- **Play/Pause** commands
- **Seek** timestamps
- **Video chat** overlay via WebRTC

Every user must have their own valid subscription to the streaming platform.

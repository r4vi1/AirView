#!/usr/bin/env tsx
/**
 * Manual E2E Test Script for Ad-Aware Sync
 * Simulates ad scenarios with WebSocket connections
 * 
 * Usage: npx tsx scripts/test-ad-sync.ts
 */

import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

interface TestClient {
    name: string;
    socket: Socket;
    roomId?: string;
}

function createClient(name: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER_URL);

        socket.on('connect', () => {
            console.log(`✅ ${name} connected: ${socket.id}`);
            resolve({ name, socket });
        });

        socket.on('connect_error', (err) => {
            reject(new Error(`${name} connection failed: ${err.message}`));
        });

        socket.on('pause_for_ad', (data) => {
            const names = data.usersInAd.map((u: any) => u.displayName).join(', ');
            console.log(`⏸️  ${name} received PAUSE_FOR_AD - waiting for: ${names}`);
        });

        socket.on('resume_all', (data) => {
            console.log(`▶️  ${name} received RESUME_ALL at ${data.timestamp}s`);
        });

        socket.on('ad_state_update', (data) => {
            console.log(`📺 ${name} received AD_STATE_UPDATE - ${data.usersInAd.length} users in ads`);
        });
    });
}

function createRoom(client: TestClient): Promise<string> {
    return new Promise((resolve) => {
        client.socket.emit('create_room', {
            userId: client.name,
            displayName: client.name,
        });

        client.socket.once('room_created', (data) => {
            console.log(`🏠 ${client.name} created room: ${data.roomId}`);
            client.roomId = data.roomId;
            resolve(data.roomId);
        });
    });
}

function joinRoom(client: TestClient, roomId: string): Promise<void> {
    return new Promise((resolve) => {
        client.socket.emit('join_room', {
            roomId,
            userId: client.name,
            deviceType: 'desktop',
            displayName: client.name,
        });

        client.socket.once('room_joined', () => {
            console.log(`👤 ${client.name} joined room: ${roomId}`);
            client.roomId = roomId;
            resolve();
        });
    });
}

function startAd(client: TestClient, estimatedDuration?: number) {
    console.log(`📺 ${client.name} starting ad...`);
    client.socket.emit('ad_started', { estimatedDuration });
}

function endAd(client: TestClient) {
    console.log(`📺 ${client.name} finishing ad...`);
    client.socket.emit('ad_finished', {});
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario1() {
    console.log('\n====================================');
    console.log('SCENARIO 1: Single User Ad Break');
    console.log('====================================\n');

    const host = await createClient('Host');
    const userA = await createClient('UserA');
    const userB = await createClient('UserB');

    const roomId = await createRoom(host);
    await joinRoom(userA, roomId);
    await joinRoom(userB, roomId);

    await sleep(500);

    // UserA gets an ad
    console.log('\n--- UserA enters ad ---');
    startAd(userA, 15000);
    await sleep(1000);

    // UserA's ad ends
    console.log('\n--- UserA finishes ad ---');
    endAd(userA);
    await sleep(500);

    // Cleanup
    host.socket.disconnect();
    userA.socket.disconnect();
    userB.socket.disconnect();

    console.log('\n✅ Scenario 1 Complete\n');
}

async function runScenario2() {
    console.log('\n====================================');
    console.log('SCENARIO 2: Staggered Ads');
    console.log('====================================\n');

    const host = await createClient('Host');
    const userA = await createClient('UserA');
    const userB = await createClient('UserB');

    const roomId = await createRoom(host);
    await joinRoom(userA, roomId);
    await joinRoom(userB, roomId);

    await sleep(500);

    // Both get ads
    console.log('\n--- Both users enter ads ---');
    startAd(userA, 10000);
    await sleep(200);
    startAd(userB, 20000);
    await sleep(1000);

    // UserA finishes first
    console.log('\n--- UserA finishes ad first ---');
    endAd(userA);
    await sleep(1000);

    // UserB finishes
    console.log('\n--- UserB finishes ad ---');
    endAd(userB);
    await sleep(500);

    // Cleanup
    host.socket.disconnect();
    userA.socket.disconnect();
    userB.socket.disconnect();

    console.log('\n✅ Scenario 2 Complete\n');
}

async function runScenario3() {
    console.log('\n====================================');
    console.log('SCENARIO 3: All Users In Ads');
    console.log('====================================\n');

    const host = await createClient('Host');
    const userA = await createClient('UserA');
    const userB = await createClient('UserB');

    const roomId = await createRoom(host);
    await joinRoom(userA, roomId);
    await joinRoom(userB, roomId);

    await sleep(500);

    // Everyone gets ads
    console.log('\n--- All users enter ads ---');
    startAd(host, 30000);
    await sleep(100);
    startAd(userA, 15000);
    await sleep(100);
    startAd(userB, 20000);
    await sleep(1000);

    // End in order
    console.log('\n--- UserA finishes first ---');
    endAd(userA);
    await sleep(500);

    console.log('\n--- UserB finishes ---');
    endAd(userB);
    await sleep(500);

    console.log('\n--- Host finishes last ---');
    endAd(host);
    await sleep(500);

    // Cleanup
    host.socket.disconnect();
    userA.socket.disconnect();
    userB.socket.disconnect();

    console.log('\n✅ Scenario 3 Complete\n');
}

async function main() {
    console.log('🧪 Ad-Aware Sync E2E Test Suite');
    console.log('================================');
    console.log('Make sure the server is running: npm run dev --prefix packages/server\n');

    try {
        await runScenario1();
        await runScenario2();
        await runScenario3();

        console.log('\n🎉 All E2E scenarios completed successfully!\n');
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();

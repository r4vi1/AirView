/**
 * Remote Control Screen
 * Big buttons to control playback on desktop
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSocket } from './scan';

export default function RemoteScreen() {
    const { roomId } = useLocalSearchParams<{ roomId: string }>();
    const [isPlaying, setIsPlaying] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const router = useRouter();

    const socket = getSocket();

    useEffect(() => {
        if (!socket) {
            Alert.alert('Not Connected', 'Please scan a QR code first.');
            router.replace('/');
            return;
        }

        setIsConnected(socket.connected);

        socket.on('connect', () => setIsConnected(true));
        socket.on('disconnect', () => setIsConnected(false));

        // Listen for sync state updates
        socket.on('sync_state', (data) => {
            setIsPlaying(data.playback?.isPlaying ?? false);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('sync_state');
        };
    }, [socket]);

    const sendCommand = (type: 'PLAY' | 'PAUSE') => {
        if (!socket || !roomId) return;

        socket.emit('remote_command', {
            type,
            roomId,
            senderId: socket.id,
        });

        setIsPlaying(type === 'PLAY');
    };

    const handleLeave = () => {
        socket?.emit('leave_room');
        socket?.disconnect();
        router.replace('/');
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.roomLabel}>Room</Text>
                <Text style={styles.roomCode}>{roomId}</Text>
                <View style={styles.statusContainer}>
                    <View
                        style={[
                            styles.statusDot,
                            { backgroundColor: isConnected ? '#22c55e' : '#ef4444' },
                        ]}
                    />
                    <Text style={styles.statusText}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                </View>
            </View>

            <View style={styles.controls}>
                {isPlaying ? (
                    <Pressable
                        style={[styles.controlButton, styles.pauseButton]}
                        onPress={() => sendCommand('PAUSE')}
                    >
                        <View style={styles.pauseIcon}>
                            <View style={styles.pauseBar} />
                            <View style={styles.pauseBar} />
                        </View>
                        <Text style={styles.controlText}>Pause</Text>
                    </Pressable>
                ) : (
                    <Pressable
                        style={[styles.controlButton, styles.playButton]}
                        onPress={() => sendCommand('PLAY')}
                    >
                        <View style={styles.playIcon} />
                        <Text style={styles.controlText}>Play</Text>
                    </Pressable>
                )}
            </View>

            <View style={styles.footer}>
                <Pressable style={styles.leaveButton} onPress={handleLeave}>
                    <Text style={styles.leaveText}>Leave Room</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0d0d0f',
        padding: 20,
    },
    header: {
        alignItems: 'center',
        paddingTop: 20,
    },
    roomLabel: {
        fontSize: 14,
        color: '#71717a',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    roomCode: {
        fontSize: 36,
        fontWeight: '700',
        color: '#6366f1',
        letterSpacing: 4,
        marginTop: 4,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusText: {
        fontSize: 14,
        color: '#a1a1aa',
    },
    controls: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlButton: {
        width: 200,
        height: 200,
        borderRadius: 100,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
    },
    playButton: {
        backgroundColor: '#6366f1',
        shadowColor: '#6366f1',
    },
    pauseButton: {
        backgroundColor: '#f59e0b',
        shadowColor: '#f59e0b',
    },
    playIcon: {
        width: 0,
        height: 0,
        borderLeftWidth: 50,
        borderTopWidth: 30,
        borderBottomWidth: 30,
        borderLeftColor: '#fff',
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        marginLeft: 15,
    },
    pauseIcon: {
        flexDirection: 'row',
        gap: 16,
    },
    pauseBar: {
        width: 16,
        height: 60,
        backgroundColor: '#fff',
        borderRadius: 4,
    },
    controlText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
        marginTop: 20,
    },
    footer: {
        alignItems: 'center',
        paddingBottom: 20,
    },
    leaveButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
    },
    leaveText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: '500',
    },
});

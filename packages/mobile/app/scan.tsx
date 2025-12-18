/**
 * QR Code Scanner Screen
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { io, Socket } from 'socket.io-client';

interface QRCodeData {
    roomId: string;
    serverUrl: string;
    expiresAt: number;
}

// Socket instance (shared across screens)
let socket: Socket | null = null;

export function getSocket(): Socket | null {
    return socket;
}

export default function ScanScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
        }
    }, [permission]);

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);

        try {
            const qrData: QRCodeData = JSON.parse(data);

            // Validate QR data
            if (!qrData.roomId || !qrData.serverUrl) {
                Alert.alert('Invalid QR Code', 'This is not a valid AirView room code.');
                setScanned(false);
                return;
            }

            // Check if expired
            if (qrData.expiresAt && Date.now() > qrData.expiresAt) {
                Alert.alert('Expired', 'This room code has expired. Ask the host to generate a new one.');
                setScanned(false);
                return;
            }

            // Connect to server
            socket = io(qrData.serverUrl, {
                transports: ['websocket'],
            });

            socket.on('connect', () => {
                socket?.emit('join_room', {
                    roomId: qrData.roomId,
                    userId: `mobile_${Date.now()}`,
                    deviceType: 'mobile',
                    displayName: 'Mobile User',
                });
            });

            socket.on('room_joined', () => {
                // Navigate to remote control screen
                router.replace({
                    pathname: '/remote',
                    params: { roomId: qrData.roomId },
                });
            });

            socket.on('error', (error) => {
                Alert.alert('Error', error.message || 'Failed to join room');
                socket?.disconnect();
                socket = null;
                setScanned(false);
            });
        } catch (e) {
            Alert.alert('Invalid QR Code', 'Could not parse the QR code data.');
            setScanned(false);
        }
    };

    if (!permission) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Requesting camera permission...</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Camera permission is required to scan QR codes.</Text>
                <Pressable style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            >
                <View style={styles.overlay}>
                    <View style={styles.scanArea}>
                        <View style={[styles.corner, styles.topLeft]} />
                        <View style={[styles.corner, styles.topRight]} />
                        <View style={[styles.corner, styles.bottomLeft]} />
                        <View style={[styles.corner, styles.bottomRight]} />
                    </View>
                    <Text style={styles.hint}>
                        Point camera at the QR code on your desktop
                    </Text>
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0d0d0f',
        justifyContent: 'center',
        alignItems: 'center',
    },
    camera: {
        flex: 1,
        width: '100%',
    },
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    scanArea: {
        width: 250,
        height: 250,
        backgroundColor: 'transparent',
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: '#6366f1',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
    },
    hint: {
        marginTop: 30,
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
    },
    message: {
        color: '#a1a1aa',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
        padding: 20,
    },
    button: {
        backgroundColor: '#6366f1',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

/**
 * Home Screen - Entry point for AirView Mobile
 */

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>AirView</Text>
                <Text style={styles.subtitle}>Social Remote</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.description}>
                    Join a watch party by scanning the QR code displayed on your desktop
                    extension.
                </Text>

                <Pressable
                    style={styles.primaryButton}
                    onPress={() => router.push('/scan')}
                >
                    <Text style={styles.buttonText}>Scan QR Code</Text>
                </Pressable>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    BYOL: Use your own streaming account
                </Text>
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
        marginTop: 40,
        marginBottom: 60,
    },
    title: {
        fontSize: 48,
        fontWeight: '800',
        color: '#6366f1',
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: 18,
        color: '#a1a1aa',
        marginTop: 8,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    description: {
        fontSize: 16,
        color: '#a1a1aa',
        textAlign: 'center',
        marginBottom: 40,
        lineHeight: 24,
        paddingHorizontal: 20,
    },
    primaryButton: {
        backgroundColor: '#6366f1',
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 12,
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    footer: {
        alignItems: 'center',
        paddingBottom: 20,
    },
    footerText: {
        fontSize: 12,
        color: '#52525b',
    },
});

/**
 * Root Layout for AirView Mobile App
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';

export default function RootLayout() {
    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: {
                        backgroundColor: '#0d0d0f',
                    },
                    headerTintColor: '#fff',
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                    contentStyle: {
                        backgroundColor: '#0d0d0f',
                    },
                }}
            >
                <Stack.Screen
                    name="index"
                    options={{
                        title: 'AirView',
                        headerShown: true,
                    }}
                />
                <Stack.Screen
                    name="scan"
                    options={{
                        title: 'Scan QR Code',
                        presentation: 'modal',
                    }}
                />
                <Stack.Screen
                    name="remote"
                    options={{
                        title: 'Remote Control',
                    }}
                />
            </Stack>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0d0d0f',
    },
});

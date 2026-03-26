import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';

import { RootNavigator } from './src/navigation/RootNavigator';
import { authAPI } from './src/services/api';

// Configurar cómo se muestran las notificaciones push en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const STRIPE_KEY = 'pk_test_CAMBIA_ESTO'; // → app.json extra.STRIPE_PUBLISHABLE_KEY

export default function App() {
  // Registrar token FCM al arrancar
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        try { await authAPI.setFcm(token); } catch {}
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={STRIPE_KEY} merchantIdentifier="merchant.com.cutgo">
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <RootNavigator />
          </QueryClientProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

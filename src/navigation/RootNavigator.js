import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { useAuthStore } from '../store/authStore';
import { LoadingScreen } from '../components/common';
import { colors, fonts } from '../constants/theme';

// Auth
import { LoginScreen, RegisterScreen }  from '../screens/shared/AuthScreens';
// Client
import { ClientHomeScreen }             from '../screens/client/HomeScreen';
import { NewBookingScreen }             from '../screens/client/NewBookingScreen';
import { BookingConfirmedScreen, BookingTrackingScreen } from '../screens/client/BookingScreens';
// Barber
import { BarberHomeScreen }             from '../screens/barber/BarberHomeScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Client tabs ───────────────────────────────────────────
const ClientTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: colors.black, borderTopColor: 'rgba(201,168,76,0.2)' },
      tabBarActiveTintColor: colors.gold,
      tabBarInactiveTintColor: colors.gray,
      tabBarLabelStyle: { fontSize: 10, ...fonts.bodyMed },
      tabBarIcon: ({ focused, color }) => {
        const icons = { Inicio: '✂', Reservas: '📋', Perfil: '👤' };
        return <Text style={{ fontSize: focused ? 20 : 18, color }}>{icons[route.name] || '•'}</Text>;
      },
    })}
  >
    <Tab.Screen name="Inicio"   component={ClientHomeScreen} />
    <Tab.Screen name="Reservas" component={ClientHomeScreen} />
    <Tab.Screen name="Perfil"   component={ClientHomeScreen} />
  </Tab.Navigator>
);

// ── Barber tabs ───────────────────────────────────────────
const BarberTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: colors.black, borderTopColor: 'rgba(201,168,76,0.2)' },
      tabBarActiveTintColor: colors.gold,
      tabBarInactiveTintColor: colors.gray,
      tabBarLabelStyle: { fontSize: 10, ...fonts.bodyMed },
      tabBarIcon: ({ focused, color }) => {
        const icons = { Home: '✂', Historial: '📋', Ganancias: '💰', Perfil: '👤' };
        return <Text style={{ fontSize: focused ? 20 : 18, color }}>{icons[route.name] || '•'}</Text>;
      },
    })}
  >
    <Tab.Screen name="Home"      component={BarberHomeScreen} options={{ title: 'Pedidos' }} />
    <Tab.Screen name="Historial" component={BarberHomeScreen} />
    <Tab.Screen name="Ganancias" component={BarberHomeScreen} />
    <Tab.Screen name="Perfil"    component={BarberHomeScreen} />
  </Tab.Navigator>
);

// ── Root navigator ────────────────────────────────────────
export const RootNavigator = () => {
  const { user, loading, hydrate } = useAuthStore();

  useEffect(() => { hydrate(); }, []);

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Auth stack
          <>
            <Stack.Screen name="Login"    component={LoginScreen}    />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.role === 'barber' ? (
          // Barber stack
          <>
            <Stack.Screen name="BarberTabs" component={BarberTabs} />
          </>
        ) : (
          // Client stack
          <>
            <Stack.Screen name="ClientTabs"      component={ClientTabs}             />
            <Stack.Screen name="NewBooking"       component={NewBookingScreen}       options={{ presentation: 'modal', headerShown: true, title: 'Nueva reserva', headerTintColor: colors.gold, headerStyle: { backgroundColor: colors.black } }} />
            <Stack.Screen name="BookingConfirmed" component={BookingConfirmedScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="BookingTracking"  component={BookingTrackingScreen}  options={{ headerShown: true, title: 'Seguimiento', headerTintColor: colors.gold, headerStyle: { backgroundColor: colors.black } }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useQuery, useMutation } from '@tanstack/react-query';
import { bookingsAPI } from '../../services/api';
import { connectSocket, joinUserRoom, getSocket } from '../../services/socket';
import { Button, Card, Badge } from '../../components/common';
import { colors, fonts, spacing, radius, shadows } from '../../constants/theme';

// ── BOOKING CONFIRMED ──────────────────────────────────────
export const BookingConfirmedScreen = ({ route, navigation }) => {
  const { bookingId, total } = route.params;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 60 }).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.confirmedContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale }] }]}>
          <Text style={styles.checkIcon}>✓</Text>
        </Animated.View>
        <Text style={styles.confirmedTitle}>¡Reserva confirmada!</Text>
        <Text style={styles.confirmedSub}>Tu barbero ha recibido el pedido y llegará pronto.</Text>

        <Card style={styles.confirmedCard}>
          <View style={styles.confirmedRow}>
            <Text style={styles.confirmedLabel}>Total pagado</Text>
            <Text style={styles.confirmedValue}>€{total}</Text>
          </View>
          <View style={styles.confirmedRow}>
            <Text style={styles.confirmedLabel}>Reserva</Text>
            <Text style={[styles.confirmedValue, { fontSize: 12 }]}>#{bookingId?.slice(-8).toUpperCase()}</Text>
          </View>
        </Card>

        <Button
          title="Seguir al barbero en vivo"
          onPress={() => navigation.replace('BookingTracking', { bookingId })}
          style={{ marginTop: spacing.xl }}
        />
        <Button
          title="Volver al inicio"
          variant="ghost"
          onPress={() => navigation.navigate('ClientTabs')}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </SafeAreaView>
  );
};

// ── BOOKING TRACKING ───────────────────────────────────────
export const BookingTrackingScreen = ({ route, navigation }) => {
  const { bookingId } = route.params;
  const [barberCoords, setBarberCoords] = useState(null);
  const [eta, setEta] = useState('~12 min');

  const { data: booking, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn:  () => bookingsAPI.getById(bookingId),
    refetchInterval: 10000, // Polling cada 10s como fallback
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingsAPI.updateStatus(bookingId, { status: 'cancelled', cancel_reason: 'Cancelado por el cliente' }),
    onSuccess: () => navigation.navigate('ClientTabs'),
    onError: (err) => Alert.alert('Error', err.message),
  });

  // Conectar socket para GPS en tiempo real
  useEffect(() => {
    let sock;
    (async () => {
      sock = await connectSocket();
      joinUserRoom();
      sock.on('barber:location:update', ({ barberId, lat, lng }) => {
        setBarberCoords({ latitude: lat, longitude: lng });
        setEta('~8 min'); // En producción calcular con Google Directions API
      });
      sock.on('booking:status', () => refetch());
    })();
    return () => { sock?.off('barber:location:update'); sock?.off('booking:status'); };
  }, []);

  const statusLabel = {
    pending:    { text: 'Buscando barbero...',    color: 'gold' },
    confirmed:  { text: 'Barbero confirmado',     color: 'gold' },
    on_the_way: { text: 'En camino hacia ti',     color: 'gold' },
    arrived:    { text: '¡Tu barbero llegó!',     color: 'green' },
    in_service: { text: 'Servicio en curso',      color: 'green' },
    completed:  { text: 'Servicio completado',    color: 'green' },
  }[booking?.status] || { text: 'Procesando...', color: 'gray' };

  const clientRegion = booking ? {
    latitude: parseFloat(booking.client_lat),
    longitude: parseFloat(booking.client_lng),
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  } : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Map */}
      <View style={styles.trackMapWrap}>
        {clientRegion ? (
          <MapView style={StyleSheet.absoluteFillObject} region={clientRegion}>
            {/* Ubicación del cliente */}
            <Marker coordinate={{ latitude: clientRegion.latitude, longitude: clientRegion.longitude }} title="Tu ubicación">
              <View style={styles.clientPin}><Text style={{ fontSize: 18 }}>🏠</Text></View>
            </Marker>
            {/* Ubicación del barbero en tiempo real */}
            {barberCoords && (
              <Marker coordinate={barberCoords} title="Tu barbero">
                <View style={styles.barberPin}><Text style={{ fontSize: 16, color: colors.gold }}>✂</Text></View>
              </Marker>
            )}
          </MapView>
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#d4ede8', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: colors.gray }}>Cargando mapa...</Text>
          </View>
        )}

        {/* ETA chip */}
        {barberCoords && (
          <View style={styles.etaChip}>
            <Text style={styles.etaText}>⏱ {eta}</Text>
          </View>
        )}
      </View>

      {/* Bottom sheet */}
      <View style={styles.trackSheet}>
        <View style={styles.trackHandle} />

        <View style={styles.trackStatusRow}>
          <Badge label={statusLabel.text} color={statusLabel.color} />
        </View>

        {booking && (
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.trackBarberRow}>
              <View style={styles.trackBarberAv}>
                <Text style={{ fontSize: 22, color: colors.gold }}>✂</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.trackBarberName}>{booking.barber_name || 'Barbero asignado'}</Text>
                <Text style={styles.trackBarberPhone}>{booking.barber_phone || ''}</Text>
              </View>
              <TouchableOpacity style={styles.callBtn}>
                <Text style={styles.callBtnText}>📞</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.trackRow}>
              <Text style={styles.trackRowLabel}>Servicio</Text>
              <Text style={styles.trackRowValue}>{booking.service_name}</Text>
            </View>
            <View style={styles.trackRow}>
              <Text style={styles.trackRowLabel}>Total</Text>
              <Text style={[styles.trackRowValue, { color: colors.gold }]}>€{booking.total}</Text>
            </View>
          </Card>
        )}

        {/* Cancel — solo si aún no llegó */}
        {['pending','confirmed'].includes(booking?.status) && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => Alert.alert('¿Cancelar reserva?', 'Esta acción no se puede deshacer.', [
              { text: 'No', style: 'cancel' },
              { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelMutation.mutate() },
            ])}
          >
            <Text style={styles.cancelBtnText}>Cancelar reserva</Text>
          </TouchableOpacity>
        )}

        {/* Calificar — si ya completó */}
        {booking?.status === 'completed' && (
          <Button
            title="Calificar servicio ★"
            onPress={() => navigation.navigate('ReviewScreen', { bookingId, barberId: booking.barber_id })}
            style={{ marginTop: spacing.md }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },

  // Confirmed
  confirmedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  checkCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  checkIcon: { fontSize: 48, color: colors.white },
  confirmedTitle: { fontSize: 26, ...fonts.heading, color: colors.black, marginBottom: spacing.sm },
  confirmedSub: { fontSize: 14, color: colors.gray, textAlign: 'center', marginBottom: spacing.xl },
  confirmedCard: { width: '100%' },
  confirmedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lightGray },
  confirmedLabel: { fontSize: 13, color: colors.gray },
  confirmedValue: { fontSize: 15, ...fonts.subhead, color: colors.black },

  // Tracking
  trackMapWrap: { flex: 1, backgroundColor: '#d4ede8' },
  clientPin:    { backgroundColor: colors.white, borderRadius: 20, padding: 4, ...shadows.card },
  barberPin:    { backgroundColor: colors.black, borderRadius: 20, padding: 6, borderWidth: 2, borderColor: colors.gold, ...shadows.strong },
  etaChip:      { position: 'absolute', top: spacing.lg, left: spacing.lg, backgroundColor: colors.black, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.gold },
  etaText:      { fontSize: 13, ...fonts.subhead, color: colors.gold },

  trackSheet:      { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl, ...shadows.strong },
  trackHandle:     { width: 40, height: 4, backgroundColor: colors.lightGray, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  trackStatusRow:  { alignItems: 'center', marginBottom: spacing.sm },
  trackBarberRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trackBarberAv:   { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  trackBarberName: { fontSize: 15, ...fonts.subhead, color: colors.black },
  trackBarberPhone:{ fontSize: 12, color: colors.gray },
  callBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldFaint, alignItems: 'center', justifyContent: 'center' },
  callBtnText:     { fontSize: 18 },
  trackRow:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.lightGray },
  trackRowLabel:   { fontSize: 13, color: colors.gray },
  trackRowValue:   { fontSize: 14, ...fonts.bodyMed, color: colors.black },

  cancelBtn:     { alignSelf: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  cancelBtnText: { fontSize: 13, color: colors.red, ...fonts.bodyMed },
});

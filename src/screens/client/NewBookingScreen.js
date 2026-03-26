import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Calendar } from 'react-native-calendars';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { barbersAPI, bookingsAPI } from '../../services/api';
import { Button, Card, Stars, Badge, SectionTitle } from '../../components/common';
import { colors, fonts, spacing, radius, shadows } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import * as Location from 'expo-location';

const TIME_SLOTS = ['09:00','09:30','10:00','10:30','11:00','12:00','14:00','15:30','16:00','17:00','18:30'];
const BOOKED_SLOTS = ['10:00', '15:30']; // En producción, vendrían del backend

export const NewBookingScreen = ({ route, navigation }) => {
  const { service } = route.params;
  const user = useAuthStore((s) => s.user);

  const [step, setStep]             = useState(1); // 1=servicio, 2=barbero, 3=fecha, 4=confirmar
  const [selectedBarber, setBarber] = useState(null);
  const [selectedDate, setDate]     = useState('');
  const [selectedTime, setTime]     = useState('');
  const [promoCode, setPromo]       = useState('');
  const [mapRegion, setRegion]      = useState({
    latitude: 40.4168, longitude: -3.7038,
    latitudeDelta: 0.01, longitudeDelta: 0.01,
  });
  const [clientCoords, setCoords]   = useState({ lat: 40.4168, lng: -3.7038 });
  const [address, setAddress]       = useState('Ubicación seleccionada');

  const { data: barbersData } = useQuery({
    queryKey: ['barbers-nearby'],
    queryFn: () => barbersAPI.nearby(clientCoords.lat, clientCoords.lng),
  });
  const barbers = barbersData?.barbers || [];

  const bookMutation = useMutation({
    mutationFn: (data) => bookingsAPI.create(data),
    onSuccess: (res) => {
      navigation.replace('BookingConfirmed', {
        bookingId: res.booking_id,
        clientSecret: res.client_secret,
        total: res.total,
      });
    },
    onError: (err) => Alert.alert('Error', err.message),
  });

  const handleMapPress = useCallback(async (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ lat: latitude, lng: longitude });
    setRegion((r) => ({ ...r, latitude, longitude }));
    // Reverse geocode
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      setAddress(`${place.street || ''} ${place.streetNumber || ''}, ${place.city || ''}`.trim());
    } catch { setAddress('Ubicación seleccionada'); }
  }, []);

  const confirm = () => {
    if (!selectedDate || !selectedTime) {
      return Alert.alert('Selecciona fecha y hora', 'Elige cuándo quieres el servicio.');
    }
    const [h, m] = selectedTime.split(':').map(Number);
    const dt = setMinutes(setHours(new Date(selectedDate), h), m);
    bookMutation.mutate({
      service_id:     service.id,
      scheduled_at:   dt.toISOString(),
      client_lat:     clientCoords.lat,
      client_lng:     clientCoords.lng,
      client_address: address,
      barber_id:      selectedBarber?.id || null,
      promo_code:     promoCode || undefined,
      payment_method: 'card',
    });
  };

  // Fechas mínima y máxima del calendario
  const today    = format(new Date(), 'yyyy-MM-dd');
  const maxDate  = format(addDays(new Date(), 30), 'yyyy-MM-dd');
  const markedDates = selectedDate ? { [selectedDate]: { selected: true, selectedColor: colors.gold } } : {};

  return (
    <SafeAreaView style={styles.safe}>
      {/* Steps indicator */}
      <View style={styles.stepsRow}>
        {['Servicio','Barbero','Fecha','Confirmar'].map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, step > i + 1 && styles.stepDone, step === i + 1 && styles.stepActive]}>
              <Text style={styles.stepDotText}>{step > i + 1 ? '✓' : i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === i + 1 && { color: colors.gold }]}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* STEP 1: Servicio seleccionado */}
        <Card style={styles.svcSummary}>
          <Text style={styles.svcSummaryIcon}>{iconFor(service.name)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.svcSummaryName}>{service.name}</Text>
            <Text style={styles.svcSummaryMeta}>{service.duration_min} min · {service.description}</Text>
          </View>
          <Text style={styles.svcSummaryPrice}>€{service.price}</Text>
        </Card>

        {/* STEP 2: Elige barbero */}
        <SectionTitle>Elige tu barbero</SectionTitle>
        {/* Opción auto */}
        <TouchableOpacity
          style={[styles.barberRow, !selectedBarber && styles.barberRowSelected]}
          onPress={() => setBarber(null)}
        >
          <View style={[styles.barberAv, { backgroundColor: colors.goldFaint }]}>
            <Text style={{ fontSize: 20 }}>⚡</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.barberName}>Barbero más cercano</Text>
            <Text style={styles.barberMeta}>Asignación automática · más rápido</Text>
          </View>
          {!selectedBarber && <View style={styles.checkDot} />}
        </TouchableOpacity>
        {barbers.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.barberRow, selectedBarber?.id === b.id && styles.barberRowSelected]}
            onPress={() => setBarber(b)}
          >
            <View style={styles.barberAv}>
              <Text style={{ fontSize: 22, color: colors.gold }}>✂</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.barberName}>{b.full_name}</Text>
              <Stars rating={b.rating} />
              <Text style={styles.barberMeta}>{b.total_cuts} cortes</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge label={b.is_online ? 'Online' : 'Ocupado'} color={b.is_online ? 'green' : 'gray'} />
              {selectedBarber?.id === b.id && <View style={styles.checkDot} />}
            </View>
          </TouchableOpacity>
        ))}

        {/* STEP 3: Mapa y fecha */}
        <SectionTitle>¿Dónde te atendemos?</SectionTitle>
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            region={mapRegion}
            onPress={handleMapPress}
            showsUserLocation
          >
            <Marker coordinate={{ latitude: clientCoords.lat, longitude: clientCoords.lng }} title="Mi ubicación" />
          </MapView>
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>📍 {address}</Text>
            <Text style={styles.mapOverlayHint}>Toca el mapa para ajustar la ubicación</Text>
          </View>
        </View>

        <SectionTitle>Elige fecha</SectionTitle>
        <View style={styles.calWrap}>
          <Calendar
            minDate={today}
            maxDate={maxDate}
            markedDates={markedDates}
            onDayPress={(d) => setDate(d.dateString)}
            theme={{
              calendarBackground: colors.white,
              textSectionTitleColor: colors.gray,
              selectedDayBackgroundColor: colors.gold,
              selectedDayTextColor: colors.black,
              todayTextColor: colors.gold,
              dayTextColor: colors.black,
              arrowColor: colors.gold,
              monthTextColor: colors.black,
              textDayFontWeight: '500',
            }}
          />
        </View>

        <SectionTitle>Elige hora</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotsRow}>
          {TIME_SLOTS.map((t) => {
            const booked = BOOKED_SLOTS.includes(t);
            return (
              <TouchableOpacity
                key={t}
                disabled={booked}
                onPress={() => setTime(t)}
                style={[styles.slot, selectedTime === t && styles.slotSelected, booked && styles.slotBooked]}
              >
                <Text style={[styles.slotText, selectedTime === t && { color: colors.black }, booked && { color: colors.gray, textDecorationLine: 'line-through' }]}>
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>€{service.price}</Text>
        </View>
        <Button
          title={bookMutation.isPending ? 'Reservando...' : 'Confirmar reserva'}
          onPress={confirm}
          loading={bookMutation.isPending}
          style={{ flex: 1, marginLeft: spacing.lg }}
        />
      </View>
    </SafeAreaView>
  );
};

const iconFor = (name = '') => {
  if (name.toLowerCase().includes('barba'))  return '🪒';
  if (name.toLowerCase().includes('ceja'))   return '👁';
  if (name.toLowerCase().includes('vip'))    return '👑';
  return '✂️';
};

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.cream },
  stepsRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.black },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepDot:    { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.mid, alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: colors.gold },
  stepDone:   { backgroundColor: colors.green },
  stepDotText: { fontSize: 11, color: colors.white, ...fonts.subhead },
  stepLabel:  { fontSize: 9, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4 },

  svcSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, margin: spacing.lg },
  svcSummaryIcon: { fontSize: 28 },
  svcSummaryName: { fontSize: 16, ...fonts.subhead, color: colors.black },
  svcSummaryMeta: { fontSize: 12, color: colors.gray, marginTop: 2 },
  svcSummaryPrice: { fontSize: 20, ...fonts.heading, color: colors.gold },

  barberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, borderColor: 'transparent', ...shadows.card },
  barberRowSelected: { borderColor: colors.gold, backgroundColor: '#fffbf0' },
  barberAv:  { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  barberName: { fontSize: 14, ...fonts.subhead, color: colors.black, marginBottom: 2 },
  barberMeta: { fontSize: 11, color: colors.gray },
  checkDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },

  mapWrap:   { marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', ...shadows.card },
  map:       { height: 180 },
  mapOverlay: { backgroundColor: colors.black, padding: spacing.md },
  mapOverlayText: { fontSize: 12, color: colors.white },
  mapOverlayHint: { fontSize: 11, color: colors.gray, marginTop: 2 },

  calWrap:   { marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', ...shadows.card },
  slotsRow:  { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  slot:      { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.lightGray, backgroundColor: colors.white },
  slotSelected: { backgroundColor: colors.black, borderColor: colors.black },
  slotBooked:   { opacity: 0.35 },
  slotText:  { fontSize: 12, color: colors.black, ...fonts.bodyMed },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.lightGray, ...shadows.strong },
  totalLabel: { fontSize: 11, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalPrice: { fontSize: 22, ...fonts.heading, color: colors.black },
});

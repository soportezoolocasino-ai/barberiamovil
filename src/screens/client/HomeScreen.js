/**
 * ClientHomeScreen
 *
 * Los 5 pilares implementados aquí:
 *  1. Motor de reservas — elige servicio → barbero → fecha → hora → confirma
 *     La hora desaparece del calendario en tiempo real al ser reservada.
 *  2. Perfil del Local — ficha con fotos, dirección + Google Maps, lista de precios
 *  3. Recordatorios automáticos — push 24h y 2h antes al confirmar reserva
 *  4. (Gestión de horarios — lado barbero, en BarberHomeScreen)
 *  5. Señal / pago — efectivo, Bizum, tarjeta o señal antiolvido 10 €
 *
 *  SIN precios hardcodeados. Todos los servicios/precios vienen del backend (el dueño
 *  los configura desde su panel). Solo se usan datos del API.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Alert, Linking,
  Modal, FlatList, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location    from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { barbersAPI, bookingsAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, spacing, radius } from '../../constants/theme';

// ── Slots de media hora (el backend filtra los ya ocupados) ──
const ALL_SLOTS = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00','19:30',
];

// ── Recordatorios push para el cliente ───────────────────────
const scheduleReminders = async (booking) => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const dt = new Date(`${booking.date}T${booking.time}:00`);

    const minus24 = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
    if (minus24 > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💈 Recuerda tu cita de mañana',
          body:  `Mañana a las ${booking.time} en ${booking.shop_name} — ${booking.service_names}`,
          data:  { bookingId: booking.id },
        },
        trigger: { date: minus24 },
      });
    }

    const minus2 = new Date(dt.getTime() - 2 * 60 * 60 * 1000);
    if (minus2 > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Tu cita es en 2 horas',
          body:  `A las ${booking.time} en ${booking.shop_name}. ¡No llegues tarde!`,
          data:  { bookingId: booking.id },
        },
        trigger: { date: minus2 },
      });
    }
  } catch (e) {
    console.warn('Recordatorios:', e);
  }
};

export const ClientHomeScreen = ({ navigation }) => {
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const qClient = useQueryClient();

  const [location, setLocation]             = useState(null);
  const [refreshing, setRefreshing]         = useState(false);

  // Flujo de reserva
  const [selectedServices, setSelectedServices] = useState([]); // objetos del API
  const [selectedBarber,   setSelectedBarber]   = useState(null);
  const [selectedDate,     setSelectedDate]     = useState(null);
  const [selectedSlot,     setSelectedSlot]     = useState(null);
  const [paymentMethod,    setPaymentMethod]     = useState(null);
  const [bookingLoading,   setBookingLoading]   = useState(false);

  // Modales
  const [showProfile,     setShowProfile]     = useState(false);
  const [showBarbers,     setShowBarbers]     = useState(false);
  const [showShopProfile, setShowShopProfile] = useState(false);
  const [showPayment,     setShowPayment]     = useState(false);
  const [viewingShop,     setViewingShop]     = useState(null);

  // ── Permisos de ubicación ──────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc);
    })();
  }, []);

  // ── Queries ────────────────────────────────────────────────
  const { data: barbersData, refetch: refetchBarbers } = useQuery({
    queryKey: ['barbers', location?.coords],
    queryFn:  () => barbersAPI.nearby(location.coords.latitude, location.coords.longitude),
    enabled:  !!location,
  });

  // Servicios del barbero seleccionado (los pone él desde su panel)
  const { data: servicesData } = useQuery({
    queryKey: ['services', selectedBarber?.id],
    queryFn:  () => barbersAPI.services(selectedBarber.id),
    enabled:  !!selectedBarber,
  });

  // Slots ya ocupados para barbero + fecha
  const { data: takenData } = useQuery({
    queryKey: ['slots', selectedBarber?.id, selectedDate?.toISOString().split('T')[0]],
    queryFn:  () => bookingsAPI.getTakenSlots(
      selectedBarber.id,
      selectedDate.toISOString().split('T')[0]
    ),
    enabled:  !!selectedBarber && !!selectedDate,
    refetchInterval: 15000, // refresca cada 15 s para que los slots desaparezcan en tiempo real
  });

  const barbers   = barbersData?.barbers  || [];
  const services  = servicesData?.services || [];
  const takenSlots = takenData?.taken      || [];
  const firstName = user?.name?.split(' ')[0] || 'Cliente';

  // ── Calendario próximos 14 días ───────────────────────────
  const today = new Date();
  const days  = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  // ── Slots disponibles (excluye ocupados y fuera de horario) ──
  const availableSlots = ALL_SLOTS.filter((slot) => {
    if (takenSlots.includes(slot)) return false;
    if (selectedBarber?.schedule && selectedDate) {
      const dayKey = selectedDate.toLocaleDateString('es-ES', { weekday: 'short' })
        .replace('.', '').slice(0, 3);
      const sched = selectedBarber.schedule[dayKey];
      if (!sched?.active) return false;
      if (slot < sched.from || slot > sched.to) return false;
      if (sched.blockedSlots?.includes(slot)) return false;
    }
    return true;
  });

  // ── Totales ───────────────────────────────────────────────
  const subtotal   = selectedServices.reduce((a, s) => a + (s.price || 0), 0);
  const totalDur   = selectedServices.reduce((a, s) => a + (s.duration || 0), 0);
  const totalPrice = subtotal.toFixed(2);

  // ── Toggle servicio ───────────────────────────────────────
  const toggleService = (svc) => {
    setSelectedServices((prev) =>
      prev.find((s) => s.id === svc.id)
        ? prev.filter((s) => s.id !== svc.id)
        : [...prev, svc]
    );
    setSelectedSlot(null); // resetear hora al cambiar duración
  };

  // ── Confirmar reserva ─────────────────────────────────────
  const handleReservePress = () => {
    if (!selectedServices.length) return Alert.alert('Servicio', 'Elige al menos un servicio.');
    if (!selectedBarber)          return Alert.alert('Barbero',  'Elige un barbero.');
    if (!selectedDate)            return Alert.alert('Fecha',    'Elige una fecha.');
    if (!selectedSlot)            return Alert.alert('Hora',     'Elige una hora disponible.');
    setShowPayment(true);
  };

  const doConfirmBooking = async () => {
    if (!paymentMethod) return Alert.alert('Pago', 'Elige un método de pago.');
    setBookingLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const payload = {
        barber_id:      selectedBarber.id,
        service_ids:    selectedServices.map((s) => s.id),
        service_names:  selectedServices.map((s) => s.name).join(' + '),
        date:           dateStr,
        time:           selectedSlot,
        total:          parseFloat(totalPrice),
        duration:       totalDur,
        payment_method: paymentMethod,
        deposit_amount: paymentMethod === 'deposit' ? 10 : 0,
        shop_name:      selectedBarber.shop_name || selectedBarber.name,
      };

      const result = await bookingsAPI.create(payload);

      // Programar recordatorios para el cliente
      await scheduleReminders({ ...payload, id: result.booking?.id });

      // Invalidar slots → hora desaparece del calendario en tiempo real
      qClient.invalidateQueries(['slots', selectedBarber.id, dateStr]);

      setShowPayment(false);
      setBookingLoading(false);

      Alert.alert(
        '✅ Reserva confirmada',
        `${payload.service_names}\n${selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${selectedSlot}\nCon ${selectedBarber.name}\n\nRecibirás recordatorios 24h y 2h antes 🔔`,
        [{ text: 'Perfecto' }]
      );

      // Reset
      setSelectedServices([]);
      setSelectedBarber(null);
      setSelectedDate(null);
      setSelectedSlot(null);
      setPaymentMethod(null);
    } catch (err) {
      setBookingLoading(false);
      Alert.alert('Error al reservar', err?.message || 'Inténtalo de nuevo.');
    }
  };

  const confirmWithDeposit = () => {
    Alert.alert(
      '💳 Señal antiolvido — 10 €',
      'Se retiene 10 € en tu tarjeta. Si no apareces o cancelas con menos de 2 horas, se cobra automáticamente como penalización.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar y reservar', onPress: doConfirmBooking },
      ]
    );
  };

  const confirmBooking = () => {
    if (!paymentMethod) return Alert.alert('Pago', 'Elige un método de pago.');
    if (paymentMethod === 'deposit') { confirmWithDeposit(); return; }
    doConfirmBooking();
  };

  const onRefresh = async () => { setRefreshing(true); await refetchBarbers(); setRefreshing(false); };

  // ── Render ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {firstName} 👋</Text>
            <Text style={styles.subtitle}>
              {barbers.filter((b) => b.is_online).length > 0
                ? `${barbers.filter((b) => b.is_online).length} barbero${barbers.filter((b) => b.is_online).length > 1 ? 's' : ''} disponible${barbers.filter((b) => b.is_online).length > 1 ? 's' : ''}`
                : 'Encuentra tu barbería'}
            </Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => setShowProfile(true)}>
            <Text style={styles.avatarInitial}>{user?.name?.[0] || '?'}</Text>
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════════════════════════════
            PASO 1 — ELIGE TU BARBERO
        ══════════════════════════════════════════════════ */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, selectedBarber && styles.stepBadgeDone]}>
            <Text style={styles.stepBadgeText}>{selectedBarber ? '✓' : '1'}</Text>
          </View>
          <Text style={styles.stepTitle}>Elige tu barbero</Text>
          {barbers.length > 3 && (
            <TouchableOpacity onPress={() => setShowBarbers(true)}>
              <Text style={styles.seeAll}>Ver todos →</Text>
            </TouchableOpacity>
          )}
        </View>

        {barbers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyText}>No hay barberos disponibles</Text>
            <Text style={styles.emptyHint}>Desliza hacia abajo para actualizar</Text>
          </View>
        ) : (
          barbers.slice(0, 3).map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.barberCard, selectedBarber?.id === b.id && styles.barberCardSelected]}
              onPress={() => { setSelectedBarber(b); setSelectedSlot(null); setSelectedServices([]); }}
            >
              <View style={styles.barberAvatar}>
                <Text style={styles.barberAvatarText}>{b.name?.[0] || '✂'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.barberName}>{b.name}</Text>
                <Text style={styles.barberMeta}>⭐ {b.rating || '5.0'} · {b.total_cuts || 0} cortes</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {b.is_online
                  ? <View style={styles.onlineBadge}><Text style={styles.onlineBadgeText}>● Online</Text></View>
                  : <Text style={styles.offlineText}>Offline</Text>
                }
                <TouchableOpacity onPress={() => { setViewingShop(b); setShowShopProfile(true); }}>
                  <Text style={styles.viewShopLink}>Ver local →</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* ══════════════════════════════════════════════════
            PASO 2 — ELIGE TU SERVICIO
            (solo aparece cuando hay barbero seleccionado;
             servicios y precios vienen del API del dueño)
        ══════════════════════════════════════════════════ */}
        {selectedBarber && (
          <>
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, selectedServices.length > 0 && styles.stepBadgeDone]}>
                <Text style={styles.stepBadgeText}>{selectedServices.length > 0 ? '✓' : '2'}</Text>
              </View>
              <Text style={styles.stepTitle}>Elige el servicio</Text>
            </View>

            {services.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Cargando servicios...</Text>
              </View>
            ) : (
              services.map((svc) => {
                const isSel = !!selectedServices.find((s) => s.id === svc.id);
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.svcRow, isSel && styles.svcRowSelected]}
                    onPress={() => toggleService(svc)}
                  >
                    <Text style={styles.svcIcon}>{svc.icon || '✂️'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.svcName, isSel && { color: colors.gold }]}>{svc.name}</Text>
                      <Text style={styles.svcDur}>{svc.duration} min</Text>
                    </View>
                    <Text style={[styles.svcPrice, isSel && { color: colors.gold }]}>€{svc.price}</Text>
                    <View style={[styles.checkbox, isSel && styles.checkboxActive]}>
                      {isSel && <Text style={{ color: colors.black, fontSize: 11 }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {selectedServices.length > 0 && (
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total · {totalDur} min</Text>
                <Text style={styles.totalVal}>€{totalPrice}</Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════
            PASO 3 — ELIGE FECHA
        ══════════════════════════════════════════════════ */}
        {selectedBarber && selectedServices.length > 0 && (
          <>
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, selectedDate && styles.stepBadgeDone]}>
                <Text style={styles.stepBadgeText}>{selectedDate ? '✓' : '3'}</Text>
              </View>
              <Text style={styles.stepTitle}>Elige el día</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
              {days.map((d, i) => {
                const isSel   = selectedDate?.toDateString() === d.toDateString();
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayBtn, isSel && styles.dayBtnSelected]}
                    onPress={() => { setSelectedDate(d); setSelectedSlot(null); }}
                  >
                    <Text style={[styles.dayName, isSel && { color: colors.black }]}>
                      {isToday ? 'HOY' : d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.','').toUpperCase()}
                    </Text>
                    <Text style={[styles.dayNum, isSel && { color: colors.black }]}>{d.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            PASO 4 — ELIGE HORA
            Las horas ocupadas aparecen tachadas y no se
            pueden tocar. Desaparecen en tiempo real.
        ══════════════════════════════════════════════════ */}
        {selectedBarber && selectedDate && selectedServices.length > 0 && (
          <>
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, selectedSlot && styles.stepBadgeDone]}>
                <Text style={styles.stepBadgeText}>{selectedSlot ? '✓' : '4'}</Text>
              </View>
              <Text style={styles.stepTitle}>Elige la hora</Text>
            </View>

            {availableSlots.length === 0 && takenSlots.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No hay horas disponibles este día</Text>
              </View>
            ) : (
              <>
                <View style={styles.slotsGrid}>
                  {ALL_SLOTS.map((slot) => {
                    const isTaken   = takenSlots.includes(slot) || !availableSlots.includes(slot);
                    const isSel     = selectedSlot === slot;
                    if (isTaken) {
                      return (
                        <View key={slot} style={[styles.slotBtn, styles.slotBtnTaken]}>
                          <Text style={styles.slotTextTaken}>{slot}</Text>
                        </View>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={slot}
                        style={[styles.slotBtn, isSel && styles.slotBtnSelected]}
                        onPress={() => setSelectedSlot(slot)}
                      >
                        <Text style={[styles.slotText, isSel && styles.slotTextSelected]}>{slot}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.legend}>
                  <View style={[styles.legendDot, { backgroundColor: colors.gold }]} />
                  <Text style={styles.legendText}>Libre</Text>
                  <View style={[styles.legendDot, { backgroundColor: '#ddd', marginLeft: 12 }]} />
                  <Text style={styles.legendText}>Ocupado</Text>
                </View>
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════
            RESUMEN + BOTÓN CONFIRMAR
        ══════════════════════════════════════════════════ */}
        {selectedBarber && selectedDate && selectedSlot && selectedServices.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Tu reserva</Text>
            {[
              ['Servicio',  selectedServices.map((s) => s.name).join(' + ')],
              ['Barbero',   selectedBarber.name],
              ['Fecha',     selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })],
              ['Hora',      selectedSlot],
              ['Total',     `€${totalPrice}`],
            ].map(([k, v]) => (
              <View key={k} style={styles.summaryRow}>
                <Text style={styles.summaryKey}>{k}</Text>
                <Text style={[styles.summaryVal, k === 'Total' && { color: colors.gold, fontSize: 17 }]}>{v}</Text>
              </View>
            ))}
          </View>
        )}

        {selectedBarber && (
          <TouchableOpacity
            style={[
              styles.reserveBtn,
              (!selectedDate || !selectedSlot || !selectedServices.length) && styles.reserveBtnDisabled,
            ]}
            onPress={handleReservePress}
          >
            <Text style={styles.reserveBtnText}>
              {!selectedServices.length ? 'Elige un servicio ↑'
                : !selectedDate ? 'Elige una fecha ↑'
                : !selectedSlot ? 'Elige una hora ↑'
                : `✓ Confirmar reserva — €${totalPrice}`}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xxl * 3 }} />
      </ScrollView>

      {/* FAB WhatsApp */}
      <TouchableOpacity style={styles.fab} onPress={() => Linking.openURL('https://wa.me/34600000000')}>
        <Text style={styles.fabText}>💬</Text>
      </TouchableOpacity>

      {/* ════════════════════════════════════════════════════
          MODAL — PAGO / SEÑAL
      ════════════════════════════════════════════════════ */}
      <Modal visible={showPayment} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowPayment(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Método de pago</Text>
          <Text style={styles.sheetSub}>Reserva de €{totalPrice}</Text>

          {[
            { id: 'cash',    icon: '💵', title: 'Efectivo en el local',       sub: 'Paga directamente al barbero' },
            { id: 'bizum',   icon: '📱', title: 'Bizum',                       sub: 'Transferencia inmediata al número del local' },
            { id: 'card',    icon: '💳', title: 'Tarjeta de crédito/débito',   sub: 'Pago seguro online' },
            { id: 'deposit', icon: '🔒', title: 'Señal antiolvido — 10 €',     sub: 'Se retiene 10 € como garantía. Si no apareces, se cobra automáticamente.' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.payOpt, paymentMethod === opt.id && styles.payOptSelected, opt.id === 'deposit' && styles.payOptDeposit]}
              onPress={() => setPaymentMethod(opt.id)}
            >
              <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.payOptTitle}>{opt.title}</Text>
                <Text style={styles.payOptSub}>{opt.sub}</Text>
              </View>
              {paymentMethod === opt.id && <Text style={{ color: colors.gold }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.confirmBtn, (!paymentMethod || bookingLoading) && styles.confirmBtnOff]}
            onPress={confirmBooking}
            disabled={!paymentMethod || bookingLoading}
          >
            <Text style={styles.confirmBtnText}>{bookingLoading ? 'Confirmando...' : `Reservar — €${totalPrice}`}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowPayment(false)} style={styles.cancelLink}>
            <Text style={{ color: colors.gray }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL — PERFIL DEL LOCAL
          Punto 2: ficha con dirección, Google Maps,
          fotos del local, fotos de cortes y precios.
      ════════════════════════════════════════════════════ */}
      <Modal visible={showShopProfile} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowShopProfile(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { maxHeight: '92%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Cabecera */}
            <View style={styles.shopHead}>
              <View style={styles.shopAvatar}>
                <Text style={styles.shopAvatarText}>{viewingShop?.name?.[0] || '✂'}</Text>
              </View>
              <Text style={styles.shopName}>{viewingShop?.shop_name || viewingShop?.name}</Text>
              <Text style={styles.shopMeta}>⭐ {viewingShop?.rating || '5.0'} · {viewingShop?.total_cuts || 0} cortes</Text>
            </View>

            {/* Dirección + Google Maps */}
            {viewingShop?.address && (
              <TouchableOpacity
                style={styles.mapsBtn}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(viewingShop.address)}`)}
              >
                <Text style={{ fontSize: 18 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mapsAddress}>{viewingShop.address}</Text>
                  <Text style={styles.mapsLink}>Abrir en Google Maps →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Bio */}
            {viewingShop?.bio && (
              <Text style={styles.shopBio}>{viewingShop.bio}</Text>
            )}

            {/* Fotos del local */}
            <Text style={styles.shopSection}>📸 Fotos del local</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              {(viewingShop?.shop_photos?.length > 0 ? viewingShop.shop_photos : [1,2,3]).map((item, i) => (
                <View key={i} style={styles.photoCard}>
                  <Text style={{ fontSize: 28 }}>🏠</Text>
                </View>
              ))}
            </ScrollView>

            {/* Fotos de cortes */}
            <Text style={styles.shopSection}>✂️ Trabajos recientes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              {(viewingShop?.work_photos?.length > 0 ? viewingShop.work_photos : [1,2,3,4]).map((item, i) => (
                <View key={i} style={styles.photoCard}>
                  <Text style={{ fontSize: 28 }}>💈</Text>
                </View>
              ))}
            </ScrollView>

            {/* Lista de precios (del API, no hardcodeada) */}
            <Text style={styles.shopSection}>💰 Servicios y precios</Text>
            {(viewingShop?.services || []).length === 0 ? (
              <Text style={styles.emptyText}>Cargando precios...</Text>
            ) : (
              viewingShop.services.map((svc) => (
                <View key={svc.id} style={styles.priceRow}>
                  <Text style={styles.priceName}>{svc.icon || '✂️'} {svc.name}</Text>
                  <Text style={styles.priceDur}>{svc.duration} min</Text>
                  <Text style={styles.priceVal}>€{svc.price}</Text>
                </View>
              ))
            )}

          </ScrollView>

          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => { setSelectedBarber(viewingShop); setSelectedSlot(null); setSelectedServices([]); setShowShopProfile(false); }}
          >
            <Text style={styles.selectBtnText}>✓ Reservar con este barbero</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowShopProfile(false)} style={styles.cancelLink}>
            <Text style={{ color: colors.gray }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL — TODOS LOS BARBEROS
      ════════════════════════════════════════════════════ */}
      <Modal visible={showBarbers} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowBarbers(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { maxHeight: '70%' }]}>
          <Text style={styles.sheetTitle}>Todos los barberos</Text>
          <FlatList
            data={barbers}
            keyExtractor={(b) => String(b.id)}
            renderItem={({ item: b }) => (
              <TouchableOpacity
                style={styles.barberCard}
                onPress={() => { setSelectedBarber(b); setSelectedSlot(null); setSelectedServices([]); setShowBarbers(false); }}
              >
                <View style={styles.barberAvatar}><Text style={styles.barberAvatarText}>{b.name?.[0] || '✂'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.barberName}>{b.name}</Text>
                  <Text style={styles.barberMeta}>⭐ {b.rating || '5.0'} · {b.total_cuts || 0} cortes</Text>
                </View>
                {b.is_online
                  ? <View style={styles.onlineBadge}><Text style={styles.onlineBadgeText}>● Online</Text></View>
                  : <Text style={styles.offlineText}>Offline</Text>
                }
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No hay barberos registrados aún</Text>}
          />
          <TouchableOpacity onPress={() => setShowBarbers(false)} style={styles.cancelLink}>
            <Text style={{ color: colors.gray }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL — PERFIL USUARIO
      ════════════════════════════════════════════════════ */}
      <Modal visible={showProfile} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowProfile(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user?.name?.[0] || '?'}</Text></View>
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          {[
            { label: '👤 Mi perfil',    route: 'Profile' },
            { label: '📋 Mis reservas', route: 'Bookings' },
          ].map(({ label, route }) => (
            <TouchableOpacity key={route} style={styles.profileItem} onPress={() => { setShowProfile(false); navigation.navigate(route); }}>
              <Text style={styles.profileItemText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.profileItem, { borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: spacing.md }]} onPress={() => { logout(); setShowProfile(false); }}>
            <Text style={[styles.profileItemText, { color: 'red' }]}>🚪 Cerrar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowProfile(false)} style={styles.cancelLink}>
            <Text style={{ color: colors.gray }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.cream || '#f5f0e8' },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  greeting:{ fontSize: 22, ...fonts.heading, color: colors.black },
  subtitle:{ fontSize: 13, color: colors.gray, marginTop: 2 },
  avatarBtn:     { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, color: colors.gold, ...fonts.heading },

  // Step headers
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  stepBadge:  { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center' },
  stepBadgeDone:  { backgroundColor: colors.gold },
  stepBadgeText:  { fontSize: 13, color: colors.black, ...fonts.bodyMed },
  stepTitle:  { fontSize: 16, ...fonts.subhead, color: colors.black, flex: 1 },
  seeAll:     { fontSize: 12, color: colors.gold },

  // Barberos
  barberCard:         { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white || '#fff', marginHorizontal: spacing.lg, marginBottom: 8, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, borderColor: 'transparent' },
  barberCardSelected: { borderColor: colors.gold, backgroundColor: '#fffbf0' },
  barberAvatar:       { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  barberAvatarText:   { fontSize: 20, color: colors.gold },
  barberName:         { fontSize: 14, ...fonts.subhead, color: colors.black },
  barberMeta:         { fontSize: 11, color: colors.gray, marginTop: 2 },
  onlineBadge:        { backgroundColor: '#e8f5e9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  onlineBadgeText:    { fontSize: 11, color: '#2e7d32', ...fonts.bodyMed },
  offlineText:        { fontSize: 11, color: colors.gray },
  viewShopLink:       { fontSize: 11, color: colors.gold },

  // Servicios
  svcRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white || '#fff', marginHorizontal: spacing.lg, marginBottom: 8, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1.5, borderColor: 'transparent' },
  svcRowSelected: { borderColor: colors.gold, backgroundColor: '#fffbf0' },
  svcIcon:        { fontSize: 22 },
  svcName:        { fontSize: 14, ...fonts.subhead, color: colors.black },
  svcDur:         { fontSize: 11, color: colors.gray, marginTop: 2 },
  svcPrice:       { fontSize: 15, ...fonts.heading, color: colors.black, marginRight: spacing.sm },
  checkbox:       { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.gold, borderColor: colors.gold },

  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.black, borderRadius: radius.lg, padding: spacing.md, paddingHorizontal: spacing.lg },
  totalLabel:{ fontSize: 13, color: colors.gray },
  totalVal:  { fontSize: 20, ...fonts.heading, color: colors.gold },

  // Calendario
  daysRow:        { paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.sm },
  dayBtn:         { width: 52, height: 64, borderRadius: radius.md, backgroundColor: colors.white || '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  dayBtnSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  dayName:        { fontSize: 10, color: colors.gray, ...fonts.bodyMed },
  dayNum:         { fontSize: 20, ...fonts.heading, color: colors.black, marginTop: 2 },

  // Slots
  slotsGrid:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: 8, marginBottom: spacing.sm },
  slotBtn:          { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.white || '#fff', borderWidth: 1.5, borderColor: '#ddd', minWidth: 70, alignItems: 'center' },
  slotBtnSelected:  { backgroundColor: colors.gold, borderColor: colors.gold },
  slotBtnTaken:     { backgroundColor: '#f5f5f5', borderColor: '#eee' },
  slotText:         { fontSize: 13, color: colors.black, ...fonts.bodyMed },
  slotTextSelected: { color: colors.black },
  slotTextTaken:    { fontSize: 13, color: '#bbb', textDecorationLine: 'line-through' },
  legend:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.sm, gap: 6 },
  legendDot:        { width: 10, height: 10, borderRadius: 5 },
  legendText:       { fontSize: 11, color: colors.gray },

  // Resumen
  summaryCard:  { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.white || '#fff', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1.5, borderColor: colors.gold },
  summaryTitle: { fontSize: 13, ...fonts.subhead, color: colors.black, marginBottom: spacing.sm },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryKey:   { fontSize: 13, color: colors.gray },
  summaryVal:   { fontSize: 13, ...fonts.bodyMed, color: colors.black, flex: 1, textAlign: 'right' },

  // Botón reservar
  reserveBtn:         { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.black, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1.5, borderColor: colors.gold },
  reserveBtnDisabled: { backgroundColor: '#f0f0f0', borderColor: '#ccc' },
  reserveBtnText:     { fontSize: 15, ...fonts.heading, color: colors.gold },

  // FAB
  fab:     { position: 'absolute', bottom: 30, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { fontSize: 28 },

  // Empties
  emptyCard:  { marginHorizontal: spacing.lg, alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 32 },
  emptyText:  { fontSize: 13, color: colors.gray, marginTop: 4, textAlign: 'center' },
  emptyHint:  { fontSize: 11, color: colors.gray, marginTop: 2 },

  // Modales
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:   { backgroundColor: colors.white || '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, ...fonts.heading, color: colors.black, marginBottom: 4 },
  sheetSub:   { fontSize: 13, color: colors.gray, marginBottom: spacing.lg },

  // Pago
  payOpt:         { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#e0e0e0', marginBottom: spacing.sm },
  payOptSelected: { borderColor: colors.gold, backgroundColor: '#fffbf0' },
  payOptDeposit:  { borderColor: 'rgba(201,168,76,0.3)' },
  payOptTitle:    { fontSize: 14, ...fonts.subhead, color: colors.black },
  payOptSub:      { fontSize: 12, color: colors.gray, marginTop: 2, lineHeight: 16 },
  confirmBtn:     { backgroundColor: colors.black, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1.5, borderColor: colors.gold, marginTop: spacing.sm },
  confirmBtnOff:  { backgroundColor: '#f5f5f5', borderColor: '#ccc' },
  confirmBtnText: { fontSize: 15, ...fonts.heading, color: colors.gold },
  cancelLink:     { alignSelf: 'center', padding: spacing.md },

  // Perfil del local
  shopHead:      { alignItems: 'center', marginBottom: spacing.lg },
  shopAvatar:    { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  shopAvatarText:{ fontSize: 30, color: colors.gold },
  shopName:      { fontSize: 20, ...fonts.heading, color: colors.black },
  shopMeta:      { fontSize: 13, color: colors.gray, marginTop: 4 },
  mapsBtn:       { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: '#e8f0fe', borderRadius: radius.lg, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  mapsAddress:   { fontSize: 13, color: colors.black, flex: 1 },
  mapsLink:      { fontSize: 12, color: '#1a73e8', marginTop: 2 },
  shopBio:       { fontSize: 13, color: colors.gray, paddingHorizontal: spacing.lg, marginBottom: spacing.md, lineHeight: 20 },
  shopSection:   { fontSize: 14, ...fonts.subhead, color: colors.black, paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  photoCard:     { width: 120, height: 100, borderRadius: radius.md, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  priceRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  priceName:     { flex: 1, fontSize: 14, color: colors.black },
  priceDur:      { fontSize: 11, color: colors.gray, marginRight: spacing.md },
  priceVal:      { fontSize: 15, ...fonts.heading, color: colors.black },
  selectBtn:     { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.black, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1.5, borderColor: colors.gold },
  selectBtnText: { fontSize: 15, ...fonts.heading, color: colors.gold },

  // Perfil usuario
  profileAvatar:     { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.sm },
  profileAvatarText: { fontSize: 26, color: colors.gold, ...fonts.heading },
  profileName:       { fontSize: 18, ...fonts.heading, color: colors.black, textAlign: 'center' },
  profileEmail:      { fontSize: 13, color: colors.gray, textAlign: 'center', marginBottom: spacing.lg },
  profileItem:       { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  profileItemText:   { fontSize: 15, color: colors.black },
});
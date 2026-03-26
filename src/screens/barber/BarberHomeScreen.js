/**
 * BarberHomeScreen — Panel del dueño/barbero
 *
 *  1. Motor de reservas — ve las reservas confirmadas instantáneamente
 *  2. Perfil del Local — edita nombre, dirección, fotos, servicios/precios
 *  3. Recordatorios — se programan automáticamente al aceptar una cita
 *  4. Gestión de Horarios — cuadrante visual, bloqueo de horas y días completos
 *  5. Señal — el barbero ve en cada reserva si el cliente pagó señal
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Switch, Animated, Linking,
  Modal, TouchableWithoutFeedback, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location       from 'expo-location';
import * as Notifications  from 'expo-notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { barbersAPI, bookingsAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Badge, Button, Stars } from '../../components/common';
import { colors, fonts, spacing, radius } from '../../constants/theme';

// ── Días y horas ─────────────────────────────────────────────
const DAYS  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const HOURS = [
  '08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00','19:30','20:00',
];

const DEFAULT_SCHEDULE = DAYS.reduce((acc, d) => ({
  ...acc,
  [d]: { active: d !== 'Dom', from: '09:00', to: '19:00', blockedSlots: [] },
}), {});

// ── Recordatorio para el barbero ─────────────────────────────
const scheduleBarberReminder = async (booking) => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const dt = new Date(`${booking.date}T${booking.time}:00`);

    const minus24 = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
    if (minus24 > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💈 Cita mañana',
          body:  `${booking.client_name} — ${booking.service_names} a las ${booking.time}`,
          data:  { bookingId: booking.id },
        },
        trigger: { date: minus24 },
      });
    }

    const minus2 = new Date(dt.getTime() - 2 * 60 * 60 * 1000);
    if (minus2 > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Cita en 2 horas',
          body:  `${booking.client_name} llega a las ${booking.time} — ${booking.service_names}`,
          data:  { bookingId: booking.id },
        },
        trigger: { date: minus2 },
      });
    }
  } catch (e) { console.warn('Reminder:', e); }
};

export const BarberHomeScreen = ({ navigation }) => {
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const qClient = useQueryClient();

  const [isOnline, setIsOnline]           = useState(false);
  const [activeJob, setActiveJob]         = useState(null);
  const [pendingJob, setPendingJob]       = useState(null);
  const [showProfile, setShowProfile]     = useState(false);
  const [showSchedule, setShowSchedule]   = useState(false);
  const [showShopPanel, setShowShopPanel] = useState(false);
  const [schedule, setSchedule]           = useState(DEFAULT_SCHEDULE);
  const [editDay, setEditDay]             = useState(null);
  const [editField, setEditField]         = useState(null);
  const [blockMode, setBlockMode]         = useState(false);

  // Panel del local — vacío, el dueño lo rellena
  const [shopData, setShopData] = useState({
    name:     user?.shop_name || '',
    address:  user?.address   || '',
    phone:    user?.phone     || '',
    bio:      user?.bio       || '',
    services: [], // se cargan del API
  });
  const [editingSvc, setEditingSvc] = useState(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Queries ────────────────────────────────────────────────
  const { data: earningsData } = useQuery({
    queryKey: ['earnings', 'today'],
    queryFn:  () => barbersAPI.earnings('today'),
    refetchInterval: 30000,
  });

  const { data: upcomingData } = useQuery({
    queryKey: ['bookings', 'upcoming'],
    queryFn:  () => bookingsAPI.list({ status: 'confirmed', limit: 20 }),
    refetchInterval: 20000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['bookings', 'completed'],
    queryFn:  () => bookingsAPI.list({ status: 'completed', limit: 10 }),
  });

  // Servicios del propio barbero (los que él configuró)
  const { data: myServicesData } = useQuery({
    queryKey: ['myServices', user?.id],
    queryFn:  () => barbersAPI.services(user?.id),
    enabled:  !!user?.id,
    onSuccess: (d) => {
      if (d?.services?.length) setShopData((p) => ({ ...p, services: d.services }));
    },
  });

  const upcoming = upcomingData?.bookings || [];
  const history  = historyData?.bookings  || [];

  // Programar recordatorio para cada cita próxima
  useEffect(() => {
    upcoming.forEach((b) => { if (b.date && b.time) scheduleBarberReminder(b); });
  }, [upcoming]);

  const setOnlineMutation = useMutation({
    mutationFn: (d) => barbersAPI.setOnline(d),
    onError: (err) => Alert.alert('Error', err?.message || 'No se pudo cambiar el estado.'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => bookingsAPI.updateStatus(id, { status }),
    onSuccess: () => {
      qClient.invalidateQueries(['bookings']);
      qClient.invalidateQueries(['earnings']);
    },
  });

  // ── Pulso online ──────────────────────────────────────────
  useEffect(() => {
    if (isOnline) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isOnline]);

  const toggleOnline = async (val) => {
    try {
      if (val) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Ubicación requerida', 'Activa el GPS para recibir reservas.');
        const loc = await Location.getCurrentPositionAsync({});
        await setOnlineMutation.mutateAsync({ is_online: true, lat: loc.coords.latitude, lng: loc.coords.longitude });
        setIsOnline(true);
      } else {
        await setOnlineMutation.mutateAsync({ is_online: false });
        setIsOnline(false);
      }
    } catch (err) { Alert.alert('Error', err?.message || ''); }
  };

  const acceptJob = async () => {
    if (!pendingJob) return;
    await updateStatusMutation.mutateAsync({ id: pendingJob.id, status: 'confirmed' });
    await scheduleBarberReminder(pendingJob);
    setActiveJob(pendingJob);
    setPendingJob(null);
  };

  const advanceJob = async (nextStatus) => {
    if (!activeJob) return;
    await updateStatusMutation.mutateAsync({ id: activeJob.id, status: nextStatus });
    if (nextStatus === 'completed') {
      setActiveJob(null);
    } else {
      setActiveJob((j) => ({ ...j, status: nextStatus }));
    }
  };

  const statusActions = {
    confirmed:  { label: 'En camino',       next: 'on_the_way', icon: '🚗' },
    on_the_way: { label: 'Llegué',           next: 'arrived',    icon: '📍' },
    arrived:    { label: 'Iniciar servicio', next: 'in_service', icon: '✂️' },
    in_service: { label: 'Finalizar',        next: 'completed',  icon: '✔'  },
  };

  // ── Bloqueo de slots ──────────────────────────────────────
  const toggleBlockSlot = (day, slot) => {
    setSchedule((prev) => {
      const blocked = prev[day].blockedSlots || [];
      return {
        ...prev,
        [day]: {
          ...prev[day],
          blockedSlots: blocked.includes(slot) ? blocked.filter((s) => s !== slot) : [...blocked, slot],
        },
      };
    });
  };

  const blockFullDay = (day) => {
    Alert.alert(
      `Bloquear ${day} completo`,
      'Nadie podrá reservar este día.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Bloquear', style: 'destructive', onPress: () => setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], active: false, blockedSlots: [] } })) },
      ]
    );
  };

  // ── Panel — servicios ─────────────────────────────────────
  const saveSvc = () => {
    if (!editingSvc) return;
    setShopData((prev) => ({
      ...prev,
      services: prev.services.map((s) => s.id === editingSvc.id ? editingSvc : s),
    }));
    setEditingSvc(null);
  };

  const addSvc = () => {
    const n = { id: String(Date.now()), name: '', price: 0, duration: 30, icon: '✂️' };
    setShopData((prev) => ({ ...prev, services: [...prev.services, n] }));
    setEditingSvc(n);
  };

  const deleteSvc = (id) => Alert.alert('Eliminar', '¿Eliminar este servicio?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => setShopData((p) => ({ ...p, services: p.services.filter((s) => s.id !== id) })) },
  ]);

  const net   = parseFloat(earningsData?.net_earnings || 0).toFixed(2);
  const gross = parseFloat(earningsData?.gross_total   || 0).toFixed(2);
  const cuts  = parseInt(earningsData?.total_cuts      || 0);
  const firstName = user?.name?.split(' ')[0] || 'Barbero';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{firstName} ✂️</Text>
            {user?.barber_rating && (
              <View style={styles.ratingRow}>
                <Stars rating={user.barber_rating} size={12} />
                <Text style={styles.ratingText}> {user.barber_rating} · {user.total_cuts || 0} cortes</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => setShowProfile(true)}>
            <Text style={styles.avatarInitial}>{user?.name?.[0] || '✂'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Toggle online ── */}
        <View style={styles.onlineCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Animated.View style={[styles.onlineDot, !isOnline && styles.onlineDotOff, { transform: [{ scale: pulseAnim }] }]} />
            <View>
              <Text style={styles.onlineTitle}>{isOnline ? 'Online — recibiendo reservas' : 'Offline'}</Text>
              <Text style={styles.onlineSub}>{isOnline ? 'Los clientes pueden reservar' : 'Actívate para recibir reservas'}</Text>
            </View>
          </View>
          <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ false: colors.mid, true: '#27ae60' }} thumbColor={colors.white} />
        </View>

        {/* ── Ganancias ── */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>GANANCIAS HOY</Text>
          <Text style={styles.earningsAmount}>€{net}</Text>
          <Text style={styles.earningsSub}>Tu parte (70%) · Bruto: €{gross}</Text>
          <View style={styles.earningsRow}>
            {[['Cortes', cuts], ['Bruto', `€${gross}`], ['Plataforma', `€${(gross - net).toFixed(2)}`]].map(([l, v]) => (
              <View key={l} style={styles.earningsMini}>
                <Text style={styles.earningsMiniVal}>{v}</Text>
                <Text style={styles.earningsMiniLabel}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Nueva reserva entrante ── */}
        {pendingJob && (
          <View style={styles.pendingCard}>
            <Badge label="NUEVA RESERVA" color="gold" />
            <Text style={styles.jobName}>{pendingJob.client_name}</Text>
            <Text style={styles.jobDetail}>{pendingJob.service_names} · <Text style={{ color: colors.gold }}>€{(pendingJob.total * 0.70).toFixed(2)} tu parte</Text></Text>
            {pendingJob.time && <Text style={styles.jobTime}>🕐 {pendingJob.time}</Text>}
            {pendingJob.payment_method === 'deposit' && <Text style={styles.depositBadge}>🔒 Señal pagada</Text>}
            <View style={styles.jobBtns}>
              <Button title="✓ Aceptar"  onPress={acceptJob}              style={{ flex: 1 }} />
              <Button title="✕ Rechazar" variant="ghost" onPress={() => setPendingJob(null)} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        {/* ── Reserva activa ── */}
        {activeJob && (
          <View style={styles.activeCard}>
            <Badge label="EN SERVICIO" color="green" />
            <Text style={[styles.jobName, { marginTop: spacing.sm }]}>{activeJob.client_name}</Text>
            <Text style={styles.jobDetail}>{activeJob.service_names} · €{(activeJob.total * 0.70).toFixed(2)}</Text>
            <View style={styles.jobBtns}>
              {statusActions[activeJob.status] && (
                <Button
                  title={`${statusActions[activeJob.status].icon} ${statusActions[activeJob.status].label}`}
                  onPress={() => advanceJob(statusActions[activeJob.status].next)}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>
        )}

        {/* ── Próximas citas ── */}
        {upcoming.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>📅 Próximas citas</Text>
            {upcoming.map((b) => (
              <View key={b.id} style={styles.upcomingRow}>
                <View style={styles.upcomingTimePill}>
                  <Text style={styles.upcomingTimeText}>{b.time || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.upcomingName}>{b.client_name}</Text>
                  <Text style={styles.upcomingMeta}>{b.service_names}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.upcomingPrice}>€{(b.total * 0.70).toFixed(2)}</Text>
                  {b.payment_method === 'deposit' && <Text style={styles.depositTag}>🔒 Señal</Text>}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Accesos rápidos ── */}
        <View style={styles.quickRow}>
          {[
            { icon: '🗓️', label: 'Mi horario', onPress: () => setShowSchedule(true) },
            { icon: '💈', label: 'Mi local',   onPress: () => setShowShopPanel(true) },
            { icon: '📊', label: 'Calendario', onPress: () => navigation.navigate('BarberCalendar') },
          ].map(({ icon, label, onPress }) => (
            <TouchableOpacity key={label} style={styles.quickBtn} onPress={onPress}>
              <Text style={styles.quickIcon}>{icon}</Text>
              <Text style={styles.quickLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Historial ── */}
        <Text style={styles.sectionTitle}>Cortes de hoy</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>Aún no hay cortes completados hoy</Text>
        ) : history.map((b) => (
          <View key={b.id} style={styles.histRow}>
            <View>
              <Text style={styles.histName}>{b.client_name}</Text>
              <Text style={styles.histMeta}>{b.service_names}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.histAmount}>€{(b.total * 0.70).toFixed(2)}</Text>
              <Text style={styles.histDone}>✔ Completado</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB WhatsApp */}
      <TouchableOpacity style={styles.fab} onPress={() => Linking.openURL('https://wa.me/34600000000')}>
        <Text style={styles.fabText}>💬</Text>
      </TouchableOpacity>

      {/* ════════════════════════════════════════════════════
          MODAL — PERFIL
      ════════════════════════════════════════════════════ */}
      <Modal visible={showProfile} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowProfile(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user?.name?.[0] || '✂'}</Text></View>
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileRole}>Barbero · CutGo</Text>
          {[
            { label: '🗓️ Mi horario', action: () => { setShowProfile(false); setShowSchedule(true); } },
            { label: '💈 Panel del local', action: () => { setShowProfile(false); setShowShopPanel(true); } },
            { label: '👤 Mi perfil', action: () => { setShowProfile(false); navigation.navigate('BarberProfile'); } },
          ].map(({ label, action }) => (
            <TouchableOpacity key={label} style={styles.profileItem} onPress={action}>
              <Text style={styles.profileItemText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.profileItem, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: spacing.md }]} onPress={() => { logout(); setShowProfile(false); }}>
            <Text style={[styles.profileItemText, { color: '#ff4444' }]}>🚪 Cerrar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowProfile(false)} style={styles.cancelLink}>
            <Text style={{ color: colors.gray }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL — HORARIO + BLOQUEOS
          Punto 4: cuadrante, bloqueo de horas/días
      ════════════════════════════════════════════════════ */}
      <Modal visible={showSchedule} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { setShowSchedule(false); setBlockMode(false); }}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { maxHeight: '90%' }]}>
          <Text style={styles.sheetTitle}>🗓️ Horario de trabajo</Text>

          {/* Toggle modo bloqueo */}
          <View style={styles.blockModeRow}>
            <View>
              <Text style={{ color: colors.white, fontSize: 13, ...fonts.bodyMed }}>Modo bloqueo de horas</Text>
              <Text style={{ color: colors.gray, fontSize: 11, marginTop: 2 }}>Toca un slot para bloquearlo</Text>
            </View>
            <Switch
              value={blockMode}
              onValueChange={setBlockMode}
              trackColor={{ false: colors.mid, true: '#c0392b' }}
              thumbColor={colors.white}
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {DAYS.map((day) => (
              <View key={day}>
                {/* Fila día */}
                <View style={styles.schedRow}>
                  <Switch
                    value={schedule[day].active}
                    onValueChange={() => {
                      if (schedule[day].active) blockFullDay(day);
                      else setSchedule((p) => ({ ...p, [day]: { ...p[day], active: true } }));
                    }}
                    trackColor={{ false: colors.mid, true: colors.gold }}
                    thumbColor={colors.white}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                  <Text style={[styles.schedDay, !schedule[day].active && { color: colors.gray }]}>{day}</Text>

                  {schedule[day].active ? (
                    <View style={styles.schedHours}>
                      <TouchableOpacity style={styles.hourBtn} onPress={() => { setEditDay(day); setEditField('from'); }}>
                        <Text style={styles.hourBtnText}>{schedule[day].from}</Text>
                      </TouchableOpacity>
                      <Text style={{ color: colors.gray }}>—</Text>
                      <TouchableOpacity style={styles.hourBtn} onPress={() => { setEditDay(day); setEditField('to'); }}>
                        <Text style={styles.hourBtnText}>{schedule[day].to}</Text>
                      </TouchableOpacity>
                      {schedule[day].blockedSlots?.length > 0 && (
                        <View style={styles.blockedPill}>
                          <Text style={styles.blockedPillText}>{schedule[day].blockedSlots.length} bloq.</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.closedText}>Cerrado</Text>
                  )}
                </View>

                {/* Selector hora inicio/fin */}
                {editDay === day && editField && (
                  <View style={styles.hourPicker}>
                    <Text style={styles.hourPickerLabel}>Hora de {editField === 'from' ? 'inicio' : 'fin'} — {day}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {HOURS.map((h) => (
                        <TouchableOpacity key={h} style={styles.hourOpt} onPress={() => {
                          setSchedule((p) => ({ ...p, [day]: { ...p[day], [editField]: h } }));
                          setEditDay(null); setEditField(null);
                        }}>
                          <Text style={styles.hourOptText}>{h}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Grid de slots para bloquear */}
                {blockMode && schedule[day].active && (
                  <View style={styles.slotGrid}>
                    {HOURS.filter((h) => h >= schedule[day].from && h <= schedule[day].to).map((slot) => {
                      const blocked = schedule[day].blockedSlots?.includes(slot);
                      return (
                        <TouchableOpacity
                          key={slot}
                          style={[styles.slotChip, blocked && styles.slotChipBlocked]}
                          onPress={() => toggleBlockSlot(day, slot)}
                        >
                          <Text style={[styles.slotChipText, blocked && styles.slotChipTextBlocked]}>{slot}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={() => { setShowSchedule(false); setBlockMode(false); Alert.alert('✅', 'Horario guardado'); }}>
            <Text style={styles.saveBtnText}>Guardar horario</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowSchedule(false); setBlockMode(false); }} style={styles.cancelLink}>
            <Text style={{ color: colors.gray }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL — PANEL DEL LOCAL
          Punto 2: el dueño sube fotos, cambia precios,
          añade servicios en 2 min desde el móvil.
          SIN precios hardcodeados.
      ════════════════════════════════════════════════════ */}
      <Modal visible={showShopPanel} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { setShowShopPanel(false); setEditingSvc(null); }}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { maxHeight: '92%' }]}>
          <Text style={styles.sheetTitle}>💈 Panel del local</Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Datos básicos */}
            <Text style={styles.panelLabel}>Información</Text>
            {[
              { label: 'Nombre del local', val: shopData.name,    key: 'name',    ph: 'Barbería El Fígaro' },
              { label: 'Dirección',        val: shopData.address, key: 'address', ph: 'Calle Mayor 12, Madrid' },
              { label: 'Teléfono',         val: shopData.phone,   key: 'phone',   ph: '+34 600 000 000' },
            ].map(({ label, val, key, ph }) => (
              <View key={key} style={styles.panelField}>
                <Text style={styles.panelFieldLabel}>{label}</Text>
                <TextInput
                  style={styles.panelInput}
                  value={val}
                  onChangeText={(v) => setShopData((p) => ({ ...p, [key]: v }))}
                  placeholder={ph}
                  placeholderTextColor={colors.gray}
                />
              </View>
            ))}

            <View style={styles.panelField}>
              <Text style={styles.panelFieldLabel}>Descripción del local</Text>
              <TextInput
                style={[styles.panelInput, { height: 72, textAlignVertical: 'top' }]}
                value={shopData.bio}
                onChangeText={(v) => setShopData((p) => ({ ...p, bio: v }))}
                placeholder="Cuéntales a los clientes sobre tu barbería..."
                placeholderTextColor={colors.gray}
                multiline
              />
            </View>

            {/* Botón Google Maps */}
            <TouchableOpacity
              style={styles.mapsBtn}
              onPress={() => shopData.address && Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopData.address)}`)}
            >
              <Text style={styles.mapsBtnText}>📍 Ver en Google Maps</Text>
            </TouchableOpacity>

            {/* Fotos */}
            <Text style={styles.panelLabel}>Fotos</Text>
            {[
              { icon: '📷', title: 'Fotos del local',         hint: 'Aparecen en tu ficha de cliente' },
              { icon: '✂️', title: 'Fotos de trabajos',       hint: 'Los clientes ven tu trabajo real' },
            ].map(({ icon, title, hint }) => (
              <TouchableOpacity
                key={title}
                style={styles.uploadBtn}
                onPress={() => Alert.alert('Subir fotos', `Selecciona fotos desde la galería.\n(Integrar expo-image-picker)`)}
              >
                <Text style={{ fontSize: 22 }}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadTitle}>{title}</Text>
                  <Text style={styles.uploadHint}>{hint}</Text>
                </View>
                <Text style={{ color: colors.gold, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            ))}

            {/* Servicios y precios — el dueño los define */}
            <View style={styles.svcHeader}>
              <Text style={styles.panelLabel}>Servicios y precios</Text>
              <TouchableOpacity onPress={addSvc}><Text style={styles.addSvcText}>+ Añadir</Text></TouchableOpacity>
            </View>

            {shopData.services.length === 0 && (
              <View style={styles.emptySvc}>
                <Text style={styles.emptySvcText}>Aún no tienes servicios. Pulsa "+ Añadir" para crear el primero.</Text>
              </View>
            )}

            {shopData.services.map((svc) => (
              editingSvc?.id === svc.id ? (
                <View key={svc.id} style={styles.svcEditCard}>
                  <TextInput style={styles.panelInput} value={editingSvc.name} onChangeText={(v) => setEditingSvc((s) => ({ ...s, name: v }))} placeholder="Nombre del servicio" placeholderTextColor={colors.gray} />
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.panelFieldLabel}>Precio (€)</Text>
                      <TextInput style={styles.panelInput} value={String(editingSvc.price)} onChangeText={(v) => setEditingSvc((s) => ({ ...s, price: parseFloat(v) || 0 }))} keyboardType="numeric" placeholderTextColor={colors.gray} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.panelFieldLabel}>Duración (min)</Text>
                      <TextInput style={styles.panelInput} value={String(editingSvc.duration)} onChangeText={(v) => setEditingSvc((s) => ({ ...s, duration: parseInt(v) || 0 }))} keyboardType="numeric" placeholderTextColor={colors.gray} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Button title="Guardar" onPress={saveSvc} style={{ flex: 1 }} />
                    <Button title="Cancelar" variant="ghost" onPress={() => setEditingSvc(null)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <View key={svc.id} style={styles.svcRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.svcName}>{svc.icon || '✂️'} {svc.name}</Text>
                    <Text style={styles.svcDur}>{svc.duration} min</Text>
                  </View>
                  <Text style={styles.svcPrice}>€{svc.price}</Text>
                  <TouchableOpacity style={styles.svcAction} onPress={() => setEditingSvc({ ...svc })}><Text>✏️</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.svcAction} onPress={() => deleteSvc(svc.id)}><Text>🗑️</Text></TouchableOpacity>
                </View>
              )
            ))}

          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={() => { setShowShopPanel(false); setEditingSvc(null); Alert.alert('✅', 'Cambios guardados'); }}>
            <Text style={styles.saveBtnText}>Guardar cambios</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowShopPanel(false); setEditingSvc(null); }} style={styles.cancelLink}>
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
  safe:    { flex: 1, backgroundColor: colors.black },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl },
  greeting:{ fontSize: 22, ...fonts.heading, color: colors.white },
  ratingRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  ratingText: { fontSize: 11, color: colors.gray },
  avatarBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mid, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.gold },
  avatarInitial: { fontSize: 18, color: colors.gold, ...fonts.heading },

  onlineCard:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.mid, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
  onlineDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#27ae60' },
  onlineDotOff:{ backgroundColor: colors.gray },
  onlineTitle: { fontSize: 14, ...fonts.subhead, color: colors.white },
  onlineSub:   { fontSize: 11, color: colors.gray, marginTop: 2 },

  earningsCard:   { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: '#1c1a00', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.35)' },
  earningsLabel:  { fontSize: 10, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.8 },
  earningsAmount: { fontSize: 36, ...fonts.heading, color: colors.gold, marginTop: 4 },
  earningsSub:    { fontSize: 11, color: colors.gray, marginBottom: spacing.md },
  earningsRow:    { flexDirection: 'row', gap: spacing.sm },
  earningsMini:   { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  earningsMiniVal:  { fontSize: 16, ...fonts.heading, color: colors.white },
  earningsMiniLabel:{ fontSize: 9, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5 },

  pendingCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: 'rgba(201,168,76,0.07)', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.3)' },
  activeCard:  { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: 'rgba(39,174,96,0.07)', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1.5, borderColor: 'rgba(39,174,96,0.3)' },
  jobName:   { fontSize: 16, ...fonts.subhead, color: colors.white, marginTop: 4 },
  jobDetail: { fontSize: 13, color: colors.gray, marginTop: 2 },
  jobTime:   { fontSize: 12, color: colors.gold, marginTop: 4 },
  depositBadge: { fontSize: 11, color: '#27ae60', marginTop: 4 },
  depositTag:   { fontSize: 10, color: '#27ae60' },
  jobBtns:   { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

  sectionTitle: { fontSize: 12, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.md, ...fonts.subhead },
  emptyText:    { color: colors.gray, textAlign: 'center', paddingVertical: spacing.lg, fontSize: 13 },

  upcomingRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  upcomingTimePill: { width: 54, height: 54, borderRadius: radius.sm, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  upcomingTimeText: { fontSize: 13, color: colors.gold, ...fonts.bodyMed },
  upcomingName:     { fontSize: 13, ...fonts.bodyMed, color: colors.white },
  upcomingMeta:     { fontSize: 11, color: colors.gray, marginTop: 2 },
  upcomingPrice:    { fontSize: 14, ...fonts.heading, color: colors.gold },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.md },
  quickBtn: { flex: 1, backgroundColor: colors.mid, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
  quickIcon:{ fontSize: 22, marginBottom: 4 },
  quickLabel:{ fontSize: 11, color: colors.gray, textAlign: 'center' },

  histRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  histName:   { fontSize: 13, ...fonts.bodyMed, color: colors.white },
  histMeta:   { fontSize: 11, color: colors.gray, marginTop: 2 },
  histAmount: { fontSize: 14, ...fonts.heading, color: colors.gold },
  histDone:   { fontSize: 10, color: '#27ae60', marginTop: 2 },

  fab:     { position: 'absolute', bottom: 30, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { fontSize: 28 },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:      { backgroundColor: colors.dark || '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, ...fonts.heading, color: colors.white, marginBottom: spacing.lg },
  cancelLink: { alignSelf: 'center', padding: spacing.md },

  profileAvatar:     { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mid, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.gold },
  profileAvatarText: { fontSize: 28, color: colors.gold, ...fonts.heading },
  profileName:  { fontSize: 18, ...fonts.heading, color: colors.white, textAlign: 'center' },
  profileRole:  { fontSize: 12, color: colors.gray, textAlign: 'center', marginBottom: spacing.lg },
  profileItem:  { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  profileItemText: { fontSize: 15, color: colors.white },

  // Horario
  blockModeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  schedRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: spacing.sm },
  schedDay:     { width: 36, fontSize: 13, ...fonts.bodyMed, color: colors.white },
  schedHours:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  hourBtn:      { backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  hourBtnText:  { fontSize: 13, color: colors.gold, ...fonts.bodyMed },
  closedText:   { marginLeft: 'auto', fontSize: 12, color: colors.gray },
  blockedPill:  { backgroundColor: 'rgba(231,76,60,0.2)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(231,76,60,0.4)' },
  blockedPillText: { fontSize: 10, color: '#e74c3c' },
  hourPicker:      { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.sm },
  hourPickerLabel: { fontSize: 12, color: colors.gray, marginBottom: spacing.sm },
  hourOpt:         { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: 8, backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  hourOptText:     { color: colors.gold, fontSize: 13, ...fonts.bodyMed },
  slotGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: spacing.sm },
  slotChip:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  slotChipBlocked: { backgroundColor: 'rgba(231,76,60,0.2)', borderColor: 'rgba(231,76,60,0.5)' },
  slotChipText:    { fontSize: 12, color: colors.gold },
  slotChipTextBlocked: { color: '#e74c3c' },

  saveBtn:     { backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { fontSize: 15, ...fonts.subhead, color: colors.black },

  // Panel del local
  panelLabel:      { fontSize: 11, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.md, marginBottom: spacing.sm },
  panelField:      { marginBottom: spacing.sm },
  panelFieldLabel: { fontSize: 11, color: colors.gray, marginBottom: 4 },
  panelInput:      { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', color: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14 },
  mapsBtn:         { backgroundColor: 'rgba(66,133,244,0.15)', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(66,133,244,0.3)' },
  mapsBtnText:     { color: '#4285F4', fontSize: 13, ...fonts.bodyMed },
  uploadBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: spacing.sm },
  uploadTitle:     { fontSize: 13, color: colors.white, ...fonts.bodyMed },
  uploadHint:      { fontSize: 11, color: colors.gray, marginTop: 2 },
  svcHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addSvcText:      { fontSize: 13, color: colors.gold, ...fonts.bodyMed },
  emptySvc:        { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md },
  emptySvcText:    { fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 20 },
  svcRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: spacing.sm },
  svcName:         { fontSize: 14, color: colors.white },
  svcDur:          { fontSize: 11, color: colors.gray, marginTop: 2 },
  svcPrice:        { fontSize: 15, color: colors.gold, ...fonts.heading, marginRight: spacing.sm },
  svcAction:       { padding: 6 },
  svcEditCard:     { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
});
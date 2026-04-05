/**
 * BarberCalendarScreen — Calendario semanal estilo Booksy Biz
 *
 * - Vista semanal con columnas por día
 * - Reservas del barbero con hora, cliente y servicio
 * - Navegar semanas (anterior / siguiente)
 * - Tocar reserva para ver detalle y cambiar estado
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, TouchableWithoutFeedback,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { bookingsAPI } from '../../services/api';
import { colors, fonts, spacing, radius, shadows } from '../../constants/theme';

// ── Horas del cuadrante ──────────────────────────────────────
const HOURS = [
  '08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00',
  '18:00','19:00','20:00',
];

const STATUS_COLOR = {
  pending:    '#f39c12',
  confirmed:  '#2980b9',
  on_the_way: '#8e44ad',
  arrived:    '#16a085',
  in_service: '#27ae60',
  completed:  '#7f8c8d',
  cancelled:  '#c0392b',
};

const STATUS_LABEL = {
  pending:    'Pendiente',
  confirmed:  'Confirmada',
  on_the_way: 'En camino',
  arrived:    'Llegó',
  in_service: 'En servicio',
  completed:  'Completada',
  cancelled:  'Cancelada',
};

const STATUS_NEXT = {
  confirmed:  { label: '🚗 En camino',       next: 'on_the_way' },
  on_the_way: { label: '📍 Llegué',           next: 'arrived'    },
  arrived:    { label: '✂️ Iniciar servicio', next: 'in_service' },
  in_service: { label: '✔ Finalizar',         next: 'completed'  },
};

// ── Helpers ──────────────────────────────────────────────────
const getWeekDays = (referenceDate) => {
  const start = startOfWeek(referenceDate, { weekStartsOn: 1 }); // Lunes
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

const bookingHour = (b) => {
  if (b.scheduled_at) return format(parseISO(b.scheduled_at), 'HH:mm');
  if (b.time) return b.time;
  return '00:00';
};

const bookingDate = (b) => {
  if (b.scheduled_at) return parseISO(b.scheduled_at);
  if (b.date) return parseISO(b.date);
  return new Date();
};

export const BarberCalendarScreen = ({ navigation }) => {
  const qClient = useQueryClient();
  const [weekRef, setWeekRef]       = useState(new Date());
  const [selected, setSelected]     = useState(null); // reserva seleccionada
  const weekDays = getWeekDays(weekRef);

  // ── Cargar reservas de la semana ───────────────────────────
  const startStr = format(weekDays[0], 'yyyy-MM-dd');
  const endStr   = format(weekDays[6], 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', 'week', startStr],
    queryFn:  () => bookingsAPI.list({ from: startStr, to: endStr, limit: 100 }),
    refetchInterval: 30000,
  });

  const bookings = data?.bookings || [];

  // ── Cambiar estado ─────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, status }) => bookingsAPI.updateStatus(id, { status }),
    onSuccess: () => {
      qClient.invalidateQueries(['bookings']);
      setSelected(null);
    },
    onError: (err) => Alert.alert('Error', err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => bookingsAPI.cancel(id),
    onSuccess: () => {
      qClient.invalidateQueries(['bookings']);
      setSelected(null);
    },
    onError: (err) => Alert.alert('Error', err.message),
  });

  // ── Reservas de un día y hora específicos ──────────────────
  const getBookingsForSlot = useCallback((day, hour) => {
    return bookings.filter((b) => {
      const bDate = bookingDate(b);
      const bHour = bookingHour(b);
      return isSameDay(bDate, day) && bHour.startsWith(hour.split(':')[0]);
    });
  }, [bookings]);

  // ── Reservas de un día (para el header badge) ──────────────
  const countForDay = useCallback((day) => {
    return bookings.filter((b) => {
      const bDate = bookingDate(b);
      return isSameDay(bDate, day) && b.status !== 'cancelled';
    }).length;
  }, [bookings]);

  const today = new Date();

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {format(weekDays[0], 'd MMM', { locale: es })} — {format(weekDays[6], 'd MMM yyyy', { locale: es })}
        </Text>
        <View style={styles.navBtns}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWeekRef((d) => addDays(d, -7))}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWeekRef((d) => addDays(d, 7))}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Botón volver a hoy ── */}
      {!isSameDay(weekDays[0], startOfWeek(today, { weekStartsOn: 1 })) && (
        <TouchableOpacity style={styles.todayBtn} onPress={() => setWeekRef(new Date())}>
          <Text style={styles.todayBtnText}>Ir a hoy</Text>
        </TouchableOpacity>
      )}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={{ color: colors.gray, marginTop: spacing.md }}>Cargando reservas...</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* ── Cabecera días ── */}
            <View style={styles.dayHeaders}>
              <View style={styles.hourCol} />
              {weekDays.map((day) => {
                const isToday  = isSameDay(day, today);
                const count    = countForDay(day);
                return (
                  <View key={day.toISOString()} style={styles.dayHeader}>
                    <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                      {format(day, 'EEE', { locale: es }).toUpperCase()}
                    </Text>
                    <View style={[styles.dayNumWrap, isToday && styles.dayNumWrapToday]}>
                      <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                        {format(day, 'd')}
                      </Text>
                    </View>
                    {count > 0 && (
                      <View style={styles.dayBadge}>
                        <Text style={styles.dayBadgeText}>{count}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* ── Grid horas ── */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.grid}>
              {HOURS.map((hour) => (
                <View key={hour} style={styles.hourRow}>
                  {/* Etiqueta hora */}
                  <View style={styles.hourCol}>
                    <Text style={styles.hourLabel}>{hour}</Text>
                  </View>

                  {/* Celdas por día */}
                  {weekDays.map((day) => {
                    const slotBookings = getBookingsForSlot(day, hour);
                    const isPast = day < today && !isSameDay(day, today);
                    return (
                      <View key={day.toISOString()} style={[styles.cell, isPast && styles.cellPast]}>
                        {slotBookings.map((b) => (
                          <TouchableOpacity
                            key={b.id}
                            style={[
                              styles.bookingChip,
                              { backgroundColor: STATUS_COLOR[b.status] + '22', borderLeftColor: STATUS_COLOR[b.status] },
                            ]}
                            onPress={() => setSelected(b)}
                          >
                            <Text style={[styles.chipTime, { color: STATUS_COLOR[b.status] }]}>
                              {bookingHour(b)}
                            </Text>
                            <Text style={styles.chipName} numberOfLines={1}>
                              {b.client_name || 'Cliente'}
                            </Text>
                            <Text style={styles.chipSvc} numberOfLines={1}>
                              {b.service_names || b.service_name || ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {/* ── Modal detalle reserva ── */}
      <Modal visible={!!selected} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setSelected(null)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        {selected && (
          <View style={styles.sheet}>
            {/* Estado */}
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[selected.status] + '22' }]}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[selected.status] }]} />
              <Text style={[styles.statusText, { color: STATUS_COLOR[selected.status] }]}>
                {STATUS_LABEL[selected.status] || selected.status}
              </Text>
            </View>

            {/* Info cliente */}
            <View style={styles.clientRow}>
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>
                  {(selected.client_name || 'C')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{selected.client_name || 'Cliente'}</Text>
                {selected.client_phone && (
                  <Text style={styles.clientPhone}>📞 {selected.client_phone}</Text>
                )}
              </View>
              <Text style={styles.bookingPrice}>€{selected.total || '—'}</Text>
            </View>

            {/* Detalles */}
            {[
              ['✂️ Servicio',  selected.service_names || selected.service_name || '—'],
              ['🕐 Hora',      bookingHour(selected)],
              ['📅 Fecha',     format(bookingDate(selected), 'd MMMM yyyy', { locale: es })],
              ['📍 Dirección', selected.address || selected.client_address || '—'],
              selected.payment_method === 'deposit' ? ['🔒 Señal', 'Pagada'] : null,
            ].filter(Boolean).map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
              </View>
            ))}

            {/* Acción principal */}
            {STATUS_NEXT[selected.status] && (
              <TouchableOpacity
                style={styles.actionBtn}
                disabled={updateMutation.isPending}
                onPress={() => updateMutation.mutate({ id: selected.id, status: STATUS_NEXT[selected.status].next })}
              >
                {updateMutation.isPending
                  ? <ActivityIndicator color={colors.black} />
                  : <Text style={styles.actionBtnText}>{STATUS_NEXT[selected.status].label}</Text>
                }
              </TouchableOpacity>
            )}

            {/* Cancelar */}
            {['pending', 'confirmed'].includes(selected.status) && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => Alert.alert(
                  '¿Cancelar reserva?',
                  'Esta acción no se puede deshacer.',
                  [
                    { text: 'No', style: 'cancel' },
                    { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelMutation.mutate(selected.id) },
                  ]
                )}
              >
                <Text style={styles.cancelBtnText}>Cancelar reserva</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const DAY_W  = 110;
const HOUR_W = 52;
const ROW_H  = 64;

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.black },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  backBtn:     { padding: spacing.sm, marginRight: spacing.sm },
  backText:    { fontSize: 28, color: colors.gold, lineHeight: 30 },
  headerTitle: { flex: 1, fontSize: 14, ...fonts.subhead, color: colors.white, textAlign: 'center' },
  navBtns:     { flexDirection: 'row', gap: spacing.sm },
  navBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.mid, alignItems: 'center', justifyContent: 'center' },
  navBtnText:  { fontSize: 20, color: colors.gold, lineHeight: 24 },

  todayBtn:     { alignSelf: 'center', marginVertical: spacing.sm, backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  todayBtnText: { fontSize: 12, color: colors.gold, ...fonts.bodyMed },

  // Cabecera días
  dayHeaders: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', backgroundColor: colors.black },
  dayHeader:  { width: DAY_W, alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  dayName:    { fontSize: 10, color: colors.gray, letterSpacing: 0.8, ...fonts.subhead },
  dayNameToday: { color: colors.gold },
  dayNumWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayNumWrapToday: { backgroundColor: colors.gold },
  dayNum:     { fontSize: 16, color: colors.white, ...fonts.subhead },
  dayNumToday:{ color: colors.black },
  dayBadge:   { backgroundColor: colors.gold, borderRadius: 8, minWidth: 16, paddingHorizontal: 4, alignItems: 'center' },
  dayBadgeText: { fontSize: 9, color: colors.black, ...fonts.subhead },

  // Grid
  grid:       { maxHeight: 520 },
  hourCol:    { width: HOUR_W, alignItems: 'flex-end', paddingRight: spacing.sm },
  hourRow:    { flexDirection: 'row', height: ROW_H, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  hourLabel:  { fontSize: 11, color: colors.gray, marginTop: 4 },
  cell:       { width: DAY_W, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 3, paddingVertical: 3, gap: 2 },
  cellPast:   { backgroundColor: 'rgba(255,255,255,0.015)' },

  // Chip reserva
  bookingChip: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, marginBottom: 2 },
  chipTime:    { fontSize: 10, ...fonts.subhead },
  chipName:    { fontSize: 11, color: colors.white, ...fonts.bodyMed },
  chipSvc:     { fontSize: 10, color: colors.gray },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:   { backgroundColor: colors.dark || '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40, ...shadows.strong },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6, marginBottom: spacing.md },
  statusDot:   { width: 8, height: 8, borderRadius: 4 },
  statusText:  { fontSize: 12, ...fonts.subhead, letterSpacing: 0.5 },

  clientRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  clientAvatar:    { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.mid, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.gold },
  clientAvatarText:{ fontSize: 20, color: colors.gold, ...fonts.heading },
  clientName:      { fontSize: 16, ...fonts.subhead, color: colors.white },
  clientPhone:     { fontSize: 12, color: colors.gray, marginTop: 2 },
  bookingPrice:    { fontSize: 20, ...fonts.heading, color: colors.gold },

  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  detailLabel: { fontSize: 13, color: colors.gray },
  detailValue: { fontSize: 13, color: colors.white, ...fonts.bodyMed, flex: 1, textAlign: 'right', marginLeft: spacing.md },

  actionBtn:     { backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  actionBtnText: { fontSize: 15, ...fonts.subhead, color: colors.black },

  cancelBtn:     { alignSelf: 'center', marginTop: spacing.md, padding: spacing.sm },
  cancelBtnText: { fontSize: 13, color: colors.red || '#c0392b', ...fonts.bodyMed },

  closeBtn:     { alignSelf: 'center', marginTop: spacing.sm, padding: spacing.md },
  closeBtnText: { fontSize: 13, color: colors.gray },
});
import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput,
} from 'react-native';
import { colors, fonts, radius, spacing, shadows } from '../../constants/theme';

// ── Button ────────────────────────────────────────────────
export const Button = ({ title, onPress, variant = 'primary', loading, disabled, style }) => {
  const isPrimary = variant === 'primary';
  const isGhost   = variant === 'ghost';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        isPrimary && styles.btnPrimary,
        isGhost   && styles.btnGhost,
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={isPrimary ? colors.black : colors.gold} />
        : <Text style={[styles.btnText, isGhost && { color: colors.gold }]}>{title}</Text>
      }
    </TouchableOpacity>
  );
};

// ── Input ─────────────────────────────────────────────────
export const Input = ({ label, error, style, ...props }) => (
  <View style={[{ marginBottom: spacing.md }, style]}>
    {label && <Text style={styles.inputLabel}>{label}</Text>}
    <TextInput
      style={[styles.input, error && { borderColor: colors.red }]}
      placeholderTextColor={colors.gray}
      {...props}
    />
    {error && <Text style={styles.inputError}>{error}</Text>}
  </View>
);

// ── Card ──────────────────────────────────────────────────
export const Card = ({ children, style, dark }) => (
  <View style={[styles.card, dark && styles.cardDark, style]}>
    {children}
  </View>
);

// ── Badge ─────────────────────────────────────────────────
export const Badge = ({ label, color = 'gold' }) => {
  const bg = {
    gold:  { bg: colors.goldFaint,  text: colors.gold  },
    green: { bg: colors.greenFaint, text: colors.green },
    red:   { bg: colors.redFaint,   text: colors.red   },
    gray:  { bg: '#f0ede8',         text: colors.gray  },
  }[color];
  return (
    <View style={[styles.badge, { backgroundColor: bg.bg }]}>
      <Text style={[styles.badgeText, { color: bg.text }]}>{label}</Text>
    </View>
  );
};

// ── Stars ─────────────────────────────────────────────────
export const Stars = ({ rating = 0, size = 14 }) => (
  <Text style={{ fontSize: size, color: colors.gold }}>
    {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
  </Text>
);

// ── SectionTitle ──────────────────────────────────────────
export const SectionTitle = ({ children, style }) => (
  <Text style={[styles.sectionTitle, style]}>{children}</Text>
);

// ── Divider ───────────────────────────────────────────────
export const Divider = ({ style }) => (
  <View style={[{ height: 1, backgroundColor: colors.lightGray, marginVertical: spacing.md }, style]} />
);

// ── EmptyState ────────────────────────────────────────────
export const EmptyState = ({ icon = '✂', title, subtitle }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyIcon}>{icon}</Text>
    <Text style={styles.emptyTitle}>{title}</Text>
    {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
  </View>
);

// ── LoadingScreen ─────────────────────────────────────────
export const LoadingScreen = () => (
  <View style={styles.loadingScreen}>
    <ActivityIndicator size="large" color={colors.gold} />
  </View>
);

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 15, paddingHorizontal: spacing.xl,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.gold },
  btnGhost:   { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.gold },
  btnText:    { ...fonts.subhead, fontSize: 14, color: colors.black, letterSpacing: 0.5 },

  inputLabel: { fontSize: 12, ...fonts.bodyMed, color: colors.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.lightGray,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 13,
    fontSize: 15, color: colors.black,
  },
  inputError: { fontSize: 12, color: colors.red, marginTop: 4 },

  card: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.lg, ...shadows.card,
  },
  cardDark: { backgroundColor: colors.dark, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },

  badge: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.full, alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, ...fonts.subhead, letterSpacing: 0.4 },

  sectionTitle: {
    fontSize: 11, ...fonts.subhead, color: colors.gray,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: spacing.sm, marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },

  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl * 2 },
  emptyIcon:  { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, ...fonts.subhead, color: colors.black, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: spacing.xxl },

  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
});

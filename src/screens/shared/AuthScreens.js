import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { Button, Input } from '../../components/common';
import { colors, fonts, spacing, radius } from '../../constants/theme';

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const parseError = (err) => {
  const msg = err?.message || err?.error || String(err) || '';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Network') || msg.includes('connect') || msg.includes('conexión'))
    return 'Sin conexión. Comprueba tu internet e inténtalo de nuevo.';
  if (msg.includes('exist') || msg.includes('already') || msg.includes('duplicate') || msg.includes('duplicado'))
    return 'Ya existe una cuenta con ese email. Prueba a iniciar sesión.';
  if (msg.includes('credentials') || msg.includes('password') || msg.includes('Invalid') || msg.includes('incorrect'))
    return 'Email o contraseña incorrectos.';
  if (msg.includes('timeout') || msg.includes('TIMEOUT'))
    return 'El servidor tardó demasiado. Inténtalo de nuevo.';
  return msg || 'Algo salió mal. Inténtalo de nuevo.';
};

// ─────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────
export const LoginScreen = ({ navigation }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim())
      return Alert.alert('Campos requeridos', 'Introduce tu email y contraseña.');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Error', parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <Text style={styles.logo}>CutGo</Text>
            <Text style={styles.tagline}>Tu barbería, sin esperas</Text>
          </View>

          <View style={styles.form}>
            <Input label="Email"      value={email}    onChangeText={setEmail}    keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="tu@email.com" />
            <Input label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            <Button title={loading ? 'Entrando...' : 'Entrar'} onPress={handleLogin} loading={loading} style={{ marginTop: spacing.sm }} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Regístrate gratis</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────
//  REGISTER — pantalla unificada con selector
//  de rol. Sin precios hardcodeados.
//  El dueño configura servicios/precios desde
//  el Panel del Local una vez dentro de la app.
// ─────────────────────────────────────────────
export const RegisterScreen = ({ navigation }) => {
  const [role, setRole]     = useState('client'); // 'client' | 'owner'
  const [step, setStep]     = useState(1);
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);

  // Campos comunes
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');

  // Solo dueño
  const [shopName, setShopName] = useState('');
  const [address, setAddress]   = useState('');
  const [city, setCity]         = useState('');

  const resetFields = () => {
    setName(''); setEmail(''); setPhone(''); setPassword('');
    setShopName(''); setAddress(''); setCity('');
    setStep(1);
  };

  const changeRole = (r) => { setRole(r); resetFields(); };

  const goNext = () => {
    if (!name.trim())     return Alert.alert('Faltan datos', 'Escribe tu nombre completo.');
    if (!email.trim())    return Alert.alert('Faltan datos', 'Escribe tu email.');
    if (password.length < 6) return Alert.alert('Contraseña corta', 'La contraseña debe tener al menos 6 caracteres.');
    setStep(2);
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || password.length < 6)
      return Alert.alert('Faltan datos', 'Nombre, email y contraseña (mín. 6 caracteres) son obligatorios.');
    if (role === 'owner' && (!shopName.trim() || !address.trim()))
      return Alert.alert('Faltan datos', 'El nombre del local y la dirección son obligatorios.');

    setLoading(true);
    try {
      const payload = {
        name:     name.trim(),
        email:    email.trim().toLowerCase(),
        phone:    phone.trim(),
        password,
        role,
      };
      if (role === 'owner') {
        payload.shop_name = shopName.trim();
        payload.address   = address.trim();
        payload.city      = city.trim();
      }
      await register(payload);
    } catch (err) {
      Alert.alert('Error al registrarse', parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <Text style={styles.logo}>CutGo</Text>
            <Text style={styles.tagline}>Crea tu cuenta</Text>
          </View>

          {/* ── Selector de rol ── */}
          <View style={styles.roleRow}>
            <TouchableOpacity style={[styles.roleBtn, role === 'client' && styles.roleBtnActive]} onPress={() => changeRole('client')}>
              <Text style={[styles.roleBtnText, role === 'client' && styles.roleBtnTextActive]}>✂ Soy cliente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roleBtn, role === 'owner' && styles.roleBtnActive]} onPress={() => changeRole('owner')}>
              <Text style={[styles.roleBtnText, role === 'owner' && styles.roleBtnTextActive]}>💈 Soy barbero</Text>
            </TouchableOpacity>
          </View>

          {/* Barra de progreso (solo dueño) */}
          {role === 'owner' && (
            <View style={styles.progressRow}>
              <View style={[styles.progressStep, styles.progressStepActive]} />
              <View style={[styles.progressStep, step === 2 && styles.progressStepActive]} />
            </View>
          )}

          <View style={styles.form}>

            {/* PASO 1 */}
            {step === 1 && (
              <>
                <Text style={styles.stepLabel}>Datos de acceso</Text>
                <Input label="Nombre completo" value={name}     onChangeText={setName}     placeholder="Tu nombre" />
                <Input label="Email"           value={email}    onChangeText={setEmail}    keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="tu@email.com" />
                <Input label="Teléfono"        value={phone}    onChangeText={setPhone}    keyboardType="phone-pad" placeholder="+34 600 000 000" />
                <Input label="Contraseña"      value={password} onChangeText={setPassword} secureTextEntry placeholder="Mínimo 6 caracteres" />

                {role === 'client' ? (
                  <Button title={loading ? 'Creando cuenta...' : 'Crear cuenta'} onPress={handleRegister} loading={loading} style={{ marginTop: spacing.sm }} />
                ) : (
                  <Button title="Continuar →" onPress={goNext} style={{ marginTop: spacing.sm }} />
                )}
              </>
            )}

            {/* PASO 2 — solo dueño */}
            {step === 2 && role === 'owner' && (
              <>
                <Text style={styles.stepLabel}>Tu barbería</Text>

                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    Los servicios, precios y horarios los configuras tú mismo desde el panel una vez dentro. Sin límites.
                  </Text>
                </View>

                <Input label="Nombre del local"  value={shopName} onChangeText={setShopName} placeholder="Ej: Barbería El Fígaro" />
                <Input label="Dirección"         value={address}  onChangeText={setAddress}  placeholder="Calle Mayor 12, Madrid" />
                <Input label="Ciudad"            value={city}     onChangeText={setCity}      placeholder="Madrid, Barcelona..." />

                <Button title={loading ? 'Creando...' : 'Crear mi barbería gratis'} onPress={handleRegister} loading={loading} style={{ marginTop: spacing.sm }} />
                <TouchableOpacity style={{ alignSelf: 'center', marginTop: spacing.md }} onPress={() => setStep(1)}>
                  <Text style={{ color: colors.gray, fontSize: 13 }}>← Volver</Text>
                </TouchableOpacity>
              </>
            )}

          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>Inicia sesión</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Alias por compatibilidad con navigators que usen 'RegisterBarber'
export const RegisterBarberScreen = RegisterScreen;

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.black },
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },

  header:  { paddingTop: spacing.xxl * 2, paddingBottom: spacing.xl, alignItems: 'center' },
  logo:    { fontSize: 42, ...fonts.heading, color: colors.gold, letterSpacing: 2 },
  tagline: { fontSize: 14, color: colors.gray, marginTop: 6 },

  roleRow:          { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  roleBtn:          { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.25)', alignItems: 'center' },
  roleBtnActive:    { backgroundColor: colors.gold, borderColor: colors.gold },
  roleBtnText:      { fontSize: 14, color: colors.gray, ...fonts.bodyMed },
  roleBtnTextActive:{ color: colors.black },

  progressRow:        { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  progressStep:       { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  progressStepActive: { backgroundColor: colors.gold },

  form: {
    backgroundColor: colors.dark || '#1a1a1a',
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
  },

  stepLabel: { fontSize: 11, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md },

  infoBox:     { backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  infoBoxText: { fontSize: 12, color: colors.gray, lineHeight: 18 },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontSize: 14, color: colors.gray },
  footerLink: { fontSize: 14, color: colors.gold, ...fonts.bodyMed },
});
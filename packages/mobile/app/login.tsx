import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuthStore();
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) return;
    const result = await login(username, password);
    if (result.success) {
      router.replace('/(tabs)/dashboard');
    } else {
      Alert.alert('Login Failed', result.message || 'Invalid credentials');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>SAK</Text>
        </View>
        <Text style={styles.title}>Sir Apollo Kaggwa Schools</Text>
        <Text style={styles.subtitle}>Staff Profiling System</Text>

        <View style={styles.card}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter username"
            placeholderTextColor="#64748b"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!isLoading}
          />

          <Text style={[styles.label, { marginTop: 12 }]}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isLoading}
          />

          <TouchableOpacity
            style={[styles.button, (!username || !password || isLoading) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!username || !password || isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© {new Date().getFullYear()} SAK Schools – Since 1996</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', brand: '#3b82f6', text: '#f1f5f9', muted: '#64748b' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoBox: {
    width: 64, height: 64, backgroundColor: C.brand,
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  logoText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  title: { color: C.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 28 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border },
  label: { color: C.muted, fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  input: {
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 14,
  },
  button: {
    backgroundColor: C.brand, borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footer: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 24 },
});

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../src/store/authStore';

const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', brand: '#3b82f6', text: '#f1f5f9', muted: '#64748b', emerald: '#10b981' };

export default function DashboardTab() {
  const { user, serverUrl, token } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['mobile', 'reports', 'summary'],
    queryFn: async () => {
      const { data } = await axios.get(`${serverUrl}/api/reports/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });

  const s = data as { totalStaff?: number; activeStaff?: number } | undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.welcome}>Welcome, {user?.username} 👋</Text>
      <Text style={styles.role}>{user?.role?.name}</Text>

      {isLoading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 32 }} />
      ) : (
        <View style={styles.grid}>
          {[
            { label: 'Total Staff', value: s?.totalStaff ?? 0, color: C.brand },
            { label: 'Active Staff', value: s?.activeStaff ?? 0, color: C.emerald },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color }]}>{value}</Text>
              <Text style={styles.kpiLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          SAK Staff Profiling System{'\n'}Sir Apollo Kaggwa Schools – Since 1996
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  welcome: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  role: { color: C.muted, fontSize: 13, marginBottom: 24 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  kpiCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 20, alignItems: 'center',
  },
  kpiValue: { fontSize: 36, fontWeight: '800' },
  kpiLabel: { color: C.muted, fontSize: 12, marginTop: 4 },
  infoBox: {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  infoText: { color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 20 },
});

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../src/store/authStore';

const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', brand: '#3b82f6', text: '#f1f5f9', muted: '#64748b', emerald: '#10b981', amber: '#f59e0b' };

type Summary = {
  totalStaff?: number;
  activeStaff?: number;
  terminatedStaff?: number;
  onLeaveStaff?: number;
  staffPerCampus?: { campus_name: string; count: number }[];
  performanceRanking?: { first_name: string; last_name: string; avg_score: number }[];
};

export default function ReportsTab() {
  const { serverUrl, token } = useAuthStore();

  const { data: summary, isLoading: loadingS } = useQuery({
    queryKey: ['mobile', 'reports', 'summary'],
    queryFn: async (): Promise<Summary> => {
      const { data } = await axios.get(`${serverUrl}/api/reports/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });

  const { data: campus, isLoading: loadingC } = useQuery({
    queryKey: ['mobile', 'reports', 'campus'],
    queryFn: async (): Promise<Summary> => {
      const { data } = await axios.get(`${serverUrl}/api/reports/staff-per-campus`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });

  const { data: ranking, isLoading: loadingR } = useQuery({
    queryKey: ['mobile', 'reports', 'ranking'],
    queryFn: async (): Promise<{ data: Summary['performanceRanking'] }>() => {
      const { data } = await axios.get(`${serverUrl}/api/reports/performance-ranking`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });

  const isLoading = loadingS || loadingC || loadingR;
  const campusList: { campus_name: string; count: number }[] = (campus as any)?.data ?? [];
  const rankList: { first_name: string; last_name: string; avg_score: number }[] = (ranking as any)?.data ?? [];

  const maxCount = Math.max(...campusList.map((c) => Number(c.count)), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {isLoading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 32 }} />
      ) : (
        <>
          {/* Summary KPIs */}
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.kpiRow}>
            {[
              { label: 'Total', value: (summary as any)?.totalStaff ?? 0, color: C.brand },
              { label: 'Active', value: (summary as any)?.activeStaff ?? 0, color: C.emerald },
              { label: 'Terminated', value: (summary as any)?.terminatedStaff ?? 0, color: '#ef4444' },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.kpiCard}>
                <Text style={[styles.kpiValue, { color }]}>{value}</Text>
                <Text style={styles.kpiLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Staff Per Campus */}
          <Text style={styles.sectionTitle}>Staff Per Campus</Text>
          <View style={styles.card}>
            {campusList.length === 0 ? (
              <Text style={styles.empty}>No data</Text>
            ) : (
              campusList.map((c) => (
                <View key={c.campus_name} style={styles.barRow}>
                  <Text style={styles.barLabel}>{c.campus_name}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(Number(c.count) / maxCount) * 100}%` }]} />
                  </View>
                  <Text style={styles.barCount}>{c.count}</Text>
                </View>
              ))
            )}
          </View>

          {/* Performance Ranking */}
          <Text style={styles.sectionTitle}>Performance Ranking</Text>
          <View style={styles.card}>
            {rankList.length === 0 ? (
              <Text style={styles.empty}>No data</Text>
            ) : (
              rankList.slice(0, 10).map((r, i) => (
                <View key={i} style={styles.rankRow}>
                  <Text style={styles.rankNo}>#{i + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{r.first_name} {r.last_name}</Text>
                  <Text style={[styles.rankScore, { color: r.avg_score >= 70 ? C.emerald : C.amber }]}>
                    {Number(r.avg_score).toFixed(1)}%
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  sectionTitle: { color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 10, marginTop: 8 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpiCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, padding: 14, alignItems: 'center',
  },
  kpiValue: { fontSize: 28, fontWeight: '800' },
  kpiLabel: { color: C.muted, fontSize: 11, marginTop: 2 },
  card: {
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, padding: 16, marginBottom: 20,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  barLabel: { color: C.text, fontSize: 12, width: 80 },
  barTrack: { flex: 1, height: 10, backgroundColor: '#334155', borderRadius: 5 },
  barFill: { height: 10, backgroundColor: C.brand, borderRadius: 5 },
  barCount: { color: C.muted, fontSize: 12, width: 28, textAlign: 'right' },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  rankNo: { color: C.muted, fontSize: 13, width: 28 },
  rankName: { flex: 1, color: C.text, fontSize: 13 },
  rankScore: { fontSize: 14, fontWeight: '700' },
  empty: { color: C.muted, textAlign: 'center', paddingVertical: 12, fontSize: 13 },
});

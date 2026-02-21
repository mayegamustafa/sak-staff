import React from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../src/store/authStore';
import { hasPermission } from '@sak/shared';
import { MODULES, ACTIONS } from '@sak/shared';

const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', brand: '#3b82f6', text: '#f1f5f9', muted: '#64748b' };

type Transfer = {
  id: string;
  staff_no: string;
  first_name: string;
  last_name: string;
  transfer_type: string;
  status: string;
  from_campus_name?: string;
  to_campus_name?: string;
  effective_date: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  completed: '#6366f1',
};

export default function TransfersTab() {
  const { serverUrl, token, user } = useAuthStore();
  const qc = useQueryClient();
  const canApprove = hasPermission(user?.role?.slug ?? '', MODULES.TRANSFERS, ACTIONS.APPROVE);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mobile', 'transfers'],
    queryFn: async () => {
      const { data } = await axios.get(`${serverUrl}/api/transfers`, {
        params: { limit: 50, page: 1 },
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      axios.patch(`${serverUrl}/api/transfers/${id}/approve`, {}, { headers: { Authorization: `Bearer ${token}` } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile', 'transfers'] }),
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      axios.patch(`${serverUrl}/api/transfers/${id}/reject`, {}, { headers: { Authorization: `Bearer ${token}` } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile', 'transfers'] }),
  });

  const transfers: Transfer[] = data?.data ?? [];

  const renderItem = ({ item }: { item: Transfer }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
        <StatusPill status={item.status} />
      </View>
      <Text style={styles.sub}>{item.staff_no} · {item.transfer_type}</Text>
      {item.from_campus_name && (
        <Text style={styles.route}>{item.from_campus_name} → {item.to_campus_name ?? '—'}</Text>
      )}
      <Text style={styles.date}>Effective: {item.effective_date?.slice(0, 10)}</Text>

      {canApprove && item.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.approveBtn} onPress={() => approve.mutate(item.id)}>
            <Text style={styles.btnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => reject.mutate(item.id)}>
            <Text style={styles.btnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<Text style={styles.empty}>No transfers found</Text>}
        />
      )}
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? C.muted;
  return (
    <View style={[styles.pill, { backgroundColor: `${color}22`, borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, padding: 14, marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { color: C.text, fontWeight: '600', fontSize: 15 },
  sub: { color: C.muted, fontSize: 12 },
  route: { color: '#93c5fd', fontSize: 12, marginTop: 4 },
  date: { color: C.muted, fontSize: 12, marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approveBtn: { flex: 1, backgroundColor: '#059669', borderRadius: 8, padding: 10, alignItems: 'center' },
  rejectBtn: { flex: 1, backgroundColor: '#dc2626', borderRadius: 8, padding: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },
});

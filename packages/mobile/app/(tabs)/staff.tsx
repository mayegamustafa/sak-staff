import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { useAuthStore } from '../../src/store/authStore';

const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', brand: '#3b82f6', text: '#f1f5f9', muted: '#64748b', input: '#1e293b' };

type Employee = { id: string; staff_no: string; first_name: string; last_name: string; position?: string; employment_status?: string };

export default function StaffTab() {
  const { serverUrl, token } = useAuthStore();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mobile', 'employees', search],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50', page: '1' };
      if (search) params.search = search;
      const { data } = await axios.get(`${serverUrl}/api/employees`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });

  const employees: Employee[] = data?.data ?? [];

  const renderItem = ({ item }: { item: Employee }) => (
    <TouchableOpacity style={styles.row} onPress={() => router.push(`/employee/${item.id}` as never)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.sub}>{item.staff_no} · {item.position ?? 'N/A'}</Text>
      </View>
      <StatusBadge status={item.employment_status ?? 'active'} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name, staff no..."
        placeholderTextColor={C.muted}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />
      {isLoading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 32 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<Text style={styles.empty}>No staff found</Text>}
        />
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: '#10b981', terminated: '#ef4444', resigned: '#f59e0b', suspended: '#f59e0b',
  };
  const color = map[status] ?? '#64748b';
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  searchInput: {
    margin: 16, backgroundColor: C.input, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10,
    color: C.text, fontSize: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    marginHorizontal: 16, marginBottom: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, padding: 12, gap: 12,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: C.text, fontWeight: '700', fontSize: 14 },
  name: { color: C.text, fontWeight: '600', fontSize: 14 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  badge: {
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },
});

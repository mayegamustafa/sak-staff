import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView,
} from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncStore } from '../../src/store/syncStore';

const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', brand: '#3b82f6', text: '#f1f5f9', muted: '#64748b', red: '#ef4444', emerald: '#10b981' };

export default function ProfileTab() {
  const { user, logout, serverUrl, setServerUrl } = useAuthStore();
  const { isSyncing, lastSyncAt, triggerSync } = useSyncStore();
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(serverUrl ?? '');

  const handleSaveUrl = () => {
    if (urlInput.trim()) {
      setServerUrl(urlInput.trim());
    }
    setEditingUrl(false);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.username?.slice(0, 2).toUpperCase() ?? 'ME'}
          </Text>
        </View>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.roleName}>{user?.role?.name}</Text>
      </View>

      {/* Server URL */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SERVER URL</Text>
        {editingUrl ? (
          <View style={{ gap: 8 }}>
            <TextInput
              style={styles.input}
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSaveUrl}
              placeholderTextColor={C.muted}
              placeholder="http://192.168.x.x:4000"
            />
            <View style={styles.rowBtns}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingUrl(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.row} onPress={() => { setUrlInput(serverUrl ?? ''); setEditingUrl(true); }}>
            <Text style={styles.rowValue} numberOfLines={1}>{serverUrl || 'Not set'}</Text>
            <Text style={styles.edit}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sync */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SYNC</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Last synced</Text>
            <Text style={styles.rowValue}>
              {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
            onPress={triggerSync}
            disabled={isSyncing}
          >
            <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing…' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>SAK Staff Profiling System v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },
  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 24 },
  username: { color: C.text, fontWeight: '700', fontSize: 20 },
  roleName: { color: C.brand, fontSize: 13, marginTop: 2 },
  section: {
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, padding: 14, marginBottom: 14,
  },
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: C.muted, fontSize: 12 },
  rowValue: { color: C.text, fontSize: 14, flex: 1 },
  edit: { color: C.brand, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1,
    borderColor: C.border, padding: 10, color: C.text, fontSize: 14,
  },
  rowBtns: { flexDirection: 'row', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: C.brand, borderRadius: 8, padding: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: C.border, borderRadius: 8, padding: 10, alignItems: 'center' },
  cancelBtnText: { color: C.text, fontWeight: '600' },
  syncBtn: {
    backgroundColor: '#0ea5e9', borderRadius: 8, paddingHorizontal: 16,
    paddingVertical: 8, alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.5 },
  syncBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  logoutBtn: {
    backgroundColor: '#7f1d1d', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: C.red,
  },
  logoutText: { color: C.red, fontWeight: '700', fontSize: 16 },
  version: { color: C.muted, textAlign: 'center', fontSize: 11, marginTop: 24 },
});

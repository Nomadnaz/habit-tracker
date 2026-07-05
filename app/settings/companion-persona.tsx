// ─────────────────────────────────────────────────────────────────────────
// Per-companion persona setup (task 020, minimal): name + photo, writing to
// companion_personas. Photo is stored as a local file URI for now (same
// approach lib/meals-data.ts uses for meal photos) — a real Supabase
// Storage upload is future hardening, not part of this task's minimal scope.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { companions, type CompanionType } from '@/lib/companions';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

export default function CompanionPersona() {
  const router = useRouter();
  const { companionType } = useLocalSearchParams<{ companionType: string }>();
  const cfg = companions[companionType as CompanionType];

  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !companionType) { setLoaded(true); return; }
    const { data } = await supabase
      .from('companion_personas')
      .select('name, photo_url')
      .eq('user_id', user.id)
      .eq('companion_type', companionType)
      .maybeSingle();
    if (data) {
      setName(data.name ?? '');
      setPhotoUri(data.photo_url ?? null);
    }
    setLoaded(true);
  }, [companionType]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function pickPhoto() {
    Alert.alert('Companion photo', undefined, [
      { text: 'Take Photo', onPress: () => launch('camera') },
      { text: 'Choose from Library', onPress: () => launch('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launch(from: 'camera' | 'library') {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      }
      if (!result.canceled && result.assets?.[0]) setPhotoUri(result.assets[0].uri);
    } catch { /* user cancelled or permission denied — no-op */ }
  }

  async function save() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !companionType) return;
    setSaving(true);
    try {
      await supabase.from('companion_personas').upsert({
        user_id: user.id, companion_type: companionType, name: name.trim() || null, photo_url: photoUri,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 40 }} color={ORANGE} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>{cfg?.defaultName ?? 'COMPANION'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.photoWrap} onPress={pickPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <MaterialCommunityIcons name="account-circle-outline" size={64} color={MUTED} />
          )}
          <Text style={styles.photoLabel}>TAP TO CHANGE PHOTO</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder={`Name (default: ${cfg?.defaultName ?? ''})`}
          placeholderTextColor={MUTED}
          value={name}
          onChangeText={setName}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontFamily: BOLD, fontSize: 14, color: INK },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 16, alignItems: 'center' },
  photoWrap: { alignItems: 'center', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  photoLabel: { fontFamily: REG, fontSize: 9, color: MUTED },
  input: {
    width: '100%', borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 14,
    fontFamily: REG, fontSize: 13, color: INK, backgroundColor: CARD,
  },
  saveBtn: { width: '100%', backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
});

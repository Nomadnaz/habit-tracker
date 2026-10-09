// ─────────────────────────────────────────────────────────────────────────
// CAPTURE — dedicated photo-capture screen (Cal AI's flow: camera page →
// analyzing state → confirm). Replaces the old Alert.alert action-sheet
// chooser with two real buttons on their own full page.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import { estimateMealFromPhoto } from '@/lib/foodVision';
import type { MealType } from '@/lib/meals-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;
const BOLD = F.mono;
const REG = F.mono;

// Rough time-of-day guess so a snapped meal lands in a sensible group.
function guessMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export default function CaptureScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function pickImage(from: 'camera' | 'library') {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Enable camera access in Settings to snap a meal.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      await processImage(result.assets[0].uri);
    } catch {
      Alert.alert('Could not open the photo', 'Try again or add the meal manually.');
    }
  }

  async function processImage(uri: string) {
    setBusy(true);
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const estimate = await estimateMealFromPhoto(compressed.base64 ?? '');
      if (!estimate) {
        // Vision call failed/unreachable — no fabricated numbers; blank
        // editable confirm screen with the photo attached.
        router.replace({ pathname: '/calorie/confirm', params: { photoUri: compressed.uri } });
        return;
      }
      router.replace({
        pathname: '/calorie/confirm',
        params: {
          name: estimate.name, mealType: guessMealType(), calories: String(estimate.calories),
          proteinG: String(estimate.proteinG), carbsG: String(estimate.carbsG), fatG: String(estimate.fatG),
          photoUri: compressed.uri, source: 'ai',
        },
      });
    } catch {
      // Manipulation failed — fall back to a manual entry with the photo attached.
      router.replace({ pathname: '/calorie/confirm', params: { photoUri: uri } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={C.hot} />
        </TouchableOpacity>
        <Text style={s.title}>SNAP A MEAL</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={s.body}>
        <MaterialCommunityIcons name="camera-outline" size={72} color={C.hot} />
        <Text style={s.hint}>Take a photo of your plate, or choose one from your library.</Text>

        <TouchableOpacity
          style={[s.btn, s.btnPrimary]}
          activeOpacity={0.85}
          disabled={busy}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); pickImage('camera'); }}
        >
          <MaterialCommunityIcons name="camera" size={20} color={C.onHot} />
          <Text style={s.btnPrimaryText}>TAKE PHOTO</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.btn, s.btnGhost]}
          activeOpacity={0.85}
          disabled={busy}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); pickImage('library'); }}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={20} color={C.hot} />
          <Text style={s.btnGhostText}>CHOOSE FROM LIBRARY</Text>
        </TouchableOpacity>
      </View>

      {busy && (
        <View style={s.busyOverlay}>
          <ActivityIndicator color={C.hot} size="large" />
          <Text style={s.busyText}>ESTIMATING…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  hint: { fontFamily: REG, fontSize: 13, color: C.dim, textAlign: 'center', marginBottom: 8, lineHeight: 19 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 50, borderRadius: 12 },
  btnPrimary: { backgroundColor: ORANGE },
  btnPrimaryText: { fontFamily: BOLD, fontSize: 13, color: C.onHot, letterSpacing: 1 },
  btnGhost: { borderWidth: 1.5, borderColor: C.hot, backgroundColor: C.surface },
  btnGhostText: { fontFamily: BOLD, fontSize: 13, color: C.hot, letterSpacing: 1 },
  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(244,242,238,0.9)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  busyText: { fontFamily: BOLD, fontSize: 12, color: C.ink, letterSpacing: 2 },
});

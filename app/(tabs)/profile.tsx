// Profile tab — still mostly a stub (full build is task 070: Social &
// Profile page + world rankings). Task 063 needs SOMEWHERE to show the
// badge grid ("hidden badges show as '???' until unlocked"), so that one
// piece is real; everything else here stays a placeholder.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BADGES, getEarnedBadgeIds } from '@/lib/badges';
import { supabase } from '@/lib/supabase';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

export default function ProfileScreen() {
  const router = useRouter();
  const [earned, setEarned] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    getEarnedBadgeIds().then(setEarned);
  }, []));

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>PROFILE</Text>
          <TouchableOpacity onPress={signOut} hitSlop={10}>
            <MaterialCommunityIcons name="logout" size={20} color={ORANGE} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Full profile, stats & rankings coming soon.</Text>
      </View>

      <Text style={styles.sectionLabel}>BADGES</Text>
      <View style={styles.grid}>
        {BADGES.map(b => {
          const unlocked = earned.includes(b.id);
          const showHidden = b.hidden && !unlocked;
          return (
            <View key={b.id} style={[styles.badge, !unlocked && styles.badgeLocked]}>
              <MaterialCommunityIcons
                name={unlocked ? 'medal' : 'lock-outline'}
                size={22}
                color={unlocked ? ORANGE : MUTED}
              />
              <Text style={[styles.badgeName, !unlocked && styles.badgeNameLocked]}>
                {showHidden ? '???' : b.name}
              </Text>
              <Text style={styles.badgeDesc}>{showHidden ? '???' : b.description}</Text>
            </View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  subtitle: { fontFamily: REG, fontSize: 11, color: MUTED, marginTop: 4 },
  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: MUTED, paddingHorizontal: 20, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  badge: {
    width: '46%', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 12, alignItems: 'center', gap: 4,
  },
  badgeLocked: { opacity: 0.6 },
  badgeName: { fontFamily: BOLD, fontSize: 11, color: INK, textAlign: 'center' },
  badgeNameLocked: { color: MUTED },
  badgeDesc: { fontFamily: REG, fontSize: 9, color: MUTED, textAlign: 'center' },
});

// Profile tab — still mostly a stub (full build is task 070: Social &
// Profile page + world rankings). Task 063 needs SOMEWHERE to show the
// badge grid ("hidden badges show as '???' until unlocked"), so that one
// piece is real; everything else here stays a placeholder.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BADGES, getEarnedBadgeIds } from '@/lib/badges';
import { supabase } from '@/lib/supabase';

import { C, F } from '@/lib/theme';
import { ScreenHeader, HeaderIcon } from '@/components/ScreenHeader';
const MUTED  = C.dim;
const BOLD = F.mono;
const REG = F.mono;

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
      <ScreenHeader
        title="PROFILE"
        right={<HeaderIcon icon="logout" label="Sign out" onPress={signOut} />}
      />

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
                color={unlocked ? C.hot : C.dim}
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
  safe: { flex: 1, backgroundColor: C.bg },
  sectionLabel: { fontFamily: BOLD, fontSize: 12, color: C.dim, paddingHorizontal: 20, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  badge: {
    width: '46%', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line,
    padding: 12, alignItems: 'center', gap: 4,
  },
  badgeLocked: { opacity: 0.85 },
  badgeName: { fontFamily: BOLD, fontSize: 12, color: C.ink, textAlign: 'center' },
  badgeNameLocked: { color: MUTED },
  badgeDesc: { fontFamily: REG, fontSize: 10, color: C.dim, textAlign: 'center' },
});

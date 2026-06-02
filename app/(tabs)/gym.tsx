import { View, Text, StyleSheet } from 'react-native';

export default function GymScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gym Tracker</Text>
      <Text style={styles.subtitle}>Muscle groups & PBs coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  subtitle: { color: '#555', fontSize: 14, marginTop: 8 },
});

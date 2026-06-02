import { View, Text, StyleSheet } from 'react-native';

export default function TreeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Bonsai</Text>
      <Text style={styles.subtitle}>Your tree grows with your habits</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  subtitle: { color: '#555', fontSize: 14, marginTop: 8 },
});

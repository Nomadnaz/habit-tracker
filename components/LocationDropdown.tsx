import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type LocationDropdownProps = {
  value: string;
  onChange: (text: string) => void;
};

export function LocationDropdown({ value, onChange }: LocationDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.fieldLabel}>LOCATION</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#8C857B"
        />
      </TouchableOpacity>
      {open && (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="TYPE LOCATION..."
          placeholderTextColor="#C7C1B8"
          autoCapitalize="characters"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  fieldLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 9,
    color: '#8C857B',
    letterSpacing: 1,
  },
  input: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: '#1A1714',
    borderBottomWidth: 2,
    borderBottomColor: '#E5E1DA',
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginBottom: 4,
  },
});

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { C, F } from '@/lib/theme';
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
          color={C.dim}
        />
      </TouchableOpacity>
      {open && (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="TYPE LOCATION..."
          placeholderTextColor={C.faint}
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
    fontFamily: F.mono,
    fontSize: 10,
    color: C.dim,
    letterSpacing: 1,
  },
  input: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.ink,
    borderBottomWidth: 2,
    borderBottomColor: C.line,
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginBottom: 4,
  },
});

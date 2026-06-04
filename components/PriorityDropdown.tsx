import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Priority } from '@/lib/tasks-core';

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: 'LOW', label: 'LOW' },
  { id: 'MEDIUM', label: 'MEDIUM' },
  { id: 'HIGH', label: 'HIGH' },
];

type PriorityDropdownProps = {
  value: Priority;
  onChange: (p: Priority) => void;
};

export function PriorityDropdown({ value, onChange }: PriorityDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.fieldLabel}>PRIORITY</Text>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.dropdownText}>{value}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#8C857B"
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.panel}>
          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {PRIORITY_OPTIONS.map(opt => {
              const selected = value === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.option, selected && styles.optionOn]}
                  onPress={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextOn]}>
                    {opt.label}
                  </Text>
                  {selected && (
                    <MaterialCommunityIcons name="check" size={14} color="#FCFBF9" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  fieldLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 9,
    color: '#8C857B',
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#E5E1DA',
    paddingVertical: 10,
  },
  dropdownText: {
    flex: 1,
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: '#1A1714',
    marginRight: 8,
  },
  panel: {
    marginTop: 4,
    borderWidth: 2,
    borderColor: '#E5E1DA',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  list: { maxHeight: 120 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E1DA',
  },
  optionOn: {
    backgroundColor: '#FF4D00',
  },
  optionText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 11,
    color: '#1A1714',
  },
  optionTextOn: {
    fontFamily: 'PixeloidSans_700Bold',
    color: '#FCFBF9',
  },
});

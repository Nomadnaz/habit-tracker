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

import { C, F } from '@/lib/theme';
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
          color={C.dim}
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
                    <MaterialCommunityIcons name="check" size={14} color={C.onHot} />
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
    fontFamily: F.mono,
    fontSize: 10,
    color: C.dim,
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: C.line,
    paddingVertical: 10,
  },
  dropdownText: {
    flex: 1,
    fontFamily: F.mono,
    fontSize: 12,
    color: C.ink,
    marginRight: 8,
  },
  panel: {
    marginTop: 4,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 8,
    backgroundColor: C.surface,
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
    borderBottomColor: C.line,
  },
  optionOn: {
    backgroundColor: C.hot,
  },
  optionText: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.ink,
  },
  optionTextOn: {
    fontFamily: F.mono,
    color: C.onHot,
  },
});

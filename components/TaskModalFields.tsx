import { useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  TimeOfDayWheelPicker,
  ValueWheelPicker,
  SHEET_WHEEL_PALETTE,
} from '@/components/WheelPicker';
import { LocationDropdown } from '@/components/LocationDropdown';
import { PriorityDropdown } from '@/components/PriorityDropdown';
import { buildDateOptions } from '@/lib/task-schedule';
import type { Priority } from '@/lib/tasks-core';

type TaskModalFieldsProps = {
  dateIndex: number;
  onDatePreview: (index: number) => void;
  onDateCommit: (index: number) => void;
  hour: number;
  minute: number;
  onHourPreview: (h: number) => void;
  onHourCommit: (h: number) => void;
  onMinutePreview: (m: number) => void;
  onMinuteCommit: (m: number) => void;
  location: string;
  onLocationChange: (text: string) => void;
  priority: Priority;
  onPriorityChange: (p: Priority) => void;
  footer: ReactNode;
};

export function TaskModalFields({
  dateIndex,
  onDatePreview,
  onDateCommit,
  hour,
  minute,
  onHourPreview,
  onHourCommit,
  onMinutePreview,
  onMinuteCommit,
  location,
  onLocationChange,
  priority,
  onPriorityChange,
  footer,
}: TaskModalFieldsProps) {
  const dateOptions = useMemo(() => buildDateOptions(new Date()), []);

  return (
    <>
      <Text style={styles.fieldLabel}>DATE</Text>
      <View style={styles.dateWheelWrap}>
        <ValueWheelPicker
          label=""
          min={0}
          max={Math.max(0, dateOptions.length - 1)}
          value={dateIndex}
          palette={SHEET_WHEEL_PALETTE}
          formatValue={(i: number) => dateOptions[i]?.label ?? ''}
          onPreview={onDatePreview}
          onCommit={onDateCommit}
          compact
          showLabel={false}
        />
      </View>

      <TimeOfDayWheelPicker
        hour={hour}
        minute={minute}
        onHourChange={onHourPreview}
        onMinuteChange={onMinutePreview}
        onHourCommit={onHourCommit}
        onMinuteCommit={onMinuteCommit}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <LocationDropdown value={location} onChange={onLocationChange} />
        <PriorityDropdown value={priority} onChange={onPriorityChange} />
        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#FF4D00',
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  dateWheelWrap: {
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 340,
  },
  footer: {
    marginTop: 8,
  },
});

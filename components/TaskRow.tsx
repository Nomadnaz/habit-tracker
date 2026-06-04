import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  COMPLETE_FADE_MS,
  COMPLETE_HOLD_MS,
  TASK_LABEL_COLOR_ACTIVE,
  TASK_LABEL_COLOR_DONE,
  TASK_ROW_DONE_OPACITY,
  TASK_ROW_SLOT_PX,
  type Task,
  taskIndexColor,
} from '@/lib/tasks-core';
import { getTaskMetaParts } from '@/lib/task-schedule';
import { PixelLocationPin } from '@/components/PixelLocationPin';

export function InsertionGhost() {
  return <View style={styles.insertionGhost} />;
}

type TaskRowProps = {
  task: Task;
  taskIndex: number;
  isDragged: boolean;
  isCompleting: boolean;
  showGhostHere: boolean;
  draggingTaskIdRef: MutableRefObject<string | null>;
  completingIdsRef: MutableRefObject<Set<string>>;
  beginDragRef: MutableRefObject<(id: string, idx: number, x: number, y: number, rowWinY: number) => void>;
  dragMoveRef: MutableRefObject<(x: number, y: number) => void>;
  dragEndRef: MutableRefObject<(id: string) => void>;
  toggleTaskRef: MutableRefObject<(id: string) => void>;
  onFirstRowLayout?: (y: number) => void;
  editMode?: boolean;
  onRemove?: (id: string) => void;
  onEditPress?: (task: Task) => void;
};

export function TaskRow({
  task,
  taskIndex,
  isDragged,
  isCompleting,
  showGhostHere,
  draggingTaskIdRef,
  completingIdsRef,
  beginDragRef,
  dragMoveRef,
  dragEndRef,
  toggleTaskRef,
  onFirstRowLayout,
  editMode = false,
  onRemove,
  onEditPress,
}: TaskRowProps) {
  const rowRef = useRef<View>(null);
  const completeTint = useRef(new Animated.Value(task.done ? 1 : 0)).current;

  useEffect(() => {
    if (isCompleting) {
      completeTint.setValue(0);
      Animated.sequence([
        Animated.delay(COMPLETE_HOLD_MS),
        Animated.timing(completeTint, {
          toValue: 1,
          duration: COMPLETE_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }
    if (!task.done) {
      Animated.timing(completeTint, {
        toValue: 0,
        duration: COMPLETE_FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      return;
    }
    completeTint.setValue(1);
  }, [isCompleting, task.done, completeTint]);

  const labelColor = completeTint.interpolate({
    inputRange: [0, 1],
    outputRange: [TASK_LABEL_COLOR_ACTIVE, TASK_LABEL_COLOR_DONE],
  });
  const rowFadeOpacity = completeTint.interpolate({
    inputRange: [0, 1],
    outputRange: [1, TASK_ROW_DONE_OPACITY],
  });

  const gesture = useMemo(() => {
    if (editMode) return Gesture.Tap().enabled(false);

    const pan = Gesture.Pan()
      .activateAfterLongPress(250)
      .onStart(e => {
        if (completingIdsRef.current.has(task.id)) return;
        const fingerY = e.absoluteY;
        rowRef.current?.measureInWindow((_x, rowY) => {
          beginDragRef.current(task.id, taskIndex, e.absoluteX, fingerY, rowY);
        });
      })
      .onUpdate(e => {
        dragMoveRef.current(e.absoluteX, e.absoluteY);
      })
      .onEnd(() => {
        dragEndRef.current(task.id);
      })
      .onFinalize(() => {
        if (draggingTaskIdRef.current === task.id) dragEndRef.current(task.id);
      });

    return pan;
  }, [editMode, task.id, taskIndex, beginDragRef, dragMoveRef, dragEndRef, draggingTaskIdRef, completingIdsRef]);

  const meta = getTaskMetaParts(task);

  const rowBody = (
    <Animated.View
      style={[
        styles.taskRow,
        !editMode && (task.done || isCompleting) && { opacity: rowFadeOpacity },
      ]}
    >
      <View style={styles.taskMain}>
        <TouchableOpacity
          style={[styles.checkbox, task.done && styles.checkboxDone, editMode && styles.checkboxMuted]}
          onPress={() => {
            if (editMode || completingIdsRef.current.has(task.id)) return;
            toggleTaskRef.current(task.id);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {task.done && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
        <View style={styles.taskLabelWrap}>
          <Animated.Text
            style={[
              styles.taskLabel,
              { color: labelColor },
              task.done && styles.taskLabelDone,
            ]}
            numberOfLines={2}
          >
            {task.label}
          </Animated.Text>
          <View style={styles.metaRow}>
            <Text style={[styles.taskMeta, task.done && styles.taskMetaDone]} numberOfLines={1}>
              {meta.timeAndDuration}
            </Text>
            {meta.location ? (
              <View style={styles.locationSegment}>
                <Text style={[styles.taskMeta, styles.taskMetaSep, task.done && styles.taskMetaDone]}>
                  {' · '}
                </Text>
                <PixelLocationPin color={task.done ? '#B8B5B0' : '#FF4D00'} />
                <Text
                  style={[styles.taskMeta, styles.taskMetaLocation, task.done && styles.taskMetaDone]}
                  numberOfLines={1}
                >
                  {meta.location}
                </Text>
              </View>
            ) : null}
          </View>
          {task.priority && !task.done && !editMode && (
            <Text style={[styles.priorityTag, styles[`priority_${task.priority}`]]}>
              {task.priority}
            </Text>
          )}
        </View>
      </View>
      {editMode ? (
        <>
          <MaterialCommunityIcons
            name="pencil-outline"
            size={12}
            color="#FF4D00"
            style={styles.editModePencil}
          />
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => onRemove?.(task.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="minus-circle" size={26} color="#E03030" />
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.priorityIndexWrap}>
          <Text style={[styles.priorityIndexText, { color: taskIndexColor(taskIndex) }]}>
            {taskIndex + 1}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  const wrappedBody =
    editMode && onEditPress ? (
      <TouchableOpacity
        onPress={() => onEditPress(task)}
        activeOpacity={0.7}
        disabled={isCompleting}
      >
        {rowBody}
      </TouchableOpacity>
    ) : (
      rowBody
    );

  return (
    <View
      ref={rowRef}
      onLayout={() => {
        if (taskIndex !== 0 || !onFirstRowLayout) return;
        rowRef.current?.measureInWindow((_x, y) => onFirstRowLayout(y));
      }}
    >
      {!editMode && !isDragged && showGhostHere && <InsertionGhost />}
      {editMode ? (
        wrappedBody
      ) : (
        <GestureDetector gesture={gesture}>
          <View collapsable={false}>
            {isDragged ? <View style={styles.dragRowSpacer} /> : wrappedBody}
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  insertionGhost: {
    height: TASK_ROW_SLOT_PX - 6,
    marginBottom: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF4D00',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 77, 0, 0.06)',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderWidth: 2,
    borderColor: '#1A1714',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    flexShrink: 0,
  },
  checkboxDone: {
    backgroundColor: '#FF4D00',
    borderColor: '#FF4D00',
  },
  checkmark: {
    color: '#FCFBF9',
    fontSize: 14,
    fontWeight: 'bold',
  },
  taskLabelWrap: { flex: 1 },
  taskLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: '#000000',
    lineHeight: 16,
  },
  taskMeta: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#8C857B',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  taskMetaDone: {
    opacity: 0.55,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 3,
  },
  locationSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '70%',
  },
  taskMetaSep: {
    marginTop: 0,
  },
  taskMetaLocation: {
    flexShrink: 1,
  },
  editModePencil: {
    marginLeft: 4,
    marginRight: 2,
  },
  taskLabelDone: {
    textDecorationLine: 'line-through',
  },
  priorityTag: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    marginTop: 4,
    letterSpacing: 1,
  },
  priority_HIGH: { color: '#E03030' },
  priority_MEDIUM: { color: '#8C857B' },
  priority_LOW: { color: '#4A9B6F' },
  priorityIndexWrap: {
    marginLeft: 8,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityIndexText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    lineHeight: 16,
  },
  dragRowSpacer: {
    height: 0,
    marginBottom: 0,
  },
  checkboxMuted: {
    opacity: 0.45,
  },
  removeBtn: {
    marginLeft: 8,
    padding: 2,
  },
});

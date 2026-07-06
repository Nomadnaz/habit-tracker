import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  Modal, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
  PanResponder, GestureResponderEvent, PanResponderGestureState,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import type { Task } from '@/lib/tasks-core';
import { executeAction, type ProcessedAction } from '@/lib/actionExecutor';
import { companions, type CompanionType } from '@/lib/companions';

const ORANGE = '#FF4D00';
const INK = '#1A1714';
const MUTED = '#8C857B';
const FAINT = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD = '#FCFBF9';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatScreenProps {
  visible: boolean;
  onClose: () => void;
  onTasksUpdated: () => void;
  /**
   * Which companion this chat talks to (task 011, companion picker). Was
   * hardcoded to 'habitCoach' everywhere — an audit (2026-07-06) found this
   * meant 6 of the app's 9 companion configs (calorie/activity/sleep/goals/
   * mood, all already wired into buildContext) had no chat UI reachable at
   * all. Defaults to 'habitCoach' so the existing calendar-day call site's
   * behavior is unchanged.
   */
  companionType?: CompanionType;
  // selectedTasks/selectedDate are accepted for backward compatibility with
  // the existing calendar/day.tsx call site but unused in this component —
  // left optional rather than removed, out of scope for the companion-picker change.
  selectedTasks?: Task[];
  selectedDate?: string;
}

export default function ChatScreen({
  visible,
  onClose,
  onTasksUpdated,
  companionType = 'habitCoach',
}: ChatScreenProps) {
  const cfg = companions[companionType];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewActions, setPreviewActions] = useState<ProcessedAction[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const pan = useRef(new Animated.ValueXY()).current;

  // Swipe-to-close pan responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          Animated.event([null, { dy: pan.y }], { useNativeDriver: false })(evt, gestureState);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 100) {
          // User swiped down far enough, close the modal
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
          pan.setValue({ x: 0, y: 0 });
        } else {
          // Snap back
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const userMsg = userInput.trim();
    // Build conversation history (last 10 turns) BEFORE appending this message.
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
    setMessages(m => [...m, { role: 'user', content: userMsg }]);
    setUserInput('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Canonical ai-chat contract (task 013):
      //   { message, companionType, conversationHistory } → { response, actions }
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: userMsg,
          companionType,
          conversationHistory: history,
          // Lets the server resolve TODAY/tomorrow in local time instead of
          // UTC — see supabase/functions/_shared/localDate.ts (audit 2026-07-06).
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        console.error('Function error:', error);
        throw error;
      }
      if (!data?.response) throw new Error('No response from AI');

      setMessages(m => [...m, { role: 'assistant', content: data.response }]);

      const actions: ProcessedAction[] = Array.isArray(data.actions) ? data.actions : [];

      // High-confidence ('auto') → run them now through the app's local-first
      // flow so they appear in the app + Apple immediately.
      const auto = actions.filter(a => a.status === 'auto');
      const done: string[] = [];
      for (const a of auto) {
        try {
          const { summary } = await executeAction(a);
          done.push(summary);
        } catch (e: any) {
          done.push(e?.message || `Couldn't ${a.type}.`);
        }
      }
      if (done.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMessages(m => [...m, { role: 'assistant', content: done.map(d => `✓ ${d}`).join('\n') }]);
        onTasksUpdated();
      }

      // Medium-confidence / external → preview cards for the user to confirm.
      setPreviewActions(actions.filter(a => a.status === 'preview'));

      // Too-uncertain → surface the clarify prompt inline.
      const clarify = actions.filter(a => a.status === 'clarify');
      if (clarify.length > 0) {
        setMessages(m => [
          ...m,
          { role: 'assistant', content: clarify.map(c => c.message).filter(Boolean).join('\n') },
        ]);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg = err?.message || 'Sorry, I encountered an error. Please try again.';
      setMessages(m => [...m, { role: 'assistant', content: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (action: ProcessedAction) => {
    try {
      const { summary } = await executeAction(action);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewActions(prev => prev.filter(a => a !== action));
      setMessages(m => [...m, { role: 'assistant', content: `✓ ${summary}` }]);
      onTasksUpdated();
    } catch (err: any) {
      console.error('Error confirming action:', err);
      setMessages(m => [
        ...m,
        { role: 'assistant', content: err?.message || "Couldn't complete that action." },
      ]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Animated.View
        style={[styles.container, { transform: [{ translateY: pan.y }] }]}
        {...panResponder.panHandlers}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Text style={styles.title}>✨ {cfg.defaultName}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={28} color={INK} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((msg, i) => (
              <View key={i} style={[styles.messageBubble, msg.role === 'user' ? styles.userMessage : styles.aiMessage]}>
                <Text style={[styles.messageText, msg.role === 'user' ? styles.userMessageText : styles.aiMessageText]}>
                  {msg.content}
                </Text>
              </View>
            ))}

            {previewActions.length > 0 && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>Suggested Actions:</Text>
                {previewActions.map((action, i) => (
                  <View key={i} style={styles.actionCard}>
                    <View style={styles.actionHeader}>
                      <Text style={styles.actionType}>{action.type.replace(/_/g, ' ').toUpperCase()}</Text>
                      {typeof action.confidence === 'number' && (
                        <Text style={styles.confidence}>{Math.round(action.confidence * 100)}%</Text>
                      )}
                    </View>
                    <Text style={styles.explanation}>
                      {action.message ?? `Confirm to ${action.type.replace(/_/g, ' ')}?`}
                    </Text>
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.button, styles.confirmButton]}
                        onPress={() => handleConfirmAction(action)}
                      >
                        <Text style={styles.confirmButtonText}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.button, styles.rejectButton]}
                        onPress={() => setPreviewActions(previewActions.filter((_, idx) => idx !== i))}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={`Ask ${cfg.defaultName} anything...`}
              placeholderTextColor={FAINT}
              value={userInput}
              onChangeText={setUserInput}
              editable={!loading}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, loading && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={loading || !userInput.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialCommunityIcons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FCFBF9' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1, 
    borderBottomColor: BORDER 
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: FAINT,
    borderRadius: 2,
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
  },
  title: { fontFamily: 'PixeloidSans_700Bold', fontSize: 16, color: INK, flex: 1, textAlign: 'center' },
  closeButton: { padding: 8 },
  messagesContainer: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  messageBubble: { marginVertical: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, maxWidth: '85%' },
  userMessage: { alignSelf: 'flex-end', backgroundColor: ORANGE },
  aiMessage: { alignSelf: 'flex-start', backgroundColor: '#F5F5F5' },
  messageText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 13 },
  userMessageText: { color: '#fff' },
  aiMessageText: { color: INK },
  previewContainer: { marginVertical: 12, paddingHorizontal: 8 },
  previewLabel: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: ORANGE, marginBottom: 8 },
  actionCard: { backgroundColor: CARD, borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: ORANGE },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  actionType: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10, color: ORANGE },
  confidence: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: MUTED },
  explanation: { fontFamily: 'PixeloidSans_400Regular', fontSize: 10, color: INK, marginBottom: 10 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  confirmButton: { backgroundColor: ORANGE },
  confirmButtonText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 9, color: '#fff' },
  rejectButton: { backgroundColor: FAINT },
  rejectButtonText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 9, color: INK },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, gap: 8, borderTopWidth: 1, borderTopColor: BORDER },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'PixeloidSans_400Regular', fontSize: 12, color: INK, maxHeight: 100 },
  sendButton: { backgroundColor: ORANGE, width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
});

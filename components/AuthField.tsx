// A labelled field for the sign-in / sign-up forms (app/(auth)/login.tsx and
// onboarding's account step): dot-font label above, an eye to show the
// password, and a red line under it when it has a problem.

import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MIN_PASSWORD } from '@/lib/auth-links';
import { C, F } from '@/lib/theme';
import { hit } from '@/lib/hit';

type Props = TextInputProps & { label: string; secret?: boolean; problem?: string | null; ok?: boolean };

export const AuthField = forwardRef<TextInput, Props>(function AuthField({ label, secret, problem, ok, style, ...rest }, ref) {
  const [shown, setShown] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={st.labelRow}>
        <Text style={st.label}>{label}</Text>
        {ok && <MaterialCommunityIcons name="check" size={12} color={C.live} />}
      </View>
      <View style={[st.box, focus && st.boxFocus, !!problem && st.boxBad]}>
        <TextInput
          {...rest}
          ref={ref}
          style={[st.input, style]}
          placeholderTextColor={C.faint}
          secureTextEntry={secret && !shown}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={e => { setFocus(true); rest.onFocus?.(e); }}
          onBlur={e => { setFocus(false); rest.onBlur?.(e); }}
        />
        {secret && (
          <Pressable onPress={() => setShown(s => !s)} hitSlop={hit(18)} accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
            <MaterialCommunityIcons name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.dim} />
          </Pressable>
        )}
      </View>
      {!!problem && <Text style={st.problem}>{problem}</Text>}
    </View>
  );
});

/** The new-password checklist: each rule lights green as it's met. */
export function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  const rules = [
    { ok: password.length >= MIN_PASSWORD, text: `${MIN_PASSWORD}+ characters` },
    { ok: /[a-zA-Z]/.test(password) && /\d/.test(password), text: 'letters + a number' },
    { ok: confirm.length > 0 && confirm === password, text: 'both match' },
  ];
  return (
    <View style={st.rules}>
      {rules.map(r => (
        <View key={r.text} style={st.rule}>
          <View style={[st.ruleDot, r.ok && { backgroundColor: C.live }]} />
          <Text style={[st.ruleText, r.ok && { color: C.ink }]}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleDot: { width: 6, height: 6, backgroundColor: C.ghost },
  ruleText: { fontFamily: F.mono, fontSize: 11, color: C.faint },

  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: 14 },
  boxFocus: { borderColor: C.lineHi },
  boxBad: { borderColor: C.alert },
  input: { flex: 1, paddingVertical: 14, fontFamily: F.mono, fontSize: 14, color: C.ink },
  problem: { fontFamily: F.mono, fontSize: 11, color: C.alert },
});

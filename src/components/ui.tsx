import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/theme';

export function Card({ children, accent = false }: PropsWithChildren<{ accent?: boolean }>) {
  return <View style={[styles.card, accent && styles.cardAccent]}>{children}</View>;
}
export function Title({ children }: PropsWithChildren) { return <Text style={styles.title}>{children}</Text>; }
export function Label({ children }: PropsWithChildren) { return <Text style={styles.label}>{children}</Text>; }
export function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.field, props.style]} />;
}
export function Button({ label, onPress, disabled = false, secondary = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean; }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, danger && styles.danger, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}
export function Pill({ children }: PropsWithChildren) { return <View style={styles.pill}><Text style={styles.pillText}>{children}</Text></View>; }

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
  cardAccent: { borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  label: { fontSize: 12, fontWeight: '800', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.1 },
  field: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, fontSize: 16, color: colors.text },
  button: { backgroundColor: colors.accent, borderRadius: 15, padding: 15, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }, danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.42 }, pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  buttonText: { color: colors.black, fontSize: 16, fontWeight: '900' }, secondaryText: { color: colors.text },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.accentSoft },
  pillText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
});

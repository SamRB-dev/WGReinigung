import { useEffect, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/theme';

function FadeIn({ children, delay = 0 }: PropsWithChildren<{ delay?: number }>) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [delay, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export function Card({ children, accent = false }: PropsWithChildren<{ accent?: boolean }>) {
  return <FadeIn><View style={[styles.card, accent && styles.cardAccent]}>{children}</View></FadeIn>;
}
export function Title({ children }: PropsWithChildren) { return <FadeIn><Text style={styles.title}>{children}</Text></FadeIn>; }
export function Label({ children }: PropsWithChildren) { return <Text style={styles.label}>{children}</Text>; }
export function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.field, props.style]} />;
}
export function Button({ label, onPress, disabled = false, secondary = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean; }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (value: number) => Animated.spring(scale, { toValue: value, speed: 30, bounciness: 2, useNativeDriver: true }).start();

  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => !disabled && animateTo(0.97)}
      onPressOut={() => !disabled && animateTo(1)}
      style={[styles.button, secondary && styles.secondary, danger && styles.danger, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  </Animated.View>;
}
export function Pill({ children }: PropsWithChildren) { return <FadeIn><View style={styles.pill}><Text style={styles.pillText}>{children}</Text></View></FadeIn>; }

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
  cardAccent: { borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  label: { fontSize: 12, fontWeight: '800', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.1 },
  field: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, fontSize: 16, color: colors.text },
  button: { backgroundColor: colors.accent, borderRadius: 15, padding: 15, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }, danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.42 },
  buttonText: { color: colors.black, fontSize: 16, fontWeight: '900' }, secondaryText: { color: colors.text },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.accentSoft },
  pillText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
});

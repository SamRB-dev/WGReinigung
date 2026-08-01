import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/home'); else setLoading(false); }); }, []);
  async function signIn() {
    if (!email.trim()) return Alert.alert(t('email'), t('emailRequired'));
    if (password.length < 6) return Alert.alert(t('password'), t('passwordShort'));
    setLoading(true); const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); setLoading(false);
    if (error) Alert.alert('Could not sign in', error.message); else router.replace('/home');
  }
  async function signUp() {
    if (!email.trim()) return Alert.alert(t('email'), t('emailRequired'));
    if (password.length < 6) return Alert.alert(t('password'), t('passwordShort'));
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: 'wgclean://auth/callback' } });
    setLoading(false); if (error) Alert.alert('Could not create account', error.message); else Alert.alert(t('checkEmail'), t('confirmationSent'));
  }
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  return <SafeAreaView style={styles.screen}><View style={styles.hero}><Text style={styles.emoji}>🧹</Text><Title>{t('appName')}</Title><Text style={styles.subtitle}>{t('tagline')}</Text></View>
    <Card accent><Label>{t('email')}</Label><Field autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
      <Label>{t('password')}</Label><Field secureTextEntry value={password} onChangeText={setPassword} placeholder="At least 6 characters" />
      <Button label={t('signIn')} onPress={signIn} disabled={loading} /><Button label={t('createAccount')} onPress={signUp} disabled={loading} secondary />
    </Card></SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background, padding: 22, justifyContent: 'center', gap: 28 }, hero: { gap: 10 }, emoji: { fontSize: 54 }, subtitle: { color: colors.muted, fontSize: 17, lineHeight: 25 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background } });

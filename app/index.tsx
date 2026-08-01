import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

async function routeAuthenticatedUser() {
  const { error } = await supabase.rpc('get_dashboard');
  if (!error) {
    router.replace('/home');
    return;
  }

  if (error.message.includes('NO_HOUSEHOLD')) {
    router.replace('/setup');
    return;
  }

  throw error;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  const canLogin = email.trim().length > 0 && password.length >= 6;

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          await routeAuthenticatedUser();
          return;
        }
      } catch (error) {
        if (mounted) Alert.alert('Could not restore session', error instanceof Error ? error.message : String(error));
      }
      if (mounted) setLoading(false);
    }

    restoreSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        routeAuthenticatedUser().catch(error => {
          if (mounted) Alert.alert('Could not resume session', error instanceof Error ? error.message : String(error));
        });
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    if (!canLogin) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setLoading(false);
      Alert.alert('Could not sign in', error.message);
      return;
    }
    try {
      await routeAuthenticatedUser();
    } catch (routeError) {
      setLoading(false);
      Alert.alert('Could not open your account', routeError instanceof Error ? routeError.message : String(routeError));
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.loadingText}>Resuming your session…</Text></View>;

  return <SafeAreaView style={styles.screen}><View style={styles.hero}><Text style={styles.emoji}>🧹</Text><Title>{t('appName')}</Title><Text style={styles.subtitle}>{t('tagline')}</Text></View>
    <Card accent><Label>{t('email')}</Label><Field autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
      <Label>{t('password')}</Label><Field secureTextEntry value={password} onChangeText={setPassword} placeholder="At least 6 characters" />
      <Button label={t('signIn')} onPress={signIn} disabled={!canLogin || loading} />
      <Button label={t('createAccount')} onPress={() => router.push('/signup')} disabled={loading} secondary />
    </Card></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 22, justifyContent: 'center', gap: 28 },
  hero: { gap: 10 },
  emoji: { fontSize: 54 },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 25 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.background },
  loadingText: { color: colors.muted, fontSize: 16 },
});

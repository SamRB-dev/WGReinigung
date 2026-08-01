import { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

function getParams(url: string) {
  const normalized = url.replace('#', '?');
  const query = normalized.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

export default function AuthCallbackScreen() {
  useEffect(() => {
    async function finish() {
      try {
        const url = await Linking.getInitialURL();
        if (!url) throw new Error('Missing confirmation link.');
        const params = getParams(url);
        const code = params.get('code');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const errorDescription = params.get('error_description');
        if (errorDescription) throw new Error(decodeURIComponent(errorDescription));
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        }
        router.replace('/home');
      } catch (error) {
        Alert.alert('Confirmation failed', String(error));
        router.replace('/');
      }
    }
    finish();
  }, []);
  return <View style={styles.screen}><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.text}>Confirming your account…</Text></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background }, text: { color: colors.text, fontSize: 16 } });

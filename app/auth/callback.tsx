import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

const CALLBACK_TIMEOUT_MS = 5000;

function getParams(url: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  return new URLSearchParams([query, hash].filter(Boolean).join('&'));
}

async function routeFromCurrentSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    router.replace('/');
    return;
  }

  const { error } = await supabase.rpc('get_dashboard');
  router.replace(error?.message?.includes('NO_HOUSEHOLD') ? '/setup' : '/home');
}

export default function AuthCallbackScreen() {
  const handled = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function finish(url: string | null) {
      if (!mounted || handled.current) return;

      if (!url) {
        handled.current = true;
        await routeFromCurrentSession();
        return;
      }

      handled.current = true;
      try {
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
        } else {
          await routeFromCurrentSession();
          return;
        }

        await routeFromCurrentSession();
      } catch (error) {
        if (!mounted) return;
        Alert.alert('Confirmation failed', error instanceof Error ? error.message : String(error));
        router.replace('/');
      }
    }

    const subscription = Linking.addEventListener('url', event => finish(event.url));
    const timeout = setTimeout(() => {
      if (!handled.current) finish(null);
    }, CALLBACK_TIMEOUT_MS);

    Linking.getInitialURL()
      .then(url => finish(url))
      .catch(() => finish(null));

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, []);

  return <View style={styles.screen}><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.text}>Confirming your account…</Text><Text style={styles.help}>This should only take a few seconds.</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background, padding: 24 },
  text: { color: colors.text, fontSize: 16, fontWeight: '800' },
  help: { color: colors.muted, fontSize: 14, textAlign: 'center' },
});

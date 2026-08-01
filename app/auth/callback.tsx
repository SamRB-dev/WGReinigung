import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

function getParams(url: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  return new URLSearchParams([query, hash].filter(Boolean).join('&'));
}

export default function AuthCallbackScreen() {
  const handled = useRef(false);

  useEffect(() => {
    async function finish(url: string | null) {
      if (handled.current || !url) return;
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
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error('The confirmation link did not contain a valid session. Please request a new confirmation email.');
        }

        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error('Your email was confirmed, but the app could not create a session. Please sign in manually.');
        router.replace('/setup');
      } catch (error) {
        handled.current = false;
        Alert.alert('Confirmation failed', error instanceof Error ? error.message : String(error));
        router.replace('/');
      }
    }

    const subscription = Linking.addEventListener('url', event => finish(event.url));
    Linking.getInitialURL().then(finish);

    return () => subscription.remove();
  }, []);

  return <View style={styles.screen}><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.text}>Confirming your account…</Text></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background }, text: { color: colors.text, fontSize: 16 } });

import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { LanguageProvider } from '@/lib/i18n';
import { colors } from '@/theme';

function openNotification(data: Record<string, unknown> | undefined) {
  if (data?.screen === 'home') router.push('/home');
}

export default function RootLayout() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      openNotification(response.notification.request.content.data as Record<string, unknown>);
    });

    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) openNotification(response.notification.request.content.data as Record<string, unknown>);
    }).catch(() => undefined);

    return () => subscription.remove();
  }, []);

  return <LanguageProvider><StatusBar style="light" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '900' }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ title: 'Create account' }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: 'Household setup' }} />
      <Stack.Screen name="home" options={{ title: 'WG Clean', headerBackVisible: false }} />
      <Stack.Screen name="checklist" options={{ title: 'Weekly checklist' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin' }} />
    </Stack>
  </LanguageProvider>;
}

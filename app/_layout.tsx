import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LanguageProvider } from '@/lib/i18n';
import { colors } from '@/theme';

export default function RootLayout() {
  return <LanguageProvider><StatusBar style="light" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '900' }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: 'Household setup' }} />
      <Stack.Screen name="home" options={{ title: 'WG Clean', headerBackVisible: false }} />
      <Stack.Screen name="checklist" options={{ title: 'Weekly checklist' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin' }} />
    </Stack>
  </LanguageProvider>;
}

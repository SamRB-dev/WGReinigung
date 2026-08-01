import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

async function ensurePermission() {
  if (!Device.isDevice) throw new Error('Notifications require a physical phone.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('cleaning-reminders', { name: 'Cleaning reminders', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], sound: 'default' });
  const current = await Notifications.getPermissionsAsync(); let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Notification permission was not granted.');
}

export async function registerPushNotifications(householdId: string): Promise<string> {
  await ensurePermission();
  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
  if (!projectId) throw new Error('Missing EAS projectId.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc('register_push_token', { p_household_id: householdId, p_expo_push_token: token, p_platform: Platform.OS, p_device_name: Device.deviceName ?? Device.modelName ?? 'Phone' });
  if (error) throw error; return token;
}

export async function sendQuickTestNotification() {
  await ensurePermission();
  await Notifications.scheduleNotificationAsync({ content: { title: '🧪 WG Clean test', body: 'Notifications are working on this phone.', sound: 'default' }, trigger: null });
}

export async function sendRemoteTestNotification() {
  const { error } = await supabase.functions.invoke('send-test-push', { body: {} });
  if (error) throw error;
}

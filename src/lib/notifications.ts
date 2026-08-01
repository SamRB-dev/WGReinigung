import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission() {
  if (Platform.OS !== 'android') throw new Error('Direct FCM notifications currently support Android only.');

  await Notifications.setNotificationChannelAsync('cleaning-reminders', {
    name: 'Cleaning reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Notification permission was not granted.');
}

async function saveFcmToken(householdId: string, token: Notifications.DevicePushToken): Promise<string> {
  if (token.type !== 'android' || typeof token.data !== 'string') {
    throw new Error(`Expected an Android FCM token but received ${token.type}.`);
  }

  const { error } = await supabase.rpc('register_push_token', {
    p_household_id: householdId,
    p_push_token: token.data,
    p_platform: 'android',
    p_device_name: Device.deviceName ?? Device.modelName ?? (Device.isDevice ? 'Android phone' : 'Android emulator'),
    p_provider: 'fcm',
  });
  if (error) throw error;
  return token.data;
}

export async function registerPushNotifications(householdId: string): Promise<string> {
  await ensurePermission();
  return saveFcmToken(householdId, await Notifications.getDevicePushTokenAsync());
}

export function subscribeToPushTokenChanges(householdId: string) {
  return Notifications.addPushTokenListener(token => {
    saveFcmToken(householdId, token).catch(error => console.warn('Could not refresh FCM token', error));
  });
}

export async function unregisterPushNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    if (token.type !== 'android' || typeof token.data !== 'string') return;
    const { error } = await supabase.rpc('unregister_push_token', { p_push_token: token.data });
    if (error) throw error;
  } catch (error) {
    console.warn('Could not unregister FCM token before sign out', error);
  }
}

export async function sendQuickTestNotification() {
  await ensurePermission();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🧪 WG Clean local test',
      body: 'Notifications are working on this device.',
      sound: 'default',
    },
    trigger: null,
  });
}

export async function sendRemoteTestNotification() {
  const { error } = await supabase.functions.invoke('send-test-push', { body: {} });
  if (error) throw error;
}

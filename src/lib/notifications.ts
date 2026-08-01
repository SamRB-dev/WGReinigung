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
  if (!Device.isDevice) throw new Error('Notifications require a physical phone.');
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

export async function registerPushNotifications(householdId: string): Promise<string> {
  await ensurePermission();
  const nativeToken = await Notifications.getDevicePushTokenAsync();
  if (nativeToken.type !== 'fcm' || typeof nativeToken.data !== 'string') {
    throw new Error(`Expected an FCM token but received ${nativeToken.type}.`);
  }

  const { error } = await supabase.rpc('register_push_token', {
    p_household_id: householdId,
    p_push_token: nativeToken.data,
    p_platform: 'android',
    p_device_name: Device.deviceName ?? Device.modelName ?? 'Android phone',
    p_provider: 'fcm',
  });
  if (error) throw error;
  return nativeToken.data;
}

export async function sendQuickTestNotification() {
  await ensurePermission();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🧪 WG Clean local test',
      body: 'Notifications are working on this phone.',
      sound: 'default',
    },
    trigger: null,
  });
}

export async function sendRemoteTestNotification() {
  const { error } = await supabase.functions.invoke('send-test-push', { body: {} });
  if (error) throw error;
}

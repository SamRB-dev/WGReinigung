import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Button, Card, Label, Pill, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { DashboardData } from '@/types/database';
import { registerPushNotifications, sendQuickTestNotification, sendRemoteTestNotification, subscribeToPushTokenChanges, unregisterPushNotifications } from '@/lib/notifications';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function HomeScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notificationState, setNotificationState] = useState<'pending' | 'enabled' | 'permission' | 'failed'>('pending');
  const [notificationError, setNotificationError] = useState('');
  const { t } = useI18n();

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setLoadError('');
    const { data: dashboard, error } = await supabase.rpc('get_dashboard');
    if (error) {
      if (error.message.includes('NO_HOUSEHOLD')) {
        router.replace('/setup');
      } else {
        setLoadError(error.message);
      }
    } else {
      setData(dashboard as DashboardData);
    }
    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!data?.householdId || notificationState !== 'pending') return;
    registerPushNotifications(data.householdId)
      .then(() => {
        setNotificationError('');
        setNotificationState('enabled');
      })
      .catch(error => {
        const message = String(error);
        setNotificationError(message);
        setNotificationState(message.toLowerCase().includes('permission') ? 'permission' : 'failed');
      });
  }, [data?.householdId, notificationState]);

  useEffect(() => {
    if (!data?.householdId || notificationState !== 'enabled') return;
    const subscription = subscribeToPushTokenChanges(data.householdId);
    return () => subscription.remove();
  }, [data?.householdId, notificationState]);

  async function markBio() {
    if (!data) return;
    const { error } = await supabase.rpc('complete_current_bio_event', { p_household_id: data.householdId });
    if (error) Alert.alert('Could not update', error.message); else load(true);
  }

  async function testNotification() {
    try {
      await sendQuickTestNotification();
      if (notificationState === 'enabled') await sendRemoteTestNotification();
      Alert.alert(t('testSent'), notificationState === 'enabled'
        ? 'You should receive an immediate local notification and a remote FCM push shortly.'
        : 'The local notification was sent. Remote FCM registration is not currently active.');
    } catch (error) {
      Alert.alert('Notification test failed', String(error));
    }
  }

  async function signOut() {
    await unregisterPushNotifications();
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (initialLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (loadError || !data) return <View style={styles.center}><Card accent><Label>Could not load household</Label><Text style={styles.muted}>{loadError || 'The dashboard returned no data.'}</Text><Button label="Retry" onPress={() => { setInitialLoading(true); load(); }} /></Card><Button label={t('signOut')} onPress={signOut} danger /></View>;

  const progress = data.totalTasks ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0;
  const notificationLabel = notificationState === 'enabled'
    ? `${t('enabled')} ✓`
    : notificationState === 'permission'
      ? 'Notification permission denied'
      : notificationState === 'failed'
        ? 'Notification registration failed'
        : t('registering');

  return <ScrollView contentContainerStyle={styles.screen} refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={() => load(true)} />}>
    <View style={styles.header}><View><Pill>{data.householdName}</Pill><Label>{t('thisWeek')}</Label><Title>{data.currentCleaner.display_name}</Title></View><View style={styles.avatar}><Text style={styles.avatarText}>{data.currentCleaner.display_name.slice(0,1).toUpperCase()}</Text></View></View>
    <Card accent><Label>{t('weeklyCleaning')}</Label><Text style={styles.big}>{data.completedTasks} / {data.totalTasks} {t('tasks')}</Text><View style={styles.track}><View style={[styles.fill,{width:`${progress}%`}]} /></View><Text style={styles.muted}>{t('deadline')}: {new Date(data.deadline).toLocaleString()}</Text><Button label={t('openChecklist')} onPress={() => router.push({ pathname:'/checklist', params:{weekId:data.weekId} })} /></Card>
    <Card><Label>{t('bioWaste')}</Label><Text style={styles.big}>{data.bioCompleted ? `${t('done')} ✓` : new Date(data.nextBioDate).toLocaleDateString()}</Text><Text style={styles.muted}>{t('everyThreeDays',{name:data.currentCleaner.display_name})}</Text><Button label={data.bioCompleted?t('alreadyEmptied'):t('markEmptied')} disabled={data.bioCompleted} onPress={markBio} secondary /></Card>
    <Card><Label>{t('pushNotifications')}</Label><Text style={styles.big}>{notificationLabel}</Text>{notificationError ? <Text style={styles.muted}>{notificationError}</Text> : null}<Button label={t('testNotification')} onPress={testNotification} secondary />{notificationState !== 'enabled' && <Button label="Retry notification registration" onPress={() => setNotificationState('pending')} secondary />}</Card>
    <Card><Label>{t('nextCleaner')}</Label><Text style={styles.big}>{data.nextCleaner.display_name}</Text></Card>
    <View style={styles.actions}><Button label={t('settings')} onPress={()=>router.push('/settings')} secondary />{data.isAdmin&&<Button label={t('admin')} onPress={()=>router.push('/admin')} secondary />}</View>
    <Button label={t('signOut')} onPress={signOut} danger />
  </ScrollView>;
}

const styles=StyleSheet.create({screen:{padding:20,gap:14,backgroundColor:colors.background},center:{flex:1,padding:20,gap:14,alignItems:'stretch',justifyContent:'center',backgroundColor:colors.background},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},avatar:{width:64,height:64,borderRadius:22,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:28,fontWeight:'900',color:colors.black},big:{fontSize:23,fontWeight:'900',color:colors.text},muted:{color:colors.muted,lineHeight:21},track:{height:10,borderRadius:5,backgroundColor:colors.surfaceAlt,overflow:'hidden'},fill:{height:'100%',backgroundColor:colors.accent2},actions:{gap:10}});

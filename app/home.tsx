import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Button, Card, Label, Pill, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { DashboardData } from '@/types/database';
import { registerPushNotifications, sendQuickTestNotification, sendRemoteTestNotification } from '@/lib/notifications';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function HomeScreen() {
  const [data, setData] = useState<DashboardData | null>(null); const [loading, setLoading] = useState(true);
  const [notificationState, setNotificationState] = useState<'pending' | 'enabled' | 'blocked'>('pending');
  const { t } = useI18n();
  const load = useCallback(async () => { const { data: dashboard, error } = await supabase.rpc('get_dashboard'); if (error) { if (error.message.includes('NO_HOUSEHOLD')) router.replace('/setup'); else Alert.alert('Could not load household', error.message); } else setData(dashboard as DashboardData); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (!data?.householdId || notificationState !== 'pending') return; registerPushNotifications(data.householdId).then(() => setNotificationState('enabled')).catch(() => setNotificationState('blocked')); }, [data?.householdId, notificationState]);
  async function markBio() { if (!data) return; const { error } = await supabase.rpc('complete_current_bio_event', { p_household_id: data.householdId }); if (error) Alert.alert('Could not update', error.message); else load(); }
  async function testNotification() { try { await sendQuickTestNotification(); if (notificationState === 'enabled') await sendRemoteTestNotification(); Alert.alert(t('testSent'), 'You should receive an immediate local notification and a remote push shortly.'); } catch (e) { Alert.alert('Notification test failed', String(e)); } }
  async function signOut() { await supabase.auth.signOut(); router.replace('/'); }
  if (loading || !data) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const progress = data.totalTasks ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0;
  return <ScrollView contentContainerStyle={styles.screen} refreshControl={<RefreshControl tintColor={colors.accent} refreshing={loading} onRefresh={load} />}>
    <View style={styles.header}><View><Pill>{data.householdName}</Pill><Label>{t('thisWeek')}</Label><Title>{data.currentCleaner.display_name}</Title></View><View style={styles.avatar}><Text style={styles.avatarText}>{data.currentCleaner.display_name.slice(0,1).toUpperCase()}</Text></View></View>
    <Card accent><Label>{t('weeklyCleaning')}</Label><Text style={styles.big}>{data.completedTasks} / {data.totalTasks} {t('tasks')}</Text><View style={styles.track}><View style={[styles.fill,{width:`${progress}%`}]} /></View><Text style={styles.muted}>{t('deadline')}: {new Date(data.deadline).toLocaleString()}</Text><Button label={t('openChecklist')} onPress={() => router.push({ pathname:'/checklist', params:{weekId:data.weekId} })} /></Card>
    <Card><Label>{t('bioWaste')}</Label><Text style={styles.big}>{data.bioCompleted ? `${t('done')} ✓` : new Date(data.nextBioDate).toLocaleDateString()}</Text><Text style={styles.muted}>{t('everyThreeDays',{name:data.currentCleaner.display_name})}</Text><Button label={data.bioCompleted?t('alreadyEmptied'):t('markEmptied')} disabled={data.bioCompleted} onPress={markBio} secondary /></Card>
    <Card><Label>{t('pushNotifications')}</Label><Text style={styles.big}>{notificationState==='enabled'?`${t('enabled')} ✓`:notificationState==='blocked'?t('permissionNeeded'):t('registering')}</Text><Button label={t('testNotification')} onPress={testNotification} secondary />{notificationState==='blocked'&&<Button label={t('enableNotifications')} onPress={()=>setNotificationState('pending')} secondary />}</Card>
    <Card><Label>{t('nextCleaner')}</Label><Text style={styles.big}>{data.nextCleaner.display_name}</Text></Card>
    <View style={styles.actions}><Button label={t('settings')} onPress={()=>router.push('/settings')} secondary />{data.isAdmin&&<Button label={t('admin')} onPress={()=>router.push('/admin')} secondary />}</View>
    <Button label={t('signOut')} onPress={signOut} danger />
  </ScrollView>;
}
const styles=StyleSheet.create({screen:{padding:20,gap:14,backgroundColor:colors.background},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},avatar:{width:64,height:64,borderRadius:22,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:28,fontWeight:'900',color:colors.black},big:{fontSize:23,fontWeight:'900',color:colors.text},muted:{color:colors.muted,lineHeight:21},track:{height:10,borderRadius:5,backgroundColor:colors.surfaceAlt,overflow:'hidden'},fill:{height:'100%',backgroundColor:colors.accent2},actions:{gap:10}});

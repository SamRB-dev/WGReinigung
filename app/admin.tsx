import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

type Settings = { household_id: string; name: string; weekly_reminder_hours: number[]; bio_reminder_hours: number[] };

export default function AdminScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState(''); const [weeklyHours, setWeeklyHours] = useState('9,18'); const [bioHours, setBioHours] = useState('9,14,19');
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  useEffect(() => { supabase.rpc('get_admin_settings').then(({ data, error }) => { if (error) Alert.alert('Admin', error.message); else { const s = data as Settings; setSettings(s); setName(s.name); setWeeklyHours(s.weekly_reminder_hours.join(',')); setBioHours(s.bio_reminder_hours.join(',')); } }); }, []);
  const parseHours = (value: string) => [...new Set(value.split(',').map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v >= 0 && v <= 23))].sort((a,b)=>a-b);
  async function save() { setLoading(true); const { error } = await supabase.rpc('update_household_settings', { p_name: name.trim(), p_weekly_hours: parseHours(weeklyHours), p_bio_hours: parseHours(bioHours) }); setLoading(false); if (error) Alert.alert('Could not save', error.message); else Alert.alert('Saved', 'Household settings updated.'); }
  async function sendEvent() { if (!title.trim() || !body.trim()) return Alert.alert('Missing information', 'Add a title and message.'); setLoading(true); const { error } = await supabase.rpc('create_household_event', { p_title: title.trim(), p_body: body.trim() }); if (!error) await supabase.functions.invoke('send-reminders', { body: { forceEvents: true } }); setLoading(false); if (error) Alert.alert('Could not send', error.message); else { setTitle(''); setBody(''); Alert.alert('Sent', 'The notification was queued for everyone.'); } }
  if (!settings) return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.help}>Loading admin settings…</Text></ScrollView>;
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('adminTools')}</Title><Text style={styles.help}>{t('adminOnly')}</Text>
    <Card accent><Label>{t('sendToEveryone')}</Label><Field value={title} onChangeText={setTitle} placeholder={t('announcementTitle')} /><Field value={body} onChangeText={setBody} placeholder={t('announcementBody')} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} /><Button label={t('sendToEveryone')} onPress={sendEvent} disabled={loading} /></Card>
    <Card><Label>{t('reminderSchedule')}</Label><Field value={name} onChangeText={setName} placeholder={t('householdName')} /><Text style={styles.help}>Weekly reminders are sent on Monday, Wednesday, Friday and Sunday at these hours.</Text><Field value={weeklyHours} onChangeText={setWeeklyHours} keyboardType="numbers-and-punctuation" placeholder="9,18" /><Text style={styles.help}>{t('weeklyHours')}</Text><Field value={bioHours} onChangeText={setBioHours} keyboardType="numbers-and-punctuation" placeholder="9,14,19" /><Text style={styles.help}>{t('bioHours')}</Text><Button label={t('saveSettings')} onPress={save} disabled={loading} secondary /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { padding: 20, gap: 16, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 } });

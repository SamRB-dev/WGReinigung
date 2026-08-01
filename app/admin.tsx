import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

type Settings = { household_id: string; name: string; weekly_reminder_hours: number[]; bio_reminder_hours: number[] };
type Member = { id: string; display_name: string; email: string; rotation_position: number; is_admin: boolean };

export default function AdminScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState(''); const [weeklyHours, setWeeklyHours] = useState('7,9,11,13,15,18,21'); const [bioHours, setBioHours] = useState('9,14,19');
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [newName, setNewName] = useState(''); const [newEmail, setNewEmail] = useState(''); const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function load() {
    const [{ data: settingsData, error: settingsError }, { data: memberData, error: memberError }] = await Promise.all([
      supabase.rpc('get_admin_settings'), supabase.rpc('get_household_members'),
    ]);
    if (settingsError) return Alert.alert('Admin', settingsError.message);
    if (memberError) return Alert.alert('Members', memberError.message);
    const s = settingsData as Settings; setSettings(s); setName(s.name); setWeeklyHours((s.weekly_reminder_hours ?? []).join(',')); setBioHours((s.bio_reminder_hours ?? []).join(',')); setMembers((memberData ?? []) as Member[]);
  }
  useEffect(() => { load(); }, []);

  const parseHours = (value: string) => [...new Set(value.split(',').map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v >= 0 && v <= 23))].sort((a,b)=>a-b);
  async function save() { setLoading(true); const { error } = await supabase.rpc('update_household_settings', { p_name: name.trim(), p_weekly_hours: parseHours(weeklyHours), p_bio_hours: parseHours(bioHours) }); setLoading(false); if (error) Alert.alert('Could not save', error.message); else Alert.alert('Saved', 'Household settings updated.'); }
  async function sendEvent() { if (!title.trim() || !body.trim()) return Alert.alert('Missing information', 'Add a title and message.'); setLoading(true); const { error } = await supabase.rpc('create_household_event', { p_title: title.trim(), p_body: body.trim() }); if (!error) await supabase.functions.invoke('send-reminders', { body: { forceEvents: true } }); setLoading(false); if (error) Alert.alert('Could not send', error.message); else { setTitle(''); setBody(''); Alert.alert('Sent', 'The notification was queued for everyone.'); } }
  async function addRoommate() { if (!newName.trim() || !newEmail.trim()) return Alert.alert('Missing information', 'Enter a name and email.'); setLoading(true); const { error } = await supabase.functions.invoke('manage-roommates', { body: { action: 'invite', members: [{ display_name: newName.trim(), email: newEmail.trim().toLowerCase() }] } }); setLoading(false); if (error) Alert.alert('Could not invite roommate', error.message); else { setNewName(''); setNewEmail(''); await load(); Alert.alert('Invitation sent', 'The roommate received a temporary password and installation guide.'); } }
  function confirmRemove(member: Member) { Alert.alert('Remove roommate?', `${member.display_name} will be removed from this household.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeRoommate(member.id) }]); }
  async function removeRoommate(memberId: string) { setLoading(true); const { error } = await supabase.functions.invoke('manage-roommates', { body: { action: 'remove', memberId } }); setLoading(false); if (error) Alert.alert('Could not remove roommate', error.message); else load(); }

  if (!settings) return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.help}>Loading admin settings…</Text></ScrollView>;
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('adminTools')}</Title><Text style={styles.help}>{t('adminOnly')}</Text>
    <Card accent><Label>{t('sendToEveryone')}</Label><Field value={title} onChangeText={setTitle} placeholder={t('announcementTitle')} /><Field value={body} onChangeText={setBody} placeholder={t('announcementBody')} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} /><Button label={t('sendToEveryone')} onPress={sendEvent} disabled={loading} /></Card>
    <Card><Label>Roommates</Label>{members.map(member => <View key={member.id} style={styles.memberRow}><View style={{ flex: 1 }}><Text style={styles.memberName}>{member.display_name}{member.is_admin ? ' · Admin' : ''}</Text><Text style={styles.help}>{member.email}</Text></View>{!member.is_admin ? <Button label="Remove" onPress={() => confirmRemove(member)} disabled={loading} secondary /> : null}</View>)}<Field value={newName} onChangeText={setNewName} placeholder="Roommate name" /><Field value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Roommate email" /><Button label="Add and invite roommate" onPress={addRoommate} disabled={loading} secondary /></Card>
    <Card><Label>{t('reminderSchedule')}</Label><Field value={name} onChangeText={setName} placeholder={t('householdName')} /><Text style={styles.help}>The assigned cleaner receives reminders every day at the seven configured hours until the deadline.</Text><Field value={weeklyHours} onChangeText={setWeeklyHours} keyboardType="numbers-and-punctuation" placeholder="7,9,11,13,15,18,21" /><Text style={styles.help}>{t('weeklyHours')}</Text><Field value={bioHours} onChangeText={setBioHours} keyboardType="numbers-and-punctuation" placeholder="9,14,19" /><Text style={styles.help}>{t('bioHours')}</Text><Button label={t('saveSettings')} onPress={save} disabled={loading} secondary /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { padding: 20, gap: 16, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 }, memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, memberName: { color: colors.text, fontWeight: '900', fontSize: 16 } });

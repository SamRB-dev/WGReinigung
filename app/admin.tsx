import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

type Settings = { household_id: string; name: string; weekly_reminder_hours: number[]; bio_reminder_hours: number[] };
type Member = { id: string; user_id: string | null; display_name: string; email: string; rotation_position: number; is_admin: boolean };
const RELEASES_URL = 'https://github.com/SamRB-dev/WGReinigung/releases/latest';

export default function AdminScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState(''); const [weeklyHours, setWeeklyHours] = useState('7,9,11,13,15,18,21'); const [bioHours, setBioHours] = useState('9,14,19');
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [newName, setNewName] = useState(''); const [newEmail, setNewEmail] = useState(''); const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function load() {
    const [{ data: settingsData, error: settingsError }, { data: memberData, error: memberError }] = await Promise.all([supabase.rpc('get_admin_settings'), supabase.rpc('get_household_members')]);
    if (settingsError) return Alert.alert('Admin', settingsError.message);
    if (memberError) return Alert.alert('Members', memberError.message);
    const s = settingsData as Settings; setSettings(s); setName(s.name); setWeeklyHours((s.weekly_reminder_hours ?? []).join(',')); setBioHours((s.bio_reminder_hours ?? []).join(',')); setMembers((memberData ?? []) as Member[]);
  }
  useEffect(() => { load(); }, []);

  const parseHours = (value: string) => [...new Set(value.split(',').map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v >= 0 && v <= 23))].sort((a,b)=>a-b);
  async function save() { setLoading(true); const { error } = await supabase.rpc('update_household_settings', { p_name: name.trim(), p_weekly_hours: parseHours(weeklyHours), p_bio_hours: parseHours(bioHours) }); setLoading(false); if (error) Alert.alert('Could not save', error.message); else Alert.alert('Saved', 'Household settings updated.'); }
  async function sendEvent() { if (!title.trim() || !body.trim()) return Alert.alert('Missing information', 'Add a title and message.'); setLoading(true); const { error } = await supabase.rpc('create_household_event', { p_title: title.trim(), p_body: body.trim() }); if (!error) await supabase.functions.invoke('send-reminders', { body: { forceEvents: true } }); setLoading(false); if (error) Alert.alert('Could not send', error.message); else { setTitle(''); setBody(''); Alert.alert('Sent', 'The notification was queued for everyone.'); } }
  async function testHouseholdPush() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('send-test-push', { body: {} });
    setLoading(false);
    if (error) return Alert.alert('Push test failed', error.message);
    Alert.alert('Test sent', `Sent to ${Number(data?.count ?? 0)} registered household device${Number(data?.count ?? 0) === 1 ? '' : 's'}.`);
  }

  async function shareInvite(member: Member) {
    setLoading(true);
    const { data, error } = await supabase.rpc('create_member_invite', { p_member_id: member.id });
    setLoading(false);
    if (error) return Alert.alert('Could not create invite', error.message);
    await Share.share({ message: `You are invited to join ${settings?.name ?? 'our household'} in WG Clean.\n\n1. Download the app: ${RELEASES_URL}\n2. Install it and create an account using ${member.email}.\n3. Choose Join household and enter this one-time code:\n\n${data}\n\nThe code expires after 7 days.` });
  }

  async function addRoommate() {
    if (!newName.trim() || !newEmail.trim()) return Alert.alert('Missing information', 'Enter a name and email.');
    setLoading(true);
    const { data, error } = await supabase.rpc('add_household_member', { p_display_name: newName.trim(), p_email: newEmail.trim().toLowerCase() });
    setLoading(false);
    if (error) return Alert.alert('Could not add roommate', error.message);
    const member = { id: data as string, user_id: null, display_name: newName.trim(), email: newEmail.trim().toLowerCase(), rotation_position: members.length, is_admin: false };
    setNewName(''); setNewEmail(''); await load(); await shareInvite(member);
  }

  function confirmRemove(member: Member) { Alert.alert('Remove roommate?', `${member.display_name} will be removed from this household.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeRoommate(member.id) }]); }
  async function removeRoommate(memberId: string) { setLoading(true); const { error } = await supabase.functions.invoke('manage-roommates', { body: { action: 'remove', memberId } }); setLoading(false); if (error) Alert.alert('Could not remove roommate', error.message); else load(); }

  if (!settings) return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.help}>Loading admin settings…</Text></ScrollView>;
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('adminTools')}</Title><Text style={styles.help}>{t('adminOnly')}</Text>
    <Card accent><Label>{t('sendToEveryone')}</Label><Field value={title} onChangeText={setTitle} placeholder={t('announcementTitle')} /><Field value={body} onChangeText={setBody} placeholder={t('announcementBody')} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} /><Button label={t('sendToEveryone')} onPress={sendEvent} disabled={loading} /></Card>
    <Card><Label>Push notifications</Label><Text style={styles.help}>Send one remote test notification to every active device registered by joined members of this household.</Text><Button label={loading ? 'Sending test…' : 'Test push for everyone'} onPress={testHouseholdPush} disabled={loading} secondary /></Card>
    <Card><Label>Roommates</Label>{members.map(member => <View key={member.id} style={styles.memberRow}><View style={{ flex: 1 }}><Text style={styles.memberName}>{member.display_name}{member.is_admin ? ' · Admin' : ''}</Text><Text style={styles.help}>{member.email}{member.user_id ? ' · Joined' : ' · Waiting'}</Text></View>{!member.is_admin && !member.user_id ? <Button label="Share invite" onPress={() => shareInvite(member)} disabled={loading} secondary /> : null}{!member.is_admin ? <Button label="Remove" onPress={() => confirmRemove(member)} disabled={loading} secondary /> : null}</View>)}<Field value={newName} onChangeText={setNewName} placeholder="Roommate name" /><Field value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Roommate email" /><Button label="Add roommate and share invite" onPress={addRoommate} disabled={loading} secondary /></Card>
    <Card><Label>{t('reminderSchedule')}</Label><Field value={name} onChangeText={setName} placeholder={t('householdName')} /><Text style={styles.help}>The assigned cleaner receives reminders every day at the seven configured hours until the deadline.</Text><Field value={weeklyHours} onChangeText={setWeeklyHours} keyboardType="numbers-and-punctuation" placeholder="7,9,11,13,15,18,21" /><Text style={styles.help}>{t('weeklyHours')}</Text><Field value={bioHours} onChangeText={setBioHours} keyboardType="numbers-and-punctuation" placeholder="9,14,19" /><Text style={styles.help}>{t('bioHours')}</Text><Button label={t('saveSettings')} onPress={save} disabled={loading} secondary /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { padding: 20, gap: 16, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 }, memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, memberName: { color: colors.text, fontWeight: '900', fontSize: 16 } });

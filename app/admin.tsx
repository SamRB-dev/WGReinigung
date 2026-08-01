import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

type Settings = { household_id: string; name: string; weekly_reminder_hours: number[]; bio_reminder_hours: number[] };
type Member = { id: string; user_id: string | null; display_name: string; email: string; rotation_position: number; is_admin: boolean };
const RELEASES_URL = 'https://github.com/SamRB-dev/WGReinigung/releases/latest';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseHours(value: string) {
  const parts = value.split(',').map(item => item.trim()).filter(Boolean);
  if (!parts.length) return { values: [] as number[], error: 'Enter at least one reminder hour.' };
  const invalid = parts.filter(item => !/^\d+$/.test(item) || Number(item) < 0 || Number(item) > 23);
  if (invalid.length) return { values: [] as number[], error: `Invalid hour${invalid.length === 1 ? '' : 's'}: ${invalid.join(', ')}. Use numbers from 0 to 23.` };
  return { values: [...new Set(parts.map(Number))].sort((a, b) => a - b), error: '' };
}

export default function AdminScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [weeklyHours, setWeeklyHours] = useState('7,9,11,13,15,18,21');
  const [bioHours, setBioHours] = useState('9,14,19');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [operation, setOperation] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const { t } = useI18n();

  async function load() {
    setLoadError('');
    const [{ data: settingsData, error: settingsError }, { data: memberData, error: memberError }] = await Promise.all([
      supabase.rpc('get_admin_settings'),
      supabase.rpc('get_household_members'),
    ]);
    const error = settingsError ?? memberError;
    if (error) {
      setLoadError(error.message);
      return;
    }
    const s = settingsData as Settings;
    setSettings(s);
    setName(s.name);
    setWeeklyHours((s.weekly_reminder_hours ?? []).join(','));
    setBioHours((s.bio_reminder_hours ?? []).join(','));
    setMembers((memberData ?? []) as Member[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!name.trim()) return Alert.alert('Missing household name', 'Enter a household name.');
    const weekly = parseHours(weeklyHours);
    const bio = parseHours(bioHours);
    if (weekly.error || bio.error) return Alert.alert('Invalid reminder schedule', weekly.error || bio.error);
    setOperation('save');
    const { error } = await supabase.rpc('update_household_settings', { p_name: name.trim(), p_weekly_hours: weekly.values, p_bio_hours: bio.values });
    setOperation(null);
    if (error) Alert.alert('Could not save', error.message); else Alert.alert('Saved', 'Household settings updated.');
  }

  async function sendEvent() {
    if (!title.trim() || !body.trim()) return Alert.alert('Missing information', 'Add a title and message.');
    setOperation('event');
    const { error: createError } = await supabase.rpc('create_household_event', { p_title: title.trim(), p_body: body.trim() });
    if (createError) {
      setOperation(null);
      return Alert.alert('Could not queue announcement', createError.message);
    }
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-reminders', { body: { forceEvents: true } });
    setOperation(null);
    if (sendError || sendData?.ok === false) {
      return Alert.alert('Announcement queued', `The announcement was saved, but immediate delivery failed. The scheduler will retry it.\n\n${sendError?.message ?? 'Some device deliveries failed.'}`);
    }
    setTitle('');
    setBody('');
    Alert.alert('Delivered', 'The announcement was delivered to every currently registered household device.');
  }

  async function testHouseholdPush() {
    setOperation('test');
    const { data, error } = await supabase.functions.invoke('send-test-push', { body: {} });
    setOperation(null);
    if (error) return Alert.alert('Push test failed', error.message);
    Alert.alert('Test sent', `Sent to ${Number(data?.count ?? 0)} registered household device${Number(data?.count ?? 0) === 1 ? '' : 's'}.`);
  }

  async function shareInvite(member: Member) {
    setOperation(`invite:${member.id}`);
    const { data, error } = await supabase.rpc('create_member_invite', { p_member_id: member.id });
    setOperation(null);
    if (error) return Alert.alert('Could not create invite', error.message);
    await Share.share({ message: `You are invited to join ${settings?.name ?? 'our household'} in WG Clean.\n\n1. Download the app: ${RELEASES_URL}\n2. Install it and create an account using ${member.email}.\n3. Choose Join household and enter this one-time code:\n\n${data}\n\nThe code expires after 7 days.` });
  }

  async function addRoommate() {
    const email = newEmail.trim().toLowerCase();
    if (!newName.trim() || !email) return Alert.alert('Missing information', 'Enter a name and email.');
    if (!EMAIL_PATTERN.test(email)) return Alert.alert('Invalid email', 'Enter a valid roommate email address.');
    setOperation('add');
    const { data, error } = await supabase.rpc('add_household_member', { p_display_name: newName.trim(), p_email: email });
    setOperation(null);
    if (error) return Alert.alert('Could not add roommate', error.message);
    const member = { id: data as string, user_id: null, display_name: newName.trim(), email, rotation_position: members.length, is_admin: false };
    setNewName('');
    setNewEmail('');
    await load();
    await shareInvite(member);
  }

  function confirmRemove(member: Member) {
    Alert.alert('Remove roommate?', `${member.display_name} will be removed from this household and future cleaning rotations.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeRoommate(member.id) },
    ]);
  }

  async function removeRoommate(memberId: string) {
    setOperation(`remove:${memberId}`);
    const { error } = await supabase.functions.invoke('manage-roommates', { body: { action: 'remove', memberId } });
    setOperation(null);
    if (error) Alert.alert('Could not remove roommate', error.message); else load();
  }

  if (!settings) return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.help}>{loadError || 'Loading admin settings…'}</Text>{loadError ? <Button label="Retry" onPress={load} /> : null}</ScrollView>;
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('adminTools')}</Title><Text style={styles.help}>{t('adminOnly')}</Text>
    <Card accent><Label>{t('sendToEveryone')}</Label><Field value={title} onChangeText={setTitle} placeholder={t('announcementTitle')} /><Field value={body} onChangeText={setBody} placeholder={t('announcementBody')} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} /><Button label={operation === 'event' ? 'Sending…' : t('sendToEveryone')} onPress={sendEvent} disabled={operation !== null} /></Card>
    <Card><Label>Push notifications</Label><Text style={styles.help}>Send one remote test notification to every active device registered by joined members of this household.</Text><Button label={operation === 'test' ? 'Sending test…' : 'Test push for everyone'} onPress={testHouseholdPush} disabled={operation !== null} secondary /></Card>
    <Card><Label>Roommates</Label>{members.map(member => <View key={member.id} style={styles.memberRow}><View style={{ flex: 1 }}><Text style={styles.memberName}>{member.display_name}{member.is_admin ? ' · Admin' : ''}</Text><Text style={styles.help}>{member.email}{member.user_id ? ' · Joined' : ' · Waiting'}</Text></View>{!member.is_admin && !member.user_id ? <Button label={operation === `invite:${member.id}` ? 'Preparing…' : 'Share invite'} onPress={() => shareInvite(member)} disabled={operation !== null} secondary /> : null}{!member.is_admin ? <Button label={operation === `remove:${member.id}` ? 'Removing…' : 'Remove'} onPress={() => confirmRemove(member)} disabled={operation !== null} secondary /> : null}</View>)}<Field value={newName} onChangeText={setNewName} placeholder="Roommate name" /><Field value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Roommate email" /><Button label={operation === 'add' ? 'Adding…' : 'Add roommate and share invite'} onPress={addRoommate} disabled={operation !== null} secondary /></Card>
    <Card><Label>{t('reminderSchedule')}</Label><Field value={name} onChangeText={setName} placeholder={t('householdName')} /><Text style={styles.help}>The assigned cleaner receives reminders every day at the configured hours until the deadline.</Text><Field value={weeklyHours} onChangeText={setWeeklyHours} keyboardType="numbers-and-punctuation" placeholder="7,9,11,13,15,18,21" /><Text style={styles.help}>{t('weeklyHours')}</Text><Field value={bioHours} onChangeText={setBioHours} keyboardType="numbers-and-punctuation" placeholder="9,14,19" /><Text style={styles.help}>{t('bioHours')}</Text><Button label={operation === 'save' ? 'Saving…' : t('saveSettings')} onPress={save} disabled={operation !== null} secondary /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { padding: 20, gap: 16, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 }, memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, memberName: { color: colors.text, fontWeight: '900', fontSize: 16 } });

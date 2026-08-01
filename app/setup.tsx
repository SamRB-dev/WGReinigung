import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type MemberDraft = { display_name: string; email: string };
const emptyMember = (): MemberDraft => ({ display_name: '', email: '' });

export default function SetupScreen() {
  const [householdName, setHouseholdName] = useState('Our WG');
  const [members, setMembers] = useState<MemberDraft[]>([emptyMember(), emptyMember()]);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setMembers(current => current.map((member, index) => index === 0 ? { display_name: String(user.user_metadata?.display_name ?? ''), email: user.email ?? '' } : member));
    });
  }, []);

  function setHouseholdSize(value: number) {
    const size = Math.max(1, Math.min(12, value));
    setMembers(current => Array.from({ length: size }, (_, index) => current[index] ?? emptyMember()));
  }

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setMembers(current => current.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member));
  }

  async function joinHousehold() {
    const code = inviteCode.trim();
    if (!code) return;
    setLoading(true);

    const secureInvite = await supabase.rpc('join_household_with_invite', { p_code: code });
    if (!secureInvite.error) {
      setLoading(false);
      router.replace('/home');
      return;
    }

    const householdInvite = await supabase.rpc('join_household_with_share_code', { p_code: code });
    setLoading(false);
    if (householdInvite.error) {
      Alert.alert('Could not join household', 'The code is invalid, expired, revoked, or the household is full.');
      return;
    }
    router.replace('/home');
  }

  async function createHousehold() {
    if (!householdName.trim() || members.some(member => !member.display_name.trim() || !member.email.trim())) return Alert.alert('Missing information', 'Enter the household name and every roommate name and email.');
    const normalizedEmails = members.map(member => member.email.trim().toLowerCase());
    if (new Set(normalizedEmails).size !== normalizedEmails.length) return Alert.alert('Duplicate email', 'Each roommate must use a unique email address.');
    setLoading(true);
    const { error } = await supabase.rpc('create_household_with_members', { p_household_name: householdName.trim(), p_members: members.map((member, index) => ({ ...member, email: member.email.trim().toLowerCase(), rotation_position: index })) });
    setLoading(false);
    if (error) Alert.alert('Setup failed', error.message);
    else { Alert.alert('Household created', 'You can share the household invite code from Settings.'); router.replace('/home'); }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
    <Title>Household setup</Title>
    <Card accent><Label>Join an existing household</Label><Text style={styles.help}>Enter either a secure one-time roommate code or the household share code from Settings.</Text><Field value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" placeholder="AB12-CD34-EF56" /><Button label="Join household" onPress={joinHousehold} disabled={!inviteCode.trim() || loading} /></Card>
    <Text style={styles.or}>or create a new household</Text>
    <Card><Label>Household name</Label><Field value={householdName} onChangeText={setHouseholdName} /></Card>
    <Card><Label>People in household</Label><View style={styles.counter}><Button label="−" onPress={() => setHouseholdSize(members.length - 1)} disabled={members.length <= 1 || loading} secondary /><Text style={styles.count}>{members.length}</Text><Button label="+" onPress={() => setHouseholdSize(members.length + 1)} disabled={members.length >= 12 || loading} secondary /></View></Card>
    {members.map((member, index) => <Card key={index} accent={index === 0}><Label>{index === 0 ? 'You' : `Roommate ${index + 1}`}</Label><Field value={member.display_name} onChangeText={value => updateMember(index, { display_name: value })} placeholder="Name" /><Field autoCapitalize="none" keyboardType="email-address" value={member.email} onChangeText={value => updateMember(index, { email: value })} placeholder="Email" editable={index !== 0} /></Card>)}
    <Button label={loading ? 'Creating…' : 'Create household'} disabled={loading} onPress={createHousehold} />
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ screen: { padding: 20, gap: 14, backgroundColor: colors.background }, help: { color: colors.muted, fontSize: 16, lineHeight: 23 }, counter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, count: { color: colors.text, fontSize: 28, fontWeight: '900' }, or: { color: colors.muted, textAlign: 'center', fontWeight: '800' } });

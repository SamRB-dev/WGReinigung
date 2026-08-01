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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setMembers(current => current.map((member, index) => index === 0 ? {
        display_name: String(user.user_metadata?.display_name ?? ''),
        email: user.email ?? '',
      } : member));
    });
  }, []);

  function setHouseholdSize(value: number) {
    const size = Math.max(1, Math.min(12, value));
    setMembers(current => Array.from({ length: size }, (_, index) => current[index] ?? emptyMember()));
  }

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setMembers(current => current.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member));
  }

  async function createHousehold() {
    if (!householdName.trim() || members.some(member => !member.display_name.trim() || !member.email.trim())) {
      return Alert.alert('Missing information', 'Enter the household name and every roommate name and email.');
    }
    const normalizedEmails = members.map(member => member.email.trim().toLowerCase());
    if (new Set(normalizedEmails).size !== normalizedEmails.length) return Alert.alert('Duplicate email', 'Each roommate must use a unique email address.');

    setLoading(true);
    const { data, error } = await supabase.rpc('create_household_with_members', {
      p_household_name: householdName.trim(),
      p_members: members.map((member, index) => ({ ...member, email: member.email.trim().toLowerCase(), rotation_position: index })),
    });
    if (!error) {
      const invited = members.slice(1).map(member => ({ display_name: member.display_name.trim(), email: member.email.trim().toLowerCase() }));
      if (invited.length) await supabase.functions.invoke('manage-roommates', { body: { action: 'invite', members: invited } });
    }
    setLoading(false);
    if (error) Alert.alert('Setup failed', error.message);
    else { Alert.alert('Household created', `Invite code: ${data}`); router.replace('/home'); }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Title>Create household</Title>
      <Text style={styles.help}>Choose the total number of people, including yourself. Roommates receive an email with a temporary password and installation instructions.</Text>
      <Card><Label>Household name</Label><Field value={householdName} onChangeText={setHouseholdName} /></Card>
      <Card><Label>People in household</Label><View style={styles.counter}><Button label="−" onPress={() => setHouseholdSize(members.length - 1)} disabled={members.length <= 1 || loading} secondary /><Text style={styles.count}>{members.length}</Text><Button label="+" onPress={() => setHouseholdSize(members.length + 1)} disabled={members.length >= 12 || loading} secondary /></View></Card>
      {members.map((member, index) => <Card key={index} accent={index === 0}><Label>{index === 0 ? 'You' : `Roommate ${index + 1}`}</Label><Field value={member.display_name} onChangeText={value => updateMember(index, { display_name: value })} placeholder="Name" /><Field autoCapitalize="none" keyboardType="email-address" value={member.email} onChangeText={value => updateMember(index, { email: value })} placeholder="Email" editable={index !== 0} /></Card>)}
      <Button label={loading ? 'Creating…' : 'Create household and send invites'} disabled={loading} onPress={createHousehold} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { padding: 20, gap: 14, backgroundColor: colors.background }, help: { color: colors.muted, fontSize: 16, lineHeight: 23 }, counter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, count: { color: colors.text, fontSize: 28, fontWeight: '900' } });

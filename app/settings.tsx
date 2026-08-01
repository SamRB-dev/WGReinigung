import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type HouseholdShareInfo = { household_name: string; invite_code: string; member_count: number; is_admin: boolean };

export default function SettingsScreen() {
  const { language, setLanguage, t } = useI18n();
  const [password, setPassword] = useState('');
  const [household, setHousehold] = useState<HouseholdShareInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('get_household_share_code').then(({ data, error }) => {
      if (!error && Array.isArray(data) && data[0]) setHousehold(data[0] as HouseholdShareInfo);
    });
  }, []);

  async function shareHouseholdCode() {
    if (!household) return;
    await Share.share({
      title: `Join ${household.household_name} on WG Clean`,
      message: `Join our WG Clean household “${household.household_name}”.\n\n1. Download the app:\nhttps://github.com/SamRB-dev/WGReinigung/releases/latest\n\n2. Create your account.\n3. Choose “Join an existing household”.\n4. Enter this household code:\n\n${household.invite_code}\n\nThe household supports up to 12 members.`,
    });
  }

  async function changePassword() {
    if (password.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    setLoading(false);
    if (error) Alert.alert('Could not change password', error.message); else { setPassword(''); Alert.alert('Password changed', 'Your new password is active.'); }
  }

  function confirmDelete() {
    Alert.alert('Delete account?', 'This permanently deletes your account and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete permanently', style: 'destructive', onPress: deleteAccount },
    ]);
  }

  async function deleteAccount() {
    setLoading(true);
    const { error } = await supabase.functions.invoke('manage-roommates', { body: { action: 'delete-account' } });
    if (!error) await supabase.auth.signOut();
    setLoading(false);
    if (error) Alert.alert('Could not delete account', error.message); else router.replace('/');
  }

  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('settings')}</Title>
    {household ? <Card accent><Label>Household invite code</Label><Text style={styles.householdName}>{household.household_name}</Text><Text selectable style={styles.inviteCode}>{household.invite_code}</Text><Text style={styles.help}>{household.member_count}/12 members. Anyone with this code can join, so share it only with your roommates.</Text><Button label="Share household invite" onPress={shareHouseholdCode} secondary /></Card> : null}
    <Card><Label>{t('language')}</Label><Text style={styles.help}>English is the default. Your choice is saved on this phone.</Text>
      <Button label={`${language === 'en' ? '✓ ' : ''}${t('english')}`} onPress={() => setLanguage('en')} secondary />
      <Button label={`${language === 'de' ? '✓ ' : ''}${t('german')}`} onPress={() => setLanguage('de')} secondary />
    </Card>
    <Card><Label>Change password</Label><Text style={styles.help}>Use at least six characters for your new password.</Text><Field secureTextEntry value={password} onChangeText={setPassword} placeholder="New password" /><Button label="Save new password" onPress={changePassword} disabled={loading || password.length < 6} secondary /></Card>
    <Card accent><Label>Account</Label><Text style={styles.help}>Deleting your account is permanent.</Text><Button label="Delete account" onPress={confirmDelete} disabled={loading} /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, padding: 20, gap: 18, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 }, householdName: { color: colors.text, fontSize: 18, fontWeight: '900' }, inviteCode: { color: colors.accent, fontSize: 28, fontWeight: '900', letterSpacing: 2, paddingVertical: 6 } });

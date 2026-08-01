import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type HouseholdInviteInfo = { householdName: string; inviteCode: string };

export default function SettingsScreen() {
  const { language, setLanguage, t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [household, setHousehold] = useState<HouseholdInviteInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('get_household_invite_code').then(({ data, error }) => {
      if (!error && data) setHousehold(data as HouseholdInviteInfo);
    });
  }, []);

  async function shareHouseholdCode() {
    if (!household) return;
    await Share.share({
      title: `Join ${household.householdName} on WG Clean`,
      message: `Join our WG Clean household “${household.householdName}”.\n\n1. Download the app:\nhttps://github.com/SamRB-dev/WGReinigung/releases/latest\n\n2. Create your account using the email address the household admin added.\n3. Choose “Join an existing household”.\n4. Enter this household code:\n\n${household.inviteCode}`,
    });
  }

  async function changePassword() {
    if (!currentPassword) return Alert.alert('Enter current password', 'Type your current password before choosing a new one.');
    if (newPassword.length < 6) return Alert.alert('Password too short', 'Your new password must contain at least 6 characters.');
    if (newPassword !== confirmPassword) return Alert.alert('Passwords do not match', 'Repeat the same new password in both fields.');
    if (currentPassword === newPassword) return Alert.alert('Choose a different password', 'Your new password must be different from your current password.');

    setLoading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (userError || !email) {
      setLoading(false);
      return Alert.alert('Could not verify account', userError?.message ?? 'Your account email is unavailable.');
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (verifyError) {
      setLoading(false);
      return Alert.alert('Current password is incorrect', 'Enter your existing password and try again.');
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
    setLoading(false);
    if (error) return Alert.alert('Could not change password', error.message);

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password changed', 'Your password has been updated successfully.');
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

  const canChangePassword = currentPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword;

  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('settings')}</Title>
    {household ? <Card accent><Label>Household invite code</Label><Text style={styles.householdName}>{household.householdName}</Text><Text selectable style={styles.inviteCode}>{household.inviteCode}</Text><Text style={styles.help}>Only roommates whose email was already added by the household admin can use this code.</Text><Button label="Share household invite" onPress={shareHouseholdCode} secondary /></Card> : null}
    <Card><Label>{t('language')}</Label><Text style={styles.help}>English is the default. Your choice is saved on this phone.</Text>
      <Button label={`${language === 'en' ? '✓ ' : ''}${t('english')}`} onPress={() => setLanguage('en')} secondary />
      <Button label={`${language === 'de' ? '✓ ' : ''}${t('german')}`} onPress={() => setLanguage('de')} secondary />
    </Card>
    <Card><Label>Change your password</Label><Text style={styles.help}>Confirm your current password, then choose a new password with at least six characters.</Text>
      <Field secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" autoCapitalize="none" />
      <Field secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="New password" autoCapitalize="none" />
      <Field secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" autoCapitalize="none" />
      <Button label={loading ? 'Changing password…' : 'Change your password'} onPress={changePassword} disabled={loading || !canChangePassword} secondary />
    </Card>
    <Card accent><Label>Account</Label><Text style={styles.help}>Deleting your account is permanent.</Text><Button label="Delete account" onPress={confirmDelete} disabled={loading} danger /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, padding: 20, gap: 18, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 }, householdName: { color: colors.text, fontSize: 18, fontWeight: '900' }, inviteCode: { color: colors.accent, fontSize: 28, fontWeight: '900', letterSpacing: 2, paddingVertical: 6 } });

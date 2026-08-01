import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function SettingsScreen() {
  const { language, setLanguage, t } = useI18n();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
    <Card><Label>{t('language')}</Label><Text style={styles.help}>English is the default. Your choice is saved on this phone.</Text>
      <Button label={`${language === 'en' ? '✓ ' : ''}${t('english')}`} onPress={() => setLanguage('en')} secondary />
      <Button label={`${language === 'de' ? '✓ ' : ''}${t('german')}`} onPress={() => setLanguage('de')} secondary />
    </Card>
    <Card><Label>Change password</Label><Text style={styles.help}>Invited roommates should replace their temporary password after the first login.</Text><Field secureTextEntry value={password} onChangeText={setPassword} placeholder="New password" /><Button label="Save new password" onPress={changePassword} disabled={loading || password.length < 6} secondary /></Card>
    <Card accent><Label>Account</Label><Text style={styles.help}>Deleting your account is permanent.</Text><Button label="Delete account" onPress={confirmDelete} disabled={loading} /></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, padding: 20, gap: 18, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 } });

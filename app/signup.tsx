import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length > 1 && email.trim().length > 3 && password.length >= 6 && password === confirmPassword;

  async function signUp() {
    if (!canSubmit) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: 'wgclean://auth/callback' },
    });
    setLoading(false);
    if (error) return Alert.alert('Could not create account', error.message);
    if (data.session) router.replace('/setup');
    else Alert.alert('Check your email', 'Confirm your email address, then return to the app and sign in.');
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Title>Create account</Title>
      <Text style={styles.help}>Create your own account first. You can create or join a household afterwards.</Text>
      <Card accent>
        <Label>Name</Label><Field value={name} onChangeText={setName} placeholder="Your name" />
        <Label>Email</Label><Field value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
        <Label>Password</Label><Field value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" />
        <Label>Confirm password</Label><Field value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Repeat password" />
        <Button label={loading ? 'Creating…' : 'Create account'} onPress={signUp} disabled={!canSubmit || loading} />
        <Button label="Back to login" onPress={() => router.back()} disabled={loading} secondary />
      </Card>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flexGrow: 1, padding: 20, gap: 18, justifyContent: 'center', backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 22 } });

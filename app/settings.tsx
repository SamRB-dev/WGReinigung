import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Label, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function SettingsScreen() {
  const { language, setLanguage, t } = useI18n();
  return <View style={styles.screen}><Title>{t('settings')}</Title><Card><Label>{t('language')}</Label><Text style={styles.help}>English is the default. Your choice is saved on this phone.</Text>
    <Button label={`${language === 'en' ? '✓ ' : ''}${t('english')}`} onPress={() => setLanguage('en')} secondary />
    <Button label={`${language === 'de' ? '✓ ' : ''}${t('german')}`} onPress={() => setLanguage('de')} secondary />
  </Card></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, gap: 18, backgroundColor: colors.background }, help: { color: colors.muted, lineHeight: 21 } });

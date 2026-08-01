import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

type Language = 'en' | 'de';
type Dict = Record<string, string>;

const dictionaries: Record<Language, Dict> = {
  en: {
    appName: 'WG Clean', tagline: 'One cleaner each week. Bio waste every three days. Everyone stays informed.',
    email: 'Email', password: 'Password', signIn: 'Sign in', createAccount: 'Create account',
    thisWeek: 'This week', weeklyCleaning: 'Weekly cleaning', tasks: 'tasks', deadline: 'Deadline', openChecklist: 'Open checklist',
    bioWaste: 'Bio waste', everyThreeDays: 'Every three days. Everyone receives reminders; {name} is responsible.',
    markEmptied: 'Mark as emptied', alreadyEmptied: 'Already emptied', done: 'Done', pushNotifications: 'Push notifications',
    enabled: 'Enabled', permissionNeeded: 'Permission needed', registering: 'Registering…', enableNotifications: 'Enable notifications',
    testNotification: 'Send test notification', testSent: 'Test notification sent', nextCleaner: 'Next cleaner', settings: 'Settings', admin: 'Admin', signOut: 'Sign out',
    language: 'Language', english: 'English', german: 'German', householdSetup: 'Household setup', createHousehold: 'Create household',
    householdName: 'Household name', roommate: 'Roommate', name: 'Name', missingInformation: 'Missing information',
    adminTools: 'Admin tools', announcementTitle: 'Notification title', announcementBody: 'Notification message', sendToEveryone: 'Send to everyone',
    reminderSchedule: 'Reminder schedule', weeklyHours: 'Weekly reminder hours (comma-separated)', bioHours: 'Bio reminder hours (comma-separated)',
    saveSettings: 'Save settings', adminOnly: 'Only the household admin can change these settings.',
    checkEmail: 'Check your email', confirmationSent: 'Open the confirmation link to activate your account.',
    emailRequired: 'Please enter your email address.', passwordShort: 'Your password must contain at least 6 characters.',
  },
  de: {
    appName: 'WG Clean', tagline: 'Jede Woche putzt eine Person. Biomüll alle drei Tage. Alle bleiben informiert.',
    email: 'E-Mail', password: 'Passwort', signIn: 'Anmelden', createAccount: 'Konto erstellen',
    thisWeek: 'Diese Woche', weeklyCleaning: 'Wöchentliche Reinigung', tasks: 'Aufgaben', deadline: 'Frist', openChecklist: 'Checkliste öffnen',
    bioWaste: 'Biomüll', everyThreeDays: 'Alle drei Tage. Alle erhalten Erinnerungen; {name} ist verantwortlich.',
    markEmptied: 'Als geleert markieren', alreadyEmptied: 'Bereits geleert', done: 'Erledigt', pushNotifications: 'Push-Benachrichtigungen',
    enabled: 'Aktiviert', permissionNeeded: 'Berechtigung erforderlich', registering: 'Wird eingerichtet…', enableNotifications: 'Benachrichtigungen aktivieren',
    testNotification: 'Testbenachrichtigung senden', testSent: 'Testbenachrichtigung gesendet', nextCleaner: 'Nächste Person', settings: 'Einstellungen', admin: 'Admin', signOut: 'Abmelden',
    language: 'Sprache', english: 'Englisch', german: 'Deutsch', householdSetup: 'WG einrichten', createHousehold: 'WG erstellen',
    householdName: 'Name der WG', roommate: 'Mitbewohner/in', name: 'Name', missingInformation: 'Angaben fehlen',
    adminTools: 'Admin-Werkzeuge', announcementTitle: 'Titel der Benachrichtigung', announcementBody: 'Nachricht', sendToEveryone: 'An alle senden',
    reminderSchedule: 'Erinnerungsplan', weeklyHours: 'Reinigungs-Erinnerungen (Stunden, kommagetrennt)', bioHours: 'Biomüll-Erinnerungen (Stunden, kommagetrennt)',
    saveSettings: 'Einstellungen speichern', adminOnly: 'Nur der WG-Admin kann diese Einstellungen ändern.',
    checkEmail: 'E-Mail prüfen', confirmationSent: 'Öffne den Bestätigungslink, um dein Konto zu aktivieren.',
    emailRequired: 'Bitte gib deine E-Mail-Adresse ein.', passwordShort: 'Das Passwort muss mindestens 6 Zeichen haben.',
  },
};

const LanguageContext = createContext({ language: 'en' as Language, setLanguage: (_: Language) => {}, t: (key: string, vars?: Record<string, string>) => key });

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>('en');
  useEffect(() => { AsyncStorage.getItem('wg-language').then((value) => { if (value === 'de' || value === 'en') setLanguageState(value); }); }, []);
  const setLanguage = (value: Language) => { setLanguageState(value); AsyncStorage.setItem('wg-language', value); };
  const value = useMemo(() => ({ language, setLanguage, t: (key: string, vars: Record<string, string> = {}) => {
    let text = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
    Object.entries(vars).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
    return text;
  } }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() { return useContext(LanguageContext); }

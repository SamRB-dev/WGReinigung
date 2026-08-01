import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function SetupScreen(){const[householdName,setHouseholdName]=useState('Our WG');const[names,setNames]=useState(['','','','']);const[emails,setEmails]=useState(['','','','']);const[loading,setLoading]=useState(false);const{t}=useI18n();
function update(list:string[],index:number,value:string,setter:(v:string[])=>void){const next=[...list];next[index]=value;setter(next)}
async function createHousehold(){if(names.some(x=>!x.trim())||emails.some(x=>!x.trim()))return Alert.alert(t('missingInformation'),'Enter all four names and email addresses.');setLoading(true);const{data,error}=await supabase.rpc('create_household_with_members',{p_household_name:householdName,p_members:names.map((display_name,index)=>({display_name,email:emails[index],rotation_position:index}))});setLoading(false);if(error)Alert.alert('Setup failed',error.message);else{Alert.alert('Household created',`Invite code: ${data}`);router.replace('/home')}}
return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}><ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><Title>{t('createHousehold')}</Title><Text style={styles.help}>Add four roommates in rotation order. The account creating the household becomes admin.</Text><Card><Label>{t('householdName')}</Label><Field value={householdName} onChangeText={setHouseholdName}/></Card>{names.map((name,index)=><Card key={index}><Label>{t('roommate')} {index+1}</Label><Field value={name} onChangeText={v=>update(names,index,v,setNames)} placeholder={t('name')}/><Field autoCapitalize="none" keyboardType="email-address" value={emails[index]} onChangeText={v=>update(emails,index,v,setEmails)} placeholder={t('email')}/></Card>)}<Button label={loading?'Creating…':t('createHousehold')} disabled={loading} onPress={createHousehold}/></ScrollView></KeyboardAvoidingView>}
const styles=StyleSheet.create({screen:{padding:20,gap:14,backgroundColor:colors.background},help:{color:colors.muted,fontSize:16,lineHeight:23}});

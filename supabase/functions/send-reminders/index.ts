import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isInvalidFcmToken, sendFcmMessage } from '../_shared/fcm.ts';

const jsonHeaders = { 'Content-Type': 'application/json' };
type Household = { id: string; name: string; timezone: string; weekly_reminder_hours: number[]; bio_reminder_hours: number[]; reminder_hours?: number[] };
type PushToken = { push_token: string; user_id: string };
type PushMessage = { type: 'weekly' | 'bio' | 'event'; key: string; title: string; body: string; data: Record<string, string>; userId?: string };

function localParts(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), hour: Number(get('hour')) };
}

async function authorizeRequest(req: Request, forceEvents: boolean, url: string, anonKey: string, serviceKey: string) {
  const admin = createClient(url, serviceKey);

  if (!forceEvents) {
    const supplied = req.headers.get('x-cron-secret') ?? '';
    const { data: valid, error } = await admin.rpc('verify_reminder_cron_secret', { p_secret: supplied });
    if (error || valid !== true) throw new Error('Unauthorized scheduler request');
    return;
  }

  const authorization = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error('Unauthorized admin request');

  const { data: membership } = await admin.from('household_members').select('is_admin').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  if (!membership?.is_admin) throw new Error('Admin access required');
}

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return new Response(JSON.stringify({ error: 'Missing Supabase function environment' }), { status: 500, headers: jsonHeaders });

  const body = await req.json().catch(() => ({}));
  const forceEvents = body?.forceEvents === true;
  try {
    await authorizeRequest(req, forceEvents, url, anonKey, serviceKey);
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 401, headers: jsonHeaders });
  }

  const supabase = createClient(url, serviceKey);
  const { data: households, error } = await supabase.from('households').select('id,name,timezone,weekly_reminder_hours,bio_reminder_hours,reminder_hours');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders });

  const results: unknown[] = [];
  let hadSystemError = false;

  for (const household of (households ?? []) as Household[]) {
    const local = localParts(household.timezone);
    const weekResult = await supabase.rpc('ensure_week', { p_household_id: household.id, p_date: local.date });
    const bioResult = await supabase.rpc('ensure_bio_event', { p_household_id: household.id, p_date: local.date });
    if (weekResult.error || bioResult.error) {
      hadSystemError = true;
      results.push({ householdId: household.id, status: 'setup_failed', error: weekResult.error?.message ?? bioResult.error?.message });
      continue;
    }

    const tokenResult = await supabase.from('push_tokens').select('push_token,user_id').eq('household_id', household.id).eq('provider', 'fcm').eq('is_active', true);
    const weekQuery = await supabase.from('cleaning_weeks').select('week_start,deadline,status,assigned:household_members(display_name,user_id)').eq('household_id', household.id).lte('week_start', local.date).order('week_start', { ascending: false }).limit(1).single();
    const bioQuery = await supabase.from('bio_waste_events').select('scheduled_date,completed_at,assigned:household_members(display_name,user_id)').eq('household_id', household.id).eq('scheduled_date', local.date).maybeSingle();
    const eventQuery = await supabase.from('household_events').select('id,title,body').eq('household_id', household.id).is('sent_at', null).lte('scheduled_at', new Date().toISOString());

    const queryError = tokenResult.error ?? weekQuery.error ?? bioQuery.error ?? eventQuery.error;
    if (queryError) {
      hadSystemError = true;
      results.push({ householdId: household.id, status: 'query_failed', error: queryError.message });
      continue;
    }

    const tokens = (tokenResult.data ?? []) as PushToken[];
    const week = weekQuery.data;
    const bio = bioQuery.data;
    const events = eventQuery.data ?? [];
    const messages: PushMessage[] = [];
    const reminderHours = household.reminder_hours ?? [7, 9, 11, 13, 15, 18, 21];

    if (week && week.status !== 'completed') {
      const deadlineLocalDate = localParts(household.timezone, new Date(String(week.deadline))).date;
      if (local.date <= deadlineLocalDate && reminderHours.includes(local.hour)) {
        const assigned = week.assigned as { display_name?: string; user_id?: string } | null;
        if (assigned?.user_id) {
          const cleaner = assigned.display_name ?? 'The assigned roommate';
          messages.push({
            type: 'weekly', key: `${week.week_start}:${local.date}:${local.hour}`,
            title: `🧹 ${cleaner}'s cleaning turn`,
            body: local.date === deadlineLocalDate ? 'Final-day reminder: complete the checklist before the deadline.' : 'Your cleaning checklist is still open. Complete it before the deadline.',
            data: { screen: 'home', householdId: household.id, type: 'weekly' }, userId: assigned.user_id,
          });
        }
      }
    }

    if (bio && !bio.completed_at && (household.bio_reminder_hours ?? [9, 14, 19]).includes(local.hour)) {
      const assigned = bio.assigned as { display_name?: string; user_id?: string } | null;
      if (assigned?.user_id) {
        messages.push({
          type: 'bio', key: `${bio.scheduled_date}:${local.hour}`, title: '🗑️ Bio-waste reminder',
          body: `${assigned.display_name ?? 'The assigned roommate'} is responsible today. Mark it done after emptying the bin.`,
          data: { screen: 'home', householdId: household.id, type: 'bio' }, userId: assigned.user_id,
        });
      }
    }

    for (const event of events) {
      messages.push({ type: 'event', key: event.id, title: `📣 ${event.title}`, body: event.body, data: { screen: 'home', householdId: household.id, eventId: event.id, type: 'event' } });
    }

    for (const message of messages) {
      const recipients = tokens.filter(token => message.type === 'event' || token.user_id === message.userId);
      for (const row of recipients) {
        const { data: claim, error: claimError } = await supabase.from('push_log').insert({ household_id: household.id, reminder_type: message.type, reminder_key: message.key, push_token: row.push_token, status: 'sending' }).select('id').single();
        if (claimError?.code === '23505') continue;
        if (claimError || !claim) {
          hadSystemError = true;
          results.push({ token: row.push_token, type: message.type, status: 'claim_failed', error: claimError?.message });
          continue;
        }

        try {
          const messageId = await sendFcmMessage({ token: row.push_token, title: message.title, body: message.body, data: message.data });
          await supabase.from('push_log').update({ status: 'sent', ticket_id: messageId }).eq('id', claim.id);
          results.push({ token: row.push_token, type: message.type, status: 'sent', messageId });
        } catch (pushError) {
          const errorMessage = String(pushError);
          await supabase.from('push_log').update({ status: 'failed', error_message: errorMessage }).eq('id', claim.id);
          if (isInvalidFcmToken(pushError)) await supabase.from('push_tokens').update({ is_active: false }).eq('push_token', row.push_token);
          results.push({ token: row.push_token, type: message.type, status: 'failed', error: errorMessage });
        }
      }

      if (message.type === 'event' && recipients.length > 0) {
        const { count, error: countError } = await supabase.from('push_log').select('id', { count: 'exact', head: true }).eq('household_id', household.id).eq('reminder_type', 'event').eq('reminder_key', message.key).eq('status', 'sent').in('push_token', recipients.map(recipient => recipient.push_token));
        if (!countError && count === recipients.length) await supabase.from('household_events').update({ sent_at: new Date().toISOString() }).eq('id', message.key);
      }
    }
  }

  return new Response(JSON.stringify({ ok: !hadSystemError, results }), { status: hadSystemError ? 207 : 200, headers: jsonHeaders });
});

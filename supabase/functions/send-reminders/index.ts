import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isInvalidFcmToken, sendFcmMessage } from '../_shared/fcm.ts';

const jsonHeaders = { 'Content-Type': 'application/json' };
type Household = { id: string; name: string; timezone: string; weekly_reminder_hours: number[]; bio_reminder_hours: number[]; reminder_hours?: number[] };
type PushToken = { push_token: string; user_id: string };
type PushMessage = { type: 'weekly' | 'bio' | 'event'; key: string; title: string; body: string; data: Record<string, string>; userId?: string };

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), hour: Number(get('hour')) };
}

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: 'Missing Supabase function environment' }), { status: 500, headers: jsonHeaders });

  const supabase = createClient(url, serviceKey);
  const body = await req.json().catch(() => ({}));
  const forceEvents = body?.forceEvents === true;
  const { data: households, error } = await supabase
    .from('households')
    .select('id,name,timezone,weekly_reminder_hours,bio_reminder_hours,reminder_hours');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders });

  const results: unknown[] = [];
  for (const household of (households ?? []) as Household[]) {
    const local = localParts(household.timezone);
    await supabase.rpc('ensure_week', { p_household_id: household.id, p_date: local.date });
    await supabase.rpc('ensure_bio_event', { p_household_id: household.id, p_date: local.date });

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('push_token,user_id')
      .eq('household_id', household.id)
      .eq('provider', 'fcm')
      .eq('is_active', true);

    const { data: week } = await supabase
      .from('cleaning_weeks')
      .select('week_start,deadline,status,assigned:household_members(display_name,user_id)')
      .eq('household_id', household.id)
      .lte('week_start', local.date)
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    const { data: bio } = await supabase
      .from('bio_waste_events')
      .select('scheduled_date,completed_at,assigned:household_members(display_name,user_id)')
      .eq('household_id', household.id)
      .eq('scheduled_date', local.date)
      .maybeSingle();

    const { data: events } = await supabase
      .from('household_events')
      .select('id,title,body')
      .eq('household_id', household.id)
      .is('sent_at', null)
      .lte('scheduled_at', new Date().toISOString());

    const messages: PushMessage[] = [];
    const reminderHours = household.reminder_hours ?? [7, 9, 11, 13, 15, 18, 21];
    if (week && week.status !== 'completed' && local.date <= String(week.deadline).slice(0, 10) && reminderHours.includes(local.hour)) {
      const assigned = week.assigned as { display_name?: string; user_id?: string } | null;
      const cleaner = assigned?.display_name ?? 'The assigned roommate';
      messages.push({
        type: 'weekly',
        key: `${week.week_start}:${local.date}:${local.hour}`,
        title: `🧹 ${cleaner}'s cleaning turn`,
        body: local.date === String(week.deadline).slice(0, 10)
          ? 'Final-day reminder: complete the checklist before the turn moves to the next roommate.'
          : 'Your cleaning checklist is still open. Complete it before the deadline.',
        data: { screen: 'home', householdId: household.id, type: 'weekly' },
        userId: assigned?.user_id,
      });
    }

    if (bio && !bio.completed_at && (household.bio_reminder_hours ?? [9, 14, 19]).includes(local.hour)) {
      const assigned = bio.assigned as { display_name?: string; user_id?: string } | null;
      const cleaner = assigned?.display_name ?? 'The assigned roommate';
      messages.push({
        type: 'bio',
        key: `${bio.scheduled_date}:${local.hour}`,
        title: '🗑️ Bio-waste reminder',
        body: `${cleaner} is responsible today. Mark it done after emptying the bin.`,
        data: { screen: 'home', householdId: household.id, type: 'bio' },
        userId: assigned?.user_id,
      });
    }

    for (const event of events ?? []) {
      if (forceEvents || true) {
        messages.push({
          type: 'event', key: event.id, title: `📣 ${event.title}`, body: event.body,
          data: { screen: 'home', householdId: household.id, eventId: event.id, type: 'event' },
        });
      }
    }

    for (const message of messages) {
      let sentAny = false;
      const recipients = ((tokens ?? []) as PushToken[]).filter(token => message.type === 'event' || !message.userId || token.user_id === message.userId);
      for (const row of recipients) {
        const token = row.push_token;
        const { data: claim, error: claimError } = await supabase
          .from('push_log')
          .insert({ household_id: household.id, reminder_type: message.type, reminder_key: message.key, push_token: token, status: 'sending' })
          .select('id')
          .single();
        if (claimError?.code === '23505') continue;
        if (claimError || !claim) {
          results.push({ token, type: message.type, status: 'claim_failed', error: claimError?.message });
          continue;
        }

        try {
          const messageId = await sendFcmMessage({ token, title: message.title, body: message.body, data: message.data });
          await supabase.from('push_log').update({ status: 'sent', ticket_id: messageId }).eq('id', claim.id);
          results.push({ token, type: message.type, status: 'sent', messageId });
          sentAny = true;
        } catch (pushError) {
          const errorMessage = String(pushError);
          await supabase.from('push_log').update({ status: 'failed', error_message: errorMessage }).eq('id', claim.id);
          if (isInvalidFcmToken(pushError)) {
            await supabase.from('push_tokens').update({ is_active: false }).eq('push_token', token);
          }
          results.push({ token, type: message.type, status: 'failed', error: errorMessage });
        }
      }
      if (message.type === 'event' && sentAny) {
        await supabase.from('household_events').update({ sent_at: new Date().toISOString() }).eq('id', message.key);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: jsonHeaders });
});

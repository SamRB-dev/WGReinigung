import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });

  const admin = createClient(url, serviceKey);
  const { data: membership, error: membershipError } = await admin
    .from('household_members')
    .select('household_id,is_admin')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !membership?.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: jsonHeaders });
  }

  const { data: members, error: membersError } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', membership.household_id)
    .not('user_id', 'is', null);

  if (membersError) return new Response(JSON.stringify({ error: membersError.message }), { status: 400, headers: jsonHeaders });

  const userIds = [...new Set((members ?? []).map(member => member.user_id).filter(Boolean))];
  if (!userIds.length) return new Response(JSON.stringify({ ok: true, count: 0, results: [] }), { headers: jsonHeaders });

  const { data: tokens, error: tokenError } = await admin
    .from('push_tokens')
    .select('expo_push_token,user_id')
    .in('user_id', userIds)
    .eq('is_active', true);

  if (tokenError) return new Response(JSON.stringify({ error: tokenError.message }), { status: 400, headers: jsonHeaders });

  const results = [];
  for (const row of tokens ?? []) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: row.expo_push_token,
        sound: 'default',
        channelId: 'cleaning-reminders',
        title: '🧪 WG Clean household test',
        body: 'Push notifications are working for your household.',
        priority: 'high',
        data: { type: 'household-test', householdId: membership.household_id },
      }),
    });
    results.push({ userId: row.user_id, response: await response.json() });
  }

  return new Response(JSON.stringify({ ok: true, count: results.length, results }), { headers: jsonHeaders });
});

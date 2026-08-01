import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isInvalidFcmToken, sendFcmMessage } from '../_shared/fcm.ts';

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
    .select('push_token,user_id')
    .in('user_id', userIds)
    .eq('provider', 'fcm')
    .eq('is_active', true);
  if (tokenError) return new Response(JSON.stringify({ error: tokenError.message }), { status: 400, headers: jsonHeaders });

  const results = [];
  for (const row of tokens ?? []) {
    try {
      const messageId = await sendFcmMessage({
        token: row.push_token,
        title: '🧪 WG Clean household test',
        body: 'Remote notifications are working for your household.',
        data: { type: 'household-test', householdId: membership.household_id },
      });
      results.push({ userId: row.user_id, status: 'sent', messageId });
    } catch (error) {
      if (isInvalidFcmToken(error)) {
        await admin.from('push_tokens').update({ is_active: false }).eq('push_token', row.push_token);
      }
      results.push({ userId: row.user_id, status: 'failed', error: String(error) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    count: results.filter(result => result.status === 'sent').length,
    attempted: results.length,
    results,
  }), { headers: jsonHeaders });
});

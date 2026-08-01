import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const admin = createClient(url, serviceKey);
  const { data: tokens } = await admin.from('push_tokens').select('expo_push_token').eq('user_id', user.id).eq('is_active', true);
  const results = [];
  for (const row of tokens ?? []) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: row.expo_push_token, sound: 'default', channelId: 'cleaning-reminders', title: '🧪 WG Clean remote test', body: 'Remote push notifications are configured correctly.', priority: 'high' }) });
    results.push(await response.json());
  }
  return new Response(JSON.stringify({ ok: true, count: results.length, results }), { headers: { 'Content-Type': 'application/json' } });
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = { 'Content-Type': 'application/json' };

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const admin = createClient(url, serviceKey);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const user = userData.user;

  if (action === 'delete-account') {
    const { error: prepareError } = await admin.rpc('prepare_account_deletion', { p_user_id: user.id });
    if (prepareError) return new Response(JSON.stringify({ error: prepareError.message }), { status: 400, headers });

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    return new Response(JSON.stringify(deleteError ? { error: deleteError.message } : { ok: true }), { status: deleteError ? 400 : 200, headers });
  }

  const { data: adminMember, error: membershipError } = await admin
    .from('household_members')
    .select('household_id,is_admin')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (membershipError || !adminMember?.is_admin) return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });

  if (action === 'remove') {
    if (typeof body.memberId !== 'string') return new Response(JSON.stringify({ error: 'Member id is required' }), { status: 400, headers });
    const { error } = await userClient.rpc('remove_household_member', { p_member_id: body.memberId });
    return new Response(JSON.stringify(error ? { error: error.message } : { ok: true }), { status: error ? 400 : 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers });
});

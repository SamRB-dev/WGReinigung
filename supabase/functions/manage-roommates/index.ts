import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = { 'Content-Type': 'application/json' };
const randomPassword = () => `${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}Aa1!`;

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  const androidUrl = Deno.env.get('ANDROID_DOWNLOAD_URL') ?? 'https://github.com/SamRB-dev/WGReinigung/releases';
  const iosUrl = Deno.env.get('IOS_DOWNLOAD_URL') ?? 'https://expo.dev';
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const admin = createClient(url, serviceKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const user = userData.user;

  if (action === 'delete-account') {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    return new Response(JSON.stringify(error ? { error: error.message } : { ok: true }), { status: error ? 400 : 200, headers });
  }

  const { data: adminMember } = await admin.from('household_members').select('household_id,is_admin').eq('user_id', user.id).maybeSingle();
  if (!adminMember?.is_admin) return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });

  if (action === 'remove') {
    const { error } = await admin.rpc('remove_household_member', { p_member_id: body.memberId });
    return new Response(JSON.stringify(error ? { error: error.message } : { ok: true }), { status: error ? 400 : 200, headers });
  }

  if (action !== 'invite' || !Array.isArray(body.members)) return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers });
  const { count } = await admin.from('household_members').select('id', { count: 'exact', head: true }).eq('household_id', adminMember.household_id);
  let nextPosition = count ?? 0;
  const results = [];
  for (const member of body.members) {
    const email = String(member.email ?? '').trim().toLowerCase();
    const displayName = String(member.display_name ?? '').trim();
    if (!email || !displayName) continue;
    const { data: existingMember } = await admin.from('household_members').select('id,user_id').eq('household_id', adminMember.household_id).eq('email', email).maybeSingle();
    const temporaryPassword = randomPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { display_name: displayName, must_change_password: true } });
    if (createError && !createError.message.toLowerCase().includes('already')) {
      results.push({ email, ok: false, error: createError.message });
      continue;
    }
    if (!existingMember) {
      await admin.from('household_members').insert({ household_id: adminMember.household_id, user_id: created?.user?.id ?? null, display_name: displayName, email, rotation_position: nextPosition++, is_admin: false });
    } else if (created?.user && !existingMember.user_id) {
      await admin.from('household_members').update({ user_id: created.user.id, display_name: displayName }).eq('id', existingMember.id);
    }
    if (resendKey && emailFrom) {
      const html = `<h2>You were invited to WG Clean</h2><p>Temporary password: <strong>${temporaryPassword}</strong></p><p>Sign in with ${email}, then change your password in Settings.</p><h3>Android</h3><p><a href="${androidUrl}">Download and install the Android app</a>. Allow installation from your browser or file manager when prompted.</p><h3>iPhone/iPad</h3><p><a href="${iosUrl}">Open the iOS installation page</a> and follow the listed TestFlight/App Store instructions.</p>`;
      await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: emailFrom, to: [email], subject: 'Your WG Clean invitation', html }) });
    }
    results.push({ email, ok: true });
  }
  return new Response(JSON.stringify({ ok: true, results }), { headers });
});

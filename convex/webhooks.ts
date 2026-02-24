import { httpAction } from './_generated/server';
import { Webhook } from 'svix';
import { api } from './_generated/api';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserPayload {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

function getPrimaryEmail(data: ClerkUserPayload): string {
  if (!data.primary_email_address_id) return '';
  const found = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  return found?.email_address ?? '';
}

function getFullName(data: ClerkUserPayload): string | undefined {
  const parts = [data.first_name, data.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export const clerkWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  // Verify the webhook signature using svix
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  const body = await request.text();

  let event: { type: string; data: ClerkUserPayload };
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: ClerkUserPayload };
  } catch {
    return new Response('Invalid webhook signature', { status: 400 });
  }

  const { type, data } = event;

  if (type === 'user.created') {
    await ctx.runMutation(api.userMutations.createUserFromClerk, {
      clerkUserId: data.id,
      email: getPrimaryEmail(data),
      fullName: getFullName(data),
    });
  } else if (type === 'user.updated') {
    await ctx.runMutation(api.userMutations.updateUserFromClerk, {
      clerkUserId: data.id,
      email: getPrimaryEmail(data),
      fullName: getFullName(data),
    });
  } else if (type === 'user.deleted') {
    await ctx.runMutation(api.userMutations.deleteUserFromClerk, {
      clerkUserId: data.id,
    });
  }

  return new Response('OK', { status: 200 });
});

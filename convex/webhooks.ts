import { httpAction } from './_generated/server';
import { Webhook } from 'svix';
import { api, internal } from './_generated/api';

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
    // Ensure system categories exist (idempotent — safe to call on every user creation)
    await ctx.runMutation(api.categories.seed, {});
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

// ─────────────────────────────────────────────
// OAuth Callback — WebView bridge
// ─────────────────────────────────────────────

/**
 * POST /webhooks/oauth-callback
 * GET  /webhooks/oauth-callback
 *
 * Returns a minimal HTML page that forwards the OAuth code + state to the
 * React Native WebView (or web parent frame) via postMessage.
 *
 * Used as the redirect_uri for Mono, Stitch, Payoneer, and Wise OAuth flows.
 * The WebView intercepts this page load, reads the message, closes the WebView,
 * and calls accounts.handleOAuthCallback with the extracted code + stateToken.
 */
export const oauthCallbackWebview = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const error = url.searchParams.get('error') ?? '';

  // Escape values to prevent XSS in the inline script
  const safeCode = code.replace(/[<>"'&]/g, '');
  const safeState = state.replace(/[<>"'&]/g, '');
  const safeError = error.replace(/[<>"'&]/g, '');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connecting your account...</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .card { text-align: center; padding: 2rem; max-width: 360px; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb;
               border-top-color: #1a7f5e; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #6b7280; font-size: 0.875rem; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <p>Connecting your account&hellip;</p>
  </div>
  <script>
    (function () {
      var payload = {
        type: 'taxease_oauth_callback',
        code: '${safeCode}',
        state: '${safeState}',
        error: '${safeError}'
      };
      // React Native WebView
      if (typeof window !== 'undefined' && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      // Web iframe / popup
      if (typeof window !== 'undefined' && window.opener) {
        window.opener.postMessage(payload, '*');
        window.close();
      }
      // Web top-level (redirect back to app with params)
      if (typeof window !== 'undefined' && !window.opener && !window.ReactNativeWebView) {
        var params = new URLSearchParams(payload);
        window.location.href = '/app/settings/accounts?' + params.toString();
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// ─────────────────────────────────────────────
// Bank Notification Webhook
// ─────────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 signature using the Web Crypto API.
 * Constant-time comparison prevents timing attacks.
 */
async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(signatureBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    const expectedNorm = expected.toLowerCase();
    const signatureNorm = signature.toLowerCase().replace(/^sha256=/, '');
    if (expectedNorm.length !== signatureNorm.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedNorm.length; i++) {
      diff |= expectedNorm.charCodeAt(i) ^ signatureNorm.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * POST /webhooks/bank-notification
 *
 * Receives real-time transaction notifications from Mono and Stitch.
 * Verifies the HMAC-SHA256 signature and triggers account sync.
 *
 * Mono sends:
 *   x-mono-webhook-secret header (plain secret comparison, not HMAC)
 *   Body: { event: string; data: { account: { id: string } } }
 *
 * Stitch sends:
 *   x-stitch-signature header (HMAC-SHA256 of body)
 *   Body: { eventType: string; accountId: string }
 */
export const bankNotification = httpAction(async (ctx, request) => {
  const body = await request.text();

  let providerAccountId: string | null = null;
  let provider: string | null = null;

  // ─── Mono notification ───
  const monoSecret = process.env.MONO_WEBHOOK_SECRET;
  const monoHeader = request.headers.get('x-mono-webhook-secret');
  if (monoHeader && monoSecret) {
    if (monoHeader !== monoSecret) {
      return new Response('Invalid Mono webhook secret', { status: 401 });
    }
    try {
      const payload = JSON.parse(body) as {
        event?: string;
        data?: { account?: { id?: string } };
      };
      providerAccountId = payload.data?.account?.id ?? null;
      provider = 'mono';

      // Mono reauthorization events — mark account as error (re-auth required)
      const reauthEvents = ['ACCOUNT_DISCONNECTED', 'ACCOUNT_TOKEN_EXPIRED', 'REAUTHORIZATION_REQUIRED'];
      if (payload.event && reauthEvents.includes(payload.event) && providerAccountId) {
        const reauthAccount = await ctx.runQuery(
          (internal as any).accountsHelpers.findByProviderAccountId as any,
          { providerAccountId }
        ) as { _id: string } | null;

        if (reauthAccount) {
          await ctx.runMutation(
            (internal as any).accountsHelpers.updateAccountStatus as any,
            {
              connectedAccountId: reauthAccount._id,
              status: 'error',
              errorMessage: 'Re-authentication required. Please reconnect your account.',
            }
          );
        }
        return new Response('OK', { status: 200 });
      }
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }
  }

  // ─── Stitch notification ───
  if (!provider) {
    const stitchSecret = process.env.STITCH_WEBHOOK_SECRET;
    const stitchSig = request.headers.get('x-stitch-signature');
    if (stitchSig && stitchSecret) {
      const valid = await verifyHmacSignature(body, stitchSig, stitchSecret);
      if (!valid) {
        return new Response('Invalid Stitch webhook signature', { status: 401 });
      }
      try {
        const payload = JSON.parse(body) as {
          eventType?: string;
          accountId?: string;
        };
        providerAccountId = payload.accountId ?? null;
        provider = 'stitch';
      } catch {
        return new Response('Invalid JSON body', { status: 400 });
      }
    }
  }

  // ─── Paystack notification ───
  if (!provider) {
    const paystackSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
    const paystackSig = request.headers.get('x-paystack-signature');
    if (paystackSig && paystackSecret) {
      const valid = await verifyHmacSignature(body, paystackSig, paystackSecret);
      if (!valid) {
        return new Response('Invalid Paystack webhook signature', { status: 401 });
      }
      // Paystack notifications don't carry an account ID in the same way;
      // for Paystack we trigger a sync based on any known Paystack accounts.
      // For now, return 200 OK and let the scheduled sync handle it.
      provider = 'paystack';
      providerAccountId = null;
    }
  }

  if (!provider) {
    // Unknown source — accept but ignore
    return new Response('OK', { status: 200 });
  }

  // Trigger sync if we have a providerAccountId
  if (providerAccountId) {
    // Look up the connected account and trigger sync
    const account = await ctx.runQuery(
      (internal as any).accountsHelpers.findByProviderAccountId as any,
      { providerAccountId }
    ) as { _id: string } | null;

    if (account) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).accountsActions.syncAccount as any,
        { connectedAccountId: account._id }
      );
    }
  }

  return new Response('OK', { status: 200 });
});


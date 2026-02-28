import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { clerkWebhook, oauthCallbackWebview, bankNotification } from './webhooks';

const http = httpRouter();

// Health check endpoint
http.route({
  path: '/health',
  method: 'GET',
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

// Clerk webhook — syncs user.created / user.updated / user.deleted events
http.route({
  path: '/clerk-webhook',
  method: 'POST',
  handler: clerkWebhook,
});

// OAuth callback bridge — returns HTML page that forwards code+state to WebView
// Used as redirect_uri for Mono, Stitch, Payoneer, Wise OAuth flows
http.route({
  path: '/webhooks/oauth-callback',
  method: 'GET',
  handler: oauthCallbackWebview,
});

http.route({
  path: '/webhooks/oauth-callback',
  method: 'POST',
  handler: oauthCallbackWebview,
});

// Bank and payment platform real-time notifications
// Verifies HMAC signature and triggers account sync
http.route({
  path: '/webhooks/bank-notification',
  method: 'POST',
  handler: bankNotification,
});

export default http;

import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { clerkWebhook, oauthCallbackWebview, bankNotification } from './webhooks';

const http = httpRouter();

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

http.route({
  path: '/clerk-webhook',
  method: 'POST',
  handler: clerkWebhook,
});

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

http.route({
  path: '/webhooks/bank-notification',
  method: 'POST',
  handler: bankNotification,
});

export default http;

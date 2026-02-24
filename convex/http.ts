import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { clerkWebhook } from './webhooks';

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

export default http;

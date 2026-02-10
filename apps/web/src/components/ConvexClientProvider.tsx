import { useAuth } from '@clerk/clerk-react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ReactNode, useState } from 'react';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error('Missing VITE_CONVEX_URL');
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [convexClient] = useState(
    () =>
      new ConvexReactClient(convexUrl, {
        // Pass Clerk JWT token to Convex
        async fetch(url, options) {
          const token = await getToken();
          if (token) {
            options = options || {};
            options.headers = {
              ...options.headers,
              Authorization: `Bearer ${token}`,
            };
          }
          return fetch(url, options);
        },
      })
  );

  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}


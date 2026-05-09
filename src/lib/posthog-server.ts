import { PostHog } from "posthog-node";

interface CaptureClient {
  capture: (event: Parameters<PostHog["capture"]>[0]) => void;
}

let cachedClient: CaptureClient | null = null;

const noopClient: CaptureClient = {
  capture: () => undefined,
};

export function getPostHogClient(): CaptureClient {
  if (cachedClient) return cachedClient;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    cachedClient = noopClient;
    return cachedClient;
  }

  cachedClient = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return cachedClient;
}

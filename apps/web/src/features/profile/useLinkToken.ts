import { useCallback, useEffect, useState } from "react";
import { createLinkToken } from "../../api/accounts.ts";
import { errorMessage } from "../../api/http.ts";
import { type LiveLinkToken, liveToken, secondsLeft } from "./link-countdown.ts";

export interface LinkTokenState {
  link: LiveLinkToken | null;
  remaining: number;
  error: string | null;
  retry: () => void;
}

/** While mounted, keeps a fresh one-time QR token, replacing it as soon as it expires. */
export function useLinkToken(): LinkTokenState {
  const [link, setLink] = useState<LiveLinkToken | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const renew = useCallback(async () => {
    setError(null);
    try {
      const fresh = await createLinkToken();
      const receivedAt = Date.now();
      setLink(liveToken(fresh, receivedAt));
      setNow(receivedAt);
    } catch (failure) {
      setLink(null);
      setError(errorMessage(failure));
    }
  }, []);

  useEffect(() => {
    void renew();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [renew]);

  const remaining = link ? secondsLeft(link.deadline, now) : 0;
  const expired = link !== null && remaining === 0;
  useEffect(() => {
    if (expired) void renew();
  }, [expired, renew]);

  return { link, remaining, error, retry: () => void renew() };
}

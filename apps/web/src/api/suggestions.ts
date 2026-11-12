import {
  apiPath,
  type DismissSuggestionRequest,
  type GroupSuggestion,
  SUGGESTIONS_API,
  SuggestionsResponse,
} from "@annamour/protocol";
import { z } from "zod/mini";
import { request } from "./http.ts";

/** « Pas pour nous »: the title leaves the circle's suggestions for a while. */
export async function dismissSuggestion(circleId: string, body: DismissSuggestionRequest): Promise<void> {
  await request(z.unknown(), apiPath(SUGGESTIONS_API.dismiss, { id: circleId }), { body });
}

/** « Pour vous ce soir »: what a circle could watch together, from its people's tastes. */
export async function fetchSuggestions(circleId: string, signal?: AbortSignal): Promise<GroupSuggestion[]> {
  const { suggestions } = await request(SuggestionsResponse, apiPath(SUGGESTIONS_API.circle, { id: circleId }), {
    ...(signal ? { signal } : {}),
  });
  return suggestions;
}

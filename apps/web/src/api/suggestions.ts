import { apiPath, type GroupSuggestion, SUGGESTIONS_API, SuggestionsResponse } from "@annamour/protocol";
import { request } from "./http.ts";

/** « Pour vous ce soir »: what a circle could watch together, from its people's tastes. */
export async function fetchSuggestions(circleId: string, signal?: AbortSignal): Promise<GroupSuggestion[]> {
  const { suggestions } = await request(SuggestionsResponse, apiPath(SUGGESTIONS_API.circle, { id: circleId }), {
    ...(signal ? { signal } : {}),
  });
  return suggestions;
}

import { ApiError } from "@annamour/protocol";
import type { z } from "zod/mini";

/*
 * The one place the app talks HTTP. Every response is validated by its zod
 * schema; every failure becomes an ApiRequestError carrying a French message
 * that can be shown as is.
 */

/** HTTP status used for failures that never reached the server (offline, DNS, CORS). */
export const NETWORK_ERROR_STATUS = 0;
/** HTTP status used when the server answered something that does not match the contract. */
export const INVALID_RESPONSE_STATUS = -1;

const GENERIC_MESSAGES: Record<number, string> = {
  [NETWORK_ERROR_STATUS]: "Pas de connexion. Vérifie ton réseau et réessaie.",
  [INVALID_RESPONSE_STATUS]: "Réponse inattendue du serveur. Réessaie dans un instant.",
  401: "Connecte-toi avec ta clé pour continuer.",
  404: "Introuvable.",
  429: "Trop d'essais. Patiente un peu avant de réessayer.",
};
const SERVER_ERROR_MESSAGE = "Le serveur ne répond pas. Réessaie dans un instant.";
const UNKNOWN_ERROR_MESSAGE = "Ça n'a pas marché. Réessaie dans un instant.";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

/** Messages for one call, by HTTP status: they win over the server's own text. */
export type StatusMessages = Partial<Record<number, string>>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  messages?: StatusMessages;
  signal?: AbortSignal;
}

function messageFor(status: number, serverMessage: string | undefined, messages: StatusMessages | undefined): string {
  const specific = messages?.[status];
  if (specific) return specific;
  if (serverMessage) return serverMessage;
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return GENERIC_MESSAGES[status] ?? UNKNOWN_ERROR_MESSAGE;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const hasBody = options.body !== undefined;
  try {
    return await fetch(path, {
      method: options.method ?? (hasBody ? "POST" : "GET"),
      credentials: "same-origin",
      headers: hasBody
        ? { "content-type": "application/json", accept: "application/json" }
        : { accept: "application/json" },
      body: hasBody ? JSON.stringify(options.body) : null,
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError(NETWORK_ERROR_STATUS, messageFor(NETWORK_ERROR_STATUS, undefined, options.messages));
  }
}

/** Calls the API and returns the body parsed by `schema`, or throws an ApiRequestError. */
export async function request<Schema extends z.ZodMiniType>(
  schema: Schema,
  path: string,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  const response = await send(path, options);
  const body = await readJson(response);

  if (!response.ok) {
    const parsed = ApiError.safeParse(body);
    const serverMessage = parsed.success ? parsed.data.error : undefined;
    throw new ApiRequestError(response.status, messageFor(response.status, serverMessage, options.messages));
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError(
      INVALID_RESPONSE_STATUS,
      messageFor(INVALID_RESPONSE_STATUS, undefined, options.messages),
    );
  }
  return parsed.data;
}

/** The French message to show for any error thrown while calling the API. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : UNKNOWN_ERROR_MESSAGE;
}

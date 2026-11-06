import type { Account } from "@annamour/protocol";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { z } from "zod";
import { PasskeyError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";

/** A ceremony must finish within this delay after its options were issued. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface RelyingParty {
  /** The production domain: passkeys only work there. */
  id: string;
  name: string;
  /** Every origin the PWA is served from. */
  origins: string[];
}

/** The SimpleWebAuthn functions this service relies on, injectable for tests. */
export interface WebAuthn {
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
}

export const simpleWebAuthn: WebAuthn = {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
};

/* The library checks the cryptography; these only make sure the shape is right before handing it over. */
const ClientExtensions = z.record(z.string(), z.unknown());
const RegistrationResponse = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  clientExtensionResults: ClientExtensions,
  response: z.looseObject({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    transports: z.array(z.string()).optional(),
  }),
});
const AuthenticationResponse = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  clientExtensionResults: ClientExtensions,
  response: z.looseObject({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
  }),
});

type Ceremony = { kind: "register"; accountId: string } | { kind: "login" };

export interface PasskeyServiceOptions {
  repositories: Pick<Repositories, "passkeys">;
  relyingParty: RelyingParty;
  now: () => number;
  webAuthn?: WebAuthn;
}

/** Optional Face ID / Touch ID sign-in; the 4-word key always remains the fallback. */
export class PasskeyService {
  private readonly repositories: PasskeyServiceOptions["repositories"];
  private readonly relyingParty: RelyingParty;
  private readonly now: () => number;
  private readonly webAuthn: WebAuthn;
  /** Challenges issued and not used yet, kept server-side only. */
  private readonly challenges = new Map<string, Ceremony & { expiresAt: number }>();

  constructor({ repositories, relyingParty, now, webAuthn = simpleWebAuthn }: PasskeyServiceOptions) {
    this.repositories = repositories;
    this.relyingParty = relyingParty;
    this.now = now;
    this.webAuthn = webAuthn;
  }

  async registrationOptions(account: Account): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const options = await this.webAuthn.generateRegistrationOptions({
      rpName: this.relyingParty.name,
      rpID: this.relyingParty.id,
      userName: account.name,
      userID: new TextEncoder().encode(account.id),
      attestationType: "none",
      excludeCredentials: this.repositories.passkeys.listForAccount(account.id).map(({ id, transports }) => ({
        id,
        transports,
      })),
      // Discoverable credentials let the login skip any username.
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    this.remember(options.challenge, { kind: "register", accountId: account.id });
    return options;
  }

  async verifyRegistration(accountId: string, payload: unknown): Promise<void> {
    const parsed = RegistrationResponse.safeParse(payload);
    if (!parsed.success) throw new PasskeyError();
    const result = await this.webAuthn
      .verifyRegistrationResponse({
        response: parsed.data as RegistrationResponseJSON,
        expectedChallenge: (challenge) => this.consume(challenge, { kind: "register", accountId }),
        expectedOrigin: this.relyingParty.origins,
        expectedRPID: this.relyingParty.id,
        requireUserVerification: false,
      })
      .catch(() => ({ verified: false as const }));
    if (!result.verified) throw new PasskeyError();
    const { credential } = result.registrationInfo;
    this.repositories.passkeys.insert(
      {
        id: credential.id,
        accountId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
      },
      this.now(),
    );
  }

  async loginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await this.webAuthn.generateAuthenticationOptions({
      rpID: this.relyingParty.id,
      userVerification: "preferred",
    });
    this.remember(options.challenge, { kind: "login" });
    return options;
  }

  /** Returns the account the passkey belongs to. */
  async verifyLogin(payload: unknown): Promise<string> {
    const parsed = AuthenticationResponse.safeParse(payload);
    const passkey = parsed.success ? this.repositories.passkeys.find(parsed.data.id) : undefined;
    if (!parsed.success || !passkey) throw new PasskeyError();
    const result = await this.webAuthn
      .verifyAuthenticationResponse({
        response: parsed.data as AuthenticationResponseJSON,
        expectedChallenge: (challenge) => this.consume(challenge, { kind: "login" }),
        expectedOrigin: this.relyingParty.origins,
        expectedRPID: this.relyingParty.id,
        credential: passkey,
        requireUserVerification: false,
      })
      .catch(() => ({ verified: false, authenticationInfo: undefined }));
    if (!result.verified || !result.authenticationInfo) throw new PasskeyError();
    this.repositories.passkeys.updateCounter(passkey.id, result.authenticationInfo.newCounter);
    return passkey.accountId;
  }

  private remember(challenge: string, ceremony: Ceremony): void {
    const now = this.now();
    for (const [key, pending] of this.challenges) if (pending.expiresAt <= now) this.challenges.delete(key);
    this.challenges.set(challenge, { ...ceremony, expiresAt: now + CHALLENGE_TTL_MS });
  }

  /** A challenge is good once, for the ceremony (and account) it was issued for, before it expires. */
  private consume(challenge: string, expected: Ceremony): boolean {
    const pending = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    if (!pending || pending.expiresAt <= this.now()) return false;
    if (pending.kind !== expected.kind) return false;
    return pending.kind === "login" || (expected.kind === "register" && pending.accountId === expected.accountId);
  }
}

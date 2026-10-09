import { describe, expect, it } from "vitest";
import {
  getEvidence,
  postEvidence,
  postEvidenceReview,
  postIssueStamps,
  postSignIn,
  postSignOut,
  getPassportByAddress,
  getNonce,
} from "@/server/api/handlers";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monad } from "viem/chains";
import { createSiweMessage } from "viem/siwe";
import { makeServices, ORIGIN, post, readJson, request, signInNewWallet } from "./helpers/setup";

const communityClaim = {
  kind: "community-contribution",
  title: "Meetup recap",
  summary: "Organised a meetup and published the recap.",
  reference: "https://example.org/recap",
  occurredAt: "2026-09-10",
};

async function setup() {
  const services = makeServices({ now: new Date("2026-10-09T12:00:00Z") });
  const alice = await signInNewWallet(services);
  const reviewer = await signInNewWallet(services);
  const reviewerUser = await services.memory.findUserByAddress(reviewer.address as `0x${string}`);
  services.memory.setRole(reviewerUser!.id, "reviewer");
  const submitted = await postEvidence(post("/api/evidence", communityClaim, { cookie: alice.cookie }), services);
  const evidenceId = (await readJson(submitted)).evidence!.id;
  return { services, alice, reviewer, evidenceId };
}

const code = async (response: Response) => (await readJson(response)).error?.code;

describe("unauthorized stamp issuance", () => {
  it("refuses to issue stamps without a session", async () => {
    const { services, evidenceId } = await setup();
    const response = await postIssueStamps(post("/api/stamps/issue", { evidenceId }), services);
    expect(response.status).toBe(401);
    expect(services.memory.stamps).toHaveLength(0);
  });

  it("refuses to issue stamps for a contributor, including for their own evidence", async () => {
    const { services, alice, evidenceId } = await setup();
    const response = await postIssueStamps(post("/api/stamps/issue", { evidenceId }, { cookie: alice.cookie }), services);
    expect(response.status).toBe(403);
    expect(services.memory.stamps).toHaveLength(0);
  });

  it("refuses to issue stamps for evidence that is not verified, even for a reviewer", async () => {
    const { services, reviewer, evidenceId } = await setup();
    const response = await postIssueStamps(post("/api/stamps/issue", { evidenceId }, { cookie: reviewer.cookie }), services);
    expect(response.status).toBe(409);
    expect(await code(response)).toBe("not_verified");
    expect(services.memory.stamps).toHaveLength(0);
  });

  it("refuses review by a contributor", async () => {
    const { services, alice, evidenceId } = await setup();
    const response = await postEvidenceReview(
      post(`/api/evidence/${evidenceId}/review`, { decision: "approve" }, { cookie: alice.cookie }),
      services,
      evidenceId,
    );
    expect(response.status).toBe(403);
    expect(services.memory.evidence[0].status).toBe("pending");
  });

  it("refuses a reviewer approving their own evidence", async () => {
    const { services, reviewer } = await setup();
    const own = await postEvidence(
      post("/api/evidence", { ...communityClaim, reference: "https://example.org/mine" }, { cookie: reviewer.cookie }),
      services,
    );
    const id = (await readJson(own)).evidence!.id;
    const response = await postEvidenceReview(
      post(`/api/evidence/${id}/review`, { decision: "approve" }, { cookie: reviewer.cookie }),
      services,
      id,
    );
    expect(response.status).toBe(403);
    expect(services.memory.stamps).toHaveLength(0);
  });

  it("refuses reviewer approval for campaign deliverables (verified by the Collab Board only)", async () => {
    const { services, alice, reviewer } = await setup();
    const submitted = await postEvidence(
      post(
        "/api/evidence",
        { ...communityClaim, kind: "campaign-deliverable", reference: "meetup-recap-reel" },
        { cookie: alice.cookie },
      ),
      services,
    );
    const body = await readJson(submitted);
    expect(body.evidence!.status).toBe("unavailable");
    const response = await postEvidenceReview(
      post(`/api/evidence/${body.evidence!.id}/review`, { decision: "approve" }, { cookie: reviewer.cookie }),
      services,
      body.evidence!.id,
    );
    expect(response.status).toBe(409);
    expect(services.memory.stamps).toHaveLength(0);
  });

  it("rejects cross-site writes even with a valid reviewer session", async () => {
    const { services, reviewer, evidenceId } = await setup();
    for (const origin of ["https://evil.example", null]) {
      const response = await postEvidenceReview(
        post(`/api/evidence/${evidenceId}/review`, { decision: "approve" }, { cookie: reviewer.cookie, origin }),
        services,
        evidenceId,
      );
      expect(response.status).toBe(403);
      expect(await code(response)).toBe("bad_origin");
    }
    expect(services.memory.evidence[0].status).toBe("pending");
  });

  it("rejects claims that try to set the wallet, status, or points in the body", async () => {
    const { services, alice, reviewer } = await setup();
    for (const extra of [{ address: reviewer.address }, { status: "verified" }, { points: 1000 }, { userId: "x" }]) {
      const response = await postEvidence(
        post("/api/evidence", { ...communityClaim, reference: "https://example.org/other", ...extra }, { cookie: alice.cookie }),
        services,
      );
      expect(response.status).toBe(400);
    }
    expect(services.memory.evidence).toHaveLength(1);
  });

  it("files evidence under the session wallet only", async () => {
    const { services, alice } = await setup();
    const aliceUser = await services.memory.findUserByAddress(alice.address as `0x${string}`);
    expect(services.memory.evidence.every((record) => record.userId === aliceUser!.id)).toBe(true);
  });

  it("refuses evidence submission without a session", async () => {
    const { services } = await setup();
    const response = await postEvidence(post("/api/evidence", { ...communityClaim, reference: "https://example.org/x" }), services);
    expect(response.status).toBe(401);
  });

  it("hides the review queue from contributors", async () => {
    const { services, alice } = await setup();
    const response = await getEvidence(request("/api/evidence?status=pending", { cookie: alice.cookie }), services);
    expect(response.status).toBe(403);
  });

  it("stops accepting a session after sign-out or expiry", async () => {
    const { services, alice, reviewer, evidenceId } = await setup();
    await postSignOut(post("/api/auth/logout", {}, { cookie: reviewer.cookie }), services);
    const afterLogout = await postIssueStamps(post("/api/stamps/issue", { evidenceId }, { cookie: reviewer.cookie }), services);
    expect(afterLogout.status).toBe(401);

    const later = { ...services, now: () => new Date("2026-11-30T00:00:00Z") };
    const expired = await postEvidence(post("/api/evidence", { ...communityClaim, reference: "https://example.org/y" }, { cookie: alice.cookie }), later);
    expect(expired.status).toBe(401);
  });

  it("does not create an account or reputation from wallet connection alone", async () => {
    const services = makeServices();
    const response = await getPassportByAddress(request("/api/passports/0x1234567890abcdef1234567890abcdef12345678"), services, "0x1234567890abcdef1234567890abcdef12345678");
    expect(response.status).toBe(404);
    expect(services.memory.users).toHaveLength(0);
  });

  it("answers 503 instead of pretending when the database is not configured", async () => {
    const services = makeServices({ store: null });
    const response = await postIssueStamps(post("/api/stamps/issue", { evidenceId: "x" }), services);
    expect(response.status).toBe(503);
  });
});

describe("sign-in", () => {
  it("rejects a replayed sign-in message", async () => {
    const services = makeServices();
    const { signedIn } = await signInNewWallet(services);
    const replay = await postSignIn(
      post("/api/auth/verify", { message: signedIn.message, signature: signedIn.signature }, { cookie: signedIn.nonceCookie }),
      services,
    );
    expect(replay.status).toBe(409);
    expect(await code(replay)).toBe("nonce_used");
    expect(services.memory.sessions).toHaveLength(1);
  });

  it("rejects a message signed for another site", async () => {
    const services = makeServices();
    const account = privateKeyToAccount(generatePrivateKey());
    const nonceResponse = await getNonce(request("/api/auth/nonce"), services);
    const { nonce } = (await nonceResponse.json()) as { nonce: string };
    const nonceCookie = nonceResponse.headers.getSetCookie()[0].split(";")[0];
    const message = createSiweMessage({
      address: account.address, chainId: monad.id, domain: "evil.example", nonce, uri: "https://evil.example", version: "1", issuedAt: new Date(),
    });
    const signature = await account.signMessage({ message });
    const response = await postSignIn(post("/api/auth/verify", { message, signature }, { cookie: nonceCookie }), services);
    expect(response.status).toBe(400);
    expect(await code(response)).toBe("invalid_message");
    expect(services.memory.sessions).toHaveLength(0);
  });

  it("rejects a signature from a different wallet than the message names", async () => {
    const services = makeServices();
    const victim = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const nonceResponse = await getNonce(request("/api/auth/nonce"), services);
    const { nonce } = (await nonceResponse.json()) as { nonce: string };
    const nonceCookie = nonceResponse.headers.getSetCookie()[0].split(";")[0];
    const message = createSiweMessage({
      address: victim.address, chainId: monad.id, domain: "localhost:3000", nonce, uri: ORIGIN, version: "1", issuedAt: new Date(),
    });
    const signature = await attacker.signMessage({ message });
    const response = await postSignIn(post("/api/auth/verify", { message, signature }, { cookie: nonceCookie }), services);
    expect(response.status).toBe(400);
    expect(await code(response)).toBe("invalid_signature");
    expect(services.memory.users).toHaveLength(0);
  });

  it("rejects a sign-in without the nonce cookie", async () => {
    const services = makeServices();
    const response = await postSignIn(post("/api/auth/verify", { message: "x".repeat(30), signature: "0x1234567890" }), services);
    expect(response.status).toBe(400);
    expect(await code(response)).toBe("nonce_expired");
  });
});

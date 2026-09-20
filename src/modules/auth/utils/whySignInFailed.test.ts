import { describe, it, expect } from "vitest";
import { whySignInFailed } from "./whySignInFailed";

describe("whySignInFailed", () => {
  it("turns the bare GoTrue 400 into a sentence about email or password", () => {
    const problem = whySignInFailed({
      code: "invalid_credentials",
      status: 400,
      message: "Invalid login credentials",
    });
    expect(problem.title).toBe("Wrong email or password");
    expect(problem.link?.to).toBe("/forgot-password");
  });

  it("recognises the same failure from an instance that sends no code", () => {
    expect(whySignInFailed({ status: 400, message: "Invalid login credentials" }).title).toBe(
      "Wrong email or password",
    );
  });

  it("does not say whether the address has an account", () => {
    const { title, description } = whySignInFailed({ code: "invalid_credentials", status: 400 });
    expect(`${title} ${description}`).not.toMatch(/no account (exists|with)|not registered|unknown email/i);
  });

  it("separates an unconfirmed email from a wrong password", () => {
    expect(whySignInFailed({ code: "email_not_confirmed", status: 400 }).title).toMatch(
      /not been confirmed/,
    );
  });

  it("tells a rate-limited member to wait rather than to retype", () => {
    expect(whySignInFailed({ status: 429, message: "Request rate limit reached" }).description).toMatch(
      /wait about a minute/i,
    );
  });

  it("names the network, not the credentials, when the request never landed", () => {
    const problem = whySignInFailed({ name: "AuthRetryableFetchError", message: "Failed to fetch" });
    expect(problem.title).toMatch(/could not reach/i);
    expect(problem.description).toMatch(/not sent/);
  });

  it("treats a disabled account as something the office can explain", () => {
    expect(whySignInFailed({ code: "user_banned", status: 403 }).description).toMatch(/church office/);
  });

  it("does not swallow a message it has no sentence for", () => {
    expect(whySignInFailed({ message: "database connection closed" }).description).toBe(
      "database connection closed",
    );
  });

  it("still says something when handed nothing at all", () => {
    expect(whySignInFailed(undefined).description.length).toBeGreaterThan(0);
  });
});

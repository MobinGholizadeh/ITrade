import { describe, expect, it } from "vitest";
import { allowedMutation } from "../src/server/http";

describe("local mutation origin guard", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://127.0.0.1:3000/api/settings", {
      method: "PUT",
      headers,
    });
  it("accepts the configured origin", () =>
    expect(
      allowedMutation(
        request({
          origin: "http://127.0.0.1:3000",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(true));
  it.each([
    {},
    { origin: "https://attacker.example" },
    { origin: "null" },
    { origin: "http://127.0.0.1:3000.attacker.example" },
    { origin: "http://127.0.0.1:3000", "sec-fetch-site": "cross-site" },
  ])("rejects missing, spoofed, and cross-site origins %j", (headers) =>
    expect(allowedMutation(request(headers as Record<string, string>))).toBe(
      false,
    ),
  );
});

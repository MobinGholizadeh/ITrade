import { it, expect } from "vitest";
import { retentionSchema } from "../src/domain/retention";
it("uses conservative retention defaults and validates configured windows", () => {
  expect(retentionSchema.parse({}).RETENTION_NEWS_DAYS).toBe(180);
  expect(
    retentionSchema.parse({ RETENTION_NEWS_DAYS: "30" }).RETENTION_NEWS_DAYS,
  ).toBe(30);
  for (const value of ["0", "-1", "NaN", "99999", "1;drop table news_articles"])
    expect(() =>
      retentionSchema.parse({ RETENTION_NEWS_DAYS: value }),
    ).toThrow();
});

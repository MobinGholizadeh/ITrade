import { z } from "zod";
const days = (fallback: number) =>
  z.coerce.number().int().min(7).max(3650).default(fallback);
export const retentionSchema = z.object({
  RETENTION_FINE_CANDLE_DAYS: days(90),
  RETENTION_NEWS_DAYS: days(180),
  RETENTION_SNAPSHOT_DAYS: days(365),
  RETENTION_DELIVERY_DAYS: days(90),
});

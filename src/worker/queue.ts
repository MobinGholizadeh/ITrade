export const healthQueueName = "itrade-foundation-health";
export const jobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 86400, count: 100 },
  removeOnFail: { age: 604800, count: 1000 },
};

// Hourly: expire old reward points and SMS customers before theirs expire.
// Dependencies are injectable so the scheduler can be tested without a live DB.
const createRewardWorker = ({ ready, service, logger = console, intervalMs = 60 * 60 * 1000 }) => {
  let timer;
  let active;
  let stopped = false;

  const sweep = async () => {
    // Wait for model sync: it adds the expiry columns on older databases.
    await ready;
    const expired = await service.processExpiredPoints();
    if (expired) logger.log(`Reward points expired: ${expired}`);
    const reminded = await service.sendExpiryReminders();
    if (reminded) logger.log(`Reward expiry reminders sent: ${reminded}`);
  };

  const run = () => {
    if (stopped) return Promise.resolve();
    if (active) return active;
    active = sweep().catch((error) => {
      logger.error(`Reward points job failed: ${error.message}`);
    }).finally(() => { active = null; });
    return active;
  };

  return {
    run,
    start() {
      if (timer || stopped) return;
      void run();
      timer = setInterval(run, intervalMs);
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    },
  };
};

module.exports = { createRewardWorker };

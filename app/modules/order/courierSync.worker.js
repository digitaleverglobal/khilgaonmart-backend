const { Op } = require("sequelize");

// Dependencies are injectable so the scheduler can be tested without a live DB.
const createCourierSyncWorker = ({ Order, service, logger = console, intervalMs = 300000 }) => {
  let timer;
  let active;
  let stopped = false;

  const sweep = async () => {
    let cursor = 0;
    while (!stopped) {
      const orders = await Order.findAll({
        attributes: ["Id", "courier"],
        where: {
          Id: { [Op.gt]: cursor },
          status: { [Op.in]: ["in_courier", "on_hold"] },
          courier: { [Op.in]: ["Steadfast", "Pathao"] },
        },
        order: [["Id", "ASC"]],
        limit: 100,
      });
      if (!orders.length) break;
      for (const order of orders) {
        if (stopped) break;
        cursor = order.Id;
        try {
          const sync = String(order.courier).toLowerCase() === "steadfast"
            ? service.syncSteadfastStatusInDB : service.syncPathaoStatusInDB;
          await sync(order.Id, { automatic: true });
        } catch (error) {
          logger.warn(`Courier sync failed for order ${order.Id}: ${error.message}`);
        }
      }
    }
  };

  const run = () => {
    if (stopped) return Promise.resolve();
    if (active) return active;
    active = sweep().catch((error) => {
      logger.error(`Courier sync failed: ${error.message}`);
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

module.exports = { createCourierSyncWorker };

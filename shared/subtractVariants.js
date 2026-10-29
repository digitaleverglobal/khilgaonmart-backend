const parseVariants = require("./parseVariants");

const subtractVariants = (existingVariants, removingVariants) => {
  const oldVariants = parseVariants(existingVariants);
  const deletedVariants = parseVariants(removingVariants);

  const map = new Map();

  oldVariants.forEach((item) => {
    const key = `${item.size}__${item.color}`;
    map.set(key, {
      ...item,
      size: item.size,
      color: item.color,
      quantity: Number(item.quantity || 0),
      purchase_price: Number(item.purchase_price || 0),
      sale_price: Number(item.sale_price || 0),
    });
  });

  deletedVariants.forEach((item) => {
    const key = `${item.size}__${item.color}`;
    const qty = Number(item.quantity || 0);

    if (!map.has(key)) return;

    const old = map.get(key);
    const nextQty = old.quantity - qty;

    if (nextQty > 0) {
      map.set(key, {
        ...old,
        quantity: nextQty,
      });
      return;
    }

    map.delete(key);
  });

  return Array.from(map.values());
};

module.exports = subtractVariants;

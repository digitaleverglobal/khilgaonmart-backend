const parseVariants = require("./parseVariants");

const mergeVariants = (existingVariants, incomingVariants) => {
  const oldVariants = parseVariants(existingVariants);
  const newVariants = parseVariants(incomingVariants);

  const map = new Map();

  // existing
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

  // incoming
  newVariants.forEach((item) => {
    const key = `${item.size}__${item.color}`;
    const qty = Number(item.quantity || 0);

    if (map.has(key)) {
      const old = map.get(key);
      map.set(key, {
        ...old,
        quantity: old.quantity + qty,
        purchase_price:
          item.purchase_price !== undefined && item.purchase_price !== null
            ? Number(item.purchase_price || 0)
            : old.purchase_price,
        sale_price:
          item.sale_price !== undefined && item.sale_price !== null
            ? Number(item.sale_price || 0)
            : old.sale_price,
      });
    } else {
      map.set(key, {
        ...item,
        size: item.size,
        color: item.color,
        quantity: qty,
        purchase_price: Number(item.purchase_price || 0),
        sale_price: Number(item.sale_price || 0),
      });
    }
  });

  return Array.from(map.values());
};

module.exports = mergeVariants;

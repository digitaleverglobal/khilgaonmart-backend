const parseVariants = (variants) => {
  if (!variants) return [];

  if (Array.isArray(variants)) return variants;

  if (typeof variants === "string") {
    try {
      const parsed = JSON.parse(variants);
      return parseVariants(parsed);
    } catch (error) {
      return [];
    }
  }

  return [];
};

module.exports = parseVariants;

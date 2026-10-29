const toNumber = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};

const normalizeUnitLabel = (unit) => {
  const normalizedUnit = String(unit || "Pcs").trim();
  return normalizedUnit || "Pcs";
};

const toBaseStockPayload = (unit, unitValue) => {
  const normalizedUnit = normalizeUnitLabel(unit);
  const normalizedUnitKey = normalizedUnit.toLowerCase();
  const numericValue = toNumber(unitValue);

  if (normalizedUnitKey === "kg") {
    return {
      unit: "Gram",
      unitValue: numericValue * 1000,
      inputUnit: "Kg",
      inputUnitValue: numericValue,
      isWeightUnit: true,
    };
  }

  if (normalizedUnitKey === "gram") {
    return {
      unit: "Gram",
      unitValue: numericValue,
      inputUnit: "Gram",
      inputUnitValue: numericValue,
      isWeightUnit: true,
    };
  }

  return {
    unit: normalizedUnit,
    unitValue: numericValue,
    inputUnit: normalizedUnit,
    inputUnitValue: numericValue,
    isWeightUnit: false,
  };
};

const formatUnitValue = (value) => Number(toNumber(value).toFixed(2));

const formatStockForDisplay = (record) => {
  const plainRecord = record?.toJSON ? record.toJSON() : { ...record };
  const basePayload = toBaseStockPayload(plainRecord.unit, plainRecord.unitValue);

  if (!basePayload.isWeightUnit) {
    return plainRecord;
  }

  if (basePayload.unitValue >= 1000) {
    return {
      ...plainRecord,
      unit: "Kg",
      unitValue: formatUnitValue(basePayload.unitValue / 1000),
      baseUnit: "Gram",
      baseUnitValue: formatUnitValue(basePayload.unitValue),
    };
  }

  return {
    ...plainRecord,
    unit: "Gram",
    unitValue: formatUnitValue(basePayload.unitValue),
    baseUnit: "Gram",
    baseUnitValue: formatUnitValue(basePayload.unitValue),
  };
};

module.exports = {
  toNumber,
  toBaseStockPayload,
  formatStockForDisplay,
  formatUnitValue,
};

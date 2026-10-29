// const pick = (obj, keys) => {
//     const finalObj = {};
  
//     for (const key of keys) {
//       if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
//         finalObj[key] = obj[key];
//       }
//     }
//     return finalObj;
//   };
  
//   module.exports = pick;
  

const pick = (obj = {}, keys = []) => {
  const finalObj = {};

  // ✅ keys iterable না হলে crash না করে empty array ধরে নেবে
  if (!Array.isArray(keys)) return finalObj;

  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      finalObj[key] = obj[key];
    }
  }

  return finalObj;
};

module.exports = pick;

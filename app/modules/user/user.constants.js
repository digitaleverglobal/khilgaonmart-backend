// app/modules/user/user.constant.js

const UserFilterAbleFileds = ["searchTerm", "role"]; // চাইলে আরও add করবেন: "City","Country"
const UserSearchableFields = ["FirstName", "LastName", "Email", "Phone"]; // ✅ real DB columns

module.exports = { UserFilterAbleFileds, UserSearchableFields };

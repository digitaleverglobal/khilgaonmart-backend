const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick         = require("../../../shared/pick");
const Service      = require("./tagManager.service");

const insertIntoDB    = catchAsync(async (req, res) => { const r = await Service.insertIntoDB(req.body);                                          sendResponse(res, { statusCode: 201, success: true, message: "Tag manager created", data: r }); });
const getAllFromDB     = catchAsync(async (req, res) => { const r = await Service.getAllFromDB(pick(req.query, ["searchTerm"]), pick(req.query, ["limit","page","sortBy","sortOrder"])); sendResponse(res, { statusCode: 200, success: true, message: "Tag managers fetched", meta: r.meta, data: r.data }); });
const updateOneFromDB = catchAsync(async (req, res) => { const r = await Service.updateOneFromDB(req.params.id, req.body);                        sendResponse(res, { statusCode: 200, success: true, message: "Tag manager updated", data: r }); });
const deleteIdFromDB  = catchAsync(async (req, res) => { const r = await Service.deleteIdFromDB(req.params.id);                                   sendResponse(res, { statusCode: 200, success: true, message: "Tag manager deleted", data: r }); });

module.exports = { insertIntoDB, getAllFromDB, updateOneFromDB, deleteIdFromDB };

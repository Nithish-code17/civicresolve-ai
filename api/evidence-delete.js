"use strict";

const { v2: cloudinary } = require("cloudinary");
const { createEvidenceHandlers } = require("../server/evidence-provider");

module.exports = createEvidenceHandlers({ cloudinary }).remove;

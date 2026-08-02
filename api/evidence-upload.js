"use strict";

const { v2: cloudinary } = require("cloudinary");
const { createEvidenceHandlers } = require("../server/evidence-provider");

const handler = createEvidenceHandlers({ cloudinary }).upload;

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: { sizeLimit: "8mb" }
  }
};

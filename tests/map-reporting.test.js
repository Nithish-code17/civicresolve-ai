"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const mapsSource = fs.readFileSync(path.join(root, "assets/js/maps.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "assets/js/firestore-data.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/product.css"), "utf8");
const leafletJs = path.join(root, "assets/vendor/leaflet/leaflet.js");
const leafletCss = path.join(root, "assets/vendor/leaflet/leaflet.css");
const leafletLicense = path.join(root, "assets/vendor/leaflet/LICENSE");

const window = {};
const context = vm.createContext({
  window,
  Object,
  String,
  Number,
  Math,
  Array,
  Map,
  Set,
  Promise,
  Date,
  URLSearchParams,
  setTimeout,
  fetch: async () => { throw new Error("Network access is not expected in this contract test."); }
});
vm.runInContext(mapsSource, context, { filename: "maps.js" });

assert.equal(typeof window.CivicMaps.normaliseLocation, "function");
assert.equal(typeof window.CivicMaps.initComplaintPicker, "function");
assert.equal(typeof window.CivicMaps.initOperationsMap, "function");
assert.equal(typeof window.CivicMaps.updateOperationsMap, "function");

const location = window.CivicMaps.normaliseLocation({
  latitude: "11.018412345",
  longitude: "76.967412345",
  address: "  Gandhipuram   Bus Stand, Coimbatore  ",
  ward: "Gandhipuram",
  source: "device",
  accuracyMeters: "14.5"
});
assert.equal(location.latitude, 11.0184123);
assert.equal(location.longitude, 76.9674123);
assert.equal(location.address, "Gandhipuram Bus Stand, Coimbatore");
assert.equal(location.accuracyMeters, 14.5);
assert.equal(window.CivicMaps.normaliseLocation({ latitude: 91, longitude: 76, address: "Invalid" }), null);

const grouped = window.CivicMaps.aggregateComplaints([
  { id: "A", title: "Pothole", priority: "High", status: "Submitted", locationData: location },
  { id: "B", title: "Road damage", priority: "Medium", status: "In Progress", locationData: { ...location, latitude: 11.01844, longitude: 76.96744 } },
  { id: "LEGACY", title: "No coordinates", priority: "Low", status: "Submitted" }
]);
assert.equal(grouped.length, 1, "Nearby pins should be grouped into one operational marker.");
assert.equal(grouped[0].items.length, 2);
assert.equal(window.CivicMaps.markerColour({ priority: "High" }, "priority"), "#c3343d");
assert.equal(window.CivicMaps.markerColour({ status: "Resolved" }, "status"), "#15805d");

assert.ok(fs.statSync(leafletJs).size > 100000, "The stable Leaflet runtime must be vendored locally.");
assert.ok(fs.statSync(leafletCss).size > 10000, "Leaflet styles must be vendored locally.");
assert.ok(fs.statSync(leafletLicense).size > 500, "The Leaflet license must accompany the vendored runtime.");
assert.ok(html.indexOf("assets/vendor/leaflet/leaflet.js") < html.indexOf("assets/js/maps.js"));
assert.ok(html.indexOf("assets/js/maps.js") < html.indexOf("assets/js/app.js"));
assert.match(appSource, /id="complaintLocationMap"/);
assert.match(appSource, /readFormLocation/);
assert.match(appSource, /id="complaintOperationsMap"/);
assert.match(appSource, /id="categoryFilter"/);
assert.match(appSource, /id="departmentFilter"/);
assert.match(dataSource, /locationData: window\.CivicMaps\?\.normaliseLocation/);
assert.match(css, /\.complaint-location-map/);
assert.match(css, /\.complaint-operations-map/);
assert.match(css, /\.map-filter-row/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.complaint-location-map/);

console.log("Map-based complaint reporting tests passed.");

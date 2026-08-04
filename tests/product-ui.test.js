"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/product.css"), "utf8");
const iconsSource = fs.readFileSync(path.join(root, "assets/js/icons.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");

const productCssIndex = html.indexOf("assets/css/product.css");
assert.ok(productCssIndex > html.indexOf("assets/css/role-accounts.css"), "The product design layer must load last.");
assert.ok(html.indexOf("assets/js/icons.js") < html.indexOf("assets/js/auth.js"), "Icons must be available before UI rendering starts.");
assert.match(html, /assets\/favicon\.svg/);
assert.match(css, /--product-navy:/);
assert.match(css, /--product-text-caption:\s*11px/);
assert.match(css, /--product-text-base:\s*14px/);
assert.match(css, /\.v2-shell \.nav-link[\s\S]*?font-size:\s*var\(--product-text-base\)/);
assert.match(css, /\.v2-shell \.data-table td[\s\S]*?font-size:\s*var\(--product-text-label\)/);
assert.match(css, /\.v2-shell \.field-label > span,[\s\S]*?font-size:\s*var\(--product-text-label\)/);
assert.match(css, /\.product-hero-status/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width: 720px\)/);
assert.doesNotMatch(appSource, /hero-visual|floating-card|pulse-ring/);

const window = {};
vm.runInContext(iconsSource, vm.createContext({ window, Object, String, Number, Math }), { filename: "icons.js" });
assert.equal(typeof window.CivicIcons.render, "function");
assert.match(window.CivicIcons.render("shield-check"), /<svg/);
assert.match(window.CivicIcons.render("shield-check"), /aria-hidden="true"/);
assert.ok(window.CivicIcons.names.includes("layout-dashboard"));
assert.ok(window.CivicIcons.names.includes("bell"));

console.log("Product interface contract tests passed.");

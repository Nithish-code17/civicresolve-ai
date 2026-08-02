const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../assets/js/evidence-upload.js"), "utf8");

function createHarness() {
  const writes = { requests: [], opened: [] };
  const profile = {
    uid: "citizen-1",
    email: "citizen@example.com",
    displayName: "Citizen One",
    role: "citizen"
  };
  const sdk = { Timestamp: { now: () => ({ timestamp: true }) } };

  class FileReaderMock {
    constructor() { this.listeners = {}; this.result = ""; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    readAsDataURL(file) {
      this.result = file.dataUrl || `data:${file.type};base64,ZmFrZQ==`;
      queueMicrotask(() => this.listeners.load?.());
    }
  }

  class XMLHttpRequestMock {
    constructor() {
      this.listeners = {};
      this.uploadListeners = {};
      this.upload = { addEventListener: (type, listener) => { this.uploadListeners[type] = listener; } };
      this.headers = {};
      this.status = 0;
      this.response = null;
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    send(body) {
      const payload = JSON.parse(body);
      writes.requests.push({ method: this.method, url: this.url, headers: this.headers, payload });
      queueMicrotask(() => {
        this.uploadListeners.progress?.({ lengthComputable: true, loaded: body.length, total: body.length });
        this.status = 200;
        if (this.url.endsWith("evidence-upload")) {
          this.status = 201;
          const pdf = payload.contentType === "application/pdf";
          this.response = {
            evidence: {
              provider: "cloudinary",
              complaintId: payload.complaintId,
              assetId: `asset-${payload.slot}`,
              publicId: `civicresolve/complaint-evidence/${payload.complaintId}/citizen-1/evidence-${payload.slot}${pdf ? ".pdf" : ""}`,
              resourceType: pdf ? "raw" : "image",
              deliveryType: "authenticated",
              format: pdf ? "pdf" : "jpg",
              originalName: payload.fileName,
              contentType: payload.contentType,
              size: payload.size,
              uploadedByUid: "citizen-1"
            }
          };
        } else if (this.url.endsWith("evidence-access")) {
          this.response = { url: "https://api.cloudinary.example/private-download" };
        } else {
          this.response = { removed: true };
        }
        this.listeners.load?.();
      });
    }
  }

  const document = {
    body: { appendChild: () => {} },
    createElement: () => ({
      click() { writes.opened.push(this.href); },
      remove() {}
    })
  };
  const window = {
    CivicAuth: {
      getProfile: () => profile,
      getUser: () => ({ getIdToken: async () => "firebase-id-token" }),
      getFirebaseServices: () => ({ sdk })
    },
    CivicEvidence: null
  };
  const context = vm.createContext({
    window,
    document,
    FileReader: FileReaderMock,
    XMLHttpRequest: XMLHttpRequestMock,
    console,
    Date,
    Math,
    Promise,
    Object,
    String,
    Number,
    Array,
    Error,
    queueMicrotask
  });
  vm.runInContext(source, context, { filename: "evidence-upload.js" });
  return { service: window.CivicEvidence, writes };
}

async function run() {
  const { service, writes } = createHarness();
  const image = { name: "damaged-road.jpg", type: "image/jpeg", size: 2 * 1024 * 1024 };
  const pdf = { name: "ward-letter.pdf", type: "application/pdf", size: 50 * 1024 };

  assert.equal(service.validateFiles([image, pdf]).length, 2);
  assert.throws(() => service.validateFiles([image, pdf], 2), /maximum of 3/);
  assert.throws(() => service.validateFiles([{ name: "video.mp4", type: "video/mp4", size: 10 }]), /not supported/);
  assert.throws(() => service.validateFiles([{ name: "huge.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 }]), /larger than 5 MB/);

  const progress = [];
  const uploaded = await service.upload("GRV-2026-ABC", [image, pdf], 0, percent => progress.push(percent));
  assert.equal(uploaded.length, 2);
  assert.equal(uploaded[0].uploadedByUid, "citizen-1");
  assert.equal(uploaded[0].provider, "cloudinary");
  assert.match(uploaded[0].publicId, /evidence-1$/);
  assert.match(uploaded[1].publicId, /evidence-2\.pdf$/);
  assert.deepEqual(uploaded[0].uploadedAt, { timestamp: true });
  assert.equal(writes.requests[0].headers.Authorization, "Bearer firebase-id-token");
  assert.equal(progress.at(-1), 100);

  await service.open(uploaded[0]);
  assert.equal(writes.opened[0], "https://api.cloudinary.example/private-download");

  await service.removeMany(uploaded);
  assert.equal(writes.requests.filter(item => item.url.endsWith("evidence-delete")).length, 2);
  console.log("Evidence upload service tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

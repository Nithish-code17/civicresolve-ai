(() => {
  "use strict";

  const MAX_FILES = 3;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = Object.freeze({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  });

  class EvidenceError extends Error {
    constructor(message, code = "evidence/invalid-file") {
      super(message);
      this.name = "EvidenceError";
      this.code = code;
    }
  }

  function profile() {
    return window.CivicAuth?.getProfile() || null;
  }

  function timestamp() {
    const services = window.CivicAuth?.getFirebaseServices();
    if (!services?.sdk?.Timestamp) {
      throw new EvidenceError("Evidence timestamps are not available for this session.", "evidence/unavailable");
    }
    return services.sdk.Timestamp.now();
  }

  async function authToken() {
    const user = window.CivicAuth?.getUser();
    if (!user || typeof user.getIdToken !== "function") {
      throw new EvidenceError("Sign in with Firebase before accessing complaint evidence.", "evidence/unauthenticated");
    }
    try {
      return await user.getIdToken();
    } catch {
      throw new EvidenceError("Your sign-in session expired. Sign in again.", "evidence/unauthenticated");
    }
  }

  function validateFiles(fileList, existingCount = 0) {
    const files = Array.from(fileList || []);
    if (!files.length) throw new EvidenceError("Choose at least one evidence file.", "evidence/no-files");
    if (existingCount + files.length > MAX_FILES) {
      throw new EvidenceError(`A complaint can contain a maximum of ${MAX_FILES} evidence files.`, "evidence/too-many-files");
    }

    files.forEach(file => {
      if (!ALLOWED_TYPES[file.type]) {
        throw new EvidenceError(`${file.name || "This file"} is not supported. Use JPG, PNG, WebP, or PDF.`, "evidence/unsupported-type");
      }
      if (!Number.isFinite(file.size) || file.size <= 0) {
        throw new EvidenceError(`${file.name || "This file"} is empty.`, "evidence/empty-file");
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new EvidenceError(`${file.name || "This file"} is larger than 5 MB.`, "evidence/file-too-large");
      }
    });
    return files;
  }

  function safeOriginalName(name = "evidence") {
    return String(name).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150) || "evidence";
  }

  function fileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(new EvidenceError(`Could not read ${file.name || "this file"}.`, "evidence/file-read-failed")), { once: true });
      reader.readAsDataURL(file);
    });
  }

  async function apiRequest(path, payload, onProgress = () => {}) {
    const token = await authToken();
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", path);
      request.responseType = "json";
      request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.setRequestHeader("Content-Type", "application/json");
      request.upload.addEventListener("progress", event => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      });
      request.addEventListener("load", () => {
        const body = request.response || {};
        if (request.status >= 200 && request.status < 300) {
          resolve(body);
          return;
        }
        reject(new EvidenceError(
          body.error?.message || "The evidence service could not complete the request.",
          body.error?.code || "evidence/request-failed"
        ));
      });
      request.addEventListener("error", () => reject(new EvidenceError(
        "The evidence service could not be reached. Check your connection and try again.",
        "evidence/network-error"
      )));
      request.send(JSON.stringify(payload));
    });
  }

  async function uploadOne(complaintId, file, slot, onProgress = () => {}) {
    const current = profile();
    if (!current || current.role !== "citizen") {
      throw new EvidenceError("Only the complaint owner can upload citizen evidence.", "evidence/unauthorized");
    }
    const data = await fileDataUrl(file);
    const result = await apiRequest("/api/evidence-upload", {
      complaintId,
      slot,
      fileName: safeOriginalName(file.name),
      contentType: file.type,
      size: file.size,
      data
    }, onProgress);
    const evidence = result.evidence;
    if (!evidence?.assetId || evidence.provider !== "cloudinary") {
      throw new EvidenceError("The evidence provider returned an invalid response.", "evidence/provider-response-invalid");
    }
    return {
      ...evidence,
      uploadedAt: timestamp()
    };
  }

  async function upload(complaintId, fileList, existingCount = 0, onProgress = () => {}) {
    const files = validateFiles(fileList, existingCount);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    const uploaded = [];

    try {
      for (const [index, file] of files.entries()) {
        const evidence = await uploadOne(complaintId, file, existingCount + index + 1, (transferred, requestTotal) => {
          const ratio = requestTotal ? Math.min(1, transferred / requestTotal) : 0;
          onProgress(Math.round((completedBytes + file.size * ratio) / totalBytes * 100));
        });
        uploaded.push(evidence);
        completedBytes += file.size;
        onProgress(Math.round(completedBytes / totalBytes * 100));
      }
      return uploaded;
    } catch (error) {
      if (uploaded.length) {
        try {
          await removeMany(uploaded);
        } catch (cleanupError) {
          console.warn("Partially uploaded evidence could not be cleaned up.", cleanupError);
        }
      }
      throw error;
    }
  }

  async function removeMany(evidenceItems = []) {
    for (const evidence of evidenceItems) {
      if (evidence?.provider !== "cloudinary" || !evidence?.complaintId || !evidence?.publicId) continue;
      try {
        await apiRequest("/api/evidence-delete", {
          complaintId: evidence.complaintId,
          assetId: evidence.assetId,
          publicId: evidence.publicId
        });
      } catch (error) {
        if (error?.code !== "evidence/object-not-found") throw error;
      }
    }
  }

  async function open(evidence) {
    if (evidence?.provider !== "cloudinary" || !evidence?.complaintId || !evidence?.publicId) {
      throw new EvidenceError("This evidence file is unavailable.", "evidence/object-not-found");
    }
    const result = await apiRequest("/api/evidence-access", {
      complaintId: evidence.complaintId,
      assetId: evidence.assetId,
      publicId: evidence.publicId
    });
    if (!result.url) throw new EvidenceError("This evidence file is unavailable.", "evidence/object-not-found");
    const link = document.createElement("a");
    link.href = result.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = safeOriginalName(evidence.originalName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    return result.url;
  }

  window.CivicEvidence = Object.freeze({
    MAX_FILES,
    MAX_FILE_SIZE,
    ALLOWED_TYPES,
    validateFiles,
    upload,
    removeMany,
    open,
    isImage: evidence => String(evidence?.contentType || "").startsWith("image/")
  });
})();

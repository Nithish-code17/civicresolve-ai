(() => {
  "use strict";

  const DEFAULT_CENTER = [11.0168, 76.9558];
  const DEFAULT_ZOOM = 12;
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
  const GEOCODE_INTERVAL_MS = 1100;
  const PRIORITY_COLOURS = Object.freeze({ High: "#c3343d", Medium: "#d17a00", Low: "#15805d" });
  const STATUS_COLOURS = Object.freeze({
    Submitted: "#667085",
    "Under Review": "#6941c6",
    Assigned: "#a96608",
    "In Progress": "#1664d9",
    Resolved: "#15805d"
  });

  let pickerContext = null;
  let operationsContext = null;
  let geocodeQueue = Promise.resolve();
  let lastGeocodeAt = 0;
  const geocodeCache = new Map();

  function numberInRange(value, minimum, maximum) {
    const number = Number(value);
    return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
  }

  function cleanText(value, maximum = 500) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normaliseLocation(value) {
    if (!value || typeof value !== "object") return null;
    const latitude = numberInRange(value.latitude, -90, 90);
    const longitude = numberInRange(value.longitude, -180, 180);
    const address = cleanText(value.address, 500);
    if (latitude === null || longitude === null || address.length < 3) return null;
    const source = ["map-pin", "device", "address-search"].includes(value.source)
      ? value.source
      : "map-pin";
    const rawAccuracy = value.accuracyMeters;
    const accuracyMeters = rawAccuracy === null || rawAccuracy === undefined || rawAccuracy === ""
      ? null
      : numberInRange(rawAccuracy, 0, 100000);
    return {
      latitude: Number(latitude.toFixed(7)),
      longitude: Number(longitude.toFixed(7)),
      address,
      ward: cleanText(value.ward, 120),
      source,
      accuracyMeters
    };
  }

  function wardFromAddress(address = {}) {
    return cleanText(
      address.city_district
      || address.suburb
      || address.neighbourhood
      || address.quarter
      || address.village
      || address.town
      || address.city
      || address.municipality
      || address.state_district,
      120
    );
  }

  function locationFromGeocode(result, source, accuracyMeters = null) {
    return normaliseLocation({
      latitude: result?.lat,
      longitude: result?.lon,
      address: result?.display_name,
      ward: wardFromAddress(result?.address),
      source,
      accuracyMeters
    });
  }

  function priorityColour(priority) {
    return PRIORITY_COLOURS[priority] || PRIORITY_COLOURS.Medium;
  }

  function statusColour(status) {
    return STATUS_COLOURS[status] || STATUS_COLOURS.Submitted;
  }

  function markerColour(item, mode = "priority") {
    return mode === "status" ? statusColour(item?.status) : priorityColour(item?.priority);
  }

  function aggregateComplaints(items = []) {
    const groups = new Map();
    items.forEach(item => {
      const location = normaliseLocation(item?.locationData);
      if (!location) return;
      const key = `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`;
      const group = groups.get(key) || { latitudeTotal: 0, longitudeTotal: 0, items: [] };
      group.latitudeTotal += location.latitude;
      group.longitudeTotal += location.longitude;
      group.items.push({ ...item, locationData: location });
      groups.set(key, group);
    });
    return [...groups.values()].map(group => ({
      latitude: group.latitudeTotal / group.items.length,
      longitude: group.longitudeTotal / group.items.length,
      items: group.items
    }));
  }

  function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function throttledJson(url) {
    const cached = geocodeCache.get(url);
    if (cached) return Promise.resolve(cached);
    geocodeQueue = geocodeQueue.catch(() => undefined).then(async () => {
      const remaining = GEOCODE_INTERVAL_MS - (Date.now() - lastGeocodeAt);
      if (remaining > 0) await wait(remaining);
      lastGeocodeAt = Date.now();
      const response = await fetch(url, {
        headers: { "Accept-Language": "en-IN,en;q=0.8" },
        credentials: "omit"
      });
      if (!response.ok) throw new Error("The address service is temporarily unavailable.");
      const payload = await response.json();
      geocodeCache.set(url, payload);
      return payload;
    });
    return geocodeQueue;
  }

  function searchAddress(query) {
    const text = cleanText(query, 160);
    if (text.length < 3) return Promise.reject(new Error("Enter at least 3 characters to search for an address."));
    const parameters = new URLSearchParams({
      q: text,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "in",
      limit: "5"
    });
    return throttledJson(`${NOMINATIM_URL}/search?${parameters}`);
  }

  function reverseGeocode(latitude, longitude) {
    const parameters = new URLSearchParams({
      lat: Number(latitude).toFixed(7),
      lon: Number(longitude).toFixed(7),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18"
    });
    return throttledJson(`${NOMINATIM_URL}/reverse?${parameters}`);
  }

  function tileLayer() {
    return window.L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    });
  }

  function pinIcon(colour = "#1664d9", count = 1) {
    const label = count > 1 ? String(count) : "";
    return window.L.divIcon({
      className: "civic-map-icon",
      html: `<span class="civic-map-marker" style="--marker-colour:${colour}"><span>${escapeHtml(label)}</span></span>`,
      iconSize: count > 1 ? [38, 44] : [30, 36],
      iconAnchor: count > 1 ? [19, 42] : [15, 34],
      popupAnchor: [0, -36]
    });
  }

  function setPickerStatus(message, tone = "") {
    const root = document.getElementById("locationMapStatus");
    if (!root) return;
    root.textContent = message;
    root.dataset.tone = tone;
  }

  function updatePickerFields(location) {
    const values = {
      location: location?.address || "",
      locationLatitude: location?.latitude ?? "",
      locationLongitude: location?.longitude ?? "",
      locationWard: location?.ward || "",
      locationSource: location?.source || "",
      locationAccuracy: location?.accuracyMeters ?? ""
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value;
    });
    const clearButton = document.getElementById("clearMapLocation");
    if (clearButton) clearButton.hidden = !location;
    const ward = document.getElementById("selectedWard");
    if (ward) {
      ward.textContent = location?.ward ? `Area / ward: ${location.ward}` : "Area / ward will be detected where available.";
      ward.hidden = !location;
    }
  }

  function clearPickerLocation() {
    if (!pickerContext) return;
    pickerContext.location = null;
    if (pickerContext.marker) {
      pickerContext.map.removeLayer(pickerContext.marker);
      pickerContext.marker = null;
    }
    updatePickerFields(null);
    setPickerStatus("Search, use your current location, or click the map to place a pin.");
    pickerContext.onChange?.(null);
  }

  function selectPickerLocation(value, { centre = true } = {}) {
    const location = normaliseLocation(value);
    if (!pickerContext || !location) return null;
    pickerContext.location = location;
    if (!pickerContext.marker) {
      pickerContext.marker = window.L.marker([location.latitude, location.longitude], {
        icon: pinIcon("#1664d9"),
        keyboard: true,
        draggable: true,
        title: "Selected complaint location"
      }).addTo(pickerContext.map);
      pickerContext.marker.on("dragend", event => {
        const point = event.target.getLatLng();
        selectCoordinates(point.lat, point.lng, "map-pin");
      });
    } else {
      pickerContext.marker.setLatLng([location.latitude, location.longitude]);
    }
    if (centre) pickerContext.map.setView([location.latitude, location.longitude], Math.max(pickerContext.map.getZoom(), 16));
    updatePickerFields(location);
    setPickerStatus(`Location selected at ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}.`, "ready");
    pickerContext.onChange?.(location);
    return location;
  }

  async function selectCoordinates(latitude, longitude, source, accuracyMeters = null) {
    setPickerStatus("Finding the closest mapped address…", "loading");
    try {
      const result = await reverseGeocode(latitude, longitude);
      const location = locationFromGeocode(result, source, accuracyMeters);
      if (!location) throw new Error("No mapped address was found for this point.");
      return selectPickerLocation(location);
    } catch (error) {
      const location = selectPickerLocation({
        latitude,
        longitude,
        address: `Pinned location (${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)})`,
        ward: "",
        source,
        accuracyMeters
      });
      setPickerStatus(`${error.message} The coordinates are still selected.`, "warning");
      return location;
    }
  }

  function renderSearchResults(results = []) {
    const root = document.getElementById("locationSearchResults");
    if (!root) return;
    if (!results.length) {
      root.innerHTML = '<div class="map-search-empty">No matching Indian address was found. Try a landmark, street, or area name.</div>';
      root.hidden = false;
      return;
    }
    root.innerHTML = results.map((result, index) => `<button type="button" data-map-result="${index}"><strong>${escapeHtml(cleanText(result.display_name, 500))}</strong><span>${escapeHtml(wardFromAddress(result.address) || "Select this mapped place")}</span></button>`).join("");
    root.hidden = false;
  }

  function initComplaintPicker({ mapId = "complaintLocationMap", onChange } = {}) {
    destroyPicker();
    const root = document.getElementById(mapId);
    if (!root || !window.L) {
      if (root) root.innerHTML = '<div class="map-unavailable">The interactive map could not load. Refresh the page and try again.</div>';
      return null;
    }

    const map = window.L.map(root, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    tileLayer().addTo(map);
    pickerContext = { map, marker: null, location: null, onChange, searchResults: [] };
    map.on("click", event => selectCoordinates(event.latlng.lat, event.latlng.lng, "map-pin"));

    const searchForm = document.getElementById("locationSearchForm");
    const searchInput = document.getElementById("locationSearchInput");
    const resultsRoot = document.getElementById("locationSearchResults");
    searchForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const button = searchForm.querySelector("button[type='submit']");
      const original = button?.textContent;
      if (button) { button.disabled = true; button.textContent = "Searching…"; }
      setPickerStatus("Searching mapped addresses…", "loading");
      try {
        const results = await searchAddress(searchInput?.value || "");
        if (!pickerContext) return;
        pickerContext.searchResults = results;
        renderSearchResults(results);
        setPickerStatus(results.length ? "Choose the correct result, then adjust the pin if needed." : "No matching address was found.", results.length ? "ready" : "warning");
      } catch (error) {
        setPickerStatus(error.message, "warning");
      } finally {
        if (button) { button.disabled = false; button.textContent = original; }
      }
    });
    resultsRoot?.addEventListener("click", event => {
      const button = event.target.closest("[data-map-result]");
      const result = pickerContext?.searchResults?.[Number(button?.dataset.mapResult)];
      if (!result) return;
      const location = locationFromGeocode(result, "address-search");
      if (location) selectPickerLocation(location);
      resultsRoot.hidden = true;
    });

    document.getElementById("useCurrentLocation")?.addEventListener("click", event => {
      const button = event.currentTarget;
      if (!navigator.geolocation) {
        setPickerStatus("Current-location detection is not supported by this browser.", "warning");
        return;
      }
      button.disabled = true;
      setPickerStatus("Requesting your device location…", "loading");
      navigator.geolocation.getCurrentPosition(async position => {
        await selectCoordinates(position.coords.latitude, position.coords.longitude, "device", position.coords.accuracy);
        button.disabled = false;
      }, error => {
        const message = error.code === 1
          ? "Location permission was denied. Search or place the pin manually."
          : "Your current location could not be detected. Search or place the pin manually.";
        setPickerStatus(message, "warning");
        button.disabled = false;
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
    document.getElementById("clearMapLocation")?.addEventListener("click", clearPickerLocation);
    updatePickerFields(null);
    setPickerStatus("Search, use your current location, or click the map to place a pin.");
    setTimeout(() => map.invalidateSize(), 0);
    return map;
  }

  function readFormLocation() {
    return normaliseLocation({
      latitude: document.getElementById("locationLatitude")?.value,
      longitude: document.getElementById("locationLongitude")?.value,
      address: document.getElementById("location")?.value,
      ward: document.getElementById("locationWard")?.value,
      source: document.getElementById("locationSource")?.value,
      accuracyMeters: document.getElementById("locationAccuracy")?.value
    });
  }

  function popupMarkup(group, colourMode) {
    const primary = group.items[0];
    const heading = group.items.length > 1 ? `${group.items.length} nearby complaints` : primary.title;
    return `<div class="map-popup-card">
      <div class="map-popup-heading"><span style="--popup-colour:${markerColour(primary, colourMode)}"></span><strong>${escapeHtml(heading)}</strong></div>
      ${group.items.slice(0, 8).map(item => `<button type="button" data-map-complaint="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.id)}</strong>${escapeHtml(item.title)}</span><small>${escapeHtml(item.priority)} · ${escapeHtml(item.status)}</small></button>`).join("")}
      ${group.items.length > 8 ? `<p>+${group.items.length - 8} more complaints at this location</p>` : ""}
    </div>`;
  }

  function updateOperationsSummary(visible, missing) {
    const visibleRoot = document.getElementById("mapVisibleCount");
    const missingRoot = document.getElementById("mapMissingCount");
    const emptyRoot = document.getElementById("complaintMapEmpty");
    if (visibleRoot) visibleRoot.textContent = String(visible);
    if (missingRoot) missingRoot.textContent = String(missing);
    if (emptyRoot) emptyRoot.hidden = visible > 0;
  }

  function updateOperationsMap(items = [], { colourMode = "priority", fit = true } = {}) {
    if (!operationsContext) return;
    operationsContext.layer.clearLayers();
    const geotagged = items.filter(item => normaliseLocation(item?.locationData));
    updateOperationsSummary(geotagged.length, items.length - geotagged.length);
    const groups = aggregateComplaints(geotagged);
    const points = [];
    groups.forEach(group => {
      const highestPriority = [...group.items].sort((a, b) => ["High", "Medium", "Low"].indexOf(a.priority) - ["High", "Medium", "Low"].indexOf(b.priority))[0];
      const representative = colourMode === "status" ? group.items[0] : highestPriority;
      const marker = window.L.marker([group.latitude, group.longitude], {
        icon: pinIcon(markerColour(representative, colourMode), group.items.length),
        keyboard: true,
        title: group.items.length > 1 ? `${group.items.length} complaints` : group.items[0].title
      }).bindPopup(popupMarkup(group, colourMode), { maxWidth: 330 });
      marker.addTo(operationsContext.layer);
      points.push([group.latitude, group.longitude]);
    });
    if (!fit || !points.length) return;
    if (points.length === 1) operationsContext.map.setView(points[0], 16);
    else operationsContext.map.fitBounds(points, { padding: [36, 36], maxZoom: 16 });
  }

  function initOperationsMap(items = [], { mapId = "complaintOperationsMap", colourMode = "priority", onSelect } = {}) {
    destroyOperations();
    const root = document.getElementById(mapId);
    if (!root || !window.L) {
      if (root) root.innerHTML = '<div class="map-unavailable">The operational map could not load. Complaint records remain available in the table.</div>';
      updateOperationsSummary(0, items.length);
      return null;
    }
    const map = window.L.map(root, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    tileLayer().addTo(map);
    const layer = window.L.layerGroup().addTo(map);
    const clickHandler = event => {
      const button = event.target.closest("[data-map-complaint]");
      if (button) onSelect?.(button.dataset.mapComplaint);
    };
    root.addEventListener("click", clickHandler);
    operationsContext = { map, layer, root, clickHandler, onSelect };
    updateOperationsMap(items, { colourMode, fit: true });
    setTimeout(() => map.invalidateSize(), 0);
    return map;
  }

  function destroyPicker() {
    if (!pickerContext) return;
    pickerContext.map.remove();
    pickerContext = null;
  }

  function destroyOperations() {
    if (!operationsContext) return;
    operationsContext.root.removeEventListener("click", operationsContext.clickHandler);
    operationsContext.map.remove();
    operationsContext = null;
  }

  function destroyAll() {
    destroyPicker();
    destroyOperations();
  }

  window.CivicMaps = Object.freeze({
    DEFAULT_CENTER: Object.freeze([...DEFAULT_CENTER]),
    aggregateComplaints,
    destroyAll,
    initComplaintPicker,
    initOperationsMap,
    markerColour,
    normaliseLocation,
    readFormLocation,
    searchAddress,
    updateOperationsMap
  });
})();

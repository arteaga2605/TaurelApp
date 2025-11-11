// ----------------------------------------------------------
// Portal Taurel – 100 % compatible con Capacitor (SIN import)
// ----------------------------------------------------------

const BASE_URL = "https://taurel.cargologik.app/api/v2";
let token = "";
let allShipments = [];

/* =========  1.  Inicialización Capacitor  ========= */
window.addEventListener('DOMContentLoaded', () => {
  const splash = window.Capacitor.Plugins.SplashScreen;
  const status = window.Capacitor.Plugins.StatusBar;

  if (splash) splash.hide();
  if (status) {
    status.setBackgroundColor({ color: '#00529b' });
    status.setStyle({ style: 'LIGHT' });
  }

  login(); // LOGIN AUTOMÁTICO
});

/* =========  2.  Login  ========= */
async function login() {
  try {
    const res = await fetch(`${BASE_URL}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "integration@taurel.com",
        password: "QGd0EX59of3aVP3M"
      })
    });
    const data = await res.json();
    if (res.ok && data.data?.token) {
      token = data.data.token;
      window.token = token;
      document.getElementById("output").innerHTML = "✅ Login exitoso. Cargando shipments…";
      await loadAllShipments();
      await autoMapa();
    } else {
      document.getElementById("output").textContent = "❌ Error en login: " + JSON.stringify(data, null, 2);
    }
  } catch (err) {
    document.getElementById("output").textContent = "❌ Error de red al hacer login: " + err.message;
  }
}

/* =========  3.  Cargar shipments  ========= */
async function loadAllShipments() {
  // 🔒 BLOQUEAR entrada mientras carga
  document.getElementById("searchInput").disabled = true;
  document.querySelector(".btn-primary").disabled = true;

  // Crear overlay con loader centrado
  const overlay = document.createElement('div');
  overlay.className = 'overlay-loader';
  overlay.innerHTML = `
    <div class="loader-box">
      <div class="spinner"></div>
      <p>Cargando shipments…</p>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    const res = await fetch(`${BASE_URL}/shipments`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: 300,
        page: 1,
        filter: {},
        fields: [
          "shipmentId", "mbl", "hbl", "referenceName", "currentStatus",
          "etd", "eta", "carrier", "lastKnownLocation", "containersNumber",
          "events", "cargoDescription", "totalWeight",
          "totalWeightUnit", "totalVolume", "totalVolumeUnit", "freightType"
        ]
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`);
    const data = await res.json();
    allShipments = data.data || [];

    // Quitar overlay y mensaje de éxito
    overlay.remove();
    document.getElementById("output").innerHTML = `✅ Cargados ${allShipments.length} shipments. Ya puedes buscar.`;
  } catch (err) {
    // Quitar overlay y mostrar error
    overlay.remove();
    document.getElementById("output").innerHTML = "❌ Error al cargar shipments: " + err.message;
  } finally {
    // 🔓 DESBLOQUEAR entrada al terminar (éxito o error)
    document.getElementById("searchInput").disabled = false;
    document.querySelector(".btn-primary").disabled = false;
  }
}

/* =========  4.  Búsqueda  ========= */
function searchAny() {
  const q = document.getElementById("searchInput").value.trim().toUpperCase();
  if (!q) { alert("Escribe algo para buscar."); return; }
  if (!allShipments.length) { alert("Aún no se han cargado los shipments."); return; }

  const found = allShipments.find(s =>
    (s.shipmentId || "").toUpperCase() === q ||
    (s.mbl || "").toUpperCase() === q ||
    (s.hbl || "").toUpperCase() === q ||
    (s.referenceName || "").toUpperCase() === q
  );

  if (!found) {
    document.getElementById("output").innerHTML = "<div class='section-title'>❌ No encontrado</div>";
    return;
  }

  window.found = found;

  const html = `
    <div class="card">
      <div class="card-title">📦 Información General</div>
      <div><strong>Shipment ID:</strong> ${found.shipmentId || "N/A"}</div>
      <div><strong>MBL:</strong> ${found.mbl || "N/A"}</div>
      <div><strong>HBL:</strong> ${found.hbl || "N/A"}</div>
      <div><strong>Referencia:</strong> ${found.referenceName || "N/A"}</div>
      <div><strong>Carrier:</strong> ${found.carrier?.name || "N/A"}</div>
      <div><strong>Estado:</strong> <span class="${(found.currentStatus || "").includes("Delay") ? "status-delay" : "status-ok"}">${found.currentStatus || "N/A"}</span></div>
      <div><strong>ETD Original:</strong> ${found.etd ? new Date(found.etd).toLocaleDateString("es-ES") : "N/A"}</div>
      <div><strong>ETA Actual:</strong> ${found.eta ? new Date(found.eta).toLocaleDateString("es-ES") : "N/A"}</div>
    </div>

    <div class="card">
      <div class="card-title">🧊 Equipos</div>
      ${(found.containersNumber || []).length
        ? found.containersNumber.map(c => `<div>• ${c}</div>`).join("")
        : "<div>No hay contenedores registrados.</div>"}
    </div>

    <div class="card">
      <div class="card-title">📅 Eventos Recientes</div>
      ${(found.events || []).length
        ? found.events.slice(-5).map(e => `<div>• ${e.title || e.description || "Evento"} – ${new Date(e.date).toLocaleString("es-ES")}</div>`).join("")
        : "<div>Sin eventos.</div>"}
    </div>

    <div class="card">
      <div class="card-title">📏 Carga</div>
      <div><strong>Descripción:</strong> ${found.cargoDescription || "N/A"}</div>
      <div><strong>Peso Total:</strong> ${found.totalWeight || "N/A"} ${found.totalWeightUnit || ""}</div>
      <div><strong>Volumen Total:</strong> ${found.totalVolume || "N/A"} ${found.totalVolumeUnit || ""}</div>
    </div>
  `;

  document.getElementById("output").innerHTML = html;
  drawMap(found.origin, found.destination, found.events || []);
}

/* =========  5.  Mapa automático  ========= */
let map;

async function autoMapa() {
  const token = window.token;
  if (!token || !allShipments.length) return;

  let candidato = null;
  let origen = null;
  let destino = null;

  for (const s of allShipments) {
    if (!s.events || !s.events.length) continue;
    const conCoords = s.events.filter(e => e.coordinates && e.coordinates.lat != null && e.coordinates.lon != null);
    if (conCoords.length < 2) continue;

    candidato = s;
    origen  = conCoords[0];
    destino = conCoords[conCoords.length - 1];
    break;
  }

  if (!candidato) {
    console.warn("No se encontró shipment con al menos 2 eventos que tengan coordinates");
    return;
  }

  const vesselName = candidato.carrier?.name || origen.vessel || "Buque";
  const imo = await buscarIMO(vesselName);
  if (!imo) {
    console.warn("No se pudo obtener IMO para", vesselName);
    return;
  }

  try {
    const p = await fetch(`${BASE_URL}/vessels/${imo}/positions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!p.ok) throw new Error("No se pudo obtener AIS");
    const ais = await p.json();

    const mapDiv = document.getElementById("map");
    mapDiv.style.height = "500px";
    mapDiv.innerHTML = "";
    if (map) map.remove();
    map = L.map("map").setView([ais.lat, ais.lon], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OSM"
    }).addTo(map);

    const greenIcon = new L.Icon({ iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png", shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
    const redIcon   = new L.Icon({ iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",   shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
    const shipIcon  = L.divIcon({ html: "🚢", iconSize: [20, 20], iconAnchor: [10, 10] });

    L.marker([origen.coordinates.lat, origen.coordinates.lon], { icon: greenIcon }).addTo(map).bindPopup(`Origen<br><b>${origen.location || "Puerto"}</b>`);
    L.marker([destino.coordinates.lat, destino.coordinates.lon], { icon: redIcon   }).addTo(map).bindPopup(`Destino<br><b>${destino.location || "Puerto"}</b>`);
    L.marker([ais.lat, ais.lon], { icon: shipIcon  }).addTo(map).bindPopup(`<b>${vesselName}</b><br>Última vez: ${new Date(ais.timestamp).toLocaleString("es-ES")}`);

    const poly = L.polyline([
      [origen.coordinates.lat, origen.coordinates.lon],
      [ais.lat, ais.lon],
      [destino.coordinates.lat, destino.coordinates.lon]
    ], { color: "#00529b", weight: 4 }).addTo(map);
    map.fitBounds(poly.getBounds().pad(0.1));

  } catch (e) {
    console.error("Auto-mapa falló:", e);
  }
}

/* =========  6.  Buscar IMO por nombre de buque  ========= */
async function buscarIMO(nombre) {
  try {
    const res = await fetch(`${BASE_URL}/vessels/search?name=${encodeURIComponent(nombre)}&limit=1`, {
      headers: { Authorization: `Bearer ${window.token}` }
    });
    if (!res.ok) return null;
    const list = await res.json();
    return list.length ? list[0].imo : null;
  } catch (e) {
    return null;
  }
}

/* =========  7.  Botón manual (opcional)  ========= */
async function verMapaTiempoReal() {
  const token = window.token;
  if (!window.found) { alert("Primero busca un shipment."); return; }
  const candidato = window.found;

  if (!candidato.events || !candidato.events.length) { alert("Sin eventos"); return; }
  const conCoords = candidato.events.filter(e => e.coordinates && e.coordinates.lat != null && e.coordinates.lon != null);
  if (conCoords.length < 2) { alert("Se necesitan al menos 2 eventos con coordenadas"); return; }

  const orig  = conCoords[0];
  const dest  = conCoords[conCoords.length - 1];
  const vesselName = candidato.carrier?.name || orig.vessel || "Buque";

  const imo = await buscarIMO(vesselName);
  if (!imo) { alert("No se pudo obtener IMO"); return; }

  try {
    const p = await fetch(`${BASE_URL}/vessels/${imo}/positions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!p.ok) throw new Error("No se pudo obtener AIS");
    const ais = await p.json();

    const mapDiv = document.getElementById("map");
    mapDiv.style.height = "500px";
    mapDiv.innerHTML = "";
    if (map) map.remove();
    map = L.map("map").setView([ais.lat, ais.lon], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OSM"
    }).addTo(map);

    const greenIcon = new L.Icon({ iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png", shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
    const redIcon   = new L.Icon({ iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",   shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
    const shipIcon  = L.divIcon({ html: "🚢", iconSize: [20, 20], iconAnchor: [10, 10] });

    L.marker([orig.coordinates.lat, orig.coordinates.lon], { icon: greenIcon }).addTo(map).bindPopup(`Origen<br><b>${orig.location || "Puerto"}</b>`);
    L.marker([dest.coordinates.lat, dest.coordinates.lon], { icon: redIcon   }).addTo(map).bindPopup(`Destino<br><b>${dest.location || "Puerto"}</b>`);
    L.marker([ais.lat, ais.lon], { icon: shipIcon  }).addTo(map).bindPopup(`<b>${vesselName}</b><br>Última vez: ${new Date(ais.timestamp).toLocaleString("es-ES")}`);

    const poly = L.polyline([
      [orig.coordinates.lat, orig.coordinates.lon],
      [ais.lat, ais.lon],
      [dest.coordinates.lat, dest.coordinates.lon]
    ], { color: "#00529b", weight: 4 }).addTo(map);
    map.fitBounds(poly.getBounds().pad(0.1));

  } catch (e) {
    alert("No se pudo cargar el mapa: " + e.message);
  }
}

function drawMap(origin, destination, events = []) {
  const mapDiv = document.getElementById('map');
  mapDiv.style.height = '500px';
  mapDiv.style.margin = '20px';

  setTimeout(() => {
    const map = L.map('map').setView([0, 0], 2); // centro neutro mientras cargamos

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    /* ---------- ICONOS REALES ---------- */
    const greenIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34]
    });

    const redIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34]
    });

    const shipIcon = L.divIcon({
      html: '🚢',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      className: 'ship-icon'
    });

    /* ---------- PUNTOS SIEMPRE VISIBLES ---------- */
    let points = [];

    // 1. Origen siempre
    if (origin && origin.lat != null && origin.lng != null) {
      L.marker([parseFloat(origin.lat), parseFloat(origin.lng)], { icon: greenIcon })
        .addTo(map)
        .bindPopup('Origen');
      points.push([parseFloat(origin.lat), parseFloat(origin.lng)]);
    }

    // 2. Cada evento que tenga coordenadas
    events.forEach(e => {
      if (e.location && e.location.lat != null && e.location.lng != null) {
        L.marker([parseFloat(e.location.lat), parseFloat(e.location.lng)])
          .addTo(map)
          .bindPopup(e.location.country || 'Parada');
        points.push([parseFloat(e.location.lat), parseFloat(e.location.lng)]);
      }
    });

    // 3. Destino siempre
    if (destination && destination.lat != null && destination.lng != null) {
      L.marker([parseFloat(destination.lat), parseFloat(destination.lng)], { icon: redIcon })
        .addTo(map)
        .bindPopup('Destino');
      points.push([parseFloat(destination.lat), parseFloat(destination.lng)]);
    }

    // 4. Barco (último evento con coordenadas)
    const lastEvent = events.filter(e => e.location && e.location.lat != null && e.location.lng != null).pop();
    if (lastEvent) {
      L.marker([parseFloat(lastEvent.location.lat), parseFloat(lastEvent.location.lng)], { icon: shipIcon })
        .addTo(map)
        .bindPopup('Ubicación actual del barco');
    }

    // 5. Línea punteada entre puntos
    if (points.length > 1) {
      const polyline = L.polyline(points, {
        color: 'blue',
        weight: 5,
        opacity: 0.7,
        dashArray: '10, 5',
        lineCap: 'butt',
        lineJoin: 'miter'
      }).addTo(map);
      map.fitBounds(polyline.getBounds());
    }

    setTimeout(() => map.invalidateSize(), 100);
  }, 150);
}
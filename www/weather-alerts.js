// weather-alerts.js
const WEATHER_KEY = 'tu-key-openweather'; // gratis
const CHECK_MS    = 30 * 60 * 1000; // 30 min

async function checkWeatherAlert() {
  const token = window.token; // ya existe
  if (!token) return;

  // 1. Obtengo último shipment con coordenadas
  const s = window.allShipments?.find(sh => sh.lastKnownLocation?.lat && sh.lastKnownLocation?.lon);
  if (!s) return;

  const lat = s.lastKnownLocation.lat;
  const lon = s.lastKnownLocation.lon;

  // 2. Llamada a API
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_KEY}`
  );
  if (!res.ok) return;
  const data = await res.json();

  // 3. Detecto amenaza
  const windSpeed = data.wind?.speed || 0; // m/s
  const alertId   = `weather-${s.shipmentId}-${data.dt}`;

  if (windSpeed > 15 && !localStorage.getItem(alertId)) { // ~54 km/h
    localStorage.setItem(alertId, '1');

    // 4. Notificación push
    await pushNotify(
      'Alerta meteorológica',
      `Viento fuerte (${(windSpeed * 3.6).toFixed(0)} km/h) cerca de tu envío ${s.shipmentId}. Revisa la app.`
    );
  }
}

// 5. Loop cada 30 min
setInterval(checkWeatherAlert, CHECK_MS);

// weather-alerts.js (final)
async function pushNotify(title, body) {
  if (!window.Capacitor.Plugins.PushNotifications) return;
  await window.Capacitor.Plugins.PushNotifications.register();
  await window.Capacitor.Plugins.PushNotifications.createChannel({
    id: 'weather',
    name: 'Clima Marítimo',
    importance: 5
  });
  await window.Capacitor.Plugins.PushNotifications.schedule({
    notifications: [{
      id: Date.now(),
      title,
      body,
      channelId: 'weather',
      smallIcon: 'ic_stat_weather',
      schedule: { allowWhileIdle: true }
    }]
  });
}
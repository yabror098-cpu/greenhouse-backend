const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');

// Railway avtomatik PORT beradi
const PORT = process.env.PORT || 3000;

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ===================== HOLAT =====================
let espClient       = null;
let dashboardClient = null;
let sensorData      = {
  temp: 0,
  zone1_soil: 0, zone2_soil: 0,
  zone1_water: 0, zone2_water: 0,
  fan: false, pump1: false, pump2: false
};

// ===================== WEBSOCKET =====================
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[+] Yangi ulanish: ${ip}`);

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch(e) { return; }

    // ESP32 o'zini tanishtiradi
    if (data.role === 'esp32') {
      espClient = ws;
      ws.clientType = 'esp32';
      console.log('[ESP32] Ulandi!');
      ws.send(JSON.stringify({ status: 'esp32_connected' }));
      return;
    }

    // Dashboard o'zini tanishtiradi
    if (data.role === 'dashboard') {
      if (dashboardClient && dashboardClient.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'rejected',
          reason: 'Boshqa qurilma allaqachon ulangan. Ulanish rad etildi.'
        }));
        ws.close();
        console.log(`[!] ${ip} — rad etildi`);
        return;
      }
      dashboardClient = ws;
      ws.clientType = 'dashboard';
      console.log(`[Dashboard] Ulandi: ${ip}`);
      ws.send(JSON.stringify({ type: 'sensor', ...sensorData }));
      ws.send(JSON.stringify({ type: 'accepted' }));
      return;
    }

    // Dashboard dan buyruq
    if (ws.clientType === 'dashboard') {
      if (data.cmd) {
        console.log(`[CMD] ${data.cmd} = ${data.state}`);
        if (espClient && espClient.readyState === WebSocket.OPEN) {
          espClient.send(JSON.stringify(data));
        }
      }
      return;
    }

    // ESP32 dan sensor ma'lumotlari
    if (ws.clientType === 'esp32') {
      sensorData = { ...sensorData, ...data };
      if (dashboardClient && dashboardClient.readyState === WebSocket.OPEN) {
        dashboardClient.send(JSON.stringify({ type: 'sensor', ...data }));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (ws.clientType === 'esp32') {
      espClient = null;
      console.log('[ESP32] Uzildi');
      if (dashboardClient && dashboardClient.readyState === WebSocket.OPEN) {
        dashboardClient.send(JSON.stringify({ type: 'esp_disconnected' }));
      }
    }
    if (ws.clientType === 'dashboard') {
      dashboardClient = null;
      console.log('[Dashboard] Uzildi');
    }
  });

  ws.on('error', (err) => {
    console.log('[Xato]', err.message);
  });
});

// ===================== API =====================
app.get('/api/status', (req, res) => {
  res.json({
    esp_connected:       !!espClient && espClient.readyState === WebSocket.OPEN,
    dashboard_connected: !!dashboardClient && dashboardClient.readyState === WebSocket.OPEN,
    sensors: sensorData
  });
});

// ===================== SERVER =====================
server.listen(PORT, () => {
  console.log('================================');
  console.log(` GREENHOUSE Backend ishga tushdi`);
  console.log(` Port: ${PORT}`);
  console.log('================================');
});

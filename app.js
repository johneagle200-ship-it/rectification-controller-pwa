const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let rxCharacteristic, txCharacteristic;

async function connectBLE() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'ESP32_Autoclave' }],
      optionalServices: [SERVICE_UUID]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_RX_UUID);
    txCharacteristic = await service.getCharacteristic(CHARACTERISTIC_TX_UUID);

    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleTelemetry);

    document.getElementById('bleStatus').innerText = "Подключено";
    document.getElementById('btnConnect').disabled = true;
  } catch (err) {
    console.error("Ошибка BLE:", err);
    alert("Ошибка подключения: " + err);
  }
}

function handleTelemetry(event) {
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(event.target.value);
  try {
    const data = JSON.parse(jsonStr);
    if (data.t_c !== undefined) document.getElementById('tempCube').innerText = data.t_c;
    if (data.pwr !== undefined) document.getElementById('pwr').innerText = data.pwr;
  } catch (e) {
    console.log("Raw RX:", jsonStr);
  }
}

async function sendCmd(cmd) {
  if (!rxCharacteristic) return;
  const encoder = new TextEncoder();
  await rxCharacteristic.writeValue(encoder.encode(cmd));
}

// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

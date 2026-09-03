const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", async () => {
  await checkSavedDevices();
});

// Проверка ранее подключенных устройств
async function checkSavedDevices() {
  if (navigator.bluetooth && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      if (devices.length > 0) {
        bluetoothDevice = devices[0]; // Берем последнее сохраненное
        document.getElementById('deviceName').innerText = bluetoothDevice.name || "ESP32_Autoclave";
        document.getElementById('btnConnect').innerText = "Подключиться";
        console.log("Найдено сохраненное устройство:", bluetoothDevice.name);
      }
    } catch (err) {
      console.warn("Ошибка чтения сохраненных устройств:", err);
    }
  }
}

// Подключение к сохраненному или поиск нового
async function connectOrReconnect() {
  if (bluetoothDevice) {
    await bindAndConnect(bluetoothDevice);
  } else {
    await selectNewDevice();
  }
}

// Выбор нового устройства через системный диалог
async function selectNewDevice() {
  try {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
      bluetoothDevice.gatt.disconnect();
    }

    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'ESP32' }],
      optionalServices: [SERVICE_UUID]
    });

    document.getElementById('deviceName').innerText = bluetoothDevice.name || "ESP32_Autoclave";
    await bindAndConnect(bluetoothDevice);

  } catch (err) {
    console.log("Выбор устройства отменен или ошибочен:", err);
  }
}

// Внутренняя функция установления GATT-сессии
async function bindAndConnect(device) {
  try {
    document.getElementById('bleStatus').innerText = "Подключение...";
    
    // Слушатель случайного обрыва связи (выключение ESP32 / ушел из зоны)
    device.removeEventListener('gattserverdisconnected', onDisconnected);
    device.addEventListener('gattserverdisconnected', onDisconnected);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_RX_UUID);
    txCharacteristic = await service.getCharacteristic(CHARACTERISTIC_TX_UUID);

    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleTelemetry);

    // Обновляем UI на "Подключено"
    updateUI(true);

  } catch (err) {
    console.error("Ошибка подключения GATT:", err);
    onDisconnected();
    alert("Не удалось подключиться к " + (device.name || "устройству"));
  }
}

// Отключение по кнопке пользователя
function disconnectBLE() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
  }
  onDisconnected();
}

// Обработчик события отключения
function onDisconnected() {
  rxCharacteristic = null;
  txCharacteristic = null;

  updateUI(false);
  document.getElementById('tempCube').innerText = "-- °C";
  document.getElementById('pwr').innerText = "-- Вт";
}

// Обновление состояния кнопок и статуса
function updateUI(isConnected) {
  const statusEl = document.getElementById('bleStatus');
  const btnConnect = document.getElementById('btnConnect');
  const btnDisconnect = document.getElementById('btnDisconnect');

  if (isConnected) {
    statusEl.innerText = "Подключено";
    statusEl.className = "status connected";
    btnConnect.style.display = "none";
    btnDisconnect.style.display = "inline-block";
  } else {
    statusEl.innerText = "Отключено";
    statusEl.className = "status";
    btnConnect.style.display = "inline-block";
    btnConnect.innerText = "Подключиться";
    btnDisconnect.style.display = "none";
  }
}

// Прием JSON-телеметрии
function handleTelemetry(event) {
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(event.target.value);
  try {
    const data = JSON.parse(jsonStr);
    if (data.t_c !== undefined) document.getElementById('tempCube').innerText = data.t_c + " °C";
    if (data.pwr !== undefined) document.getElementById('pwr').innerText = data.pwr + " Вт";
  } catch (e) {
    console.log("Raw RX:", jsonStr);
  }
}

// Отправка команд
async function sendCmd(cmd) {
  if (!rxCharacteristic) {
    alert("Устройство не подключено!");
    return;
  }
  try {
    const encoder = new TextEncoder();
    await rxCharacteristic.writeValue(encoder.encode(cmd));
  } catch (e) {
    console.error("Ошибка отправки команды:", e);
  }
}

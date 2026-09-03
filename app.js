const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isExplicitDisconnect = false; // Флаг: отключил ли пользователь связь вручную

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", async () => {
  await checkSavedDevices();
});

// 1. Проверка ранее привязанных устройств
async function checkSavedDevices() {
  if (navigator.bluetooth && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      if (devices.length > 0) {
        bluetoothDevice = devices[0]; // Берем уже разрешенное устройство
        
        document.getElementById('deviceName').innerText = bluetoothDevice.name || "ESP32_Autoclave";
        
        const btnConnect = document.getElementById('btnConnect');
        btnConnect.innerText = "Подключить " + (bluetoothDevice.name || "ESP32");
        btnConnect.classList.add("ready"); // Готов к быстрому соединению
        
        console.log("[BLE] Найдено запомненное устройство:", bluetoothDevice.name);
      }
    } catch (err) {
      console.warn("[BLE] Ошибка чтения getDevices():", err);
    }
  }
}

// 2. Главная точка входа для кнопки "Подключиться"
async function connectOrReconnect() {
  isExplicitDisconnect = false;

  // Если устройство уже в памяти — подключаемся к нему напрямую БЕЗ вызова системного окна
  if (bluetoothDevice) {
    await bindAndConnect(bluetoothDevice);
  } else {
    // Если запускается впервые на устройстве — вызываем системный поиск
    await selectNewDevice();
  }
}

// 3. Выбор НОВОГО устройства (открывает системное окно)
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
    console.log("[BLE] Выбор устройства отменен:", err);
  }
}

// 4. Установление GATT-сессии
async function bindAndConnect(device) {
  try {
    updateUI("connecting");
    
    device.removeEventListener('gattserverdisconnected', onDisconnected);
    device.addEventListener('gattserverdisconnected', onDisconnected);

    console.log("[BLE] Соединение с GATT...");
    const server = await device.gatt.connect();
    
    const service = await server.getPrimaryService(SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_RX_UUID);
    txCharacteristic = await service.getCharacteristic(CHARACTERISTIC_TX_UUID);

    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleTelemetry);

    updateUI("connected");
    console.log("[BLE] Успешно подключено!");

  } catch (err) {
    console.error("[BLE] Ошибка GATT:", err);
    
    // Если обрыв произошел во время работы — пробуем автоматически переподключиться
    if (!isExplicitDisconnect) {
      console.log("[BLE] Попытка повторного автоподключения через 2 сек...");
      setTimeout(() => { bindAndConnect(device); }, 2000);
    } else {
      onDisconnected();
    }
  }
}

// 5. Отключение по кнопке пользователя
function disconnectBLE() {
  isExplicitDisconnect = true;
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
  }
  onDisconnected();
}

// 6. Обработчик потери связи
function onDisconnected() {
  rxCharacteristic = null;
  txCharacteristic = null;

  updateUI("disconnected");
  document.getElementById('tempCube').innerText = "-- °C";
  document.getElementById('pwr').innerText = "-- Вт";

  // Автореконнект, если связь отвалилась сама (ESP32 перезагрузилась / ушла по питанию)
  if (!isExplicitDisconnect && bluetoothDevice) {
    console.log("[BLE] Потеря связи с ESP32. Ожидание восстановления...");
    updateUI("reconnecting");
    setTimeout(() => { bindAndConnect(bluetoothDevice); }, 3000);
  }
}

// 7. Обновление интерфейса
function updateUI(state) {
  const statusEl = document.getElementById('bleStatus');
  const btnConnect = document.getElementById('btnConnect');
  const btnDisconnect = document.getElementById('btnDisconnect');

  if (state === "connected") {
    statusEl.innerText = "Подключено";
    statusEl.className = "status connected";
    btnConnect.style.display = "none";
    btnDisconnect.style.display = "inline-block";
  } 
  else if (state === "connecting") {
    statusEl.innerText = "Подключение...";
    statusEl.className = "status pending";
  }
  else if (state === "reconnecting") {
    statusEl.innerText = "Поиск ESP32...";
    statusEl.className = "status pending";
  }
  else {
    statusEl.innerText = "Отключено";
    statusEl.className = "status";
    btnConnect.style.display = "inline-block";
    btnConnect.innerText = bluetoothDevice ? ("Подключить " + bluetoothDevice.name) : "Найти ESP32";
    btnDisconnect.style.display = "none";
  }
}

// Прием телеметрии
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

const batteryStatus = document.querySelector("#battery-status");
const batteryLevel = document.querySelector("#battery-level");
const batteryBar = document.querySelector("#battery-bar");
const batteryUpdated = document.querySelector("#battery-updated");
const batteryDevice = document.querySelector("#battery-device");
const batteryConnect = document.querySelector("#battery-connect");
const batteryDisconnect = document.querySelector("#battery-disconnect");
const batteryRefresh = document.querySelector("#battery-refresh");
const batteryAllDevices = document.querySelector("#battery-all-devices");
const batteryUnsupported = document.querySelector("#battery-unsupported");

// The light stick only advertises the CSR serial service, so the battery
// service has to be requested as an optional service after connecting.
const CSR_SERIAL_SERVICE = "00005500-d102-11e1-9b23-00025b00a5a5";
const BATTERY_SERVICE = "battery_service";
const BATTERY_LEVEL = "battery_level";
const STORAGE_KEY = "kwave-lightstick-battery";

let currentDevice = null;
let currentCharacteristic = null;

initLightstickPage();

function initLightstickPage() {
  if (!batteryStatus || !batteryLevel || !batteryConnect) {
    return;
  }

  restoreLastReading();

  if (!navigator.bluetooth) {
    showUnsupported();
    return;
  }

  batteryConnect.addEventListener("click", connectLightstick);
  batteryDisconnect.addEventListener("click", disconnectLightstick);
  batteryRefresh.addEventListener("click", refreshBattery);
  setControlsConnected(false);
}

function showUnsupported() {
  batteryUnsupported.hidden = false;
  batteryConnect.disabled = true;
  setBatteryStatus("這個瀏覽器不支援 Web Bluetooth，請改用電腦版 Chrome 或 Edge。", "error");
}

async function connectLightstick() {
  try {
    setBatteryStatus("請在瀏覽器彈出的視窗中選擇手燈。", "busy");

    const device = await navigator.bluetooth.requestDevice(buildRequestOptions());
    currentDevice = device;
    device.addEventListener("gattserverdisconnected", handleDisconnected);

    setBatteryStatus("連線中，讀取電量。", "busy");
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BATTERY_SERVICE);
    currentCharacteristic = await service.getCharacteristic(BATTERY_LEVEL);

    const value = await currentCharacteristic.readValue();
    renderBattery(value.getUint8(0), device.name);

    await startBatteryNotifications();
    setControlsConnected(true);
    setBatteryStatus("已連線，電量會自動更新。", "ok");
  } catch (error) {
    handleConnectError(error);
  }
}

function buildRequestOptions() {
  const optionalServices = [BATTERY_SERVICE];

  if (batteryAllDevices && batteryAllDevices.checked) {
    return { acceptAllDevices: true, optionalServices };
  }

  return {
    filters: [{ namePrefix: "APINK" }, { services: [CSR_SERIAL_SERVICE] }],
    optionalServices,
  };
}

async function startBatteryNotifications() {
  if (!currentCharacteristic || !currentCharacteristic.properties.notify) {
    return;
  }

  try {
    await currentCharacteristic.startNotifications();
    currentCharacteristic.addEventListener("characteristicvaluechanged", (event) => {
      renderBattery(event.target.value.getUint8(0), currentDevice && currentDevice.name);
    });
  } catch (error) {
    // Live updates are a bonus; a manual refresh still works without them.
    setBatteryStatus("已連線，但無法自動更新，請用「重新讀取」。", "ok");
  }
}

async function refreshBattery() {
  if (!currentCharacteristic) {
    return;
  }

  try {
    setBatteryStatus("重新讀取電量。", "busy");
    const value = await currentCharacteristic.readValue();
    renderBattery(value.getUint8(0), currentDevice && currentDevice.name);
    setBatteryStatus("已更新。", "ok");
  } catch (error) {
    setBatteryStatus(`讀取失敗：${describeError(error)}`, "error");
  }
}

function disconnectLightstick() {
  if (currentDevice && currentDevice.gatt.connected) {
    currentDevice.gatt.disconnect();
    return;
  }

  handleDisconnected();
}

function handleDisconnected() {
  currentCharacteristic = null;
  setControlsConnected(false);
  setBatteryStatus("已中斷連線。最後一次讀到的電量仍顯示在上方。", "");
}

function handleConnectError(error) {
  currentCharacteristic = null;
  setControlsConnected(false);

  if (error && error.name === "NotFoundError") {
    setBatteryStatus("沒有選擇裝置。請確認手燈已開機並進入藍牙模式後再試一次。", "");
    return;
  }

  setBatteryStatus(`連線失敗：${describeError(error)}`, "error");
}

function describeError(error) {
  if (!error) {
    return "未知錯誤";
  }
  if (error.name === "SecurityError") {
    return "瀏覽器拒絕存取，請確認網頁是 HTTPS。";
  }
  if (error.name === "NetworkError") {
    return "藍牙連線中斷，請把手燈靠近一點再試。";
  }
  return error.message || error.name || "未知錯誤";
}

function renderBattery(level, deviceName) {
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));
  const timestamp = new Date();

  batteryLevel.textContent = `${safeLevel}%`;
  batteryBar.style.setProperty("--battery-fill", `${safeLevel}%`);
  batteryBar.dataset.batteryState = batteryState(safeLevel);
  batteryUpdated.textContent = `更新時間 ${formatTime(timestamp)}`;
  batteryDevice.textContent = deviceName || "APINK LIGHT STICK";

  saveLastReading({
    level: safeLevel,
    name: deviceName || "APINK LIGHT STICK",
    time: timestamp.toISOString(),
  });
}

function batteryState(level) {
  if (level <= 20) {
    return "low";
  }
  if (level <= 50) {
    return "mid";
  }
  return "high";
}

function formatTime(date) {
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function saveLastReading(reading) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reading));
  } catch (error) {
    // Private browsing can block storage; the live reading still works.
  }
}

function restoreLastReading() {
  let reading = null;

  try {
    reading = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    reading = null;
  }

  if (!reading || typeof reading.level !== "number") {
    return;
  }

  const safeLevel = Math.max(0, Math.min(100, reading.level));
  batteryLevel.textContent = `${safeLevel}%`;
  batteryBar.style.setProperty("--battery-fill", `${safeLevel}%`);
  batteryBar.dataset.batteryState = batteryState(safeLevel);
  batteryDevice.textContent = reading.name || "APINK LIGHT STICK";
  batteryUpdated.textContent = `上次紀錄 ${formatTime(new Date(reading.time))}`;
}

function setControlsConnected(connected) {
  batteryConnect.hidden = connected;
  batteryDisconnect.hidden = !connected;
  batteryRefresh.hidden = !connected;
}

function setBatteryStatus(message, state) {
  batteryStatus.textContent = message;
  batteryStatus.dataset.batteryStatus = state || "";
}

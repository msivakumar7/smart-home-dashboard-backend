/*
  IoT Smart Home – Production Firmware
  -------------------------------------
  Compatible with Antigravity Full Stack Dashboard

  Hardware:
    - ESP32 DevKit
    - PIR motion sensor → GPIO 14
    - LDR + 10kΩ resistor → GPIO 34 (ADC)
    - DHT11/DHT22 temp+humidity → GPIO 27
    - Relay module (active LOW) → GPIO 26

  Libraries (Arduino Library Manager):
    - ArduinoJson  v6+
    - DHT sensor library by Adafruit
    - Adafruit Unified Sensor

  Configuration:
    Fill in WIFI_SSID, WIFI_PASSWORD, BACKEND_URL, DEVICE_KEY below.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ───────── WiFi ─────────
const char* WIFI_SSID     = "OPPO A77";
const char* WIFI_PASSWORD = "shiva210";

// ───────── Backend ─────────
const char* BACKEND_URL = "https://your-backend-url.up.railway.app";
const char* DEVICE_ID   = "esp32-001";
const char* DEVICE_KEY  = "your-device-key";

// ───────── Pins ─────────
#define PIR_PIN    14
#define LDR_PIN    34
#define RELAY_PIN  26
#define DHT_PIN    27
#define DHT_TYPE   DHT11   // Change to DHT22 if using DHT22

DHT dht(DHT_PIN, DHT_TYPE);

// ───────── State ─────────
bool  lightOn = false;
int   darkThreshold = 400;   // Updated from backend config response
int   autoOffDelay  = 60;    // Seconds of inactivity before auto-off
unsigned long lastMotionTime = 0;
unsigned long startTime      = 0;
unsigned long lastPushTime   = 0;
const unsigned long pushInterval = 5000;  // ms between backend pushes

// ───────── WiFi Reconnect ─────────
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("Reconnecting WiFi...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED)
    Serial.println("\nWiFi Reconnected");
  else
    Serial.println("\nWiFi Failed — will retry next loop");
}

// ───────── Sensor Reading ─────────
int readLDR() { return analogRead(LDR_PIN); }

bool readMotion() { return digitalRead(PIR_PIN) == HIGH; }

float readTemp() {
  float t = dht.readTemperature();
  if (isnan(t)) return -1;
  return t;
}

float readHumidity() {
  float h = dht.readHumidity();
  if (isnan(h)) return -1;
  return h;
}

// ───────── Relay Control ─────────
void setLight(bool state) {
  if (lightOn == state) return;   // No change — skip relay bounce
  lightOn = state;
  digitalWrite(RELAY_PIN, state ? LOW : HIGH);  // Active LOW relay
  Serial.println(state ? "💡 Light ON" : "🌑 Light OFF");
}

// ───────── Push to Backend ─────────
void pushSensorData(int ldr, float temp, float hum, bool motion, bool light, long uptime) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/sensor/" + DEVICE_ID;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.setTimeout(8000);

  StaticJsonDocument<256> doc;
  doc["ldrValue"]       = ldr;
  doc["temperature"]    = temp;
  doc["humidity"]       = hum;
  doc["motionDetected"] = motion;
  doc["lightOn"]        = light;
  doc["uptime"]         = uptime;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("[HTTP %d] LDR=%d Temp=%.1f Hum=%.0f Motion=%d Light=%d\n",
                code, ldr, temp, hum, motion, light);

  if (code == 200) {
    String response = http.getString();
    StaticJsonDocument<256> res;

    if (!deserializeJson(res, response)) {
      // Backend can override the light state (e.g., dashboard toggle)
      if (res.containsKey("lightOn"))
        setLight(res["lightOn"].as<bool>());

      // Backend can update config (darkThreshold, autoOffDelay)
      if (res.containsKey("config")) {
        JsonObject cfg = res["config"];
        if (cfg.containsKey("darkThreshold"))
          darkThreshold = cfg["darkThreshold"].as<int>();
        if (cfg.containsKey("autoOffDelay"))
          autoOffDelay = cfg["autoOffDelay"].as<int>();
      }
    }
  }

  http.end();
}

// ───────── Setup ─────────
void setup() {
  Serial.begin(115200);

  pinMode(PIR_PIN,   INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Relay OFF at boot (active LOW)

  dht.begin();

  // Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());

  startTime = millis();
}

// ───────── Main Loop ─────────
void loop() {
  ensureWiFi();

  int   ldr    = readLDR();
  float temp   = readTemp();
  float hum    = readHumidity();
  bool  motion = readMotion();
  long  uptime = (millis() - startTime) / 1000;

  // ─── Auto Light Logic ───────────────────────────────────────────────────
  // Turn ON: motion detected + room is dark
  if (motion && ldr < darkThreshold) {
    lastMotionTime = millis();
    setLight(true);
  }
  // Turn OFF: no motion for autoOffDelay seconds
  else if (lightOn && !motion) {
    if (millis() - lastMotionTime > (unsigned long)autoOffDelay * 1000UL) {
      setLight(false);
      Serial.println("⏱ Auto OFF triggered");
    }
  }

  // ─── Push to backend every pushInterval ms ───────────────────────────────
  if (millis() - lastPushTime > pushInterval) {
    pushSensorData(ldr, temp, hum, motion, lightOn, uptime);
    lastPushTime = millis();
  }
}

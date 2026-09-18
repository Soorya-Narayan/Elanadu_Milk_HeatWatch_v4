#!/usr/bin/env python3
"""
HeatWatch 4 — Elanadu Milk Edition
Python Hardware Telemetry Poller & InfluxDB Data Ingestion Daemon
Author: Goose Industrial Solutions
"""

import sys
import os
import json
import time
import random
import math
import logging
from datetime import datetime
import requests

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'setup_config.json')
STATE_FILE = '/tmp/heatwatch_telemetry.json'

# Attempt InfluxDB import
INFLUX_AVAILABLE = False
try:
    from influxdb_client import InfluxDBClient, Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS
    INFLUX_AVAILABLE = True
except ImportError:
    logging.warning("influxdb-client not installed. Historical persistence to InfluxDB will be disabled.")

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Error reading configuration: {e}")
    return None

class TelemetryPoller:
    def __init__(self):
        self.config = load_config()
        self.influx_client = None
        self.write_api = None
        self.mock_phase = 0.0
        self.init_influx()

    def init_influx(self):
        if not INFLUX_AVAILABLE or not self.config:
            return
        try:
            cfg = self.config.get('influx', {})
            url = cfg.get('url', 'http://localhost:8086')
            token = cfg.get('token', '')
            org = cfg.get('org', 'elanadu_heatwatch')
            
            self.influx_client = InfluxDBClient(url=url, token=token, org=org, timeout=3000)
            self.write_api = self.influx_client.write_api(write_options=SYNCHRONOUS)
            logging.info(f"InfluxDB client connected to {url} (Org: {org})")
        except Exception as e:
            logging.warning(f"InfluxDB initialization failed (non-fatal): {e}")

    def fetch_hardware_rtd(self, ip, timeout=1.5):
        """
        Polls PPI AIME 8U RTD module via HTTP GET REST interface.
        Returns dict of channel readings or None on failure.
        """
        try:
            url = f"http://{ip}/api/readings"
            resp = requests.get(url, timeout=timeout)
            if resp.status_code == 200:
                data = resp.json()
                return data
        except Exception:
            pass
        return None

    def generate_mock_readings(self, sensors):
        """
        Generates realistic industrial dairy telemetry matching configured Hi/Lo operating ranges.
        Channel 8 and inactive channels return None (OPEN).
        """
        self.mock_phase += 0.05
        readings = {}
        
        for idx, sensor in enumerate(sensors):
            cid = sensor['id']
            if not sensor.get('active', True) or cid == 'CH8':
                readings[cid] = None
                continue

            lo = sensor.get('lo', 0.0)
            hi = sensor.get('hi', 100.0)
            offset = sensor.get('offset', 0.0)
            
            # Midpoint temperature between set Lo and Hi operating thresholds
            midpoint = (lo + hi) / 2.0
            span = max(1.0, (hi - lo))
            amplitude = span * 0.15
            noise = random.uniform(-0.1, 0.1)
            wave = math.sin(self.mock_phase + idx * 0.8) * amplitude

            temp = round(midpoint + wave + noise + offset, 2)
            readings[cid] = temp

        return readings

    def evaluate_status(self, temp, sensor):
        if temp is None or not sensor.get('active', True):
            return "INACTIVE"

        lolo = sensor.get('lolo', -50.0)
        lo = sensor.get('lo', -40.0)
        hi = sensor.get('hi', 85.0)
        hihi = sensor.get('hihi', 95.0)

        if temp >= hihi:
            return "CRITICAL_HIHI"
        elif temp <= lolo:
            return "CRITICAL_LOLO"
        elif temp >= hi:
            return "WARNING_HI"
        elif temp <= lo:
            return "WARNING_LO"
        return "NORMAL"

    def run_cycle(self):
        self.config = load_config()
        if not self.config:
            logging.error("No valid configuration found. Retrying...")
            return

        sensors = self.config.get('sensors', [])
        poller_cfg = self.config.get('poller', {})
        rtd_ip = poller_cfg.get('rtdIp', '192.168.1.2')
        force_mock = poller_cfg.get('mockMode', True)

        # Poll Hardware or Fallback to Mock
        raw_data = None
        is_mock = True
        if not force_mock:
            raw_data = self.fetch_hardware_rtd(rtd_ip)
            if raw_data:
                is_mock = False

        if is_mock or not raw_data:
            readings = self.generate_mock_readings(sensors)
        else:
            readings = raw_data.get('readings', {})

        now_iso = datetime.utcnow().isoformat() + 'Z'
        processed_channels = []
        has_critical = False
        has_warning = False

        influx_points = []
        bucket = self.config.get('influx', {}).get('bucket', 'temperature_telemetry')

        for sensor in sensors:
            cid = sensor['id']
            temp = readings.get(cid)
            status = self.evaluate_status(temp, sensor)
            
            if "CRITICAL" in status:
                has_critical = True
            elif "WARNING" in status:
                has_warning = True

            channel_entry = {
                "id": cid,
                "name": sensor['name'],
                "label": sensor['label'],
                "unit": sensor.get('unit', '°C'),
                "value": temp,
                "status": status,
                "lolo": sensor.get('lolo'),
                "lo": sensor.get('lo'),
                "hi": sensor.get('hi'),
                "hihi": sensor.get('hihi'),
                "active": sensor.get('active', True) if cid != 'CH8' else False
            }
            processed_channels.append(channel_entry)

            # Build InfluxDB Point
            if INFLUX_AVAILABLE and self.write_api:
                p = Point("temperature_reading") \
                    .tag("channel_id", cid) \
                    .tag("channel_name", sensor['name']) \
                    .tag("client", "Elanadu_Milk") \
                    .field("temperature", float(temp)) \
                    .field("status_code", 2 if "CRITICAL" in status else (1 if "WARNING" in status else 0))
                influx_points.append(p)

        system_status = "CRITICAL" if has_critical else ("WARNING" if has_warning else "NORMAL")

        payload = {
            "timestamp": now_iso,
            "systemStatus": system_status,
            "mode": "MOCK" if is_mock else "HARDWARE_PPI",
            "channels": processed_channels
        }

        # Save state to /tmp JSON file for node server fast read
        try:
            tmp_file = STATE_FILE + '.tmp'
            with open(tmp_file, 'w') as f:
                json.dump(payload, f)
            os.replace(tmp_file, STATE_FILE)
        except Exception as e:
            logging.error(f"Failed writing state file: {e}")

        # Flush to InfluxDB
        if INFLUX_AVAILABLE and self.write_api and influx_points:
            try:
                self.write_api.write(bucket=bucket, record=influx_points)
            except Exception as e:
                logging.debug(f"InfluxDB write batch deferred: {e}")

        logging.info(f"Telemetry Cycle [{payload['mode']}] | Status: {system_status} | Channels: {len(processed_channels)}")

def main():
    logging.info("Starting HeatWatch 4 Telemetry Poller Daemon...")
    poller = TelemetryPoller()
    
    while True:
        try:
            poller.run_cycle()
        except Exception as e:
            logging.error(f"Unhandled loop exception: {e}")
        time.sleep(2.0)

if __name__ == '__main__':
    main()

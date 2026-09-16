#!/usr/bin/env python3
"""
HeatWatch 4 — Elanadu Milk Edition
Industrial Alarm Relay & Hooter Actuator Daemon
Author: Goose Industrial Solutions
"""

import sys
import os
import json
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [RELAY] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

STATE_FILE = '/tmp/heatwatch_telemetry.json'
MUTE_FILE = '/tmp/heatwatch_mute.json'

# Attempt RPi.GPIO import
GPIO_AVAILABLE = False
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    logging.warning("RPi.GPIO unavailable. Relay output running in SIMULATION mode.")

# Default GPIO Pins (BCM numbering)
HOOTER_PIN = 18    # Primary siren / audible hooter
WARNING_PIN = 23   # Flashing amber warning strobe
CRITICAL_PIN = 24  # Red critical strobe

def setup_gpio():
    if not GPIO_AVAILABLE:
        return
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(HOOTER_PIN, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(WARNING_PIN, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(CRITICAL_PIN, GPIO.OUT, initial=GPIO.LOW)
        logging.info("GPIO pins (BCM 18, 23, 24) initialized for relay output.")
    except Exception as e:
        logging.error(f"GPIO setup exception: {e}")

def set_pin_state(pin, active):
    if GPIO_AVAILABLE:
        try:
            GPIO.output(pin, GPIO.HIGH if active else GPIO.LOW)
        except Exception:
            pass

def is_muted():
    if os.path.exists(MUTE_FILE):
        try:
            with open(MUTE_FILE, 'r') as f:
                data = json.load(f)
                until = data.get('muteUntil', 0)
                if time.time() < until:
                    return True
        except Exception:
            pass
    return False

def main():
    logging.info("Starting HeatWatch 4 Relay Daemon...")
    setup_gpio()
    
    last_state = "UNKNOWN"

    while True:
        status = "NORMAL"
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, 'r') as f:
                    data = json.load(f)
                    status = data.get('systemStatus', 'NORMAL')
            except Exception:
                pass

        muted = is_muted()

        if status == "CRITICAL":
            set_pin_state(CRITICAL_PIN, True)
            set_pin_state(WARNING_PIN, True)
            set_pin_state(HOOTER_PIN, not muted)
        elif status == "WARNING":
            set_pin_state(CRITICAL_PIN, False)
            set_pin_state(WARNING_PIN, True)
            set_pin_state(HOOTER_PIN, False)
        else:
            set_pin_state(CRITICAL_PIN, False)
            set_pin_state(WARNING_PIN, False)
            set_pin_state(HOOTER_PIN, False)

        if status != last_state:
            logging.info(f"Relay State Transition: {last_state} -> {status} (Muted: {muted})")
            last_state = status

        time.sleep(1.0)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        if GPIO_AVAILABLE:
            GPIO.cleanup()

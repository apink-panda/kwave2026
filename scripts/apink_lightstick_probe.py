#!/usr/bin/env python3
"""
Probe an APINK LIGHT STICK over Bluetooth LE.

Default behavior is read-only: scan, connect, and print services and
characteristics. Use --char and --write-hex only after you identify a writable
characteristic that looks safe to test.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import time
from typing import Iterable, Optional

try:
    from bleak import BleakClient, BleakScanner
except ImportError:  # pragma: no cover - helpful runtime message
    print("Missing dependency: bleak", file=sys.stderr)
    print("Install it with: python3 -m pip install bleak", file=sys.stderr)
    sys.exit(1)


DEFAULT_NAME = "APINK"
CSR_OTA_SERVICE_UUID = "00001016-d102-11e1-9b23-00025b00a5a5"
LIKELY_LIGHT_WRITE_UUID = "000092a4-0000-1000-8000-00805f9b34fb"
LIKELY_LIGHT_NOTIFY_UUID = "000092a5-0000-1000-8000-00805f9b34fb"
PROBE_PAYLOADS = {
    "byte-modes": [
        ("mode 00", "00"),
        ("mode 01", "01"),
        ("mode 02", "02"),
        ("mode 03", "03"),
        ("mode 04", "04"),
        ("mode 05", "05"),
        ("mode 06", "06"),
        ("mode 07", "07"),
        ("mode 08", "08"),
    ],
    "rgb-basic": [
        ("rgb red", "ff0000"),
        ("rgb green", "00ff00"),
        ("rgb blue", "0000ff"),
        ("rgb pink", "ff66cc"),
        ("rgb white", "ffffff"),
        ("rgb off", "000000"),
        ("01 rgb red", "01ff0000"),
        ("01 rgb green", "0100ff00"),
        ("01 rgb blue", "010000ff"),
        ("01 rgb pink", "01ff66cc"),
        ("02 rgb red", "02ff0000"),
        ("02 rgb pink", "02ff66cc"),
    ],
    "magic-blue": [
        ("magic on", "cc2333"),
        ("magic red", "56ff000000f0aa"),
        ("magic green", "5600ff0000f0aa"),
        ("magic blue", "560000ff00f0aa"),
        ("magic pink", "56ff66cc00f0aa"),
        ("magic white", "56ffffff00f0aa"),
        ("magic off", "cc2433"),
    ],
    "framed-rgb": [
        ("7e rgb red", "7e000503ff000000ef"),
        ("7e rgb green", "7e00050300ff0000ef"),
        ("7e rgb blue", "7e0005030000ff00ef"),
        ("7e rgb pink", "7e000503ff66cc00ef"),
        ("7e rgb white", "7e000503ffffff00ef"),
        ("7e off", "7e00040400000000ef"),
    ],
    "ascii": [
        ("AT", "4154"),
        ("AT CRLF", "41540d0a"),
        ("ON", "4f4e"),
        ("OFF", "4f4646"),
        ("RED", "524544"),
        ("PINK", "50494e4b"),
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scan and inspect APINK LIGHT STICK BLE services."
    )
    parser.add_argument(
        "--name",
        default=DEFAULT_NAME,
        help="Device name keyword to search for. Default: APINK",
    )
    parser.add_argument(
        "--address",
        help="Connect to a known BLE address/identifier instead of scanning by name.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=12.0,
        help="BLE scan timeout in seconds. Default: 12",
    )
    parser.add_argument(
        "--connect-timeout",
        type=float,
        default=20.0,
        help="BLE connection timeout in seconds. Default: 20",
    )
    parser.add_argument(
        "--connect-retries",
        type=int,
        default=3,
        help="Connection attempts before giving up. Default: 3",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=2.0,
        help="Delay between connection attempts in seconds. Default: 2",
    )
    parser.add_argument(
        "--char",
        help="Characteristic UUID or handle to write to. Example: 0000xxxx-...",
    )
    parser.add_argument(
        "--write-hex",
        help="Hex bytes to write, e.g. '01 ff 66 cc'. Requires --char.",
    )
    parser.add_argument(
        "--sequence",
        help="Comma-separated hex payloads to write in order, e.g. '00,01,02'. Requires --char.",
    )
    parser.add_argument(
        "--probe",
        action="append",
        choices=sorted(PROBE_PAYLOADS),
        default=[],
        help="Run a built-in probe payload set. Can be repeated. Requires --char.",
    )
    parser.add_argument(
        "--list-probes",
        action="store_true",
        help="List built-in probe payload sets and exit.",
    )
    parser.add_argument(
        "--sequence-delay",
        type=float,
        default=2.0,
        help="Delay between --sequence writes in seconds. Default: 2",
    )
    parser.add_argument(
        "--step",
        action="store_true",
        help="Prompt between sequence/probe writes so you can observe the light stick.",
    )
    parser.add_argument(
        "--response",
        action="store_true",
        help="Use write-with-response. Default uses write-without-response.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow writing even if the characteristic properties do not list write.",
    )
    parser.add_argument(
        "--force-ota",
        action="store_true",
        help="Allow writing to CSR OTA firmware characteristics. Not recommended.",
    )
    parser.add_argument(
        "--read",
        action="store_true",
        help="Try reading readable characteristics after listing services.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Prompt for characteristic and hex bytes after connecting.",
    )
    parser.add_argument(
        "--monitor",
        type=float,
        default=0.0,
        help="Subscribe to notify characteristics for N seconds. Try pressing the light stick button.",
    )
    parser.add_argument(
        "--notify-char",
        action="append",
        default=[],
        help="Only monitor the specified notify characteristic UUID or handle. Can be repeated.",
    )
    return parser.parse_args()


def normalize_hex(value: str) -> bytes:
    text = re.sub(r"0x", "", value, flags=re.IGNORECASE)
    text = re.sub(r"[^0-9a-fA-F]", "", text)
    if not text:
        raise ValueError("hex value is empty")
    if len(text) % 2:
        raise ValueError("hex value must contain an even number of digits")
    return bytes.fromhex(text)


def bytes_to_hex(value: bytes) -> str:
    return value.hex(" ")


def print_probe_sets() -> None:
    print("Built-in probe payload sets:")
    for name, payloads in PROBE_PAYLOADS.items():
        print(f"\n{name}")
        for label, payload in payloads:
            print(f"  {label}: {payload}")


def sequence_payloads(sequence: str):
    return [
        (f"sequence {index}", payload)
        for index, payload in enumerate((item.strip() for item in sequence.split(",")), start=1)
        if payload
    ]


def build_write_payloads(args: argparse.Namespace):
    payloads = []

    if args.write_hex:
        payloads.append(("single write", args.write_hex))
    if args.sequence:
        payloads.extend(sequence_payloads(args.sequence))
    for probe_name in args.probe:
        payloads.extend(
            (f"{probe_name}: {label}", payload)
            for label, payload in PROBE_PAYLOADS[probe_name]
        )

    return payloads


def is_writable(properties: Iterable[str]) -> bool:
    props = set(properties)
    return "write" in props or "write-without-response" in props


def is_readable(properties: Iterable[str]) -> bool:
    return "read" in set(properties)


def is_notifiable(properties: Iterable[str]) -> bool:
    return "notify" in set(properties) or "indicate" in set(properties)


def device_name(device) -> str:
    return device.name or "(no name)"


async def scan_for_device(name_keyword: str, timeout: float):
    print(f"Scanning for BLE devices for {timeout:g}s...")
    devices = await BleakScanner.discover(timeout=timeout)

    if not devices:
        print("No BLE devices found.")
        return None

    print("\nDiscovered devices:")
    matches = []
    keyword = name_keyword.upper()
    for index, device in enumerate(devices, start=1):
        name = device_name(device)
        marker = ""
        if keyword in name.upper():
            marker = "  <== match"
            matches.append(device)
        print(f"  {index:02d}. {name} | {device.address}{marker}")

    if not matches:
        print(f"\nNo device name matched keyword: {name_keyword!r}")
        return None

    exact = [device for device in matches if device_name(device).upper() == "APINK LIGHT STICK"]
    target = exact[0] if exact else matches[0]
    print(f"\nSelected: {device_name(target)} | {target.address}")
    return target


async def get_services(client: BleakClient):
    # Bleak exposes services as a property after connection in newer versions,
    # while older versions may still need get_services().
    try:
        return client.services
    except Exception:
        get_services_method = getattr(client, "get_services", None)
        if get_services_method:
            return await get_services_method()
        raise


def is_pairing_cache_error(error: Exception) -> bool:
    message = str(error).lower()
    return "peer removed pairing information" in message or "cberrordomain code=14" in message


def pairing_cache_help() -> str:
    return (
        "macOS still has stale Bluetooth pairing/bond data for this light stick, "
        "but the light stick has removed its side of the pairing. Open System Settings > "
        "Bluetooth, forget/remove APINK LIGHT STICK if it appears, toggle Bluetooth off/on, "
        "turn the light stick off for 10 seconds, then put it back into Bluetooth mode."
    )


async def connect_with_retries(target, timeout: float, retries: int, retry_delay: float):
    attempts = max(1, retries)
    last_error = None
    saw_pairing_cache_error = False

    for attempt in range(1, attempts + 1):
        client = BleakClient(target, timeout=timeout)
        print(f"\nConnecting... attempt {attempt}/{attempts}")
        try:
            await asyncio.wait_for(client.connect(), timeout=timeout + 5)
            print(f"Connected: {client.is_connected}")
            return client
        except Exception as error:
            last_error = error
            print(f"Connect failed: {error.__class__.__name__}: {error}")
            if is_pairing_cache_error(error):
                saw_pairing_cache_error = True
                print(f"Pairing cache hint: {pairing_cache_help()}")
            try:
                if client.is_connected:
                    await client.disconnect()
            except Exception:
                pass

            if attempt < attempts:
                print(f"Waiting {retry_delay:g}s before retrying...")
                await asyncio.sleep(retry_delay)

    if saw_pairing_cache_error:
        raise RuntimeError(pairing_cache_help()) from last_error

    raise RuntimeError(
        "Could not connect to the light stick. Try turning the light stick off/on, "
        "waiting 10 seconds, closing other Bluetooth apps, or toggling macOS Bluetooth."
    ) from last_error


def print_services(services):
    print("\nServices and characteristics:")
    writable_chars = []

    for service in services:
        service_note = ""
        if service.uuid.lower() == CSR_OTA_SERVICE_UUID:
            service_note = "  <-- CSR OTA / firmware update service; avoid writing"
        print(f"[SERVICE] {service.uuid} | {service.description}{service_note}")
        for char in service.characteristics:
            props = list(char.properties)
            writable = is_writable(props)
            if writable:
                writable_chars.append(char)
            tag = "  WRITE CANDIDATE" if writable else ""
            if service.uuid.lower() == CSR_OTA_SERVICE_UUID:
                tag += "  AVOID"
            elif char.uuid.lower() == LIKELY_LIGHT_WRITE_UUID:
                tag += "  LIKELY LIGHT CONTROL"
            elif char.uuid.lower() == LIKELY_LIGHT_NOTIFY_UUID:
                tag += "  LIKELY LIGHT REPLY"
            print(
                f"  [CHAR] handle={char.handle} uuid={char.uuid} "
                f"props={','.join(props) or '-'}{tag}"
            )
            for descriptor in char.descriptors:
                print(
                    f"    [DESC] handle={descriptor.handle} uuid={descriptor.uuid} "
                    f"| {descriptor.description}"
                )

    if writable_chars:
        print("\nWritable candidates:")
        for char in writable_chars:
            print(f"  handle={char.handle} uuid={char.uuid} props={','.join(char.properties)}")
    else:
        print("\nNo writable characteristics were advertised.")

    return writable_chars


def get_notify_candidates(services, specs):
    if specs:
        chars = []
        for spec in specs:
            char = find_characteristic(services, spec)
            if not char:
                print(f"Notify characteristic not found: {spec}")
                continue
            chars.append(char)
        return chars

    chars = []
    for service in services:
        for char in service.characteristics:
            if is_notifiable(char.properties):
                chars.append(char)
    return chars


def find_characteristic(services, spec: str):
    normalized = spec.strip().lower()
    for service in services:
        for char in service.characteristics:
            if char.uuid.lower() == normalized or str(char.handle) == normalized:
                return char
    return None


async def read_characteristics(client: BleakClient, services):
    print("\nReadable characteristic values:")
    found = False
    for service in services:
        for char in service.characteristics:
            if not is_readable(char.properties):
                continue
            found = True
            try:
                value = await client.read_gatt_char(char)
                print(f"  handle={char.handle} uuid={char.uuid} => {bytes_to_hex(value)}")
            except Exception as error:  # BLE devices often reject some reads.
                print(f"  handle={char.handle} uuid={char.uuid} => read failed: {error}")
    if not found:
        print("  No readable characteristics were advertised.")


async def write_hex_to_char(
    client: BleakClient,
    services,
    char_spec: str,
    hex_value: str,
    response: bool,
    force: bool,
    force_ota: bool,
) -> None:
    char = find_characteristic(services, char_spec)
    if not char:
        raise RuntimeError(f"Characteristic not found: {char_spec}")

    if not force and not is_writable(char.properties):
        raise RuntimeError(
            f"Characteristic {char.uuid} does not advertise write permissions. "
            "Use --force only if you are sure."
        )
    if char.service_uuid.lower() == CSR_OTA_SERVICE_UUID and not force_ota:
        raise RuntimeError(
            f"Refusing to write to CSR OTA firmware characteristic {char.uuid}. "
            "Use --force-ota only if you intentionally want firmware-update traffic."
        )

    data = normalize_hex(hex_value)
    print(
        f"\nWriting to handle={char.handle} uuid={char.uuid}: "
        f"{bytes_to_hex(data)} response={response}"
    )
    await client.write_gatt_char(char, data, response=response)
    print("Write completed.")


async def write_sequence_to_char(
    client: BleakClient,
    services,
    char_spec: str,
    payloads,
    delay: float,
    response: bool,
    force: bool,
    force_ota: bool,
    step: bool,
) -> None:
    if not payloads:
        raise RuntimeError("No payloads to write")

    print(f"\nWriting sequence of {len(payloads)} payload(s) with {delay:g}s delay.")
    for index, (label, payload) in enumerate(payloads, start=1):
        print(f"\n[{index}/{len(payloads)}] {label}: {payload}")
        await write_hex_to_char(
            client,
            services,
            char_spec,
            payload,
            response=response,
            force=force,
            force_ota=force_ota,
        )
        if index < len(payloads):
            if step:
                await asyncio.to_thread(input, "Press Enter for next payload...")
            else:
                await asyncio.sleep(delay)


async def monitor_notifications(client: BleakClient, services, specs, seconds: float):
    notify_chars = get_notify_candidates(services, specs)
    if not notify_chars:
        print("\nNo notify characteristics to monitor.")
        return

    started = []

    def make_handler(char):
        def handler(sender, data):
            timestamp = time.strftime("%H:%M:%S")
            print(
                f"[{timestamp}] notify handle={char.handle} uuid={char.uuid} "
                f"sender={sender} => {bytes_to_hex(bytes(data))}"
            )

        return handler

    print(f"\nMonitoring notifications for {seconds:g}s...")
    print("Press the light stick button or change modes while this is running.")
    for char in notify_chars:
        try:
            await client.start_notify(char, make_handler(char))
            started.append(char)
            print(f"  started handle={char.handle} uuid={char.uuid}")
        except Exception as error:
            print(f"  failed handle={char.handle} uuid={char.uuid}: {error}")

    if started:
        await asyncio.sleep(seconds)

    for char in started:
        try:
            await client.stop_notify(char)
        except Exception as error:
            print(f"  stop failed handle={char.handle} uuid={char.uuid}: {error}")


async def interactive_loop(
    client: BleakClient,
    services,
    default_response: bool,
    force: bool,
    force_ota: bool,
):
    print("\nInteractive write mode")
    print("Type an empty characteristic to exit.")
    print("Tip: use the handle number or UUID shown above.")

    while True:
        char_spec = input("\nCharacteristic handle/uuid> ").strip()
        if not char_spec:
            break

        hex_value = input("Hex bytes to write> ").strip()
        if not hex_value:
            print("Skipped: empty hex bytes.")
            continue

        try:
            await write_hex_to_char(
                client,
                services,
                char_spec,
                hex_value,
                response=default_response,
                force=force,
                force_ota=force_ota,
            )
        except Exception as error:
            print(f"Write failed: {error}")


async def run() -> int:
    args = parse_args()

    if args.list_probes:
        print_probe_sets()
        return 0

    write_modes = [bool(args.write_hex), bool(args.sequence), bool(args.probe)]
    if sum(write_modes) > 1:
        print("Use only one of --write-hex, --sequence, or --probe.", file=sys.stderr)
        return 2

    write_payloads = build_write_payloads(args)
    has_write = bool(write_payloads)
    if bool(args.char) != has_write:
        print("--char must be used with --write-hex, --sequence, or --probe.", file=sys.stderr)
        return 2

    target: Optional[object] = args.address
    if not target:
        target = await scan_for_device(args.name, args.timeout)
        if not target:
            return 1

    client = await connect_with_retries(
        target,
        timeout=args.connect_timeout,
        retries=args.connect_retries,
        retry_delay=args.retry_delay,
    )

    try:
        services = await get_services(client)
        print_services(services)

        if args.read:
            await read_characteristics(client, services)

        if args.monitor > 0 and has_write:
            monitor_task = asyncio.create_task(
                monitor_notifications(client, services, args.notify_char, args.monitor)
            )
            await asyncio.sleep(0.8)
            if len(write_payloads) > 1:
                await write_sequence_to_char(
                    client,
                    services,
                    args.char,
                    write_payloads,
                    args.sequence_delay,
                    response=args.response,
                    force=args.force,
                    force_ota=args.force_ota,
                    step=args.step,
                )
            else:
                _, payload = write_payloads[0]
                await write_hex_to_char(
                    client,
                    services,
                    args.char,
                    payload,
                    response=args.response,
                    force=args.force,
                    force_ota=args.force_ota,
                )
            await monitor_task
        else:
            if has_write:
                if len(write_payloads) > 1:
                    await write_sequence_to_char(
                        client,
                        services,
                        args.char,
                        write_payloads,
                        args.sequence_delay,
                        response=args.response,
                        force=args.force,
                        force_ota=args.force_ota,
                        step=args.step,
                    )
                else:
                    _, payload = write_payloads[0]
                    await write_hex_to_char(
                        client,
                        services,
                        args.char,
                        payload,
                        response=args.response,
                        force=args.force,
                        force_ota=args.force_ota,
                    )

            if args.monitor > 0:
                await monitor_notifications(client, services, args.notify_char, args.monitor)

        if args.interactive:
            await interactive_loop(
                client,
                services,
                args.response,
                args.force,
                args.force_ota,
            )

    finally:
        if client.is_connected:
            await client.disconnect()
        print("\nDisconnected.")

    return 0


def main() -> None:
    try:
        raise SystemExit(asyncio.run(run()))
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(130)
    except Exception as error:
        print(f"\nError: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

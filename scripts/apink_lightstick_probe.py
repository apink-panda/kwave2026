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
        "--sequence-delay",
        type=float,
        default=2.0,
        help="Delay between --sequence writes in seconds. Default: 2",
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
    sequence: str,
    delay: float,
    response: bool,
    force: bool,
    force_ota: bool,
) -> None:
    payloads = [item.strip() for item in sequence.split(",") if item.strip()]
    if not payloads:
        raise RuntimeError("--sequence did not contain any hex payloads")

    print(f"\nWriting sequence of {len(payloads)} payload(s) with {delay:g}s delay.")
    for index, payload in enumerate(payloads, start=1):
        print(f"\n[{index}/{len(payloads)}]")
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

    has_write = bool(args.write_hex or args.sequence)
    if bool(args.char) != has_write:
        print("--char must be used with --write-hex or --sequence.", file=sys.stderr)
        return 2
    if args.write_hex and args.sequence:
        print("Use either --write-hex or --sequence, not both.", file=sys.stderr)
        return 2

    target: Optional[object] = args.address
    if not target:
        target = await scan_for_device(args.name, args.timeout)
        if not target:
            return 1

    print("\nConnecting...")
    async with BleakClient(target) as client:
        print(f"Connected: {client.is_connected}")
        services = await get_services(client)
        print_services(services)

        if args.read:
            await read_characteristics(client, services)

        if args.monitor > 0 and has_write:
            monitor_task = asyncio.create_task(
                monitor_notifications(client, services, args.notify_char, args.monitor)
            )
            await asyncio.sleep(0.8)
            if args.sequence:
                await write_sequence_to_char(
                    client,
                    services,
                    args.char,
                    args.sequence,
                    args.sequence_delay,
                    response=args.response,
                    force=args.force,
                    force_ota=args.force_ota,
                )
            else:
                await write_hex_to_char(
                    client,
                    services,
                    args.char,
                    args.write_hex,
                    response=args.response,
                    force=args.force,
                    force_ota=args.force_ota,
                )
            await monitor_task
        else:
            if has_write:
                if args.sequence:
                    await write_sequence_to_char(
                        client,
                        services,
                        args.char,
                        args.sequence,
                        args.sequence_delay,
                        response=args.response,
                        force=args.force,
                        force_ota=args.force_ota,
                    )
                else:
                    await write_hex_to_char(
                        client,
                        services,
                        args.char,
                        args.write_hex,
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

    print("\nDisconnected.")
    return 0


def main() -> None:
    try:
        raise SystemExit(asyncio.run(run()))
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(130)


if __name__ == "__main__":
    main()

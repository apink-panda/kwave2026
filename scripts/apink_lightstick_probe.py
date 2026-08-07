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
from typing import Iterable, Optional

try:
    from bleak import BleakClient, BleakScanner
except ImportError:  # pragma: no cover - helpful runtime message
    print("Missing dependency: bleak", file=sys.stderr)
    print("Install it with: python3 -m pip install bleak", file=sys.stderr)
    sys.exit(1)


DEFAULT_NAME = "APINK"


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
        "--read",
        action="store_true",
        help="Try reading readable characteristics after listing services.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Prompt for characteristic and hex bytes after connecting.",
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
        print(f"[SERVICE] {service.uuid} | {service.description}")
        for char in service.characteristics:
            props = list(char.properties)
            writable = is_writable(props)
            if writable:
                writable_chars.append(char)
            tag = "  WRITE CANDIDATE" if writable else ""
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
) -> None:
    char = find_characteristic(services, char_spec)
    if not char:
        raise RuntimeError(f"Characteristic not found: {char_spec}")

    if not force and not is_writable(char.properties):
        raise RuntimeError(
            f"Characteristic {char.uuid} does not advertise write permissions. "
            "Use --force only if you are sure."
        )

    data = normalize_hex(hex_value)
    print(
        f"\nWriting to handle={char.handle} uuid={char.uuid}: "
        f"{bytes_to_hex(data)} response={response}"
    )
    await client.write_gatt_char(char, data, response=response)
    print("Write completed.")


async def interactive_loop(client: BleakClient, services, default_response: bool, force: bool):
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
            )
        except Exception as error:
            print(f"Write failed: {error}")


async def run() -> int:
    args = parse_args()

    if bool(args.char) != bool(args.write_hex):
        print("--char and --write-hex must be used together.", file=sys.stderr)
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

        if args.write_hex:
            await write_hex_to_char(
                client,
                services,
                args.char,
                args.write_hex,
                response=args.response,
                force=args.force,
            )

        if args.interactive:
            await interactive_loop(client, services, args.response, args.force)

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

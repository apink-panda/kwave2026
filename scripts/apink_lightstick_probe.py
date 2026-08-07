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
import collections
import json
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
    "csr-serial-ping": [
        ("NUL wake", "00"),
        ("CRLF wake", "0d0a"),
        ("AT CRLF", "41540d0a"),
        ("ATI CRLF", "4154490d0a"),
        ("PING CRLF", "50494e470d0a"),
        ("VERSION CRLF", "56455253494f4e0d0a"),
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
        "--length-sweep",
        type=int,
        default=0,
        help=(
            "Write N bytes of --length-fill for N = 1..LENGTH_SWEEP. Rejected lengths "
            "reveal the payload size the firmware expects. Try 20 first."
        ),
    )
    parser.add_argument(
        "--length-fill",
        default="00",
        help="Single byte repeated by --length-sweep. Default: 00",
    )
    parser.add_argument(
        "--header-sweep",
        help="Sweep a leading byte over an inclusive hex range, e.g. '00-ff'.",
    )
    parser.add_argument(
        "--header-body",
        default="",
        help="Hex body appended after each --header-sweep byte. Default: empty",
    )
    parser.add_argument(
        "--sweep-writable",
        action="store_true",
        help="Send payloads to every writable characteristic instead of a single --char.",
    )
    parser.add_argument(
        "--reply-wait",
        type=float,
        default=1.2,
        help=(
            "Seconds to wait for a notification reply after each write, so replies can be "
            "matched to the payload that caused them. 0 disables. Default: 1.2"
        ),
    )
    parser.add_argument(
        "--log",
        help="Append a JSONL record of every write, error, and reply to this file.",
    )
    parser.add_argument(
        "--sequence-delay",
        type=float,
        default=2.0,
        help="Extra delay after each write in seconds. Use 0 for long sweeps. Default: 2",
    )
    parser.add_argument(
        "--step",
        action="store_true",
        help="Prompt between sequence/probe writes so you can observe the light stick.",
    )
    parser.add_argument(
        "--response",
        action="store_true",
        help=(
            "Force write-with-response. By default the write type is chosen per "
            "characteristic from its advertised properties."
        ),
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


def length_sweep_payloads(max_length: int, fill: str):
    fill_byte = normalize_hex(fill)
    if len(fill_byte) != 1:
        raise ValueError("--length-fill must be exactly one byte")
    return [
        (f"length {length}", fill_byte.hex() * length)
        for length in range(1, max_length + 1)
    ]


def header_sweep_payloads(spec: str, body: str):
    match = re.fullmatch(r"\s*([0-9a-fA-F]{1,2})\s*-\s*([0-9a-fA-F]{1,2})\s*", spec)
    if not match:
        raise ValueError("--header-sweep must look like '00-ff'")

    start = int(match.group(1), 16)
    end = int(match.group(2), 16)
    if end < start:
        raise ValueError("--header-sweep end must be greater than or equal to start")

    body_hex = normalize_hex(body).hex() if body.strip() else ""
    return [
        (f"header {value:02x}", f"{value:02x}{body_hex}")
        for value in range(start, end + 1)
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
    if args.length_sweep > 0:
        payloads.extend(length_sweep_payloads(args.length_sweep, args.length_fill))
    if args.header_sweep:
        payloads.extend(header_sweep_payloads(args.header_sweep, args.header_body))

    return payloads


def write_with_response(char, force_response: bool) -> bool:
    """Pick the write type the characteristic actually supports.

    CoreBluetooth silently drops a write-without-response sent to a
    characteristic that only advertises plain write, so the type has to follow
    the properties rather than a single global flag.
    """
    if force_response:
        return True
    props = set(char.properties)
    if "write-without-response" in props:
        return False
    return True


def is_writable(properties: Iterable[str]) -> bool:
    props = set(properties)
    return "write" in props or "write-without-response" in props


def is_readable(properties: Iterable[str]) -> bool:
    return "read" in set(properties)


def is_notifiable(properties: Iterable[str]) -> bool:
    return "notify" in set(properties) or "indicate" in set(properties)


def device_name(device) -> str:
    return device.name or "(no name)"


def print_advertisement(adv) -> None:
    """Dump raw advertising payload.

    Manufacturer data carries a SIG-assigned company ID, which is often the
    only pointer to the OEM behind an unbranded device.
    """
    if adv is None:
        print("    (no advertisement data captured)")
        return

    if adv.local_name:
        print(f"    local_name: {adv.local_name}")
    print(f"    rssi: {adv.rssi}")
    if adv.tx_power is not None:
        print(f"    tx_power: {adv.tx_power}")
    for uuid in adv.service_uuids or []:
        print(f"    service_uuid: {uuid}")
    for uuid, value in (adv.service_data or {}).items():
        print(f"    service_data: {uuid} => {bytes_to_hex(bytes(value))}")
    if adv.manufacturer_data:
        for company_id, value in adv.manufacturer_data.items():
            print(
                f"    manufacturer_data: company_id=0x{company_id:04x} ({company_id}) "
                f"=> {bytes_to_hex(bytes(value))}"
            )
    else:
        print("    manufacturer_data: none")


async def discover_with_adv(timeout: float):
    """Return [(device, adv_or_None)], tolerating older bleak versions."""
    try:
        found = await BleakScanner.discover(timeout=timeout, return_adv=True)
        return [(device, adv) for device, adv in found.values()]
    except TypeError:
        devices = await BleakScanner.discover(timeout=timeout)
        return [(device, None) for device in devices]


async def scan_for_device(name_keyword: str, timeout: float):
    print(f"Scanning for BLE devices for {timeout:g}s...")
    entries = await discover_with_adv(timeout)

    if not entries:
        print("No BLE devices found.")
        return None

    print("\nDiscovered devices:")
    matches = []
    keyword = name_keyword.upper()
    for index, (device, adv) in enumerate(entries, start=1):
        name = device_name(device)
        matched = keyword in name.upper()
        marker = "  <== match" if matched else ""
        print(f"  {index:02d}. {name} | {device.address}{marker}")
        if matched:
            matches.append((device, adv))
            print_advertisement(adv)

    if not matches:
        print(f"\nNo device name matched keyword: {name_keyword!r}")
        return None

    exact = [
        entry for entry in matches if device_name(entry[0]).upper() == "APINK LIGHT STICK"
    ]
    target, _ = exact[0] if exact else matches[0]
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


class NotifyCollector:
    """Buffer notifications so each one can be attributed to a single write."""

    def __init__(self) -> None:
        self.events = []
        self._cursor = 0
        self._subscribed = []

    def _make_handler(self, char):
        def handler(sender, data):
            self.events.append(
                {
                    "time": time.time(),
                    "handle": char.handle,
                    "uuid": char.uuid,
                    "data": bytes(data),
                }
            )

        return handler

    async def start(self, client: BleakClient, chars) -> bool:
        for char in chars:
            try:
                await client.start_notify(char, self._make_handler(char))
                self._subscribed.append(char)
                print(f"  notify on handle={char.handle} uuid={char.uuid}")
            except Exception as error:
                print(f"  notify unavailable handle={char.handle} uuid={char.uuid}: {error}")
        return bool(self._subscribed)

    def drain(self):
        events = self.events[self._cursor :]
        self._cursor = len(self.events)
        return events

    async def stop(self, client: BleakClient) -> None:
        for char in self._subscribed:
            try:
                await client.stop_notify(char)
            except Exception as error:
                print(f"  stop notify failed handle={char.handle}: {error}")
        self._subscribed = []


def resolve_write_char(services, char_spec: str, force: bool, force_ota: bool):
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
    return char


def resolve_write_targets(services, args: argparse.Namespace):
    if not args.sweep_writable:
        return [resolve_write_char(services, args.char, args.force, args.force_ota)]

    targets = []
    for service in services:
        if service.uuid.lower() == CSR_OTA_SERVICE_UUID and not args.force_ota:
            continue
        for char in service.characteristics:
            if is_writable(char.properties):
                targets.append(char)

    if not targets:
        raise RuntimeError("No writable characteristics available to sweep.")
    return targets


def log_write_record(path: Optional[str], char, label: str, data: bytes, error, replies) -> None:
    if not path:
        return

    record = {
        "time": time.time(),
        "handle": char.handle,
        "uuid": char.uuid,
        "label": label,
        "payload": data.hex(),
        "error": error,
        "replies": [
            {"handle": reply["handle"], "uuid": reply["uuid"], "data": reply["data"].hex()}
            for reply in replies
        ],
    }
    with open(path, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(record) + "\n")


async def write_hex_to_char(
    client: BleakClient,
    services,
    char_spec: str,
    hex_value: str,
    response: bool,
    force: bool,
    force_ota: bool,
) -> None:
    char = resolve_write_char(services, char_spec, force, force_ota)
    data = normalize_hex(hex_value)
    use_response = write_with_response(char, response)
    print(
        f"\nWriting to handle={char.handle} uuid={char.uuid}: "
        f"{bytes_to_hex(data)} response={use_response}"
    )
    await client.write_gatt_char(char, data, response=use_response)
    print("Write completed.")


async def run_payloads(
    client: BleakClient,
    char,
    payloads,
    args: argparse.Namespace,
    collector: Optional[NotifyCollector],
) -> None:
    use_response = write_with_response(char, args.response)
    print(
        f"\n=== Target handle={char.handle} uuid={char.uuid} "
        f"props={','.join(char.properties)} response={use_response} ==="
    )

    accepted = []
    rejected = []
    answered = []

    for index, (label, payload) in enumerate(payloads, start=1):
        data = normalize_hex(payload)
        print(f"[{index}/{len(payloads)}] {label}: {bytes_to_hex(data)}")

        if collector:
            collector.drain()

        error_text = None
        try:
            await client.write_gatt_char(char, data, response=use_response)
        except Exception as error:
            error_text = f"{error.__class__.__name__}: {error}"

        replies = []
        if collector and args.reply_wait > 0:
            await asyncio.sleep(args.reply_wait)
            replies = collector.drain()

        if error_text:
            rejected.append((label, error_text))
            print(f"  REJECTED {error_text}")
        else:
            accepted.append(label)
            print("  accepted")

        for reply in replies:
            answered.append((label, reply))
            print(f"  <== handle={reply['handle']} {bytes_to_hex(reply['data'])}")

        log_write_record(args.log, char, label, data, error_text, replies)

        if index < len(payloads):
            if args.step:
                await asyncio.to_thread(input, "  Press Enter for next payload...")
            elif args.sequence_delay > 0:
                await asyncio.sleep(args.sequence_delay)

    print(f"\n--- handle={char.handle} summary ---")
    print(f"  accepted: {len(accepted)}  rejected: {len(rejected)}  replies: {len(answered)}")
    if rejected:
        reasons = collections.Counter(reason for _, reason in rejected)
        for reason, count in reasons.most_common():
            print(f"  {count}x rejected: {reason}")
    if answered:
        print("  payloads that produced a reply:")
        for label, reply in answered:
            print(f"    {label} => handle={reply['handle']} {bytes_to_hex(reply['data'])}")
    elif accepted:
        print("  No replies. Accepted writes were absorbed silently.")


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

    write_modes = [
        bool(args.write_hex),
        bool(args.sequence),
        bool(args.probe),
        args.length_sweep > 0,
        bool(args.header_sweep),
    ]
    if sum(write_modes) > 1:
        print(
            "Use only one of --write-hex, --sequence, --probe, --length-sweep, "
            "or --header-sweep.",
            file=sys.stderr,
        )
        return 2

    if args.char and args.sweep_writable:
        print("Use either --char or --sweep-writable, not both.", file=sys.stderr)
        return 2

    try:
        write_payloads = build_write_payloads(args)
    except ValueError as error:
        print(f"Invalid payload option: {error}", file=sys.stderr)
        return 2

    has_write = bool(write_payloads)
    has_target = bool(args.char) or args.sweep_writable
    if has_target != has_write:
        print(
            "A write target (--char or --sweep-writable) must be paired with a payload "
            "source (--write-hex, --sequence, --probe, --length-sweep, --header-sweep).",
            file=sys.stderr,
        )
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

        collector = None
        if has_write:
            targets = resolve_write_targets(services, args)
            if args.reply_wait > 0:
                notify_chars = get_notify_candidates(services, args.notify_char)
                if notify_chars:
                    collector = NotifyCollector()
                    print("\nSubscribing to notify characteristics to capture replies:")
                    if not await collector.start(client, notify_chars):
                        collector = None

            try:
                for target in targets:
                    await run_payloads(client, target, write_payloads, args, collector)

                if args.monitor > 0 and collector:
                    print(f"\nIdle monitoring for {args.monitor:g}s...")
                    await asyncio.sleep(args.monitor)
                    for event in collector.drain():
                        print(
                            f"  <== handle={event['handle']} {bytes_to_hex(event['data'])}"
                        )
            finally:
                if collector:
                    await collector.stop(client)

        elif args.monitor > 0:
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

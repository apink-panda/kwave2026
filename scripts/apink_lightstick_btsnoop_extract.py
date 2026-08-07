#!/usr/bin/env python3
"""
Extract ATT/GATT writes from an Android btsnoop_hci.log capture.

Use this after controlling the APINK light stick once with an official app.
The useful packets are usually ATT Write Request/Command payloads sent to the
same handles seen in apink_lightstick_probe.py, such as 28 or 42.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import struct
import sys
from pathlib import Path
from typing import Iterable, Optional


BTSNOOP_MAGIC = b"btsnoop\0"
BTSNOOP_UNIX_EPOCH_DELTA_US = 0x00DCDDB30F2F8000
ATT_CID = 0x0004

ATT_OPS = {
    0x01: "Error Response",
    0x02: "Exchange MTU Request",
    0x03: "Exchange MTU Response",
    0x08: "Read By Type Request",
    0x09: "Read By Type Response",
    0x0A: "Read Request",
    0x0B: "Read Response",
    0x0C: "Read Blob Request",
    0x0D: "Read Blob Response",
    0x12: "Write Request",
    0x13: "Write Response",
    0x16: "Prepare Write Request",
    0x17: "Prepare Write Response",
    0x18: "Execute Write Request",
    0x19: "Execute Write Response",
    0x1B: "Handle Value Notification",
    0x1D: "Handle Value Indication",
    0x1E: "Handle Value Confirmation",
    0x52: "Write Command",
}

HANDLE_AT_OFFSET_1 = {
    0x0A,
    0x0C,
    0x12,
    0x16,
    0x17,
    0x1B,
    0x1D,
    0x52,
}

WRITE_OPS = {0x12, 0x16, 0x52}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract BLE ATT writes/notifications from btsnoop_hci.log."
    )
    parser.add_argument("capture", help="Path to Android btsnoop_hci.log")
    parser.add_argument(
        "--handles",
        default="28,42,45",
        help="Comma-separated ATT handles to show. Use decimal or 0xhex. Default: 28,42,45",
    )
    parser.add_argument(
        "--all-att",
        action="store_true",
        help="Show every ATT packet instead of only --handles.",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Only print repeated write payload summaries.",
    )
    return parser.parse_args()


def parse_handle_list(value: str) -> set[int]:
    handles = set()
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        base = 16 if item.lower().startswith("0x") else 10
        handles.add(int(item, base))
    return handles


def hex_bytes(value: bytes) -> str:
    return value.hex(" ")


def timestamp_to_datetime(value_us: int) -> Optional[dt.datetime]:
    unix_us = value_us - BTSNOOP_UNIX_EPOCH_DELTA_US
    if unix_us < 0:
        return None
    try:
        return dt.datetime.fromtimestamp(unix_us / 1_000_000, tz=dt.timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def read_btsnoop_records(path: Path):
    with path.open("rb") as capture:
        header = capture.read(16)
        if len(header) != 16 or not header.startswith(BTSNOOP_MAGIC):
            raise ValueError("not a btsnoop file: missing btsnoop header")

        version, datalink = struct.unpack(">II", header[8:16])
        yield {"header": True, "version": version, "datalink": datalink}

        index = 0
        while True:
            record_header = capture.read(24)
            if not record_header:
                break
            if len(record_header) != 24:
                raise ValueError("truncated btsnoop record header")

            original_len, included_len, flags, drops, timestamp_us = struct.unpack(
                ">IIIIQ", record_header
            )
            packet = capture.read(included_len)
            if len(packet) != included_len:
                raise ValueError("truncated btsnoop packet data")

            index += 1
            yield {
                "header": False,
                "index": index,
                "original_len": original_len,
                "included_len": included_len,
                "flags": flags,
                "drops": drops,
                "timestamp_us": timestamp_us,
                "packet": packet,
            }


def acl_payload_candidates(packet: bytes) -> Iterable[tuple[str, bytes]]:
    if len(packet) >= 5 and packet[0] == 0x02:
        yield "hci-acl", packet[1:]
    if len(packet) >= 4:
        yield "raw-acl", packet


def parse_acl_att(acl_packet: bytes) -> Optional[dict]:
    if len(acl_packet) < 8:
        return None

    handle_pb_bc, data_len = struct.unpack_from("<HH", acl_packet, 0)
    l2cap_packet = acl_packet[4 : 4 + data_len]
    if len(l2cap_packet) < 5:
        return None

    l2cap_len, cid = struct.unpack_from("<HH", l2cap_packet, 0)
    if cid != ATT_CID:
        return None

    att = l2cap_packet[4 : 4 + l2cap_len]
    if not att:
        return None

    connection_handle = handle_pb_bc & 0x0FFF
    packet_boundary = (handle_pb_bc >> 12) & 0x03
    broadcast = (handle_pb_bc >> 14) & 0x03
    return {
        "connection_handle": connection_handle,
        "packet_boundary": packet_boundary,
        "broadcast": broadcast,
        "att": att,
    }


def parse_att(att: bytes) -> dict:
    opcode = att[0]
    handle = None
    value = b""

    if opcode in HANDLE_AT_OFFSET_1 and len(att) >= 3:
        handle = struct.unpack_from("<H", att, 1)[0]
        value = att[3:]
        if opcode in {0x16, 0x17} and len(att) >= 5:
            value = att[5:]
    elif opcode == 0x01 and len(att) >= 5:
        handle = struct.unpack_from("<H", att, 2)[0]
        value = att[4:]
    elif len(att) > 1:
        value = att[1:]

    return {
        "opcode": opcode,
        "name": ATT_OPS.get(opcode, f"Unknown 0x{opcode:02x}"),
        "handle": handle,
        "value": value,
        "raw": att,
    }


def iter_att_packets(path: Path):
    records = read_btsnoop_records(path)
    header = next(records)
    yield header

    for record in records:
        packet = record["packet"]
        for packet_kind, acl_packet in acl_payload_candidates(packet):
            acl = parse_acl_att(acl_packet)
            if not acl:
                continue
            att = parse_att(acl["att"])
            yield {
                "header": False,
                "index": record["index"],
                "flags": record["flags"],
                "timestamp_us": record["timestamp_us"],
                "packet_kind": packet_kind,
                **acl,
                **att,
            }
            break


def print_packet(packet: dict) -> None:
    timestamp = timestamp_to_datetime(packet["timestamp_us"])
    timestamp_text = timestamp.isoformat(timespec="milliseconds") if timestamp else "unknown-time"
    handle_text = "-" if packet["handle"] is None else str(packet["handle"])
    print(
        f"#{packet['index']:06d} {timestamp_text} flags=0x{packet['flags']:08x} "
        f"{packet['packet_kind']} conn={packet['connection_handle']} "
        f"op=0x{packet['opcode']:02x} {packet['name']} handle={handle_text} "
        f"value={hex_bytes(packet['value']) or '-'} raw={hex_bytes(packet['raw'])}"
    )


def main() -> int:
    args = parse_args()
    capture_path = Path(args.capture).expanduser()
    handles = parse_handle_list(args.handles)
    write_counts = collections.Counter()
    att_count = 0
    shown_count = 0

    try:
        packets = iter_att_packets(capture_path)
        header = next(packets)
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(
        f"btsnoop version={header['version']} datalink={header['datalink']} "
        f"capture={capture_path}"
    )
    print(f"filter handles={','.join(str(handle) for handle in sorted(handles))}")

    for packet in packets:
        att_count += 1
        handle = packet["handle"]
        value = packet["value"]
        opcode = packet["opcode"]

        if opcode in WRITE_OPS and handle is not None and value:
            write_counts[(handle, opcode, value)] += 1

        should_show = args.all_att or (handle in handles)
        if should_show and not args.summary_only:
            shown_count += 1
            print_packet(packet)

    print(f"\nATT packets found: {att_count}")
    if not args.summary_only:
        print(f"Packets shown: {shown_count}")

    print("\nWrite payload summary:")
    filtered_counts = [
        ((handle, opcode, value), count)
        for (handle, opcode, value), count in write_counts.most_common()
        if args.all_att or handle in handles
    ]
    if not filtered_counts:
        print("  No matching ATT writes found. Try --all-att or adjust --handles.")
    else:
        for (handle, opcode, value), count in filtered_counts:
            print(
                f"  {count}x handle={handle} op=0x{opcode:02x} "
                f"{ATT_OPS.get(opcode, 'Write')} value={hex_bytes(value)}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

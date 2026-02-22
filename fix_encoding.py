filepath = r'c:\Users\monty\Desktop\Azure Pricing Calc\frontend\src\pages\VmComparisonPage.jsx'

with open(filepath, 'rb') as f:
    raw = bytearray(f.read())

replacements = {
    # 5-byte double-encoded en-dash: C3 A2 E2 80 93  → ' - ' (space hyphen space)
    bytes([0xC3, 0xA2, 0xE2, 0x80, 0x93]): b' - ',
    # 5-byte double-encoded em-dash: C3 A2 E2 80 94  → ' - '
    bytes([0xC3, 0xA2, 0xE2, 0x80, 0x94]): b' - ',
    # 5-byte variant with 0x9C / 0x9D (curly quotes)
    bytes([0xC3, 0xA2, 0xE2, 0x80, 0x9C]): b'"',
    bytes([0xC3, 0xA2, 0xE2, 0x80, 0x9D]): b'"',
    # 5-byte variant with 0x99 (right single quote)
    bytes([0xC3, 0xA2, 0xE2, 0x80, 0x99]): b"'",
    # 4-byte with C2 B7 (middle dot Â·)
    bytes([0xC3, 0x82, 0xC2, 0xB7]):        b'.',
}

result = bytes(raw)
total = 0
for bad, good in replacements.items():
    count = result.count(bad)
    if count:
        result = result.replace(bad, good)
        print(f"Replaced {count}x {bad.hex()} -> {good!r}")
        total += count

with open(filepath, 'wb') as f:
    f.write(result)

print(f"\nDone! Total replacements: {total}")
print(f"New file size: {len(result)} bytes")

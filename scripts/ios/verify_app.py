"""Inspect a real device .app before packaging; uses only Python's standard library."""
from __future__ import annotations

import hashlib
import os
import plistlib
import struct
from pathlib import Path
from zipfile import ZipFile


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def inspect_macho(data: bytes) -> list[dict]:
    """Read each Mach-O slice, including platform and linked library load commands.

    ARM64 alone is insufficient: Apple Silicon simulators also use ARM64.
    LC_BUILD_VERSION platform 2 is iOS; platform 7 is iOS Simulator.
    """
    require(len(data) >= 8, "Truncated Mach-O")
    if data[:4] in (b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf"):
        fat64 = data[:4] == b"\xca\xfe\xba\xbf"
        count = struct.unpack_from(">I", data, 4)[0]
        require(0 < count <= 32, "Invalid universal binary slice count")
        stride = 32 if fat64 else 20
        slices = []
        for index in range(count):
            pos = 8 + index * stride
            require(pos + stride <= len(data), "Truncated universal binary table")
            offset, size = struct.unpack_from(">QQ" if fat64 else ">II", data, pos + 8)
            require(size > 0 and offset + size <= len(data), "Invalid Mach-O slice")
            slices.extend(inspect_macho(data[offset:offset + size]))
        return slices
    require(data[:4] == b"\xcf\xfa\xed\xfe", "Expected a 64-bit little-endian Mach-O")
    require(len(data) >= 32, "Truncated Mach-O header")
    _, cpu, _, filetype, count, size, _, _ = struct.unpack_from("<8I", data)
    require(32 + size <= len(data), "Truncated Mach-O load commands")
    platform = None
    dependencies = []
    has_signature = False
    pos = 32
    for _ in range(count):
        require(pos + 8 <= 32 + size, "Invalid Mach-O command header")
        command, length = struct.unpack_from("<II", data, pos)
        require(length >= 8 and pos + length <= 32 + size, "Invalid Mach-O command length")
        if command == 0x32:
            require(length >= 24, "Invalid LC_BUILD_VERSION")
            platform = struct.unpack_from("<I", data, pos + 8)[0]
        elif command == 0x25 and platform is None:
            platform = 2  # Legacy LC_VERSION_MIN_IPHONEOS, ARM64 devices only below.
        elif command in (0xC, 0x80000018, 0x8000001F, 0x80000023, 0x20):
            require(length >= 24, "Invalid dylib load command")
            offset = struct.unpack_from("<I", data, pos + 8)[0]
            require(24 <= offset < length, "Invalid dylib name offset")
            dependencies.append(data[pos + offset:pos + length].split(b"\0", 1)[0].decode())
        elif command == 0x1D:
            has_signature = True
        elif command in (0x21, 0x2C):
            require(length >= 20, "Invalid encryption command")
            require(struct.unpack_from("<I", data, pos + 16)[0] == 0, "Encrypted App Store binary")
        pos += length
    require(pos == 32 + size, "Inconsistent Mach-O command count")
    require(cpu == 0x0100000C, "Only ARM64 iPhone device binaries are accepted")
    require(platform == 2, f"Not an iOS device binary (platform={platform}; simulator=7)")
    return [{"architecture": "arm64", "platform": "iOS", "filetype": filetype,
             "dependencies": dependencies, "hasCodeSignature": has_signature}]


def check_entitlements(entitlements: dict, source: str) -> None:
    # Signing identity keys are supplied later by Sideloadly. Everything else needs
    # an explicit capability review rather than silently removing app functionality.
    basic = {"application-identifier", "com.apple.developer.team-identifier", "get-task-allow"}
    extra = sorted(set(entitlements) - basic)
    require(not extra, f"{source}: review capabilities for a free Apple ID first: {extra}")


def validate_app(app: Path, bundle_id: str) -> dict:
    require(app.is_dir() and app.suffix == ".app", "Missing .app directory")
    info_path = app / "Info.plist"
    require(info_path.is_file(), "Missing Info.plist")
    info = plistlib.loads(info_path.read_bytes())
    require(info.get("CFBundleIdentifier") == bundle_id, "Unexpected Bundle Identifier")
    require(info.get("CFBundlePackageType") == "APPL", "Not an application bundle")
    require(info.get("CFBundleSupportedPlatforms") == ["iPhoneOS"], "Simulator/unsupported Info.plist platform")
    require(str(info.get("DTPlatformName", "")).lower() == "iphoneos", "DTPlatformName is not iphoneos")
    require(info.get("NSMicrophoneUsageDescription"), "Microphone permission description missing")
    require(not list(app.rglob("embedded.mobileprovision")), "Provisioning profile must not be shipped")
    require(not list(app.glob("PlugIns/*.appex")), "App extensions require a separate signing/capability review")
    executable_name = info.get("CFBundleExecutable", "")
    require(executable_name and Path(executable_name).name == executable_name, "Invalid executable name")
    executable = app / executable_name
    require(executable.is_file(), "Main executable missing")
    if os.name != "nt":
        require(executable.stat().st_mode & 0o111, "Main binary has no executable permissions")
    binary_paths = [executable]
    for framework in (app / "Frameworks").glob("*.framework"):
        binary = framework / framework.stem
        require(binary.is_file(), f"Framework executable missing: {framework.name}")
        binary_paths.append(binary)
    binary_paths.extend((app / "Frameworks").glob("*.dylib"))
    binaries = {}
    for binary in binary_paths:
        slices = inspect_macho(binary.read_bytes())
        require(all(not s["hasCodeSignature"] for s in slices), f"Signature still present: {binary.name}")
        if binary == executable:
            require(all(s["filetype"] == 2 for s in slices), "Main binary is not MH_EXECUTE")
        for item in slices:
            for dependency in item["dependencies"]:
                if dependency.startswith("@rpath/"):
                    relative = dependency[len("@rpath/"):]
                    # Swift runtime dylibs can be supplied by supported iOS versions.
                    if relative.startswith("libswift") and relative.endswith(".dylib"):
                        continue
                    require((app / "Frameworks" / relative).is_file(),
                            f"Missing embedded native dependency: {dependency}")
        binaries[binary.relative_to(app).as_posix()] = slices
    main_bundle = app / "main.jsbundle"
    require(main_bundle.is_file() and main_bundle.stat().st_size > 1024,
            "Missing/nonfunctional Release React Native JS bundle (Metro must not be required)")
    bundles = [main_bundle]
    return {"bundleIdentifier": bundle_id, "app": app.name, "platform": "iphoneos",
            "signed": False, "minimumOSVersion": info.get("MinimumOSVersion"),
            "microphonePermission": info["NSMicrophoneUsageDescription"], "binaries": binaries,
            "javascriptBundles": [{"path": p.relative_to(app).as_posix(), "bytes": p.stat().st_size,
                                   "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in bundles]}


def validate_ipa(ipa: Path, app: Path) -> None:
    prefix = f"Payload/{app.name}/"
    with ZipFile(ipa) as archive:
        require(archive.testzip() is None, "Corrupt IPA zip")
        names = archive.namelist()
        require(names and all(n.startswith("Payload/") for n in names), "IPA must contain Payload only")
        require(prefix + "Info.plist" in names, "IPA is missing Payload/App.app/Info.plist")
        for path in app.rglob("*"):
            if path.is_file() and not path.is_symlink():
                archived = prefix + path.relative_to(app).as_posix()
                require(archived in names, f"File missing from IPA: {archived}")
                require(archive.read(archived) == path.read_bytes(), f"IPA content mismatch: {archived}")
                if os.name != "nt" and path.stat().st_mode & 0o111:
                    require((archive.getinfo(archived).external_attr >> 16) & 0o111,
                            f"Executable permissions lost from IPA: {archived}")

"""Synthetic binary fixtures test rejection rules; these are NOT build artifacts."""
import plistlib
import struct
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from verify_app import check_entitlements, inspect_macho, validate_app, validate_ipa


def macho(platform=2, cpu=0x0100000C, dependency=None):
    commands = struct.pack("<6I", 0x32, 24, platform, 0, 0, 0)
    count = 1
    if dependency:
        name = dependency.encode() + b"\0"
        size = (24 + len(name) + 7) & ~7
        commands += struct.pack("<6I", 0xC, size, 24, 0, 0, 0) + name + b"\0" * (size - 24 - len(name))
        count += 1
    return struct.pack("<8I", 0xFEEDFACF, cpu, 0, 2, count, len(commands), 0, 0) + commands


class ValidationTests(unittest.TestCase):
    def test_device_arm64(self):
        self.assertEqual(inspect_macho(macho())[0]["platform"], "iOS")

    def test_arm64_simulator_rejected(self):
        with self.assertRaisesRegex(ValueError, "Not an iOS device"):
            inspect_macho(macho(platform=7))

    def test_x86_simulator_rejected(self):
        with self.assertRaisesRegex(ValueError, "ARM64"):
            inspect_macho(macho(platform=7, cpu=0x01000007))

    def test_truncated_binary_rejected(self):
        with self.assertRaises(ValueError):
            inspect_macho(macho()[:-1])

    def test_universal_binary_with_simulator_slice_rejected(self):
        device, simulator = macho(), macho(platform=7)
        offset = 8 + 2 * 20
        header = struct.pack(">2I", 0xCAFEBABE, 2)
        header += struct.pack(">5I", 0x0100000C, 0, offset, len(device), 0)
        header += struct.pack(">5I", 0x0100000C, 0, offset + len(device), len(simulator), 0)
        with self.assertRaisesRegex(ValueError, "Not an iOS device"):
            inspect_macho(header + device + simulator)

    def test_unsupported_entitlements_not_silently_removed(self):
        for key in ("aps-environment", "com.apple.security.application-groups",
                    "com.apple.developer.icloud-container-identifiers", "keychain-access-groups"):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "review capabilities"):
                check_entitlements({key: "example"}, "fixture")
        check_entitlements({}, "fixture")

    def make_app(self, root, dependency=None):
        app = root / "Fixture.app"
        app.mkdir()
        (app / "Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": "fixture.app",
            "CFBundleExecutable": "Fixture", "CFBundlePackageType": "APPL",
            "CFBundleSupportedPlatforms": ["iPhoneOS"], "DTPlatformName": "iphoneos",
            "NSMicrophoneUsageDescription": "Record own voice", "MinimumOSVersion": "16.4"}))
        (app / "Fixture").write_bytes(macho(dependency=dependency))
        (app / "Fixture").chmod(0o755)
        (app / "main.jsbundle").write_bytes(b"synthetic test data, not JavaScript or an IPA" * 100)
        return app

    def test_missing_js_bundle_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            app = self.make_app(Path(folder))
            (app / "main.jsbundle").unlink()
            with self.assertRaisesRegex(ValueError, "JS bundle"):
                validate_app(app, "fixture.app")

    def test_missing_framework_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            app = self.make_app(Path(folder), "@rpath/hermes.framework/hermes")
            with self.assertRaisesRegex(ValueError, "Missing embedded native"):
                validate_app(app, "fixture.app")

    def test_static_native_linking_does_not_require_fake_frameworks(self):
        with tempfile.TemporaryDirectory() as folder:
            report = validate_app(self.make_app(Path(folder)), "fixture.app")
            self.assertFalse(report["signed"])

    def test_required_framework_is_checked_when_embedded(self):
        with tempfile.TemporaryDirectory() as folder:
            app = self.make_app(Path(folder), "@rpath/hermes.framework/hermes")
            framework = app / "Frameworks" / "hermes.framework"
            framework.mkdir(parents=True)
            (framework / "hermes").write_bytes(macho(platform=7))
            with self.assertRaisesRegex(ValueError, "Not an iOS device"):
                validate_app(app, "fixture.app")
            (framework / "hermes").write_bytes(macho())
            self.assertIn("Frameworks/hermes.framework/hermes", validate_app(app, "fixture.app")["binaries"])

    def test_bundle_identity_and_platform_cannot_be_spoofed_by_folder_name(self):
        with tempfile.TemporaryDirectory() as folder:
            app = self.make_app(Path(folder))
            with self.assertRaisesRegex(ValueError, "Bundle Identifier"):
                validate_app(app, "unexpected.app")
            info = plistlib.loads((app / "Info.plist").read_bytes())
            info["CFBundleSupportedPlatforms"] = ["iPhoneSimulator"]
            (app / "Info.plist").write_bytes(plistlib.dumps(info))
            with self.assertRaisesRegex(ValueError, "Info.plist platform"):
                validate_app(app, "fixture.app")

    def test_wrong_payload_and_corrupt_content_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            app = self.make_app(root)
            archive = root / "fixture.zip"  # Deliberately never name a fixture .ipa.
            with ZipFile(archive, "w") as output:
                output.write(app / "Info.plist", "Wrong/Fixture.app/Info.plist")
            with self.assertRaisesRegex(ValueError, "Payload only"):
                validate_ipa(archive, app)
            with ZipFile(archive, "w") as output:
                for path in app.iterdir():
                    output.writestr("Payload/Fixture.app/" + path.name, b"corrupted")
            with self.assertRaisesRegex(ValueError, "content mismatch"):
                validate_ipa(archive, app)


if __name__ == "__main__":
    unittest.main()

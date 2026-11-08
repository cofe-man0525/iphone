"""macOS-only, account-free Expo -> iphoneos Release -> unsigned IPA pipeline."""
from __future__ import annotations

import hashlib
import json
import os
import plistlib
import shlex
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from verify_app import check_entitlements, inspect_macho, require, validate_app, validate_ipa

ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile"
OUT = ROOT / ".runtime" / "ios-ci"
LOGS = OUT / "logs"
ARTIFACTS = OUT / "artifacts"
SIGNING = ["CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "CODE_SIGN_IDENTITY=", "DEVELOPMENT_TEAM="]


def run(args: list[str], cwd: Path = MOBILE, capture: bool = False) -> str:
    label = args[0].replace("/", "_")
    print(f"::group::{shlex.join(args)}", flush=True)
    log = LOGS / f"{len(list(LOGS.glob('*.log'))):02d}-{label}.log"
    lines = []
    with log.open("w", encoding="utf-8") as handle:
        with subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE,
                              stderr=None if capture else subprocess.STDOUT,
                              text=True, encoding="utf-8", errors="replace") as process:
            for line in process.stdout:
                handle.write(line)
                if capture:
                    lines.append(line)
                else:
                    print(line, end="", flush=True)
            code = process.wait()
    print("::endgroup::", flush=True)
    require(code == 0, f"Command failed ({code}); see {log.name}: {shlex.join(args)}")
    return "".join(lines)


def choose_scheme(workspace: Path, bundle_id: str) -> str:
    options = ["xcodebuild", "-workspace", str(workspace)]
    listing = json.loads(run(options + ["-list", "-json"], capture=True))
    schemes = listing.get("workspace", {}).get("schemes", [])
    # Restrict discovery to shared application schemes, not the many Pod schemes.
    scheme_files = list(workspace.parent.glob("*.xcodeproj/xcshareddata/xcschemes/*.xcscheme"))
    scheme_files += list(workspace.glob("xcshareddata/xcschemes/*.xcscheme"))
    app_schemes = {path.stem for path in scheme_files
                   if any(ref.get("BuildableName", "").endswith(".app")
                          for ref in ET.parse(path).iter("BuildableReference"))}
    schemes = [scheme for scheme in schemes if scheme in app_schemes]
    require(schemes, "No shared application scheme. Share the iOS app scheme before building.")
    preferred = os.environ.get("IOS_SCHEME")
    if preferred:
        require(preferred in schemes, f"IOS_SCHEME not found: {preferred}")
        schemes = [preferred]
    candidates = []
    for scheme in schemes:
        # Pod schemes are often exposed by -list too; an app has a matching
        # application target and bundle ID. Do not guess from the Chinese app name.
        settings = json.loads(run(options + ["-scheme", scheme, "-configuration", "Release",
            "-sdk", "iphoneos", "-destination", "generic/platform=iOS", "-showBuildSettings", "-json"]
            + SIGNING, capture=True))
        if any(item.get("buildSettings", {}).get("PRODUCT_BUNDLE_IDENTIFIER") == bundle_id
               and item.get("buildSettings", {}).get("PRODUCT_TYPE") == "com.apple.product-type.application"
               for item in settings):
            candidates.append(scheme)
    require(len(candidates) == 1, f"Expected one app scheme for {bundle_id}; found {candidates}. Set IOS_SCHEME if ambiguous.")
    return candidates[0]


def main() -> None:
    require(sys.platform == "darwin", "Run native builds on the GitHub macOS runner, not Windows or Simulator.")
    LOGS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    require(not list(ARTIFACTS.glob("*.ipa")), "Use a fresh CI workspace; stale IPA artifacts exist.")
    config = json.loads(run(["npx", "--no-install", "expo", "config", "--type", "public", "--json"], capture=True))
    require(config.get("owner") == "shandexindevelopapp", "Expo owner changed")
    require(config.get("slug") == "ai-voice-changer", "Expo slug changed")
    require(config.get("extra", {}).get("eas", {}).get("projectId") == "cd4cfc12-db9c-4f1f-99b1-746f5c958901", "Expo project ID changed")
    bundle_id = config.get("ios", {}).get("bundleIdentifier")
    require(bundle_id == "dev.personal.aivoice", "Existing iOS Bundle Identifier changed")
    check_entitlements(config.get("ios", {}).get("entitlements", {}), "Expo config")
    ios = MOBILE / "ios"
    native_existed = ios.exists()
    if native_existed:
        require((ios / "Podfile").is_file() and list(ios.glob("*.xcodeproj")),
                "Existing ios/ is incomplete; refusing to overwrite it.")
        print("Existing native iOS directory detected: preserving it, skipping Expo Prebuild.")
    else:
        # No --clean; never overwrite hand-maintained native changes.
        run(["npx", "--no-install", "expo", "prebuild", "--platform", "ios", "--no-install", "--npm"])
    entitlement_report = {}
    for path in ios.rglob("*.entitlements"):
        if "Pods" in path.relative_to(ios).parts or "build" in path.relative_to(ios).parts:
            continue
        contents = plistlib.loads(path.read_bytes())
        check_entitlements(contents, path.name)
        entitlement_report[path.relative_to(ios).as_posix()] = contents
    # Respect a hand-maintained Podfile.lock instead of silently resolving a new graph.
    pod_command = ["pod", "install"]
    if (ios / "Podfile.lock").exists():
        pod_command.append("--deployment")
    run(pod_command, cwd=ios)
    workspaces = list(ios.glob("*.xcworkspace"))
    require(len(workspaces) == 1, f"Expected one app .xcworkspace, found {workspaces}")
    workspace = workspaces[0]
    scheme = choose_scheme(workspace, bundle_id)
    archive = OUT / "AI-Voice-Changer.xcarchive"
    run(["xcodebuild", "-workspace", str(workspace), "-scheme", scheme,
         "-configuration", "Release", "-sdk", "iphoneos", "-destination", "generic/platform=iOS",
         "-archivePath", str(archive), "-derivedDataPath", str(OUT / "DerivedData"),
         "archive"] + SIGNING)
    apps = list((archive / "Products" / "Applications").glob("*.app"))
    matching = [app for app in apps if plistlib.loads((app / "Info.plist").read_bytes()).get("CFBundleIdentifier") == bundle_id]
    require(len(matching) == 1, f"Could not locate the archived device app for {bundle_id}: {apps}")
    archived_app = matching[0]
    payload = OUT / "package" / "Payload"
    payload.mkdir(parents=True, exist_ok=True)
    app = payload / archived_app.name
    run(["ditto", str(archived_app), str(app)], cwd=ROOT)
    # Vendored frameworks may already contain an ad-hoc/vendor signature, even
    # with signing disabled. Strip signatures only from the CI packaging copy.
    info = plistlib.loads((app / "Info.plist").read_bytes())
    binaries = [app / info["CFBundleExecutable"]]
    binaries += [p / p.stem for p in (app / "Frameworks").glob("*.framework")]
    binaries += list((app / "Frameworks").glob("*.dylib"))
    for binary in binaries:
        if any(s["hasCodeSignature"] for s in inspect_macho(binary.read_bytes())):
            sign_target = app if binary == binaries[0] else (
                binary.parent if binary.parent.suffix == ".framework" else binary)
            run(["codesign", "--remove-signature", str(sign_target)], cwd=ROOT)
    report = validate_app(app, bundle_id)
    report.update({"nativeDirectoryPreserved": native_existed, "scheme": scheme,
                   "entitlements": entitlement_report, "xcode": run(["xcodebuild", "-version"], capture=True).strip(),
                   "sdk": run(["xcrun", "--sdk", "iphoneos", "--show-sdk-version"], capture=True).strip(),
                   "commit": os.environ.get("GITHUB_SHA"), "installationTested": False,
                   "signing": "Unsigned; re-sign locally with Sideloadly"})
    ipa = ARTIFACTS / "AI-Voice-Changer-unsigned-iphoneos.ipa"
    # ditto preserves executable modes and framework symlinks. No exportArchive:
    # exporting a signed archive would require Apple signing/provisioning assets.
    run(["ditto", "-c", "-k", "--keepParent", "--norsrc", "--noextattr", str(payload), str(ipa)], cwd=ROOT)
    validate_ipa(ipa, app)
    digest = hashlib.sha256(ipa.read_bytes()).hexdigest()
    report.update({"ipaSha256": digest, "ipaBytes": ipa.stat().st_size, "archiveContentVerified": True})
    (ARTIFACTS / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (ARTIFACTS / "SHA256SUMS.txt").write_text(f"{digest}  {ipa.name}\n", encoding="utf-8")
    print(f"Validated unsigned iPhone IPA: {ipa}")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as handle:
            handle.write(f"### Unsigned device IPA\n\n- `{ipa.name}`\n- Scheme: `{scheme}`\n"
                         f"- Bundle ID: `{bundle_id}`\n- ARM64 / iOS device and embedded JS bundle verified.\n"
                         "- Re-sign in Windows Sideloadly. Device installation remains untested.\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f"::error::{error}", file=sys.stderr)
        sys.exit(1)

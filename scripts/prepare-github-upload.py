"""Create a small, reviewable mobile-only GitHub source copy; never copy secrets/data.

The original mobile/.git is preserved. The new copy is intentionally NOT a Git repo.
Run `python scripts/prepare-github-upload.py` from the project root on Windows.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".expo", "node_modules", "dist", "web-build", ".claude", ".idea",
             ".vscode", "__pycache__", "build", "Pods", "DerivedData", ".runtime"}
DENY_SUFFIXES = {".pt", ".pth", ".bin", ".onnx", ".safetensors", ".ckpt", ".whl",
                 ".wav", ".m4a", ".mp3", ".aac", ".ogg", ".flac", ".mp4", ".mov",
                 ".ipa", ".apk", ".log", ".p8", ".p12", ".pfx", ".key", ".pem",
                 ".cer", ".mobileprovision", ".provisionprofile", ".jks", ".keystore",
                 ".sqlite", ".db", ".zip", ".7z", ".bak"}
MOBILE_FILES = {"package.json", "package-lock.json", "app.json", "app.config.ts", "app.config.js",
                "eas.json", "tsconfig.json", "babel.config.js", "metro.config.js", ".gitignore",
                ".easignore", ".env.example", "LICENSE", "AGENTS.md", "expo-env.d.ts"}


def allowed(path: Path) -> bool:
    return not ((path.name.startswith(".env") and path.name != ".env.example")
                or path.name == ".npmrc" or path.name.startswith("credentials")
                or path.suffix.lower() in DENY_SUFFIXES or path.name in {".DS_Store", "id_rsa", "id_ed25519"})


def source_files():
    # Only build inputs: no backend runtime, voice references, recordings or models.
    directories = [ROOT / ".github", ROOT / "scripts" / "ios", ROOT / "docs"]
    directories += [ROOT / "mobile" / name for name in ("app", "src", "assets", "scripts", "tests")]
    # A future hand-maintained native project is copied, with Pods/build outputs excluded.
    if (ROOT / "mobile" / "ios").exists():
        directories.append(ROOT / "mobile" / "ios")
    for directory in directories:
        for folder, children, files in os.walk(directory, followlinks=False):
            children[:] = [name for name in children if name not in SKIP_DIRS
                           and not (Path(folder) / name).is_symlink()]
            for name in files:
                path = Path(folder) / name
                if allowed(path) and not path.is_symlink():
                    yield path
    for name in MOBILE_FILES:
        path = ROOT / "mobile" / name
        if path.is_file():
            yield path
    for relative in (".gitignore", "scripts/prepare-github-upload.py"):
        yield ROOT / relative


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    destination = ROOT / ".runtime" / ("github-upload-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    # Each run creates a NEW folder; never delete or overwrite a user's Git repo.
    destination.mkdir(parents=True, exist_ok=False)
    manifest = []
    for source in sorted(set(source_files())):
        relative = source.relative_to(ROOT)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Copy verification failed: {relative}")
        manifest.append({"path": relative.as_posix(), "bytes": target.stat().st_size, "sha256": digest})
    (destination / "README.md").write_text(
        "# AI Voice Changer — iOS build sources\n\n"
        "React Native + Expo mobile source snapshot for an unsigned **iphoneos Release** IPA.\n\n"
        "See [Windows / GitHub Actions / Sideloadly guide](docs/ios-install.md). "
        "Workflow: **iOS Unsigned IPA (Sideloadly)**. No Apple or Expo secrets required.\n\n"
        "This copy excludes the backend, models, voice recordings, credentials and dependencies. "
        "The installed app still requires your separately running HTTPS backend for AI conversion. "
        "Backend sources remain in the original AIVoice project.\n",
        encoding="utf-8")
    (destination / "SOURCE-MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Verified {len(manifest)} files ({sum(item['bytes'] for item in manifest):,} bytes).")
    print(f"Upload THIS folder as the GitHub repository root:\n{destination}")
    print("Review files before publishing. No source files or Git histories were removed.")


if __name__ == "__main__":
    main()

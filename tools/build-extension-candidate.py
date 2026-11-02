#!/usr/bin/env python3
"""Build a deterministic INTERNAL BGCT MV3 candidate ZIP. Never publishes or installs."""
import argparse
import hashlib
import json
import os
import stat
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "extension-candidate"
INTERNAL_VERSION = "0.6.1-INTERNAL-CANDIDATE-DO-NOT-PUBLISH"
FIXED_DATE = (1980, 1, 1, 0, 0, 0)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_files():
    if not SOURCE.is_dir():
        raise ValueError("Candidate source directory is missing")
    files = []
    for entry in SOURCE.rglob("*"):
        if entry.is_symlink():
            raise ValueError(f"Symlinks are not allowed in MV3 candidate: {entry}")
        if entry.is_file():
            if not stat.S_ISREG(entry.stat().st_mode):
                raise ValueError(f"Non-regular file: {entry}")
            relative = entry.relative_to(SOURCE).as_posix()
            if relative.startswith("/") or "/../" in f"/{relative}/":
                raise ValueError(f"Unsafe path: {relative}")
            files.append((relative, entry))
    files.sort(key=lambda item: item[0])
    return files


def build(output: Path) -> dict:
    items = source_files()
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("manifest_version") != 3 or manifest.get("version_name") != INTERNAL_VERSION:
        raise ValueError("Refusing to package a non-internal or non-MV3 manifest")
    if "manifest.json" not in (name for name, _ in items):
        raise ValueError("MV3 manifest missing at package root")
    output.parent.mkdir(parents=True, exist_ok=True)
    records = []
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=9, strict_timestamps=True) as archive:
        for name, path in items:
            payload = path.read_bytes()
            info = zipfile.ZipInfo(name, date_time=FIXED_DATE)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED,
                             compresslevel=9)
            records.append({"path": name, "size": len(payload), "sha256": digest(payload)})
    package_sha = digest(output.read_bytes())
    receipt = {
        "artifact": "BGCT INTERNAL MV3 CANDIDATE — NOT A RELEASE",
        "version": manifest["version"],
        "version_name": manifest["version_name"],
        "commit": os.getenv("GITHUB_SHA", "local-unverified"),
        "sha256": package_sha,
        "entries": records,
        "entry_count": len(records),
        "bytes": output.stat().st_size,
        "validation_scope": "archive contents and reproducible build only; real Udemy and native model unverified",
    }
    output.with_suffix(".sha256").write_text(
        f"{package_sha}  {output.name}\n", encoding="ascii")
    output.with_suffix(".receipt.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8")
    print(f"BGCT INTERNAL CANDIDATE ZIP BUILT: {output.name}, files={len(records)}, sha256={package_sha}")
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path,
                        default=ROOT / "dist" / "bgct-internal-candidate-0.6.1.zip")
    args = parser.parse_args()
    build(args.output.resolve())


if __name__ == "__main__":
    main()

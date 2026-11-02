#!/usr/bin/env python3
"""Reject unsafe or nonreproducible BGCT internal candidate packages."""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "extension-candidate"
EXPECTED_VERSION = "0.6.1-INTERNAL-CANDIDATE-DO-NOT-PUBLISH"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate(package: Path, extract_to: Path | None):
    if not package.is_file():
        raise ValueError("ZIP candidate is missing")
    content = package.read_bytes()
    computed = sha(content)
    sumfile = package.with_suffix(".sha256")
    receiptfile = package.with_suffix(".receipt.json")
    stated_sum = sumfile.read_text(encoding="ascii").strip()
    if stated_sum != f"{computed}  {package.name}":
        raise ValueError("Candidate SHA-256 sidecar does not match actual ZIP")
    receipt = json.loads(receiptfile.read_text(encoding="utf-8"))
    if receipt.get("sha256") != computed or receipt.get("version_name") != EXPECTED_VERSION:
        raise ValueError("Candidate receipt does not match this internal archive")
    records = receipt.get("entries")
    if not isinstance(records, list) or len(records) != receipt.get("entry_count"):
        raise ValueError("Candidate receipt entry count invalid")
    expected = {
        p.relative_to(SOURCE).as_posix(): p
        for p in SOURCE.rglob("*") if p.is_file() and not p.is_symlink()
    }
    if any(p.is_symlink() for p in SOURCE.rglob("*")):
        raise ValueError("Source has symlinks")
    with zipfile.ZipFile(package, "r") as archive:
        files = archive.infolist()
        names = [p.filename for p in files]
        if len(names) != len(set(names)) or set(names) != set(expected):
            raise ValueError("Package contents differ from verified candidate source")
        if archive.testzip() is not None:
            raise ValueError("Candidate ZIP contains a corrupted member")
        if sum(p.file_size for p in files) > 12_000_000:
            raise ValueError("Unpacked candidate exceeds 12 MB limit")
        for info, record in zip(files, records):
            if info.is_dir() or info.filename != record.get("path"):
                raise ValueError("ZIP entries differ from ordered receipt")
            if info.date_time != (1980, 1, 1, 0, 0, 0):
                raise ValueError("Unstable ZIP timestamps")
            if info.filename.startswith("/") or "\\" in info.filename or (
                ".." in Path(info.filename).parts
            ):
                raise ValueError("Unsafe archive path")
            if (info.external_attr >> 16) & 0o170000 != 0o100000:
                raise ValueError("Non-regular ZIP file")
            data = archive.read(info.filename)
            if data != expected[info.filename].read_bytes():
                raise ValueError(f"Archive payload changed: {info.filename}")
            if len(data) != record.get("size") or sha(data) != record.get("sha256"):
                raise ValueError(f"Entry hash/size mismatch: {info.filename}")
        manifest = json.loads(archive.read("manifest.json"))
        if (manifest.get("manifest_version") != 3
            or manifest.get("version_name") != EXPECTED_VERSION
            or manifest.get("version") != receipt.get("version")):
            raise ValueError("Manifest is not the expected internal MV3 candidate")
        if extract_to:
            if extract_to.exists() and any(extract_to.iterdir()):
                raise ValueError("Refusing to extract over existing files")
            extract_to.mkdir(parents=True, exist_ok=True)
            archive.extractall(extract_to)
            if not (extract_to / "manifest.json").is_file():
                raise ValueError("Extracted candidate manifest not at root")

    # A second fresh archive must have exactly the same bytes, not merely files.
    with tempfile.TemporaryDirectory(prefix="bgct-repro-") as directory:
        copy = Path(directory) / package.name
        subprocess.run([sys.executable, str(ROOT / "tools" / "build-extension-candidate.py"),
                        "--output", str(copy)], check=True)
        if copy.read_bytes() != content:
            raise ValueError("Build is not bit-for-bit reproducible")

    print(f"BGCT PACKAGE VERIFIED: {package.name}, sha256={computed}, entries={len(files)}")
    print("SCOPE: isolated candidate only, no browser install, no live Udemy, no release")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--extract-to", type=Path)
    args = parser.parse_args()
    validate(args.zip.resolve(), args.extract_to.resolve() if args.extract_to else None)


if __name__ == "__main__":
    main()

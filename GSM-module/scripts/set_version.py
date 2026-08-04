import re
import sys
from pathlib import Path

_SEMVER = re.compile(r"^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$")
_FIRMWARE_DEFINE = re.compile(r'(#define FIRMWARE_VERSION\s+")[^"]*(")')

ROOT = Path(__file__).resolve().parents[1]
APP_VERSION_FILE = ROOT / "GSM-fastapi" / "app_version.py"
FIRMWARE_FILE = ROOT / "GSM-arduino-actual-code" / "GSM-arduino-actual-code.ino"


def is_valid_version(v: str) -> bool:
    return bool(_SEMVER.match(v))


def render_app_version_module(v: str) -> str:
    return f'__version__ = "{v}"\n'


def render_firmware_source(source: str, v: str) -> str:
    new_source, count = _FIRMWARE_DEFINE.subn(rf'\g<1>{v}\g<2>', source)
    if count == 0:
        raise ValueError(f"FIRMWARE_VERSION define not found in {FIRMWARE_FILE}")
    return new_source


def main() -> int:
    if len(sys.argv) != 2 or not is_valid_version(sys.argv[1]):
        print("Usage: set_version.py <X.Y.Z[-(alpha|beta|rc).N]>", file=sys.stderr)
        return 1
    version = sys.argv[1]
    APP_VERSION_FILE.write_text(render_app_version_module(version))
    FIRMWARE_FILE.write_text(render_firmware_source(FIRMWARE_FILE.read_text(), version))
    print(f"GSM version set to {version} (GSM-fastapi + Arduino firmware)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

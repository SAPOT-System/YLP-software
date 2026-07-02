import re

_SEMVER = re.compile(r"^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$")


def is_valid_version(v: str) -> bool:
    return bool(_SEMVER.match(v))


def render_version_module(v: str) -> str:
    return f'__version__ = "{v}"\n'

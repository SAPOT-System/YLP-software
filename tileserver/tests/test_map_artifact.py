from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("map_validator", ROOT / "tileserver" / "validate-map-artifact.py")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class MapContractTests(unittest.TestCase):
    def test_checked_in_contract_is_valid(self) -> None:
        contract = validator.load_contract(ROOT / "tileserver" / "map-artifact.json")
        self.assertEqual("map/v1.0.0", contract["releaseTag"])

    def test_rejects_extra_contract_field(self) -> None:
        contract = json.loads((ROOT / "tileserver" / "map-artifact.json").read_text())
        contract["sourceSha256"] = "x"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "contract.json"
            path.write_text(json.dumps(contract))
            with self.assertRaisesRegex(ValueError, "keys"):
                validator.load_contract(path)

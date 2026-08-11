from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_FILE = ROOT / ".github" / "workflows" / "release-bundle.yml"


class ReleaseBundleWorkflowTests(unittest.TestCase):
    def test_validate_step_force_fetches_tag_ref(self) -> None:
        workflow = WORKFLOW_FILE.read_text(encoding="utf-8")
        self.assertRegex(
            workflow,
            re.compile(r"\+refs/tags/\$GITHUB_REF_NAME:refs/tags/\$GITHUB_REF_NAME"),
        )


if __name__ == "__main__":
    unittest.main()

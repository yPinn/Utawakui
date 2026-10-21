"""Synthetic request validation tests; do not import model dependencies."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "lyrics_probe", Path(__file__).with_name("lyrics_acoustic_probe.py")
)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class RequestTests(unittest.TestCase):
    def setUp(self):
        for name, value in [
            ("version_info", (3, 14, 7)),
            ("path", PROBE.sys.path.copy()),
            ("pycache_prefix", PROBE.sys.pycache_prefix),
            ("dont_write_bytecode", PROBE.sys.dont_write_bytecode),
        ]:
            patcher = patch.object(PROBE.sys, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_rejects_extra_packages_versions_and_imports_outside_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            request = {
                "pythonVersion": "3.14.7",
                "packages": {"numpy": "2.5.2", "pypinyin": "0.55.0"},
                "environment": directory,
                "workspace": directory,
            }
            good = [
                SimpleNamespace(metadata={"Name": name}, version=version)
                for name, version in request["packages"].items()
            ]
            with (
                patch.object(PROBE.importlib.metadata,
                             "distributions", return_value=good),
                patch.object(PROBE.importlib, "import_module", return_value=
                             SimpleNamespace(__file__=str(
                                 Path(directory) / "module.py"))),
            ):
                self.assertEqual(PROBE.probe(request), {"ready": True})
                self.assertEqual(PROBE.sys.pycache_prefix,
                                 str(Path(directory) / "cache"))
                self.assertTrue(PROBE.sys.dont_write_bytecode)
            cases = [
                good + [SimpleNamespace(metadata={"Name": "extra"}, version="1")],
                [SimpleNamespace(metadata={"Name": "numpy"}, version="wrong")],
            ]
            for distributions in cases:
                with patch.object(PROBE.importlib.metadata, "distributions",
                                  return_value=distributions):
                    with self.assertRaises(ValueError):
                        PROBE.probe(request)
            with (
                patch.object(PROBE.importlib.metadata, "distributions",
                             return_value=good),
                patch.object(PROBE.importlib, "import_module", return_value=
                             SimpleNamespace(__file__=str(
                                 Path(directory).parent / "escaped.py"))),
            ):
                with self.assertRaises(ValueError):
                    PROBE.probe(request)

    def test_accepts_only_fixed_versions_and_existing_absolute_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            request = {
                "pythonVersion": "3.14.7",
                "packages": {"numpy": "2.5.2", "pypinyin": "0.55.0"},
                "environment": directory,
                "workspace": directory,
            }
            self.assertEqual(PROBE.validate_request(request),
                             (Path(directory), Path(directory)))
            for changes in [
                {"packages": {"numpy": "2.5.2"}},
                {"pythonVersion": "3.14.6"},
                {"environment": "relative"},
                {"workspace": str(Path(directory) / "missing")},
            ]:
                with self.assertRaises((ValueError, FileNotFoundError)):
                    PROBE.validate_request({**request, **changes})

    def test_rejects_wrong_host_version_before_importing_packages(self):
        with tempfile.TemporaryDirectory() as directory:
            request = {
                "pythonVersion": "3.14.7",
                "packages": {"numpy": "2.5.2", "pypinyin": "0.55.0"},
                "environment": directory,
                "workspace": directory,
            }
            with (
                patch.object(PROBE.sys, "version_info", (3, 14, 0)),
                patch.object(PROBE.importlib.metadata, "distributions") as distributions,
                patch.object(PROBE.importlib, "import_module") as import_module,
            ):
                with self.assertRaisesRegex(ValueError, "alignment Python version"):
                    PROBE.probe(request)
                distributions.assert_not_called()
                import_module.assert_not_called()


if __name__ == "__main__":
    unittest.main()

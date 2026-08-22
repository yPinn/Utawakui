"""Stdlib integration tests for the packaged Refined capability worker."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER_PATH = ROOT / "resources" / "audio-processing" / "refined_worker.py"
MODEL_ID = "bs-roformer-viperx-1297"
CHECKPOINT_FILENAME = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
CONFIG_FILENAME = "model_bs_roformer_ep_317_sdr_12.9755.yaml"


FAKE_SEPARATOR = '''from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import site
import socket
import subprocess
import sys
import time

from .roformer.roformer_loader import RoformerLoader


class _ModelInstance:
    is_roformer_model = True

    def get_roformer_loading_stats(self):
        return {"new_implementation_success": 1, "total_failures": 0}


class Separator:
    def __init__(self, *, model_file_dir, output_dir, **_kwargs):
        self.model_file_dir = Path(model_file_dir)
        self.output_dir = Path(output_dir)
        self.model_instance = None

    def load_model(self, model_filename):
        catalog = json.loads(
            (self.model_file_dir / "download_checks.json").read_text(
                encoding="utf-8"
            )
        )
        scenario = catalog["scenario"]
        if scenario == "network":
            socket.create_connection(("example.invalid", 443), timeout=0.1)
        elif scenario == "subprocess":
            subprocess.run(["unowned-helper"], check=False)
        elif scenario == "legacy":
            RoformerLoader()._load_with_legacy_implementation()
        elif scenario == "forbidden":
            importlib.import_module(catalog["module"])
        elif scenario == "system-exit":
            raise SystemExit(17)
        elif scenario == "error":
            raise RuntimeError(f"private model path: {self.model_file_dir}")
        elif scenario == "wait":
            time.sleep(30)

        job_path = Path(os.environ["UTAWAKUI_REFINED_JOB_DIR"]).resolve()
        for key in (
            "HOME",
            "USERPROFILE",
            "XDG_CACHE_HOME",
            "TORCH_HOME",
            "HF_HOME",
            "MPLCONFIGDIR",
            "NUMBA_CACHE_DIR",
        ):
            configured = Path(os.environ[key]).resolve()
            if job_path not in (configured, *configured.parents):
                raise RuntimeError(f"cache escaped job path through {key}")
        user_site = site.getusersitepackages()
        if isinstance(user_site, str) and user_site in sys.path:
            raise RuntimeError("user site remained enabled")
        if model_filename != "model_bs_roformer_ep_317_sdr_12.9755.ckpt":
            raise RuntimeError("unexpected model filename")
        self.model_instance = _ModelInstance()
'''


FAKE_LOADER = '''class RoformerLoader:
    def _load_with_legacy_implementation(self, *_args, **_kwargs):
        return "legacy"
'''


class RefinedWorkerFixture:
    def __init__(self, scenario: str = "success", module: str | None = None):
        self.root = Path(tempfile.mkdtemp(prefix="utawakui-refined-worker-"))
        self.environment_path = self.root / "environment" / "Lib" / "site-packages"
        self.job_path = self.root / "jobs" / "refined" / "probe-job"
        self.model_path = self.root / "models" / "separation" / MODEL_ID / "fixture"
        self.environment_path.mkdir(parents=True)
        self.job_path.mkdir(parents=True)
        self.model_path.mkdir(parents=True)
        self._write_fake_wrapper()

        catalog = {"scenario": scenario}
        if module is not None:
            catalog["module"] = module
        self.catalog_path = self.model_path / "download_checks.json"
        self.config_path = self.model_path / CONFIG_FILENAME
        self.checkpoint_path = self.model_path / CHECKPOINT_FILENAME
        self.catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
        self.config_path.write_text("model: fake\n", encoding="utf-8")
        self.checkpoint_path.write_bytes(b"fake checkpoint")

    def cleanup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def _write_fake_wrapper(self) -> None:
        package = self.environment_path / "audio_separator"
        architectures = package / "separator" / "architectures"
        roformer = package / "separator" / "roformer"
        uvr_lib = package / "separator" / "uvr_lib_v5"
        architectures.mkdir(parents=True)
        roformer.mkdir(parents=True)
        uvr_lib.mkdir(parents=True)
        (package / "__init__.py").write_text(
            "from pathlib import Path\n"
            "import os\n"
            "Path(os.environ[\"UTAWAKUI_REFINED_JOB_DIR\"])"
            ".joinpath(\"imported.marker\")"
            ".write_text(\"imported\", encoding=\"utf-8\")\n",
            encoding="utf-8",
        )
        (package / "separator" / "__init__.py").write_text("", encoding="utf-8")
        (architectures / "__init__.py").write_text("", encoding="utf-8")
        (roformer / "__init__.py").write_text("", encoding="utf-8")
        (uvr_lib / "__init__.py").write_text("", encoding="utf-8")
        (roformer / "roformer_loader.py").write_text(
            FAKE_LOADER,
            encoding="utf-8",
        )
        (package / "separator" / "separator.py").write_text(
            FAKE_SEPARATOR,
            encoding="utf-8",
        )

    @staticmethod
    def _sha256(file_path: Path) -> str:
        return hashlib.sha256(file_path.read_bytes()).hexdigest()

    def request(self) -> dict[str, object]:
        return {
            "protocolVersion": 1,
            "operation": "probe-refined",
            "recipeId": "refined",
            "modelId": MODEL_ID,
            "environmentPath": str(self.environment_path),
            "jobPath": str(self.job_path),
            "modelPath": str(self.model_path),
            "files": {
                "catalog": {
                    "path": str(self.catalog_path),
                    "sha256": self._sha256(self.catalog_path),
                },
                "config": {
                    "path": str(self.config_path),
                    "sha256": self._sha256(self.config_path),
                },
                "checkpoint": {
                    "path": str(self.checkpoint_path),
                    "sha256": self._sha256(self.checkpoint_path),
                },
            },
        }

    def run(self, request: dict[str, object] | None = None):
        process = subprocess.run(
            [sys.executable, str(WORKER_PATH)],
            input=f"{json.dumps(request if request is not None else self.request())}\n",
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        messages = [json.loads(line) for line in process.stdout.splitlines()]
        return process, messages


class RefinedWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures: list[RefinedWorkerFixture] = []

    def tearDown(self) -> None:
        for fixture in self.fixtures:
            fixture.cleanup()

    def fixture(
        self,
        scenario: str = "success",
        module: str | None = None,
    ) -> RefinedWorkerFixture:
        fixture = RefinedWorkerFixture(scenario, module)
        self.fixtures.append(fixture)
        return fixture

    def test_success_uses_new_loader_offline_and_job_owned_caches(self) -> None:
        fixture = self.fixture()
        process, messages = fixture.run()

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(
            messages[0],
            {"type": "progress", "stage": "validating", "percent": 0},
        )
        self.assertEqual(
            messages[-1],
            {
                "type": "done",
                "result": {
                    "protocolVersion": 1,
                    "probePassed": True,
                    "recipeId": "refined",
                    "modelId": MODEL_ID,
                    "implementation": "new-roformer",
                    "offlineEnforced": True,
                    "noUserCache": True,
                },
            },
        )
        self.assertTrue((fixture.job_path / "imported.marker").exists())
        self.assertEqual(
            list(fixture.environment_path.rglob("__pycache__")),
            [],
            "the immutable environment must not receive worker bytecode caches",
        )

    def test_missing_or_corrupt_artifact_fails_before_wrapper_import(self) -> None:
        missing = self.fixture()
        request = missing.request()
        missing.checkpoint_path.unlink()
        _process, messages = missing.run(request)
        self.assertEqual(messages[-1]["code"], "ARTIFACT_MISSING")
        self.assertFalse((missing.job_path / "imported.marker").exists())

        corrupt = self.fixture()
        request = corrupt.request()
        corrupt.checkpoint_path.write_bytes(b"corrupt after intent resolution")
        _process, messages = corrupt.run(request)
        self.assertEqual(messages[-1]["code"], "ARTIFACT_MISMATCH")
        self.assertFalse((corrupt.job_path / "imported.marker").exists())

    def test_network_legacy_and_forbidden_imports_fail_closed(self) -> None:
        scenarios = [
            ("network", None, "NETWORK_DENIED"),
            ("subprocess", None, "SUBPROCESS_DENIED"),
            ("legacy", None, "LEGACY_LOADER_REJECTED"),
            (
                "forbidden",
                "audio_separator.separator.architectures.demucs_separator",
                "FORBIDDEN_IMPORT",
            ),
            (
                "forbidden",
                "audio_separator.separator.uvr_lib_v5.demucs",
                "FORBIDDEN_IMPORT",
            ),
            ("forbidden", "demucs", "FORBIDDEN_IMPORT"),
            ("forbidden", "diffq", "FORBIDDEN_IMPORT"),
            ("forbidden", "julius", "FORBIDDEN_IMPORT"),
            ("forbidden", "onnx", "FORBIDDEN_IMPORT"),
            ("forbidden", "onnx2torch", "FORBIDDEN_IMPORT"),
            ("forbidden", "torchvision", "FORBIDDEN_IMPORT"),
        ]
        for scenario, module, expected_code in scenarios:
            with self.subTest(scenario=scenario, module=module):
                fixture = self.fixture(scenario, module)
                _process, messages = fixture.run()
                self.assertEqual(messages[-1]["type"], "error")
                self.assertEqual(messages[-1]["code"], expected_code)
                self.assertNotIn(str(fixture.root), messages[-1]["message"])

    def test_system_exit_and_wrapper_error_are_normalized(self) -> None:
        system_exit = self.fixture("system-exit")
        _process, messages = system_exit.run()
        self.assertEqual(messages[-1]["code"], "WRAPPER_EXITED")
        self.assertNotIn("17", messages[-1]["message"])

        failure = self.fixture("error")
        _process, messages = failure.run()
        self.assertEqual(messages[-1]["code"], "REFINED_PROBE_FAILED")
        self.assertNotIn(str(failure.root), messages[-1]["message"])

    def test_unknown_request_fields_are_rejected(self) -> None:
        fixture = self.fixture()
        request = fixture.request()
        request["checkpointPath"] = "C:\\renderer-controlled.ckpt"
        _process, messages = fixture.run(request)
        self.assertEqual(messages[-1]["code"], "INVALID_REQUEST")
        self.assertFalse((fixture.job_path / "imported.marker").exists())

    def test_waiting_probe_can_be_terminated_without_worker_output(self) -> None:
        fixture = self.fixture("wait")
        process = subprocess.Popen(
            [sys.executable, str(WORKER_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert process.stdin is not None
        assert process.stdout is not None
        process.stdin.write(f"{json.dumps(fixture.request())}\n")
        process.stdin.close()
        first_message = json.loads(process.stdout.readline())
        self.assertEqual(first_message["type"], "progress")
        process.terminate()
        process.wait(timeout=5)
        process.stdout.close()
        assert process.stderr is not None
        process.stderr.close()
        self.assertIsNotNone(process.returncode)


if __name__ == "__main__":
    unittest.main()

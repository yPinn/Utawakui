"""Contract tests for the stdlib structure-analysis worker boundary."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER_PATH = ROOT / "resources" / "audio-processing" / "structure_analysis_worker.py"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class StructureAnalysisWorkerTests(unittest.TestCase):
    """Exercise success and fail-closed paths without installing ML."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="utawakui-analysis-worker-")
        self.root = Path(self.temp_dir.name)
        self.environment = self.root / "site-packages"
        self.job = self.root / "job"
        self.model = self.root / "model"
        self.environment.mkdir()
        self.job.mkdir()
        self.model.mkdir()
        self.input_path = self.root / "input.wav"
        with wave.open(str(self.input_path), "wb") as output:
            output.setnchannels(2)
            output.setsampwidth(2)
            output.setframerate(100)
            output.writeframes(b"\x00\x00" * 2 * 200)
        self.structure_path = self.model / "harmonix-fold0-0vra4ys2.pth"
        self.separation_path = self.model / "955717e8-8726e21a.th"
        self.separation_config_path = self.model / "htdemucs.yaml"
        self.structure_path.write_bytes(b"structure")
        self.separation_path.write_bytes(b"separation")
        self.separation_config_path.write_text("models: ['fake']\n", encoding="utf-8")
        self._write_fake_packages()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_fake_packages(self) -> None:
        package = self.environment / "allin1_infer"
        models = package / "models"
        package.mkdir()
        models.mkdir()
        (models / "__init__.py").write_text("", encoding="utf-8")
        (models / "loaders.py").write_text(
            "def _download_checkpoint(*args, **kwargs):\n"
            "    raise RuntimeError('network loader was not replaced')\n",
            encoding="utf-8",
        )
        (package / "__init__.py").write_text(
            """
import os
import socket
import subprocess
import urllib.request

__version__ = "3.1.0"

class Segment:
    def __init__(self, start, end, label):
        self.start = start
        self.end = end
        self.label = label

_LABEL_FRAMES = (
    [[0.01, 0.01, 0.82, 0.01, 0.01, 0.01, 0.01, 0.01, 0.05, 0.07] for _ in range(100)]
    + [[0.01, 0.01, 0.03, 0.01, 0.01, 0.01, 0.01, 0.01, 0.05, 0.86] for _ in range(100)]
)

class Result:
    activation_fps = 100.0
    bpm = 120.0
    beats = [0.5, 1.0, 1.5]
    beat_positions = [1, 2, 3]
    downbeats = [0.5]
    segments = [Segment(0.0, 1.0, "intro"), Segment(1.0, 2.0, "chorus")]
    activations = {
        "beat": (
            [0.1] * 50 + [0.9] + [0.1] * 49 + [0.8]
            + [0.1] * 49 + [0.7] + [0.1] * 49
        ),
        "downbeat": [0.1] * 50 + [0.85] + [0.1] * 149,
        "label": [list(column) for column in zip(*_LABEL_FRAMES)],
    }

class CustomSeparatorProvider:
    def __init__(self, separator):
        self.separator = separator

def analyze(path, **kwargs):
    if os.environ.get("FAKE_ANALYSIS_SCENARIO") == "network":
        urllib.request.urlopen("https://example.test/model")
    if os.environ.get("FAKE_ANALYSIS_SCENARIO") == "dns":
        socket.getaddrinfo("example.test", 443)
    if os.environ.get("FAKE_ANALYSIS_SCENARIO") == "child":
        subprocess.run(["unexpected-child"], check=False)
    if os.environ.get("FAKE_ANALYSIS_SCENARIO") == "nan":
        Result.activations["label"][2][0] = float("nan")
    assert kwargs["model"] == "harmonix-fold0"
    assert kwargs["device"] == "cpu"
    assert kwargs["multiprocess"] is False
    assert kwargs["include_activations"] is True
    assert kwargs["stem_provider"] is not None
    stem_dir = kwargs["stem_provider"].separator.separate(
        path, kwargs["demix_dir"], kwargs["device"]
    )
    assert all((stem_dir / f"{stem}.wav").is_file() for stem in (
        "bass", "drums", "other", "vocals"
    ))
    return Result()
""".lstrip(),
            encoding="utf-8",
        )
        demucs = self.environment / "demucs_infer"
        demucs.mkdir()
        (demucs / "__init__.py").write_text("", encoding="utf-8")
        (demucs / "api.py").write_text(
            """
class Separator:
    def __init__(self, **kwargs):
        assert kwargs["model"] == "htdemucs"
        assert kwargs["device"] == "cpu"
        assert kwargs["shifts"] == 0
        assert kwargs["overlap"] == 0.25
        assert kwargs["split"] is True
        assert kwargs["repo"]
        self.samplerate = 44100
    def separate_tensor(self, samples, sample_rate):
        return samples, {
            "bass": samples,
            "drums": samples,
            "other": samples,
            "vocals": samples,
        }
""".lstrip(),
            encoding="utf-8",
        )
        (demucs / "audio.py").write_text(
            "from pathlib import Path\n"
            "def save_audio(samples, path, samplerate, **kwargs):\n"
            "    assert kwargs == {\n"
            "        'clip': 'rescale',\n"
            "        'bits_per_sample': 16,\n"
            "        'as_float': False,\n"
            "    }\n"
            "    Path(path).write_bytes(b'pcm16')\n",
            encoding="utf-8",
        )
        (self.environment / "soundfile.py").write_text(
            "class Samples:\n"
            "    T = object()\n"
            "def read(*args, **kwargs):\n"
            "    return Samples(), 44100\n",
            encoding="utf-8",
        )
        (self.environment / "torch.py").write_text(
            "class Tensor:\n"
            "    def contiguous(self):\n"
            "        return self\n"
            "def from_numpy(_samples):\n"
            "    return Tensor()\n",
            encoding="utf-8",
        )

    def request(self) -> dict[str, object]:
        return {
            "protocolVersion": 1,
            "operation": "analyze-structure",
            "analyzerId": "all-in-one-structure",
            "profileId": "all-in-one-cpu-v1",
            "modelId": "all-in-one-harmonix-fold0",
            "modelName": "harmonix-fold0",
            "environmentPath": str(self.environment.resolve()),
            "inputPath": str(self.input_path.resolve()),
            "jobPath": str(self.job.resolve()),
            "modelPath": str(self.model.resolve()),
            "modelFiles": [
                {
                    "role": "structure-checkpoint",
                    "path": str(self.structure_path.resolve()),
                    "sha256": sha256(self.structure_path),
                },
                {
                    "role": "separation-checkpoint",
                    "path": str(self.separation_path.resolve()),
                    "sha256": sha256(self.separation_path),
                },
                {
                    "role": "separation-config",
                    "path": str(self.separation_config_path.resolve()),
                    "sha256": sha256(self.separation_config_path),
                },
            ],
        }

    def run_worker(self, request: dict[str, object], scenario: str = "success"):
        environment = os.environ.copy()
        environment["FAKE_ANALYSIS_SCENARIO"] = scenario
        return subprocess.run(
            [sys.executable, str(WORKER_PATH)],
            input=f"{json.dumps(request)}\n",
            text=True,
            capture_output=True,
            check=False,
            env=environment,
        )

    def test_projects_confident_canonical_cues_from_raw_activations(self) -> None:
        completed = self.run_worker(self.request())
        self.assertEqual(completed.returncode, 0, completed.stderr)
        messages = [json.loads(line) for line in completed.stdout.splitlines()]
        self.assertEqual(
            messages[0],
            {"type": "progress", "stage": "starting", "percent": 0},
        )
        result = messages[-1]["result"]
        self.assertEqual(result["durationMs"], 2000)
        self.assertEqual(
            result["tempo"], {"bpm": 120.0, "confidence": 0.783333}
        )
        self.assertEqual(result["beats"][0]["confidence"], 0.85)
        self.assertTrue(result["beats"][0]["downbeat"])
        self.assertEqual(result["sections"][0]["role"], "intro")
        self.assertEqual(result["sections"][0]["confidence"], 0.82)
        self.assertEqual(result["sections"][1]["role"], "chorus")
        self.assertTrue(result["offlineEnforced"])
        self.assertTrue(result["noUserCache"])

    def test_rejects_network_after_policy_installation(self) -> None:
        completed = self.run_worker(self.request(), "network")
        self.assertNotEqual(completed.returncode, 0)
        message = json.loads(completed.stdout.splitlines()[-1])
        self.assertEqual(message["type"], "error")
        self.assertEqual(message["code"], "NETWORK_DISABLED")
        self.assertNotIn(str(self.root), message["message"])

    def test_rejects_dns_and_child_process_attempts(self) -> None:
        dns = self.run_worker(self.request(), "dns")
        self.assertNotEqual(dns.returncode, 0)
        self.assertEqual(
            json.loads(dns.stdout.splitlines()[-1])["code"],
            "NETWORK_DISABLED",
        )

        child = self.run_worker(self.request(), "child")
        self.assertNotEqual(child.returncode, 0)
        self.assertEqual(
            json.loads(child.stdout.splitlines()[-1])["code"],
            "CHILD_PROCESS_DISABLED",
        )

    def test_rejects_tampered_models_before_third_party_import(self) -> None:
        request = self.request()
        request["modelFiles"][0]["sha256"] = "0" * 64
        completed = self.run_worker(request)
        self.assertNotEqual(completed.returncode, 0)
        message = json.loads(completed.stdout.splitlines()[-1])
        self.assertEqual(message["code"], "MODEL_INTEGRITY_FAILED")

    def test_rejects_extra_renderer_style_inputs(self) -> None:
        request = self.request()
        request["command"] = "python -m anything"
        completed = self.run_worker(request)
        self.assertNotEqual(completed.returncode, 0)
        message = json.loads(completed.stdout.splitlines()[-1])
        self.assertEqual(message["code"], "INVALID_REQUEST")

    def test_rejects_extra_model_artifacts_before_import(self) -> None:
        (self.model / "unverified.th").write_bytes(b"unverified")
        completed = self.run_worker(self.request())
        self.assertNotEqual(completed.returncode, 0)
        message = json.loads(completed.stdout.splitlines()[-1])
        self.assertEqual(message["code"], "INVALID_REQUEST")

    def test_rejects_non_finite_confidence_with_valid_json(self) -> None:
        completed = self.run_worker(self.request(), "nan")
        self.assertNotEqual(completed.returncode, 0)
        message = json.loads(completed.stdout.splitlines()[-1])
        self.assertEqual(message["code"], "ANALYSIS_CONFIDENCE_INVALID")


if __name__ == "__main__":
    unittest.main()

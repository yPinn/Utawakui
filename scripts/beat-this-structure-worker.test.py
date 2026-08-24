"""Contract tests for the Beat This! M1 structure-analysis worker path."""

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


class BeatThisStructureWorkerTests(unittest.TestCase):
    """Exercise the Beat This! profile without installing third-party ML."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="utawakui-beat-this-")
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
            output.setframerate(44_100)
            output.writeframes(b"\x00\x00" * 2 * 44_100 * 2)
        self.weights_path = self.model / "small0.ckpt"
        self.weights_path.write_bytes(b"beat-this-small0")
        self._write_fake_package()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_fake_package(self) -> None:
        package = self.environment / "beat_this"
        model_package = package / "model"
        model_package.mkdir(parents=True)
        (package / "__init__.py").write_text("", encoding="utf-8")
        (model_package / "__init__.py").write_text("", encoding="utf-8")
        (package / "inference.py").write_text(
            """
import os
import urllib.request

class FakeTensor:
    def __init__(self, values):
        self.values = values
    def __len__(self):
        return len(self.values)
    def __getitem__(self, index):
        return self.values[index]

class Audio2Frames:
    def __init__(self, checkpoint_path, device, float16=False):
        assert checkpoint_path.endswith(("small0.ckpt", "final0.ckpt"))
        assert device == "cpu"
        assert float16 is False
    def __call__(self, signal, sample_rate):
        assert sample_rate == 44100
        if os.environ.get("FAKE_BEAT_THIS_SCENARIO") == "network":
            urllib.request.urlopen("https://example.test/checkpoint")
        beat = [-8.0] * 100
        downbeat = [-8.0] * 100
        for index, value in ((25, 3.0), (50, 2.5), (75, 2.0)):
            beat[index] = value
        downbeat[25] = 2.0
        return FakeTensor(beat), FakeTensor(downbeat)
""".lstrip(),
            encoding="utf-8",
        )
        (model_package / "postprocessor.py").write_text(
            """
import os

class Postprocessor:
    def __init__(self, type="minimal", fps=50):
        assert type == "minimal"
        assert fps == 50
    def __call__(self, beat_logits, downbeat_logits):
        if os.environ.get("FAKE_BEAT_THIS_SCENARIO") == "quantized-tempo":
            beats = [round(index * 50 * 60 / 122) / 50 for index in range(100)]
            return beats, beats[::4]
        return [0.5, 1.0, 1.5], [0.5]
""".lstrip(),
            encoding="utf-8",
        )
        (self.environment / "numpy.py").write_text(
            """
float32 = "float32"

class FakeArray:
    ndim = 2
    def reshape(self, *_shape):
        return self
    def __truediv__(self, _value):
        return self

def asarray(_values, dtype=None):
    assert dtype == float32
    return FakeArray()
""".lstrip(),
            encoding="utf-8",
        )
        metadata = self.environment / "beat_this-1.1.0.dist-info"
        metadata.mkdir()
        (metadata / "METADATA").write_text(
            "Metadata-Version: 2.4\nName: beat-this\nVersion: 1.1.0\n",
            encoding="utf-8",
        )

    def request(self) -> dict[str, object]:
        return {
            "protocolVersion": 1,
            "operation": "analyze-structure",
            "analyzerId": "beat-this",
            "profileId": "beat-this-small0-cpu-v2",
            "modelId": "beat-this-small0",
            "modelName": "small0",
            "environmentPath": str(self.environment.resolve()),
            "inputPath": str(self.input_path.resolve()),
            "jobPath": str(self.job.resolve()),
            "modelPath": str(self.model.resolve()),
            "modelFiles": [
                {
                    "role": "weights",
                    "path": str(self.weights_path.resolve()),
                    "sha256": sha256(self.weights_path),
                }
            ],
        }

    def run_worker(self, request: dict[str, object], scenario: str = "success"):
        environment = os.environ.copy()
        environment["FAKE_BEAT_THIS_SCENARIO"] = scenario
        return subprocess.run(
            [sys.executable, str(WORKER_PATH)],
            input=f"{json.dumps(request)}\n",
            text=True,
            capture_output=True,
            check=False,
            env=environment,
        )

    def test_projects_m1_tempo_beats_and_downbeats_with_confidence(self) -> None:
        completed = self.run_worker(self.request())
        self.assertEqual(completed.returncode, 0, completed.stderr)
        messages = [json.loads(line) for line in completed.stdout.splitlines()]
        result = messages[-1]["result"]
        self.assertEqual(result["analyzerId"], "beat-this")
        self.assertEqual(result["profileId"], "beat-this-small0-cpu-v2")
        self.assertEqual(result["modelId"], "beat-this-small0")
        self.assertEqual(result["tempo"]["bpm"], 120.0)
        self.assertEqual(len(result["beats"]), 3)
        self.assertTrue(result["beats"][0]["downbeat"])
        self.assertEqual(result["beats"][0]["positionInBar"], 1)
        self.assertGreater(result["beats"][0]["confidence"], 0.8)
        self.assertEqual(result["sections"], [])
        self.assertTrue(result["offlineEnforced"])
        self.assertTrue(result["noUserCache"])

    def test_estimates_global_tempo_without_single_frame_interval_bias(self) -> None:
        completed = self.run_worker(self.request(), "quantized-tempo")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        messages = [json.loads(line) for line in completed.stdout.splitlines()]
        result = messages[-1]["result"]

        self.assertAlmostEqual(result["tempo"]["bpm"], 122.0, places=1)

    def test_rejects_network_and_tampered_or_extra_checkpoints(self) -> None:
        network = self.run_worker(self.request(), "network")
        self.assertNotEqual(network.returncode, 0)
        self.assertEqual(
            json.loads(network.stdout.splitlines()[-1])["code"],
            "NETWORK_DISABLED",
        )

        tampered = self.request()
        tampered["modelFiles"][0]["sha256"] = "0" * 64
        failed = self.run_worker(tampered)
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual(
            json.loads(failed.stdout.splitlines()[-1])["code"],
            "MODEL_INTEGRITY_FAILED",
        )

        (self.model / "final0.ckpt").write_bytes(b"unexpected")
        extra = self.run_worker(self.request())
        self.assertNotEqual(extra.returncode, 0)
        self.assertEqual(
            json.loads(extra.stdout.splitlines()[-1])["code"],
            "INVALID_REQUEST",
        )


if __name__ == "__main__":
    unittest.main()

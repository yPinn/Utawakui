"""Run a real offline Windows CPU inference through the packaged worker."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import wave
from array import array
from pathlib import Path


SAMPLE_RATE = 44_100
FIXTURE_DURATION_SECONDS = 36


def file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_fixture(file_path: Path) -> None:
    """Write deterministic stereo audio with a 120-BPM pulse and two regions."""
    frames = array("h")
    frame_count = SAMPLE_RATE * FIXTURE_DURATION_SECONDS
    for frame in range(frame_count):
        time_seconds = frame / SAMPLE_RATE
        region_frequency = 220 if time_seconds < 18 else 330
        tone = 0.12 * math.sin(2 * math.pi * region_frequency * time_seconds)
        beat_phase = time_seconds % 0.5
        beat_index = int(time_seconds / 0.5)
        pulse_gain = 0.58 if beat_index % 4 == 0 else 0.36
        pulse = (
            pulse_gain
            * math.exp(-beat_phase * 55)
            * math.sin(2 * math.pi * 80 * time_seconds)
        )
        sample = max(-1.0, min(1.0, tone + pulse))
        value = round(sample * 32767)
        frames.extend((value, value))

    file_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(file_path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames.tobytes())


def package_probe(python_path: Path, environment_path: Path) -> dict[str, str]:
    expression = (
        "import json,struct,sys;"
        f"sys.path.insert(0,{str(environment_path)!r});"
        "import allin1_infer,demucs_infer,numpy,scipy,torch,torchaudio;"
        "print(json.dumps({"
        "'python':sys.version.split()[0],"
        "'platform':sys.platform,"
        "'bits':str(struct.calcsize('P') * 8),"
        "'allInOne':allin1_infer.__version__,"
        "'torch':torch.__version__,"
        "'torchaudio':torchaudio.__version__,"
        "'numpy':numpy.__version__,"
        "'scipy':scipy.__version__}))"
    )
    completed = subprocess.run(
        [str(python_path), "-I", "-c", expression],
        text=True,
        capture_output=True,
        check=False,
        timeout=120,
    )
    if completed.returncode != 0:
        raise RuntimeError("packaged analysis native import probe failed")
    return json.loads(completed.stdout)


def run_smoke(args: argparse.Namespace) -> dict[str, object]:
    package_root = args.package_root.resolve(strict=True)
    python_path = args.python.resolve(strict=True)
    worker_path = args.worker.resolve(strict=True)
    environment_path = args.environment.resolve(strict=True)
    model_path = args.model.resolve(strict=True)
    output_path = args.output.resolve()
    expected_worker_path = (
        package_root
        / "resources"
        / "audio-processing"
        / "structure_analysis_worker.py"
    ).resolve(strict=True)
    expected_manifest_path = (
        package_root
        / "resources"
        / "audio-processing"
        / "analysis-structure-model.json"
    ).resolve(strict=True)
    manifest_path = args.manifest.resolve(strict=True)
    if worker_path != expected_worker_path or manifest_path != expected_manifest_path:
        raise RuntimeError("analysis smoke inputs are outside the package root")
    if file_sha256(worker_path) != file_sha256(
        args.source_worker.resolve(strict=True)
    ):
        raise RuntimeError("packaged analysis worker differs from source")
    if file_sha256(manifest_path) != file_sha256(
        args.source_manifest.resolve(strict=True)
    ):
        raise RuntimeError("packaged analysis catalog differs from source")
    output_path.mkdir(parents=True, exist_ok=True)
    input_path = output_path / "input.wav"
    job_path = output_path / "job"
    job_path.mkdir(exist_ok=True)
    write_fixture(input_path)

    manifest = json.loads(manifest_path.read_text("utf-8"))
    model_files = []
    for artifact in manifest["files"]:
        artifact_path = (model_path / artifact["filename"]).resolve(strict=True)
        if artifact_path.stat().st_size != artifact["sizeBytes"]:
            raise RuntimeError("analysis model size verification failed")
        if file_sha256(artifact_path) != artifact["sha256"]:
            raise RuntimeError("analysis model hash verification failed")
        model_files.append(
            {
                "role": artifact["role"],
                "path": str(artifact_path),
                "sha256": artifact["sha256"],
            }
        )

    request = {
        "protocolVersion": 1,
        "operation": "analyze-structure",
        "analyzerId": "all-in-one-structure",
        "profileId": "all-in-one-cpu-v1",
        "modelId": manifest["id"],
        "modelName": manifest["wrapper"]["model"],
        "environmentPath": str(environment_path),
        "inputPath": str(input_path),
        "jobPath": str(job_path),
        "modelPath": str(model_path),
        "modelFiles": model_files,
    }
    (output_path / "request.json").write_text(
        json.dumps(request, indent=2), encoding="utf-8"
    )
    completed = subprocess.run(
        [str(python_path), "-I", str(worker_path)],
        input=f"{json.dumps(request)}\n",
        text=True,
        capture_output=True,
        check=False,
        timeout=30 * 60,
    )
    messages = [json.loads(line) for line in completed.stdout.splitlines()]
    terminal = messages[-1] if messages else None
    if (
        completed.returncode != 0
        or not isinstance(terminal, dict)
        or terminal.get("type") != "done"
    ):
        raise RuntimeError(f"packaged analysis inference failed: {terminal!r}")
    result = terminal["result"]
    if (
        result.get("offlineEnforced") is not True
        or result.get("noUserCache") is not True
        or result.get("tempo") is None
        or not result.get("beats")
        or not result.get("sections")
    ):
        raise RuntimeError("packaged analysis inference returned incomplete signals")
    packages = package_probe(python_path, environment_path)
    if packages.get("platform") != "win32" or packages.get("bits") != "64":
        raise RuntimeError("analysis smoke runtime is not Windows x64")
    return {
        "packages": packages,
        "workerSha256": file_sha256(worker_path),
        "modelManifestSha256": file_sha256(manifest_path),
        "durationMs": result["durationMs"],
        "tempo": result["tempo"],
        "beatCount": len(result["beats"]),
        "downbeatCount": sum(beat["downbeat"] for beat in result["beats"]),
        "sectionCount": len(result["sections"]),
        "roles": sorted({section["role"] for section in result["sections"]}),
        "offlineEnforced": result["offlineEnforced"],
        "noUserCache": result["noUserCache"],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", required=True, type=Path)
    parser.add_argument("--package-root", required=True, type=Path)
    parser.add_argument("--worker", required=True, type=Path)
    parser.add_argument("--source-worker", required=True, type=Path)
    parser.add_argument("--environment", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--source-manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    print(json.dumps(run_smoke(parse_args()), indent=2, sort_keys=True))

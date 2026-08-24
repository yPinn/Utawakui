"""Run an offline Beat This! M1 inference through the packaged worker."""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import math
import os
import subprocess
import time
import wave
from array import array
from pathlib import Path


SAMPLE_RATE = 44_100
FIXTURE_DURATION_SECONDS = 36


class ProcessMemoryCounters(ctypes.Structure):
    """Windows PROCESS_MEMORY_COUNTERS layout."""

    _fields_ = [
        ("cb", ctypes.c_ulong),
        ("page_fault_count", ctypes.c_ulong),
        ("peak_working_set_size", ctypes.c_size_t),
        ("working_set_size", ctypes.c_size_t),
        ("quota_peak_paged_pool_usage", ctypes.c_size_t),
        ("quota_paged_pool_usage", ctypes.c_size_t),
        ("quota_peak_non_paged_pool_usage", ctypes.c_size_t),
        ("quota_non_paged_pool_usage", ctypes.c_size_t),
        ("pagefile_usage", ctypes.c_size_t),
        ("peak_pagefile_usage", ctypes.c_size_t),
    ]


def file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def directory_size(root: Path) -> int:
    return sum(path.stat().st_size for path in root.rglob("*") if path.is_file())


def write_fixture(file_path: Path) -> None:
    """Write deterministic stereo audio with a 120-BPM pulse."""
    frames = array("h")
    for frame in range(SAMPLE_RATE * FIXTURE_DURATION_SECONDS):
        time_seconds = frame / SAMPLE_RATE
        tone = 0.12 * math.sin(2 * math.pi * 220 * time_seconds)
        beat_phase = time_seconds % 0.5
        beat_index = int(time_seconds / 0.5)
        pulse_gain = 0.58 if beat_index % 4 == 0 else 0.36
        pulse = (
            pulse_gain
            * math.exp(-beat_phase * 55)
            * math.sin(2 * math.pi * 80 * time_seconds)
        )
        value = round(max(-1.0, min(1.0, tone + pulse)) * 32767)
        frames.extend((value, value))
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(file_path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames.tobytes())


def peak_working_set(process: subprocess.Popen[str]) -> int | None:
    if os.name != "nt":
        return None
    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    success = ctypes.windll.psapi.GetProcessMemoryInfo(
        int(process._handle),
        ctypes.byref(counters),
        counters.cb,
    )
    return int(counters.peak_working_set_size) if success else None


def package_probe(python_path: Path, environment_path: Path) -> dict[str, str]:
    expression = (
        "import importlib.metadata as m,json,struct,sys;"
        f"sys.path.insert(0,{str(environment_path)!r});"
        "import beat_this,numpy,soxr,torch,torchaudio;"
        "print(json.dumps({"
        "'python':sys.version.split()[0],"
        "'platform':sys.platform,"
        "'bits':str(struct.calcsize('P')*8),"
        "'beatThis':m.version('beat-this'),"
        "'torch':torch.__version__,"
        "'torchaudio':torchaudio.__version__,"
        "'numpy':numpy.__version__,"
        "'soxr':soxr.__version__}))"
    )
    completed = subprocess.run(
        [str(python_path), "-I", "-c", expression],
        text=True,
        capture_output=True,
        check=False,
        timeout=120,
    )
    if completed.returncode != 0:
        raise RuntimeError("Beat This! native import probe failed")
    return json.loads(completed.stdout)


def run_smoke(args: argparse.Namespace) -> dict[str, object]:
    python_path = args.python.resolve(strict=True)
    worker_path = args.worker.resolve(strict=True)
    source_worker = args.source_worker.resolve(strict=True)
    environment_path = args.environment.resolve(strict=True)
    model_path = args.model.resolve(strict=True)
    manifest_path = args.manifest.resolve(strict=True)
    output_path = args.output.resolve()
    if file_sha256(worker_path) != file_sha256(source_worker):
        raise RuntimeError("packaged analysis worker differs from source")
    manifest = json.loads(manifest_path.read_text("utf-8"))
    if manifest.get("architecture") != "beat-this":
        raise RuntimeError("unexpected Beat This! model manifest")
    profile_id = f"beat-this-{manifest['wrapper']['model']}-cpu-v2"
    output_path.mkdir(parents=True, exist_ok=True)
    input_path = args.input.resolve(strict=True) if args.input else output_path / "input.wav"
    job_path = output_path / "job"
    job_path.mkdir(exist_ok=True)
    if args.input is None:
        write_fixture(input_path)

    model_files = []
    for artifact in manifest["files"]:
        artifact_path = (model_path / artifact["filename"]).resolve(strict=True)
        if artifact_path.stat().st_size != artifact["sizeBytes"]:
            raise RuntimeError("Beat This! model size verification failed")
        if file_sha256(artifact_path) != artifact["sha256"]:
            raise RuntimeError("Beat This! model hash verification failed")
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
        "analyzerId": "beat-this",
        "profileId": profile_id,
        "modelId": manifest["id"],
        "modelName": manifest["wrapper"]["model"],
        "environmentPath": str(environment_path),
        "inputPath": str(input_path),
        "jobPath": str(job_path),
        "modelPath": str(model_path),
        "modelFiles": model_files,
    }
    started_at = time.perf_counter()
    process = subprocess.Popen(
        [str(python_path), "-I", str(worker_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4"},
    )
    stdout, _stderr = process.communicate(
        f"{json.dumps(request)}\n", timeout=30 * 60
    )
    elapsed_seconds = time.perf_counter() - started_at
    peak_memory_bytes = peak_working_set(process)
    messages = [json.loads(line) for line in stdout.splitlines()]
    terminal = messages[-1] if messages else None
    if (
        process.returncode != 0
        or not isinstance(terminal, dict)
        or terminal.get("type") != "done"
    ):
        raise RuntimeError(f"Beat This! inference failed: {terminal!r}")
    result = terminal["result"]
    if result.get("tempo") is None or not result.get("beats"):
        raise RuntimeError("Beat This! inference returned incomplete M1 signals")
    packages = package_probe(python_path, environment_path)
    return {
        "packages": packages,
        "modelId": result["modelId"],
        "modelSha256": manifest["files"][0]["sha256"],
        "workerSha256": file_sha256(worker_path),
        "durationMs": result["durationMs"],
        "tempo": result["tempo"],
        "beatCount": len(result["beats"]),
        "downbeatCount": sum(beat["downbeat"] for beat in result["beats"]),
        "elapsedSeconds": round(elapsed_seconds, 3),
        "peakWorkingSetBytes": peak_memory_bytes,
        "environmentBytes": directory_size(environment_path),
        "offlineEnforced": result["offlineEnforced"],
        "noUserCache": result["noUserCache"],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", required=True, type=Path)
    parser.add_argument("--worker", required=True, type=Path)
    parser.add_argument("--source-worker", required=True, type=Path)
    parser.add_argument("--environment", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--input", type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    print(json.dumps(run_smoke(parse_args()), indent=2, sort_keys=True))

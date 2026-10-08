from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import sys
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKER_PATH = ROOT / "resources" / "provider" / "artist_photo_ytmusic_worker.py"


def load_worker():
    spec = importlib.util.spec_from_file_location("artist_photo_ytmusic_worker", WORKER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("worker module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeClient:
    def __init__(self, search_results, details=None, playlists=None):
        self.search_results = search_results
        self.details = details or {}
        self.playlists = playlists or {}
        self.search_calls = []
        self.detail_calls = []
        self.playlist_calls = []

    def search(self, query, filter=None, limit=None):
        self.search_calls.append((query, filter, limit))
        return self.search_results

    def get_artist(self, browse_id):
        self.detail_calls.append(browse_id)
        value = self.details[browse_id]
        if isinstance(value, Exception):
            raise value
        return value

    def get_playlist(self, browse_id, limit=None):
        self.playlist_calls.append((browse_id, limit))
        value = self.playlists[browse_id]
        if isinstance(value, Exception):
            raise value
        return value


def portrait(url="https://yt3.googleusercontent.com/avatar=s240", size=240):
    return {"url": url, "width": size, "height": size}


def artist_result(name, browse_id, thumbnails=None, **extra):
    return {
        "resultType": "artist",
        "artist": name,
        "browseId": browse_id,
        "thumbnails": thumbnails if thumbnails is not None else [portrait()],
        **extra,
    }


class ArtistPhotoYtMusicWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = load_worker()

    def request(self):
        return {
            "artistName": "艾熱 AIR",
            "recordings": [
                {"videoId": "abcdefghijk", "channelId": "UC_candidate_1"},
                {"videoId": "lmnopqrstuv", "channelId": "UC_candidate_1"},
                {"videoId": "0123456789A", "channelId": None},
            ],
        }

    def test_collects_at_most_three_candidates_and_ignores_unknown_provider_fields(self):
        results = [
            artist_result(
                "艾熱 AIR",
                "UC_candidate_1",
                thumbnails=[portrait(size=120), portrait(size=240)],
                unknownProviderField={"private": True},
            ),
            artist_result("Other", "UC_candidate_2"),
            artist_result("Third", "UC_candidate_3"),
            artist_result("Fourth", "UC_candidate_4"),
        ]
        details = {
            "UC_candidate_1": {
                "thumbnails": [portrait("https://yt3.googleusercontent.com/banner", 1024)],
                "songs": {
                    "browseId": "PL1",
                    "results": [{"videoId": "abcdefghijk"}],
                },
            },
            "UC_candidate_2": {"songs": {"results": []}},
            "UC_candidate_3": {"songs": {"results": []}},
        }
        client = FakeClient(results, details)

        value = self.worker.collect_candidates(self.request(), client)

        self.assertEqual(client.search_calls, [("艾熱 AIR", "artists", 3)])
        self.assertEqual(client.detail_calls, [
            "UC_candidate_1",
            "UC_candidate_2",
            "UC_candidate_3",
        ])
        self.assertEqual(len(value), 3)
        self.assertEqual(value[0], {
            "rank": 1,
            "name": "艾熱 AIR",
            "browseId": "UC_candidate_1",
            "portrait": portrait(size=240),
            "evidence": {
                "exactName": True,
                "matchedChannelCount": 2,
                "matchedVideoCount": 1,
            },
        })
        self.assertEqual(client.playlist_calls, [])

    def test_uses_a_bounded_playlist_only_when_direct_evidence_is_absent(self):
        client = FakeClient(
            [artist_result("Candidate", "UC_candidate_2")],
            {
                "UC_candidate_2": {
                    "songs": {
                        "browseId": "PL2",
                        "results": [{"videoId": "unrelated01"}],
                    }
                }
            },
            {"PL2": {"tracks": [{"videoId": "lmnopqrstuv"}]}},
        )

        value = self.worker.collect_candidates(self.request(), client)

        self.assertEqual(client.playlist_calls, [("PL2", 100)])
        self.assertEqual(value[0]["evidence"]["matchedVideoCount"], 1)

    def test_missing_search_portrait_is_a_normal_skip_and_detail_banner_is_never_used(self):
        client = FakeClient(
            [artist_result("No portrait", "UC_no_portrait", thumbnails=[])],
            {
                "UC_no_portrait": {
                    "thumbnails": [portrait("https://yt3.googleusercontent.com/banner", 1024)],
                    "songs": {"results": []},
                }
            },
        )

        self.assertEqual(self.worker.collect_candidates(self.request(), client), [])
        self.assertEqual(client.detail_calls, [])

    def test_skips_evidence_requests_when_the_artist_has_no_recordings(self):
        client = FakeClient(
            [artist_result("Candidate", "UC_candidate_2")],
            details={},
        )

        value = self.worker.collect_candidates(
            {"artistName": "Candidate", "recordings": []},
            client,
        )

        self.assertEqual(value[0]["evidence"], {
            "exactName": True,
            "matchedChannelCount": 0,
            "matchedVideoCount": 0,
        })
        self.assertEqual(client.detail_calls, [])
        self.assertEqual(client.playlist_calls, [])

    def test_rejects_a_malformed_search_identity_and_invalid_request(self):
        client = FakeClient([
            {
                "resultType": "artist",
                "artist": "Broken",
                "thumbnails": [portrait()],
            }
        ])

        with self.assertRaisesRegex(self.worker.WorkerProtocolError, "schema-error"):
            self.worker.collect_candidates(self.request(), client)
        with self.assertRaises(ValueError):
            self.worker.validate_request({"artistName": "", "recordings": []})
        with self.assertRaises(ValueError):
            self.worker.validate_request({
                "artistName": "Artist",
                "recordings": [],
                "cookies": "not allowed",
            })

    def test_preserves_prior_candidates_when_a_lower_rank_schema_drifts(self):
        client = FakeClient(
            [
                artist_result("Candidate", "UC_candidate_1"),
                {"resultType": "artist", "artist": "Broken"},
            ],
            {"UC_candidate_1": {"songs": {"results": []}}},
        )

        with self.assertRaises(self.worker.WorkerProtocolError) as raised:
            self.worker.collect_candidates(self.request(), client)

        self.assertEqual(raised.exception.reason, "schema-error")
        self.assertEqual(len(raised.exception.candidates), 1)

    def test_accepts_only_square_allowlisted_portraits_with_bounded_dimensions(self):
        results = [
            artist_result(
                "Bad host",
                "UC_bad_host",
                thumbnails=[portrait("https://example.test/avatar")],
            ),
            artist_result(
                "Not square",
                "UC_not_square",
                thumbnails=[{
                    "url": "https://yt3.ggpht.com/avatar",
                    "width": 240,
                    "height": 120,
                }],
            ),
            artist_result(
                "Good",
                "UC_good",
                thumbnails=[portrait("https://lh3.googleusercontent.com/avatar", 512)],
            ),
        ]
        client = FakeClient(results, {"UC_good": {"songs": {"results": []}}})

        value = self.worker.collect_candidates(self.request(), client)

        self.assertEqual(len(value), 1)
        self.assertEqual(value[0]["browseId"], "UC_good")
        self.assertEqual(value[0]["rank"], 1)

    def test_maps_rate_limits_without_forwarding_provider_text(self):
        class RateLimitError(Exception):
            status_code = 429

        error = RateLimitError("private query and provider body")
        self.assertEqual(self.worker.classify_provider_error(error), "rate-limited")
        rejected = RateLimitError("private query and provider body")
        rejected.status_code = 403
        self.assertEqual(
            self.worker.classify_provider_error(rejected), "provider-rejected"
        )
        self.assertEqual(
            self.worker.classify_provider_error(RuntimeError("unavailable")),
            "provider-unavailable",
        )

        with self.assertRaises(self.worker.ProviderHttpStatusError) as raised:
            self.worker.reject_provider_http_error(
                types.SimpleNamespace(status_code=429)
            )
        self.assertEqual(
            self.worker.classify_provider_error(raised.exception),
            "rate-limited",
        )
        with self.assertRaises(self.worker.ProviderHttpStatusError):
            self.worker.reject_provider_http_error(
                types.SimpleNamespace(status_code=302)
            )

        pinned_error_type = type(
            "YTMusicServerError",
            (Exception,),
            {"__module__": "ytmusicapi.exceptions"},
        )
        self.assertEqual(
            self.worker.classify_provider_error(
                pinned_error_type(
                    "Server returned HTTP 429: Too Many Requests.\nprivate body"
                )
            ),
            "provider-unavailable",
        )

    def test_anonymous_client_rejects_all_request_and_response_cookies(self):
        sessions = []

        class FakeCookieJar:
            def set_policy(self, policy):
                self.policy = policy

        class FakeSession:
            def __init__(self):
                self.cookies = FakeCookieJar()
                self.hooks = {"response": []}
                self.trust_env = True
                sessions.append(self)

        class FakeYTMusic:
            def __init__(self, requests_session):
                self.requests_session = requests_session
                self.cookies = {"SOCS": "CAI"}

        requests_module = types.ModuleType("requests")
        requests_module.Session = FakeSession
        ytmusicapi_module = types.ModuleType("ytmusicapi")
        ytmusicapi_module.YTMusic = FakeYTMusic

        with patch.dict(
            sys.modules,
            {"requests": requests_module, "ytmusicapi": ytmusicapi_module},
        ):
            client = self.worker.create_client()

        self.assertEqual(client.cookies, {})
        self.assertIs(client.requests_session, sessions[0])
        self.assertFalse(sessions[0].trust_env)
        self.assertEqual(
            sessions[0].hooks["response"],
            [self.worker.reject_provider_http_error],
        )
        self.assertFalse(sessions[0].cookies.policy.set_ok(None, None))
        self.assertFalse(sessions[0].cookies.policy.return_ok(None, None))

    @unittest.skipUnless(
        importlib.util.find_spec("requests"),
        "Requests is supplied by the prepared provider runtime",
    )
    def test_anonymous_session_rejects_redirect_before_cookie_replay(self):
        observed_cookie_headers = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/start":
                    self.send_response(302)
                    self.send_header("Location", "/target")
                    self.send_header("Set-Cookie", "private=value; Path=/")
                    self.end_headers()
                    return
                observed_cookie_headers.append(self.headers.get("Cookie"))
                self.send_response(204)
                self.end_headers()

            def log_message(self, format, *args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            session = self.worker.create_anonymous_session()
            with self.assertRaises(self.worker.ProviderHttpStatusError):
                session.get(
                    f"http://127.0.0.1:{server.server_port}/start",
                    timeout=2,
                )
            self.assertEqual(observed_cookie_headers, [])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_main_emits_exact_bounded_partial_and_error_results(self):
        candidate = {
            "rank": 1,
            "name": "Candidate",
            "browseId": "UC_candidate_1",
            "portrait": portrait(),
            "evidence": {
                "exactName": True,
                "matchedChannelCount": 0,
                "matchedVideoCount": 0,
            },
        }
        cases = [
            (
                self.worker.WorkerProtocolError("schema-error", [candidate]),
                {
                    "status": "partial",
                    "reason": "schema-error",
                    "candidates": [candidate],
                },
            ),
            (
                self.worker.ProviderHttpStatusError(429),
                {"status": "error", "reason": "rate-limited"},
            ),
            (
                self.worker.WorkerProtocolError("schema-error"),
                {"status": "error", "reason": "schema-error"},
            ),
        ]

        for error, expected in cases:
            with self.subTest(expected=expected):
                with (
                    patch.object(
                        self.worker,
                        "read_request",
                        return_value={"artistName": "Artist", "recordings": []},
                    ),
                    patch.object(self.worker, "create_client", return_value=object()),
                    patch.object(
                        self.worker,
                        "collect_candidates",
                        side_effect=error,
                    ),
                    patch.object(self.worker, "write_result") as write_result,
                ):
                    self.assertEqual(self.worker.main(), 0)
                write_result.assert_called_once_with(expected)

    def test_read_request_rejects_overflow_trailing_data_and_schema_drift(self):
        valid = {"artistName": "Artist", "recordings": []}
        invalid_payloads = [
            b"x" * (self.worker.MAX_REQUEST_BYTES + 1),
            json.dumps(valid).encode("utf-8") + b"\n{}",
            b'\xff{"artistName":"Artist","recordings":[]}',
            json.dumps({**valid, "cookies": "forbidden"}).encode("utf-8"),
            json.dumps({
                "artistName": "Artist",
                "recordings": [
                    {"videoId": "abcdefghijk", "channelId": None}
                ] * 4,
            }).encode("utf-8"),
        ]

        for payload in invalid_payloads:
            with self.subTest(size=len(payload)):
                fake_stdin = types.SimpleNamespace(buffer=io.BytesIO(payload))
                with patch.object(self.worker.sys, "stdin", fake_stdin):
                    with self.assertRaises(ValueError):
                        self.worker.read_request()

    def test_writes_utf8_json_even_when_windows_stdout_uses_cp950(self):
        byte_stream = io.BytesIO()
        text_stream = io.TextIOWrapper(byte_stream, encoding="cp950")
        value = {"status": "ok", "name": "艾热 AIR"}

        try:
            with patch.object(self.worker.sys, "stdout", text_stream):
                self.worker.write_result(value)
                text_stream.flush()
            expected = (
                json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                + "\n"
            ).encode("utf-8")
            self.assertEqual(
                byte_stream.getvalue(),
                expected,
            )
        finally:
            text_stream.detach()


if __name__ == "__main__":
    unittest.main()

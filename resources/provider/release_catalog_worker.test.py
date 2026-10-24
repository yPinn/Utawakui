"""Contract tests for the bounded anonymous release worker."""

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "release_worker", Path(__file__).with_name("release_catalog_worker.py")
)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

VIDEO = "rgNdeflYdYw"
PLAYLIST = "OLAK5uy_test_release"
BROWSE = "MPREb_test_release"


class Client:
    def get_watch_playlist(self, **kwargs):
        return {
            "tracks": [
                {
                    "videoId": VIDEO,
                    "videoType": "MUSIC_VIDEO_TYPE_ATV",
                    "album": {"id": BROWSE},
                }
            ]
        }

    def get_album_browse_id(self, playlist):
        return BROWSE

    def get_album(self, browse):
        return {
            "title": "Release",
            "type": "Album",
            "year": "2021",
            "trackCount": 2,
            "audioPlaylistId": PLAYLIST,
            "artists": [{"name": "Artist"}],
            "tracks": [{"videoId": "WRONGalias1"}],
        }

    def get_playlist(self, playlist, limit):
        return {
            "id": PLAYLIST,
            "trackCount": 2,
            "tracks": [
                {
                    "videoId": VIDEO,
                    "title": "Second",
                    "duration_seconds": 257,
                    "isAvailable": True,
                },
                {"videoId": "qFeKKGDoF2E", "title": "First", "isAvailable": True},
            ],
        }

    def search(self, query, **kwargs):
        return [
            {
                "browseId": BROWSE,
                "title": "Release",
                "artists": [{"name": "Artist"}],
                "year": "2021",
            }
        ]


class ReleaseWorkerTests(unittest.TestCase):
    def test_cover_reference_does_not_grant_arbitrary_endpoints(self):
        self.assertEqual(
            worker.artwork_url([{"url": "https://lh3.googleusercontent.com/a"}]),
            "https://lh3.googleusercontent.com/a",
        )
        for url in [
            "http://lh3.googleusercontent.com/a",
            "https://u:p@lh3.googleusercontent.com/a",
            "https://lh3.googleusercontent.com.evil.test/a",
            "https://lh3.googleusercontent.com/" + "x" * 2049,
            "https://[bad",
            "https://lh3.googleusercontent.com/a\n",
        ]:
            self.assertIsNone(worker.artwork_url([{"url": url}]))

    def test_formal_playlist_owns_ids_and_order_not_album_browse(self):
        result = worker.fetch_release(Client(), {"action": "resolve", "videoId": VIDEO})
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["manifest"]["slots"][0]["videoId"], VIDEO)
        self.assertEqual(result["manifest"]["completeness"], "complete")
        self.assertEqual(result["manifest"]["type"], "album")

    def test_playlist_only_refresh_verifies_returned_source(self):
        client = Client()
        client.get_album = lambda browse: {
            **Client().get_album(browse),
            "audioPlaylistId": "OLAK5uy_another",
        }
        with self.assertRaises(ValueError):
            worker.fetch_release(client, {"action": "album", "playlistId": PLAYLIST})

    def test_same_name_without_exact_video_is_not_an_automatic_match(self):
        client = Client()
        client.get_playlist = lambda *args, **kwargs: {
            "id": PLAYLIST,
            "trackCount": 1,
            "tracks": [{"videoId": "8iuLXODzL04", "title": "Second"}],
        }
        self.assertEqual(
            worker.fetch_release(client, {"action": "resolve", "videoId": VIDEO})[
                "status"
            ],
            "no-match",
        )

    def test_recommendation_album_does_not_supply_original_track(self):
        client = Client()
        client.get_watch_playlist = lambda **kwargs: {
            "tracks": [{"videoId": "8iuLXODzL04", "album": {"id": BROWSE}}]
        }
        self.assertEqual(
            worker.fetch_release(client, {"action": "resolve", "videoId": VIDEO})[
                "status"
            ],
            "no-match",
        )

    def test_music_video_does_not_automatically_become_album_audio(self):
        client = Client()
        client.get_watch_playlist = lambda **kwargs: {
            "tracks": [
                {
                    "videoId": VIDEO,
                    "videoType": "MUSIC_VIDEO_TYPE_OMV",
                    "album": {"id": BROWSE},
                }
            ]
        }
        self.assertEqual(
            worker.fetch_release(client, {"action": "resolve", "videoId": VIDEO})[
                "status"
            ],
            "no-match",
        )

    def test_repeated_ids_keep_distinct_positions(self):
        client = Client()
        client.get_playlist = lambda *args, **kwargs: {
            "id": PLAYLIST,
            "trackCount": 2,
            "tracks": [
                {"videoId": VIDEO, "title": "Song"},
                {"videoId": VIDEO, "title": "Song"},
            ],
        }
        slots = worker.fetch_release(client, {"action": "resolve", "videoId": VIDEO})[
            "manifest"
        ]["slots"]
        self.assertEqual([slot["position"] for slot in slots], [1, 2])

    def test_unavailable_slots_are_preserved_and_short_response_is_partial(self):
        client = Client()
        client.get_playlist = lambda *args, **kwargs: {
            "id": PLAYLIST,
            "trackCount": 3,
            "tracks": [
                {"videoId": VIDEO, "title": "Song"},
                {"videoId": None, "title": None, "isAvailable": False},
            ],
        }
        manifest = worker.fetch_release(
            client, {"action": "resolve", "videoId": VIDEO}
        )["manifest"]
        self.assertEqual(len(manifest["slots"]), 2)
        self.assertFalse(manifest["slots"][1]["available"])
        self.assertEqual(manifest["completeness"], "partial")

    def test_nonempty_continuation_does_not_claim_completeness(self):
        client = Client()
        client.get_playlist = lambda *args, **kwargs: {
            **Client().get_playlist(PLAYLIST, 10),
            "continuations": "next",
        }
        self.assertEqual(
            worker.fetch_release(client, {"action": "resolve", "videoId": VIDEO})[
                "manifest"
            ]["completeness"],
            "partial",
        )

    def test_invalid_or_conflicting_count_cannot_be_complete(self):
        for count in [5001, "9", -1, True, 3]:
            with self.subTest(count=count):
                client = Client()
                client.get_album = lambda browse: {
                    **Client().get_album(browse),
                    "trackCount": count,
                }
                result = worker.fetch_release(
                    client, {"action": "resolve", "videoId": VIDEO}
                )
                self.assertEqual(result["manifest"]["completeness"], "partial")

    def session(self):
        class Response:
            status_code = 200
            closed = False
            chunks = [b"{}"]

            def iter_content(self, size):
                yield from self.chunks

            def close(self):
                self.closed = True

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise ValueError("http error")

        class Session:
            def __init__(self):
                self.cookies = SimpleNamespace(
                    set_policy=lambda policy: setattr(self, "policy", policy)
                )
                self.response = Response()

            def request(self, method, url, **kwargs):
                self.arguments = kwargs
                return self.response

        with patch.dict(
            sys.modules,
            {
                "requests": SimpleNamespace(Session=Session),
                "ytmusicapi": SimpleNamespace(
                    YTMusic=lambda requests_session: SimpleNamespace(
                        _session=requests_session
                    )
                ),
            },
        ):
            return worker.create_client()._session

    def test_anonymous_session_blocks_ambient_state_and_arbitrary_endpoints(self):
        session = self.session()
        self.assertFalse(session.trust_env)
        self.assertFalse(session.policy.set_ok(None, None))
        self.assertFalse(session.policy.return_ok(None, None))
        for url in [
            "http://music.youtube.com/",
            "https://music.youtube.com.evil.test/",
            "https://user@music.youtube.com/",
            "https://music.youtube.com:443/",
            "https://music.youtube.com/arbitrary",
        ]:
            with self.assertRaises(ValueError):
                session.request("GET", url)
        session.request("GET", "https://music.youtube.com")
        self.assertEqual(session.arguments["timeout"], (4, 8))
        self.assertFalse(session.arguments["allow_redirects"])
        self.assertTrue(session.response.closed)

    def test_session_limits_requests_and_closes_oversized_or_redirect_response(self):
        session = self.session()
        for _ in range(16):
            session.request("POST", "https://music.youtube.com/youtubei/v1/browse")
        with self.assertRaises(ValueError):
            session.request("POST", "https://music.youtube.com/youtubei/v1/browse")
        for status, chunks in [
            (307, [b"{}"]),
            (429, [b"{}"]),
            (200, [b"x" * (worker.MAX_BYTES + 1)]),
        ]:
            session = self.session()
            session.response.status_code = status
            session.response.chunks = chunks
            with self.assertRaises(ValueError):
                session.request("GET", "https://music.youtube.com/")
            self.assertTrue(session.response.closed)

    def test_request_rejects_urls_and_unknown_fields(self):
        for request in [
            {"action": "resolve", "videoId": VIDEO, "url": "https://bad.test"},
            {"action": "album", "playlistId": "https://bad.test"},
            {"action": "resolve", "videoId": "--unsafe"},
            {"action": "search", "query": "x\x00"},
        ]:
            with self.assertRaises(ValueError):
                worker.validate_request(request)

    def test_search_returns_only_bounded_album_candidates(self):
        result = worker.fetch_release(
            Client(), {"action": "search", "query": "Artist Release"}
        )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["candidates"][0]["browseId"], BROWSE)


if __name__ == "__main__":
    unittest.main()

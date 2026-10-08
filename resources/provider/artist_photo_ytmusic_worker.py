"""One-shot anonymous YT Music artist-photo observation worker.

The Electron main process supplies one bounded artist identity request over
stdin. This worker never accepts authentication material, paths, URLs, locale,
or provider options from the renderer and emits exactly one normalized JSON
result without forwarding provider bodies or exception text.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from http.cookiejar import DefaultCookiePolicy
from typing import Any
from urllib.parse import urlsplit


MAX_REQUEST_BYTES = 8192
MAX_TEXT_LENGTH = 200
MAX_RECORDINGS = 3
MAX_CANDIDATES = 3
MAX_PLAYLIST_ITEMS = 100
VIDEO_ID_RE = re.compile(r"^[0-9A-Za-z_-]{11}$")
OPAQUE_ID_RE = re.compile(r"^[0-9A-Za-z_-]{1,128}$")
PORTRAIT_HOSTS = {
    "yt3.googleusercontent.com",
    "yt3.ggpht.com",
    "lh3.googleusercontent.com",
}


class WorkerProtocolError(Exception):
    """A bounded provider-shape failure that is safe to classify."""

    def __init__(
        self,
        reason: str = "schema-error",
        candidates: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(reason)
        self.reason = reason
        self.candidates = list(candidates or [])


class ProviderHttpStatusError(Exception):
    """HTTP failure reduced to the status needed by the app policy."""

    def __init__(self, status_code: int) -> None:
        super().__init__("provider HTTP request failed")
        self.status_code = status_code


class RejectAllCookiePolicy(DefaultCookiePolicy):
    """Prevent the anonymous one-shot session from sending or retaining cookies."""

    def set_ok(self, cookie: object, request: object) -> bool:
        return False

    def return_ok(self, cookie: object, request: object) -> bool:
        return False


SCHEMA_DRIFT_ERRORS = (KeyError, IndexError, TypeError, ValueError, AttributeError)


def _has_exact_keys(value: object, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def validate_request(value: object) -> dict[str, Any]:
    """Validate the complete app-owned request schema."""
    if not _has_exact_keys(value, {"artistName", "recordings"}):
        raise ValueError("invalid request")
    artist_name = value.get("artistName")
    recordings = value.get("recordings")
    if (
        not isinstance(artist_name, str)
        or not artist_name.strip()
        or len(artist_name) > MAX_TEXT_LENGTH
        or not isinstance(recordings, list)
        or len(recordings) > MAX_RECORDINGS
    ):
        raise ValueError("invalid request")
    for recording in recordings:
        if not _has_exact_keys(recording, {"videoId", "channelId"}):
            raise ValueError("invalid request")
        video_id = recording.get("videoId")
        channel_id = recording.get("channelId")
        if not isinstance(video_id, str) or not VIDEO_ID_RE.fullmatch(video_id):
            raise ValueError("invalid request")
        if channel_id is not None and (
            not isinstance(channel_id, str)
            or not OPAQUE_ID_RE.fullmatch(channel_id)
        ):
            raise ValueError("invalid request")
    return value


def read_request() -> dict[str, Any]:
    """Read exactly one bounded JSON request from stdin."""
    raw = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if not raw or len(raw) > MAX_REQUEST_BYTES:
        raise ValueError("invalid request")
    if sys.stdin.buffer.read(1):
        raise ValueError("invalid request")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid request") from error
    return validate_request(value)


def write_result(value: dict[str, Any]) -> None:
    """Emit one compact result and no provider diagnostics."""
    payload = json.dumps(
        value, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    sys.stdout.buffer.write(payload + b"\n")
    sys.stdout.buffer.flush()


def _normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def select_portrait(thumbnails: object) -> dict[str, Any] | None:
    """Choose the largest square search-result portrait on the exact allowlist."""
    if not isinstance(thumbnails, list):
        return None
    valid: list[dict[str, Any]] = []
    for item in thumbnails:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        width = item.get("width")
        height = item.get("height")
        if (
            not isinstance(url, str)
            or len(url) > 2048
            or not _is_int(width)
            or not _is_int(height)
            or width < 60
            or width > 2048
            or height != width
        ):
            continue
        try:
            parsed = urlsplit(url)
            if (
                parsed.scheme != "https"
                or parsed.hostname not in PORTRAIT_HOSTS
                or parsed.username
                or parsed.password
                or parsed.port
            ):
                continue
        except ValueError:
            continue
        valid.append({"url": url, "width": width, "height": height})
    return max(valid, key=lambda item: item["width"], default=None)


def _video_ids(items: object) -> set[str]:
    if not isinstance(items, list):
        return set()
    return {
        video_id
        for item in items
        if isinstance(item, dict)
        and isinstance((video_id := item.get("videoId")), str)
        and VIDEO_ID_RE.fullmatch(video_id)
    }


def _collect_candidate(
    request: dict[str, Any],
    search_result: object,
    client: Any,
    recording_video_ids: set[str],
) -> dict[str, Any] | None:
    if not isinstance(search_result, dict):
        raise WorkerProtocolError()
    candidate_name = search_result.get("artist")
    browse_id = search_result.get("browseId")
    if (
        search_result.get("resultType") != "artist"
        or not isinstance(candidate_name, str)
        or not candidate_name.strip()
        or len(candidate_name) > MAX_TEXT_LENGTH
        or not isinstance(browse_id, str)
        or not OPAQUE_ID_RE.fullmatch(browse_id)
    ):
        raise WorkerProtocolError()

    # Search-result thumbnails are the portrait source. get_artist()
    # thumbnails may be a wide page banner and are deliberately ignored.
    portrait = select_portrait(search_result.get("thumbnails"))
    if portrait is None:
        return None

    matched_channel_count = 0
    matched_video_ids: set[str] = set()
    if recording_video_ids:
        detail = client.get_artist(browse_id)
        if not isinstance(detail, dict):
            raise WorkerProtocolError()
        songs = detail.get("songs")
        if songs is not None and not isinstance(songs, dict):
            raise WorkerProtocolError()
        songs = songs or {}
        direct_video_ids = _video_ids(songs.get("results"))
        matched_video_ids = recording_video_ids.intersection(direct_video_ids)
        matched_channel_count = sum(
            1
            for recording in request["recordings"]
            if recording["channelId"] == browse_id
        )

        if matched_channel_count == 0 and not matched_video_ids:
            playlist_id = songs.get("browseId")
            if isinstance(playlist_id, str) and OPAQUE_ID_RE.fullmatch(playlist_id):
                playlist = client.get_playlist(
                    playlist_id, limit=MAX_PLAYLIST_ITEMS
                )
                if not isinstance(playlist, dict):
                    raise WorkerProtocolError()
                playlist_video_ids = _video_ids(playlist.get("tracks"))
                matched_video_ids = recording_video_ids.intersection(
                    playlist_video_ids
                )

    return {
        "name": candidate_name,
        "browseId": browse_id,
        "portrait": portrait,
        "evidence": {
            "exactName": _normalize_name(candidate_name)
            == _normalize_name(request["artistName"]),
            "matchedChannelCount": matched_channel_count,
            "matchedVideoCount": len(matched_video_ids),
        },
    }


def collect_candidates(
    request: dict[str, Any], client: Any
) -> list[dict[str, Any]]:
    """Collect normalized observations while retaining no provider response."""
    search_results = client.search(
        request["artistName"], filter="artists", limit=MAX_CANDIDATES
    )
    if not isinstance(search_results, list):
        raise WorkerProtocolError()

    recording_video_ids = {
        recording["videoId"] for recording in request["recordings"]
    }
    candidates: list[dict[str, Any]] = []
    for search_result in search_results[:MAX_CANDIDATES]:
        try:
            candidate = _collect_candidate(
                request, search_result, client, recording_video_ids
            )
        except WorkerProtocolError as error:
            if candidates and not error.candidates:
                raise WorkerProtocolError(error.reason, candidates) from error
            raise
        except SCHEMA_DRIFT_ERRORS as error:
            raise WorkerProtocolError("schema-error", candidates) from error
        except Exception as error:
            if candidates:
                raise WorkerProtocolError(
                    classify_provider_error(error), candidates
                ) from error
            raise
        if candidate is not None:
            candidate["rank"] = len(candidates) + 1
            candidates.append(candidate)
    return candidates


def reject_provider_http_error(response: Any, *args: Any, **kwargs: Any) -> Any:
    """Stop errors and redirects before status or cookies can be replayed."""
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int) and status_code >= 300:
        raise ProviderHttpStatusError(status_code)
    return response


def classify_provider_error(error: BaseException) -> str:
    """Map provider failures without inspecting or forwarding private text."""
    status_code = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)
    if status_code == 429:
        return "rate-limited"
    if status_code in {400, 401, 403}:
        return "provider-rejected"
    return "provider-unavailable"


def create_anonymous_session() -> Any:
    """Create a fail-closed session without ambient auth, proxies, or redirects."""
    from requests import Session

    session = Session()
    session.trust_env = False
    session.cookies.set_policy(RejectAllCookiePolicy())
    session.hooks.setdefault("response", []).append(reject_provider_http_error)
    return session


def create_client() -> Any:
    """Create the anonymous client; no auth headers, cookies, or browser state."""
    from ytmusicapi import YTMusic

    session = create_anonymous_session()
    client = YTMusic(requests_session=session)
    client.cookies = {}
    return client


def main() -> int:
    try:
        request = read_request()
    except ValueError:
        write_result({"status": "error", "reason": "schema-error"})
        return 0

    try:
        candidates = collect_candidates(request, create_client())
    except WorkerProtocolError as error:
        if error.candidates:
            write_result({
                "status": "partial",
                "reason": error.reason,
                "candidates": error.candidates,
            })
        else:
            write_result({"status": "error", "reason": error.reason})
        return 0
    except SCHEMA_DRIFT_ERRORS:
        write_result({"status": "error", "reason": "schema-error"})
        return 0
    except Exception as error:  # Provider exceptions are intentionally opaque.
        write_result({"status": "error", "reason": classify_provider_error(error)})
        return 0

    if candidates:
        write_result({"status": "ok", "candidates": candidates})
    else:
        write_result({"status": "no-match", "candidates": []})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

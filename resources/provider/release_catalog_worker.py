"""Anonymous, bounded YouTube Music release metadata worker.

The formal audio playlist owns track identity. Album browsing can return
substituted video IDs and must never establish local ownership.
"""

import json
import re
import sys
from http.cookiejar import DefaultCookiePolicy
from urllib.parse import urlsplit

MAX_BYTES = 2 * 1024 * 1024
MAX_SLOTS = 5000
VIDEO = re.compile(r"[A-Za-z0-9_-]{11}\Z")
PLAYLIST = re.compile(r"OLAK5uy_[A-Za-z0-9_-]{1,120}\Z")
BROWSE = re.compile(r"MPRE[A-Za-z0-9_-]{1,120}\Z")
TYPES = {"Album": "album", "Single": "single", "EP": "ep"}


def text(value: object, limit: int = 200) -> str:
    """Accept bounded single-line source text without executing or repairing it."""
    if not isinstance(value, str) or len(value) > limit:
        return ""
    if any(ord(char) < 32 or 127 <= ord(char) <= 159 for char in value):
        return ""
    return value.strip()


def identifier(value: object, pattern: re.Pattern) -> bool:
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def validate_request(request: object) -> None:
    """Reject URLs, unknown fields and unbounded renderer-derived input."""
    if not isinstance(request, dict):
        raise ValueError("request")
    fields = {
        "resolve": "videoId",
        "album": "playlistId",
        "browse": "browseId",
        "search": "query",
    }
    field = fields.get(request.get("action"))
    if field is None or set(request) != {"action", field}:
        raise ValueError("request")
    value = request[field]
    patterns = {"videoId": VIDEO, "playlistId": PLAYLIST, "browseId": BROWSE}
    if field in patterns:
        if not identifier(value, patterns[field]):
            raise ValueError("request")
    elif not text(value):
        raise ValueError("request")


def artist_text(value: object) -> str:
    if not isinstance(value, list):
        return ""
    return text(
        ", ".join(
            filter(
                None,
                (
                    text(item.get("name"))
                    for item in value[:16]
                    if isinstance(item, dict)
                ),
            )
        )
    )


def artwork_url(value: object) -> str | None:
    """Select a bounded public cover reference; never fetch images here."""
    if not isinstance(value, list):
        return None
    for item in reversed(value[:32]):
        url = item.get("url") if isinstance(item, dict) else None
        if (
            not isinstance(url, str)
            or not url
            or len(url) > 2048
            or any(ord(char) <= 32 or ord(char) == 127 for char in url)
        ):
            continue
        try:
            parsed = urlsplit(url)
        except ValueError:
            continue
        if parsed.scheme == "https" and parsed.netloc in {
            "lh3.googleusercontent.com",
            "yt3.googleusercontent.com",
            "i.ytimg.com",
        }:
            return url
    return None


def fetch_release(client: object, request: dict) -> dict:
    """Read one release, retaining unplayable and repeated source positions."""
    validate_request(request)
    action = request["action"]
    if action == "search":
        results = client.search(request["query"], filter="albums", limit=5)
        candidates = []
        for item in results[:5]:
            if (
                not isinstance(item, dict)
                or not identifier(item.get("browseId"), BROWSE)
                or not text(item.get("title"))
            ):
                continue
            candidates.append(
                {
                    "browseId": item["browseId"],
                    "title": text(item["title"]),
                    "artist": artist_text(item.get("artists")),
                    "year": text(item.get("year"), 4),
                }
            )
        return {"status": "ok", "candidates": candidates}
    if action == "resolve":
        watch = client.get_watch_playlist(videoId=request["videoId"], limit=1)
        exact = [
            item
            for item in watch.get("tracks", [])
            if item.get("videoId") == request["videoId"]
            and item.get("videoType") == "MUSIC_VIDEO_TYPE_ATV"
        ]
        album_ids = {
            item["album"].get("id")
            for item in exact
            if isinstance(item.get("album"), dict)
        }
        if len(album_ids) != 1:
            return {"status": "no-match"}
        browse_id = next(iter(album_ids))
    elif action == "album":
        browse_id = client.get_album_browse_id(request["playlistId"])
    else:
        browse_id = request["browseId"]
    if not identifier(browse_id, BROWSE):
        return {"status": "no-match"}
    album = client.get_album(browse_id)
    playlist_id = album.get("audioPlaylistId")
    if not identifier(playlist_id, PLAYLIST) or not text(album.get("title")):
        raise ValueError("source identity")
    if action == "album" and playlist_id != request["playlistId"]:
        raise ValueError("source identity")
    playlist = client.get_playlist(playlist_id, limit=MAX_SLOTS + 1)
    if playlist.get("id") != playlist_id:
        raise ValueError("source identity")
    tracks = playlist.get("tracks")
    if not isinstance(tracks, list) or not tracks or len(tracks) > MAX_SLOTS:
        raise ValueError("source size")
    if action == "resolve" and not any(
        item.get("videoId") == request["videoId"] for item in tracks
    ):
        return {"status": "no-match"}
    counts = [
        value
        for value in [album.get("trackCount"), playlist.get("trackCount")]
        if value is not None
    ]
    valid_counts = all(
        type(value) is int and 1 <= value <= MAX_SLOTS for value in counts
    )
    total = counts[0] if counts and valid_counts and len(set(counts)) == 1 else None
    complete = total == len(tracks) and not playlist.get("continuations")
    slots = []
    for position, track in enumerate(tracks, 1):
        if not isinstance(track, dict):
            raise ValueError("source track")
        video_id = track.get("videoId")
        duration = track.get("duration_seconds")
        slots.append(
            {
                "position": position,
                "videoId": video_id if identifier(video_id, VIDEO) else None,
                "title": text(track.get("title")),
                "artist": artist_text(track.get("artists"))
                or artist_text(album.get("artists")),
                "duration": duration
                if type(duration) in (int, float) and 0 < duration < 86400
                else None,
                "available": identifier(video_id, VIDEO)
                and track.get("isAvailable") is not False,
            }
        )
    year = album.get("year")
    artwork = artwork_url(album.get("thumbnails"))
    return {
        "status": "ok",
        "manifest": {
            "playlistId": playlist_id,
            "browseId": browse_id,
            "title": text(album["title"]),
            "artist": artist_text(album.get("artists")),
            "type": TYPES.get(album.get("type"), "unknown"),
            "year": year
            if isinstance(year, str) and re.fullmatch(r"[1-9][0-9]{3}", year)
            else None,
            "reportedTotal": total,
            "completeness": "complete" if complete else "partial",
            "slots": slots,
            "artworkUrl": artwork,
        },
    }


def create_client() -> object:
    """No ambient auth, proxies, cookies, redirects or arbitrary endpoints."""
    from requests import Session
    from ytmusicapi import YTMusic

    class RejectCookies(DefaultCookiePolicy):
        def set_ok(self, cookie, request):
            return False

        def return_ok(self, cookie, request):
            return False

    class BoundedSession(Session):
        calls = 0

        def request(self, method, url, **kwargs):
            parsed = urlsplit(url)
            if (
                parsed.scheme != "https"
                or parsed.netloc != "music.youtube.com"
                or parsed.path
                not in {
                    "",
                    "/",
                    "/playlist",
                    "/youtubei/v1/browse",
                    "/youtubei/v1/next",
                    "/youtubei/v1/search",
                }
            ):
                raise ValueError("endpoint")
            self.calls += 1
            if self.calls > 16:
                raise ValueError("request limit")
            kwargs.update(timeout=(4, 8), allow_redirects=False, stream=True)
            response = super().request(method, url, **kwargs)
            try:
                if response.status_code >= 300:
                    response.raise_for_status()
                    raise ValueError("redirect")
                chunks = bytearray()
                for chunk in response.iter_content(65536):
                    chunks.extend(chunk)
                    if len(chunks) > MAX_BYTES:
                        raise ValueError("response size")
                response._content = bytes(chunks)
                response._content_consumed = True
                return response
            finally:
                response.close()

    session = BoundedSession()
    session.trust_env = False
    session.cookies.set_policy(RejectCookies())
    client = YTMusic(requests_session=session)
    client.cookies = {}
    return client


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192:
            raise ValueError("request size")
        request = json.loads(raw)
        validate_request(request)
        client = create_client()
        try:
            result = fetch_release(client, request)
        finally:
            client._session.close()
    except (ValueError, KeyError, TypeError, IndexError):
        result = {"status": "error", "reason": "schema-error"}
    except Exception:
        result = {"status": "error", "reason": "provider-unavailable"}
    output = json.dumps(result, ensure_ascii=True, allow_nan=False)
    if len(output.encode("utf-8")) > MAX_BYTES:
        output = '{"status":"error","reason":"schema-error"}'
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

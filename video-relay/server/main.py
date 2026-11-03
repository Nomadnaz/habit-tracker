"""Video Relay server: social link in, plain watermarked MP4 out."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg
import yt_dlp
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

RELAY_KEY = os.environ.get("RELAY_KEY")  # unset = no key needed (running on your own PC)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()  # bundled with the pip package, no separate install
LOGO = Path(__file__).with_name("watermark.png")
PAGE = Path(__file__).with_name("index.html")
COOKIES = Path(__file__).with_name("cookies.txt")  # optional, for Instagram posts that need a login

app = FastAPI()


class ConvertRequest(BaseModel):
    url: str


def video_width(path: Path) -> int:
    frames = imageio_ffmpeg.read_frames(str(path))
    width = next(frames)["size"][0]
    frames.close()
    return width


@app.get("/")
def page():
    return FileResponse(PAGE)


@app.post("/convert")
def convert(req: ConvertRequest, authorization: str = Header("")):
    if RELAY_KEY and authorization != f"Bearer {RELAY_KEY}":
        raise HTTPException(401, "Bad key")

    work = Path(tempfile.mkdtemp())
    try:
        opts = {
            "outtmpl": str(work / "src.%(ext)s"),
            "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
            "merge_output_format": "mp4",
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
        "noprogress": True,
        }
        if COOKIES.exists():
            opts["cookiefile"] = str(COOKIES)
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(req.url, download=True)
        except yt_dlp.utils.DownloadError as e:
            raise HTTPException(422, f"Couldn't get a video from that link: {e.msg or e}")
        src = Path(info["requested_downloads"][0]["filepath"])

        # Logo is 15% of the video's width, inset 3% from the bottom-right corner.
        width = video_width(src)
        logo_w = max(2, round(width * 0.15) // 2 * 2)
        margin = round(width * 0.03)
        out = work / "video.mp4"
        subprocess.run(
            [FFMPEG, "-v", "error", "-y", "-i", str(src), "-i", str(LOGO),
             "-filter_complex",
             f"[1]scale={logo_w}:-1[wm];[0:v][wm]overlay=W-w-{margin}:H-h-{margin},format=yuv420p[v]",
             "-map", "[v]", "-map", "0:a?",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
             "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
             str(out)],
            check=True,
        )
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise

    return FileResponse(out, media_type="video/mp4", filename="video.mp4",
                        background=BackgroundTask(shutil.rmtree, work, ignore_errors=True))

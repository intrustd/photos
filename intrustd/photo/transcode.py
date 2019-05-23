import argparse
import subprocess
import json
import os
import sys
import decimal
import math

from intrustd.tasks import schedule_command

from .ffmpeg import ffprobe
from .util import get_photo_dir
from .schema import session_scope, VideoFormat

args = argparse.ArgumentParser(description='Transcode an uploaded video file')
args.add_argument('input', metavar='INPUT', type=str,
                  help='Name of the input file (must be in format ffmpeg will understand)')
args.add_argument('output', metavar='OUTPUT', type=str,
                  help='Name of output directory')
args.add_argument('--max-bitrate', dest='max_bitrate', type=str, required=True,
                  help='Max bitrate for combined audio/video')
args.add_argument('--buf-size', dest='bufsize', type=str, required=True,
                  help='Transcode buffer size')
args.add_argument('--width', dest='width', type=int, required=True,
                  help='Width of resulting video')
args.add_argument('--height', dest='height', type=int, required=True,
                  help='Height of resulting video')
args.add_argument('--video-bitrate',  dest='video_bitrate', type=str, required=True,
                  help='Target video bitrate')
args.add_argument('--audio-bitrate', dest='audio_bitrate', type=str, required=True,
                  help='Target audio bitrate')
args.add_argument('--stream-name', dest='stream_name', type=str, required=True,
                  help='Name of stream')
args.add_argument('--rotate', dest='rotate', help='Degrees of rotation')
args.add_argument('--intrustd-id', dest='intrustd_id', help='Id of photo (to queue next task)')
#args.add_argument('--video-stream', dest='video_stream', type=int,
#help='Video stream index')
#args.add_argument('--audio-stream', dest='audio_stream', type=int,
#                  help='Audio stream index')

if __name__ == "__main__":
    opts = args.parse_args()

    cwd = get_photo_dir(opts.output)
    os.makedirs(cwd, exist_ok=True)

    input_file = os.path.abspath(get_photo_dir(opts.input))

    cmd = [ "nice", "-n" "15", "ffmpeg",
            "-i", input_file, "-y",
            "-vf", "scale=w={width}:h={height}:force_original_aspect_ratio=decrease".format(width=opts.width, height=opts.height),
            "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-c:a", "aac", # AAC Audio
            "-ar", "48000", # 48k/s
            "-c:v", "h264", # h264 video
            "-profile:v", "main", # Main profile
            "-crf", "20", # Quality
            "-sc_threshold", "0",
            "-g", "48",
            "-keyint_min", "48",
            "-hls_time", "5", # Break every 5 s
            "-hls_playlist_type", "event",
            "-pix_fmt", "yuv420p",

            "-b:v", opts.video_bitrate,
            "-maxrate", opts.max_bitrate,
            "-bufsize", opts.bufsize,
            "-b:a", opts.audio_bitrate,
            "-f", "hls",
            "-progress", "/dev/stdout",
            "-hls_segment_filename", "{}_%04d.ts".format(opts.stream_name),
            "{}.m3u8".format(opts.stream_name) ]

    try:
        info = ffprobe(input_file)
        total_us = math.ceil(decimal.Decimal(info['format']['duration']) * 1000000)

        with open("/dev/null", "w") as dev_null:
            p = subprocess.Popen(cmd, executable="nice",
                                 stdout=subprocess.PIPE, stderr=dev_null,
                                 cwd=cwd, close_fds=True)

        for line in p.stdout:
            try:
                key, val = line.strip().split(b'=', 1)
            except:
                continue

            if key == b'out_time_ms': # microsecond
                cur_us = int(val)
                print(json.dumps({ "cur_us": cur_us,
                                   "total_us": total_us }))

        p.wait()

        if opts.intrustd_id is not None:
            with session_scope() as session:
                this_format = session.query(VideoFormat).filter(VideoFormat.photo_id=opts.intrustd_id,
                                                                VideoFormat.width==opts.width,
                                                                VideoFormat.height==opts.height). \
                                                                one_or_none()
                if this_format is not None:
                    this_format.command = None # Complete

                unqueued_formats = session.query(VideoFormat).filter(VideoFormat.photo_id=opts.intrustd_id, VideoFormat.command.isnot(None))
                if unqueued_formats.filter(VideoFormat.queued.isnot(None)).count() == 0:
                    next_format = unqueued_formats.order_by(VideoFormat.width.asc()).one_or_none()
                    if next_format is not None:
                        schedule_command(next_format.command)

        exit(p.returncode)

    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e),
                          "traceback": traceback.format_exc()}))
        exit(2)

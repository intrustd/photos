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
args.add_argument('--gen-preview', dest='gen_preview', type=str,
                  default=None, help='Generate preview as well')
args.add_argument('--rotate', dest='rotate', help='Degrees of rotation')
args.add_argument('--intrustd-id', dest='intrustd_id', help='Id of photo (to queue next task)')
#args.add_argument('--video-stream', dest='video_stream', type=int,
#help='Video stream index')
#args.add_argument('--audio-stream', dest='audio_stream', type=int,
#                  help='Audio stream index')

PREVIEW_FRAME_ROWS=6
PREVIEW_FRAME_COLS=6
PREVIEW_HEIGHT=480

FFMPEGPATH = "ffmpeg" if 'INTRUSTDDEBUG' in os.environ else "/bin/ffmpeg"

def do_gen_preview(input_file, frames, preview_out, cwd):
    nb_frames = math.floor(float(frames) / (PREVIEW_FRAME_ROWS * PREVIEW_FRAME_COLS))
    if nb_frames == 0:
        nb_frames = 1
    cmd = [ "nice", "-n", "15", FFMPEGPATH,
            "-i", input_file, "-y",
            "-q:v", "1", "-vf",
            "select=not(mod(n\,{nth_frame})),scale=-1:{PREVIEW_HEIGHT},tile={PREVIEW_FRAME_ROWS}x{PREVIEW_FRAME_COLS}" \
              .format(nth_frame=nb_frames,
                      PREVIEW_HEIGHT=PREVIEW_HEIGHT,
                      PREVIEW_FRAME_ROWS=PREVIEW_FRAME_ROWS,
                      PREVIEW_FRAME_COLS=PREVIEW_FRAME_COLS),
            preview_out ]

    with open('/dev/null', 'w') as dev_null:
        kwargs = { 'stdout': dev_null,
                   'stderr': dev_null,
                   'cwd': cwd,
                   'close_fds': True }
        if 'INTRUSTDDEBUG' not in os.environ:
            kwargs['executable'] = '/bin/nice'

        p = subprocess.Popen(cmd, **kwargs)
        p.wait()

def main():
    opts = args.parse_args()

    cwd = get_photo_dir(opts.output)
    os.makedirs(cwd, exist_ok=True)

    input_file = os.path.abspath(get_photo_dir(opts.input))

    cmd = [ "nice", "-n", "15", FFMPEGPATH,
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
        frame_count = None

        with open("/dev/null", "w") as dev_null:
            kwargs = { 'stdout': subprocess.PIPE,
                       'stderr': dev_null,
                       'cwd': cwd,
                       'close_fds': True }
            if 'INTRUSTDDEBUG' not in os.environ:
                kwargs['executable'] = '/bin/nice'

            p = subprocess.Popen(cmd, **kwargs)

        for line in p.stdout:
            try:
                key, val = line.strip().split(b'=', 1)
            except:
                continue

            if key == b'out_time_ms': # microsecond
                cur_us = int(val)
                print(json.dumps({ "cur_us": cur_us,
                                   "total_us": total_us }))

            if key == b'frame':
                frame_count = int(val)

        p.wait()

        if opts.gen_preview is not None:
            do_gen_preview(input_file, frame_count, opts.gen_preview, cwd)

        if opts.intrustd_id is not None:
            with session_scope() as session:
                this_format = session.query(VideoFormat).filter(VideoFormat.photo_id==opts.intrustd_id,
                                                                VideoFormat.width==opts.width,
                                                                VideoFormat.height==opts.height). \
                                                                one_or_none()
                if this_format is not None:
                    this_format.command = None # Complete

                unqueued_formats = session.query(VideoFormat).filter(VideoFormat.photo_id==opts.intrustd_id, VideoFormat.command.isnot(None))
                if unqueued_formats.filter(VideoFormat.queued.isnot(None)).count() == 0:
                    next_format = unqueued_formats.order_by(VideoFormat.width.asc()).first()
                    if next_format is not None:
                        schedule_command(next_format.command)

        exit(p.returncode)

    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e),
                          "traceback": traceback.format_exc()}))
        exit(2)

if __name__ == "__main__":
    main()

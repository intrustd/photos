from .app import app
from .perms import perms, ViewPerm
from .schema import session_scope, Photo, PhotoTag, VideoFormat
from .util import get_photo_dir, get_photo_path, parse_json_datetime, \
    datetime_sql, datetime_json, NotModified, sha256_sum_file, \
    M3U8_MIMETYPE, JPEG_PREVIEW_MIMETYPE, MPEGTS_MIMETYPE, ZIP_MIMETYPE

from .ffmpeg import ffprobe
from flask import jsonify, send_from_directory, send_file, request, abort, Response

from intrustd.permissions import Placeholder, mkperm

import os

class VideoEncoding(object):
    def __init__(self, name, width, height, bitrate=None,
                 vbitrate=None, abitrate=None, bufsize=None):
        self.name = name
        self.width = width
        self.height = height
        self.bitrate = bitrate
        self.vbitrate = vbitrate
        self.abitrate = abitrate
        self.bufsize = bufsize

    def to_dict(self):
        return { 'width': self.width,
                 'height': self.height,
                 'bitrate': self.bitrate,
                 'name': self.name }

    def can_encode(self, width, height):
        if width < height:
            return self.can_encode(height, width)
        else:
            return self.width <= width and self.height <= height

    def command(self, nm, width, height, preview=False):
        cmd = [ '/bin/transcode-video', '{}.tmp'.format(nm),
                '{}.hls'.format(nm),
                '--max-bitrate', self.bitrate,
                '--buf-size', self.bufsize,
                '--width', str(self.width),
                '--height', str(self.height),
                '--video-bitrate', self.vbitrate,
                '--audio-bitrate', self.abitrate,
                '--stream-name', self.name,
                '--intrustd-id', nm ]

        if preview:
            cmd.append("--gen-preview")
            cmd.append("preview.jpg".format(nm))

        if width < height:
            cmd.append['--rotate', '90']

        return ' '.join(cmd)


DEFAULT_VIDEO_STREAMS = [ VideoEncoding('360p', 640, 360, bitrate='856k',
                                        vbitrate='800k', abitrate='96k',
                                        bufsize='1200k'),
                          VideoEncoding('480p', 842, 480, bitrate='1498k',
                                        vbitrate='1400k', abitrate='128k',
                                        bufsize='2100k'),
                          VideoEncoding('720p', 1280, 720, bitrate='2996k',
                                        vbitrate='2800k', abitrate='128k',
                                        bufsize='4200k'),
                          VideoEncoding('1080p', 1920, 1080, bitrate='5350k',
                                        vbitrate='5000k', abitrate='192k',
                                        bufsize='7500k') ]

@app.route('/image/<image_hash>/stream/<name>/<fragment>.ts')
@perms.require(mkperm(ViewPerm, photo_id=Placeholder('image_hash')))
def fragment(image_hash, name, fragment):
    with session_scope() as session:
        existing = session.query(Photo).get(image_hash)
        if existing is None or not existing.video:
            abort(404)

        hls_dir = get_photo_path("{}.hls".format(image_hash), absolute=True)
        frag = os.path.join(hls_dir, "{}_{}.ts".format(name, fragment))

        rsp = send_file(frag)
        rsp.headers['Cache-control'] = 'private, max-age=43200'
        rsp.headers['Content-type'] = MPEGTS_MIMETYPE
        return rsp

@app.route('/image/<image_hash>/stream/<name>')
@perms.require(mkperm(ViewPerm, photo_id=Placeholder('image_hash')))
def stream(image_hash, name):
    with session_scope() as session:
        existing = session.query(Photo).get(image_hash)
        if existing is None or not existing.video:
            abort(404)

        hls_dir = get_photo_path("{}.hls".format(image_hash), absolute=True)
        playlist = os.path.join(hls_dir, "{}.m3u8".format(name))

        def make_playlist():
            with open(playlist, 'rt') as pl:
                frag_ix = 0
                for line in pl:
                    if line.startswith('#'):
                        yield line
                    if line.startswith('#EXTINF'):
                        yield 'intrustd+app://photos.intrustd.com/image/{}/stream/{}/{:04d}.ts\n'.format(image_hash, name, frag_ix)
                        frag_ix += 1

        rsp = Response(make_playlist(), mimetype=M3U8_MIMETYPE)
        rsp.headers['Cache-control'] = 'private, max-age=43200'
        rsp.headers['ETag'] = "{}-{}".format(image_hash, name)
        return rsp

@app.route('/image/<image_hash>/preview')
@perms.require(mkperm(ViewPerm, photo_id=Placeholder('image_hash')))
def video_preview(image_hash=None):
    if image_hash is None:
        abort(404)

    with session_scope() as session:
        existing = session.query(Photo).get(image_hash)
        if existing is None:
            abort(404)

        if not existing.video:
            abort(404)

        hls_dir = get_photo_path("{}.hls".format(image_hash))
        preview = os.path.join(hls_dir, "preview.jpg")

        if os.path.exists(preview):
            rsp = send_file(preview)
            rsp.headers['Cache-control'] = 'private, max-age=43200'
            rsp.headers['Content-type'] = JPEG_PREVIEW_MIMETYPE
            return rsp

        else:
            abort(404)

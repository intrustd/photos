import time

from flask import jsonify, send_from_directory, send_file, request, abort, Response

import sys

from .ffmpeg import ffprobe
from .util import get_photo_dir, get_photo_path, parse_json_datetime, \
    datetime_sql, datetime_json, NotModified, sha256_sum_file, \
    M3U8_MIMETYPE, JPEG_PREVIEW_MIMETYPE, MPEGTS_MIMETYPE, ZIP_MIMETYPE
from .schema import session_scope, Photo, PhotoTag, VideoFormat
from .perms import perms, CommentAllPerm, ViewAllPerm, GalleryPerm, UploadPerm, ViewPerm, CommentPerm
from .app import app, cache_control, no_cache, no_store

from . import video, photos, albums, upload, tags

from intrustd.permissions import Placeholder, mkperm
from intrustd.tasks import schedule_command, get_scheduled_command_status

def main(debug = False, port=80):
    print("Starting server")

    if debug:
        bundle = sys.argv[1]

        perms.debug = True

        @app.route('/app/<path:path>')
        def index(path=''):
            return send_from_directory(bundle, path)

    app.run(host='0.0.0.0', port=port)

if __name__ == "__main__":
    main()

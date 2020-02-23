import os
from datetime import datetime

import werkzeug
import flask
import hashlib

M3U8_MIMETYPE = 'application/x-mpegURL'
JPEG_PREVIEW_MIMETYPE = 'image/jpeg'
MPEGTS_MIMETYPE = 'video/MP2T'
ZIP_MIMETYPE = 'application/zip'

MAX_RANKS = (1 << 64) - 1

class NotModified(werkzeug.exceptions.HTTPException):
    code = 304
    def get_response(self, environment):
        return flask.Response(status=304)

def get_photo_dir(inner=None, absolute=False):
    if inner is None:
        ret = os.getenv('INTRUSTDPHOTOS')
    else:
        ret = os.path.join(get_photo_dir(), inner)

    if absolute:
        ret = os.path.abspath(ret)

    return ret

def get_photo_path(inner=None, absolute=False, size=None):
    if size is None:
        return get_photo_dir(inner=inner, absolute=absolute)
    elif isinstance(size, int):
        root, ext = os.path.splitext(inner)
        return get_photo_dir(inner="{}@{}.jpg".format(root, size),
                             absolute=absolute)
    else:
        raise TypeError("Expected None or int/long for size")

def datetime_json(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")

def parse_json_datetime(dt):
    try:
        return datetime.strptime(dt, "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None

def datetime_sql(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def sha256_sum_file(fp):
    h = hashlib.sha256()
    fp.seek(0, os.SEEK_SET)
    while True:
        chunk = fp.read(1024)
        if len(chunk) == 0:
            fp.seek(0, os.SEEK_SET)
            break
        h.update(chunk)
    return h.hexdigest()

def get_raw_photo_path(photo):
    if photo.video:
        return get_photo_path("{}.tmp".format(photo.id))
    else:
        return get_photo_path(photo.id)

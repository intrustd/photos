from .app import app, no_store, NotModified
from .perms import perms, CommentPerm, ViewPerm
from .schema import session_scope, Photo, PhotoTag, VideoFormat
from .util import get_raw_photo_path, get_photo_path, ZIP_MIMETYPE, M3U8_MIMETYPE

from flask import jsonify, send_from_directory, send_file, request, abort, Response

from PIL import Image

from intrustd.permissions import Placeholder, mkperm

import re
import zipstream
import math
import magic
import os

tag_re = re.compile('#\\[[#a-zA-Z0-9_\\-\'"]+\\]\\(([A-Za-z0-9_\\-\'"]+)\\)')

CONTENT_TYPE_TO_EXTENSION = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/pjpeg': 'jpg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
    'video/mpeg': 'mp4',
    'video/mp4': 'mp4',
    'video/x-matroska': 'mkv',
    'video/ogg': 'ogv',
    'video/3gpp': '3gp',
    'video/3gpp2': '3g2'
}

def auto_resize(max_dim, orig_path, output_path):
    with Image.open(orig_path) as im:
        im.thumbnail((max_dim, max_dim))
        im.save(output_path, "JPEG")

def round_size(size):
    new_size = int(2 ** math.ceil(math.log(size, 2)))
    return max(new_size, 100)

def _ensure_photo_attrs(p):
    if p.width is None or p.height is None:
        _update_photo_dims(p)

    if p.mime_type is None:
        _update_photo_type(p)

def _update_photo_dims(photo):
    path = get_photo_path(photo.id)
    if os.path.exists(path):
        with Image.open(path) as im:
            width, height = im.size
            photo.width = width
            photo.height = height

def _update_photo_type(photo):
    path = get_raw_photo_path(photo)
    if os.path.exists(path):
        mime_type = magic.from_file(path, mime=True)
        photo.mime_type = mime_type

@app.route('/image/<image_hash>/description', methods=['GET', 'PUT'])
@perms.require({ 'GET': mkperm(ViewPerm, photo_id=Placeholder('image_hash')),
                 'PUT': mkperm(CommentPerm, photo_id=Placeholder('image_hash')) })
@no_store
def image_description(image_hash=None, cur_perms=None):
    if image_hash is None:
        return abort(404)

    with session_scope() as session:
        photo = session.query(Photo).get(image_hash)

        if photo is None:
            return abort(404)

        if request.method == 'GET':
            return photo.description
        elif request.method == 'PUT':
            photo.description = request.data.decode("utf-8")

            tags = []
            for tag_match in tag_re.finditer(photo.description):
                tag = tag_match.group(1)
                tag_obj = session.query(PhotoTag).get((photo.id, tag))
                if tag_obj is None:
                    tag_obj = PhotoTag(photo_id = photo.id,
                                       tag = tag)
                    session.add(tag_obj)
                tags.append(tag_obj)

            photo.tags = tags

            return jsonify({})

def read_file_iter(fp):
    chunk_size = 16384
    with open(fp, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if len(chunk) == 0:
                return
            else:
                yield chunk

@app.route('/archive', methods=['POST'])
def archive():
    which = request.json

    if not isinstance(which, list) or \
       any(not isinstance(x, str) for x in which):
        abort(400)

    with session_scope() as session:
        z = zipstream.ZipFile()

        def do_request(cur_perms=None):
            return Response(z, mimetype=ZIP_MIMETYPE)

        for x in which:
            photo = session.query(Photo).get(x)
            if photo is None:
                abort(404)

            _ensure_photo_attrs(photo)
            filename = photo.id
            if photo.mime_type in CONTENT_TYPE_TO_EXTENSION:
                filename += "." + CONTENT_TYPE_TO_EXTENSION[photo.mime_type]
            z.write_iter(filename, read_file_iter(get_raw_photo_path(photo)))

            do_request = perms.require(ViewPerm(photo_id=x))(do_request)

        return do_request()

@app.route('/image/<image_hash>')
@perms.require(mkperm(ViewPerm, photo_id=Placeholder('image_hash')))
def image(image_hash=None, cur_perms=None):
    if request.method == 'GET':
        if image_hash is None:
            return abort(404)

        size = request.args.get('size')
        if size is not None:
            try:
                size = int(size)
            except ValueError:
                abort(400)

            size = round_size(size)

        fmt = request.args.get('format', 'normal')

        with session_scope() as session:
            existing = session.query(Photo).get(image_hash)
            if existing is None:
                return 'Not found', 404

            if existing.video:
                if request.if_none_match.contains(image_hash):
                    raise NotModified()

                if fmt == 'raw':
                    path = get_photo_path("{}.tmp".format(image_hash), absolute=True)
                    r = send_file(path)
                    r.headers['Cache-control'] = 'private, max-age=43200'
                    r.headers['ETag'] = image_hash
                    r.headers['Content-type'] = existing.mime_type
                    if existing.mime_type in CONTENT_TYPE_TO_EXTENSION:
                        r.headers['X-Extension'] = CONTENT_TYPE_TO_EXTENSION[existing.mime_type]
                    return r
                else:
                    hls_dir = get_photo_path("{}.hls".format(image_hash), absolute=True)
                    vfs = [ vf for vf in existing.video_formats if vf.is_complete ]
                    if len(vfs) == 0:
                        return 'No format available', 404

                    hls = '''#EXTM3U
#EXT-X-VERSION:3
'''
                    for vf in vfs:
                        hls += '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION={}x{}\n'.format(vf.width, vf.height)
                        hls += 'intrustd+app://photos.intrustd.com/image/{}/stream/{}p\n'.format(image_hash, vf.height)

                    r = Response(hls)
                    r.headers['Content-type'] = M3U8_MIMETYPE
                    r.headers['ETag'] = image_hash
                    r.headers['Cache-control'] = 'private, max-age=43200'
                    return r
            else:

                orig_path = get_photo_path(image_hash, absolute=True)
                photo_path = get_photo_path(image_hash, size=size, absolute=True)

                if os.path.exists(orig_path):

                    if not os.path.exists(photo_path):
                        auto_resize(size, orig_path, photo_path)

                    etag = image_hash if size is None else "{}@{}".format(image_hash, size)
                    if request.if_none_match.contains(etag):
                        raise NotModified()

                    rsp = send_file(photo_path)
                    rsp.headers['Cache-control'] = 'private, max-age=43200'
                    rsp.headers['ETag'] = etag
                    rsp.headers['Content-type'] = existing.mime_type
                    if existing.mime_type in CONTENT_TYPE_TO_EXTENSION:
                        rsp.headers['X-Extension'] = CONTENT_TYPE_TO_EXTENSION[existing.mime_type]
                    return rsp

                else:
                    return abort(404)

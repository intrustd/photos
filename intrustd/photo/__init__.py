import time
import hashlib

from flask import Flask, jsonify, send_from_directory, send_file, request, abort, Response

from PIL import Image

import sys
import os
import re
import math

from sqlalchemy import or_, and_, func
from sqlalchemy.orm import aliased, joinedload

from .ffmpeg import ffprobe
from .util import get_photo_dir, get_photo_path, parse_json_datetime, \
    datetime_sql, datetime_json, NotModified
from .schema import session_scope, Photo, PhotoTag, VideoFormat
from .perms import perms, CommentAllPerm, ViewAllPerm, GalleryPerm, UploadPerm, ViewPerm, CommentPerm

from intrustd.permissions import Placeholder, mkperm
from intrustd.tasks import schedule_command, get_scheduled_command_status

M3U8_MIMETYPE = 'application/x-mpegURL'
MPEGTS_MIMETYPE = 'video/MP2T'

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

def cache_control(s):
    def cache_control(fn):
        def wrapped(*args, **kwargs):
            r = app.make_response(fn(*args, **kwargs))
            if 'Cache-control' not in r.headers and \
               request.method == 'GET':
                r.headers['Cache-control'] = s
            return r
        wrapped.__name__ = fn.__name__
        return wrapped
    return cache_control

no_cache = cache_control('no-cache')
no_store = cache_control('no-store')

temp_photo_dir = get_photo_dir('.tmp')

tag_re = re.compile('#\\[[#a-zA-Z0-9_\\-\'"]+\\]\\(([A-Za-z0-9_\\-\'"]+)\\)')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = temp_photo_dir
app.config['MAX_CONTENT_LENGTH'] = 4294967296
# app.config['ALLOWED_EXTENSIONS'] = set(['jpg', 'jpeg', 'png', 'tiff', 'gif'])

@app.route('/albums')
def albums():
    return jsonify([ { "name": "Album 1", "id": "album0"},
                     { "name": "Album 2", "id": "album1"},
                     { "name": "Album 2", "id": "album2"},
                     { "name": "Album 2", "id": "album3"},
                     { "name": "Album 2", "id": "album4"},
                     { "name": "Album 2", "id": "album5"},
                     { "name": "Album 2", "id": "album6"},
                     { "name": "Album 2", "id": "album7"},
                     { "name": "Album 2", "id": "album8"},
                     { "name": "Album 2", "id": "album9"},
                     { "name": "Album 2", "id": "album10"} ])

def auto_resize(max_dim, orig_path, output_path):
    with Image.open(orig_path) as im:
        im.thumbnail((max_dim, max_dim))
        im.save(output_path, "JPEG")

def round_size(size):
    new_size = int(2 ** math.ceil(math.log(size, 2)))
    return max(new_size, 100)

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
            return rsp

        else:
            abort(404)

@app.route('/image/<image_hash>')
@perms.require(mkperm(ViewPerm, photo_id=Placeholder('image_hash')))
def image(image_hash=None):
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

        with session_scope() as session:
            existing = session.query(Photo).get(image_hash)
            if existing is None:
                return 'Not found', 404

            if existing.video:
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

                    rsp = send_file(photo_path)
                    rsp.headers['Cache-control'] = 'private, max-age=43200'
                    rsp.headers['ETag'] = image_hash if size is None else "{}@{}".format(image_hash, size)
                    return rsp

                else:
                    return abort(404)

def _update_photo_dims(photo):
    path = get_photo_path(photo.id)
    if os.path.exists(path):
        with Image.open(path) as im:
            width, height = im.size
            photo.width = width
            photo.height = height

def _handle_video(uploaded):
    video_id = sha256_sum_file(uploaded.stream)

    with session_scope() as session:
        existing = session.query(Photo).get(video_id)
        if existing is not None:
            return jsonify(existing.to_json())

        video_path = '{}.tmp'.format(get_photo_dir(video_id))
        uploaded.save(video_path)

        try:
            try:
                info = ffprobe(video_path)
            except Exception as e:
                print("Got ffmpeg error", e)
                return jsonify({'error': 'ffmpeg {}'.format(str(e))}), 400

            # Make sure this has both a video and audio stream
            vstreams = [ stream for stream in info['streams'] if stream['codec_type'] == 'video' ]
            astreams = [ stream for stream in info['streams'] if stream['codec_type'] == 'audio' ]

            print("Got info", info)
            if len(vstreams) == 0 or len(astreams) == 0:
                return jsonify({'error': 'no streams'}), 400

            # Only use first video stream
            video = vstreams[0]
            width = int(video['width'])
            height = int(video['height'])

            video = Photo(id=video_id,
                          description="",
                          width=width, height=height,
                          video=True)
            session.add(video)

            vstreams = [vstream for vstream in DEFAULT_VIDEO_STREAMS
                        if vstream.can_encode(width, height) ]

            if len(vstreams) == 0:
                vstreams = [ DEFAULT_VIDEO_STREAMS[0] ]

            fmts = []
            for i, vstream in enumerate(vstreams):
                fmt = VideoFormat(photo_id=video_id,
                                  width=vstream.width,
                                  height=vstream.height,
                                  command=vstream.command(video_id, width, height,
                                                          preview=i==0),
                                  queued=None)
                fmts.append(fmt)

            fmts.sort(key=lambda v:v.width)
            print("Got vstreams", vstreams, fmts)
            fmt = fmts[0]

            task = schedule_command(fmt.command)
            fmt.queued = task['id']

            session.add_all(fmts)
            session.commit()

            return jsonify(video.to_json())

        except:
            os.unlink(video_path)
            raise

def _handle_photo(uploaded):
    try:
        im = Image.open(uploaded.stream, 'r')
    except IOError:
        return jsonify({'error': 'invalid photo'}), 400

    photo_id = sha256_sum_file(uploaded.stream)

    uploaded.save(get_photo_dir(photo_id))
    im.close()

    with session_scope() as session:
        photo = session.query(Photo).get(photo_id)
        if photo is None:
            photo = Photo(id=photo_id,
                          description="")
            _update_photo_dims(photo)
            session.add_all([photo])
            session.commit()

        return jsonify(photo.to_json())

UPLOAD_HANDLERS = {
    'image/jpeg': _handle_photo,
    'image/jpg': _handle_photo,
    'image/png': _handle_photo,
    'image/bmp': _handle_photo,
    'image/tiff': _handle_photo,
    'image/webp': _handle_photo,

    'video/mpeg': _handle_video,
    'video/x-matroska': _handle_video,
    'video/mp4': _handle_video,
    'video/ogg': _handle_video,
    'video/webm': _handle_video,
    'video/3gpp': _handle_video,
    'video/3gpp2': _handle_video
}

@app.route('/image', methods=['GET', 'POST'])
@perms.require({ 'GET': GalleryPerm,
                 'POST': UploadPerm },
               pass_permissions=True)
def upload(cur_perms=None):

    if request.method == 'GET':
        with session_scope() as session:
            tags = request.args.getlist('tag[]')
            query = request.args.get('q')
            after = request.args.get('after_id')
            after_date = request.args.get('after_date')
            limit = request.args.get('limit')

            if after is not None:
                if len(after) != 64 or any(c not in '0123456789abcdefABCDEF' for c in after):
                    return jsonify({'error': 'invalid ?after param'}), 400

            if after_date is not None:
                after_date = parse_json_datetime(after_date)

            if (after is not None and after_date is None) or \
               (after is None and after_date is not None):
                return jsonify({'error': 'both ?after and ?after_date must be set'}), 400

            if limit is not None:
                try:
                    limit = int(limit)
                except ValueError:
                    return jsonify({'error': '{} is not a number'.format(limit)}), 400

                if limit < 0:
                    return jsonify({'error': 'negative limit'}), 400

                limit = min(20, limit)
            else:
                limit = 20

            photos = session.query(Photo)

            if len(tags) > 0:
                for tag in tags:
                    photo_tags = aliased(PhotoTag)
                    photos = photos.join(photo_tags, and_(photo_tags.tag == tag, photo_tags.photo_id == Photo.id))

            if query is not None:
                filters = ["%{}%".format(kw) for kw in query.split(" ")]
                photos = photos.filter(or_(Photo.description.like(f) for f in filters))

            total_photos = session.query(func.count(photos.subquery().c.id))[0][0]

            if after is not None:
                photos = photos.filter(or_(Photo.created_on < datetime_sql(after_date),
                                           and_(Photo.created_on == datetime_sql(after_date), Photo.id > after)))

            photos = photos.options(joinedload(Photo.tags)).\
                options(joinedload(Photo.video_formats))

            photos = photos.order_by(Photo.created_on.desc(), Photo.id.asc())

            if limit is not None:
                photos = photos[:limit]

            ims = []
            for p in photos:
                if p.width is None or p.height is None:
                    _update_photo_dims(p)

                if ViewPerm(photo_id=p.id) in cur_perms or perms.debug:
                    ims.append(p.to_json())

            rsp = jsonify({ 'images': ims,
                            'total': total_photos })
            rsp.headers['Cache-Control'] = 'no-cache'

            return rsp

    elif request.method == 'POST':
        print("Got POST request")
        if 'photo' not in request.files:
            return jsonify({'error': 'expected an upload named photo'}), 400

        uploaded = request.files['photo']
        print("Content type", uploaded.content_type)
        if uploaded.content_type not in UPLOAD_HANDLERS:
            return jsonify({'error': '{} is not an accepted content type'}), 415

        return UPLOAD_HANDLERS[uploaded.content_type](uploaded)


@app.route('/image/<image_hash>/description', methods=['GET', 'PUT'])
@perms.require({ 'GET': mkperm(ViewPerm, photo_id=Placeholder('image_hash')),
                 'PUT': mkperm(CommentPerm, photo_id=Placeholder('image_hash')) })
@no_store
def image_description(image_hash=None):
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

@app.route('/tag', methods=['GET'])
@perms.require(GalleryPerm)
@no_store
def tags(**kwargs):
    with session_scope() as session:
        query = request.args.get('query')
        try:
            limit = int(request.args.get('limit', 10))
        except ValueError:
            abort(400)

        tags = session.query(PhotoTag.tag)

        if query is not None:
            tags = tags.filter(PhotoTag.tag.like('%{}%'.format(query)))

        return jsonify([t.tag for t in tags.limit(limit).distinct()])

@app.route('/tag/recent', methods=['GET'])
@perms.require(GalleryPerm)
@no_cache
def recent_tags(**kwargs):
    with session_scope() as session:
        try:
            limit = int(request.args.get('limit', 50))
        except ValueError:
            abort(400)

        limit = min(100, limit)

        if request.if_none_match:
            last_modified = session.query(Photo.modified_on). \
                order_by(Photo.modified_on.desc()).first()
            if last_modified.modified_on is not None:
                last_modified = last_modified.modified_on
                expected_etag = "{}-{}".format(datetime_json(last_modified), limit)
                if request.if_none_match == expected_etag:
                    raise NotModified

        recent = session.query(PhotoTag.tag, func.max(Photo.modified_on)) \
                        .join(PhotoTag.photo).group_by(PhotoTag.tag)\
                        .order_by(func.max(Photo.modified_on).desc())\
                        .limit(limit)

        return jsonify([t.tag for t in recent])

@app.route('/tag', methods=['GET'])

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

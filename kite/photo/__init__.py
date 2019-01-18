import time
import hashlib

from flask import Flask, jsonify, send_from_directory, send_file, request, abort

from PIL import Image

import sys
import os
import re
import math

from .util import get_photo_dir, get_photo_path
from .schema import session_scope, Photo, PhotoTag
from .perms import perms, CommentAllPerm, ViewAllPerm, GalleryPerm, UploadPerm, ViewPerm, CommentPerm

from kite.permissions import Placeholder, mkperm

def sha256_sum_file(fp):
    h = hashlib.sha256()
    while True:
        chunk = fp.read(1024)
        if len(chunk) == 0:
            fp.seek(0, os.SEEK_SET)
            break
        h.update(chunk)
    return h.hexdigest()

def no_cache(fn):
    def no_cache_wrapped(*args, **kwargs):
        r = app.make_response(fn(*args, **kwargs))
        if 'Cache-control' not in r.headers and \
           request.method == 'GET':
            r.headers['Cache-control'] = 'no-cache'
        return r

    no_cache_wrapped.__name__ = fn.__name__
    return no_cache_wrapped

temp_photo_dir = get_photo_dir('.tmp')

tag_re = re.compile('#([a-zA-Z0-9_\\-\'"]+)')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = temp_photo_dir
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

@app.route('/image', methods=['GET', 'POST'])
@perms.require({ 'GET': GalleryPerm,
                 'POST': UploadPerm },
               pass_permissions=True)
def upload(cur_perms=None):

    if request.method == 'GET':
        with session_scope() as session:
            photos = session.query(Photo).order_by(Photo.created_on.desc())

            for photo in photos:
                if photo.width is None or photo.height is None:
                    _update_photo_dims(photo)

            rsp = jsonify([p.to_json() for p in photos if ViewPerm(photo_id=p.id) in cur_perms])
            rsp.headers['Cache-Control'] = 'no-cache'
            return rsp

    elif request.method == 'POST':
        if 'photo' not in request.files:
            return abort(400)

        uploaded = request.files['photo']
        photo_id = sha256_sum_file(uploaded.stream)

        print("Saving fle as ", photo_id)
        uploaded.save(get_photo_dir(photo_id))

        with session_scope() as session:
            photo = session.query(Photo).get(photo_id)
            if photo is None:
                photo = Photo(id=photo_id,
                              description="")
                _update_photo_dims(photo)
                session.add_all([photo])
                session.commit()

            return jsonify(photo.to_json())

@app.route('/image/<image_hash>/description', methods=['GET', 'PUT'])
@perms.require({ 'GET': mkperm(ViewPerm, photo_id=Placeholder('image_hash')),
                 'PUT': mkperm(CommentPerm, photo_id=Placeholder('image_hash')) })
@no_cache
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
@no_cache
def tags():
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

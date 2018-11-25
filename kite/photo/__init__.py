import time
import hashlib

from flask import Flask, jsonify, send_from_directory, send_file, request, abort

import sys
import os

from .util import get_photo_dir
from .schema import session_scope, Photo

def sha256_sum_file(fp):
    h = hashlib.sha256()
    while True:
        chunk = fp.read(1024)
        if len(chunk) == 0:
            fp.seek(0, os.SEEK_SET)
            break
        h.update(chunk)
    return h.hexdigest()

temp_photo_dir = get_photo_dir('.tmp')

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

@app.route('/image/<image_hash>')
def image(image_hash=None):
    if request.method == 'GET':
        if image_hash is None:
            return abort(404)

        photo_path = get_photo_dir(image_hash)
        if os.path.exists(photo_path):
            rsp = send_file(get_photo_dir(image_hash))
            rsp.headers['Cache-control'] = 'private, max-age=43200'
            rsp.headers['ETag'] = image_hash
            return rsp
        else:
            return abort(404)

@app.route('/image', methods=['GET', 'POST'])
def upload():
    if request.method == 'GET':
        with session_scope() as session:
            photos = session.query(Photo).order_by(Photo.created_on.desc())
            rsp = jsonify([p.to_json() for p in photos])
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
                session.add_all([photo])
                session.commit()

            return jsonify(photo.to_json())

@app.route('/image/<image_hash>/description', methods=['GET', 'PUT'])
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
            return jsonify({})

def main(debug = False):
    print("Starting server")

    if debug:
        bundle = sys.argv[1]

        @app.route('/app/<path:path>')
        def index(path=''):
            return send_from_directory(bundle, path)

    app.run(host='0.0.0.0', port=50051)

if __name__ == "__main__":
    main()

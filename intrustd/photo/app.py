from flask import Flask, request, jsonify
from .util import get_photo_dir
from .perms import perms, GalleryPerm, CommentAllPerm, \
    ViewAlbumsPerm, CreateAlbumsPerm, UploadPerm

from intrustd.permissions import MissingPermissionsError

temp_photo_dir = get_photo_dir('.tmp')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = temp_photo_dir
app.config['MAX_CONTENT_LENGTH'] = 4294967296
# app.config['ALLOWED_EXTENSIONS'] = set(['jpg', 'jpeg', 'png', 'tiff', 'gif'])

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

class NotModified(Exception):
    def __init__(self):
        pass

@app.errorhandler(NotModified)
def not_modified(error):
    response = app.make_response('')
    response.status = 'Not Modified'
    response.status_code = 304
    return response

@app.errorhandler(MissingPermissionsError)
def missing_perms(error):
    response = jsonify({ 'missing': [ perm.url for perm in error.missing ] })
    response.status = 'Forbidden'
    response.status_code = 403
    return response

@app.route('/user/info')
@no_store
def user_info():
    cur_perms = perms.get_current_permissions()
    what = { 'gallery': False,
             'comment': False,
             'albums': False,
             'createAlbums': False,
             'upload': False }
    if GalleryPerm in cur_perms:
        what['gallery'] = True
    if CommentAllPerm in cur_perms:
        what['comment'] = True
    if ViewAlbumsPerm in cur_perms:
        what['albums'] = True
    if CreateAlbumsPerm in cur_perms:
        what['createAlbums'] = True
    if UploadPerm in cur_perms:
        what['upload'] = True
    return jsonify(what)

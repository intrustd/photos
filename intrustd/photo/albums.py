from .app import app, no_cache, NotModified
from .perms import perms, CreateAlbumsPerm, ViewAlbumsPerm, ViewAlbumPerm
from .schema import session_scope, Photo, Album, AlbumItem
from .util import MAX_RANKS
from .photos import _ensure_photo_attrs

from intrustd.permissions import mkperm, Placeholder

from flask import jsonify, request, abort

import uuid

class MalformedAlbum(Exception):
    def __init__(self, msg, where=None):
        self.message = msg
        self.where = where

@app.errorhandler(MalformedAlbum)
def malformed_album_error(error):
    response = jsonify({ 'message': error.message,
                         'where': error.where })
    response.status_code = 400
    return response

def _validate_text(item, where=None):
    if 'text' not in item:
        raise MalformedAlbum('Text content must contain \'text\' key',
                             where=where)

    if not isinstance(item['text'], str):
        raise MalormedAlbum('Text content must be a string',
                            where=where)

def _validate_content(content, session):
    r = []
    for i, item in enumerate(content):
        if 'photo' in item:
            if not isinstance(item['photo'], str):
                raise MalformedAlbum('Photo property of item must be a string',
                                     where='.content[{}].photo'.format(i))

            photo = session.query(Photo).get(item['photo'])
            if photo is None:
                raise MalformedAlbum('Photo provided does not exist: {}'.format(item['photo']),
                                     where='.content[{}].photo'.format(i))

            r.append(AlbumItem(id=str(uuid.uuid4()), type='photo', photo=photo))

        elif 'text' in item:
            _validate_text(item, where='.content[{}].text'.format(i))

            r.append(AlbumItem(id=str(uuid.uuid4()), type='text',
                               description=item['text']))

        else:
            raise MalformedAlbum('Item must have either photo or text property',
                                 where='.content[{}]'.format(i))

    return r

@app.route('/albums/', methods=['GET', 'POST'])
@perms.require({ 'GET': ViewAlbumsPerm,
                 'POST': CreateAlbumsPerm })
@no_cache
def albums(cur_perms=None):
    if request.method == 'GET':
        with session_scope() as session:
            albums = []
            db_albums = session.query(Album).filter(Album.deleted_on==None)

            for album in db_albums:
                albums.append(album.to_json(include_summary=True))

            return jsonify(albums)

    else:
        data = request.json

        if 'name' not in data:
            raise MalformedAlbum('Missing name', where='.name')

        if not isinstance(data['name'], str):
            raise MalformedAlbum('Name is not string', where='.name')

        content = data.get('content', [])

        if not isinstance(content, list):
            raise MalformedAlbum('Content must be a list', where='.content')

        with session_scope() as session:
            items = _validate_content(content, session)

            album = Album(album_id=str(uuid.uuid4()), name=data['name'])
            session.add(album)

            for item in items:
                item.album = album
                session.add(item)

            session.flush()

            return jsonify(album.to_json())

@app.route('/albums/<album_id>', methods=['GET', 'PUT', 'DELETE'])
@perms.require({ 'GET': mkperm(ViewAlbumPerm,album_id=Placeholder('album_id')),
                 'PUT': CreateAlbumsPerm,
                 'DELETE': CreateAlbumsPerm })
def album(album_id=None, cur_perms=None):
    with session_scope() as session:
        album = session.query(Album).get(album_id)
        if album is None:
            abort(404)

        if request.method == 'GET':
            if request.if_none_match.contains(album.etag):
                raise NotModified()
            else:
                rsp = jsonify(album.to_json(include_items=True))
                rsp.headers['ETag'] = album.etag
                return rsp

        elif request.method == 'PUT':
            data = request.json

            if 'name' in data:
                if not isinstance(data['name'], str):
                    raise MalformedAlbum('Name must be a string', where='.name')

                album.name = name

            for item in album.items:
                if item.photo is not None:
                    _ensure_photo_attrs(item.photo)

            return jsonify(album.to_json())

        else:
            session.delete(album)
            return jsonify({})

def _get_item_move_id(req_data, album):
    if 'id' not in req_data:
        raise MalformedAlbum('missing id in album item move request', where='.')

    if not isinstance(req_data['id'], str):
        raise MalformedAlbum('id in move request must be string', where='.id')

    which_id = req_data['id']
    which_other = album.items_query.filter(AlbumItem.id == which_id).first()
    if which_other is None:
        _missing_other(which_id)

    return which_id, which_other

def _missing_other(which):
    raise MalformedAlbum('The album item {} does not exist'.format(which), where='.')

@app.route('/albums/<album_id>/<item_id>', methods=['GET', 'PUT', 'DELETE'])
@perms.require({ 'GET': mkperm(ViewAlbumPerm, album_id=Placeholder('album_id')),
                 'PUT': CreateAlbumsPerm,
                 'DELETE': CreateAlbumsPerm })
def album_item(album_id=None, item_id=None, cur_perms=None):
    with session_scope() as session:
        item = session.query(AlbumItem).filter(AlbumItem.id==item_id,
                                               Album.album_id==album_id).first()
        if item is None:
            abort(404)

        if request.method == 'GET':
            return jsonify(item.to_json())

        elif request.method == 'PUT':
            if item.type != 'text':
                raise MalformedAlbum('Cannot update non-text item')

            _validate_text(request.json, where='.')

            item.description = request.json['text']

            return jsonify(item.to_json())

        elif request.method == 'DELETE':
            session.delete(item)
            album.items.reorder()
            return jsonify({})

@app.route('/albums/<album_id>/end', methods=['GET', 'PUT', 'DELETE', 'POST'])
@perms.require({ 'GET': mkperm(ViewAlbumPerm, album_id=Placeholder('album_id')),
                 'POST': CreateAlbumsPerm,
                 'PUT': CreateAlbumsPerm,
                 'DELETE': CreateAlbumsPerm })
def album_end(album_id=None, cur_perms=None):
    with session_scope() as session:
        album = session.query(Album).get(album_id)
        if album is None:
            abort(404)

        last_item = album.items_query[-1]

        if request.method == 'GET':
            return jsonify(last_item.to_json())

        elif request.method == 'PUT':
            which_id, which_other = _get_item_move_id(request.json, album)

            return jsonify({})

        elif request.method == 'POST':
            items = _validate_content([request.json], session)
            item = items[0]

            album.items.append(item)

            session.flush()

            return jsonify(item.to_json())

        elif request.method == 'DELETE':
            session.delete(last_item)
            return jsonify({})

@app.route('/albums/<album_id>/<item_id>/before', methods=['GET', 'PUT', 'DELETE'])
@perms.require({ 'GET': mkperm(ViewAlbumPerm, album_id=Placeholder('album_id')),
                 'POST': CreateAlbumsPerm,
                 'PUT': CreateAlbumsPerm,
                 'DELETE': CreateAlbumsPerm })
def album_before_item(album_id=None, item_id=None, cur_perms=None):
    with session_scope() as session:
        album = session.query(Album).get(album_id)
        if album is None:
            abort(404)

        item = album.items_query.filter(AlbumItem.id == item_id).first()
        if item is None:
            abort(404)

        if request.method == 'GET':
            if item.rank == 0:
                abort(404)

            return jsonify(album.items_query[item.rank - 1].to_json())

        elif request.method == 'PUT':
            which_id, which_other = _get_item_move_id(request.json, album)

            with session.no_autoflush:
                item_rank = item.rank
                other_rank = which_other.rank

                album.items.pop(other_rank)
                if item_rank > other_rank:
                    item_rank -= 1

                album.items.insert(item_rank, which_other)

            return jsonify({})

        elif request.method == 'POST':
            items = _validate_content([request.json], session)
            item = items[0]

            album.insert(item_rank, item)

            session.flush()

            return jsonify(item.to_json())

        else:
            session.delete(item)
            return jsonify({})

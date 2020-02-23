from .app import app, no_store, no_cache
from .perms import perms, GalleryPerm
from .schema import session_scope, Photo, PhotoTag, VideoFormat
from .util import datetime_json

from flask import jsonify, send_from_directory, send_file, request, abort, Response

from sqlalchemy import func

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

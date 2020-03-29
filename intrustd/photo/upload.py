from .app import app
from .perms import perms, GalleryPerm, UploadPerm, ViewPerm
from .schema import session_scope, Photo, PhotoTag, VideoFormat, \
    calc_counts_until, calc_counts_from, filter_photos_after, filter_photos_before, \
    order_photos_default
from .photos import _ensure_photo_attrs, _update_photo_dims, _update_photo_type
from .video import DEFAULT_VIDEO_STREAMS, VideoFormat
from .util import parse_json_datetime, datetime_sql, sha256_sum_file, \
    get_photo_dir
from .ffmpeg import ffprobe

from sqlalchemy import or_, and_, func
from sqlalchemy.orm import aliased, joinedload

from flask import jsonify, send_from_directory, send_file, request, abort, Response

from intrustd.tasks import schedule_command, get_scheduled_command_status

from PIL import Image

import magic

MAX_LIMIT=100

def _handle_video(uploaded):
    video_id = sha256_sum_file(uploaded.stream)

    with session_scope() as session:
        existing = session.query(Photo).get(video_id)
        if existing is not None:
            return jsonify(existing.to_json())

        video_path = '{}.tmp'.format(get_photo_dir(video_id))
        uploaded.save(video_path)

        video_type = magic.from_file(video_path, mime=True)

        try:
            try:
                info = ffprobe(video_path)
            except Exception as e:
                print("Got ffmpeg error", e)
                return jsonify({'error': 'ffmpeg {}'.format(str(e))}), 400

            # Make sure this has both a video and audio stream
            vstreams = [ stream for stream in info['streams'] if stream['codec_type'] == 'video' ]
            astreams = [ stream for stream in info['streams'] if stream['codec_type'] == 'audio' ]

            if len(vstreams) == 0 or len(astreams) == 0:
                return jsonify({'error': 'no streams'}), 400

            # Only use first video stream
            video = vstreams[0]
            width = int(video['width'])
            height = int(video['height'])

            video = Photo(id=video_id,
                          description="",
                          width=width, height=height,
                          mime_type=video_type,
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
            _update_photo_type(photo)
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
    'video/3gpp2': _handle_video,
    'video/quicktime': _handle_video
}

@app.route('/image', methods=['GET', 'POST'])
@perms.require({ 'GET': GalleryPerm,
                 'POST': UploadPerm },
               pass_permissions=True)
def upload(cur_perms=None):

    if request.method == 'GET':
        with session_scope() as session:
            tags = request.args.getlist('tag[]')
            albums = request.args.getlist('album[]')
            count_until = request.args.getlist('countUntil[]')
            count_from = request.args.getlist('countFrom[]')

            queries = request.args.get('q[]')

            after = request.args.get('after_id')
            after_date = request.args.get('after_date')

            before = request.args.get('before_id')
            before_date = request.args.get('before_date')

            limit = request.args.get('limit')

            if after is not None:
                if len(after) != 64 or any(c not in '0123456789abcdefABCDEF' for c in after):
                    return jsonify({'error': 'invalid ?after param'}), 400

            if after_date is not None:
                after_date = parse_json_datetime(after_date)

            if before_date is not None:
                before_date = parse_json_datetime(before_date)

            if (after is not None and after_date is None) or \
               (after is None and after_date is not None):
                return jsonify({'error': 'both ?after and ?after_date must be set'}), 400

            if (before is not None and before_date is None) or\
               (before is None and before_date is not None):
                return jsonify({'error': 'both ?before and ?before_date must be set'}), 400

            if limit is not None:
                try:
                    limit = int(limit)
                except ValueError:
                    return jsonify({'error': '{} is not a number'.format(limit)}), 400

                if limit < 0:
                    return jsonify({'error': 'negative limit'}), 400

                limit = min(MAX_LIMIT, limit)
            else:
                limit = MAX_LIMIT

            photos = session.query(Photo)

            for tag in tags:
                photo_tags = aliased(PhotoTag)
                photos = photos.join(photo_tags, and_(photo_tags.tag == tag, photo_tags.photo_id == Photo.id))

            for album in albums:
                album_items = aliased(AlbumItem)
                photos = photos.join(album_items, and_(album_items.album_id==album, album_items.photo_id==Photo.id))

            if queries is not None:
                for query in queries:
                    filters = ["%{}%".format(kw) for kw in query.split(" ")]
                    photos = photos.filter(or_(Photo.description.like(f) for f in filters))

            total_photos = session.query(func.count(photos.subquery().c.id))[0][0]

            if after is None and before is not None:
                photos = order_photos_default(photos, reverse=True)
                result_transform = reversed
            else:
                photos = order_photos_default(photos)
                result_transform = lambda x: x

            if after is not None:
                photos = filter_photos_after(photos, after, after_date)

            if before is not None:
                photos = filter_photos_before(photos, before, before_date)

            photos = photos.options(joinedload(Photo.tags)).\
                options(joinedload(Photo.video_formats))

            if limit is not None:
                photos = photos[:limit]

            photos = list(result_transform(photos))

            ims = []
            for p in photos:
                _ensure_photo_attrs(p)

                if ViewPerm(photo_id=p.id) in cur_perms or perms.debug:
                    ims.append(p.to_json())

            data = { 'images': ims,
                     'total': total_photos}
            if len(count_until) > 0:
                data['countsUntil'] = calc_counts_until(photos, count_until, session)
            if len(count_from) > 0:
                data['countsFrom'] = calc_counts_from(photos, count_from, session)
            rsp = jsonify(data)
            rsp.headers['Cache-Control'] = 'no-cache'

            return rsp

    elif request.method == 'POST':
        if 'photo' not in request.files:
            return jsonify({'error': 'expected an upload named photo'}), 400

        uploaded = request.files['photo']
        if uploaded.content_type not in UPLOAD_HANDLERS:
            return jsonify({'error': '{} is not an accepted content type'}), 415

        return UPLOAD_HANDLERS[uploaded.content_type](uploaded)


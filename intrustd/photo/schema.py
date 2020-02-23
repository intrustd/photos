from sqlalchemy.ext.orderinglist import ordering_list
from sqlalchemy import Column, Integer, String, DateTime, Boolean, \
    ForeignKey, func, create_engine
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from contextlib import contextmanager

from intrustd.tasks import get_scheduled_command_status

from .util import get_photo_dir, datetime_json

LATEST_VERSION = 6
Base = declarative_base()

class Photo(Base):
    __tablename__ = 'photo'

    id = Column(String(64), primary_key=True)
    description = Column(String)
    created_on = Column(DateTime, default=func.now())
    modified_on = Column(DateTime, onupdate=func.now(), default=func.now())

    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)

    video = Column(Boolean, default=False)

    mime_type = Column(String)

    tags = relationship('PhotoTag', cascade='delete,delete-orphan')
    video_formats = relationship('VideoFormat', cascade='delete,delete-orphan')

    def to_json(self):
        r = {'id': self.id,
             'description': self.description or '',
             'created': datetime_json(self.created_on),
             'modified': datetime_json(self.modified_on),
             'width': self.width,
             'height': self.height,
             'type': 'video' if self.video else 'photo'}

        if self.video:
            if any(not vf.is_complete for vf in self.video_formats):
                # Calculate total
                total = sum(vf.width for vf in self.video_formats)
                complete = 0
                for vf in self.video_formats:
                    if vf.is_complete:
                        complete += vf.width
                    elif vf.queued is not None:
                        try:
                            sts = get_scheduled_command_status(vf.queued)
                        except KeyError:
                            continue

                        if 'progress' in sts and isinstance(sts['progress'], dict) and \
                           'data' in sts['progress'] and isinstance(sts['progress']['data'], dict):
                            pr = sts['progress']['data']
                            complete += vf.width * float(pr.get('cur_us', 0))/float(pr.get('total_us', 1))

                r['progress'] = { 'total': total, 'complete': complete }

            vf = [ vf for vf in self.video_formats if vf.is_complete ]
            r['formats'] = [ vf.to_photo_json() for vf in self.video_formats if vf.is_complete ]

        return r

class PhotoTag(Base):
    __tablename__ = 'photo_tag'

    photo_id = Column(String(64), ForeignKey('photo.id'), primary_key=True)
    tag = Column(String, primary_key=True)

    photo = relationship(Photo, primaryjoin=photo_id == Photo.id)

class VideoFormat(Base):
    __tablename__ = 'video_format'

    photo_id = Column(String(64), ForeignKey('photo.id'), primary_key=True)
    width = Column(Integer, primary_key=True)
    height = Column(Integer, primary_key=True)

    command = Column(String, nullable=True)
    queued = Column(String, nullable=True)

    def to_photo_json(self):
        return { 'width':  self.width,
                 'height': self.height }

    @property
    def is_complete(self):
        return self.command is None

class Album(Base):
    __tablename__ = 'album'

    album_id = Column(String, primary_key=True)
    name = Column(String)
    created_on = Column(DateTime, default=func.now())
    modified_on = Column(DateTime, onupdate=func.now(), default=func.now())
    deleted_on = Column(DateTime, nullable=True)

    items_query = relationship('AlbumItem',
                               viewonly=True,
                               order_by='AlbumItem.rank',
                               lazy='dynamic')
    items = relationship('AlbumItem',
                         back_populates='album',
                         cascade='save-update, merge, delete, delete-orphan',
                         order_by='AlbumItem.rank',
                         collection_class=ordering_list('rank'),
                         lazy='select')

    @property
    def etag(self):
        return '{}-{}'.format(LATEST_VERSION, datetime_json(self.modified_on))

    def to_json(self, include_items=False, include_summary=False):
        data = { 'id': self.album_id,
                 'name': self.name,
                 'created': datetime_json(self.created_on),
                 'modified': datetime_json(self.modified_on) }

        if include_items:
            data['content'] = [item.to_json() for item in self.items]

        if include_summary:
            summary = { 'imageCount': self.items_query.filter(AlbumItem.type == 'photo').count() }
            data['summary'] = summary

        return data

class AlbumItem(Base):
    __tablename__ = 'album_item'

    id = Column(String, primary_key=True)
    album_id = Column(String, ForeignKey('album.album_id'))
    type = Column(String)
    description = Column(String, nullable=True)
    photo_id = Column(String(64), ForeignKey('photo.id'), nullable=True)
    rank = Column(Integer)

    added = Column(DateTime, default=func.now())
    updated = Column(DateTime, default=func.now(), onupdate=func.now())

    album = relationship(Album, primaryjoin=album_id == Album.album_id, back_populates='items')
    photo = relationship(Photo, primaryjoin=photo_id == Photo.id)

    def to_json(self):
        data = { 'id': self.id,
                 'added': datetime_json(self.added),
                 'updated': datetime_json(self.updated) }
        if self.type == 'photo':
            data['photo'] = self.photo.to_json()

        elif self.type == 'text':
            data['text'] = self.description

        else:
            raise ValueError("type must be either photo or text")

        return data

class Version(Base):
    __tablename__ = 'version'

    version = Column(Integer, primary_key=True)

engine = create_engine("sqlite:///" + get_photo_dir(".photos.db", absolute=True)) #, echo=True)

Session = sessionmaker(bind=engine)

def do_migrate():
    latest_version = LATEST_VERSION

    session = Session()
    connection = engine.connect()

    try:
        if not engine.dialect.has_table(engine, 'version'):
            connection.execute('CREATE TABLE version(version integer primary key)')

        res = list(session.query(Version).order_by(Version.version.desc()).limit(1))
        version = 0
        if len(res) > 0:
            version = res[0].version

        if version <= 0:
            connection.execute('''
              CREATE TABLE photo(id CHAR(64) PRIMARY KEY,
                                 description VARCHAR NOT NULL,
                                 created_on TIMESTAMP NOT NULL,
                                 modified_on TIMESTAMP NOT NULL)
            ''')
            connection.execute('''
              CREATE TABLE photo_tag(photo_id CHAR(64) NOT NULL,
                                     tag VARCHAR NOT NULL,
                                     PRIMARY KEY (photo_id, tag))
            ''')

        if version <= 1:
            connection.execute('''
               ALTER TABLE photo ADD COLUMN width INTEGER
            ''')
            connection.execute('''
               ALTER TABLE photo ADD COLUMN height INTEGER
            ''')

        if version <= 2:
            connection.execute('''
               CREATE TABLE video_format(photo_id CHAR(64) NOT NULL,
                                         width INTEGER NOT NULL,
                                         height INTEGER NOT NULL,
                                         command VARCHAR,
                                         queued VARCHAR)
            ''')
            connection.execute('''
               ALTER TABLE photo ADD COLUMN video BOOLEAN DEFAULT false
            ''')

        if version <= 3:
            connection.execute('''
               CREATE INDEX photo_modified ON photo (modified_on)
            ''')

        if version <= 4:
            connection.execute('''
               ALTER TABLE photo ADD COLUMN mime_type TEXT
            ''')

        if version <= 5:
            connection.execute('''
               CREATE TABLE album ( album_id VARCHAR NOT NULL PRIMARY KEY,
                                    name VARCHAR NOT NULL,
                                    created_on TIMESTAMP NOT NULL,
                                    modified_on TIMESTAMP NOT NULL,
                                    deleted_on TIMESTAMP )
            ''')
            connection.execute('''
               CREATE TABLE album_item ( id VARCHAR NOT NULL PRIMARY KEY,
                                         album_id VARCHAR NOT NULL,
                                         type VARCHAR NOT NULL,
                                         description VARCHAR,
                                         photo_id CHAR(64),
                                         rank INTEGER NOT NULL,
                                         added TIMESTAMP NOT NULL,
                                         updated TIMESTAMP NOT NULL )
            ''')

        if version < latest_version:
            session.add(Version(version=latest_version))
        session.commit()

    finally:
        session.close()
        connection.close()

do_migrate()

@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""

    session = Session()
    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()



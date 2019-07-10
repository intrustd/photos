from sqlalchemy import Column, Integer, String, DateTime, Boolean, \
    ForeignKey, func, create_engine
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from contextlib import contextmanager

from intrustd.tasks import get_scheduled_command_status

from .util import get_photo_dir, datetime_json

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
        r = { 'id': self.id,
              'description': self.description,
              'created': datetime_json(self.created_on),
              'modified': datetime_json(self.modified_on),
              'width': self.width,
              'height': self.height,
              'type': 'video' if self.video else 'photo' }

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

class Version(Base):
    __tablename__ = 'version'

    version = Column(Integer, primary_key=True)

engine = create_engine("sqlite:///" + get_photo_dir(".photos.db", absolute=True))

Session = sessionmaker(bind=engine)

def do_migrate():
    latest_version = 5

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


